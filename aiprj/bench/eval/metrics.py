"""Person-detection metrics (numpy only), recall-oriented. See run_eval.py for the pipeline.

Matching: per image, dets sorted by descending score, greedy to best-IoU unmatched non-ignore GT
with IoU>=thr. Unmatched dets overlapping an ignore GT / ignore region are IGNORED (status -1).
Because matching is greedy by descending score, thresholding at score t is equivalent to taking
the subset of dets with score>=t of the full matching, so one matching per (image, IoU) suffices.
"""
import numpy as np

IOUS = np.round(np.arange(0.5, 0.96, 0.05), 2)
THRS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6]
FPPI_PTS = [0.5, 1, 2, 5, 10]
MAX_DETS = 100


def iou_matrix(a, b):
    a = np.asarray(a, float).reshape(-1, 4)
    b = np.asarray(b, float).reshape(-1, 4)
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)))
    lt = np.maximum(a[:, None, :2], b[None, :, :2])
    rb = np.minimum(a[:, None, 2:], b[None, :, 2:])
    inter = np.clip(rb - lt, 0, None).prod(2)
    aa = np.clip(a[:, 2:] - a[:, :2], 0, None).prod(1)
    ab = np.clip(b[:, 2:] - b[:, :2], 0, None).prod(1)
    return inter / (aa[:, None] + ab[None] - inter + 1e-9)


def inter_over_det(det, other):
    det = np.asarray(det, float).reshape(-1, 4)
    other = np.asarray(other, float).reshape(-1, 4)
    if len(det) == 0 or len(other) == 0:
        return np.zeros((len(det), len(other)))
    lt = np.maximum(det[:, None, :2], other[None, :, :2])
    rb = np.minimum(det[:, None, 2:], other[None, :, 2:])
    inter = np.clip(rb - lt, 0, None).prod(2)
    ad = np.clip(det[:, 2:] - det[:, :2], 0, None).prod(1)
    return inter / (ad[:, None] + 1e-9)


def match_image(gt_boxes, gt_ignore, regions, det_boxes, det_scores, thr):
    """dets must already be sorted by descending score.
    Returns status (1 TP, 0 FP, -1 ignored) per det and gt_match_score per GT (-1 = unmatched)."""
    gt_boxes = np.asarray(gt_boxes, float).reshape(-1, 4)
    gt_ignore = np.asarray(gt_ignore, bool).reshape(-1)
    det_boxes = np.asarray(det_boxes, float).reshape(-1, 4)
    nd, ng = len(det_boxes), len(gt_boxes)
    status = np.zeros(nd, int)
    gms = np.full(ng, -1.0)
    if nd == 0:
        return status, gms
    iou = iou_matrix(det_boxes, gt_boxes)
    taken = gt_ignore.copy()  # ignore GTs are never match targets
    if ng:
        for d in range(nd):
            cand = np.where(taken, -1.0, iou[d])
            j = int(cand.argmax())
            if cand[j] >= thr:
                taken[j] = True
                status[d] = 1
                gms[j] = det_scores[d]
    unm = np.where(status == 0)[0]
    if len(unm):
        ign = np.zeros(len(unm), bool)
        if gt_ignore.any():
            ig = gt_boxes[gt_ignore]
            ign |= (inter_over_det(det_boxes[unm], ig) >= 0.5).any(1)
            ign |= (iou[unm][:, gt_ignore] >= 0.5).any(1)
        regions = np.asarray(regions, float).reshape(-1, 4)
        if len(regions):
            ign |= (inter_over_det(det_boxes[unm], regions) >= 0.5).any(1)
        status[unm[ign]] = -1
    return status, gms


