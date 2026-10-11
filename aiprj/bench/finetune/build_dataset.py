#!/usr/bin/env python
"""Build a single-class PERSON fine-tuning dataset (crowd-recall oriented) with license tracking.

Run from the project root:   .venv\\Scripts\\python -I bench\\finetune\\build_dataset.py --flavor permissive
                             .venv\\Scripts\\python -I bench\\finetune\\build_dataset.py --flavor research_nc

Two stages, both resumable/idempotent:
  1. FETCH  : download + downscale (max side 1333) the sampled images of every source needed by the flavor into a
              shared cache  (bench/finetune/cache/images/<source>/, records in cache/records/<source>.jsonl).
  2. ASSEMBLE: hard-link the cached images into <out>/<flavor>/ and write COCO json, YOLO labels, manifest, yaml.

Sources (tag -> default image budget):
  openimages    (3000) Open Images V7 validation+test, >=8 persons.     CC BY 2.0 images / CC BY 4.0 labels  [permissive]
  coco_crowded  (3000) COCO train2017, >=8 non-crowd persons.           per-image Flickr license (CC BY / BY-SA / PD only)
  coco_sparse   (1000) COCO train2017, 1-5 persons (replay).            same as above                        [permissive]
  crowdhuman    (5000) CrowdHuman TRAIN, >=10 persons.                  CC BY-NC 4.0   [research_nc ONLY, opt-in]

The CrowdHuman VAL split (used as the held-out evaluation set) is never touched: only the train zips are read, and
every candidate id is checked against annotation_val.odgt and bench/eval/data/gt.json.
"""
import argparse, csv, ctypes, hashlib, io, json, os, random, shutil, struct, sys, threading, time, zipfile, zlib
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = HERE / "cache"
RAW = CACHE / "raw"
UA = "aiprj-dataprep/1.0 (research dataset prep; contact manjo2828@gmail.com)"
MAX_SIDE = 1333
MIN_BOX = 4          # px, after downscale
JPEG_Q = 92
VAL_FRAC = 0.03      # hash-based split, identical across flavors
THREADS = 2
DEFAULT_BUDGET = {"openimages": 3000, "coco_crowded": 3000, "coco_sparse": 1000, "crowdhuman": 5000}
PERMISSIVE_SOURCES = ["openimages", "coco_crowded", "coco_sparse"]
NC_SOURCES = ["crowdhuman"]

LICENSES = {  # key -> (name, url, commercial_ok)
    "CC-BY-2.0": ("CC BY 2.0", "https://creativecommons.org/licenses/by/2.0/", True),
    "CC-BY-SA-2.0": ("CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0/", True),
    "NKCR": ("No known copyright restrictions (Flickr Commons)", "https://www.flickr.com/commons/usage/", True),
    "USGOV": ("United States Government Work", "https://www.usa.gov/government-works", True),
    "CC-BY-NC-4.0": ("CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/", False),
}
# COCO flickr license ids -> key (None = not usable commercially / derivatives -> excluded from the pool)
COCO_LIC = {1: None, 2: None, 3: None, 4: "CC-BY-2.0", 5: "CC-BY-SA-2.0", 6: None, 7: "NKCR", 8: "USGOV"}
ANN_LICENSE = {"openimages": "CC BY 4.0 (Open Images annotations)", "coco_crowded": "CC BY 4.0 (COCO annotations)",
               "coco_sparse": "CC BY 4.0 (COCO annotations)", "crowdhuman": "CC BY-NC 4.0 (CrowdHuman annotations)"}
OI_PERSON = "/m/01g317"
OI_PERSON_LIKE = ["/m/01g317", "/m/04yx4", "/m/03bt1vf", "/m/01bl7v", "/m/05r655"]  # Person, Man, Woman, Boy, Girl
HF = "https://huggingface.co/datasets/sshao0516/CrowdHuman/resolve/main/"
CH_ZIPS = ["CrowdHuman_train01.zip", "CrowdHuman_train02.zip", "CrowdHuman_train03.zip"]

_throttle = 0.3
log_lock = threading.Lock()


def log(*a):
    with log_lock:
        print(time.strftime("%H:%M:%S"), *a, flush=True)


def lower_priority():
    try:
        k = ctypes.windll.kernel32
        k.SetPriorityClass(k.GetCurrentProcess(), 0x00004000)  # BELOW_NORMAL_PRIORITY_CLASS
    except Exception as e:  # non-Windows
        try:
            os.nice(5)
        except Exception:
            log("could not lower priority:", e)


