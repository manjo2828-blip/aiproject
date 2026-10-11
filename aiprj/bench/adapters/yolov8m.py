"""YOLOv8m COCO detector adapter (ONNX, CPU).

LICENSE: AGPL-3.0 (Ultralytics) -- weights bench/weights/yolov8m.onnx.
Source: pt from HF Ultralytics/YOLOv8, exported with ultralytics (opset 12, imgsz 640)
"""
from pathlib import Path

from ._ultra_common import Detector, WEIGHTS_DIR

NAME = "YOLOv8m"
FAMILY = "YOLOv8"
LICENSE = "AGPL-3.0"
PARAMS_M = 25.9
COCO_AP = 50.2  # mAP50-95 val, Ultralytics docs (docs.ultralytics.com/models/yolov8)
INPUT = "640x640"
WEIGHT = "yolov8m.onnx"
FILE_MB = round((WEIGHTS_DIR / WEIGHT).stat().st_size / 1e6, 1) if (WEIGHTS_DIR / WEIGHT).exists() else None


def load() -> Detector:
    return Detector(WEIGHT, "v8")
