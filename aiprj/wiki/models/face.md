# 얼굴 검출·인식 (YuNet + SFace)

> OpenCV Zoo의 ONNX 두 개(YuNet 검출 230KB + SFace 임베딩 37MB)로 CPU에서 얼굴 검출·정렬·128차원 임베딩·매칭을 수행한다. 검증 2026-10-10.

## 핵심 사실

### 모델
| 역할 | 파일 | 크기 | SHA-256 | 라이선스 |
|---|---|---|---|---|
| 얼굴 검출 | `face_detection_yunet_2023mar.onnx` | 232,589 B (~227 KB) | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | MIT (Shiqi Yu, 2020) |
| 얼굴 인식(임베딩) | `face_recognition_sface_2021dec.onnx` | 38,696,353 B (~36.9 MiB) | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | Apache-2.0 |

- 저장 위치: `models/face/` (git 제외 대상, `models/` 규칙 따름)
- SFace 입력 112x112 정렬 얼굴 → 출력 128차원 float32 (shape `(1, 128)`).

### 다운로드 URL (2026-10-10 실제 GET 검증, 302 리다이렉트 후 정상 수신)
- https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
- https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
- 라이선스 원문: `.../models/face_detection_yunet/LICENSE`, `.../models/face_recognition_sface/LICENSE`

### 버전 호환
- 테스트 환경: Python 3.12, `opencv-python-headless 5.0.0.93` (`cv2.__version__ == "5.0.0"`).
- `FaceDetectorYN.create(model, config, input_size, score_threshold, nms_threshold, top_k)` — cv2 5.0 `__doc__` 시그니처 확인, 실행 동작 확인.
- `FaceRecognizerSF.create(model, config)` — 실행 동작 확인. `alignCrop`, `feature`, `match` 존재.
- 4.x 계열 호환성은 미확인 (4.x 실행 테스트 안 함).

### detect() 출력 레이아웃
`_, faces = detector.detect(img)` → `faces` 는 `(N, 15)` float32 또는 검출 없으면 `None`.

| 인덱스 | 값 |
|---|---|
| 0–3 | x, y, w, h (바운딩 박스, 픽셀) |
| 4–5 | 오른쪽 눈 (x, y) |
| 6–7 | 왼쪽 눈 (x, y) |
| 8–9 | 코 끝 (x, y) |
| 10–11 | 오른쪽 입꼬리 (x, y) |
| 12–13 | 왼쪽 입꼬리 (x, y) |
| 14 | score (검출 신뢰도) |

랜드마크는 5점 = 10값(4–13). 점 순서는 OpenCV 문서 기준(눈·코·입꼬리 순).

### 테스트 결과 (샘플 4인, 퍼블릭 도메인 — 위키미디어 커먼즈 NASA 사진 3장 + Schmutzer 1921 에칭 1장)
- 검출: Collins 0.95, Jemison 0.95, Armstrong 0.95, Einstein(에칭) 0.88 → 모두 검출됨 (score_threshold 0.6 사용).
- 같은 얼굴 "자기 자신 crop" 2회 임베딩: cosine = 1.0000.
- 같은 얼굴 원본 vs (밝기 +8, 0.8배 리사이즈 후 재검출·재정렬): cosine 0.878 ~ 0.977 (L2 0.22 ~ 0.49). **"≈1"은 아니며 0.88 이상으로 임계값 0.363 대비 충분히 큼.**
- 다른 사람 6쌍: cosine −0.12 ~ 0.20 (L2 1.26 ~ 1.50). 최대 0.2013 < 0.363.
- 권장 임계값: **cosine ≥ 0.363 이면 동일인** (OpenCV 공식 권장값, 본 테스트에서 분리 확인). **L2 ≤ 1.128 이면 동일인** (OpenCV 공식 권장값; 본 테스트에서 다른 사람 L2 최소 1.26 으로 분리 확인). 임계값은 OpenCV 문서 인용이며 대규모 벤치마크로 재검증하지 않음.

