# 이미지 분류 모델: MobileNetV2 (ONNX, ImageNet-1k)

> CPU 용 경량 이미지 분류. onnx/models 의 MobileNetV2-1.0 fp32 (opset 12) 를 선택. 13.96MB, 입력 3x224x224, 출력 1000 logits (softmax 미적용).

## 핵심 사실

- **선택 모델**: MobileNetV2-1.0 fp32, `mobilenetv2-12.onnx` (ONNX IR opset 12, ONNX 1.9.0 export)
- **로컬 경로**: `models/classification/model.onnx` (git 제외 대상 `models/`)
- **파일 크기**: 13,964,571 bytes (13.96 MB) — 25MB 제한 충족
- **SHA256**: `c0c3f76d93fa3fd6580652a45618618a220fced18babf65774ed169de0432ad5`
- **다운로드 URL (HEAD 200 / 실제 GET 검증 완료, 2026-10-10)**:
  `https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx`
- **라이선스**: Apache-2.0 (onnx/models 저장소 `mobilenet/README.md` 의 License 섹션 기준)
- **정확도**: ImageNet val Top-1 69.48%, Top-5 89.26% (동 README 표, fp32 v12 행)
- **라벨**: `models/classification/labels.txt` — 1000줄, 영어, torchvision 클래스 인덱스 순서.
  출처 `https://raw.githubusercontent.com/pytorch/hub/master/imagenet_classes.txt` (10,472 bytes, 1000 항목, 마지막 줄 개행 없음). 라벨 원본 라이선스는 (미확인).
- **한국어 라벨 (`labels_ko.txt`)**: 신뢰할 만한 기성 번역 소스를 찾지 못해 **생성하지 않음** (미확인 소스로 번역하지 않는다는 원칙).

### I/O 스펙 (onnxruntime 1.31.0 로 실제 inspect)

| 구분 | 이름 | shape | dtype |
|---|---|---|---|
| 입력 | `input` | `[batch_size, 3, 224, 224]` (NCHW, batch 동적) | float32 |
| 출력 | `output` | `[batch_size, 1000]` | float32 |

- **softmax 여부**: 출력은 **raw logits** (랜덤 입력 기준 min -5.04, max 5.43, 합 0.025). softmax 는 호출 측에서 직접 적용.
- **채널 순서**: RGB (BGR 아님).

### 전처리 (onnx/models `imagenet_preprocess.py` 및 README 기준)

1. RGB 로 로드, 값 범위 [0, 1] 로 스케일 (`/255`)
2. 짧은 변을 **256** 으로 aspect 유지 리사이즈 (bilinear)
3. 중앙 **224x224** crop
4. 채널별 정규화: mean = `[0.485, 0.456, 0.406]`, std = `[0.229, 0.224, 0.225]`
5. HWC -> CHW, 배치 차원 추가, float32

### 후처리

- `softmax(logits)` -> 내림차순 정렬 -> `labels.txt[index]` 로 라벨 매핑.

## 검증 결과

- 로컬 `.venv` (Python 3.12, onnxruntime 1.31.0, CPUExecutionProvider) 에서 로드 및 추론 성공.
- 테스트 이미지 `pytorch/hub` 의 `images/dog.jpg` (1546x1213) 입력 -> Top-1 `Samoyed` 0.8303, Top-2 `Pomeranian` 0.0699. 라벨 순서 정합성 확인.
- 정확도 자체는 재측정하지 않았음 (README 수치 인용).

## 추론 스니펫 (10줄, 실제 테스트 완료)

```python
import numpy as np, onnxruntime as ort; from PIL import Image
sess = ort.InferenceSession("models/classification/model.onnx", providers=["CPUExecutionProvider"])
labels = [l.strip() for l in open("models/classification/labels.txt", encoding="utf-8")]
img = Image.open("dog.jpg").convert("RGB"); s = 256 / min(img.size)
img = img.resize((round(img.width*s), round(img.height*s)), Image.BILINEAR)
l, t = (img.width-224)//2, (img.height-224)//2
x = (np.asarray(img.crop((l,t,l+224,t+224)), np.float32)/255 - [0.485,0.456,0.406]) / [0.229,0.224,0.225]
x = x.transpose(2,0,1)[None].astype(np.float32)
z = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]; p = np.exp(z-z.max()); p /= p.sum()
for i in p.argsort()[::-1][:5]: print(f"{labels[i]:30s} {p[i]:.4f}")
```

실행 위치는 프로젝트 루트 (`models/...` 상대경로). `.venv\Scripts\python` 으로 실행.

## 대안 검토

| 후보 | 크기 | 결과 |
|---|---|---|
| MobileNetV2-1.0 int8 (`mobilenetv2-12-int8.onnx`) | 3.5 MB | Top-1 68.30%. 더 작고 빠르나 양자화 (QDQ) 설정 필요, 정확도 -1.2%p. 후속 최적화 후보 |
| MobileNetV2-1.0 qdq (`mobilenetv2-12-qdq.onnx`) | 3.4 MB | Top-1 67.40%. int8 보다 정확도 낮음 |
| MobileNetV2-7 (`mobilenetv2-7.onnx`) | 13.5 MB | Top-1 70.94%, opset 7 (ONNX 1.2.1). 정확도는 더 높으나 구형 opset 이라 미채택. 정확도 우선 시 교체 후보 |
| MobileNetV2-10 (`mobilenetv2-10.onnx`) | 13.3 MB | Top-1 70.94%, opset 10 (ONNX 1.5.0). 정확도 우선 시 교체 후보. 최신 opset 인 v12 를 채택 |

- MobileNetV3 / EfficientNet-Lite 등은 이 단계에서 미조사 (미확인).
- v7 / v10 의 정확도 표기는 onnx/models README 의 표 기재값이며 재검증하지 않음.

## 함정 / 메모

- onnx/models 저장소는 Git LFS 를 쓰지만 `github.com/.../raw/main/...` URL 은 실제 바이너리로 리다이렉트되어 바로 받을 수 있음 (Content-Length 13964571 확인).
- 모델 출력이 logits 이므로 softmax 누락 시 확률이 이상하게 나옴 (합이 1 이 아님).
- 입력은 **반드시 224x224**, 정규화 값을 빼먹으면 Top-1 이 크게 떨어짐.

## 출처

- ONNX Model Zoo MobileNet README: `https://raw.githubusercontent.com/onnx/models/main/validated/vision/classification/mobilenet/README.md` (2026-10-10 조회)
- 전처리 코드: `https://raw.githubusercontent.com/onnx/models/main/validated/vision/classification/imagenet_preprocess.py` (2026-10-10 조회)
- 라벨: `https://raw.githubusercontent.com/pytorch/hub/master/imagenet_classes.txt`
- 테스트 이미지: `https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg`

## 관련 [[링크]]

- [wiki/index.md](../index.md)
- [001 아키텍처 결정](../decisions/001-architecture.md)
