import time

from fastapi import APIRouter, Request
from app.core.runtime import run_inference

from app.core.errors import ApiError
from app.services import emotion as svc

router = APIRouter(prefix="/api", tags=["emotion"])


@router.post("/emotion")
async def emotion(request: Request):
    ctype = request.headers.get("content-type", "")
    text = None
    if "json" in ctype:  # body size already capped by RequestSizeLimitMiddleware
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            raise ApiError("MISSING_FIELD", "문장을 입력해 주세요", 400)
        if isinstance(body, dict):
            text = body.get("text")
    elif "form" in ctype:
        text = (await request.form()).get("text")
    if text is None or not isinstance(text, str):
        raise ApiError("MISSING_FIELD", "문장을 입력해 주세요", 400)
    t0 = time.perf_counter()
    res = await run_inference(svc.classify, text)
    res["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
    return res
