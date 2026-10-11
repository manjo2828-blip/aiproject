# 사람(군중) 검출 ONNX 서빙 가속 리서치 (YOLOX-m / RT-DETR-R18vd, Windows 단일 PC)

> 2026-10-11 웹 리서치. 대상 환경: Win10, CPU 12스레드, RTX 3050 6GB(Ampere sm_86), 드라이버 561.17(CUDA 12.6), Python 3.12. 결론: 1순위는 "onnxruntime-gpu CUDA EP + FP16 + IOBinding + FastAPI 마이크로배칭", 2순위 TensorRT(EP/네이티브) FP16. 정량 수치는 출처 있는 것만 기재, 없으면 (미확인). 이 환경에서의 실측은 아직 없음.

## 핵심 사실

### A. 런타임
**onnxruntime CPU**
- 원리: `intra_op_num_threads` 미설정(0)이면 물리 코어당 1스레드 + 일부 affinity. 명시하면 affinity 미적용. `inter_op` 풀은 `ORT_PARALLEL` 모드에서만 존재(분기 많은 모델에만 유리, 기본 sequential). spinning(`session.intra_op.allow_spinning`) 기본 on, `spin_backoff_max` 등으로 CPU/전력 조절. 문서는 하이퍼스레딩 가이드 없음 -> 스레드 수(6/8/12) 직접 벤치 필요.
- 그래프 최적화: 기본 ALL 활성. `optimized_model_filepath` 로 오프라인 저장 후 최적화 끄고 로드하면 시작 시간 단축(같은 EP/하드웨어 전제, layout 최적화 모델은 AVX2 등 CPU 기능 의존). ORT format 변환은 문서 미확인(모바일/소형 빌드 용도로 알려짐, 이 환경 효과 작을 것으로 추정 -> 미확인).
- 기대 속도향상: 수치 미확인. 설치 난이도: 매우 쉬움(`pip install onnxruntime`). 함정: 세션 여러 개 x 스레드 많이 = 과구독; 요청 병렬 시 intra 스레드를 나눠 설정.

**onnxruntime-gpu CUDA EP**
- ORT 1.21~1.26: CUDA 12.8 + cuDNN 9.x 빌드(PyPI), 1.19/1.20: CUDA 12.x + cuDNN 9; **1.27 이상 PyPI 기본 `onnxruntime-gpu` 는 CUDA 13.0 빌드, CUDA 12.x 빌드는 별도 배포(12.8 필요)**. 즉 버전 선택 주의.
- 드라이버 561.17(CUDA 12.6)에서 CUDA 12.8 빌드 사용: NVIDIA minor-version compatibility 상 CUDA 12.x 앱은 드라이버 525+ 에서 동작하나, toolkit-driver 걸친 기능은 `cudaErrorCallRequiresNewerDriver` 가능, PTX JIT 코드는 불가. 실제 동작 여부는 **실측 필요(미확인)**. 안전책: 드라이버 업데이트 또는 ORT 1.19/1.20(CUDA 12.x/cuDNN 9) 사용.
- pip 의존성 방식: `pip install onnxruntime-gpu[cuda,cudnn]` 로 CUDA/cuDNN DLL 을 pip 로 설치(별도 CUDA Toolkit 불필요). `onnxruntime.preload_dlls()`(1.21+) 가 Windows 에서 PyTorch lib -> NVIDIA site-packages 순으로 DLL 탐색; `import torch` 먼저 해도 preload 됨.
- 옵션: `cudnn_conv_algo_search`(EXHAUSTIVE 기본, HEURISTIC/DEFAULT), `cudnn_conv_use_max_workspace`(기본 1, fp16 tensor core 알고리즘 선택 도움, 메모리 증가), `use_tf32`(기본 1), `enable_cuda_graph`(IOBinding 필수, 입출력 shape/주소 고정, 첫 Run 느림, 제어흐름 op 미지원, 같은 세션을 멀티스레드로 Run 금지), `prefer_nhwc`.
- IOBinding: 입출력 복사 오버헤드 제거. `disable_synchronize_execution_providers=1` 은 pinned/디바이스 메모리 + 직접 stream sync 시에만.
- 함정: EXHAUSTIVE 는 새 입력 shape 마다 알고리즘 탐색 -> 동적 배치/shape 에서 지연 스파이크. 고정 shape 또는 HEURISTIC 고려. 6GB VRAM -> 배치/워크스페이스 제한.

