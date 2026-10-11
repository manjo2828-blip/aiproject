from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import register_error_handlers
from app.routers.face import router
from app.services import face as svc

IMGS = Path(__file__).resolve().parents[1] / "app" / "static" / "img" / "samples"


def _p(n):
    p = IMGS / f"{n}.jpg"
    if not p.exists():
        pytest.skip(f"missing sample {p}")
    return p


@pytest.fixture(scope="module")
def client():
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router)
    return TestClient(app)


def _f(n):
    return (f"{n}.jpg", _p(n).read_bytes(), "image/jpeg")


def test_similarity_mapping_monotonic():
    xs = np.linspace(-1, 1, 201)
    ys = [svc.similarity_percent(x) for x in xs]
    assert all(b >= a for a, b in zip(ys, ys[1:]))
    assert ys[0] == 0 and ys[-1] == 100
    assert svc.similarity_percent(0.2) <= 30 and svc.similarity_percent(0.9) >= 85


def test_detect(client):
    r = client.post("/api/face/detect", files={"file": _f("face_a")})
    assert r.status_code == 200
    j = r.json()
    assert len(j["faces"]) >= 1
    f = j["faces"][0]
    assert len(f["bbox"]) == 4 and len(f["landmarks"]) == 5
    assert f["landmarks"][0][0] < f["landmarks"][1][0]
    assert j["image"]["width"] > 0 and "elapsed_ms" in j


def test_detect_no_face_is_200(client):
    ok, buf = cv2.imencode(".jpg", np.full((200, 200, 3), 128, np.uint8))
    r = client.post("/api/face/detect", files={"file": ("x.jpg", buf.tobytes(), "image/jpeg")})
    assert r.status_code == 200 and r.json()["faces"] == []


def test_detect_missing_and_bad_param(client):
    assert client.post("/api/face/detect").status_code == 400
    r = client.post("/api/face/detect", files={"file": _f("face_a")}, data={"conf": "5"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_PARAM"


def test_compare_same_vs_different(client):
    r = client.post("/api/face/compare", files={"file_a": _f("face_a"), "file_b": _f("face_a")})
    assert r.status_code == 200
    j = r.json()
    assert j["same_person"] is True and j["similarity_percent"] >= 95
    assert j["a"]["num_faces"] >= 1
    r = client.post("/api/face/compare", files={"file_a": _f("face_a"), "file_b": _f("face_b")})
    j = r.json()
    assert j["same_person"] is False and j["similarity_percent"] <= 40


def test_compare_no_face_names_side(client):
    ok, buf = cv2.imencode(".jpg", np.full((200, 200, 3), 128, np.uint8))
    r = client.post(
        "/api/face/compare",
        files={"file_a": _f("face_a"), "file_b": ("x.jpg", buf.tobytes(), "image/jpeg")},
    )
    assert r.status_code == 422
    e = r.json()["error"]
    assert e["code"] == "NO_FACE" and "B" in e["message"]


def test_compare_missing(client):
    r = client.post("/api/face/compare", files={"file_a": _f("face_a")})
    assert r.status_code == 400


def test_status():
    s = svc.status()
    assert s["name"] == "face" and s["file_exists"] and s["size_mb"] > 30
