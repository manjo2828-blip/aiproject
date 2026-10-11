# Wiki Index

## Decisions
- [004 샘플 이미지](decisions/004-sample-images.md) — 샘플 파일 출처·미제공 목록
- [001 아키텍처](decisions/001-architecture.md) — 스택/구조/모델 라우팅 결정
- [002 컨셉/UX/API 계약](decisions/002-concept-ux.md) — "AI 놀이터" 컨셉·팔레트·페이지별 인터랙션·JSON API 계약
- [003 프론트 공통 헬퍼](decisions/003-frontend-helpers.md) — `AP.*` 함수 레퍼런스, picker/결과 카드 HTML 구조, 공통 CSS 클래스

- [리뷰 findings (opus)](raw/review-opus-1.md) — 26건 코드 리뷰 원문

## Models
- [pose: YOLOv8n-pose ONNX](models/pose.md) — 다중 인물 COCO 17 keypoint, 13.5MB, CPU onnxruntime, 입출력/디코드 스니펫 (AGPL-3.0 주의)
- [classification: MobileNetV2-1.0 ONNX](models/classification.md) — ImageNet-1k 1000클래스, 13.96MB, Apache-2.0, 입력 NCHW 224 RGB + ImageNet 정규화, 출력은 logits (softmax 필요)
- [face: YuNet 검출 + SFace 임베딩](models/face.md) — OpenCV Zoo ONNX 두 개(227KB + 36.9MiB), cv2.FaceDetectorYN/FaceRecognizerSF, 128차원, cosine 0.363 / L2 1.128 임계값, MIT + Apache-2.0
- [detection: YOLOX-tiny ONNX](models/detection.md) — COCO 80 클래스, 20.2MB, Apache-2.0, 입력 416 BGR 0~255 (정규화 없음), 출력 raw [1,3549,85] (grid/stride/exp 디코딩 + NMS 직접 구현), numpy 스니펫 검증 완료
- [emotion: KoELECTRA-base 7감정 ONNX int8](models/emotion.md) — 기쁨/분노/상처/불안/당황/슬픔/중립, 113.7MB(fp32 452MB 양자화), apache-2.0, onnxruntime+tokenizers만, 문장당 ~8ms, token_type_ids 필요, max_len 128
