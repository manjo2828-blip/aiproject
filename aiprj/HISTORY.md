# HISTORY

프로젝트 진행 이력 (append-only, 최신이 맨 아래).

## 2026-10-10 — 프로젝트 시작
- 요청: 경량 모델 5종(이미지분류, 객체인식, pose, 얼굴인식, 한국어 감정분류) + FastAPI API + Jinja2 웹사이트 + 새 venv + 브라우저 테스트.
- 환경 확인: Windows 11, Python 3.12.1, i7-1165G7, GPU MX450(미사용, CPU 추론 목표).
- 하네스 세팅 시작: CLAUDE.md, HISTORY.md, STATS.md, wiki/, .claude/agents/ 생성.

## 2026-10-10 — Phase 0 완료: 하네스
- 생성: CLAUDE.md(규칙/모델 라우팅/병렬 워크플로우), HISTORY.md, STATS.md, wiki/(README, index, decisions/001), .claude/agents/{researcher,dev-worker,reviewer,architect}.md, .gitignore, 디렉터리 스켈레톤.
- 참고: 커스텀 에이전트 정의는 세션 재시작 전엔 로드 안 됨 → general-purpose + model 오버라이드로 동일 역할 수행.

## 2026-10-10 — Phase 1 시작 (병렬)
- venv `.venv` 생성 + 기본 패키지 설치 (백그라운드): fastapi, uvicorn, jinja2, python-multipart, pillow, numpy, onnxruntime, opencv-python-headless, httpx, pytest, tokenizers, huggingface_hub.
- 리서치 6개 병렬 투입: 분류/검출/포즈/얼굴 (haiku 5.5 ×4), 한국어 감정 (sonnet 5.5), 컨셉·UX·API 계약 (fable 5.1).

## 2026-10-10 — venv 설치 완료
- `.venv` 기본 패키지 설치 성공, `requirements.lock.txt` 생성.

## 2026-10-10 — Phase 1 완료: 모델 선정·다운로드·검증
- 분류: MobileNetV2 (14MB, Apache-2.0) — 개 사진 Samoyed 0.83. 출력 logits(softmax 필요), 한국어 라벨 없음.
- 검출: YOLOX-tiny (20MB, Apache-2.0) 416 BGR 0-255, NMS 직접. bus.jpg 검증. (YOLOv8n은 401/AGPL로 제외)
- 포즈: YOLOv8n-pose Xenova (13.5MB, **AGPL-3.0** — 공개 배포 시 주의). 640 RGB 0-1, 17 kpt.
- 얼굴: YuNet(0.2MB, MIT)+SFace(37MB, Apache-2.0), cosine 0.363. 판화는 score_threshold 0.6 필요.
- 감정: MelissaJ/koelectra-emotion-7-emotion-base-onnx int8 (114MB, Apache-2.0), 7감정, ~8ms/문장, 정확도 0.67. token_type_ids 필수.
- 컨셉: "AI 놀이터", API 계약 → wiki/decisions/002-concept-ux.md.
- 에이전트: haiku×4(분류/검출/포즈/얼굴), sonnet×1(감정), fable×1(컨셉).

## 2026-10-10 — Phase 2 진행: 백엔드 대부분 완료 (sonnet 5.5 ×8 병렬)
- 완료: 코어(app/core, main, system/pages 라우터, download 스크립트), classify/detect/face/emotion 서비스+라우터. 현재 pytest 26 passed.
- 통일: 모델 미준비 오류 코드는 doc 002 의 `MODEL_NOT_READY`(503) (detect 수정, pose 는 완료 후 수정).
- 얼굴 similarity_percent: cos 0→0%, 0.2→30%, 0.363→60%, 0.88→95%, 1.0→100% 구간 선형.
- 진행 중: pose 서비스, 프론트 공통(base/css/common.js/index), 페이지 UI ×2.

## 2026-10-10 — Phase 2·3 완료: 백엔드+프론트 통합, 스모크 테스트
- 프론트: base.html/app.css/common.js(AP.*)/index + 5개 페이지 템플릿·JS (wiki/decisions/003-frontend-helpers.md).
- 샘플 이미지: dog/street/dance/face_a/face_b → app/static/img/samples (wiki/decisions/004).
- 통합: pytest 30 passed. 서버(localhost:8000) 기동 후 curl/httpx 로 5개 API 실호출 성공 — 분류 Samoyed 0.83, 검출 bus 0.94+person, 포즈 응답 OK, 얼굴 compare OK, 감정 기쁨 0.9985. 5개 페이지 200.
- 참고: Git Bash curl 로 한글 JSON 보내면 인코딩 깨짐(서버 버그 아님, httpx 로 확인).
- 브라우저 MCP 도구 없음 → Playwright + 시스템 Edge 로 실브라우저 E2E 진행.

