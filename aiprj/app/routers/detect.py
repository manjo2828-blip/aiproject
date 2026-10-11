import time

from fastapi import APIRouter, File, Form, UploadFile
from app.core.runtime import run_inference

from app.core.errors import ApiError
from app.core.imageio import read_upload_image
from app.services import detect as svc

router = APIRouter(prefix="/api", tags=["detect"])


@router.post("/detect")
async def detect(
    file: UploadFile = File(None),
    conf: float = Form(0.4),
    iou: float = Form(0.45),
    max_det: int = Form(50),
):
    if file is None:
        raise ApiError("MISSING_FIELD", "이미지 파일(file)이 필요해요", 400)
    if not 0.05 <= conf <= 0.95:
        raise ApiError("INVALID_PARAM", "민감도(conf)는 0.05~0.95 사이여야 해요", 400)
    if not 0.1 <= iou <= 0.95:
        raise ApiError("INVALID_PARAM", "iou 는 0.1~0.95 사이여야 해요", 400)
    if not 1 <= max_det <= 100:
        raise ApiError("INVALID_PARAM", "max_det 는 1~100 사이여야 해요", 400)
    bgr, width, height = await read_upload_image(file)
    t0 = time.perf_counter()
    dets = await run_inference(svc.detect, bgr, conf, iou)
    dets = dets[:max_det]
    counts = {}
    for d in dets:
        counts[d["label"]] = counts.get(d["label"], 0) + 1
    return {
        "image": {"width": width, "height": height},
        "detections": dets,
        "counts": counts,
        "elapsed_ms": int((time.perf_counter() - t0) * 1000),
    }
