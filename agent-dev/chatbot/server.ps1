# Gemini 하이브리드 검색 RAG 챗봇 서버 (프레임워크 없음, PowerShell 내장 HttpListener만 사용)
# 검색: 작은 청크(child 150자)로 BM25+ / Gemini 임베딩 하이브리드 검색 → 해당 장(부모) 전문을 컨텍스트로 반환 (상위 3개)
param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$Root    = $PSScriptRoot
$Public  = Join-Path $Root 'public'
$EnvFile = Join-Path (Split-Path $Root -Parent) '.env'
$Corpus  = Join-Path (Split-Path $Root -Parent) '토끼와_거북이.txt'
$IndexFile = Join-Path $Root 'index.json'

$GenModel   = 'gemini-3.1-flash-lite'
$EmbedModel = 'gemini-embedding-001'
$EmbedDim   = 768
$TopK       = 3
$Api        = 'https://generativelanguage.googleapis.com/v1beta/models'

# 정량평가(rag/eval) 최적 설정: BM25+ (k1=3, b=1, 문자 2-gram) + dense, z-score 결합 dense 0.6
$DenseW = 0.6; $K1 = 3.0; $B = 1.0
$ChildSize = 150; $ChildOverlap = 25; $StructMax = 400

# ---------- 환경변수 (.env 에서 GEMINI_API_KEY 만 로드) ----------
$ApiKey = $env:GEMINI_API_KEY
if (-not $ApiKey -and (Test-Path $EnvFile)) {
    foreach ($line in [IO.File]::ReadAllLines($EnvFile, [Text.Encoding]::UTF8)) {
        if ($line -match '^\s*GEMINI_API_KEY\s*=\s*(.*)$') { $ApiKey = $Matches[1].Trim().Trim('"').Trim("'") }
    }
}
if (-not $ApiKey) { throw 'GEMINI_API_KEY 가 설정되어 있지 않습니다 (.env).' }

$AgentPort = 3100      # agent.py (LangChain create_agent) service port

