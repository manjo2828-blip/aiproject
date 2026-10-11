"""ImageNet classification (MobileNetV2 ONNX). See wiki/models/classification.md."""
import threading

import numpy as np
import onnxruntime as ort
from PIL import Image

from app.core.errors import ApiError
from app.core.paths import MODELS_DIR

_DIR = MODELS_DIR / "classification"
_MODEL = _DIR / "model.onnx"
_LABELS = _DIR / "labels.txt"
_LABELS_KO = _DIR / "labels_ko.txt"

_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)

_lock = threading.Lock()
_state = {"sess": None, "input": None, "labels": None, "labels_ko": None}


def _read_lines(path):
    return [l.rstrip("\r\n") for l in path.read_text(encoding="utf-8").split("\n")]


def _load():
    if _state["sess"] is not None:
        return _state
    with _lock:
        if _state["sess"] is not None:
            return _state
        if not _MODEL.exists() or not _LABELS.exists():
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503)
        try:
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 4
            sess = ort.InferenceSession(
                str(_MODEL), sess_options=opts, providers=["CPUExecutionProvider"]
            )
            labels = [l.strip() for l in _LABELS.read_text(encoding="utf-8").splitlines() if l.strip()]
            ko = None
            if _LABELS_KO.exists():
                ko = _read_lines(_LABELS_KO)
        except Exception as e:  # noqa: BLE001
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503) from e
        _state.update(input=sess.get_inputs()[0].name, labels=labels, labels_ko=ko)
        _state["sess"] = sess  # set last: marks fully loaded
    return _state


def _preprocess(bgr: np.ndarray) -> np.ndarray:
    img = Image.fromarray(np.ascontiguousarray(bgr[:, :, ::-1]))
    s = 256 / min(img.size)
    rw, rh = max(224, round(img.width * s)), max(224, round(img.height * s))
    l, t = (rw - 224) // 2, (rh - 224) // 2
    if max(rw, rh) > 4096:  # extreme aspect ratio: resample only the crop region of the source
        box = (l / s, t / s, (l + 224) / s, (t + 224) / s)
        box = (max(0.0, box[0]), max(0.0, box[1]), min(float(img.width), box[2]), min(float(img.height), box[3]))
        img = img.resize((224, 224), Image.BILINEAR, box=box)
        l = t = 0
    else:
        img = img.resize((rw, rh), Image.BILINEAR)
    x = np.asarray(img.crop((l, t, l + 224, t + 224)), np.float32) / 255.0
    x = (x - _MEAN) / _STD
    return x.transpose(2, 0, 1)[None].astype(np.float32)


def predict(bgr: np.ndarray, top_k: int = 5) -> list:
    st = _load()
    z = st["sess"].run(None, {st["input"]: _preprocess(bgr)})[0][0].astype(np.float64)
    p = np.exp(z - z.max())
    p /= p.sum()
    out = []
    for i in p.argsort()[::-1][:top_k]:
        i = int(i)
        ko = st["labels_ko"][i] if st["labels_ko"] and i < len(st["labels_ko"]) and st["labels_ko"][i] else None
        out.append({"label": st["labels"][i], "label_ko": ko, "score": round(float(p[i]), 4), "index": i})
    return out


def status() -> dict:
    exists = _MODEL.exists()
    return {
        "name": "classify",
        "ready": _state["sess"] is not None,
        "file_exists": exists,
        "size_mb": round(_MODEL.stat().st_size / 1048576, 2) if exists else 0.0,
    }
