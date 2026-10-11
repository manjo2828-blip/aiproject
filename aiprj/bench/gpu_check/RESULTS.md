# MX450 GPU vs CPU: YOLOX-m / RT-DETR-R18vd (ONNX Runtime)

## Environment
- Laptop i7-1165G7 (4C/8T), NVIDIA MX450 2 GB (driver 561.17, CUDA 12.6 runtime ceiling), Iris Xe iGPU (not tested)
- Power: AC connected (battery 99%, charging state 2), power plan 'Samsung Mode' (OEM)
- venv: %TEMP%/ort_gpu_venv (py3.12), **onnxruntime-gpu 1.22.0** (CUDA 12 build), numpy 2.2, pip nvidia-cudnn-cu12 9.27 + cublas/cudart 12.9 DLLs; provider = **CUDAExecutionProvider** (no DirectML fallback needed)
- Note: onnxruntime-gpu 1.31 (latest) needs CUDA 13 which driver 561 cannot run; 1.22 works. The nvidia/*/bin dirs must be added via os.add_dll_directory + PATH (_env.py); preload_dlls alone left cuDNN sub-libs unloadable.
- run_eval was finished (no process, eval_results.json present) before timed runs. Project .venv untouched. Input 640x640, 1 image per run, batch 1.

## yolox_m - street [1080, 810, 3]

| config | session load s | first detect ms | run() median / p90 / min ms | e2e detect median ms | speedup (run) vs CPU4 | GPU mem MiB |
|---|---|---|---|---|---|---|
| cpu4 | 0.24 | 430 | 459 / 504 / 400 | 449 | 1.0x |  |
| cpu8 | 0.38 | 742 | 547 / 668 / 469 | 490 | 0.8x |  |
| gpu | 1.41 | 435 | 121 / 121 / 119 | 132 | 3.8x | 327 |

## yolox_m - perth_mall [1066, 1600, 3]

| config | session load s | first detect ms | run() median / p90 / min ms | e2e detect median ms | speedup (run) vs CPU4 | GPU mem MiB |
|---|---|---|---|---|---|---|
| cpu4 | 0.24 | n/a (warm) | 514 / 554 / 430 | 490 | 1.0x |  |
| cpu8 | 0.38 | n/a (warm) | 464 / 521 / 410 | 629 | 1.1x |  |
| gpu | 1.41 | n/a (warm) | 122 / 124 / 120 | 137 | 4.2x | 327 |

Correctness yolox_m (CPU4 vs GPU): street: all dets 5/5, persons@0.25 4/4, max box diff 6.1e-05 px, max score diff 1.8e-07; perth_mall: all dets 28/28, persons@0.25 24/24, max box diff 1.8e-04 px, max score diff 8.0e-07

## rtdetr_r18 - street [1080, 810, 3]

| config | session load s | first detect ms | run() median / p90 / min ms | e2e detect median ms | speedup (run) vs CPU4 | GPU mem MiB |
|---|---|---|---|---|---|---|
| cpu4 | 0.56 | 453 | 460 / 520 / 403 | 424 | 1.0x |  |
| gpu | 1.77 | 1086 | 102 / 102 / 99 | 108 | 4.5x | 327 |

## rtdetr_r18 - perth_mall [1066, 1600, 3]

| config | session load s | first detect ms | run() median / p90 / min ms | e2e detect median ms | speedup (run) vs CPU4 | GPU mem MiB |
|---|---|---|---|---|---|---|
| cpu4 | 0.56 | n/a (warm) | 492 / 660 / 413 | 493 | 1.0x |  |
| gpu | 1.77 | n/a (warm) | 103 / 104 / 102 | 109 | 4.8x | 327 |

Correctness rtdetr_r18 (CPU4 vs GPU): street: all dets 8/8, persons@0.25 4/4, max box diff 1.2e-04 px, max score diff 3.6e-06; perth_mall: all dets 41/41, persons@0.25 28/28, max box diff 3.7e-04 px, max score diff 2.7e-06

## io-binding (YOLOX-m, GPU, random input)
run(numpy)=122 ms, iobinding GPU input + output copy=122 ms, no output copy=122 ms -> no gain; GPU-compute bound.

## Notes
- 'first detect' = first detect() on the street image in a fresh process (includes cuDNN exhaustive conv algo search + kernel warmup).
- GPU mem is nvidia-smi total used during steady runs (baseline 0 MiB before), 2 GB card.
- CPU 8-thread numbers are noisy (first run: run median 557 ms, e2e 876 ms; rerun: 547/490 ms); 8 threads on 4 physical cores is no better than 4 and is unstable, probably thermal/SMT contention. Both runs stored (yolox_m_cpu8_run1.json is the first). Results.json holds the rerun.
- RT-DETR on CUDA EP ran fully with no errors; CPU-fallback of individual nodes was not inspected.
- Not tested: DirectML, Iris Xe, FP16.