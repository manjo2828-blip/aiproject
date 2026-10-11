# 정량평가 결과 (3 청킹 × 3 임베딩 = 9 케이스)

- 질문 수: Fixed 150자 135문항(청크 45개×3), Recursive 300자 69문항(청크 23개×3), Structured Parent-Child 153문항(청크 51개×3)
- 정답 = 질문을 만든 청크(Parent-Child는 그 청크의 부모 챕터). 반환단위 기준으로 중복 제거 후 순위 산정.

## 1. 핵심 지표
| 청킹 | 임베딩 | Hit@1 | Hit@3 | Hit@5 | Hit@10 | MRR | nDCG@10 | 평균순위 |
|---|---|---|---|---|---|---|---|---|
| Fixed 150자 | e5-small | 0.437 | 0.681 | 0.770 | 0.867 | 0.591 | 0.652 | 4.896 |
| Recursive 300자 | e5-small | 0.580 | 0.725 | 0.841 | 0.913 | 0.686 | 0.736 | 3.391 |
| Structured Parent-Child | e5-small | 0.667 | 0.895 | 0.967 | 1.000 | 0.790 | 0.842 | 1.739 |
| Fixed 150자 | bge-m3 | 0.578 | 0.770 | 0.859 | 0.933 | 0.696 | 0.751 | 3.304 |
| Recursive 300자 | bge-m3 | 0.768 | 0.884 | 0.913 | 0.971 | 0.839 | 0.870 | 2.014 |
| Structured Parent-Child | bge-m3 | 0.778 | 0.974 | 0.993 | 1.000 | 0.869 | 0.903 | 1.366 |
| Fixed 150자 | ko-sroberta | 0.548 | 0.719 | 0.837 | 0.933 | 0.662 | 0.724 | 3.474 |
| Recursive 300자 | ko-sroberta | 0.536 | 0.812 | 0.841 | 0.928 | 0.687 | 0.742 | 3.058 |
| Structured Parent-Child | ko-sroberta | 0.693 | 0.915 | 0.974 | 1.000 | 0.815 | 0.861 | 1.595 |

## 2. 우연 대비 (반환 단위 수가 달라 직접 비교 시 주의)
| 청킹 | 임베딩 | 반환단위 수 | 무작위 Hit@1 | Hit@1 | 무작위 Hit@5 | Hit@5 | MRR 우연대비 배수 |
|---|---|---|---|---|---|---|---|
| Fixed 150자 | e5-small | 45 | 0.022 | 0.437 | 0.111 | 0.770 | 6.0x |
| Recursive 300자 | e5-small | 23 | 0.043 | 0.580 | 0.217 | 0.841 | 4.2x |
| Structured Parent-Child | e5-small | 7 | 0.143 | 0.667 | 0.714 | 0.967 | 2.1x |
| Fixed 150자 | bge-m3 | 45 | 0.022 | 0.578 | 0.111 | 0.859 | 7.1x |
| Recursive 300자 | bge-m3 | 23 | 0.043 | 0.768 | 0.217 | 0.913 | 5.2x |
| Structured Parent-Child | bge-m3 | 7 | 0.143 | 0.778 | 0.714 | 0.993 | 2.3x |
| Fixed 150자 | ko-sroberta | 45 | 0.022 | 0.548 | 0.111 | 0.837 | 6.8x |
| Recursive 300자 | ko-sroberta | 23 | 0.043 | 0.536 | 0.217 | 0.841 | 4.2x |
| Structured Parent-Child | ko-sroberta | 7 | 0.143 | 0.693 | 0.714 | 0.974 | 2.2x |

## 3. 원본 청크 정확 적중 (Parent-Child의 child 단위, 부모 반환 효과 제거)
| 청킹 | 임베딩 | Child Hit@1 | Child Hit@5 | Child MRR |
|---|---|---|---|---|
| Fixed 150자 | e5-small | 0.437 | 0.770 | 0.591 |
| Recursive 300자 | e5-small | 0.580 | 0.841 | 0.686 |
| Structured Parent-Child | e5-small | 0.549 | 0.804 | 0.665 |
| Fixed 150자 | bge-m3 | 0.578 | 0.859 | 0.696 |
| Recursive 300자 | bge-m3 | 0.768 | 0.913 | 0.839 |
| Structured Parent-Child | bge-m3 | 0.660 | 0.902 | 0.768 |
| Fixed 150자 | ko-sroberta | 0.548 | 0.837 | 0.662 |
| Recursive 300자 | ko-sroberta | 0.536 | 0.841 | 0.687 |
| Structured Parent-Child | ko-sroberta | 0.549 | 0.856 | 0.686 |

## 4. 유사도 품질
| 청킹 | 임베딩 | 정답 평균 유사도 | 정답−최고오답 마진 | 질의 인코딩 ms |
|---|---|---|---|---|
| Fixed 150자 | e5-small | 0.861 | -0.001 | 6.2 |
| Recursive 300자 | e5-small | 0.869 | 0.003 | 7.4 |
| Structured Parent-Child | e5-small | 0.877 | 0.013 | 6.4 |
| Fixed 150자 | bge-m3 | 0.586 | 0.017 | 57.9 |
| Recursive 300자 | bge-m3 | 0.590 | 0.036 | 65.8 |
| Structured Parent-Child | bge-m3 | 0.645 | 0.075 | 61.1 |
| Fixed 150자 | ko-sroberta | 0.489 | -0.003 | 16.1 |
| Recursive 300자 | ko-sroberta | 0.475 | 0.011 | 16.4 |
| Structured Parent-Child | ko-sroberta | 0.565 | 0.083 | 15.5 |

## 5. 질문 유형별 MRR
| 청킹 | 임베딩 | 직접질문 | 의역·상황 | 키워드 |
|---|---|---|---|---|
| Fixed 150자 | e5-small | 0.523 | 0.536 | 0.713 |
| Recursive 300자 | e5-small | 0.573 | 0.569 | 0.915 |
| Structured Parent-Child | e5-small | 0.746 | 0.716 | 0.908 |
| Fixed 150자 | bge-m3 | 0.650 | 0.677 | 0.763 |
| Recursive 300자 | bge-m3 | 0.800 | 0.877 | 0.841 |
| Structured Parent-Child | bge-m3 | 0.862 | 0.822 | 0.925 |
| Fixed 150자 | ko-sroberta | 0.632 | 0.653 | 0.701 |
| Recursive 300자 | ko-sroberta | 0.778 | 0.568 | 0.716 |
| Structured Parent-Child | ko-sroberta | 0.809 | 0.827 | 0.807 |
