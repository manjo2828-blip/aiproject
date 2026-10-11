r"""Write bench/out/summary_v3.md from results_v3.json. Run: .venv\Scripts\python -m bench.summary_v3"""
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent / "out"


def f3(x):
    return "n/a" if x is None or x != x else f"{x:.3f}"


def table(ms, tag, key, title, L):
    L += [f"## {title}", "",
          "| # | model | lat ms | COCO AP | F1@.25 | P@.25 | R@.25 | F1@.5 | AP50 | pseudoAP | bestF1 (thr) | R tiny | R small | R medium | #pred |",
          "|" + "---|" * 15]
    for i, m in enumerate(sorted(ms, key=lambda m: -m[f"metrics_{tag}"][key]), 1):
        a = m[f"metrics_{tag}"]
        L.append(f"| {i} | {m['name']} | {m[f'latency_{tag}_ms']['mean']:.0f} | {m['coco_ap']} | {f3(a['f1@0.25'])} | "
                 f"{f3(a['precision@0.25'])} | {f3(a['recall@0.25'])} | {f3(a['f1@0.5'])} | {f3(a['AP50'])} | "
                 f"{f3(a['pseudoAP'])} | {f3(a['best_f1'])} ({a['best_f1_thr']}) | {f3(a['recall_tiny'])} | "
                 f"{f3(a['recall_small'])} | {f3(a['recall_medium'])} | {a['n_pred_persons']} |")
    L.append("")


def pareto(ms, tag, key):
    pts = sorted(ms, key=lambda m: m[f"latency_{tag}_ms"]["mean"])
    best, out = -1, []
    for m in pts:
        v = m[f"metrics_{tag}"][key]
        if v > best:
            best = v
            out.append(m)
    return out


def main():
    r = json.loads((OUT / "results_v3.json").read_text())
    ms = r["models"]
    L = ["# Person-detection benchmark v3 (tiled / high-res inference, GT v3)", "", "**" + r["gt_note"] + "**", "",
         "NO human GT. Metrics = macro mean over 6 images, IoU 0.5, leave-one-out GT k>=6. Latency = mean over images of "
         "per-image time for the whole tiled pipeline (full pass + 6 tiles of 800x640, ~25% overlap, merge) or the single "
         "standard pass. Both modes use the same GT. Caveat: GT is built from tiled detections of the same models, so "
         "it favours tiled mode and shared-bias errors.", "",
         "## GT v3 persons per image", "",
         "| image | k>=4 | k>=6 | k>=8 | tiny | small | medium | SOURCES.md rough est. |", "|---|---|---|---|---|---|---|---|"]
    est = {"01": "~150", "02": "~200", "03": "~120", "04": "~80", "05": "~50", "06": "~45"}
    tot = defaultdict(int)
    for im in r["images"]:
        n = im["n_gt_by_k"]
        L.append(f"| {im['file']} | {n['4']} | {n['6']} | {n['8']} | {im['buckets']['tiny']} | {im['buckets']['small']} | "
                 f"{im['buckets']['medium']} | {est[im['file'][:2]]} |")
        for k in ("4", "6", "8"):
            tot[k] += n[k]
        for b in im["buckets"]:
            tot[b] += im["buckets"][b]
    L.append(f"| total | {tot['4']} | {tot['6']} | {tot['8']} | {tot['tiny']} | {tot['small']} | {tot['medium']} | ~645 |")
    L.append("")
    table(ms, "tiled", "f1@0.25", "TILED ranked by F1@0.25", L)
    table(ms, "tiled", "AP50", "TILED ranked by AP50", L)
    table(ms, "std", "f1@0.25", "STANDARD ranked by F1@0.25", L)
    table(ms, "std", "AP50", "STANDARD ranked by AP50", L)

    L += ["## Tiling gain (tiled minus standard, same GT v3)", "",
          "| model | family | dF1@.25 | dAP50 | dR@.25 | dR small | dR tiny | lat std ms | lat tiled ms | x cost |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    gains = []
    for m in ms:
        s, t = m["metrics_std"], m["metrics_tiled"]
        g = (m["name"], m["family"], t["f1@0.25"] - s["f1@0.25"], t["AP50"] - s["AP50"], t["recall@0.25"] - s["recall@0.25"],
             t["recall_small"] - s["recall_small"], t["recall_tiny"] - s["recall_tiny"],
             m["latency_std_ms"]["mean"], m["latency_tiled_ms"]["mean"])
        gains.append(g)
    for g in sorted(gains, key=lambda g: -g[3]):
        L.append(f"| {g[0]} | {g[1]} | {g[2]:+.3f} | {g[3]:+.3f} | {g[4]:+.3f} | {g[5]:+.3f} | {g[6]:+.3f} | {g[7]:.0f} | "
                 f"{g[8]:.0f} | {g[8] / g[7]:.1f}x |")
    L.append("")
    fam = defaultdict(list)
    for g in gains:
        fam[g[1]].append(g)
    L += ["### By family (mean)", "", "| family | n | dF1@.25 | dAP50 | dR@.25 | dR small |", "|---|---|---|---|---|---|"]
    for k, v in fam.items():
        L.append(f"| {k} | {len(v)} | {np.mean([x[2] for x in v]):+.3f} | {np.mean([x[3] for x in v]):+.3f} | "
                 f"{np.mean([x[4] for x in v]):+.3f} | {np.nanmean([x[5] for x in v]):+.3f} |")
    L.append("")

    L += ["## Speed vs accuracy Pareto frontiers (non-dominated: no faster model scores higher)", ""]
    for tag in ("tiled", "std"):
        for key, lab in (("f1@0.25", "F1@.25"), ("AP50", "AP50")):
            L.append(f"- {tag.upper()} / {lab}: " + " -> ".join(
                f"{m['name']} ({m[f'latency_{tag}_ms']['mean']:.0f} ms, {m[f'metrics_{tag}'][key]:.3f})"
                for m in pareto(ms, tag, key)))
    L.append("")
    L += ["## Analysis", "",
          "- Tiling (800x640 tiles = 0.8x model scale instead of 0.4x) raises recall and AP50 for ALL 24 models (AP50 +0.11..+0.42) at ~6-8x latency.",
          "- Largest gains: small/low-recall detectors (YOLOv10s/n, YOLOX-Nano/Tiny, YOLOv8n/s, YOLO11n): they miss mid-size people at 640 on a 1600px photo. Smallest AP50 gains: RT-DETR-R50/R18, DETR, YOLOX-x, NanoDet-1.5x (already high recall).",
          "- F1@0.25 can DROP for models with already high recall and low precision (RT-DETR, DETR, YOLOX-x): tiling adds more low-confidence duplicates/false positives, so a higher threshold (0.4-0.55) is needed; their bestF1 is competitive.",
          "- Ultralytics YOLOv8/YOLO11 s/m lead tiled F1@0.25 (high precision); YOLOX-x/m, DETR, YOLOv6-S lead tiled AP50.",
          "- Limitation: GT v3 is still only the persons that >=6 models agree on in tiled mode (~175 vs ~645 rough human estimate); no GT in the tiny (<32 px) bucket, so tiny recall is n/a. Distant crowds (stadium upper tiers, far plaza) remain unscored. Tile scale 0.8 is too coarse for such people; a 400x320 tile grid (~3x3 tiles are too coarse) would be needed.",
          "- GT is derived from tiled detections of the same models, so tiled mode is advantaged vs standard mode in the comparison.", ""]
    (OUT / "summary_v3.md").write_text("\n".join(L), encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main()
