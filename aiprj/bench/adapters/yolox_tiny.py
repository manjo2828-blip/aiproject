"""YOLOX-tiny adapter (Megvii, ONNX 0.1.1rc0)."""
from ._yolox_common import Detector, file_mb

_FILE = "yolox_tiny.onnx"
NAME = "YOLOX-Tiny"
FAMILY = "YOLOX"
LICENSE = "Apache-2.0"
# Params and COCO val AP@[.5:.95] from https://github.com/Megvii-BaseDetection/YOLOX README
PARAMS_M = 5.06
COCO_AP = 32.8
INPUT = "416x416"
FILE_MB = file_mb(_FILE)


def load() -> Detector:
    return Detector(_FILE, 416)
