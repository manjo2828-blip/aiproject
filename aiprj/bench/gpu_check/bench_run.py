"""usage: python -I bench_run.py <model: yolox_m|rtdetr_r18> <mode: cpu4|cpu8|gpu> <out.json>"""
import sys, os, json, time, subprocess, threading, statistics, importlib
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT); sys.path.insert(0, os.path.dirname(__file__))
os.chdir(ROOT)
import _env; _env.setup()
import numpy as np, cv2, onnxruntime as ort
model, mode, outp = sys.argv[1:4]
_orig = ort.InferenceSession
CREATE = {}
def patched(path, so=None, providers=None, **kw):
    so = so or ort.SessionOptions()
    if mode.startswith("cpu"):
        so.intra_op_num_threads = int(mode[3:]); prov = ["CPUExecutionProvider"]
    else:
        prov = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    t = time.perf_counter(); s = _orig(path, so, providers=prov, **kw)
    CREATE["load_s"] = time.perf_counter() - t; CREATE["providers"] = s.get_providers()
    return s
ort.InferenceSession = patched
mod = importlib.import_module(f"bench.adapters.{model}")
t = time.perf_counter(); det = mod.load(); load_total = time.perf_counter() - t
sess = det.sess; inp_name = sess.get_inputs()[0].name
def smi():
    r = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True)
    return int(r.stdout.strip())
res = {"model": model, "mode": mode, "ort": ort.__version__, "providers": CREATE["providers"],
       "session_create_s": CREATE["load_s"], "adapter_load_s": load_total, "gpu_mem_before_mib": smi(), "images": {}}
def pct(a, p): a = sorted(a); return a[min(len(a) - 1, int(round(p / 100 * (len(a) - 1))))]
imgs = {"street": "app/static/img/samples/street.jpg", "perth_mall": "bench/images/01_perth_mall.jpg"}
for name, path in imgs.items():
    bgr = cv2.imread(path); r = {"shape": list(bgr.shape)}
    # capture the exact model input via a one-off wrapper on sess.run
    cap = {}
    real_run = sess.run
    class W:  # wrapper to capture feed
        def __getattr__(s, k): return getattr(sess, k)
        def run(s, o, f, *a, **k):
            cap["feed"] = f; return real_run(o, f, *a, **k)
    det.sess = W()
    t = time.perf_counter(); dets0 = det.detect(bgr); r["first_detect_s"] = time.perf_counter() - t  # first call on this process for 1st image includes warmup
    det.sess = sess
    feed = cap["feed"]
    # steady state raw run
    for _ in range(5): sess.run(None, feed)
    mem = []; stop = False
    def poll():
        while not stop:
            try: mem.append(smi())
            except Exception: pass
            time.sleep(0.3)
    if mode == "gpu": th = threading.Thread(target=poll); th.start()
    ts = []
    for _ in range(50):
        t = time.perf_counter(); sess.run(None, feed); ts.append((time.perf_counter() - t) * 1000)
    stop = True
    if mode == "gpu": th.join(); r["gpu_mem_peak_mib"] = max(mem) if mem else None
    r["run_ms"] = {"median": statistics.median(ts), "p90": pct(ts, 90), "min": min(ts), "mean": statistics.mean(ts)}
    e = []
    for _ in range(30):
        t = time.perf_counter(); d = det.detect(bgr); e.append((time.perf_counter() - t) * 1000)
    r["e2e_ms"] = {"median": statistics.median(e), "p90": pct(e, 90), "min": min(e)}
    r["dets"] = [{"cls": x["cls"], "score": x["score"], "bbox": x["bbox"]} for x in d]
    r["n_person_025"] = sum(1 for x in d if x["cls"] == 0 and x["score"] >= 0.25)
    res["images"][name] = r
    print(name, r["run_ms"], r["e2e_ms"], r["n_person_025"], flush=True)
if mode == "gpu": res["gpu_mem_after_mib"] = smi()
json.dump(res, open(outp, "w"))
