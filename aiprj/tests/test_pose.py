from pathlib import Path

import cv2
import pytest

SAMPLES = Path(__file__).resolve().parents[1] / "app" / "static" / "img" / "samples"
SAMPLE = SAMPLES / "street.jpg"
needs_sample = pytest.mark.skipif(not SAMPLE.exists(), reason="sample photo missing")


def _person(over):
    from app.services import pose as svc
    kps = {n: (100.0, 200.0) for n in svc.KEYPOINT_NAMES}
    kps.update({"nose": (100, 50), "left_shoulder": (80, 100), "right_shoulder": (120, 100),
                "left_wrist": (80, 200), "right_wrist": (120, 200), "left_hip": (85, 200),
                "right_hip": (115, 200), "left_knee": (85, 300), "right_knee": (115, 300)})
    kps.update(over)
    return {"keypoints": [{"name": n, "x": kps[n][0], "y": kps[n][1], "score": 0.9}
                          for n in svc.KEYPOINT_NAMES]}


def test_guess_pose():
    from app.services.pose import guess_pose
    assert guess_pose(_person({}))["key"] == "standing"
    assert guess_pose(_person({"left_wrist": (80, 10), "right_wrist": (120, 10)}))["key"] == "cheer"
    assert guess_pose(_person({"left_wrist": (80, 10)}))["key"] == "one_hand_up"
    assert guess_pose(_person({"left_wrist": (-100, 100), "right_wrist": (300, 100)}))["key"] == "t_pose"
    assert guess_pose(_person({"left_knee": (85, 240), "right_knee": (115, 240)}))["key"] == "sitting"


@needs_sample
def test_service_bus():
    from app.services import pose as svc
    img = cv2.imread(str(SAMPLE))
    h, w = img.shape[:2]
    people = svc.estimate(img)
    assert len(people) >= 3
    for p in people:
        assert len(p["keypoints"]) == 17
        x1, y1, x2, y2 = p["bbox"]
        assert 0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h
    assert svc.status()["ready"]


@needs_sample
def test_endpoint_bus(client):
    with open(SAMPLE, "rb") as f:
        r = client.post("/api/pose", files={"file": ("bus.jpg", f, "image/jpeg")})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["people"]) >= 3 and len(j["edges"]) == 16 and len(j["keypoint_names"]) == 17
    assert j["people"][0]["guess"]["key"]


def test_endpoint_bad(client, png_bytes):
    r = client.post("/api/pose", files={"file": ("a.png", png_bytes, "image/png")}, data={"conf": "5"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_PARAM"
    r = client.post("/api/pose", files={"file": ("a.txt", b"nope", "text/plain")})
    assert r.status_code == 400
