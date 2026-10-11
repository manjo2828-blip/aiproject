# 한국어 감정분류 모델

> MelissaJ/koelectra-emotion-7-emotion-base-onnx 를 int8 동적 양자화 → models/emotion/model.onnx (114MB, CPU 문장당 ~8ms). 런타임은 onnxruntime + tokenizers + numpy 만.

## 핵심 사실 (2026-10-10)
- **선택**: [MelissaJ/koelectra-emotion-7-emotion-base-onnx](https://huggingface.co/MelissaJ/koelectra-emotion-7-emotion-base-onnx) (apache-2.0, 공개, KoELECTRA-base-v3 파인튜닝, AI Hub 감성대화말뭉치 + 중립 데이터). 원본 fp32 452MB 를 `onnxruntime.quantization.quantize_dynamic(QInt8)` 로 **113.7MB** 로 축소(임시 venv 에서 변환, torch 불필요 — 원본이 이미 ONNX).
- **라벨(7, 순서=logit 인덱스)**: 0 기쁨, 1 분노, 2 상처, 3 불안, 4 당황, 5 슬픔, 6 중립 → `models/emotion/labels.json`
- 원본 성능(val): acc 0.6745, f1_macro 0.670. 상처/슬픔/불안 경계가 흐림(f1 ~0.5); 최상위 확률 <0.5 이면 판단 보류 권장. 반말 구어 평서문 중립은 기쁨으로 오분류 가능.
- **전처리**: `tokenizers.Tokenizer.from_file("tokenizer.json")`, `enable_truncation(128)` (max_len 128, 패딩 불필요—배치 1). 입력 3개 모두 int64: `input_ids`, `attention_mask`, `token_type_ids`(필수, enc.type_ids). 출력 `logits[1,7]` → softmax.
- 파일: models/emotion/{model.onnx(int8), tokenizer.json, labels.json, config.json}

## 대안 조사 결과 (더 가벼운 감정 모델은 없음)
- HF 에 koelectra-small / kcelectra-small / distilkobert 기반 **감정(다중) 분류 파인튜닝 공개 모델 없음** (small 은 nsmc 긍/부정 `monologg/koelectra-small-finetuned-sentiment`(2클래스), apeach(혐오) 등뿐). KcELECTRA-small multi (sungjun83) 는 LABEL_0..7 로 라벨 미문서화, pytorch bin 만.
- `circulus/koelectra-emotion-v1`(base, 450MB pytorch, 다운로드 많음), `jeongyoonhuh/koelectra-emotion-6class`(base 450MB safetensors), `Jinuuuu/KoELECTRA_fine_tunning_emotion`(MIT, base) — 전부 base 크기라 변환 필요.
- `searle-j/kote_for_easygoing_people`(KOTE 44라벨, roberta급, 미확인 크기) — 라벨이 많아 UI 용도엔 과함.
- `slwdcing/korean-sentiment-onnx-int8`(126MB) — 감정 아닌 긍/부정, 라이선스 미표기.
- 더 작게 필요하면: koelectra-small-v3-discriminator(monologg, ~55MB int8 예상)를 감성대화말뭉치로 직접 파인튜닝 (미수행).

## 검증 추론 코드 (프로젝트 .venv: onnxruntime 1.31, tokenizers 0.23.3, numpy)
```python
import json, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
d = "models/emotion/"
tok = Tokenizer.from_file(d + "tokenizer.json"); tok.enable_truncation(128)
labels = json.load(open(d + "labels.json", encoding="utf-8"))
sess = ort.InferenceSession(d + "model.onnx", providers=["CPUExecutionProvider"])
def classify(text):
    e = tok.encode(text)
    z = sess.run(None, {"input_ids": np.array([e.ids], dtype=np.int64),
                        "attention_mask": np.array([e.attention_mask], dtype=np.int64),
                        "token_type_ids": np.array([e.type_ids], dtype=np.int64)})[0][0]
    p = np.exp(z - z.max()); p /= p.sum()
    return sorted(zip(labels, p.tolist()), key=lambda x: -x[1])
```
결과 (int8, CPU, 문장당 6~10ms):
| 입력 | top1 | top2 |
|---|---|---|
| 오늘 드디어 합격 소식을 들었어! | 기쁨 0.997 | 불안 0.001 |
| 친구가 나한테 거짓말을 해서 너무 화가 나. | 분노 0.375 | 상처 0.293 |
| 밤마다 미래가 걱정돼서 잠이 안 와. | 불안 0.606 | 상처 0.187 |
| 갑자기 사람들 앞에서 넘어져서 너무 창피하고 당황스러웠어. | 당황 0.969 | 불안 0.012 |
| 키우던 강아지가 죽어서 너무 슬퍼. | 슬픔 0.687 | 상처 0.139 |
| 오늘 회의는 3시에 시작합니다. | 중립 1.000 | - |

## 함정
- Windows 콘솔(cp949)에서 한글 print 가 깨짐 → `PYTHONIOENCODING=utf-8` 또는 파일로 출력. labels.json 은 UTF-8.
- 양자화 시 numpy import 실패는 스크래치 디렉터리의 `inspect.py` 가 stdlib 을 가려서였음 → 변환 스크립트는 깨끗한 디렉터리에서 `python -I`.
- int8 양자화로 확률이 약간 변동(분노 문장 0.375 처럼 낮아질 수 있음); fp32 와의 정확도 비교는 미수행.

## 출처
- https://huggingface.co/MelissaJ/koelectra-emotion-7-emotion-base-onnx , https://huggingface.co/monologg/koelectra-base-v3-discriminator

## 관련
[[index]]
