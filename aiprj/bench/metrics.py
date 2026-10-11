"""Person-only pseudo-GT (WBF consensus) + detection metrics. numpy only."""
import numpy as np

ENSEMBLE = ["yolox_x", "yolox_l", "yolov8m", "yolo11m", "yolov7", "rtdetr_r50"]
GT_SCORE_MIN = 0.3
WBF_IOU = 0.55
MIN_SUPPORT = 3
SMALL_H = 40.0  # px at the 1600px-wide image scale (all bench images are 1600 wide)
IOUS = [round(0.5 + 0.05 * i, 2) for i in range(10)]


def iou_mat(a, b):
    a, b = np.asarray(a, float).reshape(-1, 4), np.asarray(b, float).reshape(-1, 4)
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)))
    lt = np.maximum(a[:, None, :2], b[None, :, :2])
    rb = np.minimum(a[:, None, 2:], b[None, :, 2:])
    inter = np.clip(rb - lt, 0, None).prod(2)

    def ar(x):
        return (x[:, 2] - x[:, 0]) * (x[:, 3] - x[:, 1])
    return inter / (ar(a)[:, None] + ar(b)[None] - inter + 1e-9)


def wbf(per_model, iou_thr=WBF_IOU):
    """per_model: {model: [(score, [x1,y1,x2,y2]), ...]} -> [{box, score, support}].
    Weighted box fusion: score-desc greedy clustering against running fused box;
    fused coords = score-weighted mean; support = #distinct models in cluster."""
    items = sorted(((s, b, m) for m, L in per_model.items() for s, b in L), key=lambda t: -t[0])
    clusters = []
    for s, b, m in items:
        b = np.asarray(b, float)
        best, bi = 0.0, -1
        if clusters:
            ious = iou_mat(b[None], np.array([c["box"] for c in clusters]))[0]
            bi = int(ious.argmax())
            best = ious[bi]
        if bi >= 0 and best > iou_thr:
            c = clusters[bi]
            c["items"].append((s, b, m))
            w = np.array([i[0] for i in c["items"]])
            c["box"] = (np.array([i[1] for i in c["items"]]) * w[:, None]).sum(0) / w.sum()
        else:
            clusters.append({"items": [(s, b, m)], "box": b.copy()})
    return [{"box": c["box"], "score": float(np.mean([i[0] for i in c["items"]])),
             "support": len({i[2] for i in c["items"]})} for c in clusters]


def pseudo_gt(persons, exclude=None, min_support=MIN_SUPPORT):
    pm = {m: [(s, b) for s, b in L if s >= GT_SCORE_MIN] for m, L in persons.items() if m != exclude}
    return [f["box"].tolist() for f in wbf(pm) if f["support"] >= min_support]


def match(preds, gts, thr):
    """Greedy match by descending score. Returns (tp flags, sorted scores, used gt idx)."""
    preds = sorted(preds, key=lambda p: -p[0])
    tp = np.zeros(len(preds), bool)
    used = set()
    if preds and len(gts):
        Mx = iou_mat([p[1] for p in preds], gts)
        for i in range(len(preds)):
            row = Mx[i].copy()
            for j in used:
                row[j] = -1
            j = int(row.argmax())
            if row[j] >= thr:
                tp[i] = True
                used.add(j)
    return tp, np.array([p[0] for p in preds]), used


def ap_allpoint(tp, n_gt):
    """All-point interpolated AP (area under monotone PR envelope)."""
    if n_gt == 0:
        return float("nan")
    if len(tp) == 0:
        return 0.0
    ctp = np.cumsum(tp)
    cfp = np.cumsum(~tp)
    rec = ctp / n_gt
    prec = ctp / np.maximum(ctp + cfp, 1)
    mrec = np.concatenate([[0], rec, [1]])
    mpre = np.concatenate([[0], prec, [0]])
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]).sum())


def prf(tp_n, n_pred, n_gt):
    p = tp_n / n_pred if n_pred else 0.0
    r = tp_n / n_gt if n_gt else float("nan")
    f = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
    return p, r, f


def image_counts(preds, gts):
    """preds: [(score, box)] with score>=0.25. Raw stats for per-image + pooling."""
    gts = np.asarray(gts, float).reshape(-1, 4)
    small = (gts[:, 3] - gts[:, 1]) < SMALL_H if len(gts) else np.zeros(0, bool)
    d = {"n_gt": len(gts), "n_pred": len(preds), "n_small": int(small.sum())}
    for conf in (0.25, 0.5):
        pr = [p for p in preds if p[0] >= conf]
        tp, _, used = match(pr, gts, 0.5)
        d[f"tp@{conf}"] = int(tp.sum())
        d[f"npred@{conf}"] = len(pr)
        if conf == 0.25:
            d["small_tp"] = int(sum(1 for j in used if small[j]))
    d["_tp_by_iou"] = {}
    for t in IOUS:
        tp, sc, _ = match(preds, gts, t)
        d["_tp_by_iou"][t] = tp
        if t == 0.5:
            d["_scores"] = sc
    return d


def finalize(d):
    out = {"n_gt_persons": d["n_gt"], "n_pred_persons": d["n_pred"]}
    for conf in (0.25, 0.5):
        p, r, f = prf(d[f"tp@{conf}"], d[f"npred@{conf}"], d["n_gt"])
        out[f"precision@{conf}"] = p
        out[f"recall@{conf}"] = r
        out[f"f1@{conf}"] = f
    out["AP50"] = ap_allpoint(d["_tp_by_iou"][0.5], d["n_gt"])
    out["pseudoAP"] = float(np.nanmean([ap_allpoint(d["_tp_by_iou"][t], d["n_gt"]) for t in IOUS]))
    out["small_recall@0.25"] = d["small_tp"] / d["n_small"] if d["n_small"] else float("nan")
    out["n_small_gt"] = d["n_small"]
    return out


def pool(ds):
    """Pooled: summed counts; AP over score-sorted concatenation (matching done per image)."""
    P = {k: sum(d[k] for d in ds) for k in ("n_gt", "n_pred", "n_small", "small_tp")}
    for conf in (0.25, 0.5):
        P[f"tp@{conf}"] = sum(d[f"tp@{conf}"] for d in ds)
        P[f"npred@{conf}"] = sum(d[f"npred@{conf}"] for d in ds)
    sc = np.concatenate([d["_scores"] for d in ds])
    order = np.argsort(-sc, kind="stable")
    P["_tp_by_iou"] = {t: np.concatenate([d["_tp_by_iou"][t] for d in ds])[order] for t in IOUS}
    return P


def macro(per_image):
    out = {}
    for k in per_image[0]:
        vals = [m[k] for m in per_image]
        out[k] = float(np.sum(vals)) if k.startswith("n_") else float(np.nanmean(vals))
    return out
