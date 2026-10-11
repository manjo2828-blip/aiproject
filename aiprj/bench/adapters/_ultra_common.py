"""Shared helpers for Ultralytics-family ONNX detectors (AGPL-3.0 models).

Runtime deps: onnxruntime, numpy, cv2 only.
Modes:
  'v8'  : output [1, 4+80, N] (cx,cy,w,h in letterbox px + 80 sigmoid class scores), class-wise NMS here.
  'e2e' : YOLOv10 NMS-free output [1, 300, 6] = x1,y1,x2,y2,score,cls; threshold only.
"""
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

WEIGHTS_DIR = Path(__file__).resolve().parent.parent / "weights"
SIZE = 640


def letterbox(bgr, size=SIZE):
    h, w = bgr.shape[:2]
    r = min(size / h, size / w)
    nw, nh = round(w * r), round(h * r)
    img = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR) if (nw, nh) != (w, h) else bgr
    dw, dh = (size - nw) / 2, (size - nh) / 2
    top, left = int(round(dh - 0.1)), int(round(dw - 0.1))
    canvas = np.full((size, size, 3), 114, np.uint8)
    canvas[top:top + nh, left:left + nw] = img
    x = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return np.ascontiguousarray(x.transpose(2, 0, 1)[None]), r, left, top


def nms(boxes, scores, iou_thr):
    """boxes xyxy float array; returns kept indices."""
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        iw = np.maximum(0, np.minimum(x2[i], x2[rest]) - np.maximum(x1[i], x1[rest]))
        ih = np.maximum(0, np.minimum(y2[i], y2[rest]) - np.maximum(y1[i], y1[rest]))
        inter = iw * ih
        iou = inter / (areas[i] + areas[rest] - inter + 1e-9)
        order = rest[iou <= iou_thr]
    return keep


class Detector:
    def __init__(self, weight_file, mode):
        so = ort.SessionOptions()
        so.intra_op_num_threads = 4
        self.sess = ort.InferenceSession(str(WEIGHTS_DIR / weight_file), so,
                                         providers=["CPUExecutionProvider"])
        self.inp = self.sess.get_inputs()[0].name
        self.mode = mode

    def detect(self, bgr, conf=0.25, iou=0.45):
        H, W = bgr.shape[:2]
        x, r, left, top = letterbox(bgr)
        out = self.sess.run(None, {self.inp: x})[0][0]
        if self.mode == "e2e":
            m = out[:, 4] >= conf
            b, s, c = out[m, :4], out[m, 4], out[m, 5].astype(int)
        else:
            p = out.T if out.shape[0] < out.shape[1] else out  # -> [N, 84]
            cls_scores = p[:, 4:]
            c = cls_scores.argmax(1)
            s = cls_scores[np.arange(len(c)), c]
            m = s >= conf
            p, s, c = p[m], s[m], c[m]
            b = np.stack([p[:, 0] - p[:, 2] / 2, p[:, 1] - p[:, 3] / 2,
                          p[:, 0] + p[:, 2] / 2, p[:, 1] + p[:, 3] / 2], 1)
            if len(b):
                off = c[:, None] * 4096.0  # class-wise NMS via coordinate offset
                keep = nms(b + off, s, iou)
                b, s, c = b[keep], s[keep], c[keep]
        if len(b):
            b = (b - np.array([left, top, left, top], np.float32)) / r
            b[:, [0, 2]] = b[:, [0, 2]].clip(0, W)
            b[:, [1, 3]] = b[:, [1, 3]].clip(0, H)
        order = np.argsort(-s) if len(s) else []
        return [{"cls": int(c[i]), "score": float(s[i]), "bbox": [float(v) for v in b[i]]} for i in order]