## 2026-10-10 — Phase 4 시작 (병렬)
- sonnet 5.5: Playwright E2E + 스크린샷 시각 검증 (tests/e2e/).
- opus 5.5: 전체 코드 리뷰 (읽기 전용, wiki/raw/review-opus-1.md).

## 2026-10-10 — Phase 4 결과
- E2E (Playwright+Edge, sonnet): 18 중 17 통과. 실패 1건 = 감정 빈 입력 무반응. UX 이슈: 홈 이모지 겹침, 검출 큰 박스 선 얇음, 얼굴 face_a 2개 오탐, 포즈 guess 미사용, 감정 막대 0% 다수, 모바일 내비 잘림.
- 코드 리뷰 (opus): 26건 (High 3 / Med 7 / Low 16). High: 디코드가 이벤트루프 블로킹, 디컴프레션 밤 허용, 요청 크기 제한 없음. XSS·경로탐색·스레드안전·모델 수학은 이상 없음. 전문: wiki/raw/review-opus-1.md.

## 2026-10-10 — Phase 5 시작: 수정 (sonnet ×3 병렬, 파일 소유권 분리)
- 백엔드(core/services/routers/scripts), 공통 프론트(common.js/css/base/index), 페이지 JS(5개 페이지+e2e 테스트).

## 2026-10-10 — Phase 5 완료: 수정 + 최종 검증
- 백엔드: 디코드 threadpool, 40MP 캡(IMAGE_TOO_LARGE 413), 12MB 요청 제한 미들웨어, 극단 비율 이미지, 추론 동시성 제한, 시작 시 모델 워밍업, 얼굴 기본 score 0.7(오탐 제거), 다운로드 SHA 검증.
- 프론트: URL revoke, 스피너 레이스(AP.safe), 웹캠 모달 포커스/Esc, 캔버스 선 굵기·리사이즈 redraw, 홈 이모지/모바일 내비, a11y. 페이지: 감정 빈입력 토스트·라벨맵·<1% 숨김, 포즈 서버 guess·라이브 누수 수정.
- 최종 검증(서버 재시작 후): pytest 72 passed (단위/API 54 + 브라우저 E2E 18). 스크린샷 직접 확인: 검출(버스 박스 선명), 얼굴 비교(20%, 안내문 오탐 해소).
- README.md 추가. 남은 알려진 한계: 샘플 이미지 일부 미제공(버튼 숨김), 포즈 모델 AGPL, 감정 모델 114MB(작은 한국어 모델 부재), 웹캠 모달은 수동 테스트 안 함.

## 2026-10-10 — 새 작업: 객체검출 모델 비교 벤치마크 (bench/)
- 목표: 군중 사진 샘플 + 유명 검출 모델 여러 개를 CPU 에서 동일 조건 비교 → 정확도 좋은 모델 선정, 아티팩트로 시각화.
- 구조: bench/images(군중 사진+SOURCES.md), bench/weights, bench/adapters(모델별 어댑터 통일 인터페이스), bench/out(결과). 앱(app/)과 분리.
- 병렬 투입(sonnet 5.5 ×4): 군중 사진 수집 / YOLOX 계열 / Ultralytics 계열(v8·11·10) / 기타(RT-DETR·SSD·NanoDet·DETR 등).

## 2026-10-10 — 벤치마크 준비 완료 → 실행 중
- 사진 6장(bench/images, 모두 자유 라이선스, SOURCES.md), 어댑터 24종: YOLOX 6 + Ultralytics 8(v8/11/10, AGPL) + 기타 10(RT-DETR r18/r50, DETR-r50, SSD-MobileNetV1, NanoDet-Plus×2, YOLOv7×2, YOLOv6×2).
- 미구현: EfficientDet-Lite(ONNX 로드 실패), PP-YOLOE(ONNX 없음), RetinaNet/Faster-RCNN(생략).
- 1차 관찰(단일 실행): v10 은 밀집 장면에서 적게 검출, DETR-r50 은 많이 검출(conf 0.25 오검출 가능성).
- 벤치 실행(sonnet, 순차·CPU 단독): 지연시간 + 앙상블 가짜 정답(leave-one-out WBF) 기반 person P/R/F1/AP50. 정답 라벨이 없다는 점을 결과에 명시 예정.

