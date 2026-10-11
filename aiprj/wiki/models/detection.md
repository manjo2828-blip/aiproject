# 객체인식 (Object Detection) — YOLOX-tiny ONNX

> COCO 80 클래스, CPU onnxruntime, 모델 20.2MB. 입력 416 고정, 출력은 raw(디코딩 전) 텐서라 numpy 로 grid/stride 디코딩 + NMS 필요. (검증일 2026-10-10)

## 핵심 사실

**최종 선택: YOLOX-tiny (Megvii, ONNX export, 0.1.1rc0 릴리스)**
- 파일: `models/detection/model.onnx` (20,219,662 bytes, 약 19.3MiB, sha256 `427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7`)
- 라벨: `models/detection/labels.txt` (영문 COCO 80, 1줄 1개), `models/detection/labels_ko.txt` (한국어 80, 직접 작성)
- 라이선스: Apache-2.0 (YOLOX 저장소 LICENSE 확인). 상업 사용 가능.
- 다운로드 URL: `https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx` (HTTP 200, Content-Length 와 실제 크기 일치 확인)
- 릴리스: 0.1.1 pre release, 2021-08-18 (GitHub API)
- 정확도: COCO val AP 32.8 (YOLOX 논문/README 값, 재측정 안 함)
- onnxruntime 1.31.0 (CPU) 에서 로드/추론 확인

**대안 (미채택)**
- YOLOX-nano: `.../0.1.1rc0/yolox_nano.onnx`, 3.6MB, 같은 I/O 형식. AP 25.8 로 정확도 낮음. 더 가볍게 필요하면 교체 가능 (입출력 동일 확인).
- YOLOX-s: `.../0.1.1rc0/yolox_s.onnx`, 약 35MB 로 30MB 제한 초과 (미다운로드, 크기는 릴리스 자산 기준 추정).
- OpenCV zoo `object_detection_yolox_2022nov.onnx`: yolox_s 계열로 추정 (미확인, 크기 제한 초과 가능성 높음).
- OpenCV zoo NanoDet: 2022nov 파일 HTTP 200 확인. 출력 구조가 다중 헤드/DFL 이라 디코딩이 더 복잡하여 제외.
- HF `Kalray/yolov8/yolov8n.onnx`: HTTP 200 확인되었으나 미다운로드. YOLOv8 은 AGPL-3.0 (ultralytics) 이므로 라이선스 리스크로 제외.
- HF `Xenova/yolov8n`, `onnx-community/yolov8n`: 401 응답 (접근 불가/게이트), 제외.

**I/O 스펙 (onnxruntime 로 실측)**
| 항목 | 값 |
|---|---|
| 입력 이름 | `images` |
| 입력 shape | `[1, 3, 416, 416]` float32, **고정** (dynamic 아님) |
| 출력 이름 | `output` |
| 출력 shape | `[1, 3549, 85]` float32 |
| NMS | **포함 안 됨** (직접 구현 필요) |
| 박스 디코딩 | **포함 안 됨** (raw 값, 아래 참조) |
| obj / cls 점수 | sigmoid 적용 완료 (0~1) |

**전처리 (실측으로 확인)**
1. letterbox: `r = min(416/h, 416/w)`, 이미지를 `(round)(w*r) x (h*r)` 로 bilinear resize, 416x416 캔버스 **좌상단**에 붙이고 나머지는 값 114 로 채움.
2. 채널 순서 **BGR** (cv2 관례). RGB 로 넣어도 동작은 하지만 점수가 조금 낮음 (0.955 -> 0.943).
3. `/255` 정규화 **하지 않음**. 0~255 float 그대로. `/255` 하면 검출 0개 (실측).
4. HWC -> CHW, batch 차원 추가.

**디코딩 (실측으로 확인, 가장 중요한 함정)**
- 출력의 cx, cy 는 격자 상대 오프셋, w, h 는 log 공간. 그대로 쓰면 박스가 0~10px 로 찌그러짐 (실측에서 이 오류 확인).
- 앵커: stride 8 (52x52=2704), 16 (26x26=676), 32 (13x13=169) 순서로 합계 3549. 각 레벨은 row-major (y 가 바깥, x 가 안쪽).
- 공식: `cx = (x_off + gx) * stride`, `cy = (y_off + gy) * stride`, `w = exp(w_raw) * stride`, `h = exp(h_raw) * stride`.
- 박스 좌표는 letterboxed 416 공간이므로 원본 좌표로 되돌리려면 `/ r`.
- 점수 = obj * cls_prob (클래스별 argmax). 임계값 conf 0.3, NMS IoU 0.45 (YOLOX demo 기본값과 동일 계열).

