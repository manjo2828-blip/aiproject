"""하이브리드 서치 정량평가: Structured Parent-Child 청킹 + bge-m3 (dense) + BM25 변형 (sparse).

실행: (rag 폴더에서)  python eval/hybrid_eval.py
출력: eval/results.json
"""
import itertools
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from chunkers import m_structured_pc  # noqa: E402
from queries import QUERIES  # noqa: E402

SRC = HERE.parent.parent / "토끼와_거북이.txt"
EMB_CACHE = HERE / "emb_bge_m3.npz"
MODEL = "BAAI/bge-m3"

# ───────────────────────── 1. 코퍼스: Structured Parent-Child ─────────────────────────
text = SRC.read_text(encoding="utf-8")
entries = m_structured_pc(text)          # 임베딩 단위 = child(150자), 반환 단위 = parent(장)
docs = [e["doc"] for e in entries]
chapters_of = [e["meta"]["chapter"] for e in entries]
chap_names = list(dict.fromkeys(chapters_of))
chap_id = np.array([chap_names.index(c) for c in chapters_of])
N = len(docs)
print(f"child {N}개, parent {len(chap_names)}개, child 평균 {sum(map(len, docs)) / N:.0f}자")

# 정답 라벨: 근거 구절을 포함하는 child = gold. 구절이 경계에 걸려 어느 child에도 없으면 즉시 실패.
gold = []
for typ, q, ev in QUERIES:
    g = [i for i, d in enumerate(docs) if ev in d.replace("\n", " ") or ev in d]
    assert g, f"근거 구절이 어떤 child에도 온전히 들어있지 않음: {ev}"
    gold.append(g)
gold_chap = [sorted({int(chap_id[i]) for i in g}) for g in gold]
types = np.array([t for t, _, _ in QUERIES])
NQ = len(QUERIES)
print(f"질의 {NQ}개 (키워드 {(types == '키워드').sum()}, 의역 {(types == '의역').sum()}), 평균 gold child {np.mean([len(g) for g in gold]):.2f}개")

# ───────────────────────── 2. Dense: bge-m3 ─────────────────────────
if EMB_CACHE.exists() and json.loads(str(np.load(EMB_CACHE)["sig"])) == [docs, [q for _, q, _ in QUERIES]]:
    z = np.load(EMB_CACHE)
    D, Q = z["D"], z["Q"]
else:
    import torch
    from sentence_transformers import SentenceTransformer
    m = SentenceTransformer(MODEL, device="cuda" if torch.cuda.is_available() else "cpu")
    m.half() if torch.cuda.is_available() else None
    D = m.encode(docs, normalize_embeddings=True, batch_size=16)
    Q = m.encode([q for _, q, _ in QUERIES], normalize_embeddings=True, batch_size=16)
    np.savez(EMB_CACHE, D=D, Q=Q, sig=json.dumps([docs, [q for _, q, _ in QUERIES]]))
DENSE = Q.astype(np.float32) @ D.astype(np.float32).T   # (NQ, N) 코사인 유사도

# ───────────────────────── 3. 토크나이저 ─────────────────────────
from kiwipiepy import Kiwi  # noqa: E402

kiwi = Kiwi()
WORD = re.compile(r"[가-힣A-Za-z0-9]+")


def tok_ws(s):
    return WORD.findall(s)


def tok_prefix2(s):
    return [w[:2] for w in WORD.findall(s)]


def _ngrams(s, n):
    out = []
    for w in WORD.findall(s):
        out += [w] if len(w) <= n else [w[i:i + n] for i in range(len(w) - n + 1)]
    return out


def tok_char2(s):
    return _ngrams(s, 2)


def tok_char3(s):
    return _ngrams(s, 3)


def tok_kiwi(s):  # 내용 형태소(체언·용언·부사·어근·외국어·숫자). 조사·어미·기호 제거
    return [t.form for t in kiwi.tokenize(s) if t.tag[0] in "NVM" or t.tag in ("XR", "SL", "SN")]


def tok_kiwi_noun(s):
    return [t.form for t in kiwi.tokenize(s) if t.tag.startswith("NN") or t.tag in ("XR", "NR", "SL", "SN")]


