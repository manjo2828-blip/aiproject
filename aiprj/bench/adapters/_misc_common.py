"""Shared helpers for non-YOLOX / non-Ultralytics adapters (numpy + cv2 + onnxruntime only)."""
from pathlib import Path

import cv2
import numpy as np

WEIGHTS = Path(__file__).resolve().parents[1] / "weights"

# COCO-91 category ids (as used by TF/DETR/SSD) of the 80 real classes, in COCO-80 order.
COCO91_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
              25, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 46, 47, 48, 49,
              50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 67, 70, 72, 73, 74,
              75, 76, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90]
COCO91_TO_80 = {c: i for i, c in enumerate(COCO91_IDS)}
MAP91_ARR = np.full(92, -1, np.int64)  # index by COCO-91 id -> COCO-80 idx (-1 = unused id)
for _c, _i in COCO91_TO_80.items():
    MAP91_ARR[_c] = _i


def file_mb(name: str) -> float:
    return round((WEIGHTS / name).stat().st_size / 1e6, 1)


def make_session(file_name: str):
    import onnxruntime as ort
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.log_severity_level = 3
    return ort.InferenceSession(str(WEIGHTS / file_name), so, providers=["CPUExecutionProvider"])


def nms(boxes, scores, thr):
    order, keep = scores.argsort()[::-1], []
    area = lambda b: (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])  # noqa: E731
    while order.size:
        i, rest = order[0], order[1:]
        keep.append(i)
        lt = np.maximum(boxes[i, :2], boxes[rest, :2])
        rb = np.minimum(boxes[i, 2:], boxes[rest, 2:])
        inter = np.clip(rb - lt, 0, None).prod(1)
        iou = inter / (area(boxes[i]) + area(boxes[rest]) - inter + 1e-9)
        order = rest[iou <= thr]
    return keep


def class_nms(boxes, scores, cls, thr):
    """Class-wise NMS via coordinate offset trick; returns kept indices."""
    if len(boxes) == 0:
        return []
    off = cls[:, None].astype(np.float32) * 10000.0
    return nms(boxes + off, scores, thr)


def letterbox(bgr, size, pad=114):
    """Top-left aligned letterbox to size x size. Returns (canvas uint8 BGR, ratio)."""
    h, w = bgr.shape[:2]
    r = min(size / h, size / w)
    nw, nh = max(1, int(round(w * r))), max(1, int(round(h * r)))
    canvas = np.full((size, size, 3), pad, np.uint8)
    canvas[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    return canvas, r


def to_dets(boxes, scores, cls, w, h, iou=0.45, nms_on=True):
    """boxes xyxy in original px; clips, optional class NMS, builds dict list."""
    boxes = np.asarray(boxes, np.float32).reshape(-1, 4).copy()
    scores = np.asarray(scores, np.float32)
    cls = np.asarray(cls, np.int64)
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, w)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, h)
    keep = class_nms(boxes, scores, cls, iou) if (nms_on and len(boxes)) else range(len(boxes))
    return [{"cls": int(cls[i]), "score": float(scores[i]),
             "bbox": [float(v) for v in boxes[i]]} for i in keep]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))
