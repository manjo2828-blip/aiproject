r"""Reviewer extra analysis (read-only; prints JSON to stdout).
  .venv\Scripts\python -I bench\eval\out\review_extra.py [--yolox-nms]
1) max-dets cap check: re-score from out/cache (dets >= 0.05) with max_dets=100 (harness) vs 1000 (no cap).
2) 'reasonably visible' recall: GT with vis_ratio>=0.5 and height>=32 px, measured on the SAME full matching
   (all non-ignore GT are match targets, FP definition unchanged); recall@conf0.25 and recall at the conf
   where full-set FPPI=2/5/10. Paired image bootstrap (2000, seed 0) for visible recall@FPPI=2.
3) --yolox-nms: re-run YOLOX-m in memory (no files written) with conf 0.01 and person NMS IoU 0.45/0.6/0.7.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
import numpy as np  # noqa: E402

from bench.eval import metrics as M  # noqa: E402
from bench.eval.run_eval import DATA, MODELS, CACHE, prep_images  # noqa: E402

NAMES = {"detr_r50": "DETR-R50", "rtdetr_r50": "RT-DETR-R50vd", "yolox_x": "YOLOX-x",
         "rtdetr_r18": "RT-DETR-R18vd", "yolox_m": "YOLOX-m"}


def thr_at_fppi(ev, f):
    tpc, fpc, ngt, nimg = ev.curve(0)
    idx = np.searchsorted(fpc / nimg, f, side="right") - 1
    return float(ev.score[idx]) if idx >= 0 else 1.0


def summarize(ev, vmask):
    hit_score = ev.gt_ms[0]
    out = {"recall_conf025": float((hit_score >= 0.25).mean()),
           "visible_recall_conf025": float((hit_score[vmask] >= 0.25).mean())}
    for f in (2, 5, 10):
        t = thr_at_fppi(ev, f)
        out[f"recall_fppi{f}"] = ev.recall_fppi(f)
        out[f"visible_recall_fppi{f}"] = float((hit_score[vmask] >= t).mean())
        out[f"conf_at_fppi{f}"] = t
    tp, fp, fn, ngt, nimg = ev.counts_at(0.0)
    out["max_recall"] = tp / ngt
    out["max_fppi"] = fp / nimg
    out["visible_max_recall"] = float((hit_score[vmask] >= 0).mean())
    return out


def vis_boot(ev, vmask, W, f=2.0):
    """bootstrap visible recall at full-set FPPI=f (threshold re-derived per replicate)."""
    hs = ev.gt_ms[0]
    res = np.zeros(len(W))
    for b, w in enumerate(W):
        tpc, fpc, ngt, nimg = ev.curve(0, w)
        idx = np.searchsorted(fpc / nimg, f, side="right") - 1
        t = ev.score[idx] if idx >= 0 else 1.0
        gw = w[ev.gt_img][vmask]
        res[b] = (gw * (hs[vmask] >= t)).sum() / gw.sum()
    return res


def main():
    gt = json.loads((DATA / "gt.json").read_text(encoding="utf-8"))
    images = prep_images(gt)
    files = [im["file"] for im in gt["images"]]
    report, boots, W = {}, {}, None
    for key in MODELS:
        cache = json.loads((CACHE / f"{key}.json").read_text())
        dets = [np.array(cache["dets"][f], float).reshape(-1, 5) for f in files]
        r = {}
        for md in (100, 1000):
            ev = M.Evaluator(images, dets, ious=[0.5], max_dets=md)
            vmask = (~np.isnan(ev.gt_vis)) & (ev.gt_vis >= 0.5) & (ev.gt_h >= 32)
            r[f"maxdets{md}"] = summarize(ev, vmask)
            if md == 100:
                r["n_visible"] = int(vmask.sum())
                if W is None:
                    W = ev.bootstrap_weights(2000, 0)
                boots[key] = vis_boot(ev, vmask, W)
                r["visible_recall_fppi2_ci"] = M.ci(boots[key])
        report[NAMES[key]] = r
    pair = {}
    keys = list(MODELS)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            d = M.paired_diff(boots[keys[i]], boots[keys[j]])
            pair[f"{NAMES[keys[i]]} - {NAMES[keys[j]]}"] = d
    out = {"models": report, "visible_fppi2_pairwise": pair, "fppi_matched": fppi_matched(images, files, W)}
    if "--yolox-nms" in sys.argv:
        out["yolox_m_nms"] = yolox_nms(gt, images, files)
    print(json.dumps(out, indent=1))


def fppi_matched(images, files, W):
    """4) recall@FPPI 5/10/20 with paired bootstrap, and bucket recall at each model's FPPI=5 threshold."""
    evs, boots, res = {}, {}, {"buckets_at_fppi5": {}, "recall_fppi": {}, "pairwise": {}}
    for key in MODELS:
        cache = json.loads((CACHE / f"{key}.json").read_text())
        dets = [np.array(cache["dets"][f], float).reshape(-1, 5) for f in files]
        ev = M.Evaluator(images, dets, ious=[0.5], max_dets=1000)
        evs[key] = ev
        res["buckets_at_fppi5"][NAMES[key]] = {k: v["recall"] for k, v in M.bucket_recall(ev, thr_at_fppi(ev, 5)).items()}
        res["recall_fppi"][NAMES[key]] = {f: ev.recall_fppi(f) for f in (5, 10, 20)}
        boots[key] = {f: np.array([M.recall_at_fppi(*ev.curve(0, w), f) for w in W]) for f in (5, 10)}
    for i, a in enumerate(MODELS):
        for b in MODELS[i + 1:]:
            res["pairwise"][f"{NAMES[a]} - {NAMES[b]}"] = {f: M.paired_diff(boots[a][f], boots[b][f]) for f in (5, 10)}
    return res


