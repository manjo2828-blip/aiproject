r"""Benchmark v2: broad-consensus leave-one-out GT over all models. Reuses cached detections.
Run from project root: .venv\Scripts\python -m bench.run_v2"""
import glob
import importlib
import json
from pathlib import Path

import cv2
import numpy as np

from . import metrics as M

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
GT_MIN_SCORE = 0.35
KS = (4, 5, 8)
PRIMARY = 5
MIN_H = 8.0
AR_RANGE = (0.1, 2.0)  # w/h
BUCKETS = [("tiny", 0, 32), ("small", 32, 96), ("medium", 96, 1e9)]
THRS = [round(0.25 + 0.05 * i, 2) for i in range(14)]  # 0.25..0.90
IOUS = M.IOUS


def keep_box(b):
    w, h = b[2] - b[0], b[3] - b[1]
    return h >= MIN_H and w > 0 and AR_RANGE[0] <= w / h <= AR_RANGE[1]


def gt_sets(persons, files, exclude=None):
    res = {k: {} for k in KS}
    for f in files:
        pm = {m: [(s, b) for s, b in persons[m][f] if s >= GT_MIN_SCORE]
              for m in persons if m != exclude}
        cl = M.wbf(pm, 0.55)
        for k in KS:
            res[k][f] = [c["box"].tolist() for c in cl if c["support"] >= k and keep_box(c["box"])]
    return res


def heights(gts):
    g = np.asarray(gts, float).reshape(-1, 4)
    return g[:, 3] - g[:, 1]


def eval_image(preds, gts):
    gts = np.asarray(gts, float).reshape(-1, 4)
    h = heights(gts)
    d = {"n_gt": len(gts)}
    for t in THRS:
        pr = [p for p in preds if p[0] >= t]
        tp, _, used = M.match(pr, gts, 0.5)
        d[f"tp@{t}"] = int(tp.sum())
        d[f"np@{t}"] = len(pr)
        if t == 0.25:
            for name, lo, hi in BUCKETS:
                msk = (h >= lo) & (h < hi)
                d[f"n_{name}"] = int(msk.sum())
                d[f"tp_{name}"] = int(sum(1 for j in used if msk[j]))
    d["ap"] = {}
    for t in IOUS:
        tp, sc, _ = M.match(preds, gts, t)
        d["ap"][t] = M.ap_allpoint(tp, len(gts))
    return d


def at(d, t):
    return M.prf(d[f"tp@{t}"], d[f"np@{t}"], d["n_gt"])


def summarize(ds):
    out = {}
    for t in (0.25, 0.5):
        P, R, F = zip(*[at(d, t) for d in ds])
        out[f"precision@{t}"] = float(np.nanmean(P))
        out[f"recall@{t}"] = float(np.nanmean(R))
        out[f"f1@{t}"] = float(np.nanmean(F))
    sweep = {t: float(np.nanmean([at(d, t)[2] for d in ds])) for t in THRS}
    bt = max(sweep, key=sweep.get)
    out["best_f1"] = sweep[bt]
    out["best_f1_thr"] = bt
    out["f1_sweep"] = {str(k): v for k, v in sweep.items()}
    out["AP50"] = float(np.nanmean([d["ap"][0.5] for d in ds]))
    out["pseudoAP"] = float(np.nanmean([np.nanmean([d["ap"][t] for t in IOUS]) for d in ds]))
    for name, _, _ in BUCKETS:
        n = sum(d[f"n_{name}"] for d in ds)
        out[f"n_{name}_gt"] = n
        out[f"recall_{name}"] = sum(d[f"tp_{name}"] for d in ds) / n if n else float("nan")
    out["n_gt_persons"] = sum(d["n_gt"] for d in ds)
    out["n_pred_persons"] = sum(d["np@0.25"] for d in ds)
    return out


