import { W, H, FONT } from '../../../config/constants.js';
import { Button } from '../../../ui/Button.js';
import { CFG } from './DribbleSim.js';

const CX = W / 2, MAP_T = 232, MAP_B = 440;

export class DribbleHUD {
  constructor(scene, info, cb) {
    this.scene = scene; this.info = info;
    const s = scene, T = (x, y, str, size, color = '#ffffff', st = 5) => s.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#000000', strokeThickness: st }).setOrigin(0.5).setDepth(200);
    this.T = T;
    // 상단 배너
    s.add.rectangle(CX, 36, W, 72, 0x0d2a14, 1).setDepth(150);
    s.add.rectangle(CX, 72, W, 4, 0xffd700, 1).setDepth(151);
    T(CX, 30, '수비수 피하기 드리블 런', 34, '#ffd700');
    this.nameP = T(280, 36, `${info.pName} (나)`, 30, info.pHex);
    this.nameA = T(1000, 36, `${info.aName} (상대)`, 30, info.aHex);
    // 중앙 패널 배경
    s.add.rectangle(CX, 396, 240, 648, 0x14301a, 1).setDepth(149);
    s.add.rectangle(CX - 120, 396, 4, 648, 0xffffff, 0.2).setDepth(150); s.add.rectangle(CX + 120, 396, 4, 648, 0xffffff, 0.2).setDepth(150);
    // 시간
    T(CX, 100, 'TIME', 18, '#9fd8a8', 3);
    this.time = T(CX, 144, '10.0', 70, '#ffffff', 8);
    // 진행 맵
    T(CX, MAP_T - 24, `GOAL ${CFG.D}m`, 20, '#ffd700', 4);
    const g = s.add.graphics().setDepth(200);
    g.fillStyle(0x000000, 0.5).fillRoundedRect(CX - 30, MAP_T - 4, 60, MAP_B - MAP_T + 8, 14);
    g.fillStyle(0x2f9a4a, 1).fillRoundedRect(CX - 24, MAP_T, 48, MAP_B - MAP_T, 10);
    for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0x000000 : 0xffffff, 1).fillRect(CX - 24 + (i % 2) * 8 + Math.floor(i / 2) * 16, MAP_T, 8, 8);
    for (let i = 0; i < 6; i++) g.fillStyle(0xffffff, 0.35).fillRect(CX - 24, MAP_T + 20 + i * 38, 48, 2);
    this.mkP = this.marker(CX - 11, info.pKit, '나'); this.mkA = this.marker(CX + 11, info.aKit, 'AI');
    this.dP = T(CX - 62, MAP_B, '0m', 24, info.pHex, 5).setOrigin(0.5); this.dA = T(CX + 62, MAP_B, '0m', 24, info.aHex, 5).setOrigin(0.5);
    // 속도 미터
    T(CX, 480, 'SPEED', 16, '#9fd8a8', 3);
    this.meter = s.add.graphics().setDepth(200); this.meterTxt = T(CX, 522, '', 20, '#ffffff', 4);
    this.combo = T(CX, 546, '', 18, '#ffe14d', 4);
    // 버튼
    this.bL = this.mkBtn(CX - 62, 596, '◀', 70, 62, 0x2f80ed, cb.left, 34);
    this.bR = this.mkBtn(CX + 62, 596, '▶', 70, 62, 0x2f80ed, cb.right, 34);
    this.bB = this.mkBtn(CX, 670, 'BOOST ▲ 연타!', 222, 74, 0xe53935, cb.boost, 28);
    this.rate = 0;
    this.buildIntro();
  }
  marker(x, color, lab) {
    const s = this.scene, c = s.add.container(x, MAP_B).setDepth(210);
    c.add([s.add.circle(0, 0, 12, color, 1).setStrokeStyle(3, 0xffffff, 1)]);
    return c;
  }
  mkBtn(x, y, label, w, h, color, fn, fs) {
    const b = new Button(this.scene, x, y, label, { w, h, color, fontSize: fs, sound: null }).setDepth(220);
    b.on('pointerdown', () => { fn && fn(); });
    return b;
  }
  setTime(t) { const v = Math.max(0, t); this.time.setText(v.toFixed(1)); this.time.setColor(v <= 3 ? '#ff6666' : '#ffffff'); this.time.setScale(v <= 3 ? 1 + 0.06 * Math.sin(v * 12) : 1); }
  setProgress(p, a) {
    const f = (d) => MAP_B - 4 - (MAP_B - MAP_T - 8) * Math.min(1, d / CFG.D);
    this.mkP.y = f(p); this.mkA.y = f(a);
    this.dP.setText(Math.floor(p) + 'm').y = f(p); this.dA.setText(Math.floor(a) + 'm').y = f(a);
  }
  setSpeed(v, rate) {
    const r = Math.min(1, v / (CFG.BASE + CFG.MAXB)), g = this.meter; g.clear();
    g.fillStyle(0x000000, 0.55).fillRoundedRect(CX - 100, 494, 200, 20, 8);
    const col = r < 0.5 ? 0x4cd964 : r < 0.75 ? 0xffd60a : 0xff453a;
    if (r > 0.01) g.fillStyle(col, 1).fillRoundedRect(CX - 98, 496, 196 * r, 16, 6);
    this.meterTxt.setText(`${v.toFixed(1)} m/s`);
    this.rate += (rate - this.rate) * 0.3; this.combo.setText(this.rate > 0.5 ? `연타 ${this.rate.toFixed(1)}/초` : '');
  }
  buildIntro() {
    const s = this.scene, c = this.intro = s.add.container(0, 0).setDepth(500);
    const t = (x, y, str, size, col = '#ffffff') => s.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color: col, stroke: '#000000', strokeThickness: 6, align: 'center' }).setOrigin(0.5);
    c.add(s.add.rectangle(CX, 400, W, H - 72, 0x000000, 0.72).setInteractive());
    c.add(s.add.rectangle(CX, 400, 820, 480, 0x14301a, 0.95).setStrokeStyle(6, 0xffd700));
    c.add(t(CX, 215, '조작 방법', 48, '#ffd700'));
    const key = (x, y, ch, w = 76) => { c.add(s.add.rectangle(x, y + 5, w, 76, 0x000000, 0.6)); c.add(s.add.rectangle(x, y, w, 76, 0xeeeeee).setStrokeStyle(4, 0x888888)); c.add(t(x, y - 2, ch, 44, '#222222').setStroke('#ffffff', 0)); };
    key(310, 305, '←'); key(396, 305, '→');
    c.add(t(700, 305, '좌우 이동 — 수비수를 피해라!', 34).setOrigin(0.5));
    key(353, 405, '↑', 100);
    c.add(t(700, 405, '↑ 연타!! 빨리 누를수록 빨라진다', 34, '#ffe14d'));
    c.add(t(CX, 505, '빨간 수비수에 부딪히면 0.5초 기절 + 속도 0!', 30, '#ff8888'));
    c.add(t(CX, 560, `10초 안에 더 멀리 달리거나, 먼저 ${CFG.D}m 결승선 통과!`, 28));
    this.big = s.add.text(CX, 380, '', { fontFamily: FONT, fontSize: '200px', color: '#ffffff', stroke: '#000000', strokeThickness: 16 }).setOrigin(0.5).setDepth(510).setAlpha(0);
  }
  hideIntro() { this.intro.setVisible(false); }
  showBig(str, color = '#ffffff', size = 200) {
    const b = this.big; b.setText(str).setColor(color).setFontSize(size).setAlpha(1).setScale(1.6);
    this.scene.tweens.killTweensOf(b);
    this.scene.tweens.add({ targets: b, scale: 1, duration: 220, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: b, alpha: 0, duration: 300, delay: 480 });
  }
  pop(x, y, str, color = '#ffffff', size = 40) {
    const t = this.scene.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#000000', strokeThickness: 7 }).setOrigin(0.5).setDepth(300);
    this.scene.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }
}
