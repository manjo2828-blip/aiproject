"""Shared YOLOX ONNX helpers (decode + class-wise NMS, numpy only)."""
from pathlib import Path

import cv2
import numpy as np

WEIGHTS = Path(__file__).resolve().parents[1] / "weights"


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


class Detector:
    def __init__(self, file_name: str, size: int):
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = 4
        self.size = size
        self.sess = ort.InferenceSession(str(WEIGHTS / file_name), so,
                                         providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name
        grids, strides = [], []
        for s in (8, 16, 32):
            n = size // s
            y, x = np.mgrid[:n, :n]
            grids.append(np.stack([x, y], -1).reshape(-1, 2))
            strides.append(np.full(n * n, s))
        self.grid = np.concatenate(grids).astype(np.float32)
        self.stride = np.concatenate(strides)[:, None].astype(np.float32)

    def detect(self, bgr: np.ndarray, conf: float = 0.25, iou: float = 0.45) -> list:
        S = self.size
        h, w = bgr.shape[:2]
        r = min(S / h, S / w)
        nw, nh = max(1, int(w * r)), max(1, int(h * r))
        canvas = np.full((S, S, 3), 114, np.float32)
        canvas[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        x = np.ascontiguousarray(canvas.transpose(2, 0, 1)[None])  # BGR, 0-255
        p = self.sess.run(None, {self.inp: x})[0][0].copy()
        p[:, :2] = (p[:, :2] + self.grid) * self.stride
        p[:, 2:4] = np.exp(p[:, 2:4]) * self.stride
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
            for k in nms(boxes[idx], score[idx], iou):
                dets.append({"cls": int(c), "score": float(score[idx[k]]),
                             "bbox": [float(v) for v in boxes[idx[k]]]})
        dets.sort(key=lambda d: -d["score"])
        return dets


def file_mb(name):
    return round((WEIGHTS / name).stat().st_size / 1048576, 1)