def ranks(v):
    v = np.asarray(v, float)
    order = v.argsort()
    r = np.empty(len(v))
    i = 0
    while i < len(v):
        j = i
        while j + 1 < len(v) and v[order[j + 1]] == v[order[i]]:
            j += 1
        r[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(a, b):
    return float(np.corrcoef(ranks(a), ranks(b))[0, 1])


def main():
    recs = [json.loads(Path(p).read_text()) for p in sorted(glob.glob(str(OUT / "cache" / "*.json")))]
    recs = [r for r in recs if "error" not in r]
    v1 = json.loads((OUT / "results.json").read_text())
    files = [i["file"] for i in v1["images"]]
    persons = {r["module"]: {f: [(d["score"], d["bbox"]) for d in r["images"][f]["dets"]
                                 if d["cls"] == 0 and d["score"] >= 0.25] for f in files} for r in recs}
    print(len(persons), "models", flush=True)
    full = gt_sets(persons, files)
    loo = {m: gt_sets(persons, files, exclude=m) for m in persons}
    v1m = {m["module"]: m for m in v1["models"] if "error" not in m}
    models, per_k = [], {k: {} for k in KS}
    for r in recs:
        m = r["module"]
        o = {k: r.get(k) for k in ("name", "family", "license", "params_m", "file_mb", "coco_ap", "input", "load_ms")}
        o["module"] = m
        o["latency_ms_mean"] = round(float(np.mean([r["images"][f]["latency_ms"] for f in files])), 1)
        o["by_k"] = {}
        for k in KS:
            ds = {f: eval_image(persons[m][f], loo[m][k][f]) for f in files}
            s = summarize(list(ds.values()))
            if k == PRIMARY:
                o["metrics_by_image"] = {f: {kk: vv for kk, vv in summarize([ds[f]]).items() if kk != "f1_sweep"}
                                         for f in files}
            o["by_k"][str(k)] = s
            per_k[k][m] = s
        o["metrics_overall"] = {"macro": dict(o["by_k"][str(PRIMARY)])}
        o["v1_macro"] = v1m[m]["metrics_overall"]["macro"]
        models.append(o)

    images = []
    for im in v1["images"]:
        f = im["file"]
        h = heights(full[PRIMARY][f])
        images.append({"file": f, "w": im["w"], "h": im["h"], "n_gt_v1": im["n_gt"],
                       "n_gt_v2": {str(k): len(full[k][f]) for k in KS},
                       "v2_bucket_counts_k5": {n: int(((h >= lo) & (h < hi)).sum()) for n, lo, hi in BUCKETS},
                       "gt_v1": im["gt_boxes"],
                       "gt_v2": [[round(v, 1) for v in b] for b in full[PRIMARY][f]]})

    mods = [o["module"] for o in models]
    coco = [o["coco_ap"] for o in models]
    stab = {}
    for key, label in (("f1@0.25", "F1@0.25"), ("AP50", "AP50"), ("best_f1", "bestF1")):
        series = {f"v2_k{k}": [per_k[k][m][key] for m in mods] for k in KS}
        if key != "best_f1":
            series = {"v1": [o["v1_macro"][key] for o in models], **series}
        series["coco_ap"] = coco
        names = list(series)
        stab[label] = {a: {b: round(spearman(series[a], series[b]), 3) for b in names} for a in names}

    side = {}
    imgs = {f: cv2.imread(str(ROOT / "images" / f)) for f in files}
    for mod in ("yolov10n", "yolov10s"):
        det = importlib.import_module(f"bench.adapters.{mod}").load()
        low = {f: [(float(d["score"]), [float(v) for v in d["bbox"]])
                   for d in det.detect(imgs[f], 0.05, 0.45) if int(d["cls"]) == 0] for f in files}
        row = {}
        for c in (0.05, 0.1, 0.15, 0.25):
            ds, npred = [], 0
            for f in files:
                gts = np.asarray(loo[mod][PRIMARY][f], float).reshape(-1, 4)
                pr = [p for p in low[f] if p[0] >= c]
                npred += len(pr)
                tp, _, _ = M.match(pr, gts, 0.5)
                ds.append(M.prf(int(tp.sum()), len(pr), len(gts)))
            row[str(c)] = {"precision": float(np.nanmean([x[0] for x in ds])),
                           "recall": float(np.nanmean([x[1] for x in ds])),
                           "f1": float(np.nanmean([x[2] for x in ds])), "n_pred": npred}
        side[mod] = row
        print(mod, row, flush=True)

    res = {"gt_note": "GT v2 broad consensus: per scored model, WBF(IoU .55) of person dets (score>=%.2f) of ALL OTHER "
                      "models, kept if >=k distinct supporters (k in %s, primary %d); boxes h<%g px or w/h outside %s "
                      "dropped. Buckets by GT height at 1600px width: tiny<32, small 32-96, medium>=96."
                      % (GT_MIN_SCORE, list(KS), PRIMARY, MIN_H, AR_RANGE),
           "images": images, "models": models, "rank_stability": stab, "yolov10_lowconf_side_note": side}
    (OUT / "results_v2.json").write_text(json.dumps(res, indent=1, default=float))
    print("saved")


if __name__ == "__main__":
    main()
