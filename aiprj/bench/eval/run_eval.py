r"""Recall-oriented person-detection evaluation.
  .venv\Scripts\python -m bench.eval.run_eval infer [model ...]   # run adapters, cache raw dets (resumable)
  .venv\Scripts\python -m bench.eval.run_eval report              # metrics -> out/eval_results.json + summary.md
  .venv\Scripts\python -m bench.eval.run_eval sanity              # GT-vs-det overlays out/sanity_*.jpg
"""
import importlib
import itertools
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

from . import metrics as M

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "out"
CACHE = OUT / "cache"
MODELS = ["detr_r50", "rtdetr_r50", "yolox_x", "rtdetr_r18", "yolox_m"]
MIN_SCORE = 0.05
VIEW_MIN = 0.1


def load_gt():
    return json.loads((DATA / "gt.json").read_text(encoding="utf-8"))


def infer(models):
    gt = load_gt()
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in models:
        cp = CACHE / f"{name}.json"
        cache = json.loads(cp.read_text()) if cp.exists() else {"dets": {}, "lat_ms": {}}
        todo = [im for im in gt["images"] if im["file"] not in cache["dets"]]
        if not todo:
            print(name, "cached", flush=True)
            continue
        mod = importlib.import_module(f"bench.adapters.{name}")
        det = mod.load()
        warm = cv2.imread(str(DATA / "images" / gt["images"][0]["file"]))
        det.detect(warm, 0.05, 0.45)  # untimed warmup
        t_start = time.time()
        for n, im in enumerate(todo):
            bgr = cv2.imread(str(DATA / "images" / im["file"]))
            if bgr is None:
                raise RuntimeError(f"cannot read {im['file']}")
            t0 = time.perf_counter()
            res = det.detect(bgr, 0.05, 0.45)
            lat = (time.perf_counter() - t0) * 1000
            cache["dets"][im["file"]] = [[*map(float, d["bbox"]), float(d["score"])]
                                         for d in res if d["cls"] == 0 and d["score"] >= MIN_SCORE]
            cache["lat_ms"][im["file"]] = lat
            if (n + 1) % 20 == 0 or n + 1 == len(todo):
                cp.write_text(json.dumps(cache))
                print(f"{name} {n+1}/{len(todo)} {time.time()-t_start:.0f}s", flush=True)
        cp.write_text(json.dumps(cache))
        del det


def prep_images(gt):
    out = []
    for im in gt["images"]:
        ps = im["persons"]
        out.append(dict(
            gt=np.array([p["bbox"] for p in ps], float).reshape(-1, 4),
            ignore=[bool(p["ignore"]) for p in ps],
            vis=[np.nan if p.get("vis_ratio") is None else p["vis_ratio"] for p in ps],
            regions=im.get("ignore_regions", [])))
    return out


def lat_stats(lat):
    a = np.array(lat)
    return dict(median=float(np.median(a)), p90=float(np.percentile(a, 90)), mean=float(a.mean()), n=len(a))


def report(models=MODELS):
    gt = load_gt()
    images = prep_images(gt)
    files = [im["file"] for im in gt["images"]]
    res, boots = [], {}
    W = None
    for name in models:
        cp = CACHE / f"{name}.json"
        if not cp.exists():
            print("missing cache", name)
            continue
        cache = json.loads(cp.read_text())
        dets = [np.array(cache["dets"][f], float).reshape(-1, 5) for f in files]
        ev = M.Evaluator(images, dets)
        if W is None:
            W = ev.bootstrap_weights(2000, 0)
        mod = importlib.import_module(f"bench.adapters.{name}")
        table, best = M.threshold_table(ev)
        pm = M.point_metrics(ev)
        b = M.boot_metrics(ev, W)
        boots[name] = b
        cis = {k: dict(mean=float(v.mean()), ci=M.ci(v)) for k, v in b.items()}
        res.append(dict(
            key=name, name=mod.NAME, family=mod.FAMILY, license=mod.LICENSE, params_m=mod.PARAMS_M,
            file_mb=mod.FILE_MB, coco_ap=mod.COCO_AP, input=mod.INPUT,
            latency=lat_stats([cache["lat_ms"][f] for f in files]),
            thresholds=table, best_f2_thr=best,
            ap50=pm["ap50"], ap=pm["ap"], ar100=pm["ar100"], mr2=pm["mr2"],
            recall_at_fppi=pm["recall_at_fppi"],
            recall25=ev.recall_at(0.25), recall10=ev.recall_at(0.10),
            f2_25=M.fbeta(*ev.counts_at(0.25)[:3], 2.0),
            buckets={"conf0.25": M.bucket_recall(ev, 0.25), "conf0.10": M.bucket_recall(ev, 0.10)},
            cis=cis,
            per_image=[dict(file=f, **s) for f, s in zip(files, M.per_image_stats(ev, 0.25))],
            dets={f: [[round(x, 1) for x in d[:4]] + [round(d[4], 2)] for d in dd if d[4] >= VIEW_MIN]
                  for f, dd in zip(files, dets)},
        ))
    res.sort(key=lambda r: -r["recall_at_fppi"]["2"])
    pair = []
    for a, b_ in itertools.combinations([r["key"] for r in res], 2):
        p = dict(a=a, b=b_)
        for k in ("recall_fppi2", "ap50", "recall25"):
            p[k] = M.paired_diff(boots[a][k], boots[b_][k])
        pair.append(p)
    meta = {k: v for k, v in gt.items() if k != "images"}
    meta["n_images"] = len(files)
    meta["n_gt_nonignore"] = int(sum(len(x["gt"]) - sum(x["ignore"]) for x in images))
    meta["bootstrap"] = dict(n=2000, seed=0, unit="image")
    (OUT / "eval_results.json").write_text(
        json.dumps(dict(dataset=meta, models=res, pairwise=pair), separators=(",", ":")), encoding="utf-8")
    write_summary(res, pair, meta)
    print("sizeMB", (OUT / "eval_results.json").stat().st_size / 1e6)