**TensorRT EP / 네이티브 TensorRT**
- ORT TRT EP 호환표: ORT 1.20 = TRT 10.4 (CUDA 12.0-12.6/11.8), 1.21 = TRT 10.8 (CUDA 12.0-12.8), 1.22 = TRT 10.9. 드라이버 CUDA 12.6 이면 **ORT 1.20 + TRT 10.4** 조합이 문서상 일치.
- 옵션: `trt_fp16_enable`, `trt_engine_cache_enable`(엔진은 모델/정밀도/프로파일/GPU 종속, 이식 불가, shape 가 프로파일 밖이면 재빌드), `trt_timing_cache_enable`, `trt_profile_min/opt/max_shapes`(셋 다 지정, 캐시 사용 시 동일하게 전달해야 재빌드 안 됨), `trt_int8_enable`(QDQ 모델은 캘리브 테이블 미사용), `trt_cuda_graph_enable`, `trt_build_heuristics_enable`.
- 빌드 시간: 첫 실행 매우 느림(문서 예: SD UNet 세션 생성 384s 캐시 없음 / 42s 타이밍 캐시 / 9s 엔진 캐시; 우리 모델은 미확인). 서비스 시작 시 빌드 대신 사전 빌드 + 캐시 배포 권장.
- TRT 10.0~10.5 는 NonMaxSuppression/NonZero/RoiAlign 등 데이터 의존 shape op 성능 문제 -> ORT 1.20.1/1.20.2 는 해당 op 를 TRT 에서 실행 안 함. end-to-end(NMS 포함) 그래프에선 CUDA EP 로 폴백되어 분할 발생.
- 네이티브: NVIDIA 문서상 pip 설치 가능(Windows x64, Win10+, Python 3.8~3.13; `tensorrt-cu12` 로 CUDA12 변형, 기본 `tensorrt` 는 CUDA 13 변형). pip 는 `trtexec`/C++ 헤더 미포함, 필요 시 zip 설치. 최신 문서는 TRT 11.x(CUDA 13.4 변형). TRT 지원 GPU 는 SM 7.5+ (일반 문장, Ampere 포함). 3050 은 sm_86.
- Ultralytics 비교표(T4, TensorRT10, 정밀도 불명, 제3자): RTDETRv2-s/m/l/x 5.03/7.51/9.76/15.03 ms (mAP 48.1~54.3), YOLOX-s/m/l/x 2.56/5.43/9.04/16.1 ms (mAP 40.5~51.1). RT-DETR 원논문은 T4 TRT FP16 에서 R50/R101 108/74 FPS. **R18vd 와 RTX 3050 수치는 미확인.**

**OpenVINO (CPU)**: `pip install openvino` 경로 존재(공식 문서 Use PyPI). LATENCY/THROUGHPUT performance hint, Automatic Batching 문서 존재하나 본문은 이번에 확인 못함 -> 속도향상 수치 미확인. YOLOX 문서는 OpenVINO 변환 시 opset 10 지정 권고. ORT 의 OpenVINO EP 도 존재(미확인 세부). CPU 전용 대안으로 합리적이나 GPU 가 있어 후순위.

**DirectML**: sustained engineering(신규 기능은 WinML 로 이동). 메모리 패턴 off + sequential 필수, 세션당 동시 Run 1개, opset 20 까지. 문서상 패키지는 NuGet 중심(pip `onnxruntime-directml` 존재는 일반 지식, 이번 미확인). NVIDIA GPU 에선 CUDA/TRT 가 우선 -> 비추천(폴백용).

