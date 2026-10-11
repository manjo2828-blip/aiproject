"""SSD-MobileNetV1 adapter (onnx/models zoo ssd_mobilenet_v1_12, TF OD API, NMS baked in)."""
import numpy as np

from ._misc_common import MAP91_ARR, file_mb, make_session, to_dets

_FILE = "ssd_mobilenet_v1_12.onnx"
NAME = "SSD-MobileNetV1"
FAMILY = "SSD"
LICENSE = "Apache-2.0"
# TF OD API model zoo ssd_mobilenet_v1_coco: ~6.8M params, COCO mAP 21 (onnx/models README: mAP 0.21)
PARAMS_M = 6.8
COCO_AP = 21.0
INPUT = "300x300 uint8 RGB (resized inside graph)"
FILE_MB = file_mb(_FILE)


class Detector:
    def __init__(self):
        self.sess = make_session(_FILE)
        self.inp = self.sess.get_inputs()[0].name

    def detect(self, bgr, conf=0.25, iou=0.45):
        h, w = bgr.shape[:2]
        x = np.ascontiguousarray(bgr[:, :, ::-1])[None].astype(np.uint8)
        boxes, classes, scores, n = self.sess.run(None, {self.inp: x})
        n = int(n[0])
        b, c, s = boxes[0][:n], classes[0][:n].astype(np.int64), scores[0][:n]
        c80 = MAP91_ARR[np.clip(c, 0, 91)]
        m = (s > conf) & (c80 >= 0)
        b = b[m]  # ymin, xmin, ymax, xmax normalized
        xyxy = b[:, [1, 0, 3, 2]] * [w, h, w, h]
        return to_dets(xyxy, s[m], c80[m], w, h, iou=iou, nms_on=True)


def load():
    return Detector()
