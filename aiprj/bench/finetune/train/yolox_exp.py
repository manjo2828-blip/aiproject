"""YOLOX-m single-class (person) experiment for crowd recall. Settings come from the JSON file
named by env FT_YOLOX_CFG (written by run_train.py). Used by upstream tools/train.py (-f this file),
by yolox_cpu_train.py and by export_onnx.py.
"""
import json
import os

from yolox.exp import Exp as MyExp


class Exp(MyExp):
    # Upstream hard-codes max_labels=50/120 which truncates crowded mosaics (4 images x up to ~100 people).
    MAX_LABELS = 600

    def __init__(self):
        super().__init__()
        with open(os.environ["FT_YOLOX_CFG"], encoding="utf-8") as f:
            c = json.load(f)
        self.cfg = c
        S = c["imgsz"]
        self.num_classes = 1
        self.depth, self.width = 0.67, 0.75                 # yolox_m
        self.exp_name = "train"
        self.output_dir = c["output_dir"]
        self.seed = c.get("seed")
        # data (staged json with absolute file_names; see ft_common.stage_split)
        self.data_dir = c["data_dir"]
        self.train_ann, self.val_ann = "train.json", "val.json"
        self.data_num_workers = c["workers"]
        # size / multi-scale: imgsz +- 5*32 px (800 -> 640..960)
        self.input_size = (S, S)
        self.test_size = (S, S)
        self.multiscale_range = c.get("multiscale_range", 5)
        # augmentation (moderate mosaic/mixup, strong scale jitter, upright people -> small rotation)
        self.mosaic_prob = 1.0
        self.enable_mixup = True
        self.mixup_prob = 0.5
        self.mosaic_scale = (0.3, 2.0)
        self.mixup_scale = (0.5, 1.5)
        self.degrees, self.shear, self.translate = 3.0, 1.0, 0.1
        self.flip_prob, self.hsv_prob = 0.5, 1.0
        # schedule
        E = c["epochs"]
        self.max_epoch = E
        self.warmup_epochs = c.get("warmup_epochs", 1)
        self.no_aug_epochs = c.get("no_aug_epochs", min(2, max(1, E // 6)))
        self.basic_lr_per_img = 0.01 / 64.0                 # lr = this * batch (linear scaling)
        self.min_lr_ratio = 0.05
        self.ema = True
        self.eval_interval = c.get("eval_interval", 3)
        self.print_interval = c.get("print_interval", 10)
        self.save_history_ckpt = False
        # eval: low conf so recall-vs-FPPI curves are not truncated
        self.test_conf = 0.01
        self.nmsthre = 0.65

    def get_dataset(self, cache=False, cache_type="ram"):
        from yolox.data import COCODataset, TrainTransform
        return COCODataset(data_dir=self.data_dir, json_file=self.train_ann, img_size=self.input_size,
                           preproc=TrainTransform(max_labels=self.MAX_LABELS, flip_prob=self.flip_prob,
                                                  hsv_prob=self.hsv_prob), cache=cache, cache_type=cache_type)

    def get_data_loader(self, batch_size, is_distributed, no_aug=False, cache_img=None):
        from yolox.data import (DataLoader, InfiniteSampler, MosaicDetection, TrainTransform,
                                YoloBatchSampler, worker_init_reset_seed)
        from yolox.utils import wait_for_the_master
        if self.dataset is None:
            with wait_for_the_master():
                self.dataset = self.get_dataset(cache=False, cache_type=cache_img)
        self.dataset = MosaicDetection(
            dataset=self.dataset, mosaic=not no_aug, img_size=self.input_size,
            preproc=TrainTransform(max_labels=self.MAX_LABELS, flip_prob=self.flip_prob, hsv_prob=self.hsv_prob),
            degrees=self.degrees, translate=self.translate, mosaic_scale=self.mosaic_scale,
            mixup_scale=self.mixup_scale, shear=self.shear, enable_mixup=self.enable_mixup,
            mosaic_prob=self.mosaic_prob, mixup_prob=self.mixup_prob)
        sampler = InfiniteSampler(len(self.dataset), seed=self.seed if self.seed else 0)
        batch_sampler = YoloBatchSampler(sampler=sampler, batch_size=batch_size, drop_last=False,
                                         mosaic=not no_aug)
        kw = dict(num_workers=self.data_num_workers, pin_memory=self.cfg["device"] == "cuda",
                  batch_sampler=batch_sampler)
        if self.data_num_workers > 0:
            kw["worker_init_fn"] = worker_init_reset_seed
        return DataLoader(self.dataset, **kw)

    def random_resize(self, data_loader, epoch, rank, is_distributed):
        # CPU-safe version of upstream (which allocates a cuda tensor)
        import random
        if not hasattr(self, "random_size"):
            m = int(self.input_size[0] / 32)
            self.random_size = (m - self.multiscale_range, m + self.multiscale_range)
        s = random.randint(*self.random_size) * 32
        if is_distributed:
            import torch
            import torch.distributed as dist
            t = torch.LongTensor([s]).cuda()
            dist.broadcast(t, 0)
            s = int(t.item())
        return (s, s)
