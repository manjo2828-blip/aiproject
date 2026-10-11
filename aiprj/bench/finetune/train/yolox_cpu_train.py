"""Minimal CPU/any-device training loop for YOLOX (the upstream Trainer is CUDA-only).
Used for the local smoke test. Same exp, same model init, same loss, same data pipeline
(mosaic/mixup/multi-scale), SGD+nesterov, warmup + cosine, EMA. Saves checkpoints in the upstream
format ({"model": state_dict}) so export/eval tools accept them.
usage: python yolox_cpu_train.py --cfg runs/x/yolox_cfg.json --ckpt pretrained/yolox_m.pth --batch 2
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ft_common as C  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--cfg", required=True)
ap.add_argument("--ckpt", required=True)
ap.add_argument("--batch", type=int, default=2)
ap.add_argument("--max-iters", type=int, default=0, help="stop after N iterations (0 = all epochs)")
ap.add_argument("--threads", type=int, default=4)
a = ap.parse_args()
os.environ["FT_YOLOX_CFG"] = a.cfg
sys.path.insert(0, str(C.YOLOX_DIR))
C.lower_priority()

import torch  # noqa: E402
from yolox.exp import get_exp  # noqa: E402
from yolox.utils import ModelEMA, load_ckpt  # noqa: E402

torch.set_num_threads(a.threads)
exp = get_exp(str(HERE / "yolox_exp.py"), None)
if exp.seed is not None:
    torch.manual_seed(exp.seed)
out = Path(exp.output_dir) / exp.exp_name
out.mkdir(parents=True, exist_ok=True)
log = open(out / "cpu_train_log.jsonl", "w")

model = exp.get_model()
load_ckpt(model, torch.load(a.ckpt, map_location="cpu")["model"])   # 1-class cls head is re-initialised
model.train()
loader = exp.get_data_loader(a.batch, False, no_aug=False)
ipe = len(loader)  # iterations per epoch
lr = exp.basic_lr_per_img * a.batch
opt = exp.get_optimizer(a.batch)
sched = exp.get_lr_scheduler(lr, ipe)
ema = ModelEMA(model, 0.9998)
total = a.max_iters or ipe * exp.max_epoch
print(f"iters/epoch={ipe} total={total} lr={lr:.5f}", flush=True)
data_iter = iter(loader)
size, it, t_start, closed = exp.input_size, 0, time.time(), False
while it < total:
    ep = it // ipe
    if not closed and ep >= exp.max_epoch - exp.no_aug_epochs:
        loader.close_mosaic()
        closed = True
    inps, targets, _, _ = next(data_iter)
    if exp.multiscale_range and it % 10 == 0:
        size = exp.random_resize(loader, ep, 0, False)
    inps, targets = exp.preprocess(inps.float(), targets.float(), size)
    t0 = time.time()
    outs = model(inps, targets)
    loss = outs["total_loss"]
    opt.zero_grad()
    loss.backward()
    opt.step()
    ema.update(model)
    cur_lr = sched.update_lr(it + 1)
    for g in opt.param_groups:
        g["lr"] = cur_lr
    it += 1
    rec = dict(iter=it, epoch=ep, size=size[0], total_loss=float(loss), iou=float(outs["iou_loss"]),
               conf=float(outs["conf_loss"]), cls=float(outs["cls_loss"]), num_fg=float(outs["num_fg"]),
               lr=cur_lr, sec=round(time.time() - t0, 2))
    log.write(json.dumps(rec) + "\n")
    log.flush()
    print(json.dumps(rec), flush=True)
torch.save({"model": model.state_dict(), "iters": it}, out / "latest_ckpt.pth")
torch.save({"model": ema.ema.state_dict(), "iters": it}, out / "best_ckpt.pth")  # EMA weights
print(f"done {it} iters in {time.time()-t_start:.1f}s", flush=True)