TOKENIZERS = {
    "공백": tok_ws,
    "접두2자": tok_prefix2,
    "문자 2-gram": tok_char2,
    "문자 3-gram": tok_char3,
    "형태소(Kiwi)": tok_kiwi,
    "명사만(Kiwi)": tok_kiwi_noun,
}

# ───────────────────────── 4. BM25 스코어러 ─────────────────────────
class Index:
    def __init__(self, tokenized_docs):
        self.vocab = {}
        for d in tokenized_docs:
            for t in d:
                self.vocab.setdefault(t, len(self.vocab))
        V = len(self.vocab)
        self.tf = np.zeros((len(tokenized_docs), V), dtype=np.float32)
        for i, d in enumerate(tokenized_docs):
            for t in d:
                self.tf[i, self.vocab[t]] += 1
        self.dl = self.tf.sum(1)
        self.avgdl = self.dl.mean()
        self.df = (self.tf > 0).sum(0).astype(np.float32)
        self.n = len(tokenized_docs)

    def qvec(self, toks):
        v = np.zeros(len(self.vocab), dtype=np.float32)
        for t in toks:
            if t in self.vocab:
                v[self.vocab[t]] += 1       # 질의 내 중복 토큰은 횟수만큼 가중
        return v


def score_bm25(ix, qv, k1, b, variant):
    """variant: okapi(Lucene idf) | bm25l | bm25plus.  qv:(Q,V) -> (Q,N)"""
    norm = 1 - b + b * ix.dl / ix.avgdl                      # (N,)
    if variant == "okapi":
        idf = np.log(1 + (ix.n - ix.df + 0.5) / (ix.df + 0.5))
        w = idf * ix.tf * (k1 + 1) / (ix.tf + k1 * norm[:, None])
    elif variant == "bm25l":                                 # 긴 문서 과벌점 보정 (delta=0.5)
        idf = np.log((ix.n + 1) / (ix.df + 0.5))
        c = ix.tf / norm[:, None]
        w = idf * (k1 + 1) * (c + 0.5) / (k1 + c + 0.5) * (ix.tf > 0)
    elif variant == "bm25plus":                              # tf 포화 하한 보정 (delta=1)
        idf = np.log((ix.n + 1) / ix.df.clip(min=1))
        w = idf * (1.0 + ix.tf * (k1 + 1) / (ix.tf + k1 * norm[:, None])) * (ix.tf > 0)
    else:
        raise ValueError(variant)
    return qv @ w.T


def score_tfidf(ix, qv):
    idf = np.log((1 + ix.n) / (1 + ix.df)) + 1
    dw = np.where(ix.tf > 0, 1 + np.log(ix.tf.clip(min=1)), 0) * idf
    dw /= np.linalg.norm(dw, axis=1, keepdims=True).clip(min=1e-9)
    qw = np.where(qv > 0, 1 + np.log(qv.clip(min=1)), 0) * idf
    qw /= np.linalg.norm(qw, axis=1, keepdims=True).clip(min=1e-9)
    return qw @ dw.T


# ───────────────────────── 5. 평가 지표 ─────────────────────────
rng = np.random.default_rng(0)
TIE = rng.permutation(N)           # 동점 시 고정된 임의 순서(편향 방지, 재현 가능)
LOG2 = 1 / np.log2(np.arange(2, 12))
gold_mask = np.zeros((NQ, N), bool)
for qi, g in enumerate(gold):
    gold_mask[qi, g] = True
CH = len(chap_names)
gold_chap_mask = np.zeros((NQ, CH), bool)
for qi, g in enumerate(gold_chap):
    gold_chap_mask[qi, g] = True
METRICS = ["mrr", "hit1", "hit3", "hit5", "ndcg10", "recall5", "p_hit1", "p_mrr"]


