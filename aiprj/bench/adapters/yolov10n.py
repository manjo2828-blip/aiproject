"""YOLOv10n COCO detector adapter (ONNX, CPU).

LICENSE: AGPL-3.0 (Ultralytics) -- weights bench/weights/yolov10n.onnx.
Source: HF onnx-community/yolov10n onnx/model.onnx (NMS-free [1,300,6])
"""
from pathlib import Path

from ._ultra_common import Detector, WEIGHTS_DIR

NAME = "YOLOv10n"
FAMILY = "YOLOv10"
LICENSE = "AGPL-3.0"
PARAMS_M = 2.3
COCO_AP = 38.5  # mAP50-95 val, Ultralytics docs (docs.ultralytics.com/models/yolov10)
INPUT = "640x640"
WEIGHT = "yolov10n.onnx"
FILE_MB = round((WEIGHTS_DIR / WEIGHT).stat().st_size / 1e6, 1) if (WEIGHTS_DIR / WEIGHT).exists() else None


def load() -> Detector:
    return Detector(WEIGHT, "e2e")
