import time

from fastapi import APIRouter, File, Form, UploadFile
from app.core.runtime import run_inference

from app.core.errors import ApiError
from app.core.imageio import read_upload_image
from app.services import face as svc

router = APIRouter(prefix="/api/face", tags=["face"])


def _float(v, name, lo, hi, default):
    if v in (None, ""):
        return default
    try:
        x = float(v)
    except ValueError:
        x = None
    if x is None or not lo <= x <= hi:
        raise ApiError("INVALID_PARAM", f"{name} 는 {lo}~{hi} 사이여야 해요", 400)
    return x


@router.post("/detect")
async def detect(file: UploadFile = File(None), conf: str = Form(None)):
    if file is None:
        raise ApiError("MISSING_FIELD", "사진을 올려 주세요", 400)
    c = _float(conf, "conf", 0.05, 0.95, svc.DEFAULT_SCORE_THR)
    bgr, w, h = await read_upload_image(file)
    t0 = time.perf_counter()
    faces = await run_inference(svc.detect_faces, bgr, c)
    return {
        "image": {"width": w, "height": h},
        "faces": faces,
        "elapsed_ms": int((time.perf_counter() - t0) * 1000),
    }


@router.post("/compare")
async def compare(
    file_a: UploadFile = File(None),
    file_b: UploadFile = File(None),
    threshold: str = Form(None),
):
    if file_a is None or file_b is None:
        raise ApiError("MISSING_FIELD", "사진 두 장을 모두 올려 주세요", 400)
    thr = _float(threshold, "threshold", -1.0, 1.0, svc.COSINE_THR)
    a, aw, ah = await read_upload_image(file_a, "file_a")
    b, bw, bh = await read_upload_image(file_b, "file_b")
    t0 = time.perf_counter()
    r = await run_inference(svc.compare, a, b, thr)
    side = lambda s, w, h: {  # noqa: E731
        "image": {"width": w, "height": h},
        "face": r[s]["face"],
        "num_faces": r[s]["num_faces"],
    }
    return {
        "a": side("a", aw, ah),
        "b": side("b", bw, bh),
        "cosine_similarity": round(r["cosine"], 4),
        "similarity_percent": r["similarity_percent"],
        "same_person": r["same_person"],
        "threshold": thr,
        "elapsed_ms": int((time.perf_counter() - t0) * 1000),
    }
