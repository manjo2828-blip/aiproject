"""Real-browser E2E (Edge via Playwright). Skips if server is down."""
import os
import re
import socket
import tempfile
from urllib.parse import urlparse
from pathlib import Path

import pytest

BASE = os.environ.get("E2E_BASE", "http://localhost:8000")
ROOT = Path(__file__).resolve().parents[2]
SAMPLES = ROOT / "app/static/img/samples"
SHOTS = Path(os.environ.get("E2E_SHOTS") or (Path(tempfile.gettempdir()) / "aiprj_e2e"))
SHOTS.mkdir(parents=True, exist_ok=True)


def _up():
    try:
        socket.create_connection((urlparse(BASE).hostname, urlparse(BASE).port or 80), 1).close()
        return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(not _up(), reason="server not reachable")
sync_api = pytest.importorskip("playwright.sync_api")

# missing optional sample images / favicon / Google Fonts are not counted as problems
EXPECTED = re.compile(r"/samples/|favicon|fonts\.(googleapis|gstatic)")


@pytest.fixture(scope="session")
def browser():
    with sync_api.sync_playwright() as p:
        b = None
        for ch in ("msedge", "chrome", None):
            try:
                b = p.chromium.launch(channel=ch, headless=True) if ch else p.chromium.launch(headless=True)
                break
            except Exception:
                continue
        assert b, "no browser available"
        yield b
        b.close()


class Page:
    def __init__(self, browser, w=1280, h=800):
        self.ctx = browser.new_context(viewport={"width": w, "height": h})
        self.page = self.ctx.new_page()
        self.problems = []
        pg = self.page

        def on_console(m):
            if m.type == "error" and not EXPECTED.search(m.location.get("url", "") + m.text):
                self.problems.append("console: " + m.text)

        pg.on("console", on_console)
        pg.on("pageerror", lambda e: self.problems.append("pageerror: %s" % e))
        pg.on("requestfailed", lambda r: (not EXPECTED.search(r.url)) and self.problems.append("reqfailed: " + r.url))
        pg.on("response", lambda r: (r.status >= 400 and not EXPECTED.search(r.url))
              and self.problems.append("http %s %s" % (r.status, r.url)))

    def goto(self, path):
        self.page.goto(BASE + path, wait_until="networkidle")
        return self.page

    def shot(self, name):
        self.page.wait_for_timeout(900)
        self.page.screenshot(path=str(SHOTS / (name + ".png")), full_page=True)


@pytest.fixture
def pw(browser):
    h = Page(browser)
    yield h
    h.ctx.close()


@pytest.fixture
def mobile(browser):
    h = Page(browser, 390, 844)
    yield h
    h.ctx.close()


def canvas_nonblank(page, sel):
    return page.evaluate("""s => { const c=document.querySelector(s); if(!c||!c.width) return -1;
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0;
      for(let i=0;i<d.length;i+=28){ if(d[i+3]>0) n++; } return n; }""", sel)


def canvas_colors(page, sel):
    return page.evaluate("""s => { const c=document.querySelector(s);
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const set=new Set(); for(let i=0;i<d.length;i+=20){ set.add((d[i]>>5)+','+(d[i+1]>>5)+','+(d[i+2]>>5)); }
      return set.size; }""", sel)


def no_hscroll(page):
    return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")


PAGES = ["/", "/classify", "/detect", "/pose", "/face", "/emotion"]


@pytest.mark.parametrize("path", PAGES)
def test_page_loads_clean_and_nav(pw, path):
    pg = pw.goto(path)
    assert pg.locator("header").count() >= 1
    assert pg.title()
    assert no_hscroll(pg)
    pw.shot("empty_" + (path.strip("/") or "home"))
    assert pw.problems == []
    if path != "/":
        pg.click("header a[href='/']")
        pg.wait_for_url(BASE + "/")
    for p in PAGES[1:]:
        pg.goto(BASE + "/")
        pg.click("header a[href='%s']" % p)
        pg.wait_for_url("**" + p)


def test_home_badges(pw):
    pg = pw.goto("/")
    pg.wait_for_selector("[data-badge]:not([hidden])", timeout=8000)
    texts = pg.locator("[data-badge]:not([hidden])").all_inner_texts()
    assert len(texts) == 5 and all(t.strip() for t in texts), texts
    pg.click("#quote-more")
    pw.shot("result_home")


def test_home_mobile(mobile):
    pg = mobile.goto("/")
    assert no_hscroll(pg)
    mobile.shot("mobile_home")
    assert mobile.problems == []


def test_classify_sample(pw):
    pg = pw.goto("/classify")
    pg.locator(".sample-chip", has_text="강아지").click(timeout=5000)
    pg.wait_for_selector("#result:not([hidden])", timeout=60000)
    txt = pg.inner_text("#result")
    assert re.search(r"Samoyed|사모예드", txt, re.I), txt
    assert pg.locator("#bars .bar-row, #bars li").count() >= 5
    pg.click("#fb-yes")
    pg.wait_for_selector(".toast")
    pw.shot("result_classify")
    assert pw.problems == []


def test_classify_mobile(mobile):
    pg = mobile.goto("/classify")
    pg.set_input_files("#picker input[type=file]", str(SAMPLES / "dog.jpg"))
    pg.wait_for_selector("#result:not([hidden])", timeout=60000)
    assert no_hscroll(pg)
    mobile.shot("mobile_classify_result")


