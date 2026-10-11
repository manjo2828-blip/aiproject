import pytest
from fastapi.testclient import TestClient

CASES = [
    ("오늘 드디어 합격 소식을 들었어!", "기쁨"),
    ("친구가 나한테 거짓말을 해서 너무 화가 나.", "분노"),
    ("밤마다 미래가 걱정돼서 잠이 안 와.", "불안"),
    ("갑자기 사람들 앞에서 넘어져서 너무 창피하고 당황스러웠어.", "당황"),
    ("키우던 강아지가 죽어서 너무 슬퍼.", "슬픔"),
    ("오늘 회의는 3시에 시작합니다.", "중립"),
]


@pytest.fixture(scope="module")
def client():
    try:
        from app.main import app
    except ImportError:
        from fastapi import FastAPI
        from app.routers.emotion import router
        app = FastAPI()
        from app.core.errors import register_error_handlers
        register_error_handlers(app)
        app.include_router(router)
    return TestClient(app)


@pytest.mark.parametrize("text,label", CASES)
def test_labels(client, text, label):
    r = client.post("/api/emotion", json={"text": text})
    assert r.status_code == 200
    j = r.json()
    assert j["label"] == label
    assert j["scores"] == sorted(j["scores"], key=lambda d: -d["score"])
    assert abs(sum(d["score"] for d in j["scores"]) - 1) < 0.01
    assert -1 <= j["sentiment"] <= 1 and isinstance(j["elapsed_ms"], int)


def test_sentiment_sign(client):
    assert client.post("/api/emotion", json={"text": CASES[0][0]}).json()["sentiment"] > 0.5
    assert client.post("/api/emotion", json={"text": CASES[4][0]}).json()["sentiment"] < 0


def test_form_field(client):
    assert client.post("/api/emotion", data={"text": CASES[0][0]}).status_code == 200


@pytest.mark.parametrize("body,status,code", [
    ({"text": "   "}, 422, "TEXT_EMPTY"),
    ({"text": "가" * 501}, 422, "TEXT_TOO_LONG"),
    ({}, 400, "MISSING_FIELD"),
])
def test_errors(client, body, status, code):
    r = client.post("/api/emotion", json=body)
    assert r.status_code == status
    e = r.json()["error"]
    assert e["code"] == code and e["message"]


def test_service_status():
    from app.services import emotion
    s = emotion.status()
    assert s["name"] == "emotion" and s["file_exists"] and s["size_mb"] > 50
