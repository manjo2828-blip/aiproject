"""YOLOv7 adapter (WongKinYiu original weights, decoded ONNX from HF Kalray/yolov7)."""
from ._misc_common import file_mb
from ._yolo67_common import YOLOv6

_FILE = "yolov7.onnx"
NAME = "YOLOv7"
FAMILY = "YOLOv7"
LICENSE = "GPL-3.0"
# Params / COCO val AP from https://github.com/WongKinYiu/yolov7 README (yolov7 640: 36.9M, 51.2 AP)
PARAMS_M = 36.9
COCO_AP = 51.2
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load():
    # Output is (1, 25200, 85) decoded: cx, cy, w, h (px), obj, cls -> same decode as YOLOv6 class.
    return YOLOv6(_FILE)