## 2026-10-10 — 벤치마크 v1·v2 결과, v3(타일 추론) 시작
- v1(순차 실행, 24모델×6장): 지연시간 OK, 가짜정답(강한 6모델 합의)은 107명뿐 — 눈대중 ~500명과 큰 차이.
- v2(24모델 광역 합의, k>=5): GT 112명, v1 과 순위 거의 동일(Spearman 0.96~0.98). 원인 = 모든 모델이 640 입력이라 작은 사람을 아무도 못 찾음 (GT 방식 문제가 아님).
- 관찰: COCO AP 와 이 군중 과제 순위 상관은 약함(ρ≈0.6). YOLOv10 은 점수 분포가 눌려 conf 0.25 에서 불리(conf 0.05 에선 F1 0.55→0.71).
- 대응: v3 = SAHI 방식 타일 추론(3x3+전체) 24모델 전부, 타일 기반 GT 재구성, 표준/타일 두 모드 평가. 결과 후 아티팩트 제작.
- 산출물: bench/out/{results,results_v2,results_v3}.json, summary*.md.

## 2026-10-10 — 검출 모델 비교 아티팩트 게시
- v3(타일 추론) 결과: GT 175명(눈대로 ~645명 중 27%) — 먼 군중은 기준에 없음. 24모델 전부 표준/타일 두 모드 측정.
- opus 검증: 타일 모드 F1@0.25 의 Ultralytics 우위는 GT 점수컷(0.40) 인공물 → 순위는 표준 모드 AP50 기준. 6장 기준 AP50 차이 <0.08 은 동률 취급.
- 추천(opus): 앱 기본 RT-DETR-R18vd(표준, conf 0.30, 396ms, Apache-2.0) / 최고 정확도 RT-DETR-R50vd / 200ms 이하 YOLOv6-N(GPL) / 균형 YOLOX-s / 초경량 NanoDet-Plus-m-1.5x / 타일 YOLOX-s. 현재 앱의 YOLOX-Tiny 는 같은 속도대 NanoDet 보다 AP50 낮음(0.359 vs 0.536).
- 산출물: bench/out/artifact.html (build: bench/build_artifact.py), recommendation.md, picks.json. 아티팩트 URL: https://claude.ai/artifact/NhQj22vYruk13HAhATpesF
- 앱(app/)의 검출 모델은 아직 교체하지 않음 (사용자 결정 대기).

## 2026-10-10 — 정량 평가 시작 (recall 중심)
- 요구: 오탐 일부 허용, 최대한 많은 사람 검출(recall 중시). 공개 라벨 데이터셋(군중) 100장 랜덤 샘플링 → 상위 5개 모델 정량 평가 → 아티팩트.
- 상위 5개 선정(표준 모드, 기존 벤치 recall@0.25 순): DETR-R50 0.82, RT-DETR-R50vd 0.80, YOLOX-x 0.73, RT-DETR-R18vd 0.71, YOLOX-m 0.64 (모두 Apache-2.0).
- 병렬(sonnet ×2): (A) 데이터셋 확보·샘플링(bench/eval/data, DATASET.md, seed 42, 사람 ≥15명 풀) / (B) 평가 하네스(bench/eval/metrics.py, run_eval.py: recall@conf, recall@FPPI, AP50, AR@100, MR^-2, 버킷별 recall, 부트스트랩 CI, 쌍별 유의성).

## 2026-10-10 — CPU vs GPU 속도 체크 (sonnet 5.5)
- 대상: YOLOX-m ONNX (선택 사유: 5개 후보 중 하나, 단순 convnet 이라 GPU 백엔드 호환 좋음). 별도 venv(Temp\ort_gpu_venv)에 onnxruntime-gpu(CUDA) → 실패 시 DirectML 폴백. 프로젝트 .venv 는 건드리지 않음.
- 정량 평가(run_eval)의 CPU 지연 측정과 간섭하지 않도록, 환경 준비 후 평가 종료를 기다렸다가 측정.
- 산출물: bench/gpu_check/RESULTS.md, results.json.