**torch.compile**: 이번 조사에서 근거 문서 확보 못함(미확인). Windows 에서 Triton 컴파일러 백엔드 미지원/까다로움이 일반적 알려진 이슈 -> ONNX 파이프라인이므로 우선순위 낮음(미확인).

### B. 모델 최적화
- FP16: `onnxconverter_common.float16.convert_float_to_float16` — 캘리브 불필요, `keep_io_types=True`(입출력 fp32 유지), `op_block_list`/`node_block_list`, `min_positive_val`/`max_finite_val` 클리핑. 정확도 이상 시 블록리스트 조정, `auto_convert_mixed_precision`(GPU 머신 필요, 샘플 feed_dict + rtol/atol). CPU ORT 는 fp16 op 미지원이므로 fp16 은 GPU 전용. RT-DETR(트랜스포머) 의 softmax/LayerNorm 은 fp16 오버플로 위험 -> 검증 필수(해당 모델 사례 미확인).
- INT8 정적 양자화: CNN(YOLOX)에 정적 권장, 트랜스포머엔 동적 권장(문서). 캘리브 방식 MinMax/Entropy/Percentile. x86 AVX2/AVX512 의 U8S8 은 VPMADDUBSW 포화로 정확도 하락 가능 -> `reduce_range` 또는 U8U8, VNNI CPU 는 무관. 기본은 S8S8 QDQ. GPU INT8 은 TensorRT EP 경유, S8S8 만, Tensor Core 필요. 군중 검출(작은 객체 많음)은 INT8 정확도 하락 위험 -> mAP/recall 재검증 필수. 속도 수치 미확인.
- 입력 크기/동적 배치: 640 -> 480/512 등 축소는 연산량 거의 면적 비례 감소(원리), 군중의 작은 인물 recall 하락 위험(수치 미확인). TRT 는 min/opt/max 프로파일 필요, 동적 배치는 프로파일 범위 안에서만.
- end-to-end(NMS/디코딩을 그래프에): RT-DETR 은 NMS-free 설계(원논문). YOLOX 는 export 시 디코딩 포함 옵션이 있으나(`--decode_in_inference`는 이번 문서에서 확인 못함, 미확인) ORT NonMaxSuppression op 는 TRT 구버전에서 성능 문제 -> GPU 에선 후처리를 GPU 텐서/torchvision 쪽에 두는 편이 안전(추정 아님: 위 TRT 문서 caveat 기반).
- onnxsim: 일반 도구(이번 문서 미확인). 그래프 단순화로 EP 분할/불필요 노드 감소 기대.

### C. 전/후처리
- 확인된 것: NVIDIA DALI 문서의 OS 요건은 **Linux x64 만** -> Windows 네이티브 불가(WSL2 필요, 미확인). PIL-SIMD 는 Windows 휠 부재로 알려져 있음(미확인).
- 현실적 방안: cv2.imdecode(+ `IMREAD_REDUCED_COLOR_2` 로 큰 JPEG 다운스케일 디코드; 미확인 세부) -> 업로드 이미지가 작으면 디코딩보다 추론이 지배. GPU 쪽 resize/normalize 는 ORT 외부(torch CUDA)나 모델 그래프 앞단에 Resize/Sub/Div 를 포함시켜 CPU 작업 축소 가능. 전/후처리 정량 수치 미확인.
- io-binding + pinned memory 로 H2D/D2H 오버랩(ORT 문서). numpy NMS vs torchvision/ONNX NMS 수치 미확인; 후보 박스 수(YOLOX 8400개 anchors @640, 군중이면 필터 후 수백)를 score threshold 로 먼저 줄이는 것이 핵심.

