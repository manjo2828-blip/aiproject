"""YOLOv8n-pose (ONNX, CPU) service. Output is COCO17, pixel coords of the input image."""
from __future__ import annotations

import threading

import cv2
import numpy as np

from app.core.errors import ApiError
from app.core.paths import MODELS_DIR

MODEL_PATH = MODELS_DIR / "pose" / "model.onnx"
INPUT_SIZE = 640

KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]
SKELETON = [
    [0, 1], [0, 2], [1, 3], [2, 4], [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
    [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
]

_session = None
_lock = threading.Lock()


def _get_session():
    global _session
    if _session is not None:
        return _session
    with _lock:
        if _session is None:
            if not MODEL_PATH.exists():
                raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503)
            import onnxruntime as ort

            so = ort.SessionOptions()
            so.log_severity_level = 3
            try:
                _session = ort.InferenceSession(
                    str(MODEL_PATH), sess_options=so, providers=["CPUExecutionProvider"]
                )
            except Exception as e:  # noqa: BLE001
                raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503) from e
    return _session


def status() -> dict:
    exists = MODEL_PATH.exists()
    return {
        "name": "pose",
        "ready": _session is not None,
        "file_exists": exists,
        "size_mb": round(MODEL_PATH.stat().st_size / 1048576, 1) if exists else 0.0,
    }


def _letterbox(bgr):
    h, w = bgr.shape[:2]
    r = min(INPUT_SIZE / h, INPUT_SIZE / w)
    nw, nh = max(1, int(round(w * r))), max(1, int(round(h * r)))
    resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((INPUT_SIZE, INPUT_SIZE, 3), 114, np.uint8)
    padx, pady = (INPUT_SIZE - nw) // 2, (INPUT_SIZE - nh) // 2
    canvas[pady:pady + nh, padx:padx + nw] = resized
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
    x = rgb.astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    return np.ascontiguousarray(x), r, padx, pady


def estimate(bgr, conf: float = 0.25, iou: float = 0.45) -> list[dict]:
    sess = _get_session()
    h, w = bgr.shape[:2]
    x, r, padx, pady = _letterbox(bgr)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0]
    p = out[0].T
    p = p[p[:, 4] > conf]
    if len(p) == 0:
        return []
    cx, cy, bw, bh = p[:, 0], p[:, 1], p[:, 2], p[:, 3]
    boxes = np.stack([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], 1)
    kpts = p[:, 5:].reshape(-1, 17, 3)
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    order, picked = p[:, 4].argsort()[::-1], []
    while len(order):
        i, rest = order[0], order[1:]
        picked.append(i)
        ix1 = np.maximum(boxes[i, 0], boxes[rest, 0])
        iy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        ix2 = np.minimum(boxes[i, 2], boxes[rest, 2])
        iy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
        order = rest[inter / (area[i] + area[rest] - inter + 1e-9) <= iou]

    people = []
    for i in picked:
        b = (boxes[i] - [padx, pady, padx, pady]) / r
        b = [float(np.clip(b[0], 0, w)), float(np.clip(b[1], 0, h)),
             float(np.clip(b[2], 0, w)), float(np.clip(b[3], 0, h))]
        kps = []
        for j, (kx, ky, ks) in enumerate(kpts[i]):
            kx, ky = (kx - padx) / r, (ky - pady) / r
            kps.append({
                "name": KEYPOINT_NAMES[j],
                "x": round(float(np.clip(kx, 0, w)), 1),
                "y": round(float(np.clip(ky, 0, h)), 1),
                "score": round(float(ks), 4),
            })
        people.append({
            "score": round(float(p[i, 4]), 4),
            "bbox": [round(v, 1) for v in b],
            "keypoints": kps,
        })
    return people


def guess_pose(person: dict, min_score: float = 0.3) -> dict:
    """Geometric heuristic on keypoints (y grows downward)."""
    kp = {k["name"]: k for k in person["keypoints"]}

    def ok(n):
        return kp[n]["score"] >= min_score

    nose = kp["nose"] if ok("nose") else None
    sh = [kp[n] for n in ("left_shoulder", "right_shoulder") if ok(n)]
    ref_y = nose["y"] if nose else (min(s["y"] for s in sh) if sh else None)
    lw, rw = ok("left_wrist"), ok("right_wrist")
    if ref_y is not None:
        up_l = lw and kp["left_wrist"]["y"] < ref_y
        up_r = rw and kp["right_wrist"]["y"] < ref_y
        if up_l and up_r:
            return {"key": "cheer", "label_ko": "만세! 🙌"}
        if up_l or up_r:
            return {"key": "one_hand_up", "label_ko": "한 손 들기 🙋"}
    if ok("left_shoulder") and ok("right_shoulder") and lw and rw:
        ls, rs = kp["left_shoulder"], kp["right_shoulder"]
        width = abs(ls["x"] - rs["x"]) or 1.0
        sy = (ls["y"] + rs["y"]) / 2
        lx, rx = kp["left_wrist"], kp["right_wrist"]
        spread = abs(lx["x"] - rx["x"])
        if spread > 2.5 * width and abs(lx["y"] - sy) < width and abs(rx["y"] - sy) < width:
            return {"key": "t_pose", "label_ko": "T자 팔 벌리기 ✈️"}
    hips = [kp[n] for n in ("left_hip", "right_hip") if ok(n)]
    knees = [kp[n] for n in ("left_knee", "right_knee") if ok(n)]
    if sh and hips and knees:
        sy = sum(s["y"] for s in sh) / len(sh)
        hy = sum(s["y"] for s in hips) / len(hips)
        ky = sum(s["y"] for s in knees) / len(knees)
        torso = hy - sy
        if torso > 0 and (ky - hy) < 0.7 * torso:
            return {"key": "sitting", "label_ko": "앉아 있어요 🪑"}
    return {"key": "standing", "label_ko": "차렷 자세네요 🧍"}