def evaluate(S):
    """S:(NQ,N) 점수 -> {지표: (NQ,) 질의별 값}.  child 지표 + parent(장 단위, 중복 제거) 지표."""
    out = {m: np.zeros(NQ) for m in METRICS}
    for qi in range(NQ):
        order = np.lexsort((TIE, -S[qi]))
        rel = gold_mask[qi][order]
        top10 = rel[:10]
        first = np.argmax(rel) if rel.any() else None
        if first is not None and first < 10:
            out["mrr"][qi] = 1 / (first + 1)
        out["hit1"][qi] = rel[:1].any()
        out["hit3"][qi] = rel[:3].any()
        out["hit5"][qi] = rel[:5].any()
        ideal = min(gold_mask[qi].sum(), 10)
        out["ndcg10"][qi] = (top10 * LOG2[:len(top10)]).sum() / LOG2[:ideal].sum()
        out["recall5"][qi] = rel[:5].sum() / gold_mask[qi].sum()
        chaps = list(dict.fromkeys(chap_id[order].tolist()))   # 실제 파이프라인: child 순위 -> parent 중복 제거
        prel = gold_chap_mask[qi][chaps]
        out["p_hit1"][qi] = prel[0]
        out["p_mrr"][qi] = 1 / (np.argmax(prel) + 1)
    return out


def summarize(per_q, mask=None):
    return {m: float(v[mask].mean() if mask is not None else v.mean()) for m, v in per_q.items()}


# ───────────────────────── 6. 점수 결합 ─────────────────────────
def minmax(S):
    lo, hi = S.min(1, keepdims=True), S.max(1, keepdims=True)
    return (S - lo) / (hi - lo + 1e-9)


def zscore(S):
    return (S - S.mean(1, keepdims=True)) / (S.std(1, keepdims=True) + 1e-9)


def ranks(S):
    r = np.zeros_like(S)
    for qi in range(S.shape[0]):
        order = np.lexsort((TIE, -S[qi]))
        r[qi, order] = np.arange(1, S.shape[1] + 1)
    return r


def fuse_linear(Sd, Ss, w, norm):
    f = minmax if norm == "minmax" else zscore
    return w * f(Sd) + (1 - w) * f(Ss)


def fuse_rrf(Rd, Rs, w, k):
    return w / (k + Rd) + (1 - w) / (k + Rs)


WS = [round(x, 1) for x in np.arange(0, 1.01, 0.1)]       # w = dense 비중 (1-w = BM25 비중)
K1S = [0.5, 0.9, 1.2, 1.5, 2.0, 3.0]
BS = [0.0, 0.25, 0.5, 0.75, 1.0]
RRFK = [5, 20, 60]
VARIANTS = ["okapi", "bm25l", "bm25plus"]
VARIANT_LABEL = {"okapi": "BM25 (Okapi)", "bm25l": "BM25L", "bm25plus": "BM25+", "tfidf": "TF-IDF 코사인"}

# ───────────────────────── 7. 전수 실험 ─────────────────────────
t0 = time.time()
Rd = ranks(DENSE)
results = []        # 설정 하나당 한 행
perq_mrr = []       # 설정별 질의별 child RR (교차검증용)
perq_store = {}     # 대표 설정의 질의별 전체 결과


def record(cfg, S, keep=False):
    pq = evaluate(S)
    row = {**cfg, **summarize(pq), "keyword": summarize(pq, types == "키워드"), "para": summarize(pq, types == "의역")}
    results.append(row)
    perq_mrr.append(pq["mrr"])
    if keep:
        perq_store[len(results) - 1] = pq
    return len(results) - 1


dense_idx = record({"family": "dense", "label": "Dense only (bge-m3)"}, DENSE, keep=True)

bm25_scores = {}    # (tok, scorer, k1, b) -> (NQ,N)
for tname, tfn in TOKENIZERS.items():
    ix = Index([tfn(d) for d in docs])
    qv = np.stack([ix.qvec(tfn(q)) for _, q, _ in QUERIES])
    # TF-IDF
    bm25_scores[(tname, "tfidf", None, None)] = score_tfidf(ix, qv)
    for var, k1, b in itertools.product(VARIANTS, K1S, BS):
        bm25_scores[(tname, var, k1, b)] = score_bm25(ix, qv, k1, b, var)
print(f"BM25 점수행렬 {len(bm25_scores)}개 생성 ({time.time() - t0:.1f}s)")

