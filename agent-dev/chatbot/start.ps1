# Restart all services: web(3000) + search(3001) + LangChain agent(3100)
$d = $PSScriptRoot
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'server\.ps1|agent\.py' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 1
foreach ($p in 3000, 3001) {
    Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$d\server.ps1",'-Port',$p -RedirectStandardOutput "$d\server$p.out.log" -RedirectStandardError "$d\server$p.err.log" -WindowStyle Hidden
}
Start-Process "$d\.venv\Scripts\python.exe" -ArgumentList '-u',"$d\agent.py" -RedirectStandardOutput "$d\agent.out.log" -RedirectStandardError "$d\agent.err.log" -WindowStyle Hidden