# ---------------------------------------------------------------- http
def http_get(url, rng=None, retries=5, timeout=90):
    """Returns (bytes, total_size_or_None). Polite: UA, exponential backoff."""
    h = {"User-Agent": UA}
    if rng:
        h["Range"] = "bytes=%d-%d" % rng
    err = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                data = r.read()
                total = None
                cr = r.headers.get("Content-Range")
                if cr and "/" in cr:
                    total = int(cr.rsplit("/", 1)[1])
                return data, total
        except urllib.error.HTTPError as e:
            err = e
            if e.code in (403, 404, 410):
                break
        except Exception as e:
            err = e
        time.sleep(min(60, 2 ** i * 1.5))
    raise RuntimeError("GET failed %s: %s" % (url, err))


def download_file(url, dst, rate_sleep=0.0):
    dst = Path(dst)
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    log("download", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            if rate_sleep:
                time.sleep(rate_sleep)
    tmp.replace(dst)
    return dst


class RangeFile(io.RawIOBase):
    """Seekable read-only view over an HTTP URL using Range requests (for listing zip central directories)."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        _, self.size = http_get(url, (0, 0))
        self._buf, self._start = b"", 0

    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        n = min(n, self.size - self.pos)
        if n <= 0:
            return b""
        if not (self._start <= self.pos and self.pos + n <= self._start + len(self._buf)):
            a = self.pos
            b = min(self.size - 1, a + max(n, 1 << 18) - 1)
            self._buf, _ = http_get(self.url, (a, b))
            self._start = a
        o = self.pos - self._start
        self.pos += n
        return self._buf[o:o + n]

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


def iter_json_array(fobj, key, chunk=8 << 20):
    """Stream the objects of a top-level JSON array `"key": [ ... ]` from a binary file object (low memory)."""
    dec = json.JSONDecoder()
    buf, found, eof = "", False, False
    pat = '"%s"' % key
    while True:
        if not eof and len(buf) < chunk:
            d = fobj.read(chunk)
            if not d:
                eof = True
            else:
                buf += d.decode("utf-8")
                continue
        if not found:
            i = buf.find(pat)
            if i < 0:
                buf = buf[-len(pat):]
                if eof:
                    return
                continue
            j = buf.find("[", i)
            if j < 0:
                buf = buf[i:]
                continue
            buf, found = buf[j + 1:], True
        buf = buf.lstrip(" \n\r\t,")
        if buf.startswith("]"):
            return
        try:
            obj, end = dec.raw_decode(buf)
        except json.JSONDecodeError:
            if eof:
                return
            d = fobj.read(chunk)
            if not d:
                eof = True
            else:
                buf += d.decode("utf-8")
            continue
        yield obj
        buf = buf[end:]


# ---------------------------------------------------------------- helpers
def eval_exclusions():
    ids = set()
    gt = ROOT / "bench" / "eval" / "data" / "gt.json"
    if gt.exists():
        ids |= {im["id"] for im in json.load(open(gt, encoding="utf8"))["images"]}
    p = download_file(HF + "annotation_val.odgt", RAW / "annotation_val.odgt")
    for line in open(p, encoding="utf8"):
        if line.strip():
            ids.add(json.loads(line)["ID"])
    return ids


def split_of(source, oid):
    h = int(hashlib.md5(("%s:%s" % (source, oid)).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return "val" if h < VAL_FRAC else "train"


def safe(s):
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in s)


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw, ih = min(ax2, bx2) - max(a[0], b[0]), min(ay2, by2) - max(a[1], b[1])
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    return inter / (a[2] * a[3] + b[2] * b[3] - inter)


def process_image(raw, rec, transpose, expect_wh=None):
    """Decode, optional EXIF transpose, downscale to MAX_SIDE, scale/clip boxes, write cache jpg. Returns record or None.
    rec['persons'] / rec['ignore'] are pixel xywh in the ORIGINAL (post-transpose) frame, or normalized if rec['norm']."""
    im = Image.open(io.BytesIO(raw))
    was_jpeg = im.format == "JPEG"
    t_changed = False
    if transpose:
        o = im.getexif().get(274, 1)
        if o and o != 1:
            im = ImageOps.exif_transpose(im)
            t_changed = True
    im = im.convert("RGB") if im.mode != "RGB" else im
    w0, h0 = im.size
    if expect_wh and tuple(expect_wh) != (w0, h0):
        raise ValueError("size mismatch %s vs %s" % ((w0, h0), tuple(expect_wh)))
    s = min(1.0, MAX_SIDE / max(w0, h0))
    w, h = (w0, h0) if s == 1.0 else (max(1, round(w0 * s)), max(1, round(h0 * s)))
    sx, sy = (w, h) if rec.get("norm") else (w / w0, h / h0)

    def conv(b):
        x1, y1 = max(0.0, b[0] * sx), max(0.0, b[1] * sy)
        x2, y2 = min(float(w), (b[0] + b[2]) * sx), min(float(h), (b[1] + b[3]) * sy)
        return [round(x1, 2), round(y1, 2), round(x2 - x1, 2), round(y2 - y1, 2)]

    persons = [bb for bb in (conv(b) for b in rec["persons"]) if bb[2] >= MIN_BOX and bb[3] >= MIN_BOX]
    ignore = []
    for b in rec["ignore"]:
        bb = conv(b[:4])
        if bb[2] >= MIN_BOX and bb[3] >= MIN_BOX:
            ignore.append(bb + [b[4]])
    if not persons:
        return None
    out = CACHE / "images" / rec["source"] / (rec["file"])
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    if s == 1.0 and was_jpeg and not t_changed:
        tmp.write_bytes(raw)
    else:
        if s != 1.0:
            im = im.resize((w, h), Image.LANCZOS)
        im.save(tmp, "JPEG", quality=JPEG_Q)
    tmp.replace(out)
    r = {k: v for k, v in rec.items() if k not in ("persons", "ignore", "norm")}
    r.update(w=w, h=h, persons=persons, ignore=ignore)
    return r


def read_records(source):
    p = CACHE / "records" / (source + ".jsonl")
    recs = {}
    if p.exists():
        for line in open(p, encoding="utf8"):
            try:
                r = json.loads(line)
                recs[r["id"]] = r
            except Exception:
                pass
    return recs


def run_fetch(source, items, fetch_fn, budget):
    """items: ranked pool (list of dicts with 'id','rank',...). fetch_fn(item)->bytes-or-record. Resumable."""
    rdir = CACHE / "records"
    rdir.mkdir(parents=True, exist_ok=True)
    have = read_records(source)
    failed_p = rdir / (source + ".failed")
    failed = set(open(failed_p).read().split("\n")) if failed_p.exists() else set()
    # walk ranked pool until `budget` records are secured (failures are skipped and replaced by later ranks)
    todo_total = budget - sum(1 for it in items[:budget] if it["id"] in have)
    log(source, "have", len(have), "budget", budget, "pool", len(items))
    pending = [it for it in items if it["id"] not in have and it["id"] not in failed]
    ok = sum(1 for it in items if it["id"] in have and it["rank"] < 10 ** 9)
    fo = open(rdir / (source + ".jsonl"), "a", encoding="utf8")
    ff = open(failed_p, "a")
    n_new = 0

    def job(it):
        try:
            r = fetch_fn(it)
        except Exception as e:
            return it, None, str(e)
        time.sleep(_throttle)
        return it, r, None

    # count secured among the best `budget` ranks: we keep going until budget secured records exist in total
    secured = len([1 for k in have])
    pos = 0
    with ThreadPoolExecutor(THREADS) as ex:
        while secured < budget and pos < len(pending):
            batch = pending[pos:pos + 40 * THREADS][:max(THREADS, budget - secured)]
            pos += len(batch)
            for fut in [ex.submit(job, it) for it in batch]:
                it, r, err = fut.result()
                if r is None:
                    ff.write(it["id"] + "\n"); ff.flush()
                    if err:
                        log(source, "skip", it["id"], err[:150])
                    continue
                fo.write(json.dumps(r) + "\n"); fo.flush()
                secured += 1; n_new += 1
                if n_new % 100 == 0:
                    log(source, "fetched", n_new, "total", secured, "/", budget)
    fo.close(); ff.close()
    log(source, "done: total", secured, "new", n_new)


# ---------------------------------------------------------------- source: Open Images
def oi_pool(seed):
    pf = RAW / "oi_pool.json"
    if pf.exists():
        return json.load(open(pf, encoding="utf8"))
    base = "https://storage.googleapis.com/openimages/"
    download_file(base + "v6/oidv6-class-descriptions.csv", RAW / "oidv6-class-descriptions.csv")
    pool = []
    for sp, d in (("validation", "validation"), ("test", "test")):
        ann = download_file(base + "v5/%s-annotations-bbox.csv" % sp, RAW / ("%s-annotations-bbox.csv" % sp))
        img = download_file(base + "2018_04/%s/%s-images-with-rotation.csv" % (d, d), RAW / ("%s-images.csv" % sp))
        per = {}
        for r in csv.DictReader(open(ann, encoding="utf8")):
            if r["LabelName"] in OI_PERSON_LIKE and float(r["Confidence"]) > 0:
                per.setdefault(r["ImageID"], []).append(r)
        meta = {}
        for r in csv.DictReader(open(img, encoding="utf8")):
            if r["ImageID"] in per:
                meta[r["ImageID"]] = r
        for iid, rows in per.items():
            rows.sort(key=lambda r: OI_PERSON_LIKE.index(r["LabelName"]))  # Person first, then Man/Woman/...
            persons, ign = [], []
            for r in rows:
                x1, x2, y1, y2 = (float(r[k]) for k in ("XMin", "XMax", "YMin", "YMax"))
                b = [x1, y1, x2 - x1, y2 - y1]
                if r["IsGroupOf"] == "1" or r["IsDepiction"] == "1":
                    ign.append(b + ["group" if r["IsGroupOf"] == "1" else "depiction"])
                elif all(iou(b, p) < 0.6 for p in persons):
                    persons.append(b)
            if len(persons) < 8 or iid not in meta:
                continue
            m = meta[iid]
            pool.append(dict(id=iid, src_split=sp, persons=persons, ignore=ign, license="CC-BY-2.0",
                             license_raw=m["License"], url=m["OriginalLandingURL"], rotation=m.get("Rotation", "")))
    pool.sort(key=lambda p: p["id"])
    random.Random(seed).shuffle(pool)
    for i, p in enumerate(pool):
        p["rank"] = i
    RAW.mkdir(parents=True, exist_ok=True)
    json.dump(pool, open(pf, "w", encoding="utf8"))
    for f in RAW.glob("*-annotations-bbox.csv"):
        f.unlink()
    for f in RAW.glob("*-images.csv"):
        f.unlink()
    return pool


def oi_fetch(it):
    url = "https://open-images-dataset.s3.amazonaws.com/%s/%s.jpg" % (it["src_split"], it["id"])
    raw, _ = http_get(url)
    rec = dict(source="openimages", id=it["id"], file="oi_%s.jpg" % it["id"], license=it["license"], url=it["url"],
               src_url=url, rank=it["rank"], persons=it["persons"], ignore=it["ignore"], norm=True,
               split=split_of("openimages", it["id"]))
    return process_image(raw, rec, transpose=True)


# ---------------------------------------------------------------- source: COCO
def coco_pools(seed, n_sparse_pool=6000):
    pf = RAW / "coco_pool.json"
    if pf.exists():
        return json.load(open(pf, encoding="utf8"))
    z = download_file("http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
                      RAW / "annotations_trainval2017.zip", rate_sleep=0.02)
    member = "annotations/person_keypoints_train2017.json"
    with zipfile.ZipFile(z) as zf:
        lic = {}
        with zf.open(member) as f:
            for l in iter_json_array(f, "licenses"):
                lic[l["id"]] = l
        with zf.open(member) as f:
            imgs = {im["id"]: dict(file=im["file_name"], w=im["width"], h=im["height"], lic=im["license"],
                                   flickr=im.get("flickr_url", ""), coco=im.get("coco_url", ""))
                    for im in iter_json_array(f, "images") if COCO_LIC.get(im["license"])}
        per, crowd = {}, {}
        with zf.open(member) as f:
            for a in iter_json_array(f, "annotations"):
                if a["image_id"] not in imgs or a["category_id"] != 1:
                    continue
                b = [round(v, 2) for v in a["bbox"]]
                if a["iscrowd"]:
                    crowd.setdefault(a["image_id"], []).append(b + ["coco_crowd"])
                elif b[2] >= MIN_BOX and b[3] >= MIN_BOX:
                    per.setdefault(a["image_id"], []).append(b)
    crowded, sparse = [], []
    for iid, ps in per.items():
        im = imgs[iid]
        d = dict(id=str(iid), file=im["file"], w=im["w"], h=im["h"], license=COCO_LIC[im["lic"]],
                 license_raw=lic.get(im["lic"], {}).get("url", ""), url=im["flickr"] or im["coco"],
                 src_url=im["coco"], persons=ps, ignore=crowd.get(iid, []))
        (crowded if len(ps) >= 8 else sparse if len(ps) <= 5 else []).append(d) if len(ps) >= 8 or len(ps) <= 5 else None
    crowded.sort(key=lambda d: d["id"]); sparse.sort(key=lambda d: d["id"])
    rng = random.Random(seed)
    rng.shuffle(crowded); rng.shuffle(sparse)
    sparse = sparse[:n_sparse_pool]
    for L in (crowded, sparse):
        for i, d in enumerate(L):
            d["rank"] = i
    pool = dict(crowded=crowded, sparse=sparse)
    json.dump(pool, open(pf, "w", encoding="utf8"))
    z.unlink()  # delete the zip after extracting what we need
    return pool


def make_coco_fetch(source):
    def fetch(it):
        url = it["src_url"] or "http://images.cocodataset.org/train2017/" + it["file"]
        raw, _ = http_get(url)
        rec = dict(source=source, id=it["id"], file="%s_%s.jpg" % (source, it["id"]), license=it["license"],
                   url=it["url"], src_url=url, rank=it["rank"], persons=it["persons"], ignore=it["ignore"],
                   split=split_of(source, it["id"]))
        return process_image(raw, rec, transpose=False, expect_wh=(it["w"], it["h"]))  # COCO boxes ignore EXIF
    return fetch


# ---------------------------------------------------------------- source: CrowdHuman train
def ch_pool(seed, exclude):
    pf = RAW / "ch_pool.json"
    if pf.exists():
        return json.load(open(pf, encoding="utf8"))
    p = download_file(HF + "annotation_train.odgt", RAW / "annotation_train.odgt", rate_sleep=0.01)
    pool = []
    for line in open(p, encoding="utf8"):
        if not line.strip():
            continue
        d = json.loads(line)
        if d["ID"] in exclude:
            raise RuntimeError("train id also in val/eval: " + d["ID"])
        per, ign = [], []
        for g in d["gtboxes"]:
            b = [float(v) for v in g["fbox"]]
            ex = g.get("extra", {}) or {}
            if g["tag"] == "mask":
                ign.append(b + ["mask"])
            elif g["tag"] == "person":
                if ex.get("ignore", 0) == 1:
                    ign.append(b + ["extra_ignore"])
                else:
                    per.append(b)
        valid = [b for b in per if b[2] >= MIN_BOX and b[3] >= MIN_BOX]
        if len(valid) >= 10:
            pool.append(dict(id=d["ID"], persons=per, ignore=ign))
    pool.sort(key=lambda d: d["id"])
    random.Random(seed).shuffle(pool)
    for i, d in enumerate(pool):
        d["rank"] = i
    json.dump(pool, open(pf, "w", encoding="utf8"))
    return pool


def ch_index():
    pf = RAW / "ch_zip_index.json"
    if pf.exists():
        return json.load(open(pf))
    idx = {}
    for zn in CH_ZIPS:
        log("indexing", zn)
        rf = RangeFile(HF + zn)
        with zipfile.ZipFile(rf) as zf:
            for zi in zf.infolist():
                if zi.filename.lower().endswith(".jpg"):
                    stem = os.path.splitext(os.path.basename(zi.filename))[0]
                    idx[stem] = [zn, zi.header_offset, zi.compress_size, zi.compress_type, zi.file_size]
    json.dump(idx, open(pf, "w"))
    return idx


def ch_fetch_factory(idx):
    def fetch(it):
        e = idx.get(it["id"])
        if e is None:
            raise KeyError("not in train zips")
        zn, off, csize, method, _ = e
        data, _t = http_get(HF + zn, (off, off + 30 + csize + 1024))
        sig, = struct.unpack("<I", data[:4])
        if sig != 0x04034B50:
            raise ValueError("bad local header")
        nlen, elen = struct.unpack("<HH", data[26:30])
        body = data[30 + nlen + elen:30 + nlen + elen + csize]
        if len(body) < csize:
            raise ValueError("short read")
        raw = body if method == 0 else zlib.decompress(body, -15)
        rec = dict(source="crowdhuman", id=it["id"], file="ch_%s.jpg" % safe(it["id"]), license="CC-BY-NC-4.0",
                   url="https://www.crowdhuman.org/ (id %s)" % it["id"], src_url=HF + zn, rank=it["rank"],
                   persons=it["persons"], ignore=it["ignore"], split=split_of("crowdhuman", it["id"]))
        return process_image(raw, rec, transpose=False)
    return fetch


# ---------------------------------------------------------------- assemble
def pick_records(sources, budget):
    out = []
    for s in sources:
        recs = [r for r in read_records(s).values() if LICENSES[r["license"]][2] or s in NC_SOURCES]
        recs.sort(key=lambda r: r["rank"])
        out += recs[:budget[s]]
    return out


def link(src, dst):
    if dst.exists():
        return
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def assemble(flavor, out, recs):
    root = Path(out) / flavor
    lic_keys = sorted({r["license"] for r in recs})
    lic_list = [dict(id=i + 1, name=LICENSES[k][0], url=LICENSES[k][1], commercial_ok=LICENSES[k][2], key=k)
                for i, k in enumerate(lic_keys)]
    lic_id = {l["key"]: l["id"] for l in lic_list}
    keep = {sp: set() for sp in ("train", "val")}
    manifest, ignore_side = [], {}
    for sp in ("train", "val"):
        (root / "images" / sp).mkdir(parents=True, exist_ok=True)
        (root / "labels" / sp).mkdir(parents=True, exist_ok=True)
        images, anns, aid = [], [], 0
        for r in sorted([x for x in recs if x["split"] == sp], key=lambda x: (x["source"], x["file"])):
            iid = len(images) + 1
            link(CACHE / "images" / r["source"] / r["file"], root / "images" / sp / r["file"])
            keep[sp].add(r["file"])
            images.append(dict(id=iid, file_name=r["file"], width=r["w"], height=r["h"], license=lic_id[r["license"]],
                               source=r["source"], original_id=r["id"], coco_url=r.get("src_url", ""),
                               flickr_url=r["url"]))
            lines = []
            for b in r["persons"]:
                aid += 1
                anns.append(dict(id=aid, image_id=iid, category_id=1, bbox=b, area=round(b[2] * b[3], 2), iscrowd=0))
                cx, cy = (b[0] + b[2] / 2) / r["w"], (b[1] + b[3] / 2) / r["h"]
                lines.append("0 %.6f %.6f %.6f %.6f" % (min(max(cx, 0), 1), min(max(cy, 0), 1), b[2] / r["w"], b[3] / r["h"]))
            for b in r["ignore"]:
                aid += 1
                anns.append(dict(id=aid, image_id=iid, category_id=1, bbox=b[:4], area=round(b[2] * b[3], 2),
                                 iscrowd=1, ignore_reason=b[4]))
            if r["ignore"]:
                ignore_side["%s/%s" % (sp, r["file"])] = [b[:4] for b in r["ignore"]]
            (root / "labels" / sp / (Path(r["file"]).stem + ".txt")).write_text("\n".join(lines) + "\n")
            lk = LICENSES[r["license"]]
            manifest.append([r["file"], r["source"], r["id"], lk[0], r["url"], len(r["persons"]), len(r["ignore"]),
                             r["w"], r["h"], sp, lk[1], int(lk[2]), ANN_LICENSE[r["source"]], f"images/{sp}/{r['file']}"])
        coco = dict(info=dict(description="aiprj person fine-tune set (%s)" % flavor, version="1.0",
                              date_created=time.strftime("%Y-%m-%d")),
                    licenses=lic_list, images=images, annotations=anns,
                    categories=[dict(id=1, name="person", supercategory="person")])
        json.dump(coco, open(root / ("annotations_%s.json" % sp), "w"), separators=(",", ":"))
        # prune stale files (e.g. after lowering --max-per-source)
        for d, ext in (("images", None), ("labels", None)):
            for f in (root / d / sp).iterdir():
                name = f.name if d == "images" else None
                stems = {Path(n).stem for n in keep[sp]}
                if (d == "images" and f.name not in keep[sp]) or (d == "labels" and f.stem not in stems):
                    f.unlink()
    json.dump(ignore_side, open(root / "ignore.json", "w"), separators=(",", ":"))
    with open(root / "manifest.csv", "w", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        w.writerow(["image_file", "source", "original_id", "license", "url", "n_persons", "n_ignore", "w", "h", "split",
                    "license_url", "commercial_ok", "annotation_license", "relpath"])
        w.writerows(manifest)
    (root / "dataset.yaml").write_text(
        "# Ultralytics-style dataset (single class). 'path' omitted -> resolved relative to this file.\n"
        "# Flavor: %s%s\ntrain: images/train\nval: images/val\nnc: 1\nnames:\n  0: person\n" % (
            flavor, "  (INCLUDES CC BY-NC 4.0 CrowdHuman: non-commercial research only)" if flavor == "research_nc" else ""))
    return root


def contact_sheets(out_dir, seed):
    for src in DEFAULT_BUDGET:
        recs = sorted(read_records(src).values(), key=lambda r: r["rank"])
        recs = [r for r in recs if (CACHE / "images" / src / r["file"]).exists()]
        if len(recs) < 9:
            continue
        pick = random.Random(seed).sample(recs[:600], 9)
        W, H = 520, 400
        sheet = Image.new("RGB", (W * 3, H * 3), (30, 30, 30))
        for i, r in enumerate(pick):
            im = Image.open(CACHE / "images" / src / r["file"]).convert("RGB")
            s = min(W / im.width, H / im.height)
            im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))))
            d = ImageDraw.Draw(im)
            for b in r["ignore"]:
                d.rectangle([b[0] * s, b[1] * s, (b[0] + b[2]) * s, (b[1] + b[3]) * s], outline=(60, 120, 255))
            for b in r["persons"]:
                d.rectangle([b[0] * s, b[1] * s, (b[0] + b[2]) * s, (b[1] + b[3]) * s], outline=(0, 255, 0), width=2)
            d.text((4, 4), "%s n=%d ign=%d" % (r["id"][:18], len(r["persons"]), len(r["ignore"])), fill=(255, 255, 0))
            sheet.paste(im, ((i % 3) * W, (i // 3) * H))
        sheet.save(Path(out_dir) / ("contact_sheet_%s.jpg" % src), quality=85)
        log("contact sheet", src)


def main():
    global _throttle, THREADS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--flavor", choices=["permissive", "research_nc"], default="permissive",
                    help="research_nc adds CrowdHuman TRAIN (CC BY-NC 4.0). Never the default.")
    ap.add_argument("--max-per-source", type=int, default=None, help="cap images per source (default: per-source budgets)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(HERE / "data"))
    ap.add_argument("--throttle", type=float, default=0.3, help="seconds slept after each download per thread")
    ap.add_argument("--threads", type=int, default=2, help="max 2")
    ap.add_argument("--assemble-only", action="store_true", help="skip network, use the cache")
    a = ap.parse_args()
    lower_priority()
    _throttle, THREADS = a.throttle, max(1, min(2, a.threads))
    budget = {k: min(v, a.max_per_source) if a.max_per_source else v for k, v in DEFAULT_BUDGET.items()}
    sources = PERMISSIVE_SOURCES + (NC_SOURCES if a.flavor == "research_nc" else [])
    CACHE.mkdir(exist_ok=True); RAW.mkdir(exist_ok=True)
    if not a.assemble_only:
        exclude = eval_exclusions()
        log("excluded eval/val ids:", len(exclude))
        if "openimages" in sources:
            run_fetch("openimages", oi_pool(a.seed), oi_fetch, budget["openimages"])
        if "coco_crowded" in sources or "coco_sparse" in sources:
            cp = coco_pools(a.seed)
            run_fetch("coco_crowded", cp["crowded"], make_coco_fetch("coco_crowded"), budget["coco_crowded"])
            run_fetch("coco_sparse", cp["sparse"], make_coco_fetch("coco_sparse"), budget["coco_sparse"])
        if "crowdhuman" in sources:
            pool = ch_pool(a.seed, exclude)
            run_fetch("crowdhuman", pool, ch_fetch_factory(ch_index()), budget["crowdhuman"])
    recs = pick_records(sources, budget)
    bad = [r for r in recs if r["id"] in set()]  # placeholder for readability
    if a.flavor == "permissive":
        assert all(LICENSES[r["license"]][2] and r["source"] != "crowdhuman" for r in recs), "non-permissive leak"
    root = assemble(a.flavor, a.out, recs)
    contact_sheets(a.out, a.seed)
    log("assembled", root, "images:", len(recs))


if __name__ == "__main__":
    main()
