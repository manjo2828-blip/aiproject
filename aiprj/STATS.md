# STATS (최신 상태)

_마지막 갱신: 2026-10-10 — 전체 완료 (72 tests passed)_

## 진행률
| Phase | 내용 | 상태 |
|---|---|---|
| 0 | 하네스 (CLAUDE.md/HISTORY/STATS/wiki/agents) | ✅ 완료 |
| 1 | 모델 리서치 ×5 + venv 설치 + 컨셉/API 계약 (병렬) | ✅ 완료 |
| 2 | 서비스/라우터 ×5 + 코어 + 프론트 (병렬) | ✅ 완료 |
| 3 | 통합 + API 스모크 | ✅ 완료 |
| 4 | 리뷰(opus) + 브라우저 E2E (병렬) | ✅ 완료 |
| 5 | 수정/마무리 | ✅ 완료 |

## 모델 상태
| 모델 | 선정 | 다운로드 | API | UI | 브라우저 테스트 |
|---|---|---|---|---|---|
| 이미지분류 | MobileNetV2 14MB | ✅ | ✅ | ✅ | ✅ |
| 객체인식 | YOLOX-tiny 20MB | ✅ | ✅ | ✅ | ✅ |
| Pose | YOLOv8n-pose 13.5MB (AGPL) | ✅ | ✅ | ✅ | ✅ |
| 얼굴인식 | YuNet+SFace 37MB | ✅ | ✅ | ✅ | ✅ |
| 한국어 감정 | KoELECTRA-base int8 114MB | ✅ | ✅ | ✅ | ✅ |

## 서브에이전트 사용 현황
| 모델 | 호출 수 | 용도 |
|---|---|---|
| haiku 5.5 | 4 | 분류/검출/포즈/얼굴 리서치 |
| sonnet 5.5 | 14 | 감정 리서치 + 개발 8 + E2E + Phase5 수정 3 (+메인) |
| opus 5.5 | 1 | 전체 코드 리뷰 |
| fable 5.1 | 1 | 컨셉/UX/API 계약 |

## 진행 중: 객체검출 모델 벤치마크 (bench/)
- 어댑터 24종 · 사진 6장 · v1~v3 완료 · 아티팩트 게시 완료 (앱 검출 모델 교체는 사용자 결정 대기)

## recall 중심 정량 평가 · 파인튜닝 준비
- 평가 완료(CrowdHuman val 100장) · 아티팩트 게시 · 현 최선 YOLOX-m, 파인튜닝 파일럿 RT-DETR-R18vd vs YOLOX-m (데이터 준비·학습 환경 세팅 진행 중)

## 최종 검증
- pytest 72 passed (단위/API 54, Playwright+Edge E2E 18) · 5개 모델 API 실호출 OK · 서버 시작 시 모델 5개 워밍업
- 실행: `.venv\Scripts\python -m uvicorn app.main:app --port 8000` → http://localhost:8000 (현재 실행 중)
