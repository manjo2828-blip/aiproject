"""Static pipeline demo (no server): embeds 6 dev images + cached detections of 5 models. Output: bench/prepost/demo.html"""
import base64, json
from pathlib import Path
import cv2
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "bench/eval/data"
gt = json.loads((DATA / "gt.json").read_text())
res = json.loads((ROOT / "bench/eval/out/eval_results.json").read_text())
ims = sorted(gt["images"], key=lambda i: i["n_persons"])
want = [15, 24, 32, 48, 75, 120]
pick, used = [], set()
for w in want:
    c = min((i for i in ims if i["file"] not in used), key=lambda i: abs(i["n_persons"] - w))
    used.add(c["file"]); pick.append(c)
MAXS = 960
images = []
for im in pick:
    bgr = cv2.imread(str(DATA / "images" / im["file"]))
    h, w = bgr.shape[:2]
    s = min(1.0, MAXS / max(h, w))
    small = cv2.resize(bgr, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else bgr
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 72])
    r = lambda b: [round(v * s, 1) for v in b]  # noqa: E731
    dets = {}
    for m in res["models"]:
        dets[m["key"]] = [r(d[:4]) + [d[4]] for d in m["dets"][im["file"]] if d[4] >= 0.1]
    images.append(dict(
        file=im["file"], w=small.shape[1], h=small.shape[0], n=im["n_persons"],
        img="data:image/jpeg;base64," + base64.b64encode(buf).decode(),
        gt=[r(p["bbox"]) + [round(p["vis_ratio"], 2)] for p in im["persons"] if not p["ignore"]],
        regions=[r(x) for x in im.get("ignore_regions", [])], dets=dets))
models = [dict(key=m["key"], name=m["name"], lic=m["license"], mb=m["file_mb"], lat=round(m["latency"]["median"]),
               nms=m["key"].startswith(("yolox",)), r2=round(m["recall_at_fppi"]["2"] * 100, 1),
               r5=round(m["recall_at_fppi"]["5"] * 100, 1), ap50=round(m["ap50"] * 100, 1),
               inp="레터박스 640×640 (회색 패딩, BGR 0–255)" if m["key"].startswith("yolox") else "640×640 늘리기(비율 무시), RGB 0–1")
          for m in res["models"]]
order = ["yolox_m", "rtdetr_r50", "rtdetr_r18", "yolox_x", "detr_r50"]
models.sort(key=lambda m: order.index(m["key"]) if m["key"] in order else 9)
D = dict(images=images, models=models, nGT=res["dataset"]["n_gt_nonignore"], nImg=res["dataset"]["n_images"])
tpl = (ROOT / "bench/prepost/demo_template.html").read_text(encoding="utf-8")
out = tpl.replace("/*DATA*/", "var D=" + json.dumps(D, separators=(",", ":")) + ";")
(ROOT / "bench/prepost/demo.html").write_text(out, encoding="utf-8")
print(len(out) / 1e6, "MB", [(i["n"], len(i["gt"])) for i in images], [m["key"] for m in models])
