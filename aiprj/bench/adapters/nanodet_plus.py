"""NanoDet-Plus adapter (RangiLyu, ONNX from HF nouman/nanodet-plus-onnx)."""
from ._misc_common import file_mb
from ._yolo67_common import NanoDetPlus

_FILE = "nanodet-plus-m_416.onnx"
NAME = "NanoDet-Plus-m"
FAMILY = "NanoDet"
LICENSE = "Apache-2.0"
# Params / COCO val AP from https://github.com/RangiLyu/nanodet README (Plus-m 416: 1.17M, 30.4 mAP); ONNX from HF nouman/nanodet-plus-onnx
PARAMS_M = 1.17
COCO_AP = 30.4
INPUT = "416x416"
FILE_MB = file_mb(_FILE)


def load():
    return NanoDetPlus(_FILE)
