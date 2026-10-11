import json
from pathlib import Path
OUT = Path(__file__).resolve().parent / "out"


def f(x, p=3):
    return "n/a" if x is None or x != x else f"{x:.{p}f}"


def pareto(ms, key):
    pts = sorted(ms, key=lambda m: m["latency_ms_mean"])
    best, out = -1, []
    for m in pts:
        v = m["by_k"]["5"][key]
        if v > best:
            out.append(m); best = v
    return out


def main():
    r = json.loads((OUT / "results_v2.json").read_text())
    ms = r["models"]
    L = ["# Person-detection benchmark v2 (broad-consensus pseudo GT)", "", "**" + r["gt_note"] + "**", "",
         "NO human GT. Metrics = macro mean over 6 images, IoU 0.5, primary GT = k>=5. Bucket recall is pooled over images at conf 0.25.", "",
         "## GT size per image", "", "| image | v1 | v2 k>=4 | v2 k>=5 | v2 k>=8 | tiny | small | medium |", "|---|---|---|---|---|---|---|---|"]
    for im in r["images"]:
        b = im["v2_bucket_counts_k5"]; g = im["n_gt_v2"]
        L.append(f"| {im['file']} | {im['n_gt_v1']} | {g['4']} | {g['5']} | {g['8']} | {b['tiny']} | {b['small']} | {b['medium']} |")
    L.append(f"| total | {sum(i['n_gt_v1'] for i in r['images'])} | " + " | ".join(
        str(sum(i['n_gt_v2'][k] for i in r['images'])) for k in ('4', '5', '8')) + " | " + " | ".join(
        str(sum(i['v2_bucket_counts_k5'][k] for i in r['images'])) for k in ('tiny', 'small', 'medium')) + " |\n")
    hdr = ("| # | model | lat ms | COCO AP | F1@.25 | P@.25 | R@.25 | F1@.5 | AP50 | pseudoAP | bestF1 (thr) | R tiny | R small | R medium |\n"
           "|" + "---|" * 14)

    def row(i, m):
        a = m["by_k"]["5"]
        return (f"| {i} | {m['name']} | {m['latency_ms_mean']:.0f} | {m['coco_ap']} | {f(a['f1@0.25'])} | {f(a['precision@0.25'])} | "
                f"{f(a['recall@0.25'])} | {f(a['f1@0.5'])} | {f(a['AP50'])} | {f(a['pseudoAP'])} | {f(a['best_f1'])} ({a['best_f1_thr']}) | "
                f"{f(a['recall_tiny'])} | {f(a['recall_small'])} | {f(a['recall_medium'])} |")
    for key, t in (("f1@0.25", "F1@0.25"), ("AP50", "AP50"), ("best_f1", "best F1 over thresholds")):
        L += [f"## Ranked by {t} (GT v2 k>=5)", "", hdr]
        L += [row(i, m) for i, m in enumerate(sorted(ms, key=lambda m: -m["by_k"]["5"][key]), 1)] + [""]
    for b in ("tiny", "small", "medium"):
        top = sorted(ms, key=lambda m: -(m["by_k"]["5"][f"recall_{b}"] or 0))[:5]
        L.append(f"- Top recall@0.25 on {b}: " + ", ".join(f"{m['name']} {f(m['by_k']['5']['recall_'+b])}" for m in top))
    L.append("")
    L += ["## Rank stability (Spearman rho over 24 models)", ""]
    for lab, tab in r["rank_stability"].items():
        names = list(tab)
        L += [f"**{lab}**", "", "| | " + " | ".join(names) + " |", "|" + "---|" * (len(names) + 1)]
        L += [f"| {a} | " + " | ".join(f"{tab[a][b]:.2f}" for b in names) + " |" for a in names] + [""]
    L += ["## Pareto frontier (lat vs score, GT v2 k>=5)", ""]
    for key in ("f1@0.25", "best_f1", "AP50"):
        L.append(f"- {key}: " + " -> ".join(f"{m['name']} ({m['latency_ms_mean']:.0f}ms, {f(m['by_k']['5'][key])})" for m in pareto(ms, key)))
    L += ["", "## Side note: YOLOv10 at conf 0.05 (not in main table)", "",
          "| model | conf | P | R | F1 | #pred |", "|---|---|---|---|---|---|"]
    for mod, rows in r["yolov10_lowconf_side_note"].items():
        for c, v in rows.items():
            L.append(f"| {mod} | {c} | {f(v['precision'])} | {f(v['recall'])} | {f(v['f1'])} | {v['n_pred']} |")
    (OUT / "summary_v2.md").write_text("\n".join(L) + "\n", encoding="utf-8")


main()
