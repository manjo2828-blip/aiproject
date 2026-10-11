import json, sys, numpy as np
model = sys.argv[1]; d = "bench/gpu_check/"
cpu = json.load(open(d + f"{model}_cpu4.json")); gpu = json.load(open(d + f"{model}_gpu.json"))
out = {}
for im in cpu["images"]:
    a, b = cpu["images"][im]["dets"], gpu["images"][im]["dets"]
    o = {"n_all_cpu": len(a), "n_all_gpu": len(b), "person_cpu": cpu["images"][im]["n_person_025"], "person_gpu": gpu["images"][im]["n_person_025"]}
    if len(a) == len(b) and a:
        # match greedily by class + nearest box
        diffs, used = [], set()
        for x in a:
            best = min((j for j in range(len(b)) if j not in used and b[j]["cls"] == x["cls"]),
                       key=lambda j: np.abs(np.array(b[j]["bbox"]) - x["bbox"]).max(), default=None)
            if best is None: diffs.append(float("inf")); continue
            used.add(best); diffs.append(float(np.abs(np.array(b[best]["bbox"]) - x["bbox"]).max()))
        o["max_abs_box_diff_px"] = max(diffs)
        o["max_score_diff"] = max(abs(x["score"] - y["score"]) for x, y in zip(a, b))
    out[im] = o
print(json.dumps(out, indent=1)); json.dump(out, open(d + f"{model}_correctness.json", "w"), indent=1)
