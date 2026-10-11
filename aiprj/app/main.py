import importlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.errors import register_error_handlers
from app.core.paths import STATIC_DIR
from app.core.runtime import RequestSizeLimitMiddleware, start_warmup
from app.routers import pages, system

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_app):
    try:
        start_warmup()  # background thread; never blocks boot
    except Exception:  # noqa: BLE001
        log.exception("could not start model warm-up")
    yield


app = FastAPI(title="AI 놀이터", version="0.1.0", lifespan=lifespan)
app.add_middleware(RequestSizeLimitMiddleware)
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
register_error_handlers(app)
app.include_router(pages.router)
app.include_router(system.router)

for _name in ("classify", "detect", "pose", "face", "emotion"):
    try:
        app.include_router(importlib.import_module(f"app.routers.{_name}").router)
    except Exception:  # noqa: BLE001
        log.error("router '%s' failed to load (its endpoints will 404)", _name, exc_info=True)
