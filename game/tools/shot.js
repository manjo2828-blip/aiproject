// 자동 캡처/테스트 도구.
// 사용: node tools/shot.js "<쿼리>" <출력경로.png> [옵션]
//   예) node tools/shot.js "scene=PKScene&char=jun" shots/pk.png --wait 1500
//   --wait <ms>            로드 후 대기 (기본 1500)
//   --keys "Space@500,ArrowLeft@900"   키 입력 스케줄 (키@ms, 쉼표 구분)
//   --click "640,360@800"  좌표 클릭 스케줄 (게임 좌표 1280x720 기준, 쉼표 대신 ; 로 구분: "100,200@500;300,400@900")
//   --multi "t1:a.png,t2:b.png"   한 세션에서 여러 시점(ms) 캡처 (첫 번째 인자 경로는 무시되지 않고 마지막에도 저장)
//   --eval "<js>@ms"       페이지에서 JS 실행 (window.__game 사용 가능)
// 서버가 없으면 자동 기동(포트 8123). 콘솔 에러/pageerror 는 stdout 에 출력되고, 있으면 종료코드 1.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http'), path = require('path'), fs = require('fs');

const args = process.argv.slice(2);
const query = args[0] || '', out = args[1] || 'shots/shot.png';
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const wait = +opt('wait', 1500), PORT = +opt('port', 8123);

const ping = () => new Promise((r) => http.get({ port: PORT, path: '/' }, (res) => { res.resume(); r(true); }).on('error', () => r(false)));

(async () => {
  let server = null;
  if (!(await ping())) {
    server = spawn('node', [path.join(__dirname, '..', 'serve.js'), String(PORT)], { stdio: 'ignore' });
    for (let i = 0; i < 30 && !(await ping()); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); else if (process.env.VERBOSE) console.log('log:', m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${PORT}/index.html?${query}`);
  const t0 = Date.now();
  const sched = [];
  const keys = opt('keys', ''); if (keys) keys.split(',').forEach((k) => { const [key, ms] = k.split('@'); sched.push({ at: +ms, run: () => page.keyboard.press(key) }); });
  const clicks = opt('click', ''); if (clicks) clicks.split(';').forEach((c) => { const [xy, ms] = c.split('@'); const [x, y] = xy.split(',').map(Number); sched.push({ at: +ms, run: () => page.mouse.click(x, y) }); });
  const evals = opt('eval', ''); if (evals) evals.split(';;').forEach((c) => { const i = c.lastIndexOf('@'); sched.push({ at: +c.slice(i + 1), run: () => page.evaluate(c.slice(0, i)).then((v) => v !== undefined && console.log('eval:', JSON.stringify(v))) }); });
  const multi = opt('multi', ''); if (multi) multi.split(',').forEach((m) => { const [ms, f] = m.split(':'); sched.push({ at: +ms, run: async () => { fs.mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f }); console.log('saved', f); } }); });
  sched.sort((a, b) => a.at - b.at);
  for (const s of sched) { const d = s.at - (Date.now() - t0); if (d > 0) await page.waitForTimeout(d); await s.run(); }
  const d = wait - (Date.now() - t0); if (d > 0) await page.waitForTimeout(d);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log('saved', out);
  await browser.close(); if (server) server.kill();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
})();
