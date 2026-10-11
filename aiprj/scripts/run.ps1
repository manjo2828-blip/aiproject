$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& "$root\.venv\Scripts\Activate.ps1"
python -m uvicorn app.main:app --port 8000 @args
