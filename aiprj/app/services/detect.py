"""Object detection service: YOLOX-tiny (COCO80) via onnxruntime CPU."""
import threading
import time

import cv2
import numpy as np

from app.core.errors import ApiError
from app.core.paths import MODELS_DIR

SIZE = 416
_DIR = MODELS_DIR / "detection"
_MODEL = _DIR / "model.onnx"

_lock = threading.Lock()
_session = None
_labels = None
_labels_ko = None
_grid = None


def _read_lines(p):
    if not p.exists():
        return []
    return [l.strip() for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def _load():
    global _session, _labels, _labels_ko, _grid
    if _session is not None:
        return
    with _lock:
        if _session is not None:
            return
        if not _MODEL.exists():
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503)
        import onnxruntime as ort

        try:
            so = ort.SessionOptions()
            sess = ort.InferenceSession(str(_MODEL), so, providers=["CPUExecutionProvider"])
        except Exception as e:  # noqa: BLE001
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503) from e
        _labels = _read_lines(_DIR / "labels.txt")
        ko = _read_lines(_DIR / "labels_ko.txt")
        _labels_ko = ko if len(ko) == len(_labels) else [None] * len(_labels)
        grids, strides = [], []
        for s in (8, 16, 32):
            n = SIZE // s
            y, x = np.mgrid[:n, :n]
            grids.append(np.stack([x, y], -1).reshape(-1, 2))
            strides.append(np.full(n * n, s))
        _grid = (np.concatenate(grids).astype(np.float32),
                 np.concatenate(strides)[:, None].astype(np.float32))
        _session = sess


def status():
    return {
        "name": "detect",
        "ready": _session is not None,
        "file_exists": _MODEL.exists(),
        "size_mb": round(_MODEL.stat().st_size / 1048576, 1) if _MODEL.exists() else 0.0,
    }


def _nms(boxes, scores, thr):
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


def detect(bgr, conf=0.35, iou=0.45):
    """Return detections with bbox in pixel coords of the input BGR array."""
    _load()
    h, w = bgr.shape[:2]
    r = min(SIZE / h, SIZE / w)
    nw, nh = max(1, int(w * r)), max(1, int(h * r))
    canvas = np.full((SIZE, SIZE, 3), 114, np.float32)
    canvas[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    x = np.ascontiguousarray(canvas.transpose(2, 0, 1)[None])
    out = _session.run(None, {_session.get_inputs()[0].name: x})[0]

    p = out[0].copy()
    grid, stride = _grid
    p[:, :2] = (p[:, :2] + grid) * stride
    p[:, 2:4] = np.exp(p[:, 2:4]) * stride
    scores = p[:, 4:5] * p[:, 5:]
    cls, score = scores.argmax(1), scores.max(1)
    m = score > conf
    p, cls, score = p[m], cls[m], score[m]
    boxes = np.concatenate([p[:, :2] - p[:, 2:4] / 2, p[:, :2] + p[:, 2:4] / 2], 1) / r
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, w)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, h)

    dets = []
    for c in np.unique(cls):
        idx = np.where(cls == c)[0]
        for k in _nms(boxes[idx], score[idx], iou):
            b = boxes[idx[k]]
            ci = int(c)
            dets.append({
                "label": _labels[ci] if ci < len(_labels) else str(ci),
                "label_ko": _labels_ko[ci] if ci < len(_labels_ko) else None,
                "class_id": ci,
                "score": round(float(score[idx[k]]), 4),
                "bbox": [round(float(v), 1) for v in b],
            })
    dets.sort(key=lambda d: -d["score"])
    return dets
