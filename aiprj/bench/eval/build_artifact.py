"""Build bench/eval/out/artifact.html from eval_results.json + picks.json + sample images."""
import base64, io, json, re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
res = json.loads((ROOT / "out" / "eval_results.json").read_text(encoding="utf-8"))
gt = json.loads((ROOT / "data" / "gt.json").read_text(encoding="utf-8"))
pp = ROOT / "out" / "picks.json"
picks = json.loads(pp.read_text(encoding="utf-8")) if pp.exists() else {}

gt_by = {i["file"]: i for i in gt["images"]}
ranked = sorted(gt["images"], key=lambda i: sum(not p["ignore"] for p in i["persons"]))
fr = [0.05, 0.25, 0.45, 0.65, 0.85, 0.98]
chosen = []
for f in fr:
    i = ranked[min(len(ranked) - 1, int(f * len(ranked)))]
    if i not in chosen:
        chosen.append(i)

samples = []
for i in chosen:
    im = Image.open(ROOT / "data" / "images" / i["file"]).convert("RGB")
    s = 900 / max(im.size)
    im2 = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im
    buf = io.BytesIO(); im2.save(buf, "JPEG", quality=74, optimize=True)
    samples.append({"f": i["file"], "w": i["w"], "h": i["h"],
                    "gt": [[round(v, 1) for v in p["bbox"]] for p in i["persons"] if not p["ignore"]],
                    "ign": [[round(v, 1) for v in r] for r in i.get("ignore_regions", [])] +
                           [[round(v, 1) for v in p["bbox"]] for p in i["persons"] if p["ignore"]],
                    "data": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()})

models = []
for m in res["models"]:
    models.append({"key": m["key"], "name": m["name"], "family": m["family"], "license": m["license"], "mb": m["file_mb"],
                   "latency": m["latency"], "recall_at_fppi": m["recall_at_fppi"], "recall25": m["recall25"], "recall10": m["recall10"],
                   "ap50": m["ap50"], "ap": m["ap"], "ar100": m["ar100"], "cis": m["cis"], "buckets": m["buckets"],
                   "sdets": {s["f"]: m["dets"].get(s["f"], []) for s in samples}})

css = re.search(r"<style>(.*?)</style>", (ROOT.parent / "artifact_template.html").read_text(encoding="utf-8"), re.S).group(1)
html = (ROOT / "artifact_template.html").read_text(encoding="utf-8")
html = html.replace("/*__BASECSS__*/", css)
html = html.replace("__DATA__", json.dumps({"dataset": res["dataset"], "models": models, "pairwise": res["pairwise"], "samples": samples}, ensure_ascii=False, separators=(",", ":")))
html = html.replace("__PICKS__", json.dumps(picks, ensure_ascii=False))
(ROOT / "out" / "artifact.html").write_text(html, encoding="utf-8")
print("artifact KB:", len(html.encode()) // 1024, "samples:", [len(s["gt"]) for s in samples])