def fc(c, pct=True):
    m = 100 if pct else 1
    return f"{c['mean']*m:.1f} [{c['ci'][0]*m:.1f}, {c['ci'][1]*m:.1f}]"


def write_summary(res, pair, meta):
    L = [f"# Person detection eval ({meta['n_images']} images, {meta['n_gt_nonignore']} GT persons)", "",
         "Sorted by recall@FPPI=2 (IoU 0.5). CIs: 95% image bootstrap (2000, seed 0). Percent values.", "",
         "| model | recall@FPPI=2 | recall@0.25 | AP50 | F2@0.25 | MR-2 | AP[.5:.95] | AR100 | lat med/p90 ms |",
         "|---|---|---|---|---|---|---|---|---|"]
    for r in res:
        c = r["cis"]
        L.append(f"| {r['name']} | {fc(c['recall_fppi2'])} | {fc(c['recall25'])} | {fc(c['ap50'])} | "
                 f"{fc(c['f2_25'])} | {r['mr2']*100:.1f} | {r['ap']*100:.1f} | {r['ar100']*100:.1f} | "
                 f"{r['latency']['median']:.0f}/{r['latency']['p90']:.0f} |")
    L += ["", "## Recall at fixed FPPI (IoU 0.5)", "", "| model | " + " | ".join(f"{f}" for f in M.FPPI_PTS) + " |",
          "|---|" + "---|" * len(M.FPPI_PTS)]
    for r in res:
        L.append(f"| {r['name']} | " + " | ".join(f"{r['recall_at_fppi'][str(f)]*100:.1f}" for f in M.FPPI_PTS) + " |")
    for r in res:
        L += ["", f"## {r['name']} thresholds (best F2 at {r['best_f2_thr']})", "",
              "| thr | TP | FP | FN | recall | prec | F1 | F2 | FPPI |", "|---|---|---|---|---|---|---|---|---|"]
        for t in r["thresholds"]:
            L.append(f"| {t['thr']} | {t['tp']} | {t['fp']} | {t['fn']} | {t['recall']*100:.1f} | "
                     f"{t['precision']*100:.1f} | {t['f1']*100:.1f} | {t['f2']*100:.1f} | {t['fppi']:.2f} |")
    for conf in ("conf0.25", "conf0.10"):
        L += ["", f"## Recall by bucket at {conf} (IoU 0.5), n in parentheses", ""]
        names = list(res[0]["buckets"][conf])
        L += ["| model | " + " | ".join(f"{n} ({res[0]['buckets'][conf][n]['n']})" for n in names) + " |",
              "|---|" + "---|" * len(names)]
        for r in res:
            L.append(f"| {r['name']} | " + " | ".join(
                "-" if r["buckets"][conf][n]["recall"] is None else f"{r['buckets'][conf][n]['recall']*100:.1f}"
                for n in names) + " |")
    L += ["", "## Paired bootstrap differences (a - b, percentage points; * = CI excludes 0)", "",
          "| a vs b | recall@FPPI=2 | AP50 | recall@0.25 |", "|---|---|---|---|"]
    nm = {r["key"]: r["name"] for r in res}
    for p in pair:
        cells = []
        for k in ("recall_fppi2", "ap50", "recall25"):
            d = p[k]
            cells.append(f"{d['mean']*100:+.1f} [{d['ci'][0]*100:+.1f}, {d['ci'][1]*100:+.1f}]{'*' if d['significant'] else ''}")
        L.append(f"| {nm[p['a']]} vs {nm[p['b']]} | " + " | ".join(cells) + " |")
    (OUT / "summary.md").write_text("\n".join(L) + "\n", encoding="utf-8")


def sanity(n=2):
    gt = load_gt()
    name = next(m for m in MODELS if (CACHE / f"{m}.json").exists())
    cache = json.loads((CACHE / f"{name}.json").read_text())
    ims = sorted(gt["images"], key=lambda i: -i["n_persons"])
    pick = [ims[0], ims[len(ims) // 2]][:n]
    for k, im in enumerate(pick):
        bgr = cv2.imread(str(DATA / "images" / im["file"]))
        for p in im["persons"]:
            x1, y1, x2, y2 = map(int, p["bbox"])
            cv2.rectangle(bgr, (x1, y1), (x2, y2), (0, 165, 255) if p["ignore"] else (0, 255, 0), 2)
        for x1, y1, x2, y2 in im.get("ignore_regions", []):
            cv2.rectangle(bgr, (int(x1), int(y1)), (int(x2), int(y2)), (255, 0, 255), 2)
        for d in cache["dets"][im["file"]]:
            if d[4] >= 0.25:
                cv2.rectangle(bgr, (int(d[0]), int(d[1])), (int(d[2]), int(d[3])), (0, 0, 255), 1)
        s = 1600 / max(bgr.shape[:2])
        if s < 1:
            bgr = cv2.resize(bgr, None, fx=s, fy=s)
        cv2.imwrite(str(OUT / f"sanity_{k}.jpg"), bgr)
        print("wrote sanity", k, im["file"], name)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    ms = sys.argv[2:] or MODELS
    if cmd in ("infer", "all"):
        infer(ms)
    if cmd in ("report", "all"):
        report([m for m in MODELS if m in ms] if sys.argv[2:] else MODELS)
    if cmd in ("sanity", "all"):
        sanity()