# 일시적 오류(429/500/503 등)는 짧게 재시도
function Invoke-Gemini($path, $bodyObj, [int]$Retries = 3) {
    $json  = $bodyObj | ConvertTo-Json -Depth 20 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    for ($attempt = 1; ; $attempt++) {
        try {
            return Invoke-RestMethod -Uri "$Api/$path" -Method Post -Headers @{ 'x-goog-api-key' = $ApiKey } `
                -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 120
        } catch {
            $code = 0; $m = "$_"
            try { $code = [int]$_.Exception.Response.StatusCode; $m = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
            if (($code -in 500, 502, 503, 504) -and $attempt -lt $Retries) { Start-Sleep -Seconds (2 * $attempt); continue }
            throw "Gemini $path 실패($code): $m"
        }
    }
}

# ---------- 청킹: Structured Parent-Child ----------
function Get-Chapters($text) {
    $text = $text -replace "`r`n", "`n"
    $heads = [regex]::Matches($text, '(?m)^(제\d+장\..*|맺음말.*)$')
    $out = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $heads.Count; $i++) {
        $start = $heads[$i].Index + $heads[$i].Length
        $end   = if ($i + 1 -lt $heads.Count) { $heads[$i + 1].Index } else { $text.Length }
        $title = $heads[$i].Value.Trim()
        $lines = $text.Substring($start, $end - $start) -split "`n" | Where-Object {
            $s = $_.Trim()
            -not ($s -and (($s -match '^[─]+$') -or $s.StartsWith('– 끝') -or $s.StartsWith('토끼와 거북이 –')))
        }
        $body = ([regex]::Replace(($lines -join "`n"), "`n{3,}", "`n`n")).Trim()
        $out.Add(@{ title = $title; body = $body; full = "[$title]`n$body" })
    }
    ,$out.ToArray()
}

function Get-Children($text) {
    $children = New-Object System.Collections.Generic.List[object]
    foreach ($ch in (Get-Chapters $text)) {
        $blocks = New-Object System.Collections.Generic.List[string]
        $cur = ''
        foreach ($p in ($ch.body -split "`n`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
            if ($cur -and ($cur.Length + $p.Length) -gt $StructMax) { $blocks.Add($cur); $cur = $p }
            else { $cur = "$cur`n$p".Trim() }
        }
        if ($cur) { $blocks.Add($cur) }
        $step = $ChildSize - $ChildOverlap
        foreach ($blk in $blocks) {
            for ($i = 0; $i -lt $blk.Length; $i += $step) {
                $piece = $blk.Substring($i, [Math]::Min($ChildSize, $blk.Length - $i))
                if ($piece.Trim()) { $children.Add(@{ title = $ch.title; text = $piece; parent = $ch.full }) }
            }
        }
    }
    ,$children.ToArray()
}

# ---------- 토큰화: 어절별 문자 2-gram ----------
function Get-Tokens($s) {
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($m in [regex]::Matches($s, '[가-힣A-Za-z0-9]+')) {
        $w = $m.Value
        if ($w.Length -le 2) { $out.Add($w) }
        else { for ($i = 0; $i -lt $w.Length - 1; $i++) { $out.Add($w.Substring($i, 2)) } }
    }
    ,$out.ToArray()
}

# ---------- 인덱스 구축 / 로드 ----------
function Build-Index {
    $text = [IO.File]::ReadAllText($Corpus, [Text.Encoding]::UTF8)
    $hash = (Get-FileHash $Corpus -Algorithm SHA256).Hash + "|pc$ChildSize-$ChildOverlap-$StructMax"
    if (Test-Path $IndexFile) {
        $cached = [IO.File]::ReadAllText($IndexFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($cached.hash -eq $hash -and $cached.model -eq $EmbedModel) {
            Write-Host "임베딩 캐시 사용 (child $($cached.chunks.Count)개)"
            return $cached
        }
    }
    $chunks = Get-Children $text
    Write-Host "child 청크 $($chunks.Count)개 임베딩 중..."
    $vecs = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $chunks.Count; $i += 50) {
        $batch = $chunks[$i..([Math]::Min($i + 49, $chunks.Count - 1))]
        $reqs = @($batch | ForEach-Object {
            @{ model = "models/$EmbedModel"; content = @{ parts = @(@{ text = $_.text }) }
               taskType = 'RETRIEVAL_DOCUMENT'; outputDimensionality = $EmbedDim }
        })
        $res = Invoke-Gemini "${EmbedModel}:batchEmbedContents" @{ requests = $reqs }
        foreach ($e in $res.embeddings) { $vecs.Add(@($e.values)) }
    }
    $items = @(for ($i = 0; $i -lt $chunks.Count; $i++) {
        @{ title = $chunks[$i].title; text = $chunks[$i].text; parent = $chunks[$i].parent; vec = $vecs[$i] }
    })
    $obj = @{ hash = $hash; model = $EmbedModel; chunks = $items }
    [IO.File]::WriteAllText($IndexFile, ($obj | ConvertTo-Json -Depth 10 -Compress), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::ReadAllText($IndexFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
}

$Index  = Build-Index
$Docs   = @($Index.chunks)
$NDoc   = $Docs.Count
$DocTok = @($Docs | ForEach-Object { , (Get-Tokens $_.text) })
$DocLen = @($DocTok | ForEach-Object { $_.Count })
$AvgLen = ($DocLen | Measure-Object -Average).Average
$DF = @{}
$TF = @()
foreach ($t in $DocTok) {
    $tfm = @{}; foreach ($w in $t) { $tfm[$w] = 1 + [int]$tfm[$w] }
    $TF += , $tfm
    foreach ($w in $tfm.Keys) { $DF[$w] = 1 + [int]$DF[$w] }
}
$DocVec = @($Docs | ForEach-Object { , ([double[]]$_.vec) })

function Get-ZScore([double[]]$x) {
    $mean = ($x | Measure-Object -Average).Average
    $var = 0.0; foreach ($v in $x) { $var += ($v - $mean) * ($v - $mean) }
    $sd = [Math]::Sqrt($var / $x.Length) + 1e-9
    $z = New-Object 'double[]' $x.Length
    for ($i = 0; $i -lt $x.Length; $i++) { $z[$i] = ($x[$i] - $mean) / $sd }
    ,$z
}

# ---------- 하이브리드 검색: BM25+ + 벡터 → z-score 결합 → 부모(장) 단위 중복 제거 → 상위 3 ----------
function Search-Hybrid($query) {
    $qt = Get-Tokens $query                      # 질의 원문 그대로 토큰화
    $bm = New-Object 'double[]' $NDoc
    for ($d = 0; $d -lt $NDoc; $d++) {
        $norm = 1 - $B + $B * $DocLen[$d] / $AvgLen; $s = 0.0
        foreach ($w in $qt) {
            $f = [int]$TF[$d][$w]
            if ($f -eq 0) { continue }
            $idf = [Math]::Log(($NDoc + 1) / [Math]::Max(1, [int]$DF[$w]))
            $s += $idf * (1.0 + $f * ($K1 + 1) / ($f + $K1 * $norm))
        }
        $bm[$d] = $s
    }
    $q = Invoke-Gemini "${EmbedModel}:embedContent" @{                     # 질의 원문 그대로 임베딩
        model = "models/$EmbedModel"; content = @{ parts = @(@{ text = $query }) }
        taskType = 'RETRIEVAL_QUERY'; outputDimensionality = $EmbedDim }
    $qv = [double[]]$q.embedding.values
    $qn = [Math]::Sqrt(($qv | ForEach-Object { $_ * $_ } | Measure-Object -Sum).Sum)
    $vs = New-Object 'double[]' $NDoc
    for ($d = 0; $d -lt $NDoc; $d++) {
        $dv = $DocVec[$d]; $dot = 0.0; $dn = 0.0
        for ($k = 0; $k -lt $dv.Length; $k++) { $dot += $dv[$k] * $qv[$k]; $dn += $dv[$k] * $dv[$k] }
        $vs[$d] = $dot / ([Math]::Sqrt($dn) * $qn + 1e-12)
    }
    $zb = Get-ZScore $bm; $zv = Get-ZScore $vs
    $fused = New-Object 'double[]' $NDoc
    for ($d = 0; $d -lt $NDoc; $d++) { $fused[$d] = $DenseW * $zv[$d] + (1 - $DenseW) * $zb[$d] }
    $seen = @{}; $hits = @()
    foreach ($d in (0..($NDoc - 1) | Sort-Object { -$fused[$_] })) {
        $p = $Docs[$d].title
        if ($seen.ContainsKey($p)) { continue }
        $seen[$p] = 1
        $hits += @{ title = $p; text = $Docs[$d].parent; matched = $Docs[$d].text; score = [Math]::Round($fused[$d], 3)
                    bm25 = [Math]::Round($bm[$d], 3); vector = [Math]::Round($vs[$d], 4) }
        if ($hits.Count -ge $TopK) { break }
    }
    $hits
}


# ---------- HTTP 서버 ----------
$Mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'
           '.svg'='image/svg+xml'; '.png'='image/png'; '.ico'='image/x-icon'; '.json'='application/json; charset=utf-8'; '.woff2'='font/woff2' }

function Send($ctx, $code, $bytes, $type) {
    $r = $ctx.Response; $r.StatusCode = $code; $r.ContentType = $type; $r.ContentLength64 = $bytes.Length
    $r.OutputStream.Write($bytes, 0, $bytes.Length); $r.OutputStream.Close()
}
function SendJson($ctx, $code, $obj) {
    Send $ctx $code ([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 10 -Compress))) 'application/json; charset=utf-8'
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "서버 시작: http://localhost:$Port/  (Ctrl+C 로 종료)"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $path = $ctx.Request.Url.AbsolutePath
        if ($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/internal/search') {      # 에이전트의 search_storybook 도구가 호출하는 하이브리드 검색 (원문 질의 그대로)
            $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
            $q = [string](($reader.ReadToEnd() | ConvertFrom-Json).query)
            $hits = @(Search-Hybrid $q)
            Write-Host ("[{0}] search_storybook: {1}" -f (Get-Date -Format HH:mm:ss), $q)
            SendJson $ctx 200 @{ hits = $hits }
        }
        elseif ($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/api/chat') {
            $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
            $raw = $reader.ReadToEnd()
            $body = $raw | ConvertFrom-Json
            $msgs = @($body.messages)
            if ($msgs.Count -eq 0 -or $msgs[-1].role -ne 'user' -or -not "$($msgs[-1].content)".Trim()) {
                SendJson $ctx 400 @{ error = '질문이 비어 있습니다.' }; continue
            }
            # LangChain create_agent 에이전트 서비스(agent.py)로 위임
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$AgentPort/chat" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($raw)) `
                -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 280 -ErrorAction Stop
            Write-Host ("[{0}] agent: {1}" -f (Get-Date -Format HH:mm:ss), [string]$msgs[-1].content)
            Send $ctx 200 $resp.RawContentStream.ToArray() 'application/json; charset=utf-8'
        }
        elseif ($ctx.Request.HttpMethod -eq 'GET') {
            if ($path -eq '/') { $path = '/index.html' }
            $file = [IO.Path]::GetFullPath((Join-Path $Public ($path.TrimStart('/') -replace '/', '\')))
            if ($file.StartsWith($Public) -and (Test-Path $file -PathType Leaf)) {
                $type = $Mime[[IO.Path]::GetExtension($file).ToLower()]; if (-not $type) { $type = 'application/octet-stream' }
                Send $ctx 200 ([IO.File]::ReadAllBytes($file)) $type
            } else { Send $ctx 404 ([Text.Encoding]::UTF8.GetBytes('Not found')) 'text/plain' }
        }
        else { Send $ctx 405 ([Text.Encoding]::UTF8.GetBytes('Method not allowed')) 'text/plain' }
    }
    catch {
        Write-Host "오류: $($_.Exception.Message)"
        try { SendJson $ctx 500 @{ error = "서버 오류: $($_.Exception.Message)" } } catch {}
    }
}