### D. 서버 구조
- FastAPI: 추론은 `def` 엔드포인트(스레드풀) 또는 `run_in_executor`; ORT `Run` 은 GIL 해제되므로 스레드로 충분(일반 지식). 동일 세션 CUDA graph 사용 시 멀티스레드 Run 금지(ORT 문서).
- 마이크로배칭: asyncio 큐 + 배치 수집(최대 N장 / 최대 대기 수 ms) -> 단일 워커가 배치 추론 -> future 로 결과 분배. 처리량 상승, 지연은 대기시간만큼 증가. 6GB VRAM 이므로 배치 4~8 정도부터 실측.
- LitServe: README 가 "멀티워커로 FastAPI 대비 최소 2x" 주장(이미지/텍스트 분류 벤치, 우리 환경 미확인), `max_batch_size` 등 배칭 지원. Windows 별도 안내 없음(미확인).
- Triton: **26.06(v2.70.0)에서 Windows 서버 빌드 제거**, 이전도 부분 지원(24.02 Python backend 제한, 24.04 Windows 릴리스 없음 등). 네이티브 Windows 선택지 아님 -> WSL2/Docker 필요(미확인). Ray Serve / BentoML: 이번 조사에서 근거 미확보(미확인); 단일 PC 에서 의존성/프로세스 오버헤드 대비 이득 작다고 판단하나 이는 추정.
- 멀티 프로세스: Windows 는 spawn 방식, uvicorn `--workers N` 은 프로세스마다 모델/VRAM 복제(6GB 주의). GPU 1장이면 워커 1 + 배칭이 보통 유리(추정, 실측 필요).

### E. 부하테스트
- locust: `--processes`(멀티프로세스)는 fork() 의존이라 **Windows 불가**(공식). 대안은 master/worker 수동 실행. FastHttpUser 는 단일 프로세스 1만 rps 이상 가능(공식 주장, 단순 플랜). 
- k6: 멀티파트는 init 단계 `open(path,'b')` + `http.file()`. `constant-arrival-rate` 로 open-loop, `constant-vus` 는 closed-loop. 공식 문서: closed 모델은 서버가 느려지면 도착률이 떨어져 coordinated omission 발생.
- oha: `winget install hatoo.oha` 또는 릴리스 바이너리, Win10 테스트됨. `-F 'file=@img.jpg'` 로 curl 호환 멀티파트, `-z 30s -c N`, `-q QPS` + `--latency-correction`(-q 지정 시에만 유효) 로 CO 보정, `--output-format json|csv`. wrk/bombardier 는 이번 미확인(wrk 는 Windows 네이티브 아님이 일반적).
- 방법: 워밍업(EXHAUSTIVE/TRT 첫 호출, CUDA graph 캡처 제외), closed-loop 로 최대 처리량(concurrency sweep 1,2,4,8,16), open-loop(고정 RPS)로 지연 분포(p50/p95/p99), 에러율, 동시에 `nvidia-smi dmon`/`nvidia-smi --query-gpu=utilization.gpu,memory.used -l 1` + CPU 사용률 기록. 서버 내부 단계별 타이밍(decode/pre/infer/post) 헤더나 로그로 분리 측정. 부하 생성기를 같은 PC 에서 돌리면 CPU 경쟁 -> 생성기 가벼운 것(oha/k6) 사용.

## 이 환경에서 시도할 우선순위 (기대 효과 큰 순)
1. 기준선: ORT CPU(스레드 6/8/12 스윕) 로 단계별(decode/pre/infer/post) 지연 측정 -> 병목 확인.
2. ORT CUDA EP (fp32) 로 전환 + `preload_dlls`, CUDA/cuDNN 버전 호환 확인(드라이버 12.6 vs ORT 12.8 빌드 이슈).
3. FP16 변환(`keep_io_types=True`) + 정확도 검증(YOLOX 먼저, RT-DETR 은 블록리스트 필요 가능).
4. IOBinding + pinned memory + (고정 shape 시) CUDA graph.
5. 후처리 최적화: score threshold 선필터, vectorized/torchvision NMS; YOLOX 는 디코딩 벡터화.
6. FastAPI 마이크로배칭(배치 1/2/4/8, 대기 2~10ms 스윕).
7. TensorRT EP FP16 (ORT 1.20 + TRT 10.4 매칭, 엔진/타이밍 캐시, 프로파일 min1/opt4/max8) 또는 네이티브 `tensorrt-cu12`.
8. 입력 해상도 축소(512/480) 와 recall 비교.
9. 디코딩 가속: `cv2.IMREAD_REDUCED_*`, 리사이즈를 GPU/그래프로 이동.
10. INT8 (TRT QDQ 정적) - 정확도 검증 가능할 때만.
11. CPU 대안: OpenVINO (GPU 불가 시/동시 병행 워커용).
12. 모델 교체 비교: RT-DETR(NMS-free) vs YOLOX 를 동일 파이프라인으로 실측(문헌은 T4 에서 YOLOX-m 이 더 빠르다고 제3자 표 제시).

