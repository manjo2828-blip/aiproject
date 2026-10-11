"""YOLOX-m adapter (Megvii, ONNX 0.1.1rc0)."""
from ._yolox_common import Detector, file_mb

_FILE = "yolox_m.onnx"
NAME = "YOLOX-m"
FAMILY = "YOLOX"
LICENSE = "Apache-2.0"
# Params and COCO val AP@[.5:.95] from https://github.com/Megvii-BaseDetection/YOLOX README
PARAMS_M = 25.3
COCO_AP = 46.9
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load() -> Detector:
    return Detector(_FILE, 640)
