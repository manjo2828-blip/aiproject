"""RT-DETR R50vd adapter (lyuwenyu/PekingU, HF onnx-community export; NMS-free)."""
from ._misc_common import file_mb
from ._rtdetr_common import RTDETR

_FILE = "rtdetr_r50vd.onnx"
NAME = "RT-DETR-R50vd"
FAMILY = "RT-DETR"
LICENSE = "Apache-2.0"
# Params / COCO val AP from https://github.com/lyuwenyu/RT-DETR README (RT-DETR-R50: 42M, 53.1 AP)
PARAMS_M = 42.0
COCO_AP = 53.1
INPUT = "640x640"
FILE_MB = file_mb(_FILE)


def load():
    return RTDETR(_FILE)
