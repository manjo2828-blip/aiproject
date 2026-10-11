"""DETR ResNet-50 adapter (facebook/detr-resnet-50, Xenova ONNX export; NMS-free)."""
import cv2
import numpy as np

from ._misc_common import MAP91_ARR, file_mb, make_session, to_dets

_FILE = "detr_resnet50.onnx"
NAME = "DETR-R50"
FAMILY = "DETR"
LICENSE = "Apache-2.0"
# Params / COCO val AP from https://github.com/facebookresearch/detr README (DETR R50: 41M, 42.0 AP)
PARAMS_M = 41.0
COCO_AP = 42.0
INPUT = "800 short side (max 1333)"
FILE_MB = file_mb(_FILE)
SHORT, MAXS = 800, 1333
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


class Detector:
    def __init__(self):
        self.sess = make_session(_FILE)
        self.names = [i.name for i in self.sess.get_inputs()]

    def detect(self, bgr, conf=0.25, iou=0.45):
        h, w = bgr.shape[:2]
        r = min(SHORT / min(h, w), MAXS / max(h, w))
        nw, nh = int(round(w * r)), int(round(h * r))
        img = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)[:, :, ::-1]
        x = ((img.astype(np.float32) / 255.0 - MEAN) / STD).transpose(2, 0, 1)[None]
        feed = {"pixel_values": np.ascontiguousarray(x, np.float32)}
        if "pixel_mask" in self.names:
            feed["pixel_mask"] = np.ones((1, 64, 64), np.int64)
        logits, boxes = self.sess.run(None, feed)[:2]
        e = np.exp(logits[0] - logits[0].max(-1, keepdims=True))
        p = (e / e.sum(-1, keepdims=True))[:, :-1]       # drop no-object
        c91 = p.argmax(1)
        s = p.max(1)
        c80 = MAP91_ARR[np.clip(c91, 0, 91)]
        m = (s > conf) & (c80 >= 0)
        b = boxes[0][m]
        xyxy = np.stack([b[:, 0] - b[:, 2] / 2, b[:, 1] - b[:, 3] / 2,
                         b[:, 0] + b[:, 2] / 2, b[:, 1] + b[:, 3] / 2], 1) * [w, h, w, h]
        return to_dets(xyxy, s[m], c80[m], w, h, nms_on=False)


def load():
    return Detector()
