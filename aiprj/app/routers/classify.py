import time

from fastapi import APIRouter, File, Form, UploadFile
from app.core.runtime import run_inference

from app.core.errors import ApiError
from app.core.imageio import read_upload_image
from app.services import classify as svc

router = APIRouter(prefix="/api", tags=["classify"])


@router.post("/classify")
async def classify(file: UploadFile = File(None), top_k: str = Form(None)):
    if file is None:
        raise ApiError("MISSING_FIELD", "사진을 올려 주세요", 400)
    k = 5
    if top_k not in (None, ""):
        try:
            k = int(top_k)
        except ValueError:
            k = 0
        if not 1 <= k <= 10:
            raise ApiError("INVALID_PARAM", "top_k 는 1~10 사이여야 해요", 400)
    bgr, w, h = await read_upload_image(file)
    t0 = time.perf_counter()
    preds = await run_inference(svc.predict, bgr, k)
    ms = int((time.perf_counter() - t0) * 1000)
    return {
        "image": {"width": w, "height": h},
        "predictions": [
            {"label": p["label"], "label_ko": p["label_ko"], "score": p["score"]} for p in preds
        ],
        "elapsed_ms": ms,
    }
