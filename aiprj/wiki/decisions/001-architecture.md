# 001 아키텍처
> CPU 전용 경량 추론, ONNX Runtime 우선, FastAPI + Jinja2 SSR + 바닐라 JS.

## 결정
- 추론 런타임: **onnxruntime (CPU)** 우선 → torch 의존성 최소화 (설치 용량/속도). 한국어 NLP 만 필요시 transformers/optimum.
- 얼굴: OpenCV Zoo (YuNet 검출 + SFace 인식) — opencv-python 의 FaceDetectorYN / FaceRecognizerSF.
- 서비스는 lazy-load 싱글톤. 라우터는 `/api/<model>/...`, 페이지는 `/<model>`.
- 가중치는 `models/` 에 `scripts/download_models.py` 로 받음.
- 프론트: Jinja2 base 템플릿 + 바닐라 JS + canvas 오버레이(박스/스켈레톤).

## 이유
설치 가볍고 Windows 에서 안정적, GPU 불필요.