DEF = (1.2, 0.75)
B_DEF = 0.75
bm_only_idx = {}
fusion_idx = {}
for (tname, sc, k1, b), Ss in bm25_scores.items():
    base = {"tok": tname, "scorer": sc, "k1": k1, "b": b}
    i = record({"family": "bm25", "label": f"BM25-only · {tname} · {VARIANT_LABEL[sc]}" + (f" k1={k1} b={b}" if k1 is not None else ""), **base}, Ss)
    bm_only_idx[(tname, sc, k1, b)] = i
    Rs = None
    for norm in ("minmax", "zscore"):
        for w in WS:
            if w in (0.0, 1.0):
                continue
            fusion_idx[(tname, sc, k1, b, "linear-" + norm, w)] = record(
                {"family": "hybrid", "fusion": "linear-" + norm, "w": w,
                 "label": f"Hybrid · {tname} · {VARIANT_LABEL[sc]} · {norm} · dense {w}" + (f" k1={k1} b={b}" if k1 is not None else ""), **base},
                fuse_linear(DENSE, Ss, w, norm))
    Rs = ranks(Ss)
    for kk in RRFK:
        for w in WS:
            if w in (0.0, 1.0):
                continue
            fusion_idx[(tname, sc, k1, b, f"rrf{kk}", w)] = record(
                {"family": "hybrid", "fusion": f"rrf{kk}", "w": w,
                 "label": f"Hybrid · {tname} · {VARIANT_LABEL[sc]} · RRF(k={kk}) · dense {w}" + (f" k1={k1} b={b}" if k1 is not None else ""), **base},
                fuse_rrf(Rd, Rs, w, kk))
print(f"총 {len(results)}개 설정 평가 완료 ({time.time() - t0:.1f}s)")
PQ = np.array(perq_mrr)     # (설정 수, NQ)

# ───────────────────────── 8. 집계 ─────────────────────────
def pick(idx_list, key="mrr"):
    return max(idx_list, key=lambda i: (results[i][key], results[i]["ndcg10"]))


out = {"meta": {
    "model": MODEL, "chunking": "Structured Parent-Child (장→문단 구조 청킹 후 150자/25자 겹침 child, 부모=장 전문)",
    "n_children": N, "n_parents": len(chap_names), "avg_child_chars": round(sum(map(len, docs)) / N, 1),
    "n_queries": NQ, "n_keyword": int((types == "키워드").sum()), "n_para": int((types == "의역").sum()),
    "avg_gold_children": round(float(np.mean([len(g) for g in gold])), 2), "n_configs": len(results),
    "tokenizers": list(TOKENIZERS), "k1s": K1S, "bs": BS, "ws": WS, "rrf_k": RRFK,
}}

# (a) BM25 단독: 토크나이저 × 스코어러 (기본 k1=1.2, b=0.75 와, k1/b 그리드 최적)
bm_tab = []
for tname in TOKENIZERS:
    for sc in ["okapi", "bm25l", "bm25plus", "tfidf"]:
        if sc == "tfidf":
            d_i = best_i = bm_only_idx[(tname, sc, None, None)]
        else:
            d_i = bm_only_idx[(tname, sc, *DEF)]
            best_i = pick([bm_only_idx[(tname, sc, k1, b)] for k1 in K1S for b in BS])
        bm_tab.append({"tok": tname, "scorer": sc, "default": {m: results[d_i][m] for m in METRICS},
                       "tuned": {m: results[best_i][m] for m in METRICS},
                       "k1": results[best_i]["k1"], "b": results[best_i]["b"]})
out["bm25_only"] = bm_tab

# (b) BM25 k1×b 민감도 (Okapi, 토크나이저별 MRR)
out["bm25_param"] = {t: [[results[bm_only_idx[(t, "okapi", k1, b)]]["mrr"] for b in BS] for k1 in K1S] for t in TOKENIZERS}

