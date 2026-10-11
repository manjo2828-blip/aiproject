import sys, os, time, statistics, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__)); os.chdir(ROOT)
import _env; _env.setup()
import numpy as np, onnxruntime as ort
s = ort.InferenceSession("bench/weights/yolox_m.onnx", providers=["CUDAExecutionProvider"])
x = (np.random.rand(1, 3, 640, 640) * 255).astype(np.float32)
name = s.get_inputs()[0].name; oname = s.get_outputs()[0].name
def med(f, n=50, w=5):
    for _ in range(w): f()
    t = []
    for _ in range(n):
        a = time.perf_counter(); f(); t.append((time.perf_counter() - a) * 1000)
    return statistics.median(t)
plain = med(lambda: s.run(None, {name: x}))
xg = ort.OrtValue.ortvalue_from_numpy(x, "cuda", 0)
b = s.io_binding(); b.bind_ortvalue_input(name, xg); b.bind_output(oname, "cuda", 0)
def f(): s.run_with_iobinding(b); b.copy_outputs_to_cpu()
gpu_in = med(f)
def g(): s.run_with_iobinding(b)
nocopy = med(g)
r = {"run_numpy_ms": plain, "iobinding_gpu_input_with_output_copy_ms": gpu_in, "iobinding_no_output_copy_ms": nocopy}
print(r); json.dump(r, open("bench/gpu_check/iobind.json", "w"))
