"""3 청킹 × 3 임베딩 = 9 케이스 정량평가. 사용: python eval/run_eval.py"""
import json, math, sys, time
import numpy as np
from sentence_transformers import SentenceTransformer
sys.path.insert(0, "eval")
from questions_data import DATA, QTYPES

MODELS = {  # 이름: (HF id, 질의 접두어, 문서 접두어)
    "e5-small": ("intfloat/multilingual-e5-small", "query: ", "passage: "),
    "bge-m3": ("BAAI/bge-m3", "", ""),
    "ko-sroberta": ("jhgan/ko-sroberta-multitask", "", ""),
}
KS = (1, 3, 5, 10)
chunks = json.load(open("eval/chunks.json", encoding="utf-8"))

# 질문셋 저장(재현·검토용)
qset = {m: [{"chunk_idx": i, "return_id": chunks[m][i]["return_id"], "qtype": QTYPES[j], "question": q}
            for i, qs in enumerate(DATA[m]) for j, q in enumerate(qs)] for m in DATA}
json.dump(qset, open("eval/eval_set.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

rows, detail = [], {}
for mname, (hf, qp, dp) in MODELS.items():
    model = SentenceTransformer(hf)
    enc = lambda xs, p: model.encode([p + x for x in xs], normalize_embeddings=True, batch_size=16)
    for cname, ents in chunks.items():
        D = enc([e["text"] for e in ents], dp)
        rids = [e["return_id"] for e in ents]
        uniq = list(dict.fromkeys(rids))
        qs = qset[cname]
        t0 = time.perf_counter()
        Q = enc([q["question"] for q in qs], qp)
        enc_ms = (time.perf_counter() - t0) * 1000 / len(qs)
        S = Q @ D.T
        ranks, crank, top1, gold, margin, per_q = [], [], [], [], [], []
        for qi, q in enumerate(qs):
            order = np.argsort(-S[qi])
            seen, ranked = set(), []  # 반환단위(부모) 중복 제거 순위
            for j in order:
                if rids[j] not in seen:
                    seen.add(rids[j]); ranked.append((rids[j], S[qi, j]))
            r = [x[0] for x in ranked].index(q["return_id"]) + 1
            ranks.append(r)
            crank.append(int(np.where(order == q["chunk_idx"])[0][0]) + 1)  # 원본 child/청크 자체의 순위
            top1.append(ranked[0][1])
            g = dict(ranked)[q["return_id"]]
            gold.append(g)
            wrong_best = max([s for rid, s in ranked if rid != q["return_id"]], default=0)
            margin.append(g - wrong_best)
            per_q.append(r)
        ranks, crank = np.array(ranks), np.array(crank)
        n_units = len(uniq)
        ret_len = np.mean([len(e["text"]) for e in ents])
        res = {"model": mname, "chunking": cname, "n_q": len(qs), "n_units": n_units, "n_entries": len(ents)}
        for k in KS:
            res[f"hit@{k}"] = float((ranks <= k).mean())
            res[f"chance@{k}"] = min(1.0, k / n_units)
        res["mrr"] = float((1 / ranks).mean())
        res["mrr@10"] = float(np.where(ranks <= 10, 1 / ranks, 0).mean())
        res["ndcg@10"] = float(np.where(ranks <= 10, 1 / np.log2(ranks + 1), 0).mean())
        res["mean_rank"] = float(ranks.mean())
        res["median_rank"] = float(np.median(ranks))
        res["mrr_lift"] = res["mrr"] / np.mean([1 / r for r in range(1, n_units + 1)])  # 무작위 기대 MRR 대비 배수
        res["gold_score"] = float(np.mean(gold))
        res["margin"] = float(np.mean(margin))        # 정답 유사도 − 최고 오답 유사도
        res["top1_hit_conf"] = float(np.mean([t for t, r in zip(top1, ranks) if r == 1])) if (ranks == 1).any() else 0.0
        res["child_hit@1"] = float((crank == 1).mean())  # 부모가 아닌 '질문을 만든 그 청크'를 정확히 찾았는가
        res["child_hit@5"] = float((crank <= 5).mean())
        res["child_mrr"] = float((1 / crank).mean())
        res["enc_ms_per_q"] = enc_ms
        res["avg_entry_chars"] = float(ret_len)
        res["avg_returned_chars"] = float(np.mean([len(next(e["text"] for e in ents if e["return_id"] == qq["return_id"])) if cname != "structured_pc" else 0 for qq in qs])) if cname != "structured_pc" else None
        for t in QTYPES:
            idx = [i for i, q in enumerate(qs) if q["qtype"] == t]
            res[f"mrr[{t}]"] = float((1 / ranks[idx]).mean())
            res[f"hit@1[{t}]"] = float((ranks[idx] == 1).mean())
        rows.append(res)
        detail[f"{cname}|{mname}"] = [{"q": q["question"], "type": q["qtype"], "gold": q["return_id"], "rank": int(r), "child_rank": int(c)}
                                      for q, r, c in zip(qs, ranks, crank)]
        print(f"{cname:<14}{mname:<12} hit@1={res['hit@1']:.3f} hit@5={res['hit@5']:.3f} mrr={res['mrr']:.3f} child@1={res['child_hit@1']:.3f}", flush=True)
json.dump({"rows": rows, "detail": detail}, open("eval/results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
