"""Shared helpers for bench/finetune/train (paths, data staging, low-priority, seeds).

Phase-A data layout expected (bench/finetune/data/): annotations_train.json, annotations_val.json,
images/train|val. We never modify it. Instead we *stage* per-run annotation files into
runs/<name>/data/{train,val}.json with absolute file_name paths, a single category (id 1 = person),
and an optional --subset, so both upstream repos can read them unchanged.
"""
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]            # project root
FT = ROOT / "bench" / "finetune"
DATA = FT / "data"
TP = FT / "third_party"
RTDETR_DIR = TP / "RT-DETR" / "rtdetrv2_pytorch"
YOLOX_DIR = TP / "YOLOX"
CKPT_DIR = FT / "train" / "pretrained"
RTDETR_CKPT_URL = ("https://github.com/lyuwenyu/storage/releases/download/v0.2/"
                   "rtdetrv2_r18vd_120e_coco_rerun_48.1.pth")
YOLOX_CKPT_URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_m.pth"


def lower_priority():
    """Below-normal process priority (Windows: SetPriorityClass; elsewhere: nice)."""
    try:
        if os.name == "nt":
            import ctypes
            BELOW_NORMAL = 0x00004000
            h = ctypes.windll.kernel32.GetCurrentProcess()
            ctypes.windll.kernel32.SetPriorityClass(h, BELOW_NORMAL)
        else:
            os.nice(5)
    except Exception as e:  # noqa: BLE001
        print("could not lower priority:", e)


def ensure_ckpt(model):
    """Download the COCO-pretrained checkpoint once into train/pretrained/."""
    url = RTDETR_CKPT_URL if model == "rtdetr_r18" else YOLOX_CKPT_URL
    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    dst = CKPT_DIR / url.rsplit("/", 1)[1]
    if not dst.exists() or dst.stat().st_size < 1_000_000:
        import urllib.request
        print("downloading", url)
        tmp = dst.with_suffix(".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.replace(dst)
    return dst


def _resolve_image(fn, split):
    p = Path(fn)
    if p.is_absolute() and p.exists():
        return p
    for base in (DATA / "images" / split, DATA / "images", DATA, DATA / split):
        if (base / fn).exists():
            return (base / fn)
    return None


def stage_split(split, out_dir, subset=0, seed=0, flavor=None):
    """Write out_dir/<split>.json (absolute file_names, single class). Returns (json_path, n_images, n_boxes)."""
    src = DATA / f"annotations_{split}.json"
    if not src.exists():
        raise FileNotFoundError(f"{src} missing - phase-A data not built yet (build_dataset.py)")
    d = json.loads(src.read_text(encoding="utf-8"))
    imgs = sorted(d["images"], key=lambda i: i["id"])
    rng = random.Random(seed)
    if subset and subset < len(imgs):
        # prefer images that actually contain people so the smoke test has something to learn
        has = {a["image_id"] for a in d["annotations"] if not a.get("iscrowd", 0)}
        pool = [i for i in imgs if i["id"] in has] or imgs
        imgs = sorted(rng.sample(pool, min(subset, len(pool))), key=lambda i: i["id"])
    keep = {i["id"] for i in imgs}
    out_imgs = []
    for im in imgs:
        p = _resolve_image(im["file_name"], split)
        if p is None:
            raise FileNotFoundError(f"image not found for {im['file_name']} (split {split})")
        im = dict(im)
        im["file_name"] = str(p.resolve())
        out_imgs.append(im)
    anns = []
    for a in d["annotations"]:
        if a["image_id"] in keep:
            a = dict(a)
            a["category_id"] = 1
            a.pop("segmentation", None)
            a.setdefault("iscrowd", 0)
            a.setdefault("area", a["bbox"][2] * a["bbox"][3])
            anns.append(a)
    out = dict(images=out_imgs, annotations=anns, categories=[{"id": 1, "name": "person"}])
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / f"{split}.json"
    dst.write_text(json.dumps(out), encoding="utf-8")
    return dst, len(out_imgs), sum(1 for a in anns if not a["iscrowd"])


def tail_json_lines(path, n=5):
    p = Path(path)
    if not p.exists():
        return []
    return [json.loads(x) for x in p.read_text().splitlines()[-n:] if x.strip()]


def add_third_party_to_path(model):
    sys.path.insert(0, str(RTDETR_DIR if model == "rtdetr_r18" else YOLOX_DIR))