# (c) 가중치 곡선: 토크나이저별 (Okapi 기본 파라미터) × 결합방식 — w=0(BM25 only)~1(dense only)
curves = {}
for tname in TOKENIZERS:
    bm0 = bm_only_idx[(tname, "okapi", *DEF)]
    for fus in ["linear-minmax", "linear-zscore"] + [f"rrf{k}" for k in RRFK]:
        pts = [{"w": 0.0, **{m: results[bm0][m] for m in ("mrr", "hit1", "ndcg10", "p_hit1", "p_mrr")}}]
        for w in WS[1:-1]:
            r = results[fusion_idx[(tname, "okapi", *DEF, fus, w)]]
            pts.append({"w": w, **{m: r[m] for m in ("mrr", "hit1", "ndcg10", "p_hit1", "p_mrr")}})
        pts.append({"w": 1.0, **{m: results[dense_idx][m] for m in ("mrr", "hit1", "ndcg10", "p_hit1", "p_mrr")}})
        curves[f"{tname}|{fus}"] = pts
out["curves"] = curves

# (d) 스코어러별 가중치 곡선 (토크나이저=Kiwi 형태소, linear-minmax) — scoring 방식 비교
sc_curves = {}
for tname in ("형태소(Kiwi)", "문자 2-gram"):
    for sc in ["okapi", "bm25l", "bm25plus", "tfidf"]:
        kk = (None, None) if sc == "tfidf" else DEF
        pts = []
        for w in WS:
            if w == 0.0:
                r = results[bm_only_idx[(tname, sc, *kk)]]
            elif w == 1.0:
                r = results[dense_idx]
            else:
                r = results[fusion_idx[(tname, sc, *kk, "linear-minmax", w)]]
            pts.append({"w": w, "mrr": r["mrr"], "ndcg10": r["ndcg10"], "hit1": r["hit1"]})
        sc_curves[f"{tname}|{sc}"] = pts
out["scorer_curves"] = sc_curves

# (e) 리더보드: 하이브리드 상위 30 (MRR 기준)  / 기본 파라미터 한정 상위 15
hy = [i for i, r in enumerate(results) if r["family"] == "hybrid"]
slim = lambda i: {k: v for k, v in results[i].items()}
out["leaderboard"] = [slim(i) for i in sorted(hy, key=lambda i: (-results[i]["mrr"], -results[i]["ndcg10"]))[:30]]
hy_def = [i for i in hy if results[i]["scorer"] == "tfidf" or (results[i]["k1"], results[i]["b"]) == DEF]
out["leaderboard_default"] = [slim(i) for i in sorted(hy_def, key=lambda i: (-results[i]["mrr"], -results[i]["ndcg10"]))[:15]]

# (f) 대표 설정 3개: Dense / 최고 BM25 단독 / 최고 하이브리드
best_bm = pick([i for i, r in enumerate(results) if r["family"] == "bm25"])
best_hy = pick(hy)
for i in (dense_idx, best_bm, best_hy):
    if i not in perq_store:
        # 재계산으로 질의별 값 확보
        r = results[i]
        if r["family"] == "bm25":
            S = bm25_scores[(r["tok"], r["scorer"], r["k1"], r["b"])]
        else:
            Ss = bm25_scores[(r["tok"], r["scorer"], r["k1"], r["b"])]
            S = fuse_rrf(Rd, ranks(Ss), r["w"], int(r["fusion"][3:])) if r["fusion"].startswith("rrf") else fuse_linear(DENSE, Ss, r["w"], r["fusion"].split("-")[1])
        perq_store[i] = evaluate(S)
        perq_store[i]["_S"] = S
out["headline"] = {"dense": slim(dense_idx), "best_bm25": slim(best_bm), "best_hybrid": slim(best_hy)}

# (g) 질의별 상세 + 실패 사례 (최고 하이브리드)
rb = results[best_hy]
Sb = perq_store[best_hy].get("_S")
if Sb is None:
    Ss = bm25_scores[(rb["tok"], rb["scorer"], rb["k1"], rb["b"])]
    Sb = fuse_rrf(Rd, ranks(Ss), rb["w"], int(rb["fusion"][3:])) if rb["fusion"].startswith("rrf") else fuse_linear(DENSE, Ss, rb["w"], rb["fusion"].split("-")[1])
rbm = results[best_bm]
Sbm = bm25_scores[(rbm["tok"], rbm["scorer"], rbm["k1"], rbm["b"])]


