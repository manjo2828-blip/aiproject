$start = Get-Date
while ($true) {
  $p = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'run_eval' -and $_.Name -match 'python' }
  $f = Test-Path 'C:\Users\Haakim\Documents\aiprj\bench\eval\out\eval_results.json'
  if (-not $p -and $f) { "idle after $([int]((Get-Date)-$start).TotalMinutes) min"; exit 0 }
  if (((Get-Date)-$start).TotalMinutes -ge 40) { "TIMEOUT: run_eval still active=$([bool]$p) results_exist=$f"; exit 1 }
  Start-Sleep 60
}