## 권장 서빙 구성안
- **안 1 (기본): GPU ORT + FP16 + 마이크로배칭 FastAPI**: uvicorn 워커 1, 추론 전용 스레드 1개 + asyncio 배치 큐, CUDA EP, IOBinding. 설치 쉬움, 위험 낮음.
- **안 2: TensorRT FP16**: ORT TRT EP(또는 네이티브 엔진) + 엔진 사전 빌드/캐시 + 동적 배치 프로파일. 최고 성능 기대(수치 미확인), 빌드 시간/버전 매칭 부담.
- **안 3: CPU OpenVINO**: GPU 없이/보조용. THROUGHPUT hint + 다중 요청. 수치 미확인.
- (참고) 앞단 부하는 oha/k6 로 open-loop 측정.

## 출처
- ORT CUDA EP: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- ORT TensorRT EP: https://onnxruntime.ai/docs/execution-providers/TensorRT-ExecutionProvider.html
- ORT DirectML EP: https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html
- ORT threading: https://onnxruntime.ai/docs/performance/tune-performance/threading.html
- ORT quantization: https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html
- ORT graph optimizations: https://onnxruntime.ai/docs/performance/model-optimizations/graph-optimizations.html
- ORT float16: https://onnxruntime.ai/docs/performance/model-optimizations/float16.html
- NVIDIA TensorRT 설치: https://docs.nvidia.com/deeplearning/tensorrt/latest/installing-tensorrt/installing.html (pip 세부는 https://docs.nvidia.com/deeplearning/tensorrt/10.16.0/installing-tensorrt/installing.html 검색 결과 요약)
- CUDA minor version compatibility: https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html
- DALI 설치: https://docs.nvidia.com/deeplearning/dali/user-guide/docs/installation.html
- Triton 26.06 릴리스 노트(Windows 제거): https://docs.nvidia.com/deeplearning/triton-inference-server/release-notes/rel-26-06.html
- RT-DETR 논문: https://openaccess.thecvf.com/content/CVPR2024/papers/Zhao_DETRs_Beat_YOLOs_on_Real_time_Object_Detection_CVPR_2024_paper.pdf
- Ultralytics RTDETRv2 vs YOLOX: https://docs.ultralytics.com/compare/rtdetr-vs-yolox
- YOLOX ONNXRuntime demo: https://github.com/Megvii-BaseDetection/YOLOX/tree/main/demo/ONNXRuntime
- LitServe: https://github.com/Lightning-AI/LitServe
- k6 open/closed: https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/
- k6 업로드: https://grafana.com/docs/k6/latest/examples/data-uploads/
- locust 분산: https://docs.locust.io/en/stable/running-distributed.html
- oha: https://github.com/hatoo/oha
- OpenVINO 설치/힌트(본문 미확인): https://docs.openvino.ai/2025/get-started/install-openvino.html

## 관련
- [[detection]] (YOLOX-tiny 서비스 현황), [[pose]], [[classification]]
- 조사 한계: Ray Serve/BentoML/wrk/bombardier/torch.compile/OpenVINO 수치/PIL-SIMD/ORT format 은 이번에 1차 출처 미확보(미확인). 다운로드 URL 해당 없음(라이브러리는 pip).
