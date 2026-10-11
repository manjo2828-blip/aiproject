from pathlib import Path

import cv2
import pytest
from fastapi.testclient import TestClient

SAMPLES = Path(__file__).resolve().parents[1] / "app" / "static" / "img" / "samples"


@pytest.fixture(scope="module")
def dog_path():
    return SAMPLES / "dog.jpg"


@pytest.fixture(scope="module")
def cls_client():
    try:
        from app.main import app
    except ImportError:
        from fastapi import FastAPI
        from app.routers.classify import router
        app = FastAPI()
        app.include_router(router)
    return TestClient(app)


def test_predict_service(dog_path):
    from app.services import classify
    preds = classify.predict(cv2.imread(str(dog_path)), top_k=5)
    assert len(preds) == 5
    assert preds[0]["label"] in ("Samoyed", "Pomeranian", "white wolf", "Arctic fox")
    assert preds[0]["score"] > 0.5
    assert [p["score"] for p in preds] == sorted((p["score"] for p in preds), reverse=True)


def test_endpoint(cls_client, dog_path):
    with open(dog_path, "rb") as f:
        r = cls_client.post("/api/classify", files={"file": ("dog.jpg", f, "image/jpeg")}, data={"top_k": "3"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["predictions"]) == 3
    assert j["image"]["width"] > 0 and isinstance(j["elapsed_ms"], int)
    assert j["predictions"][0]["label"] == "Samoyed"


def test_bad_top_k(cls_client, dog_path):
    with open(dog_path, "rb") as f:
        r = cls_client.post("/api/classify", files={"file": ("dog.jpg", f, "image/jpeg")}, data={"top_k": "99"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "INVALID_PARAM"


def test_status():
    from app.services import classify
    s = classify.status()
    assert s["name"] == "classify" and s["file_exists"] is True
