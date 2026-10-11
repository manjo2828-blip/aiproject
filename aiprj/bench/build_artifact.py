"""Build bench/out/artifact.html from results_v3.json + picks.json + web images."""
import base64, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
res = json.loads((OUT / "results_v3.json").read_text(encoding="utf-8"))
picks_p = OUT / "picks.json"
picks = json.loads(picks_p.read_text(encoding="utf-8")) if picks_p.exists() else {"verdict": "", "picks": [], "trust": [], "caveats": [], "avoid": []}
for p in picks.get("picks", []):
    if p.get("mode") == "tiled":
        p["mode"] = "til"

SHORT = {"01": "퍼스 쇼핑 거리", "02": "경기장 관중", "03": "헬싱키 광장", "04": "정저우역", "05": "파타야 야경", "06": "플러싱 교차로"}
src = {}
for line in (ROOT / "images" / "SOURCES.md").read_text(encoding="utf-8").splitlines():
    c = [x.strip() for x in line.strip().strip("|").split("|")]
    if len(c) >= 5 and c[0].endswith(".jpg"):
        src[c[0]] = {"title": re.sub(r"\.(jpe?g|JPE?G)$", "", c[1]), "url": c[2], "author": c[3], "license": c[4]}

images = []
for i in res["images"]:
    f = i["file"]
    data = base64.b64encode((OUT / "web" / f).read_bytes()).decode()
    images.append({"f": f, "name": f[:-4], "short": SHORT.get(f[:2], f[:-4]), "w": i["w"], "h": i["h"],
                   "gt": [[round(v) for v in b[:4]] for b in i["gt"]], "src": src.get(f, {"title": f, "url": "", "author": "", "license": ""}),
                   "data": "data:image/jpeg;base64," + data})

def grp(m):
    n = m["family"]
    if n == "YOLOX": return 0
    if n in ("YOLOv8", "YOLO11", "YOLOv10"): return 1
    return 2

def side(m, mk, lk):
    s, l = m[mk], m[lk]["mean"]
    return {"lat": round(l, 1), "f1": round(s["f1@0.25"], 3), "bf": round(s["best_f1"], 3), "bthr": s.get("best_f1_thr"),
            "ap": round(s["AP50"], 3), "rs": None if s.get("recall_small") is None else round(s["recall_small"], 3), "np": s["n_pred_persons"]}

models = []
for m in res["models"]:
    def dd(key):
        return [[[round(v, 0) if k < 4 else round(v, 2) for k, v in enumerate(d)] for d in m[key].get(i["file"], [])] for i in res["images"]]
    models.append({"n": m["name"], "fam": m["family"], "g": grp(m), "lic": m["license"],
                   "perm": m["license"] in ("Apache-2.0", "MIT"), "mb": round(m["file_mb"], 1), "params": m["params_m"],
                   "coco": m["coco_ap"], "inp": m["input"],
                   "std": side(m, "metrics_std", "latency_std_ms"), "til": side(m, "metrics_tiled", "latency_tiled_ms"),
                   "ds": dd("dets_std"), "dt": dd("dets_tiled")})

html = (ROOT / "artifact_template.html").read_text(encoding="utf-8")
html = html.replace("__DATA__", json.dumps({"images": images, "models": models}, ensure_ascii=False, separators=(",", ":")))
html = html.replace("__PICKS__", json.dumps(picks, ensure_ascii=False))
(OUT / "artifact.html").write_text(html, encoding="utf-8")
print("artifact.html KB:", len(html.encode()) // 1024)
