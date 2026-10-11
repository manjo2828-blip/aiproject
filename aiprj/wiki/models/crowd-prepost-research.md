# 군중 사람 검출: 학습 없는 전처리/후처리/추론 기법 리서치

> 사전학습 YOLOX-m / RT-DETR(R18/R50) ONNX 로 CrowdHuman 급 군중에서 사람 수를 최대한 맞추기 위한 기법 조사. 조사일 2026-10-11. 직접 확인한 수치만 기재, 못 찾은 것은 "미확인".

## 핵심 사실

### 0. 배경 (CrowdHuman 과 박스 검출기의 한계)
- CrowdHuman: 인물당 head / visible / full-body 3종 박스, 평균 약 22.6명/이미지, train+val 약 47만 인스턴스. 논문 결론: "군중 속 가림 문제는 아직 해결되지 않았다". (arXiv 1805.00123 abstract)
- NMS 가 recall 상한을 만든다: GT 박스 자체에 NMS 를 적용해도 recall 이 약 95% 에 그친다 (arXiv 2012.05780). NMS-free(one-to-one) 로 바꾸면 RetinaNet/FCOS recall 98.1/97.6%. 그러나 end-to-end 모델에 NMS 를 다시 붙이면 성능이 즉시 떨어진다.
- FPN 베이스라인, CrowdHuman val full-body NMS IoU 0.5 -> 0.6: AP 85.8 -> 88.1 이지만 MR-2 42.9 -> 45.4 로 악화 (arXiv 2003.09163 이 인용). 즉 임계 상향은 recall/AP 에는 이득, 중복(오탐)은 증가. "카운트" 목적이면 recall 쪽 이득이 중요하나 중복 증가와의 균형 필요.
- 학습 없이 적용 가능한 부분: 후처리(NMS 변형, WBF), 추론 방식(TTA/타일), 필터, 보정. 학습이 필요한 부분(미확인 -> 우리 범위 밖): Adaptive-NMS 의 density 서브넷, CrowdDet 의 EMD loss 다중 예측(MIP), Set NMS 가 의존하는 "proposal 당 다중 예측" 구조.
- Pedestron(CVPR21): 범용 검출기(Cascade R-CNN)가 보행자 특화 검출기보다 cross-dataset 일반화가 낫고, 밀집·다양한 웹 데이터 사전학습이 유효. Pedestron 저장소의 CrowdHuman 학습 HRNet Cascade Mask R-CNN 이 84.1 AP (저장소 목록). 학습 없이 쓸 수 있는 것은 "사전학습 체크포인트를 앙상블 후보로 쓰는 것" 정도 (ONNX 변환 필요, 비용 큼; 미검증).