class Evaluator:
    """images: list of dict(gt (n,4), ignore (n,), regions, vis (n,) with nan).
    dets: list (same order) of arrays (n,5) x1,y1,x2,y2,score."""

    def __init__(self, images, dets, ious=IOUS, max_dets=MAX_DETS):
        self.n_img = len(images)
        self.ious = list(ious)
        gt_img, gt_h, gt_vis = [], [], []
        self.img_ngt = np.zeros(self.n_img, int)
        sc, im = [], []
        st = [[] for _ in self.ious]
        gm = [[] for _ in self.ious]
        self._dets = []
        for i, (g, d) in enumerate(zip(images, dets)):
            gb = np.asarray(g["gt"], float).reshape(-1, 4)
            ig = np.asarray(g["ignore"], bool).reshape(-1)
            vis = np.asarray(g.get("vis", [np.nan] * len(gb)), float).reshape(-1)
            d = np.asarray(d, float).reshape(-1, 5)
            d = d[np.argsort(-d[:, 4], kind="stable")][:max_dets]
            self._dets.append(d)
            keep = ~ig
            self.img_ngt[i] = int(keep.sum())
            gt_img += [i] * int(keep.sum())
            gt_h += list(gb[keep, 3] - gb[keep, 1])
            gt_vis += list(vis[keep])
            sc.append(d[:, 4])
            im.append(np.full(len(d), i))
            for k, t in enumerate(self.ious):
                s, m = match_image(gb, ig, g.get("regions", []), d[:, :4], d[:, 4], t)
                st[k].append(s)
                gm[k].append(m[keep])
        self.gt_img = np.array(gt_img, int)
        self.gt_h = np.array(gt_h, float)
        self.gt_vis = np.array(gt_vis, float)
        sc = np.concatenate(sc) if sc else np.zeros(0)
        im = np.concatenate(im) if im else np.zeros(0, int)
        order = np.argsort(-sc, kind="stable")
        self.score = sc[order]
        self.img = im[order]
        self.status = [np.concatenate(s)[order] for s in st]
        self.gt_ms = [np.concatenate(m) if len(m) else np.zeros(0) for m in gm]
        self._img_status0 = st[0]

    def curve(self, k=0, w=None):
        w = np.ones(self.n_img) if w is None else np.asarray(w, float)
        wd = w[self.img]
        s = self.status[k]
        tpc = np.cumsum(wd * (s == 1))
        fpc = np.cumsum(wd * (s == 0))
        return tpc, fpc, float((w * self.img_ngt).sum()), float(w.sum())

    def counts_at(self, thr, k=0, w=None):
        tpc, fpc, ngt, nimg = self.curve(k, w)
        n = int((self.score >= thr).sum())
        tp = tpc[n - 1] if n else 0.0
        fp = fpc[n - 1] if n else 0.0
        return tp, fp, ngt - tp, ngt, nimg

    def recall_at(self, thr, k=0, w=None):
        tp, fp, fn, ngt, _ = self.counts_at(thr, k, w)
        return tp / ngt if ngt else 0.0

    def ap50(self, w=None):
        return ap_allpoint(*self.curve(0, w)[:3])

    def recall_fppi(self, f, w=None):
        return recall_at_fppi(*self.curve(0, w), f)

    def bootstrap_weights(self, n=2000, seed=0):
        rng = np.random.default_rng(seed)
        return rng.multinomial(self.n_img, np.full(self.n_img, 1.0 / self.n_img), size=n).astype(float)


def fbeta(tp, fp, fn, beta=2.0):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    b2 = beta * beta
    return (1 + b2) * p * r / (b2 * p + r) if (b2 * p + r) else 0.0


def _pr(tpc, fpc, ngt):
    if len(tpc) == 0 or ngt <= 0:
        return np.zeros(0), np.zeros(0)
    return tpc / ngt, tpc / np.maximum(tpc + fpc, 1e-9)


def ap_allpoint(tpc, fpc, ngt):
    rec, prec = _pr(tpc, fpc, ngt)
    if len(rec) == 0:
        return 0.0
    prec = np.maximum.accumulate(prec[::-1])[::-1]
    r = np.concatenate([[0.0], rec])
    return float(np.sum((r[1:] - r[:-1]) * prec))


def ap_101(tpc, fpc, ngt):
    rec, prec = _pr(tpc, fpc, ngt)
    if len(rec) == 0:
        return 0.0
    prec = np.maximum.accumulate(prec[::-1])[::-1]
    idx = np.searchsorted(rec, np.linspace(0, 1, 101), side="left")
    ok = idx < len(rec)
    out = np.zeros(101)
    out[ok] = prec[idx[ok]]
    return float(out.mean())


def recall_at_fppi(tpc, fpc, ngt, nimg, f):
    if len(tpc) == 0 or ngt <= 0:
        return 0.0
    idx = np.searchsorted(fpc / nimg, f, side="right") - 1
    return float(tpc[idx] / ngt) if idx >= 0 else 0.0