### API 사용 스니펫 (테스트 완료 코드)
```python
import cv2
import numpy as np

DET = "models/face/face_detection_yunet_2023mar.onnx"
REC = "models/face/face_recognition_sface_2021dec.onnx"

detector = cv2.FaceDetectorYN.create(DET, "", (320, 320), 0.6, 0.3, 5000)  # score_thr, nms_thr, top_k
recognizer = cv2.FaceRecognizerSF.create(REC, "")

COSINE_THR = 0.363
L2_THR = 1.128

def detect_top(img_bgr):
    h, w = img_bgr.shape[:2]
    detector.setInputSize((w, h))          # 이미지마다 반드시 호출
    _, faces = detector.detect(img_bgr)
    if faces is None or len(faces) == 0:
        return None
    return faces[np.argmax(faces[:, 14])]  # score 최대 얼굴 (shape (15,))

def embed(img_bgr, face_row):
    aligned = recognizer.alignCrop(img_bgr, face_row.reshape(1, -1))  # 112x112 BGR
    return recognizer.feature(aligned)                                 # (1, 128)

def same_person(feat_a, feat_b):
    cos = recognizer.match(feat_a, feat_b, cv2.FaceRecognizerSF_FR_COSINE)
    l2 = recognizer.match(feat_a, feat_b, cv2.FaceRecognizerSF_FR_NORM_L2)
    return cos, l2, cos >= COSINE_THR   # 또는 l2 <= L2_THR
```

### 함정 (Pitfalls)
- `setInputSize((w, h))` 를 이미지마다 호출해야 함 (생성 시 크기와 다르면 검출 실패/오동작). 주의: 인자는 `(width, height)`.
- `score_threshold` 0.9 는 너무 높음: 에칭/저화질 얼굴(Einstein 1921)이 0.88 이라 검출 안 됨 → 0.6 권장.
- `alignCrop` 에는 검출 행 `(15,)` 을 `(1, 15)` 로 reshape 해서 넘길 것. 원본 이미지와 같은 BGR 이미지를 넘겨야 함 (검출에 쓴 이미지와 동일 좌표계).
- `detect()` 는 얼굴 0개일 때 `faces=None` 반환 → 반드시 체크.
- `feature()` 결과를 정규화 없이 비교할 때는 `match()` 의 `FR_COSINE`(0) / `FR_NORM_L2`(1) 를 명시. 임계값은 타입별로 다름 (cosine 0.363 vs L2 1.128 섞어 쓰지 말 것).
- 같은 사람이라도 밝기/크기 변화에서 cosine 이 0.88 수준으로 떨어짐 → 임계값을 너무 엄격하게 (0.5 이상) 잡지 말 것.
- cv2 5.0 에서 `Targets are not supported by the new graph engine` 경고가 뜸 (target 미지정 기본 호출이라 무해, 결과에 영향 없음).
- SFace 37MB 는 첫 로딩 시간이 있음 → lazy load 싱글톤 권장.

## 출처
- OpenCV Zoo: https://github.com/opencv/opencv_zoo (models/face_detection_yunet, models/face_recognition_sface, 각 README/LICENSE)
- SFace 논문: https://arxiv.org/abs/2205.12010
- 테스트 이미지: Wikimedia Commons — Commander Eileen Collins (NASA GPN-2000-001177, PD), Mae Carol Jemison (PD), Portrait of Neil Armstrong (PD), Albert Einstein etching by Ferdinand Schmutzer 1921 (PD-old-expired). 원본은 저장소 밖(scratchpad)에 보관, 저장소에는 포함 안 함.
- 테스트 스크립트: scratchpad `face_test.py` (저장소 외부).

## 관련 [[링크]]
- [wiki/index.md](../index.md)
- [CLAUDE.md](../../CLAUDE.md) — 얼굴인식 모델 역할

## similarity_percent 매핑 (구현: app/services/face.py)
cosine 구간 선형, 단조/0-100 clamp: 0→0%, 0.2→30%, 0.363(임계값)→60%, 0.88→95%, 1.0→100%.
