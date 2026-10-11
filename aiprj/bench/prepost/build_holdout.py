"""Build a second, disjoint CrowdHuman-val sample (seed 43, 100 imgs) as a held-out TEST set.
Same label mapping as bench/eval/data (DATASET.md). Dev set = bench/eval/data (seed 42)."""
import io, json, random, sys, zipfile, urllib.request
from pathlib import Path
import cv2, numpy as np
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from bench.finetune.build_dataset import RangeFile, http_get, HF  # noqa: E402

OUT = ROOT / "bench" / "prepost" / "data_test"
(OUT / "images").mkdir(parents=True, exist_ok=True)
odgt = OUT / "annotation_val.odgt"
if not odgt.exists():
    urllib.request.urlretrieve(HF + "annotation_val.odgt", odgt)
recs = [json.loads(l) for l in odgt.read_text(encoding="utf-8").splitlines() if l.strip()]
dev = {im["id"] for im in json.loads((ROOT / "bench/eval/data/gt.json").read_text())["images"]}

def persons(r):
    return [b for b in r["gtboxes"] if b["tag"] == "person" and b["extra"].get("ignore", 0) == 0
            and b["fbox"][2] >= 4 and b["fbox"][3] >= 4]
pool = sorted([r for r in recs if len(persons(r)) >= 15 and r["ID"] not in dev], key=lambda r: r["ID"])
pick = random.Random(43).sample(pool, 100)
print("pool", len(pool), "picked", len(pick))
zf = zipfile.ZipFile(RangeFile(HF + "CrowdHuman_val.zip"))
names = {Path(n).stem: n for n in zf.namelist() if n.lower().endswith(".jpg")}
images = []
for k, r in enumerate(pick):
    raw = zf.read(names[r["ID"]])
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    s = min(1.0, 2000 / max(h, w))
    if s < 1:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4)
        h, w = img.shape[:2]
    fn = f"{k:03d}_{r['ID'].replace(',', '-')}.jpg"
    cv2.imwrite(str(OUT / "images" / fn), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    ps, regs = [], []
    for b in r["gtboxes"]:
        x, y, bw, bh = [v * s for v in b["fbox"]]
        if b["tag"] == "mask":
            regs.append([x, y, x + bw, y + bh]); continue
        if b["tag"] != "person":
            continue
        ig = bool(b["extra"].get("ignore", 0)) or bw < 4 or bh < 4
        vb = b["vbox"]; vr = min(1.0, (vb[2] * vb[3]) / max(b["fbox"][2] * b["fbox"][3], 1e-9))
        ps.append(dict(bbox=[x, y, x + bw, y + bh], ignore=ig, vis_ratio=vr,
                       occ="none" if vr >= 0.9 else "partial" if vr >= 0.5 else "heavy"))
    images.append(dict(file=fn, id=r["ID"], w=w, h=h, n_persons=sum(not p["ignore"] for p in ps),
                       persons=ps, ignore_regions=regs))
    print(k, fn, images[-1]["n_persons"], flush=True)
(OUT / "gt.json").write_text(json.dumps(dict(dataset="CrowdHuman val (test split, seed 43)", seed=43,
    pool_size=len(pool), n_images=100, images=images)), encoding="utf-8")
