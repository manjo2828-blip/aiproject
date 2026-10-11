"""Korean emotion classification (KoELECTRA int8 ONNX). See wiki/models/emotion.md."""
import json
import threading

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

from app.core.errors import ApiError
from app.core.paths import MODELS_DIR

_DIR = MODELS_DIR / "emotion"
_MODEL = _DIR / "model.onnx"
_TOK = _DIR / "tokenizer.json"
_LABELS = _DIR / "labels.json"

MAX_CHARS = 500
# label polarity for the -1..1 mood meter (weighted sum with probabilities)
_POLARITY = {"기쁨": 1.0, "중립": 0.0, "당황": -0.3, "불안": -0.6, "분노": -0.8, "상처": -0.8, "슬픔": -0.9}

_lock = threading.Lock()
_state = {"sess": None, "tok": None, "labels": None}


def _load():
    if _state["sess"] is not None:
        return _state
    with _lock:
        if _state["sess"] is not None:
            return _state
        if not (_MODEL.exists() and _TOK.exists() and _LABELS.exists()):
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503)
        try:
            tok = Tokenizer.from_file(str(_TOK))
            tok.enable_truncation(128)
            labels = json.loads(_LABELS.read_text(encoding="utf-8"))
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 4
            sess = ort.InferenceSession(str(_MODEL), sess_options=opts, providers=["CPUExecutionProvider"])
        except Exception as e:  # noqa: BLE001
            raise ApiError("MODEL_NOT_READY", "모델이 아직 준비되지 않았어요", 503) from e
        _state.update(tok=tok, labels=labels)
        _state["sess"] = sess  # set last: marks fully loaded
    return _state


def classify(text) -> dict:
    text = (text or "").strip() if isinstance(text, str) else ""
    if not text:
        raise ApiError("TEXT_EMPTY", "문장을 입력해 주세요", 422)
    if len(text) > MAX_CHARS:
        raise ApiError("TEXT_TOO_LONG", f"{MAX_CHARS}자 이하로 입력해 주세요", 422)
    st = _load()
    e = st["tok"].encode(text)
    feeds = {
        "input_ids": np.array([e.ids], dtype=np.int64),
        "attention_mask": np.array([e.attention_mask], dtype=np.int64),
        "token_type_ids": np.array([e.type_ids], dtype=np.int64),
    }
    z = st["sess"].run(None, feeds)[0][0].astype(np.float64)
    p = np.exp(z - z.max())
    p /= p.sum()
    scores = sorted(
        ({"label": l, "score": round(float(s), 4)} for l, s in zip(st["labels"], p)),
        key=lambda d: -d["score"],
    )
    sentiment = sum(_POLARITY.get(l, 0.0) * float(s) for l, s in zip(st["labels"], p))
    return {
        "text": text,
        "label": scores[0]["label"],
        "score": scores[0]["score"],
        "scores": scores,
        "top": scores[0],
        "sentiment": round(max(-1.0, min(1.0, sentiment)), 4),
    }


def status() -> dict:
    exists = _MODEL.exists()
    return {
        "name": "emotion",
        "ready": _state["sess"] is not None,
        "file_exists": exists,
        "size_mb": round(_MODEL.stat().st_size / 1048576, 1) if exists else 0,
    }
