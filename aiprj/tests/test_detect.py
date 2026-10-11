from pathlib import Path

import cv2
import pytest

SAMPLES = Path(__file__).resolve().parents[1] / "app" / "static" / "img" / "samples"
SAMPLE = SAMPLES / "street.jpg"
pytestmark = pytest.mark.skipif(not SAMPLE.exists(), reason="sample photo missing")


def test_service_bus():
    from app.services import detect as svc
    img = cv2.imread(str(SAMPLE))
    h, w = img.shape[:2]
    dets = svc.detect(img, conf=0.3)
    labels = [d["label"] for d in dets]
    assert labels.count("person") >= 3
    assert "bus" in labels
    for d in dets:
        x1, y1, x2, y2 = d["bbox"]
        assert 0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h
    assert svc.status()["ready"]


def test_endpoint_bus():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    with open(SAMPLE, "rb") as f:
        r = c.post("/api/detect", files={"file": ("bus.jpg", f, "image/jpeg")}, data={"conf": "0.3"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["image"] == {"width": 810, "height": 1080}
    assert j["counts"].get("person", 0) >= 3 and j["counts"].get("bus") == 1
    with open(SAMPLE, "rb") as f:
        r = c.post("/api/detect", files={"file": ("bus.jpg", f, "image/jpeg")}, data={"conf": "0.99"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_PARAM"
