"""YOLOv7-tiny adapter (WongKinYiu original weights, ONNX with decoded head from HF Kalray/yolov7)."""
from ._misc_common import file_mb
from ._yolo67_common import YOLOv6

_FILE = "yolov7_tiny.onnx"
NAME = "YOLOv7-tiny"
FAMILY = "YOLOv7"
LICENSE = "GPL-3.0"
# Params / COCO val AP from https://github.com/WongKinYiu/yolov7 README (tiny 640: 6.2M, 38.7 AP)
PARAMS_M = 6.2
COCO_AP = 38.7
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load():
    # Output is (1, 25200, 85) decoded: cx, cy, w, h (px), obj, cls -> same decode as YOLOv6 class.
    return YOLOv6(_FILE)
