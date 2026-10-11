"""YOLOv8n COCO detector adapter (ONNX, CPU).

LICENSE: AGPL-3.0 (Ultralytics) -- weights bench/weights/yolov8n.onnx.
Source: pt from HF Ultralytics/YOLOv8, exported with ultralytics (opset 12, imgsz 640)
"""
from pathlib import Path

from ._ultra_common import Detector, WEIGHTS_DIR

NAME = "YOLOv8n"
FAMILY = "YOLOv8"
LICENSE = "AGPL-3.0"
PARAMS_M = 3.2
COCO_AP = 37.3  # mAP50-95 val, Ultralytics docs (docs.ultralytics.com/models/yolov8)
INPUT = "640x640"
WEIGHT = "yolov8n.onnx"
FILE_MB = round((WEIGHTS_DIR / WEIGHT).stat().st_size / 1e6, 1) if (WEIGHTS_DIR / WEIGHT).exists() else None


def load() -> Detector:
    return Detector(WEIGHT, "v8")
