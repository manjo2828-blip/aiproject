r"""Benchmark v3: SAHI-style tiled inference + GT v3 + metrics.
  .venv\Scripts\python -m bench.run_v3 infer   # tiled inference, cached per model in out/cache_v3/
  .venv\Scripts\python -m bench.run_v3 eval    # GT v3, metrics, results_v3.json, overlays
"""
import glob
import importlib
import json
import math
import sys
import time
from pathlib import Path

import cv2
import numpy as np

from . import metrics as M
from . import run_v2 as V2

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
C3 = OUT / "cache_v3"
TILE_W, TILE_H, OVERLAP = 800, 640, 0.25
EDGE = 3.0
HEAVY = {"yolox_x", "yolox_l", "rtdetr_r50", "detr_r50", "yolov7"}
GT_MIN_SCORE = 0.4
KS = (4, 6, 8)
PRIMARY = 6
MIN_H = 10.0
CONF = 0.25


def grid(W, H):
    def pos(L, t):
        if L <= t:
            return [0]
        n = math.ceil((L - t) / (t * (1 - OVERLAP))) + 1
        return [int(round(v)) for v in np.linspace(0, L - t, n)]
    return [(x, y, min(x + TILE_W, W), min(y + TILE_H, H)) for y in pos(H, TILE_H) for x in pos(W, TILE_W)]


def merge(dets, iou_thr=0.5, ios_thr=0.8):
    """Greedy NMM, score-desc: suppress if IoU>iou_thr or intersection-over-smaller>ios_thr."""
    if not dets:
        return []
    a = np.array([d[1] for d in dets], float)
    s = np.array([d[0] for d in dets], float)
    order = s.argsort()[::-1]
    keep = []
    ar = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    for i in order:
        ok = True
        for j in keep:
            iw = min(a[i, 2], a[j, 2]) - max(a[i, 0], a[j, 0])
            ih = min(a[i, 3], a[j, 3]) - max(a[i, 1], a[j, 1])
            if iw <= 0 or ih <= 0:
                continue
            inter = iw * ih
            if inter / (ar[i] + ar[j] - inter + 1e-9) > iou_thr or inter / (min(ar[i], ar[j]) + 1e-9) > ios_thr:
                ok = False
                break
        if ok:
            keep.append(i)
    return [dets[i] for i in keep]


def tiled_detect(det, img):
    H, W = img.shape[:2]
    out = [(float(d["score"]), [float(v) for v in d["bbox"]]) for d in det.detect(img, CONF, 0.45) if int(d["cls"]) == 0]
    for (x1, y1, x2, y2) in grid(W, H):
        tile = np.ascontiguousarray(img[y1:y2, x1:x2])
        for d in det.detect(tile, CONF, 0.45):
            if int(d["cls"]) != 0:
                continue
            b = d["bbox"]
            bx = [b[0] + x1, b[1] + y1, b[2] + x1, b[3] + y1]
            # drop boxes touching an internal tile border (truncated people)
            if (x1 > 0 and bx[0] < x1 + EDGE) or (y1 > 0 and bx[1] < y1 + EDGE) \
               or (x2 < W and bx[2] > x2 - EDGE) or (y2 < H and bx[3] > y2 - EDGE):
                continue
            out.append((float(d["score"]), bx))
    return merge(out)


def infer():
    C3.mkdir(exist_ok=True)
    files = sorted(glob.glob(str(ROOT / "images" / "0*.jpg")))
    imgs = {Path(f).name: cv2.imread(f) for f in files}
    for p in sorted((ROOT / "adapters").glob("*.py")):
        name = p.stem
        if name.startswith("_") or (C3 / f"{name}.json").exists():
            continue
        t0 = time.time()
        mod = importlib.import_module(f"bench.adapters.{name}")
        det = mod.load()
        first = next(iter(imgs.values()))
        det.detect(np.ascontiguousarray(first[:TILE_H, :TILE_W]), CONF, 0.45)  # warmup
        runs = 1 if name in HEAVY else 2
        rec = {"module": name, "images": {}}
        for f, img in imgs.items():
            ts = []
            for _ in range(runs):
                t = time.perf_counter()
                d = tiled_detect(det, img)
                ts.append((time.perf_counter() - t) * 1000)
            rec["images"][f] = {"latency_ms": round(float(np.median(ts)), 1),
                                "dets": [[round(s, 3), [round(v, 1) for v in b]] for s, b in d]}
        (C3 / f"{name}.json").write_text(json.dumps(rec))
        print(name, f"{time.time() - t0:.0f}s", flush=True)
        del det


# ---------------------------------------------------------------- eval
def gt_sets(persons, files, exclude=None):
    res = {k: {} for k in KS}
    for f in files:
        pm = {m: [(s, b) for s, b in persons[m][f] if s >= GT_MIN_SCORE] for m in persons if m != exclude}
        cl = M.wbf(pm, 0.55)
        for k in KS:
            res[k][f] = [c["box"].tolist() for c in cl
                         if c["support"] >= k and c["box"][3] - c["box"][1] >= MIN_H and c["box"][2] > c["box"][0]]
    return res


