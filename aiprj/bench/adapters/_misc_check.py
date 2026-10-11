"""Quick validation: python -m bench.adapters._misc_check <module> ..."""
import glob
import importlib
import sys
import time

import cv2

for mod in sys.argv[1:]:
    try:
        m = importlib.import_module(f"bench.adapters.{mod}")
        d = m.load()
        print(m.NAME, m.FILE_MB, "MB")
        for p in ["app/static/img/samples/street.jpg"] + sorted(glob.glob("bench/images/*.jpg")):
            im = cv2.imread(p)
            d.detect(im)
            t = time.time()
            r = d.detect(im)
            dt = time.time() - t
            print(f"  {p.split('/')[-1]} persons={sum(x['cls'] == 0 for x in r)} total={len(r)} {dt*1000:.0f}ms")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("FAIL", mod, e)