### 1. 입력 해상도 / 타일링 / TTA
| 기법 | 원리 | 정량 효과 (보고된 것) | CPU 비용 | 난이도 | 함정 |
|---|---|---|---|---|---|
| 입력 해상도 확대 (640->800/960/1280) | 작은 사람의 픽셀 수 증가 | YOLOX-X COCO: 640 에서 50.5, 800 에서 51.2 mAP (서드파티 재구현 저장소, 공식 아님). Ultralytics 가이드: 작은 객체 많으면 입력 확대 이득, 단 YOLOv5n 은 1280 에서 오히려 소폭 악화(소형 모델 불리). 군중/CrowdHuman 직접 수치 미확인 | 픽셀 수에 비례 (960 은 640 의 2.25x, 1280 은 4x) | 낮음 (ONNX 동적 shape 여부 확인 필요; 고정 640 export 면 재export) | 학습 스케일(YOLOX 는 448~832 멀티스케일 학습, 논문) 밖으로 크게 벗어나면 오히려 하락 가능. 해상도 낮추면 큰 폭 하락 보고(YOLO11 320 에서 약 -10 mAP, 포럼). RT-DETR 은 위치 임베딩/고정 export shape 제약 가능(미확인) |
| letterbox vs stretch | letterbox 는 종횡비 유지+패딩, stretch 는 왜곡 | 정량 비교 미확인. YOLOX 학습은 비율 유지 리사이즈+패딩 방식(공식 구현 관행, 이번 조사에서 직접 URL 확인은 안 함) -> letterbox 권장(추정 아님: 학습 파이프라인과 일치시키라는 일반 원칙) | 0 | 낮음 | 패딩 값(YOLOX 114) 틀리면 성능 저하 가능(미확인) |
| 업스케일 보간 | 저해상도 원본 확대 시 보간 선택 | 검출 정확도에 대한 비교 수치 미확인 | 미미 | 낮음 | 원본이 1000~2000px 이므로 대부분 "다운스케일" 상황. 다운스케일은 INTER_AREA 가 일반적(경험칙, 출처 미확인) |
| 타일링 / SAHI | 이미지를 겹치는 슬라이스로 나눠 각각 추론 후 병합 | SAHI 논문(ICIP22, VisDrone/xView): 추론만으로 AP +6.8(FCOS) / +5.1(VFNet) / +5.3(TOOD); 파인튜닝 병용 시 누적 +12.7/13.4/14.5. 25% 겹침에서 소/중 객체 AP 상승, 대형 객체 AP 소폭 하락 (절대/상대 %p 여부 미확인) | 슬라이스 수만큼 배수 (2x2 + 전체 = 5회 추론) | 중 (sahi 는 ONNX 직접 지원 불확실 -> 자체 구현 권장) | 경계에서 잘린 박스(cut-through)가 중복/조각으로 남음; 큰 사람이 여러 타일에서 쪼개짐; 전체이미지 포함 시 대형 객체 보호 |
| 타일 병합 | 겹침 큰 박스 병합 시 IoU 대신 IoS(교집합/작은 박스 면적)나 포함 검사 | Supervision InferenceSlicer: overlap_filter(NMS/NMM/NONE), overlap_metric(IOU/IOS), 기본 임계 0.5. 조각 박스 제거에 포함 검사가 유효하다는 사례(opensensor PR#8). 군중용 최적 임계 수치 미확인 | 낮음 | 중 | 군중에서 IoS 를 키우면 인접한 서로 다른 사람도 병합될 수 있음 |
| 전체이미지 + 타일 | 큰 사람은 전체 패스, 작은 사람은 타일 패스 | SAHI 는 standard + sliced 병행 옵션 제공(`no_standard_prediction` 등). 군중 수치 미확인 | +1 패스 | 중 | 두 패스 간 중복은 NMS/WBF 로 정리 필요 |
| 멀티스케일/플립 TTA | 스케일/좌우반전별 추론을 병합 | WBF 논문 (COCO, EfficientDet-B7 원본+플립): NMS 52.33 / Soft-NMS 52.10 / NMW 52.50 / WBF 52.62 mAP -> TTA 병합 자체는 WBF 가 +0.29 우위(대비 NMS). 개별 모델에서 플립 단순 평가는 오히려 -0.2 수준(Table 3: B7 52.1 vs 플립 51.9) | 패스 수 배수 | 낮음 | 군중에서 TTA 로 잡힌 중복은 병합 임계에 민감; 오탐도 함께 증가 |

### 2. 박스 병합
| 기법 | 원리 | 정량 효과 | 비용 | 난이도 | 함정 |
|---|---|---|---|---|---|
| NMS IoU 임계 튜닝 | 임계 높이면 인접 사람 보존, 중복 증가 | CrowdHuman val FPN: 0.5 -> 0.6 에서 AP 85.8 -> 88.1, MR-2 42.9 -> 45.4 (arXiv 2003.09163 인용). YOLOX 공식 기본값 0.65(공식 repo 값, 직접 확인 안 함 -> 미확인) | 0 | 매우 낮음 | CrowdHuman 은 기본 임계 0.5 -> 0.6~0.7 이 recall 에 유리하나 중복 위험. 카운트 목적이면 임계 스윕 필수 |
| Soft-NMS (linear/gaussian) | 겹침 박스 점수를 감쇠, 삭제 안 함 | COCO: Faster R-CNN +1.1, R-FCN +1.3 mAP (ICCV17). CrowdHuman FPN full-body(Adaptive-NMS 논문 Table5): Greedy AP 83.07 / recall 90.57 / MR-2 52.35 -> Soft AP 83.92 / recall 91.73 / MR-2 51.97. RFB Net 에서는 Soft 가 MR-2 66.34 로 Greedy 65.22 보다 악화. CityPersons 에서 Gaussian 변형은 MR 약 +1% 악화(Adaptive-NMS 논문) | NMS 와 동급 | 낮음 | 점수 감쇠만 하므로 "사람 수" 는 결국 최종 점수 임계에서 결정됨. 시그마/임계 추가 튜닝 |
| DIoU-NMS | IoU 에 중심점 거리 항을 더해 중심이 먼 박스는 보존 | DIoU 논문(AAAI20): YOLOv3/SSD/Faster R-CNN 에서 "대부분 경우 NMS 보다 개선", 임계 0.43~0.48 전 구간에서 우위. 구체 AP 수치 미확인. CrowdHuman 수치 미확인 | NMS 와 거의 동급 | 낮음(직접 구현 수십 줄) | 군중에서 중심이 가까운 가림 쌍엔 효과 제한적 |
| Adaptive-NMS | 박스별 밀집도 d 예측 후 임계 = max(Nt, d) | CrowdHuman val full-body: FPN MR-2 52.35 -> 49.73 (Greedy 대비 -2.62), AP 83.07 -> 84.71; RFB Net MR-2 65.22 -> 63.03 (-2.19) (CVPR19). 학습 없이는 density 서브넷이 없어 그대로 적용 불가 | NMS 동급 | 학습 없이는 불가. **대체안**: 학습 없이 "검출 박스 간 최대 IoU"를 밀도 프록시로 쓰는 휴리스틱(효과 미확인, 자체 실험 필요) | 논문은 Nt=0.5 기준, CrowdHuman Nt 스윕 미보고 |
| Set NMS / CrowdDet | 같은 proposal 에서 나온 다중 예측끼리는 억제 제외 | CrowdHuman val FPN-R50: AP 85.8 -> 90.3 (MIP+SetNMS), MR-2 42.9 -> 42.2, JI 79.8 -> 82.0; RM 추가 시 AP 90.7 / MR-2 41.4 / JI 82.3 (CVPR20). **학습(EMD loss) 필요 -> 학습 없는 적용 불가** | - | 불가 | - |
| WBF | 모든 박스를 클러스터링해 점수가중 평균 좌표로 융합, 점수는 모델 수로 보정 | COCO 2모델(EffDet B6+B7): NMS 52.69 / Soft-NMS 52.39 / NMW 52.85 / WBF 53.44 mAP. Open Images 서로 다른 모델: NMS 56.42 / NMW 56.67 / WBF 59.82 mAP@0.5. COCO 다모델 WBF 56.1(val). 단, 한 모델 raw 출력에 바로 적용하면 악화(raw 17.2, NMS 49.0, WBF 45.3). NMS 대비 약 3배 느림. 논문 자체가 "겹치는 박스가 많고 점수가 다양하면 NMS 보다 나쁠 수 있다"고 명시 | 박스 수에 비례, NMS 의 약 3x | 낮음 (ensemble-boxes) | 군중 단일 모델 후처리로는 부적합. 서로 다른 모델/TTA 결과 융합용. 좌표는 0~1 정규화 필수 |
| 모델 앙상블 (YOLOX + RT-DETR) | 이질 모델 결과를 WBF/NMW/NMS 로 병합 | 위 WBF 수치(이질 모델일수록 이득 큼). 군중 직접 수치 미확인 | 모델 수만큼 | 중 | 두 모델의 점수 분포 차이(YOLOX obj*cls vs DETR sigmoid) -> `weights`, `skip_box_thr`, `conf_type` 조정 필요 |
| NMS-free (RT-DETR 계열) | 원래 NMS 불필요(one-to-one) | RT-DETR 의 CrowdHuman 직접 수치 미확인. 일반 DETR 은 군중 보행자에서 FPN Faster R-CNN 에 뒤진다는 보고(arXiv 2012.06785). DEYO-X 가 CrowdHuman AP 92.3 / recall 97.3 이라는 2차 요약(미검증) | - | - | RT-DETR 출력에 NMS 를 덧붙이면 인접 사람을 오히려 지울 수 있음(arXiv 2012.05780 의 end-to-end 모델 + NMS 악화 보고에서 유추, RT-DETR 직접 확인은 아님). RT-DETR 은 점수 임계만으로 개수를 정하는 쪽을 먼저 시험 |

### 3. 점수 / 필터
- **confidence 임계**: 카운트 목적에서는 mAP 용 낮은 임계(0.001)가 아니라 F1/카운트 오차 최소 지점을 개발 셋에서 스윕해 선택. 구체 최적값 문헌 수치 미확인.
- **obj x cls 조합**: YOLOX 논문은 최종 점수 공식을 명시하지 않음(직접 확인). 공식 구현은 obj*cls 를 쓴다고 알려져 있으나 이번 조사에서 코드 URL 검증은 안 함 -> (미확인). person 단일 클래스이므로 obj 만/obj*cls/ cls 만을 스윕하는 실험이 저비용.
- **종횡비·최소크기 prior**: CrowdHuman full-body 는 세로 박스(w/h 약 0.3~0.5)가 주류라는 통계는 직접 확인하지 못함(미확인) -> 개발 셋에서 w/h 히스토그램으로 직접 산출 후 극단값만 제거.
- **가장자리 클리핑 / 부분 박스**: CrowdHuman full-body 는 amodal(화면 밖 부분 포함) 박스이므로 COCO 학습 검출기는 화면에 보이는 부분만 박스로 내는 경향이 있어 IoU 매칭이 떨어질 수 있음(추정 -> 개발 셋에서 검증 필요). 평가를 "카운트"로 하면 영향이 작음. 머리/상반신만 보이는 사람은 박스가 작고 점수가 낮아 누락되기 쉬움 -> 낮은 점수 + 작은 박스 후보를 별도 임계로 구제하는 방안은 효과 미확인.

### 4. 전처리 (CLAHE/감마/샤프닝/노이즈 제거/색 정규화)
- 포괄적 벤치마크는 못 찾음(미확인). 개별 소규모 연구는 엇갈림: 저조도/저대비 도메인(번호판, 저조도 차량, 적외선 RT-DETRv2 +2.2 mAP, 이미지 도메인 특수)에서는 CLAHE 이득, 해조류/반투명 대상에서는 CLAHE 로 검출 수 -44%.
- 일반 컬러 군중 사진에 대한 근거 없음 -> 기본값은 "하지 않음". 어두운/역광 이미지에 한해 조건부 적용을 개발 셋 A/B 로 시험.
- 색 정규화: YOLOX 는 0~255 BGR 입력(프로젝트 detection.md 기준), RT-DETR 은 0~1 RGB(미확인 -> 모델 페이지 확인). 정규화 불일치가 가장 흔한 성능 손실 원인이므로 이것이 "전처리 검증"의 1순위.

### 5. 수 보정 (count calibration)
- 문헌 검색(검출 기반 vs 밀도 기반): 검출 기반은 군중이 밀집하고 객체가 작아질수록 검출·카운팅 성능이 모두 저하 (Kang/Ma/Chan, arXiv 1705.10118). 밀도 맵은 카운팅에 유리하나 학습 필요.
- 검출 수 -> 실제 수 회귀, 점수합 방식의 CrowdHuman 정량 결과는 **미확인**(검색에서 못 찾음). 아래는 학습이 아닌 "얇은 보정"으로 시험할 아이디어(효과 미확인, 가설):
  1. 점수 합(sum of scores, 임계 아래 포함) 대 임계 카운트 비교.
  2. 개발 셋에서 (검출 수 N_det, 평균 박스 크기, 박스 겹침률) -> GT 수에 대한 1~3개 계수의 선형/로그 회귀 (파라미터 몇 개라 과적합 위험 낮음, 사전학습 가중치는 건드리지 않음).
  3. 하이브리드: 검출이 잡지 못한 영역은 별도 밀도/카운터가 필요하나 학습 없는 군중 카운터는 없음(범위 밖).

## 우리 파이프라인에 시험해볼 후보 우선순위 (기대 효과 큰 순; 수치는 타 데이터셋 기준이라 우리 환경에서 반드시 재측정)
1. NMS IoU 임계 스윕 (0.5/0.6/0.7) + confidence 임계 스윕 (카운트 오차/F1 최소 기준). 비용 0, 문헌상 recall +수 pt (FPN: AP +2.3).
2. 입력 정규화/채널순서/패딩값/리사이즈 방식 정합 점검 (letterbox, YOLOX 0~255 BGR). 비용 0, 버그 제거.
3. 입력 해상도 확대 (YOLOX 800/960; 학습 스케일 448~832 범위 내 우선).
4. 전체 이미지 + 타일 (2x2, 25% 겹침) 병행 추론 + IoS/포함 검사 병합. SAHI 추론만으로 AP +5~7.
5. 플립 TTA + WBF (TTA 병합 WBF 가 NMS 대비 +0.3 mAP, 단일 모델 raw 에는 적용 금지: 먼저 NMS/score 필터 후 WBF).
6. YOLOX-m + RT-DETR 이종 앙상블 (WBF/NMW). 이종 모델에서 이득이 가장 큼(Open Images +3.4 mAP@0.5).
7. RT-DETR 은 NMS 없이 점수 임계만 사용 (NMS 추가 시 악화 가능성).
8. Soft-NMS (gaussian/linear) 비교. FPN CrowdHuman recall +1.2, AP +0.85, 모델에 따라 악화 가능.
9. DIoU-NMS 구현 비교 (저비용, 효과 미확인).
10. 밀도 프록시 기반 적응형 NMS 임계(검출 박스 간 최대 IoU 로 Nt 상향) 자체 구현 (학습 없는 Adaptive-NMS 근사, 효과 미확인; 원논문은 MR-2 -2~2.6).
11. 최소크기/종횡비 prior 필터 (개발 셋 히스토그램 기반 극단값만).
12. 점수 조합 변형 (obj*cls vs obj vs cls) 스윕.
13. 카운트 회귀 보정 (N_det, 평균 박스 크기, 겹침률 -> GT 수; 파라미터 1~3개).
14. 조건부 CLAHE/감마 (저조도 이미지에 한정, 일반 이득 근거 없음).

## 라이브러리 / 라이선스 (직접 확인한 것)
- ensemble-boxes (ZFTurbo/Weighted-Boxes-Fusion): MIT. `pip install ensemble-boxes`, 의존성 numpy+numba. 제공: nms, soft_nms, non_maximum_weighted, weighted_boxes_fusion. 파라미터: iou_thr, skip_box_thr, sigma, weights. 좌표 0~1 정규화 입력. `conf_type` 은 페이지에서 확인 못함(미확인).
- sahi (obss/sahi): MIT. 슬라이스 파라미터 slice_height/width, overlap_*_ratio; 후처리 옵션(postprocess_type 등)은 이번에 문서 URL 로 확인 못함(미확인). ONNX 직접 모델 래퍼 여부 미확인 -> 슬라이스/병합 로직만 자체 구현하는 편이 안전.
- supervision (roboflow) InferenceSlicer: overlap_filter(NMS/NMM/NONE), overlap_metric(IOU/IOS), 라이선스 미확인.
- YOLOX / RT-DETR 라이선스는 프로젝트 detection.md 기준 확인(YOLOX Apache-2.0). RT-DETR 은 이번에 확인 안 함(미확인).
- 그 외: 직접 구현 쉬운 것 -> numpy 로 Soft-NMS/DIoU-NMS/타일 병합 (외부 의존성 불필요).

## 출처
- CrowdHuman: https://arxiv.org/abs/1805.00123
- Adaptive NMS (CVPR19): https://arxiv.org/abs/1904.03629 (표: https://ar5iv.labs.arxiv.org/html/1904.03629)
- CrowdDet / Set NMS (CVPR20): https://arxiv.org/abs/2003.09163
- What Makes for End-to-End Object Detection (NMS recall 95%): https://arxiv.org/abs/2012.05780
- DETR for Crowd Pedestrian Detection: https://arxiv.org/abs/2012.06785
- Soft-NMS: https://arxiv.org/abs/1704.04503
- DIoU / DIoU-NMS: https://arxiv.org/abs/1911.08287
- WBF 논문: https://arxiv.org/abs/1910.13302 (표: https://ar5iv.labs.arxiv.org/html/1910.13302), 코드: https://github.com/ZFTurbo/Weighted-Boxes-Fusion
- SAHI 논문: https://arxiv.org/abs/2202.06934, 코드: https://github.com/obss/sahi (docs/predict.md)
- Supervision InferenceSlicer: https://supervision.roboflow.com/0.29.0/detection/tools/inference_slicer/
- 타일 cut-through 병합 사례: https://github.com/opensensor/light-object-detect/pull/8
- YOLOX: https://arxiv.org/abs/2107.08430
- Pedestron: https://arxiv.org/abs/2003.08799 , https://github.com/CVML/Pedestron , TPAMI 확장 https://arxiv.org/abs/2201.03176
- Density maps vs detection counting: https://arxiv.org/abs/1705.10118
- 전처리 사례(CLAHE) 단편 연구들: WebSearch 결과 (포괄 근거 아님)

## 관련
- [[models/detection]] (YOLOX-tiny 입출력/디코딩)
- [[models/pose]]
