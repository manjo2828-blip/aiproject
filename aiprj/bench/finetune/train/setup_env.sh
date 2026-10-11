#!/usr/bin/env bash
# Creates a separate training venv (Linux/Colab/cloud). Usage: bash setup_env.sh [venv_dir] [cpu|cuda]
# On Colab you can skip the venv: VENV=system bash setup_env.sh system cuda
set -euo pipefail
VENV="${1:-$HOME/ft_venv}"; FLAVOR="${2:-cuda}"
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$VENV" = "system" ]; then PY=python3; else
  [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"; PY="$VENV/bin/python"; fi
$PY -m pip install --upgrade pip
if [ "$FLAVOR" = "cuda" ]; then IDX=https://download.pytorch.org/whl/cu121; else IDX=https://download.pytorch.org/whl/cpu; fi
$PY -m pip install torch==2.5.1 torchvision==0.20.1 --index-url "$IDX"
$PY -m pip install -r "$HERE/requirements-train.txt"
$PY -c "import torch;print('torch',torch.__version__,'cuda',torch.cuda.is_available())"
echo "python: $PY"
