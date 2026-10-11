import io

import numpy as np
from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.errors import ApiError

MAX_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1600
MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS * 2  # PIL hard-fails above this
_ALLOWED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp", "image/x-ms-bmp"}


def _magic_ok(b: bytes) -> bool:
    return (
        b.startswith(b"\xff\xd8\xff")
        or b.startswith(b"\x89PNG\r\n\x1a\n")
        or (b[:4] == b"RIFF" and b[8:12] == b"WEBP")
        or b[:6] in (b"GIF87a", b"GIF89a")
        or b[:2] == b"BM"
    )


async def read_upload_image(file: UploadFile, field: str = "file") -> tuple[np.ndarray, int, int]:
    if file is None:
        raise ApiError("MISSING_FIELD", f"'{field}' 이미지를 올려 주세요", 400)
    ctype = (file.content_type or "").lower()
    if ctype and ctype != "application/octet-stream" and ctype not in _ALLOWED_TYPES:
        raise ApiError("INVALID_IMAGE", "지원하지 않는 이미지 형식이에요 (jpg/png/webp/gif/bmp)", 400)
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ApiError("FILE_TOO_LARGE", "사진이 너무 커요 (최대 10MB)", 413)
    if not data:
        raise ApiError("MISSING_FIELD", f"'{field}' 이미지를 올려 주세요", 400)
    if not _magic_ok(data):
        raise ApiError("INVALID_IMAGE", "이미지 파일이 아닌 것 같아요", 400)
    return await run_in_threadpool(_decode, data)


def _decode(data: bytes) -> tuple[np.ndarray, int, int]:
    try:
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_PIXELS:  # header-only check, before any pixel decode
            raise ApiError("IMAGE_TOO_LARGE", "사진 해상도가 너무 커요 (최대 약 4천만 화소)", 413)
        if img.format == "JPEG":
            img.draft("RGB", (MAX_SIDE * 2, MAX_SIDE * 2))  # decoder-side downscale (1/2,1/4,1/8)
        img.load()
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
            bg.alpha_composite(img)
            img = bg
        img = img.convert("RGB")
    except ApiError:
        raise
    except Image.DecompressionBombError:
        raise ApiError("IMAGE_TOO_LARGE", "사진 해상도가 너무 커요 (최대 약 4천만 화소)", 413)
    except (UnidentifiedImageError, OSError, ValueError):
        raise ApiError("INVALID_IMAGE", "이미지를 읽을 수 없어요", 400)
    w, h = img.size
    m = max(w, h)
    if m > MAX_SIDE:
        s = MAX_SIDE / m
        img = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.uint8)[:, :, ::-1].copy()  # RGB -> BGR
    h, w = arr.shape[:2]
    return arr, w, h


def to_rgb(bgr: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(bgr[:, :, ::-1])
