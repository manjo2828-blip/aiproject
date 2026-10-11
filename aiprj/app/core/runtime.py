"""Shared runtime helpers: global inference concurrency limit, request-size middleware, warm-up."""
import logging
import os
import threading

from starlette.concurrency import run_in_threadpool

from app.core.errors import ApiError

log = logging.getLogger("app.runtime")

MAX_REQUEST_BYTES = 12 * 1024 * 1024  # multipart image uploads (files are capped at 10MB)
MAX_JSON_BYTES = 16 * 1024  # /api/emotion body

_INFER = threading.BoundedSemaphore(max(1, min(2, (os.cpu_count() or 2) // 2)))


def _guarded(fn, *args):
    with _INFER:
        return fn(*args)


async def run_inference(fn, *args):
    """run_in_threadpool + global cap on simultaneous inferences (all routers use this)."""
    return await run_in_threadpool(_guarded, fn, *args)


class RequestSizeLimitMiddleware:
    """Pure ASGI: reject oversized /api bodies early (Content-Length) and while streaming."""

    def __init__(self, app):
        self.app = app

    @staticmethod
    def _limit(path: str) -> int:
        return MAX_JSON_BYTES if path.rstrip("/") == "/api/emotion" else MAX_REQUEST_BYTES

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)
        limit = self._limit(scope["path"])
        too_big = ApiError("FILE_TOO_LARGE", "요청이 너무 커요", 413)
        clen = dict(scope["headers"]).get(b"content-length")
        if clen is not None:
            try:
                if int(clen) > limit:
                    return await self._reject(scope, receive, send)
            except ValueError:
                pass
        seen = 0

        async def limited_receive():
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > limit:
                    raise too_big
            return msg

        await self.app(scope, limited_receive, send)

    @staticmethod
    async def _reject(scope, receive, send):
        from fastapi.responses import JSONResponse

        resp = JSONResponse(
            status_code=413,
            content={"error": {"code": "FILE_TOO_LARGE", "message": "요청이 너무 커요 (사진은 최대 10MB)"}},
            headers={"Connection": "close"},
        )
        await resp(scope, receive, send)


warmup_running = False


def _warm_all():
    global warmup_running
    import importlib

    steps = [("classify", "_load"), ("detect", "_load"), ("pose", "_get_session"),
             ("face", "_get_detector"), ("face", "_get_recognizer"), ("emotion", "_load")]
    try:
        for mod, fn in steps:
            try:
                m = importlib.import_module(f"app.services.{mod}")
                if mod == "face" and fn == "_get_detector":
                    with m._lock:
                        m._get_detector()
                else:
                    getattr(m, fn)()
            except Exception as e:  # noqa: BLE001
                log.warning("warm-up %s.%s skipped: %s", mod, fn, e)
    finally:
        warmup_running = False


def start_warmup() -> None:
    global warmup_running
    warmup_running = True
    threading.Thread(target=_warm_all, name="model-warmup", daemon=True).start()
