"""하이브리드 후보를 크로스인코더로 리랭킹(점수 높은 순 재정렬)하고 같은 질의셋으로 평가.

실행: (rag 폴더에서)  python eval/rerank_eval.py     -> eval/rerank_results.json
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import hybrid_eval as H  # noqa: E402  (코퍼스·점수·지표 재사용. import 시 전체 그리드가 한 번 실행됨)

RERANKER = "BAAI/bge-reranker-v2-m3"
CACHE = HERE / "rerank_scores.npy"
queries = [q for _, q, _ in H.QUERIES]

if CACHE.exists():
    R = np.load(CACHE)
else:
    import torch
    from sentence_transformers import CrossEncoder
    ce = CrossEncoder(RERANKER, device="cuda" if torch.cuda.is_available() else "cpu", max_length=512,
                      model_kwargs={"torch_dtype": torch.float16} if torch.cuda.is_available() else {})
    pairs = [(q, d) for q in queries for d in H.docs]
    R = np.array(ce.predict(pairs, batch_size=32, show_progress_bar=False), dtype=np.float32).reshape(len(queries), H.N)
    np.save(CACHE, R)
print("리랭커 점수", R.shape)


def rerank(S, k, mix=None):
    """S의 상위 k개 후보만 리랭커 점수로 재정렬하고, k위 밖은 원래 순서로 뒤에 둔다. mix=a면 a*리랭커z + (1-a)*원점수z."""
    out = np.zeros_like(S)
    for qi in range(S.shape[0]):
        order = np.lexsort((H.TIE, -S[qi]))
        top, rest = order[:k], order[k:]
        r = R[qi, top]
        if mix is not None:
            z = lambda x: (x - x.mean()) / (x.std() + 1e-9)
            r = mix * z(r) + (1 - mix) * z(S[qi, top])
        new_top = top[np.lexsort((H.TIE[top], -r))]
        final = np.concatenate([new_top, rest])
        out[qi, final] = np.arange(len(final), 0, -1)       # 앞 순서일수록 큰 점수
    return out


DEF = H.DEF
def bm(tok, sc, k1=1.2, b=0.75):
    return H.bm25_scores[(tok, sc, k1, b)]

bases = {
    "Dense (bge-m3)": H.DENSE,
    "BM25 최고 (Kiwi·Okapi k1=3,b=0)": bm("형태소(Kiwi)", "okapi", 3.0, 0.0),
    "하이브리드 기본 (Kiwi·Okapi·min-max·0.5)": H.fuse_linear(H.DENSE, bm("형태소(Kiwi)", "okapi"), 0.5, "minmax"),
    "하이브리드 최고 (BM25+·z-score·0.6)": H.fuse_linear(H.DENSE, bm("형태소(Kiwi)", "bm25plus", 3.0, 1.0), 0.6, "zscore"),
}
KS = [5, 10, 20, H.N]
METRICS = ["mrr", "ndcg10", "hit1", "hit3", "hit5", "recall5", "p_hit1", "p_mrr"]
rows = []
for name, S in bases.items():
    pq = H.evaluate(S)
    rows.append({"base": name, "method": "리랭킹 없음", "k": 0, **H.summarize(pq),
                 "keyword": H.summarize(pq, H.types == "키워드"), "para": H.summarize(pq, H.types == "의역")})
    for k in KS:
        for mix, mlabel in ((None, "리랭커 점수만"), (0.5, "리랭커+원점수 50:50")):
            pq = H.evaluate(rerank(S, k, mix))
            rows.append({"base": name, "method": mlabel, "k": k, **H.summarize(pq),
                         "keyword": H.summarize(pq, H.types == "키워드"), "para": H.summarize(pq, H.types == "의역")})
# 리랭커 단독(전체 child를 리랭커로 정렬)
pq = H.evaluate(R)
rows.append({"base": "리랭커 단독 (전체 51개)", "method": "리랭커 점수만", "k": H.N, **H.summarize(pq),
             "keyword": H.summarize(pq, H.types == "키워드"), "para": H.summarize(pq, H.types == "의역")})

# 질의별 순위 목록: 하이브리드 기본 → 리랭킹(상위 20, 리랭커 점수만)
S0 = bases["하이브리드 기본 (Kiwi·Okapi·min-max·0.5)"]
S1 = rerank(S0, 20, None)
per_query = []
for qi, (typ, q, ev) in enumerate(H.QUERIES):
    o0 = np.lexsort((H.TIE, -S0[qi])); o1 = np.lexsort((H.TIE, -S1[qi]))
    pos0 = {int(d): i + 1 for i, d in enumerate(o0)}
    per_query.append({
        "type": typ, "q": q, "gold_rank_before": int(np.argmax(H.gold_mask[qi][o0])) + 1,
        "gold_rank_after": int(np.argmax(H.gold_mask[qi][o1])) + 1,
        "after": [{"rank": i + 1, "before": pos0[int(d)], "score": round(float(R[qi, d]), 3), "gold": bool(H.gold_mask[qi, d]),
                   "chapter": H.chap_names[int(H.chap_id[d])], "text": H.docs[d].split("\n", 1)[-1].replace("\n", " ")}
                  for i, d in enumerate(o1[:5])],
    })

out = {"reranker": RERANKER, "base_for_demo": "하이브리드 기본 (Kiwi·Okapi·min-max·0.5)", "demo_k": 20, "rows": rows, "per_query": per_query}
(HERE / "rerank_results.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{'기반':44s} {'방식':18s} {'K':>3s}  MRR   nDCG  H@1   H@5  장H@1")
for r in rows:
    print(f"{r['base'][:44]:44s} {r['method']:18s} {r['k']:>3d}  {r['mrr']:.3f} {r['ndcg10']:.3f} {r['hit1']:.3f} {r['hit5']:.3f} {r['p_hit1']:.3f}")