def log_avg_miss_rate(tpc, fpc, ngt, nimg, refs=None):
    refs = np.logspace(-2, 0, 9) if refs is None else refs
    mr = np.array([1.0 - recall_at_fppi(tpc, fpc, ngt, nimg, f) for f in refs])
    return float(np.exp(np.mean(np.log(np.maximum(mr, 1e-10)))))


def point_metrics(ev, w=None):
    out = {}
    c0 = ev.curve(0, w)
    out["ap50"] = ap_allpoint(*c0[:3])
    aps, ars = [], []
    for k in range(len(ev.ious)):
        c = ev.curve(k, w)
        aps.append(ap_101(*c[:3]))
        ars.append(float(c[0][-1] / c[2]) if len(c[0]) and c[2] else 0.0)
    out["ap"] = float(np.mean(aps))
    out["ar100"] = float(np.mean(ars))
    out["mr2"] = log_avg_miss_rate(*c0)
    out["recall_at_fppi"] = {str(f): recall_at_fppi(*c0, f) for f in FPPI_PTS}
    return out


def threshold_table(ev, thrs=THRS, w=None):
    rows = []
    for t in thrs:
        tp, fp, fn, ngt, nimg = ev.counts_at(t, 0, w)
        rows.append(dict(thr=t, tp=int(tp), fp=int(fp), fn=int(fn),
                         recall=tp / ngt if ngt else 0.0,
                         precision=tp / (tp + fp) if tp + fp else 0.0,
                         f1=fbeta(tp, fp, fn, 1.0), f2=fbeta(tp, fp, fn, 2.0), fppi=fp / nimg))
    best = max(rows, key=lambda r: r["f2"])
    return rows, best["thr"]


def bucket_recall(ev, conf):
    hit = ev.gt_ms[0] >= conf
    res = {}

    def add(name, mask):
        n = int(mask.sum())
        res[name] = dict(n=n, recall=float(hit[mask].mean()) if n else None)
    h, v = ev.gt_h, ev.gt_vis
    ok = ~np.isnan(v)
    add("h<32", h < 32)
    add("h32-96", (h >= 32) & (h < 96))
    add("h>=96", h >= 96)
    add("vis<0.5", ok & (v < 0.5))
    add("vis0.5-0.8", ok & (v >= 0.5) & (v <= 0.8))
    add("vis>0.8", ok & (v > 0.8))
    cnt = ev.img_ngt[ev.gt_img]
    add("crowd<=20", cnt <= 20)
    add("crowd21-40", (cnt > 20) & (cnt <= 40))
    add("crowd>40", cnt > 40)
    return res


def per_image_stats(ev, conf=0.25):
    out = []
    for i in range(ev.n_img):
        d = ev._dets[i]
        s = ev._img_status0[i][d[:, 4] >= conf]
        tp = int((s == 1).sum())
        out.append(dict(n_gt=int(ev.img_ngt[i]), tp=tp, fn=int(ev.img_ngt[i]) - tp, fp=int((s == 0).sum())))
    return out


def boot_metrics(ev, W):
    """Bootstrap arrays over rows of W (B, n_img): recall@0.25, recall@FPPI=2, AP50, F2@0.25."""
    B = len(W)
    out = {k: np.zeros(B) for k in ("recall25", "recall_fppi2", "ap50", "f2_25")}
    n = int((ev.score >= 0.25).sum())
    for b in range(B):
        c = ev.curve(0, W[b])
        tp = c[0][n - 1] if n else 0.0
        fp = c[1][n - 1] if n else 0.0
        out["recall25"][b] = tp / c[2] if c[2] else 0.0
        out["f2_25"][b] = fbeta(tp, fp, c[2] - tp, 2.0)
        out["ap50"][b] = ap_allpoint(*c[:3])
        out["recall_fppi2"][b] = recall_at_fppi(*c, 2.0)
    return out


def ci(a, level=0.95):
    lo, hi = np.percentile(a, [(1 - level) / 2 * 100, (1 + level) / 2 * 100])
    return [float(lo), float(hi)]


def paired_diff(a, b):
    d = np.asarray(a) - np.asarray(b)
    lo, hi = ci(d)
    return dict(mean=float(d.mean()), ci=[lo, hi], significant=bool(lo > 0 or hi < 0))
