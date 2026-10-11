r"""Unified fine-tuning launcher (RT-DETRv2-R18vd / YOLOX-m, single class 'person', crowd-recall settings).

  python bench/finetune/train/run_train.py --model rtdetr_r18 --flavor permissive --pilot --device cuda --out bench/finetune/runs/pilot_rtdetr
  python bench/finetune/train/run_train.py --model yolox_m    --flavor permissive --pilot --device cuda --out bench/finetune/runs/pilot_yolox
  # local CPU smoke test (a few iterations on a tiny subset):
  python bench/finetune/train/run_train.py --model rtdetr_r18 --device cpu --subset 48 --epochs 3 --imgsz 640 --batch 2 --workers 2 --smoke --out bench/finetune/runs/smoke_rtdetr

What it does: stages annotations (absolute paths, 1 class, optional subset) -> writes the per-run config
(RT-DETR yml / YOLOX json) -> launches the upstream trainer as a subprocess -> logs to <out>/train.log
-> writes <out>/run_config.json and <out>/summary.json.
Budgets: --pilot = 12 epochs (same for both models); --full = 40 epochs; --epochs N overrides.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ft_common as C  # noqa: E402

PILOT_EPOCHS, FULL_EPOCHS = 12, 40


def fwd(p):
    return str(Path(p).resolve()).replace("\\", "/")


def build_rtdetr_cfg(a, out, tr_json, va_json, n_train):
    import yaml
    S, B, E = a.imgsz, a.batch, a.epochs
    s = B / 16.0                                              # linear lr scaling vs the official batch 16
    ipe = max(1, n_train // B)                                # iterations / epoch
    stop = max(1, E - 2) if E > 3 else E                      # last 2 epochs: no strong aug / no multi-scale
    scales = [x for x in range(640, 961, 32)]                 # multi-scale 640..960 (whole batch resized)
    scales = scales + [S, S, S]                               # bias towards the base size
    cfg = {
        "__include__": [fwd(C.RTDETR_DIR / "configs/rtdetrv2/rtdetrv2_r18vd_120e_coco.yml")],
        "output_dir": fwd(out / "rtdetr_out"),
        "epoches": E,
        "print_freq": 1 if a.smoke else 20,
        "checkpoint_freq": 1 if a.smoke else max(1, E // 3),
        "sync_bn": False,
        "use_amp": a.device == "cuda",
        "use_ema": True,
        "ema": {"type": "ModelEMA", "decay": 0.999, "warmups": min(1000, ipe * 2)},
        "eval_spatial_size": [S, S],
        # keep the 80-class COCO head, person = COCO category id 1 -> label 0 (remap_mscoco_category: True)
        "num_classes": 80,
        "remap_mscoco_category": True,
        "PResNet": {"pretrained": False},                     # full COCO checkpoint is loaded via --tuning
        "RTDETRTransformerv2": {"num_queries": a.queries, "num_denoising": 200},
        "RTDETRPostProcessor": {"num_top_queries": a.queries},
        "optimizer": {
            "type": "AdamW", "lr": 1e-4 * s, "betas": [0.9, 0.999], "weight_decay": 1e-4,
            "params": [
                {"params": "^(?=.*backbone)(?!.*norm).*$", "lr": 1e-5 * s},
                {"params": "^(?=.*(?:norm|bn)).*$", "weight_decay": 0.0},
            ],
        },
        "lr_scheduler": {"type": "MultiStepLR", "milestones": [max(1, int(E * 0.8))], "gamma": 0.1},
        "lr_warmup_scheduler": {"type": "LinearWarmup", "warmup_duration": min(500, max(2, ipe))},
        "train_dataloader": {
            "dataset": {
                "img_folder": fwd(C.DATA), "ann_file": fwd(tr_json),
                "transforms": {
                    "ops": [
                        {"type": "RandomPhotometricDistort", "p": 0.5},
                        {"type": "RandomZoomOut", "fill": 0, "p": 0.3},      # fewer zoom-outs: keep people large enough
                        {"type": "RandomIoUCrop", "p": 0.8},
                        {"type": "SanitizeBoundingBoxes", "min_size": 1},
                        {"type": "RandomHorizontalFlip"},
                        {"type": "Resize", "size": [S, S]},
                        {"type": "SanitizeBoundingBoxes", "min_size": 1},
                        {"type": "ConvertPILImage", "dtype": "float32", "scale": True},
                        {"type": "ConvertBoxes", "fmt": "cxcywh", "normalize": True},
                    ],
                    "policy": {"name": "stop_epoch", "epoch": stop,
                               "ops": ["RandomPhotometricDistort", "RandomZoomOut", "RandomIoUCrop"]},
                },
            },
            "collate_fn": {"type": "BatchImageCollateFunction", "scales": scales, "stop_epoch": stop},
            "total_batch_size": B, "num_workers": a.workers, "shuffle": True,
        },
        "val_dataloader": {
            "dataset": {
                "img_folder": fwd(C.DATA), "ann_file": fwd(va_json),
                "transforms": {"ops": [{"type": "Resize", "size": [S, S]},
                                       {"type": "ConvertPILImage", "dtype": "float32", "scale": True}]},
            },
            "total_batch_size": max(2, B), "num_workers": a.workers,
        },
    }
    p = out / "rtdetr_config.yml"
    p.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    return p


def popen_kwargs():
    kw = {}
    if os.name == "nt":
        kw["creationflags"] = 0x00004000 if sys_priority_low() else 0   # BELOW_NORMAL_PRIORITY_CLASS
    return kw


def sys_priority_low():
    return True


def run_logged(cmd, log_path, env, cwd=None):
    print("$", " ".join(map(str, cmd)), flush=True)
    t0 = time.time()
    with open(log_path, "a", encoding="utf-8") as lf:
        lf.write("$ " + " ".join(map(str, cmd)) + "\n")
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding="utf-8", errors="replace", env=env, cwd=cwd, **popen_kwargs())
        for line in p.stdout:
            sys.stdout.write(line)
            lf.write(line)
            lf.flush()
        rc = p.wait()
    return rc, time.time() - t0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", choices=["rtdetr_r18", "yolox_m"], required=True)
    ap.add_argument("--flavor", choices=["permissive", "research_nc"], default="permissive")
    ap.add_argument("--epochs", type=int, default=None)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--pilot", action="store_true", help=f"{PILOT_EPOCHS} epochs (same budget for both models)")
    g.add_argument("--full", action="store_true", help=f"{FULL_EPOCHS} epochs")
    ap.add_argument("--imgsz", type=int, default=800)
    ap.add_argument("--batch", type=int, default=None, help="default: 16 (cuda) / 2 (cpu)")
    ap.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    ap.add_argument("--subset", type=int, default=0, help="use only N train images (val: N//2, min 8)")
    ap.add_argument("--workers", type=int, default=None, help="dataloader workers (default 4 cuda / 2 cpu; 0 on Windows if hangs)")
    ap.add_argument("--queries", type=int, default=400, help="RT-DETR num_queries/top-k (300-500)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--max-iters", type=int, default=0, help="YOLOX CPU loop only: stop after N iterations")
    ap.add_argument("--smoke", action="store_true", help="verbose per-iteration logging, no checkpoints spam")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    a.epochs = a.epochs or (FULL_EPOCHS if a.full else PILOT_EPOCHS)
    a.batch = a.batch or (16 if a.device == "cuda" else 2)
    a.workers = a.workers if a.workers is not None else (4 if a.device == "cuda" else 2)
    assert a.imgsz % 32 == 0, "--imgsz must be a multiple of 32"
    if a.device == "cpu":
        C.lower_priority()
        a.workers = min(a.workers, 2)
    out = Path(a.out)
    if not out.is_absolute():
        out = C.ROOT / out
    out.mkdir(parents=True, exist_ok=True)
    (out / "data" / "annotations").mkdir(parents=True, exist_ok=True)

    # data
    info = {}
    try:
        info = json.loads((C.DATA / "annotations_train.json").read_text(encoding="utf-8")).get("info", {}) or {}
    except Exception:  # noqa: BLE001
        pass
    if info.get("flavor") and info["flavor"] != a.flavor:
        sys.exit(f"data/ was built with flavor={info['flavor']} but --flavor {a.flavor} requested. "
                 f"Rebuild with build_dataset.py --flavor {a.flavor}.")
    ann_dir = out / "data" / "annotations"
    tr_json, ntr, nbox = C.stage_split("train", ann_dir, a.subset, a.seed)
    va_json, nva, _ = C.stage_split("val", ann_dir, max(8, a.subset // 2) if a.subset else 0, a.seed)
    print(f"staged train {ntr} imgs / {nbox} boxes, val {nva} imgs")
    ckpt = C.ensure_ckpt(a.model)

    env = dict(os.environ, TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD="1", PYTHONUNBUFFERED="1")
    env["PYTHONPATH"] = os.pathsep.join([str(C.RTDETR_DIR if a.model == "rtdetr_r18" else C.YOLOX_DIR),
                                         env.get("PYTHONPATH", "")])
    py = sys.executable
    cfg_dump = dict(vars(a), out=str(out), n_train=ntr, n_val=nva, n_boxes=nbox, ckpt=str(ckpt),
                    data_flavor_in_json=info.get("flavor"))
    (out / "run_config.json").write_text(json.dumps(cfg_dump, indent=1), encoding="utf-8")

    log = out / "train.log"
    if a.model == "rtdetr_r18":
        yml = build_rtdetr_cfg(a, out, tr_json, va_json, ntr)
        cmd = [py, str(C.RTDETR_DIR / "tools" / "train.py"), "-c", str(yml), "-d", a.device,
               "--seed", str(a.seed), "--output-dir", str(out / "rtdetr_out")]
        cmd += ["-r", str(next((out / "rtdetr_out").glob("last.pth"))) ] if a.resume else ["-t", str(ckpt)]
        if a.device == "cuda":
            cmd.append("--use-amp")
        rc, dt = run_logged(cmd, log, env, cwd=str(C.RTDETR_DIR))
        final = out / "rtdetr_out" / "best.pth"
    else:
        ycfg = dict(imgsz=a.imgsz, epochs=a.epochs, output_dir=fwd(out / "yolox_out"), data_dir=fwd(out / "data"),
                    workers=a.workers, seed=a.seed, device=a.device, eval_interval=1 if a.smoke else max(1, a.epochs // 4),
                    print_interval=1 if a.smoke else 20)
        (out / "yolox_cfg.json").write_text(json.dumps(ycfg, indent=1), encoding="utf-8")
        env["FT_YOLOX_CFG"] = str(out / "yolox_cfg.json")
        if a.device == "cuda":
            cmd = [py, str(C.YOLOX_DIR / "tools" / "train.py"), "-f", str(HERE / "yolox_exp.py"), "-b", str(a.batch),
                   "-d", "1", "-c", str(ckpt), "--fp16", "-expn", "train"]
            if a.resume:
                cmd.append("--resume")
        else:
            cmd = [py, str(HERE / "yolox_cpu_train.py"), "--cfg", str(out / "yolox_cfg.json"), "--ckpt", str(ckpt),
                   "--batch", str(a.batch), "--max-iters", str(a.max_iters)]
        rc, dt = run_logged(cmd, log, env, cwd=str(C.YOLOX_DIR))
        final = out / "yolox_out" / "train" / "best_ckpt.pth"

    summ = dict(model=a.model, returncode=rc, wall_sec=round(dt, 1), final_checkpoint=str(final),
                final_exists=final.exists(), epochs=a.epochs, batch=a.batch, imgsz=a.imgsz, device=a.device,
                n_train=ntr, n_val=nva)
    (out / "summary.json").write_text(json.dumps(summ, indent=1), encoding="utf-8")
    print(json.dumps(summ))
    sys.exit(rc)


if __name__ == "__main__":
    main()
