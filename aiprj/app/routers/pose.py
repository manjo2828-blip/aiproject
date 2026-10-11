import time

from fastapi import APIRouter, File, Form, UploadFile
from app.core.runtime import run_inference

from app.core.errors import ApiError
from app.core.imageio import read_upload_image
from app.services import pose as svc

router = APIRouter(prefix="/api", tags=["pose"])


@router.post("/pose")
async def pose(file: UploadFile = File(...), conf: float = Form(0.3)):
    if not 0.05 <= conf <= 0.95:
        raise ApiError("INVALID_PARAM", "conf 는 0.05~0.95 사이여야 해요", 400)
    bgr, width, height = await read_upload_image(file)
    t0 = time.perf_counter()
    people = await run_inference(svc.estimate, bgr, conf)
    for p in people:
        p["guess"] = svc.guess_pose(p)
    return {
        "image": {"width": width, "height": height},
        "keypoint_names": svc.KEYPOINT_NAMES,
        "edges": svc.SKELETON,
        "people": people,
        "elapsed_ms": int((time.perf_counter() - t0) * 1000),
    }
