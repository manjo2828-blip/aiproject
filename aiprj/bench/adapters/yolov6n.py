"""YOLOv6 adapter (Meituan, Renesas ONNX export with decoded head)."""
from ._misc_common import file_mb
from ._yolo67_common import YOLOv6

_FILE = "yolov6n.onnx"
NAME = "YOLOv6-N"
FAMILY = "YOLOv6"
LICENSE = "GPL-3.0"
# Params / AP from https://github.com/meituan/YOLOv6 README (v3.0 N: 4.7M, 37.5 AP; v2.0 was 35.0; ONNX release unspecified); ONNX from HF Renesas/YOLOv6-N-ONNX
PARAMS_M = 4.7
COCO_AP = 37.5
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load():
    return YOLOv6(_FILE)
