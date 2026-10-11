import chromadb
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from chunkers import METHODS
from common import DB_PATH, embed, get_model

app = FastAPI()
client = chromadb.PersistentClient(path=DB_PATH)
cols = {n: client.get_collection(f"rt_{n}") for n in METHODS}
stats = {}
for n, c in cols.items():
    metas = c.get()["metadatas"]
    units = {m["return_id"]: len(m["return_text"]) for m in metas}
    stats[n] = {"embedded": len(metas), "titles": sum(m["kind"] == "제목" for m in metas),
                "units": len(units), "avg_len": sum(units.values()) // len(units)}
get_model()


@app.get("/search")
def search(q: str, k: int = 5):
    qv = embed([q], "query: ")
    out = []
    for name, (label, desc, _) in METHODS.items():
        col = cols[name]
        res = col.query(query_embeddings=qv, n_results=min(col.count(), 60))
        seen, results = set(), []
        # 엔트리(본문/제목/자식 청크) 단위로 매칭 → 반환 단위(원본 청크/부모 챕터)로 중복 제거
        for doc, dist, m in zip(res["documents"][0], res["distances"][0], res["metadatas"][0]):
            if m["return_id"] in seen:
                continue
            seen.add(m["return_id"])
            results.append({"rank": len(results) + 1, "score": round(1 - dist, 4), "kind": m["kind"],
                            "parent": m["parent"], "matched": doc, "text": m["return_text"]})
            if len(results) == k:
                break
        out.append({"name": name, "label": label, "desc": desc, **stats[name], "results": results})
    return out


@app.get("/", response_class=HTMLResponse)
def index():
    return PAGE


PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>청킹 방식 비교</title>
<style>
body{font-family:system-ui,'Malgun Gothic',sans-serif;margin:0;padding:24px 16px;background:#f4f5f7;color:#222}
h1{font-size:1.4rem;margin:0 0 12px}
form{display:flex;gap:8px;max-width:760px}
input{flex:1;padding:12px;font-size:1rem;border:1px solid #bbb;border-radius:8px}
button{padding:12px 20px;font-size:1rem;border:0;border-radius:8px;background:#2f6fed;color:#fff;cursor:pointer}
.ex{margin:10px 0 18px;font-size:.85rem;color:#555}
.ex a{margin-right:10px;color:#2f6fed;cursor:pointer;text-decoration:underline}
#r{display:grid;grid-template-columns:repeat(6,minmax(280px,1fr));gap:12px;overflow-x:auto;align-items:start;padding-bottom:20px}
.head{background:#1f2a44;color:#fff;border-radius:10px;padding:10px 12px;position:sticky;top:0;z-index:1}
.head b{font-size:.95rem}.head div{font-size:.75rem;opacity:.85;margin-top:4px;line-height:1.4}
.stat{color:#9fd0ff}
.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:.83rem}
.card.top{border-color:#2f6fed;box-shadow:0 0 0 1px #2f6fed}
.meta{font-size:.72rem;color:#666;margin-bottom:5px}
.tag{display:inline-block;padding:1px 6px;border-radius:6px;font-size:.7rem;margin-right:4px;color:#fff}
.t-title{background:#d9822b}.t-body{background:#6b7a90}.t-parent{background:#2e9b6a}
.match{background:#fff6e0;border-left:3px solid #d9822b;padding:5px 8px;margin-bottom:6px;font-size:.78rem;line-height:1.45;white-space:pre-wrap}
.txt{white-space:pre-wrap;line-height:1.55;max-height:230px;overflow:auto}
</style></head><body>
<h1>🐇🐢 청킹 방식별 검색 비교</h1>
<form id="f"><input id="q" placeholder="예) 토끼는 왜 낮잠을 잤나요?" autofocus><button>검색</button></form>
<div class="ex">예시:
<a>토끼는 왜 낮잠을 잤나요?</a><a>다리가 무너지는 장면</a><a>느루가 하루를 깨운 이유</a><a>경주 결과는 어떻게 되었나</a></div>
<div id="r"></div>
<script>
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const card=d=>{
  const tags=(d.kind=='제목'?'<span class="tag t-title">제목 매칭</span>':'<span class="tag t-body">본문 매칭</span>')+(d.parent?'<span class="tag t-parent">부모 챕터 반환</span>':'');
  const match=(d.kind=='제목'||d.parent)?`<div class="match">${d.kind=='제목'?'🏷 ':'🔎 '}${esc(d.matched)}</div>`:'';
  return `<div class="card ${d.rank==1?'top':''}"><div class="meta">#${d.rank} · 유사도 ${d.score} · 반환 ${d.text.length}자<br>${tags}</div>${match}<div class="txt">${esc(d.text)}</div></div>`;
};
const run=async q=>{
  const r=document.getElementById('r'); r.textContent='검색 중...';
  const data=await (await fetch('/search?q='+encodeURIComponent(q))).json();
  r.innerHTML=data.map(m=>`<div><div class="head"><b>${m.label}</b><div>${m.desc}</div>
  <div class="stat">임베딩 ${m.embedded}개${m.titles?` (제목 ${m.titles})`:''} · 반환단위 ${m.units}개 · 평균 ${m.avg_len}자</div></div>`+
  m.results.map(card).join('')+`</div>`).join('');
};
document.getElementById('f').onsubmit=e=>{e.preventDefault();const q=document.getElementById('q').value.trim();if(q)run(q)};
document.querySelectorAll('.ex a').forEach(a=>a.onclick=()=>{document.getElementById('q').value=a.textContent;run(a.textContent)});
</script></body></html>"""
