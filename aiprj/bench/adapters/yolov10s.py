"""YOLOv10s COCO detector adapter (ONNX, CPU).

LICENSE: AGPL-3.0 (Ultralytics) -- weights bench/weights/yolov10s.onnx.
Source: HF onnx-community/yolov10s onnx/model.onnx (NMS-free [1,300,6])
"""
from pathlib import Path

from ._ultra_common import Detector, WEIGHTS_DIR

NAME = "YOLOv10s"
FAMILY = "YOLOv10"
LICENSE = "AGPL-3.0"
PARAMS_M = 7.2
COCO_AP = 46.3  # mAP50-95 val, Ultralytics docs (docs.ultralytics.com/models/yolov10)
INPUT = "640x640"
WEIGHT = "yolov10s.onnx"
FILE_MB = round((WEIGHTS_DIR / WEIGHT).stat().st_size / 1e6, 1) if (WEIGHTS_DIR / WEIGHT).exists() else None


def load() -> Detector:
    return Detector(WEIGHT, "e2e")