def test_error_txt_upload(pw):
    pg = pw.goto("/classify")
    pg.set_input_files("#picker input[type=file]",
                       files=[{"name": "a.txt", "mimeType": "text/plain", "buffer": b"hello"}])
    pg.wait_for_selector(".toast-error", timeout=8000)
    pw.shot("error_toast")


def test_error_bad_jpeg_server_side(pw):
    pg = pw.goto("/classify")
    pg.set_input_files("#picker input[type=file]",
                       files=[{"name": "a.jpg", "mimeType": "image/jpeg", "buffer": b"not an image"}])
    pg.wait_for_selector(".toast-error", timeout=15000)
    assert pg.locator(".toast-error").first.inner_text().strip()


def test_detect(pw):
    pg = pw.goto("/detect")
    pg.set_input_files("#picker input[type=file]", str(SAMPLES / "street.jpg"))
    pg.wait_for_selector("#result-card:not([hidden])", timeout=60000)
    pg.wait_for_selector("#chips > *", timeout=60000)
    assert canvas_nonblank(pg, "#cv") > 100
    assert canvas_colors(pg, "#cv") > 20
    reqs = []
    pg.on("request", lambda r: "/api/detect" in r.url and reqs.append(r))
    pg.evaluate("""() => { const s=document.getElementById('conf'); s.value=0.15;
        s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); }""")
    pg.wait_for_timeout(3000)
    assert reqs, "slider did not re-call /api/detect"
    assert pg.inner_text("#conf-out").strip().startswith("0.15")
    pg.locator("#chips > *").first.click()
    pw.shot("result_detect")
    assert pw.problems == []


def test_pose(pw):
    pg = pw.goto("/pose")
    pg.set_input_files("#picker input[type=file]", str(SAMPLES / "dance.jpg"))
    pg.wait_for_selector("#result-card:not([hidden])", timeout=60000)
    pg.wait_for_function("document.getElementById('count').textContent.trim().length>0", timeout=60000)
    assert canvas_nonblank(pg, "#cv") > 100
    assert canvas_colors(pg, "#cv") > 20
    assert pg.inner_text("#guess").strip()
    pw.shot("result_pose")
    assert pw.problems == []


def test_face_detect_and_compare(pw):
    pg = pw.goto("/face")
    pg.set_input_files("#picker-detect input[type=file]", str(SAMPLES / "face_a.jpg"))
    pg.wait_for_selector("#detect-result:not([hidden])", timeout=60000)
    pg.wait_for_function("document.getElementById('detect-comment').textContent.trim().length>0", timeout=60000)
    assert canvas_nonblank(pg, "#detect-canvas") > 100
    pw.shot("result_face_detect")
    pg.click("#tab-compare")
    assert pg.locator("#panel-compare").is_visible()

    def compare(a, b):
        pg.set_input_files("#picker-a input[type=file]", str(SAMPLES / a))
        pg.set_input_files("#picker-b input[type=file]", str(SAMPLES / b))
        pg.wait_for_function("!document.getElementById('compare-btn').disabled")
        pg.click("#compare-btn")
        pg.wait_for_selector("#compare-result:not([hidden])", timeout=60000)
        pg.wait_for_timeout(3500)  # count-up
        return float(re.search(r"[\d.]+", pg.inner_text("#cmp-gauge .gauge-num")).group())

    same = compare("face_a.jpg", "face_a.jpg")
    pw.shot("result_face_compare_same")
    diff = compare("face_a.jpg", "face_b.jpg")
    pw.shot("result_face_compare_diff")
    assert same >= 85, same
    assert diff < same, (same, diff)
    assert pw.problems == []


def test_emotion(pw):
    pg = pw.goto("/emotion")
    assert not pg.locator("#emo-btn").is_disabled()  # stays usable; empty click gives a toast
    ta = pg.locator("#emo-text")
    ta.press("Control+Enter")  # empty submit
    pg.wait_for_selector(".toast", timeout=3000)
    assert "문장을 먼저" in pg.inner_text(".toast")
    assert pg.locator("#emo-result").is_hidden()
    pw.shot("emotion_empty_submit")
    ta.fill("오늘 로또 맞았어!! 정말 행복해요")
    assert "/ 500" in pg.inner_text("#emo-counter")
    pg.click("#emo-btn")
    pg.wait_for_selector("#emo-result:not([hidden])", timeout=60000)
    pg.wait_for_function("document.querySelectorAll('#emo-bars > *').length>0", timeout=60000)
    assert pg.inner_text("#emo-emoji").strip()
    pw.shot("result_emotion")
    ta.fill("시험 망쳐서 너무 우울해...")
    n = []
    pg.on("request", lambda r: "/api/emotion" in r.url and n.append(1))
    ta.press("Control+Enter")
    pg.wait_for_timeout(3000)
    assert n, "Ctrl+Enter did not submit"
    pg.locator("#emo-samples .chip").first.click()
    pg.wait_for_timeout(2500)
    assert pw.problems == []


def test_emotion_api_empty_friendly(pw):
    pg = pw.goto("/emotion")
    r = pg.request.post(BASE + "/api/emotion", data={"text": "  "})
    assert r.status == 422 and r.json()["error"]["message"]


def test_emotion_mobile(mobile):
    pg = mobile.goto("/emotion")
    pg.fill("#emo-text", "무서워서 잠이 안 와요")
    pg.click("#emo-btn")
    pg.wait_for_function("document.querySelectorAll('#emo-bars > *').length>0", timeout=60000)
    assert no_hscroll(pg)
    mobile.shot("mobile_emotion_result")
