"""Face detection (YuNet) + recognition (SFace) service. Lazy, thread-safe singletons."""
import threading

import cv2
import numpy as np

from app.core.errors import ApiError
from app.core.paths import MODELS_DIR

DET_PATH = MODELS_DIR / "face" / "face_detection_yunet_2023mar.onnx"
REC_PATH = MODELS_DIR / "face" / "face_recognition_sface_2021dec.onnx"

# 0.7 drops spurious small boxes (e.g. 0.63 on face_a.jpg) yet keeps the 1921 etching (0.88)
DEFAULT_SCORE_THR = 0.7
COSINE_THR = 0.363  # OpenCV recommended same-person threshold

_lock = threading.Lock()  # guards loading and detector (setInputSize mutates state)
_detector = None
_recognizer = None
_rec_lock = threading.Lock()  # guards recognizer lazy-load only


def _need(path):
    if not path.exists():
        raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503)


def _get_detector():
    global _detector
    if _detector is None:
        _need(DET_PATH)
        try:
            _detector = cv2.FaceDetectorYN.create(str(DET_PATH), "", (320, 320), DEFAULT_SCORE_THR, 0.3, 5000)
        except Exception as e:  # noqa: BLE001
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503) from e
    return _detector


def _get_recognizer():
    global _recognizer
    if _recognizer is None:
        with _rec_lock:
            if _recognizer is None:
                _need(REC_PATH)
                try:
                    _recognizer = cv2.FaceRecognizerSF.create(str(REC_PATH), "")
                except Exception as e:  # noqa: BLE001
                    raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503) from e
    return _recognizer


def status():
    exists = DET_PATH.exists() and REC_PATH.exists()
    size = (DET_PATH.stat().st_size if DET_PATH.exists() else 0) + (
        REC_PATH.stat().st_size if REC_PATH.exists() else 0
    )
    return {
        "name": "face",
        "ready": _detector is not None and _recognizer is not None,
        "file_exists": exists,
        "size_mb": round(size / 1024 / 1024, 2),
    }


def _detect_rows(bgr, score_thr=DEFAULT_SCORE_THR):
    """Raw YuNet rows (N,15): x,y,w,h, 5 landmarks, score."""
    h, w = bgr.shape[:2]
    with _lock:
        det = _get_detector()
        det.setInputSize((w, h))
        det.setScoreThreshold(float(score_thr))
        _, faces = det.detect(bgr)
    if faces is None or len(faces) == 0:
        return np.zeros((0, 15), dtype=np.float32)
    return faces


def _to_dict(row, w, h):
    x, y, bw, bh = (float(v) for v in row[:4])
    x1, y1 = max(0.0, x), max(0.0, y)
    x2, y2 = min(float(w), x + bw), min(float(h), y + bh)
    lm = [[round(float(row[4 + 2 * i]), 2), round(float(row[5 + 2 * i]), 2)] for i in range(5)]
    return {
        "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
        "score": round(float(row[14]), 4),
        "landmarks": lm,
    }


def detect_faces(bgr, score_thr=DEFAULT_SCORE_THR):
    """Return [{bbox:[x1,y1,x2,y2], score, landmarks:[[x,y]*5]}] in pixel coords.

    Landmark order (YuNet): image-left eye, image-right eye, nose, image-left mouth
    corner, image-right mouth corner.
    """
    h, w = bgr.shape[:2]
    return [_to_dict(r, w, h) for r in _detect_rows(bgr, score_thr)]


def embed(bgr, face_row):
    """128-d SFace embedding for a raw YuNet row (15,)."""
    rec = _get_recognizer()
    with _lock:
        aligned = rec.alignCrop(bgr, np.asarray(face_row, dtype=np.float32).reshape(1, -1))
        return rec.feature(aligned)


_PCT_X = [-1.0, 0.0, 0.2, COSINE_THR, 0.88, 1.0]
_PCT_Y = [0.0, 0.0, 30.0, 60.0, 95.0, 100.0]


def similarity_percent(cos):
    """Map cosine (-1..1) to a UX percent 0..100 (piecewise linear, monotonic, clamped).

    cos<=0 -> 0; 0..0.2 -> 0..30 (strangers measured -0.12..0.20); 0.2..0.363 -> 30..60;
    0.363..0.88 -> 60..95 (0.363 = same-person threshold; same person re-shot ~0.88+);
    0.88..1.0 -> 95..100 (identical photo = 100).
    """
    return round(float(np.interp(cos, _PCT_X, _PCT_Y)), 1)


def _largest(rows):
    areas = rows[:, 2] * rows[:, 3]
    return rows[int(np.argmax(areas))]


def compare(bgr_a, bgr_b, threshold=COSINE_THR):
    """Compare largest faces in two images. Raises ApiError NO_FACE (422) naming A or B."""
    out = {}
    feats = []
    for key, img in (("a", bgr_a), ("b", bgr_b)):
        rows = _detect_rows(img)
        if len(rows) == 0:
            raise ApiError("NO_FACE", f"사진 {key.upper()}에서 얼굴이 안 보여요 🙈", 422)
        row = _largest(rows)
        h, w = img.shape[:2]
        out[key] = {"face": _to_dict(row, w, h), "num_faces": int(len(rows)), "size": (w, h)}
        feats.append(embed(img, row))
    rec = _get_recognizer()
    cos = float(rec.match(feats[0], feats[1], cv2.FaceRecognizerSF_FR_COSINE))
    l2 = float(rec.match(feats[0], feats[1], cv2.FaceRecognizerSF_FR_NORM_L2))
    return {
        "a": out["a"],
        "b": out["b"],
        "cosine": cos,
        "l2": l2,
        "same_person": cos >= threshold,
        "similarity_percent": similarity_percent(cos),
        "threshold": threshold,
    }
