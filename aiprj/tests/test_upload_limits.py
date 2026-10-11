import io
import time

import pytest
from PIL import Image

from tests.conftest import make_png_bytes


def _png(w, h, mode="RGB"):
    buf = io.BytesIO()
    Image.new(mode, (w, h), 0).save(buf, format="PNG", optimize=False)
    return buf.getvalue()


def _post(client, path, data, name="a.png", ctype="image/png"):
    return client.post(path, files={"file": (name, data, ctype)})


def test_decompression_bomb_rejected_before_decode(client):
    big = _png(7000, 7000, "1")  # 49 MP, tiny file
    r = _post(client, "/api/classify", big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "IMAGE_TOO_LARGE"
    huge = _png(13000, 13000, "1")  # 169 MP
    r = _post(client, "/api/detect", huge)
    assert r.status_code == 413 and r.json()["error"]["code"] == "IMAGE_TOO_LARGE"


def test_content_length_limit_early(client):
    r = client.post("/api/classify", files={"file": ("a.png", b"\x89PNG\r\n\x1a\n" + b"0" * (13 * 1024 * 1024), "image/png")})
    assert r.status_code == 413 and r.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_file_too_large_10mb(client):
    r = _post(client, "/api/classify", b"\x89PNG\r\n\x1a\n" + b"0" * (11 * 1024 * 1024))
    assert r.status_code == 413 and r.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_emotion_body_cap(client):
    r = client.post("/api/emotion", content=b'{"text":"' + b"a" * 20000 + b'"}', headers={"content-type": "application/json"})
    assert r.status_code == 413 and r.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_event_loop_not_blocked_by_decode(client):
    # decode runs in threadpool; just make sure a mid-size decode still works end-to-end
    r = _post(client, "/api/classify", _png(3000, 3000), )
    assert r.status_code == 200


@pytest.mark.parametrize("path", ["/api/classify", "/api/detect", "/api/pose", "/api/face/detect"])
@pytest.mark.parametrize("size", [(1, 1), (1600, 1), (1, 1600), (3, 5000)])
def test_tiny_and_extreme_images(client, path, size):
    r = _post(client, path, _png(*size))
    assert r.status_code == 200, (path, size, r.text)


def test_extreme_aspect_classify_fast(client):
    t = time.perf_counter()
    r = _post(client, "/api/classify", _png(1600, 1))
    assert r.status_code == 200 and time.perf_counter() - t < 5


def test_models_status_names(client):
    m = client.get("/api/models/status").json()["models"]
    assert m["classify"]["name"] == "MobileNetV2" and m["face"]["name"] == "YuNet+SFace"
    assert client.get("/api/health").json()["status"] == "ok"


def test_face_sample_has_one_face(client):
    from pathlib import Path
    p = Path(__file__).resolve().parents[1] / "app/static/img/samples/face_a.jpg"
    r = client.post("/api/face/detect", files={"file": ("a.jpg", p.read_bytes(), "image/jpeg")})
    assert len(r.json()["faces"]) == 1
