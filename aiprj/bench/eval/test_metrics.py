import numpy as np

from bench.eval import metrics as M


def img(gt, ignore=None, regions=(), vis=None):
    gt = np.array(gt, float).reshape(-1, 4)
    return dict(gt=gt, ignore=ignore if ignore is not None else [False] * len(gt),
                regions=list(regions), vis=vis if vis is not None else [np.nan] * len(gt))


def test_matching_greedy_and_dup():
    d = np.array([[0, 0, 10, 20], [0, 0, 10, 20]], float)
    s, m = M.match_image([[0, 0, 10, 20]], [False], [], d, [0.9, 0.8], 0.5)
    assert list(s) == [1, 0] and m[0] == 0.9


def test_matching_best_iou_and_thr():
    gt = [[0, 0, 10, 10], [5, 0, 15, 10]]
    s, m = M.match_image(gt, [False, False], [], np.array([[5, 0, 15, 10]], float), [0.9], 0.5)
    assert s[0] == 1 and m[0] == -1 and m[1] == 0.9
    s, _ = M.match_image(gt, [False, False], [], np.array([[0, 0, 10, 4]], float), [0.9], 0.5)
    assert s[0] == 0


def test_ignore_handling():
    gt = [[0, 0, 10, 10], [50, 50, 60, 60]]
    d = np.array([[50, 50, 60, 60], [100, 100, 110, 110], [200, 200, 210, 210]], float)
    s, _ = M.match_image(gt, [False, True], [[100, 100, 120, 120]], d, [0.9, 0.8, 0.7], 0.5)
    assert list(s) == [-1, -1, 0]


def test_perfect_ap():
    ims = [img([[0, 0, 10, 20], [30, 30, 50, 60]]), img([[5, 5, 25, 45]])]
    dets = [[[0, 0, 10, 20, .9], [30, 30, 50, 60, .8]], [[5, 5, 25, 45, .7]]]
    ev = M.Evaluator(ims, dets)
    assert abs(ev.ap50() - 1) < 1e-9
    pm = M.point_metrics(ev)
    assert abs(pm["ap"] - 1) < 1e-2 and pm["ar100"] == 1.0
    assert pm["mr2"] < 1e-6
    assert ev.recall_fppi(0.5) == 1.0


def test_recall_at_fppi():
    ims = [img([[0, 0, 10, 20]]), img([[0, 0, 10, 20]])]
    dets = [[[100, 100, 110, 120, .9], [0, 0, 10, 20, .5]], [[0, 0, 10, 20, .4]]]
    ev = M.Evaluator(ims, dets)
    assert ev.recall_fppi(0.25) == 0.0   # first FP (fppi .5) precedes any TP
    assert ev.recall_fppi(0.5) == 1.0
    assert ev.recall_fppi(1.0) == 1.0
    assert ev.recall_at(0.45) == 0.5
    tp, fp, fn, ngt, n = ev.counts_at(0.45)
    assert (tp, fp, fn) == (1, 1, 1)


def test_mr2_monotone():
    ims = [img([[0, 0, 10, 20]]) for _ in range(20)]
    good = [[[0, 0, 10, 20, .9]] for _ in range(20)]
    bad = [[[100, 100, 110, 120, .95], [0, 0, 10, 20, .9]] for _ in range(20)]
    worse = [[[100, 100, 110, 120, .95]] for _ in range(20)]
    m = [M.point_metrics(M.Evaluator(ims, d))["mr2"] for d in (good, bad, worse)]
    assert m[0] < m[1] <= m[2] and m[2] > 0.99


def test_bootstrap_deterministic_and_paired():
    ims = [img([[0, 0, 10, 20]]) for _ in range(30)]
    dets = [[[0, 0, 10, 20, .9]] if i % 3 else [] for i in range(30)]
    ev = M.Evaluator(ims, dets)
    W1, W2 = ev.bootstrap_weights(200, 0), ev.bootstrap_weights(200, 0)
    assert (W1 == W2).all() and (W1.sum(1) == 30).all()
    b1, b2 = M.boot_metrics(ev, W1), M.boot_metrics(ev, W2)
    assert (b1["recall25"] == b2["recall25"]).all()
    lo, hi = M.ci(b1["recall25"])
    assert lo <= ev.recall_at(0.25) <= hi
    pd = M.paired_diff(b1["recall25"], b1["recall25"] - 0.2)
    assert pd["significant"] and abs(pd["mean"] - 0.2) < 1e-9


def test_buckets_and_per_image():
    ims = [img([[0, 0, 10, 20], [30, 0, 60, 100]], vis=[0.3, 0.9])]
    ev = M.Evaluator(ims, [[[30, 0, 60, 100, .8]]])
    b = M.bucket_recall(ev, 0.25)
    assert b["h<32"]["recall"] == 0 and b["h>=96"]["recall"] == 1 and b["vis>0.8"]["n"] == 1
    s = M.per_image_stats(ev)[0]
    assert (s["tp"], s["fn"], s["fp"]) == (1, 1, 0)
