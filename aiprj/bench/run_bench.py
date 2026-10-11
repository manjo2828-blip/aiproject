"""Sequential detection benchmark. Run: python -m bench.run_bench [--force]
Per-model results are cached in bench/out/cache/<module>.json (resumable)."""
import glob
import importlib
import json
import os
import sys
import time
import traceback
from pathlib import Path

import cv2
import numpy as np

from . import metrics as M

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
CACHE = OUT / "cache"
CONF, IOU = 0.25, 0.45


def adapter_names():
    return sorted(p.stem for p in (ROOT / "adapters").glob("*.py")
                  if not p.stem.startswith("_"))


def run_model(mod_name, images):
    rec = {"module": mod_name}
    try:
        mod = importlib.import_module(f"bench.adapters.{mod_name}")
        rec.update(name=mod.NAME, family=mod.FAMILY, license=mod.LICENSE, params_m=mod.PARAMS_M,
                   coco_ap=mod.COCO_AP, input=mod.INPUT, file_mb=mod.FILE_MB)
        t = time.perf_counter()
        det = mod.load()
        rec["load_ms"] = round((time.perf_counter() - t) * 1000, 1)
    except Exception as e:
        rec["error"] = f"load: {e!r}"
        rec["trace"] = traceback.format_exc()[-800:]
        return rec
    rec["images"] = {}
    for f, img in images.items():
        try:
            det.detect(img, CONF, IOU)  # warmup
            ts = []
            for _ in range(3):
                t = time.perf_counter()
                d = det.detect(img, CONF, IOU)
                ts.append((time.perf_counter() - t) * 1000)
            rec["images"][f] = {
                "latency_ms": round(float(np.median(ts)), 1),
                "dets": [{"cls": int(x["cls"]), "score": round(float(x["score"]), 3),
                          "bbox": [round(float(v), 1) for v in x["bbox"]]} for x in d]}
        except Exception as e:
            rec["images"][f] = {"error": repr(e)}
    del det
    return rec


def evaluate(recs, images_meta):
    files = [i["file"] for i in images_meta]
    ok = {r["module"]: r for r in recs if "error" not in r
          and all("dets" in r["images"].get(f, {}) for f in files)}
    persons = {m: {f: [(d["score"], d["bbox"]) for d in r["images"][f]["dets"]
                       if d["cls"] == 0 and d["score"] >= 0.25] for f in files}
               for m, r in ok.items()}
    ens = [m for m in M.ENSEMBLE if m in ok]
    gt_full = {f: M.pseudo_gt({m: persons[m][f] for m in ens}) for f in files}
    for im in images_meta:
        im["gt_boxes"] = [[round(v, 1) for v in b] for b in gt_full[im["file"]]]
        im["n_gt"] = len(im["gt_boxes"])
    models = []
    for r in recs:
        o = {k: r.get(k) for k in ("name", "family", "license", "params_m", "file_mb",
                                   "coco_ap", "input", "load_ms")}
        o["module"] = r["module"]
        if r["module"] not in ok:
            o["error"] = r.get("error") or "image errors: " + json.dumps(
                {f: v.get("error") for f, v in r.get("images", {}).items() if "error" in v})
            models.append(o)
            continue
        loo = r["module"] in ens
        counts, byimg = [], {}
        for f in files:
            gt = (M.pseudo_gt({m: persons[m][f] for m in ens}, exclude=r["module"])
                  if loo else gt_full[f])
            c = M.image_counts(persons[r["module"]][f], gt)
            counts.append(c)
            byimg[f] = M.finalize(c)
        o["leave_one_out"] = loo
        o["latency_ms_median_by_image"] = {f: r["images"][f]["latency_ms"] for f in files}
        o["latency_ms_mean"] = round(float(np.mean(list(o["latency_ms_median_by_image"].values()))), 1)
        o["metrics_by_image"] = byimg
        o["metrics_overall"] = {"macro": M.macro(list(byimg.values())),
                                "pooled": M.finalize(M.pool(counts))}
        o["n_dets_all_classes"] = {f: len(r["images"][f]["dets"]) for f in files}
        models.append(o)
    note = ("NO human GT. Person-only pseudo GT = WBF(IoU %.2f) of ensemble %s person dets "
            "(score>=%.1f), kept if supported by >=%d distinct models; ensemble members are scored "
            "leave-one-out. AP = all-point interpolation over preds with score>=0.25; pseudoAP = mean "
            "over IoU 0.5:0.05:0.95." % (M.WBF_IOU, ens, M.GT_SCORE_MIN, M.MIN_SUPPORT))
    return {"pseudo_gt_note": note, "images": images_meta, "models": models}


