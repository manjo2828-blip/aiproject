"""YOLO11s COCO detector adapter (ONNX, CPU).

LICENSE: AGPL-3.0 (Ultralytics) -- weights bench/weights/yolo11s.onnx.
Source: pt from HF Ultralytics/YOLO11, exported with ultralytics (opset 12, imgsz 640)
"""
from pathlib import Path

from ._ultra_common import Detector, WEIGHTS_DIR

NAME = "YOLO11s"
FAMILY = "YOLO11"
LICENSE = "AGPL-3.0"
PARAMS_M = 9.4
COCO_AP = 47.0  # mAP50-95 val, Ultralytics docs (docs.ultralytics.com/models/yolo11)
INPUT = "640x640"
WEIGHT = "yolo11s.onnx"
FILE_MB = round((WEIGHTS_DIR / WEIGHT).stat().st_size / 1e6, 1) if (WEIGHTS_DIR / WEIGHT).exists() else None


def load() -> Detector:
    return Detector(WEIGHT, "v8")
