import json
d = "bench/gpu_check/"; L = lambda n: json.load(open(d + n + ".json"))
allr = {}
md = ["# MX450 GPU vs CPU: YOLOX-m / RT-DETR-R18vd (ONNX Runtime)\n",
"## Environment\n- Laptop i7-1165G7 (4C/8T), NVIDIA MX450 2 GB (driver 561.17, CUDA 12.6 runtime ceiling), Iris Xe iGPU (not tested)",
"- Power: AC connected (battery 99%, charging state 2), power plan 'Samsung Mode' (OEM)",
"- venv: %TEMP%/ort_gpu_venv (py3.12), **onnxruntime-gpu 1.22.0** (CUDA 12 build), numpy 2.2, pip nvidia-cudnn-cu12 9.27 + cublas/cudart 12.9 DLLs; provider = **CUDAExecutionProvider** (no DirectML fallback needed)",
"- Note: onnxruntime-gpu 1.31 (latest) needs CUDA 13 which driver 561 cannot run; 1.22 works. The nvidia/*/bin dirs must be added via os.add_dll_directory + PATH (_env.py); preload_dlls alone left cuDNN sub-libs unloadable.",
"- run_eval was finished (no process, eval_results.json present) before timed runs. Project .venv untouched. Input 640x640, 1 image per run, batch 1.\n"]
for model in ("yolox_m", "rtdetr_r18"):
    R = {m: L(f"{model}_{m}") for m in ("cpu4", "cpu8", "gpu")} if model == "yolox_m" else {m: L(f"{model}_{m}") for m in ("cpu4", "gpu")}
    allr[model] = R
    for im in ("street", "perth_mall"):
        md.append(f"## {model} - {im} {R['gpu']['images'][im]['shape']}\n")
        md.append("| config | session load s | first detect ms | run() median / p90 / min ms | e2e detect median ms | speedup (run) vs CPU4 | GPU mem MiB |\n|---|---|---|---|---|---|---|")
        base = R["cpu4"]["images"][im]["run_ms"]["median"]
        for m, r in R.items():
            i = r["images"][im]
            first = i["first_detect_s"] * 1000 if im == "street" else None
            md.append(f"| {m} | {r['session_create_s']:.2f} | {('%.0f' % first) if first else 'n/a (warm)'} | {i['run_ms']['median']:.0f} / {i['run_ms']['p90']:.0f} / {i['run_ms']['min']:.0f} | {i['e2e_ms']['median']:.0f} | {base / i['run_ms']['median']:.1f}x | {i.get('gpu_mem_peak_mib', '')} |")
        md.append("")
    c = json.load(open(d + f"{model}_correctness.json")) if True else None
    md.append(f"Correctness {model} (CPU4 vs GPU): " + "; ".join(f"{k}: all dets {v['n_all_cpu']}/{v['n_all_gpu']}, persons@0.25 {v['person_cpu']}/{v['person_gpu']}, max box diff {v.get('max_abs_box_diff_px'):.1e} px, max score diff {v.get('max_score_diff'):.1e}" for k, v in c.items()) + "\n")
io = L("iobind")
md.append(f"## io-binding (YOLOX-m, GPU, random input)\nrun(numpy)={io['run_numpy_ms']:.0f} ms, iobinding GPU input + output copy={io['iobinding_gpu_input_with_output_copy_ms']:.0f} ms, no output copy={io['iobinding_no_output_copy_ms']:.0f} ms -> no gain; GPU-compute bound.\n")
md.append("## Notes\n- 'first detect' = first detect() on the street image in a fresh process (includes cuDNN exhaustive conv algo search + kernel warmup).\n- GPU mem is nvidia-smi total used during steady runs (baseline 0 MiB before), 2 GB card.\n- CPU 8-thread numbers are noisy (first run: run median 557 ms, e2e 876 ms; rerun: 547/490 ms); 8 threads on 4 physical cores is no better than 4 and is unstable, probably thermal/SMT contention. Both runs stored (yolox_m_cpu8_run1.json is the first). Results.json holds the rerun.\n- RT-DETR on CUDA EP ran fully with no errors; CPU-fallback of individual nodes was not inspected.\n- Not tested: DirectML, Iris Xe, FP16.")
open(d + "RESULTS.md", "w").write("\n".join(md))
json.dump(allr, open(d + "results.json", "w"))