def fmt(x, p=3):
    return "n/a" if x is None or x != x else f"{x:.{p}f}"


def summary(res):
    ms = [m for m in res["models"] if "error" not in m]
    L = ["# Person-detection benchmark (pseudo ground truth)", "", "**" + res["pseudo_gt_note"] + "**", "",
         "Metrics = macro mean over %d images, person class only, IoU 0.5 unless noted. "
         "Latency = mean over images of per-image median of 3 timed runs (full detect())." % len(res["images"]), "",
         "Pseudo-GT persons per image: " + ", ".join(f"{i['file']}={i['n_gt']}" for i in res["images"]), ""]

    def table(key, title):
        L.extend([f"## Ranked by {title}", "",
                  "| # | model | license | params M | COCO AP | lat ms | F1@.25 | P@.25 | R@.25 | F1@.5 | AP50 | pseudoAP | small R | #pred |",
                  "|" + "---|" * 14])
        for i, m in enumerate(sorted(ms, key=lambda m: -m["metrics_overall"]["macro"][key]), 1):
            a = m["metrics_overall"]["macro"]
            L.append(f"| {i} | {m['name']}{'*' if m['leave_one_out'] else ''} | {m['license']} | {m['params_m']} | "
                     f"{m['coco_ap']} | {m['latency_ms_mean']:.0f} | {fmt(a['f1@0.25'])} | {fmt(a['precision@0.25'])} | "
                     f"{fmt(a['recall@0.25'])} | {fmt(a['f1@0.5'])} | {fmt(a['AP50'])} | {fmt(a['pseudoAP'])} | "
                     f"{fmt(a['small_recall@0.25'])} | {int(a['n_pred_persons'])} |")
        L.append("")
    table("f1@0.25", "pseudo F1@0.25")
    table("AP50", "AP50")
    L.append("`*` = ensemble member (leave-one-out GT; ensemble models are still favoured by shared biases). Failed: "
             + (", ".join(f"{m['module']} ({m['error'][:80]})" for m in res["models"] if "error" in m) or "none"))
    return "\n".join(L) + "\n"


def main():
    OUT.mkdir(exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    force = "--force" in sys.argv
    files = sorted(glob.glob(str(ROOT / "images" / "0*.jpg")))
    images = {os.path.basename(f): cv2.imread(f) for f in files}
    meta = [{"file": k, "w": v.shape[1], "h": v.shape[0]} for k, v in images.items()]
    recs = []
    for name in adapter_names():
        cf = CACHE / f"{name}.json"
        if cf.exists() and not force:
            recs.append(json.loads(cf.read_text()))
            print("cached", name, flush=True)
            continue
        t = time.time()
        r = run_model(name, images)
        cf.write_text(json.dumps(r))
        recs.append(r)
        print(name, r.get("error", "ok"), f"{time.time() - t:.0f}s", flush=True)
    raw = {(r.get("name") or r["module"]): r.get("images", {}) for r in recs}
    meta_m = {(r.get("name") or r["module"]): {k: v for k, v in r.items() if k not in ("images", "trace")}
              for r in recs}
    (OUT / "raw_detections.json").write_text(json.dumps({"detections": raw, "meta": meta_m}))
    res = evaluate(recs, meta)
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    (OUT / "summary.md").write_text(summary(res), encoding="utf-8")
    print("done")


if __name__ == "__main__":
    main()