## 검증 (실측)
- 샘플: ultralytics yolov5 `data/images/bus.jpg` (810x1080, 스크래치 `scratchpad/dl/`, repo 에 저장 안 함).
- 결과 (conf 0.3, IoU 0.45): bus 0.955 `[28,224,802,761]`, person 0.880 `[675,437,811,870]`, person 0.875 `[54,392,224,895]`, person 0.856 `[221,406,350,858]`. 사람 4명 + 버스 1대 (사진 내용과 일치).

## 참고 코드 (실측 통과한 그대로)

```python
import numpy as np
from PIL import Image
import onnxruntime as ort

SIZE = 416

def preprocess(img):
    w, h = img.size
    r = min(SIZE / h, SIZE / w)                         # letterbox ratio
    nw, nh = int(w * r), int(h * r)
    canvas = np.full((SIZE, SIZE, 3), 114, np.float32)  # pad 114, image anchored top-left
    canvas[:nh, :nw] = np.asarray(img.convert("RGB").resize((nw, nh), Image.BILINEAR), np.float32)
    x = canvas[..., ::-1].transpose(2, 0, 1)[None]      # RGB->BGR, HWC->NCHW, NO /255
    return np.ascontiguousarray(x), r

def grid_strides():
    grids, strides = [], []
    for s in (8, 16, 32):                               # 52x52 + 26x26 + 13x13 = 3549 anchors
        n = SIZE // s
        y, x = np.mgrid[:n, :n]
        grids.append(np.stack([x, y], -1).reshape(-1, 2))
        strides.append(np.full(n * n, s))
    return np.concatenate(grids).astype(np.float32), np.concatenate(strides)[:, None].astype(np.float32)

def nms(boxes, scores, thr):
    order, keep = scores.argsort()[::-1], []
    area = lambda b: (b[..., 2] - b[..., 0]) * (b[..., 3] - b[..., 1])
    while order.size:
        i, rest = order[0], order[1:]
        keep.append(i)
        lt = np.maximum(boxes[i, :2], boxes[rest, :2])
        rb = np.minimum(boxes[i, 2:], boxes[rest, 2:])
        inter = np.clip(rb - lt, 0, None).prod(1)
        iou = inter / (area(boxes[i]) + area(boxes[rest]) - inter + 1e-9)
        order = rest[iou <= thr]
    return keep

def decode(out, r, conf=0.3, iou_thr=0.45):
    p = out[0].copy()                                   # (3549, 85), obj & cls already sigmoid
    grid, stride = grid_strides()
    p[:, :2] = (p[:, :2] + grid) * stride               # cx, cy: grid offset * stride
    p[:, 2:4] = np.exp(p[:, 2:4]) * stride              # w, h: log-space
    scores = p[:, 4:5] * p[:, 5:]                       # obj * class prob
    cls, score = scores.argmax(1), scores.max(1)
    m = score > conf
    p, cls, score = p[m], cls[m], score[m]
    boxes = np.concatenate([p[:, :2] - p[:, 2:4] / 2, p[:, :2] + p[:, 2:4] / 2], 1) / r  # to original px
    dets = []
    for c in np.unique(cls):                            # class-wise NMS
        idx = np.where(cls == c)[0]
        for k in nms(boxes[idx], score[idx], iou_thr):
            dets.append((*boxes[idx[k]], score[idx[k]], int(c)))
    return dets

# usage
sess = ort.InferenceSession("models/detection/model.onnx", providers=["CPUExecutionProvider"])
names = [l.strip() for l in open("models/detection/labels.txt", encoding="utf-8") if l.strip()]
x, r = preprocess(Image.open("sample.jpg"))
out = sess.run(None, {"images": x})[0]
for x1, y1, x2, y2, s, c in decode(out, r):
    print(names[c], round(float(s), 3), (x1, y1, x2, y2))
```

## 함정
- 출력은 디코딩 전 raw. grid/stride/exp 를 빼먹으면 박스가 완전히 틀림.
- `/255` 정규화 금지 (이 export 는 0~255 입력 기대).
- 입력 shape 고정 416. 다른 크기는 letterbox 로 맞출 것 (dynamic axes 아님).
- 점수는 이미 sigmoid 됨. 다시 sigmoid 하면 안 됨.
- 원본 좌표 복원은 `/ r` (letterbox 는 좌상단 정렬이므로 offset 보정 불필요).

## 출처
- YOLOX 릴리스 (0.1.1rc0): https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0
- YOLOX 저장소 LICENSE (Apache-2.0): https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE
- 샘플 이미지: https://github.com/ultralytics/yolov5/raw/master/data/images/bus.jpg
- 조사/검증일: 2026-10-10 (onnxruntime 1.31.0, numpy 2.5.3, Windows CPU)

## 관련 [[링크]]
- [wiki/index.md](../index.md)