def yolox_nms(gt, images, files):
    import cv2
    from bench.adapters import yolox_m
    from bench.adapters._yolox_common import nms
    det = yolox_m.load()
    S = det.size
    raw = []
    for f in files:
        bgr = cv2.imread(str(DATA / "images" / f))
        h, w = bgr.shape[:2]
        r = min(S / h, S / w)
        nw, nh = max(1, int(w * r)), max(1, int(h * r))
        canvas = np.full((S, S, 3), 114, np.float32)
        canvas[:nh, :nw] = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        p = det.sess.run(None, {det.inp: np.ascontiguousarray(canvas.transpose(2, 0, 1)[None])})[0][0].copy()
        p[:, :2] = (p[:, :2] + det.grid) * det.stride
        p[:, 2:4] = np.exp(p[:, 2:4]) * det.stride
        sc = p[:, 4:5] * p[:, 5:]
        m = (sc.argmax(1) == 0) & (sc[:, 0] > 0.01)
        b = np.concatenate([p[m, :2] - p[m, 2:4] / 2, p[m, :2] + p[m, 2:4] / 2], 1) / r
        b[:, [0, 2]] = b[:, [0, 2]].clip(0, w)
        b[:, [1, 3]] = b[:, [1, 3]].clip(0, h)
        raw.append((b, sc[m, 0]))
    res = {}
    for iou in (0.45, 0.6, 0.7):
        dets = []
        for b, s in raw:
            k = nms(b, s, iou)
            dets.append(np.concatenate([b[k], s[k, None]], 1))
        for md in (100, 1000):
            ev = M.Evaluator(images, dets, ious=[0.5], max_dets=md)
            vmask = (~np.isnan(ev.gt_vis)) & (ev.gt_vis >= 0.5) & (ev.gt_h >= 32)
            s_ = summarize(ev, vmask)
            s_["recall_conf005"] = ev.recall_at(0.05)
            s_["recall_conf010"] = ev.recall_at(0.10)
            s_["ap50"] = ev.ap50()
            res[f"iou{iou}_maxdets{md}"] = s_
    return res


if __name__ == "__main__":
    main()