def rank_of_gold(S, qi):
    order = np.lexsort((TIE, -S[qi]))
    rel = gold_mask[qi][order]
    return int(np.argmax(rel)) + 1


per_query = []
for qi, (typ, q, ev) in enumerate(QUERIES):
    order = np.lexsort((TIE, -Sb[qi]))
    per_query.append({
        "type": typ, "q": q, "evidence": ev, "gold_chapter": [chap_names[c] for c in gold_chap[qi]],
        "rank_dense": rank_of_gold(DENSE, qi), "rank_bm25": rank_of_gold(Sbm, qi), "rank_hybrid": rank_of_gold(Sb, qi),
        "top1_hybrid": docs[order[0]].split("\n", 1)[-1][:90], "top1_chapter": chap_names[int(chap_id[order[0]])],
    })
out["per_query"] = per_query

# (h) 교차검증: 반으로 나눠 한쪽에서 최적 설정을 고르고 다른 쪽에서 성능 측정 (200회) — 튜닝 과적합 점검
cv_rng = np.random.default_rng(42)
fam = np.array([r["family"] for r in results])
hy_mask = fam == "hybrid"
dev_scores, test_scores, test_dense, test_bmbest, test_hy_default = [], [], [], [], []
bm_default_idx = bm_only_idx[("형태소(Kiwi)", "okapi", *DEF)]
hy_default_idx = fusion_idx[("형태소(Kiwi)", "okapi", *DEF, "linear-minmax", 0.5)]
for _ in range(200):
    perm = cv_rng.permutation(NQ)
    dev, te = perm[:NQ // 2], perm[NQ // 2:]
    cand = np.where(hy_mask)[0]
    pick_i = cand[np.argmax(PQ[cand][:, dev].mean(1))]
    dev_scores.append(PQ[pick_i, dev].mean())
    test_scores.append(PQ[pick_i, te].mean())
    test_dense.append(PQ[dense_idx, te].mean())
    bcand = np.where(fam == "bm25")[0]
    test_bmbest.append(PQ[bcand[np.argmax(PQ[bcand][:, dev].mean(1))], te].mean())
    test_hy_default.append(PQ[hy_default_idx, te].mean())
out["cv"] = {
    "runs": 200,
    "dev_selected_hybrid": {"dev": float(np.mean(dev_scores)), "test": float(np.mean(test_scores)), "test_std": float(np.std(test_scores))},
    "dev_selected_bm25": {"test": float(np.mean(test_bmbest))},
    "dense_test": float(np.mean(test_dense)),
    "fixed_default_hybrid_test": float(np.mean(test_hy_default)),
    "full_data_best": results[best_hy]["mrr"],
}

# (i) 실용 추천 설정: 파라미터·가중치를 건드리지 않은 "기본값 하이브리드" 의 안정성
#     같은 토크나이저·Okapi 기본값에서 w∈[0.3,0.8] 구간의 MRR 평균/최저
stab = {}
for tname in TOKENIZERS:
    for fus in ["linear-minmax", "linear-zscore", "rrf20"]:
        vals = [results[fusion_idx[(tname, "okapi", *DEF, fus, w)]]["mrr"] for w in WS[1:-1]]
        stab[f"{tname}|{fus}"] = {"mean": float(np.mean(vals)), "min": float(np.min(vals)), "max": float(np.max(vals))}
out["stability"] = stab

# (j) 청킹 입도 참고: 부모 반환 평균 길이
out["meta"]["avg_parent_chars"] = round(float(np.mean([len(e["meta"]["return_text"]) for e in entries])), 0)

(HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
h = out["headline"]
print("\n=== 대표 결과 (child MRR@10 / nDCG@10 / Hit@1 / 장 Hit@1) ===")
for k, r in h.items():
    print(f"{k:12s} {r['label'][:70]:70s} MRR {r['mrr']:.3f} nDCG {r['ndcg10']:.3f} H@1 {r['hit1']:.3f} P-H@1 {r['p_hit1']:.3f}")
print("CV:", json.dumps(out["cv"], ensure_ascii=False))
