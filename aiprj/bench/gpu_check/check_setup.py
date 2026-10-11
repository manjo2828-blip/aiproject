import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import _env; _env.setup()
import onnxruntime as ort
print(ort.__version__, ort.get_available_providers())
import numpy as np
s = ort.InferenceSession("bench/weights/yolox_m.onnx", providers=["CUDAExecutionProvider"])
print(s.get_providers())
x = np.random.rand(1,3,640,640).astype(np.float32)*255
print(s.run(None,{s.get_inputs()[0].name:x})[0].shape)