## 2026-10-10 — 평가 데이터셋 완성 (CrowdHuman val, 100장)
- 출처: CrowdHuman val(4370장) HF 미러 sshao0516/CrowdHuman (로그인 불필요). 검출기들이 학습에 쓰지 않은 데이터셋(COCO 폴백 불필요).
- 풀: 사람 ≥15명 이미지 2340장 → random.Random(42) 로 100장. 이미지당 사람 수 min 15 / median 30 / mean 36.1 / max 148 (10-19:14, 20-39:56, 40-79:24, 80+:6).
- GT: 유효 3607명, ignore 66명, ignore 영역 884개. full-body 박스(fbox), vis_ratio=vbox/fbox, occ(none ≥0.9 / partial / heavy <0.5). 2000px 초과 19장 축소.
- 주의: 라이선스 CC BY-NC 4.0 (비상업 연구 용도), 풀바디 박스는 이미지 밖으로 나갈 수 있어 클리핑 고려, 심한 가림·아주 작은 사람도 모두 라벨링돼 절대 recall 은 낮게 나옴(상대 비교용), 일부 이미지에 워터마크.

## 2026-10-10 — 정량 평가 결과 + 아티팩트 + 파인튜닝 준비 (병렬)
- 평가(CrowdHuman val 100장, 정답 3607명, 5모델 표준 추론): recall@FPPI=2 — YOLOX-m 30.6 / RT-DETR-R50vd 29.4 / RT-DETR-R18vd 28.6 / YOLOX-x 27.9 / DETR-R50 26.0 (%). FPPI 5/10 에서 YOLOX-m·R50·YOLOX-x 는 통계적 동률, DETR-R50 은 4개 모두보다 낮음, R18 은 FPPI 5/10 에서 YOLOX-m 대비 약 -2.5pp(유의).
- opus 검증: 고정 conf 비교는 모델별 FPPI 가 8.8~41.5 로 달라 불공정 → 동일 FPPI recall 로 비교. AP50 우위(RT-DETR)는 저점수 꼬리 영향. MAX_DETS 100·NMS IoU 는 FPPI 2/5/10 recall 에 영향 없음. MR^-2 는 변별력 없음. '잘 보이는 사람'(vis≥0.5, h≥32, n=2522) recall@FPPI2: YOLOX-m 42.0%.
- 현 시점 최선: YOLOX-m (414ms, Apache-2.0). 파인튜닝 추천: RT-DETR-R18vd (NMS-free, 384ms, 입력 해상도 여유) / 대안 YOLOX-m → 같은 예산 파일럿으로 결정.
- 아티팩트: https://claude.ai/artifact/NGyH4HJHH3CiCEJTTrGgF2 (bench/eval/out/artifact.html, build: bench/eval/build_artifact.py).
- 파인튜닝: phase A(데이터 준비, bench/finetune/data) 진행 중, phase B(학습 환경·파일럿 프로토콜, bench/finetune/train) 시작. 학습은 MX450 으로 비현실적 → 로컬은 CPU 스모크 테스트, 본학습은 Colab/클라우드 GPU.
- 라이선스 주의: CrowdHuman 은 CC BY-NC 4.0. 학습 기본 flavor 는 permissive(Open Images + COCO), CrowdHuman 포함은 research_nc 로 분리.

## 2026-10-10 — CPU vs GPU 속도 결과 (YOLOX-m, MX450)
- 환경: 별도 venv(onnxruntime-gpu 1.22.0 + nvidia-*-cu12 pip 라이브러리). 최신 ORT-GPU 1.31 은 CUDA 13 필요 → 드라이버 561(CUDA 12.6) 불가. cuDNN DLL 은 os.add_dll_directory+PATH 로 로드. DirectML 폴백 불필요.
- street.jpg(1080x810) run() 중앙값: CPU4 459ms / CPU8 547ms / GPU 121ms (3.8x). e2e: 449 / 490 / 132ms. 첫 추론 ~430ms(cuDNN 탐색), 로드 1.4s, GPU 메모리 327MiB.
- 1600px 군중 사진: CPU4 514ms vs GPU 122ms(4.2x). CPU·GPU 출력 동일(박스 최대차 2e-4px). RT-DETR-R18vd 도 4.4x(460→102ms).
- 스레드 8개는 4개보다 이득 없음. io-binding 이득 없음(연산 한계). FP16/DirectML/Iris Xe 미측정.
- 결론: 지연이 중요하면 MX450 사용 가치 있음(+별도 환경 1.4GB CUDA 패키지, CPU 폴백 유지). 산출물 bench/gpu_check/.
