import json
R = json.load(open("eval/results.json", encoding="utf-8"))["rows"]
CN = {"fixed150": "Fixed 150자", "recursive": "Recursive 300자", "structured_pc": "Structured Parent-Child"}
def tbl(cols, fmt):
    h = "| 청킹 | 임베딩 | " + " | ".join(c[0] for c in cols) + " |\n|" + "---|" * (len(cols) + 2) + "\n"
    return h + "".join(f"| {CN[r['chunking']]} | {r['model']} | " + " | ".join(fmt(r, c[1]) for c in cols) + " |\n" for r in R)
p = lambda r, k: f"{r[k]:.3f}"
o = "# 정량평가 결과 (3 청킹 × 3 임베딩 = 9 케이스)\n\n"
o += f"- 질문 수: " + ", ".join(f"{CN[c]} {next(r['n_q'] for r in R if r['chunking']==c)}문항(청크 {next(r['n_q'] for r in R if r['chunking']==c)//3}개×3)" for c in CN) + "\n"
o += "- 정답 = 질문을 만든 청크(Parent-Child는 그 청크의 부모 챕터). 반환단위 기준으로 중복 제거 후 순위 산정.\n\n"
o += "## 1. 핵심 지표\n" + tbl([("Hit@1","hit@1"),("Hit@3","hit@3"),("Hit@5","hit@5"),("Hit@10","hit@10"),("MRR","mrr"),("nDCG@10","ndcg@10"),("평균순위","mean_rank")], p)
o += "\n## 2. 우연 대비 (반환 단위 수가 달라 직접 비교 시 주의)\n" + tbl([("반환단위 수","n_units"),("무작위 Hit@1","chance@1"),("Hit@1","hit@1"),("무작위 Hit@5","chance@5"),("Hit@5","hit@5"),("MRR 우연대비 배수","mrr_lift")],
    lambda r,k: str(r[k]) if k=="n_units" else (f"{r[k]:.1f}x" if k=="mrr_lift" else f"{r[k]:.3f}"))
o += "\n## 3. 원본 청크 정확 적중 (Parent-Child의 child 단위, 부모 반환 효과 제거)\n" + tbl([("Child Hit@1","child_hit@1"),("Child Hit@5","child_hit@5"),("Child MRR","child_mrr")], p)
o += "\n## 4. 유사도 품질\n" + tbl([("정답 평균 유사도","gold_score"),("정답−최고오답 마진","margin"),("질의 인코딩 ms","enc_ms_per_q")], lambda r,k: f"{r[k]:.1f}" if k=="enc_ms_per_q" else f"{r[k]:.3f}")
o += "\n## 5. 질문 유형별 MRR\n" + tbl([("직접질문","mrr[직접질문]"),("의역·상황","mrr[의역·상황]"),("키워드","mrr[키워드]")], p)
open("eval/report.md", "w", encoding="utf-8").write(o)
print(o)
