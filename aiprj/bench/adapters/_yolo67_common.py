"""YOLOv6 (anchor-free, decoded) and YOLOv7/MMYOLO (raw anchor-based heads) + NanoDet-Plus decoders."""
import cv2
import numpy as np

from ._misc_common import letterbox, make_session, sigmoid, to_dets


def _prep_rgb(bgr, size):
    canvas, r = letterbox(bgr, size)
    x = np.ascontiguousarray(canvas[:, :, ::-1].transpose(2, 0, 1)[None], np.float32) / 255.0
    return x, r


class YOLOv6:
    """Output (1, N, 85): cx, cy, w, h (input px), obj, 80 cls scores."""

    def __init__(self, file_name, size=640):
        self.sess, self.size = make_session(file_name), size
        self.inp = self.sess.get_inputs()[0].name

    def detect(self, bgr, conf=0.25, iou=0.45):
        h, w = bgr.shape[:2]
        x, r = _prep_rgb(bgr, self.size)
        p = self.sess.run(None, {self.inp: x})[0][0]
        sc = p[:, 4:5] * p[:, 5:]
        cls, s = sc.argmax(1), sc.max(1)
        m = s > conf
        p, cls, s = p[m], cls[m], s[m]
        xyxy = np.concatenate([p[:, :2] - p[:, 2:4] / 2, p[:, :2] + p[:, 2:4] / 2], 1) / r
        return to_dets(xyxy, s, cls, w, h, iou)


class _UnusedYOLOv7Raw:
    """MMYOLO-style YOLOv7 head outputs: 3x (1, 3*85, H, W) raw logits."""
    ANCHORS = [[(12, 16), (19, 36), (40, 28)],
               [(36, 75), (76, 55), (72, 146)],
               [(142, 110), (192, 243), (459, 401)]]
    STRIDES = (8, 16, 32)

    def __init__(self, file_name, size=640):
        self.sess, self.size = make_session(file_name), size
        self.inp = self.sess.get_inputs()[0].name

    def detect(self, bgr, conf=0.25, iou=0.45):
        h, w = bgr.shape[:2]
        x, r = _prep_rgb(bgr, self.size)
        outs = self.sess.run(None, {self.inp: x})
        boxes, scores, clss = [], [], []
        for o, st, anc in zip(outs, self.STRIDES, self.ANCHORS):
            _, _, gh, gw = o.shape
            o = sigmoid(o[0].reshape(3, 85, gh, gw)).transpose(0, 2, 3, 1)  # (3,gh,gw,85)
            gy, gx = np.mgrid[:gh, :gw]
            grid = np.stack([gx, gy], -1)[None].astype(np.float32)
            xy = (o[..., :2] * 2 - 0.5 + grid) * st
            wh = (o[..., 2:4] * 2) ** 2 * np.array(anc, np.float32)[:, None, None, :]
            sc = o[..., 4:5] * o[..., 5:]
            s = sc.max(-1)
            m = s > conf
            c = sc.argmax(-1)[m]
            xy, wh = xy[m], wh[m]
            boxes.append(np.concatenate([xy - wh / 2, xy + wh / 2], 1))
            scores.append(s[m])
            clss.append(c)
        boxes, scores, clss = (np.concatenate(v) for v in (boxes, scores, clss))
        return to_dets(boxes / r, scores, clss, w, h, iou)


class NanoDetPlus:
    """Output (1, N, 80+4*(reg_max+1)); cls already sigmoid, reg = distribution logits."""
    MEAN = np.array([103.53, 116.28, 123.675], np.float32)  # BGR
    STD = np.array([57.375, 57.12, 58.395], np.float32)

    def __init__(self, file_name, size=416, strides=(8, 16, 32, 64), reg_max=7):
        self.sess, self.size, self.reg_max = make_session(file_name), size, reg_max
        self.inp = self.sess.get_inputs()[0].name
        pts, sts = [], []
        for s in strides:
            n = int(np.ceil(size / s))
            gy, gx = np.mgrid[:n, :n]
            pts.append(np.stack([gx.ravel(), gy.ravel()], 1) * s)
            sts.append(np.full(n * n, s))
        self.pts = np.concatenate(pts).astype(np.float32)
        self.sts = np.concatenate(sts).astype(np.float32)[:, None]

    def detect(self, bgr, conf=0.25, iou=0.45):
        h, w = bgr.shape[:2]
        S = self.size
        img = cv2.resize(bgr, (S, S), interpolation=cv2.INTER_LINEAR).astype(np.float32)
        x = np.ascontiguousarray(((img - self.MEAN) / self.STD).transpose(2, 0, 1)[None])
        p = self.sess.run(None, {self.inp: x})[0][0]
        cls_s, reg = p[:, :80], p[:, 80:]
        s, c = cls_s.max(1), cls_s.argmax(1)
        m = s > conf
        reg = reg[m].reshape(-1, 4, self.reg_max + 1)
        e = np.exp(reg - reg.max(-1, keepdims=True))
        d = ((e / e.sum(-1, keepdims=True)) * np.arange(self.reg_max + 1)).sum(-1) * self.sts[m]
        pt = self.pts[m]
        xyxy = np.concatenate([pt - d[:, :2], pt + d[:, 2:]], 1) * [w / S, h / S, w / S, h / S]
        return to_dets(xyxy, s[m], c[m], w, h, iou)
