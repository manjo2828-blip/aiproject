"""NanoDet-Plus adapter (RangiLyu, ONNX from HF nouman/nanodet-plus-onnx)."""
from ._misc_common import file_mb
from ._yolo67_common import NanoDetPlus

_FILE = "nanodet-plus-m-1.5x_416.onnx"
NAME = "NanoDet-Plus-m-1.5x"
FAMILY = "NanoDet"
LICENSE = "Apache-2.0"
# Params / COCO val AP from https://github.com/RangiLyu/nanodet README (Plus-m-1.5x 416: 2.44M, 34.1 mAP); ONNX from HF nouman/nanodet-plus-onnx
PARAMS_M = 2.44
COCO_AP = 34.1
INPUT = "416x416"
FILE_MB = file_mb(_FILE)


def load():
    return NanoDetPlus(_FILE)
