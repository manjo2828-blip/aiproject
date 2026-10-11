# Creates a SEPARATE training venv (never touches the project .venv).
# Usage:  powershell -ExecutionPolicy Bypass -File bench\finetune\train\setup_env.ps1 [-Venv <dir>] [-Cuda]
param([string]$Venv = "$env:LOCALAPPDATA\Temp\ft_venv", [switch]$Cuda)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = "py"; $pyArgs = @("-3.12")
if (-not (Test-Path "$Venv\Scripts\python.exe")) { & $py @pyArgs -m venv $Venv }
$vp = "$Venv\Scripts\python.exe"
& $vp -m pip install --upgrade pip
$idx = if ($Cuda) { "https://download.pytorch.org/whl/cu121" } else { "https://download.pytorch.org/whl/cpu" }
& $vp -m pip install torch==2.5.1 torchvision==0.20.1 --index-url $idx
& $vp -m pip install -r "$here\requirements-train.txt"
& $vp -c "import torch,torchvision,onnx,onnxruntime;print('torch',torch.__version__,'cuda',torch.cuda.is_available())"
Write-Host "venv ready: $vp"
