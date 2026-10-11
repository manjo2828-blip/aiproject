import importlib

from fastapi import APIRouter

from app.core import runtime

router = APIRouter()
MODEL_NAMES = {"classify": "MobileNetV2", "detect": "YOLOX-tiny", "pose": "YOLOv8n-pose",
               "face": "YuNet+SFace", "emotion": "KoELECTRA-int8"}
NAMES = ["classify", "detect", "pose", "face", "emotion"]


@router.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@router.get("/api/models/status")
async def models_status():
    out = {}
    for n in NAMES:
        try:
            s = importlib.import_module(f"app.services.{n}").status()
            ready = bool(s.get("ready"))
            exists = bool(s.get("file_exists"))
            state = "ready" if ready else (("loading" if runtime.warmup_running else "not_loaded") if exists else "error")
            out[n] = {
                "name": MODEL_NAMES[n],
                "state": state,
                "loaded": ready,
                "error": None if exists else "모델 파일이 없어요",
                "ready": ready,
                "file_exists": exists,
                "size_mb": s.get("size_mb"),
            }
        except Exception as e:  # service missing or broken
            out[n] = {"name": MODEL_NAMES[n], "state": "error", "loaded": False, "error": str(e)[:200],
                      "ready": False, "file_exists": False, "size_mb": None}
    return {"models": out}
