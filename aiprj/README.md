# 🎪 AI 놀이터

경량 모델 5종(이미지 분류 / 객체 검출 / 포즈 / 얼굴 비교 / 한국어 감정)을 FastAPI + Jinja2 로 묶은 CPU 전용 웹사이트.

## 실행
```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python scripts\download_models.py      # 모델 가중치 (이미 있으면 건너뜀)
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```
http://localhost:8000 — 테스트: `.venv\Scripts\python -m pytest tests -q` (브라우저 E2E는 `requirements-dev.txt` + 시스템 Edge, 서버 기동 필요)

## 모델 / 라이선스
| 기능 | 모델 | 라이선스 |
|---|---|---|
| 분류 | MobileNetV2 (ONNX) | Apache-2.0 |
| 검출 | YOLOX-tiny | Apache-2.0 |
| 포즈 | YOLOv8n-pose | **AGPL-3.0** (공개 배포 시 주의) |
| 얼굴 | YuNet + SFace | MIT / Apache-2.0 |
| 감정 | KoELECTRA-base int8 (7감정) | Apache-2.0 |

상세 설계·리서치는 `wiki/`, 진행 이력은 `HISTORY.md`, 현재 상태는 `STATS.md`.
