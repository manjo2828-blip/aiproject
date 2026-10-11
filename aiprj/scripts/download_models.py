"""Idempotent model downloader. Usage: python scripts/download_models.py [--check]"""
import hashlib
import re
import sys
import urllib.request
from pathlib import Path

MODELS = Path(__file__).resolve().parents[1] / "models"
# (relative path, url or None, expected size in bytes or None)
FILES = [
    ("classification/model.onnx", "https://github.com/onnx/models/raw/main/validated/vision/classification/mobilenet/model/mobilenetv2-12.onnx", 13964571),
    ("classification/labels.txt", "https://raw.githubusercontent.com/pytorch/hub/master/imagenet_classes.txt", 10472),
    ("detection/model.onnx", "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_tiny.onnx", 20219662),
    ("pose/model.onnx", "https://huggingface.co/Xenova/yolov8n-pose/resolve/main/onnx/model.onnx", 13484153),
    ("face/face_detection_yunet_2023mar.onnx", "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx", 232589),
    ("face/face_recognition_sface_2021dec.onnx", "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx", 38696353),
    ("emotion/model.onnx", None, 113704964),
    ("emotion/tokenizer.json", None, None),
    ("emotion/labels.json", None, None),
]
EMOTION_NOTE = (
    "[emotion] No direct URL for the int8-quantized model. Download the fp32 ONNX + tokenizer.json from\n"
    "  https://huggingface.co/MelissaJ/koelectra-emotion-7-emotion-base-onnx\n"
    "  then quantize with onnxruntime.quantization.quantize_dynamic(weight_type=QInt8) -> models/emotion/model.onnx\n"
    "  (see wiki/models/emotion.md). Also needs labels.json and config.json in models/emotion/."
)


WIKI_MODELS = Path(__file__).resolve().parents[1] / "wiki" / "models"
# best effort: SHA-256 recorded in wiki/models/*.md, matched by file name or by directory (single-model docs)
_DOC_FOR_DIR = {"classification": "classification.md", "detection": "detection.md",
                "pose": "pose.md", "face": "face.md"}


def expected_sha(rel: str):
    try:
        doc = WIKI_MODELS / _DOC_FOR_DIR[rel.split("/")[0]]
        text = doc.read_text(encoding="utf-8")
    except (KeyError, OSError):
        return None
    name = rel.split("/")[-1]
    if not name.endswith(".onnx"):
        return None
    if rel.startswith("face/"):  # table row: `file` | size | sha
        m = re.search(re.escape(name) + r"`[^\n]*?`([0-9a-f]{64})`", text)
    else:
        m = re.search(r"(?i)sha-?256\**\s*[:`]*\s*`?([0-9a-f]{64})", text)
    if not m:
        return None
    return m.group(1)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ok(path: Path, size, sha=None):
    if not (path.exists() and path.stat().st_size > 0 and (size is None or path.stat().st_size == size)):
        return False
    return sha is None or sha256(path) == sha


def download(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "aiprj-downloader"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    tmp.replace(dest)


def main():
    check = "--check" in sys.argv
    missing_manual = False
    bad = []
    for rel, url, size in FILES:
        p = MODELS / rel
        sha = expected_sha(rel)
        good = ok(p, size, sha)
        if check:
            extra = f" ({p.stat().st_size:,} B{', sha256 verified' if sha and good else ''})" if p.exists() else ""
            print(f"[{'OK' if good else 'MISSING'}] {rel}{extra}")
            if not good:
                bad.append(rel)
            continue
        if good:
            print(f"[skip] {rel}")
        elif url is None:
            missing_manual = True
            bad.append(rel)
        else:
            print(f"[get ] {rel} <- {url}")
            try:
                download(url, p)
                if not ok(p, size, sha):
                    print(f"[fail] {rel}: size/sha256 mismatch")
                    p.unlink(missing_ok=True)
                    bad.append(rel)
            except Exception as e:
                print(f"[fail] {rel}: {e}")
                bad.append(rel)
    if not check and missing_manual:
        print(EMOTION_NOTE)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
