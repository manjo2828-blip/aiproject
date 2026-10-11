# Crowded-scene PERSON evaluation set

- Dataset: CrowdHuman (Shao et al., 2018), split **val** (4370 images). Unseen by the evaluated detectors (trained on COCO train2017).
- Citation: S. Shao et al., "CrowdHuman: A Benchmark for Detecting Human in a Crowd", arXiv:1805.00123. Homepage https://www.crowdhuman.org/
- License: CC BY-NC 4.0 per HF card / CrowdHuman terms -> non-commercial research use only; do not redistribute commercially.
- Download: HF mirror `sshao0516/CrowdHuman` (no login): `annotation_val.odgt` (23 MB) and `CrowdHuman_val.zip` (2.5 GB) via plain HTTPS `resolve/main/...`. Only the 100 sampled images are extracted into `bench/eval/data/images/`.

## Sampling
- Person count per image = boxes with tag `person`, `extra.ignore==0`, fbox w,h >= 4.
- Pool = val images with >= 15 such persons (threshold not relaxed): **2340** images (of 4370).
- Pool sorted by ID, then `random.Random(42).sample(pool, 100)`.
- Images with max side > 2000 (19 of 100) downscaled to 2000 (LANCZOS) and boxes scaled; others kept at original resolution.
- Files: `images/NNN_<id>.jpg` (ID comma replaced by `-`), `gt.json` (schema as specified), `contact_sheet.jpg` (first 9 images, GT overlay; green=person, red=ignored person, blue=mask/ignore region).

## Label mapping
- bbox = `fbox` (xywh -> xyxy), full-body AMODAL box: for people cut off by the image border or occluded it can extend outside the image or over hidden parts. Clip/handle in the scorer if desired.
- vis_ratio = vbox area / fbox area (capped at 1); occ: none >= 0.9, partial 0.5-0.9, heavy < 0.5.
- tag `mask` boxes -> `ignore_regions` (not in persons). `extra.ignore==1` or degenerate (<4 px) persons -> persons with `ignore=true`.

## Statistics
| | min | median | mean | max | 10-19 | 20-39 | 40-79 | 80+ |
|---|---|---|---|---|---|---|---|---|
| Pool (2340 imgs) | 15 | 26 | 35.0 | 310 | 617 | 1150 | 436 | 137 |
| Sample (100 imgs) | 15 | 30 | 36.1 | 148 | 14 | 56 | 24 | 6 |

Sample totals: 3607 valid GT persons, 66 ignored persons, 884 ignore regions (mask boxes).

## Caveats
- CrowdHuman annotates every visible person including heavily occluded and tiny ones; recall on this set will be low for any detector, and many boxes are heavily overlapping (NMS-sensitive).
- Amodal full-body boxes differ from COCO-style visible-extent boxes; consider also evaluating against vbox-derived ratios (vis_ratio provided) or filtering to vis_ratio >= 0.3-0.5.
- Images contain stock-photo watermarks (iStock, Dreamstime); sizes after the 2000 px cap are recorded in gt.json.
