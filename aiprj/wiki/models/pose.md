# Pose estimation: YOLOv8n-pose (ONNX)

> 다중 인물 2D pose, COCO 17 keypoints, CPU onnxruntime, 13.5MB. 라이선스 AGPL-3.0 주의.

## 핵심 사실 (2026-10-10 검증)

- **선택 모델**: Ultralytics YOLOv8n-pose, Xenova 변환 ONNX (transformers.js 용 export, 원본 가중치 그대로)
- **파일**: `models/pose/model.onnx`, 13,484,153 bytes (약 12.9MB), sha256 `04f6d2416266f2aba6c5ba8b26de33ed9eba3279f972ac02e33f9f1366547586`
- **다운로드 URL** (GET 으로 실제 다운로드 검증, HTTP 302 -> CDN 200):
  `https://huggingface.co/Xenova/yolov8n-pose/resolve/main/onnx/model.onnx`
- **HF repo**: `Xenova/yolov8n-pose` (sha `da4224085e2f6ce4c9ff9b670e28765194619db2`, 2025-08-18 갱신)
- **라이선스**: AGPL-3.0 (HF 카드 및 ONNX 메타데이터 `license` 모두 명시). 웹사이트로 네트워크 서비스 시 소스 공개 의무가 생길 수 있음 (미확인: 법적 해석은 별도 검토 필요).
- **메타데이터**: producer `pytorch`, Ultralytics 8.2.2, task `pose`, kpt_shape `[17, 3]`, names `{0: 'person'}`, imgsz `[640, 640]`, stride 32
- **onnxruntime**: 1.31.0 (CPUExecutionProvider) 에서 로딩 및 추론 확인.
- **대안 후보**: `Xenova/yolov8s-pose` (HTTP 200, 더 큼, 미다운로드), `Xenova/movenet-singlepose-lightning` (HTTP 200, 단일 인물, 미다운로드, 라이선스 미확인)

## I/O 스펙

- 입력: name `images`, shape `[1, 3, 640, 640]`, float32, RGB, 0~1 정규화 (mean/std 없음), NCHW
- 출력: name `output0`, shape `[1, 56, 8400]`, float32
  - 행 0-3: 박스 `cx, cy, w, h` (입력 640x640 픽셀 좌표)
  - 행 4: person confidence (sigmoid 적용 완료, 0~1)
  - 행 5-55: keypoint 17개 x `(x, y, visibility)`, x/y 는 입력 픽셀 좌표, visibility 는 0~1 (테스트에서 0.002~0.99 범위 확인)
- 전처리: letterbox. 비율 유지 리사이즈 후 640x640 중앙 배치, 패딩 색 `(114,114,114)`. 역변환 `(x - padx) / r`.
- 후처리: confidence > 0.25 필터 -> 클래스 1개이므로 class-agnostic greedy NMS (IoU 0.45) -> 원본 좌표 복원.

### COCO 17 keypoints (인덱스 순서)

| idx | name | idx | name |
|---|---|---|---|
| 0 | nose | 9 | left_wrist |
| 1 | left_eye | 10 | right_wrist |
| 2 | right_eye | 11 | left_hip |
| 3 | left_ear | 12 | right_hip |
| 4 | right_ear | 13 | left_knee |
| 5 | left_shoulder | 14 | right_knee |
| 6 | right_shoulder | 15 | left_ankle |
| 7 | left_elbow | 16 | right_ankle |
| 8 | right_elbow | | |

### 스켈레톤 edge 목록 (0-based, 19개)

```
[(15,13),(13,11),(16,14),(14,12),(11,12),(5,11),(6,12),(5,6),(5,7),(6,8),
 (7,9),(8,10),(1,2),(0,1),(0,2),(1,3),(2,4),(3,5),(4,6)]
```
(Ultralytics pose 스켈레톤 관례. 테스트 이미지에서 시각적으로 정렬 확인, 원본 소스 코드 대조는 미확인)

## 디코드 스니펫 (numpy, 테스트 완료)

테스트: `scratch/pose_test.py`, 샘플 이미지 1280x720, 두 인물 (ultralytics yolov5 repo 의 zidane.jpg). 검출 3건: score 0.892, 0.877 (두 인물, 육안 확인 일치), 0.266 (미확인: 오검출 여부 불명). 스켈레톤 좌표 정렬 육안 확인.

```python
import numpy as np

def decode(out, r, padx, pady, conf_t=0.25, iou_t=0.45):
    # out: (1,56,8400) from output0, r/padx/pady from letterbox preprocess
    p = out[0].T                                   # 8400 x 56
    p = p[p[:, 4] > conf_t]
    if len(p) == 0:
        return []
    cx, cy, w, h = p[:, 0], p[:, 1], p[:, 2], p[:, 3]
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], 1)
    kpts = p[:, 5:].reshape(-1, 17, 3)             # x, y (input px), visibility
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    order, picked = p[:, 4].argsort()[::-1], []
    while len(order):                              # greedy NMS
        i, rest = order[0], order[1:]
        picked.append(i)
        ix1 = np.maximum(boxes[i, 0], boxes[rest, 0]); iy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        ix2 = np.minimum(boxes[i, 2], boxes[rest, 2]); iy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
        iou = inter / (area[i] + area[rest] - inter + 1e-9)
        order = rest[iou <= iou_t]
    res = []
    for i in picked:
        k = kpts[i].copy()
        k[:, 0] = (k[:, 0] - padx) / r             # back to original image px
        k[:, 1] = (k[:, 1] - pady) / r
        b = (boxes[i] - [padx, pady, padx, pady]) / r
        res.append({"box": b, "score": float(p[i, 4]), "kpts": k})
    return res
```

전처리 (테스트에 사용한 것):

```python
x = np.asarray(canvas640, np.float32).transpose(2, 0, 1)[None] / 255.0  # canvas640: RGB PIL 640x640 letterboxed
out = sess.run(None, {"images": x})[0]
```

## 함정

- 클래스가 `person` 1개뿐이라 출력에 class 열이 없음 (56 = 4 + 1 + 51). 다른 클래스 가정 금지.
- 박스/키포인트 좌표 모두 letterbox 입력 기준 픽셀이므로 반드시 역변환 후 사용.
- visibility 열은 "가시성" 점수이며 0.5 이상만 그릴 것을 권장 (테스트 코드 기준).
- 입력 크기를 바꾸면 출력 앵커 수(8400)가 바뀜 (640 기준 고정 export).
- AGPL-3.0: 배포/서비스 전 라이선스 검토 필요.

## 출처

- HF 모델 카드 / API: https://huggingface.co/Xenova/yolov8n-pose (2026-10-10 조회)
- ONNX 메타데이터 (내장): description "Ultralytics YOLOv8n-pose model trained on coco-pose", version 8.2.2
- 검증: onnxruntime 1.31.0 로딩/추론, 샘플 이미지 디코드 (scratch 디렉터리)

## 관련

- [[index]]
- [[../README]] (wiki 규칙)