def slim(m):
    return {k: v for k, v in m.items() if k != "f1_sweep"}


def evaluate():
    files = sorted(Path(f).name for f in glob.glob(str(ROOT / "images" / "0*.jpg")))
    imgs = {f: cv2.imread(str(ROOT / "images" / f)) for f in files}
    std_rec = {}
    for p in glob.glob(str(OUT / "cache" / "*.json")):
        r = json.loads(Path(p).read_text())
        std_rec[r["module"]] = r
    mods = sorted(m for m in std_rec if "error" not in std_rec[m] and (C3 / f"{m}.json").exists())
    til_rec = {m: json.loads((C3 / f"{m}.json").read_text()) for m in mods}
    std = {m: {f: [(d["score"], d["bbox"]) for d in std_rec[m]["images"][f]["dets"]
                   if d["cls"] == 0 and d["score"] >= CONF] for f in files} for m in mods}
    til = {m: {f: [(s, b) for s, b in til_rec[m]["images"][f]["dets"] if s >= CONF] for f in files} for m in mods}
    full = gt_sets(til, files)
    loo = {m: gt_sets(til, files, exclude=m) for m in mods}
    models = []
    for m in mods:
        r = std_rec[m]
        o = {k: r.get(k) for k in ("name", "family", "license", "params_m", "file_mb", "coco_ap", "input")}
        o["module"] = m
        for tag, src, rec in (("std", std, std_rec), ("tiled", til, til_rec)):
            lat = [rec[m]["images"][f]["latency_ms"] for f in files]
            o[f"latency_{tag}_ms"] = {"per_image": lat, "mean": round(float(np.mean(lat)), 1)}
            ds = {f: V2.eval_image(src[m][f], loo[m][PRIMARY][f]) for f in files}
            o[f"metrics_{tag}"] = {**slim(V2.summarize(list(ds.values()))),
                                   "by_image": {f: slim(V2.summarize([ds[f]])) for f in files}}
            o[f"metrics_{tag}"]["by_k"] = {str(k): slim(V2.summarize(
                [V2.eval_image(src[m][f], loo[m][k][f]) for f in files])) for k in KS}
            o[f"dets_{tag}"] = {f: [[round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1), round(s, 2)]
                                    for s, b in sorted(src[m][f], key=lambda t: -t[0])] for f in files}
        models.append(o)
    images = []
    for f in files:
        g = np.asarray(full[PRIMARY][f], float).reshape(-1, 4)
        h = g[:, 3] - g[:, 1]
        images.append({"file": f, "w": imgs[f].shape[1], "h": imgs[f].shape[0],
                       "gt": [[round(v, 1) for v in b] for b in g.tolist()],
                       "n_gt_by_k": {str(k): len(full[k][f]) for k in KS},
                       "buckets": {n: int(((h >= lo) & (h < hi)).sum()) for n, lo, hi in V2.BUCKETS}})
    res = {"gt_note": "GT v3: per scored model, WBF(IoU .55) of TILED person dets (score>=%.2f) of ALL OTHER models, "
                      "kept if >=k distinct supporters (k in %s, primary %d), h<%g px dropped. Buckets by GT height "
                      "at 1600px: tiny<32, small 32-96, medium>=96. Tile %dx%d, overlap %.0f%%."
                      % (GT_MIN_SCORE, list(KS), PRIMARY, MIN_H, TILE_W, TILE_H, OVERLAP * 100),
           "images": images, "models": models}
    s = json.dumps(res, separators=(",", ":"), default=float)
    if len(s) > 8e6:
        for m in res["models"]:
            for t in ("dets_std", "dets_tiled"):
                m[t] = {f: [d for d in L if d[4] >= 0.3] for f, L in m[t].items()}
        s = json.dumps(res, separators=(",", ":"), default=float)
    (OUT / "results_v3.json").write_text(s)
    print("results_v3.json", len(s) / 1e6, "MB")
    od = OUT / "gt_overlays"
    od.mkdir(exist_ok=True)
    for im in images:
        img = imgs[im["file"]].copy()
        for i, b in enumerate(im["gt"]):
            col = [(0, 255, 0), (0, 200, 255), (255, 0, 255), (255, 128, 0)][i % 4]
            cv2.rectangle(img, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), col, 1)
        cv2.putText(img, f"GT v3 k>={PRIMARY}: {len(im['gt'])}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.imwrite(str(od / im["file"]), img, [cv2.IMWRITE_JPEG_QUALITY, 85])


if __name__ == "__main__":
    {"infer": infer, "eval": evaluate}[sys.argv[1]]()
