"""YOLOv6 adapter (Meituan, Renesas ONNX export with decoded head)."""
from ._misc_common import file_mb
from ._yolo67_common import YOLOv6

_FILE = "yolov6s.onnx"
NAME = "YOLOv6-S"
FAMILY = "YOLOv6"
LICENSE = "GPL-3.0"
# Params / AP from https://github.com/meituan/YOLOv6 README (v3.0 S: 18.5M, 45.0 AP; v2.0 was 43.1; ONNX release unspecified); ONNX from HF Renesas/YOLOv6-S-ONNX
PARAMS_M = 18.5
COCO_AP = 45.0
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load():
    return YOLOv6(_FILE)
