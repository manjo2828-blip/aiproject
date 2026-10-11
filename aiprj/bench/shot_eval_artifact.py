import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
src = Path("bench/eval/out/artifact.html").resolve().as_uri()
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    errs = []
    for name, vp, scheme in [("desk", {"width": 1280, "height": 900}, "light"), ("mob", {"width": 390, "height": 844}, "dark")]:
        pg = b.new_page(viewport=vp, color_scheme=scheme)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.goto(src); pg.wait_for_timeout(1800)
        pg.screenshot(path=str(out / f"ev_{name}.png"), full_page=True)
        print(name, "overflowX", pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth"))
    print("errors:", [e for e in errs if "fonts" not in e][:5])
    b.close()
