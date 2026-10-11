import cv2
import numpy as np

from ._misc_common import make_session, sigmoid, to_dets


class RTDETR:
    def __init__(self, file_name, size=640):
        self.sess, self.size = make_session(file_name), size
        self.inp = self.sess.get_inputs()[0].name

    def detect(self, bgr, conf=0.25, iou=0.45):
        h, w = bgr.shape[:2]
        S = self.size
        img = cv2.resize(bgr, (S, S), interpolation=cv2.INTER_LINEAR)[:, :, ::-1]
        x = np.ascontiguousarray(img.transpose(2, 0, 1)[None], np.float32) / 255.0
        logits, boxes = self.sess.run(None, {self.inp: x})
        prob = sigmoid(logits[0])                     # (300, 80)
        flat = prob.ravel()
        idx = np.where(flat > conf)[0]
        q, c = idx // prob.shape[1], idx % prob.shape[1]
        b = boxes[0][q]
        xyxy = np.stack([b[:, 0] - b[:, 2] / 2, b[:, 1] - b[:, 3] / 2,
                         b[:, 0] + b[:, 2] / 2, b[:, 1] + b[:, 3] / 2], 1) * [w, h, w, h]
        return to_dets(xyxy, flat[idx], c, w, h, nms_on=False)
