"""YOLOX-l adapter (Megvii, ONNX 0.1.1rc0)."""
from ._yolox_common import Detector, file_mb

_FILE = "yolox_l.onnx"
NAME = "YOLOX-l"
FAMILY = "YOLOX"
LICENSE = "Apache-2.0"
# Params and COCO val AP@[.5:.95] from https://github.com/Megvii-BaseDetection/YOLOX README
PARAMS_M = 54.2
COCO_AP = 49.7
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load() -> Detector:
    return Detector(_FILE, 640)
