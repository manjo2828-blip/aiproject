import { W, H, FONT } from '../../../config/constants.js';

export const GROUND_Y = 590;                       // 선수 발 위치
export const GOAL = { x: 640, half: 170, top: 215, line: 322 };

// 배경: 관중석 / 광고판 / 잔디 줄무늬 / 페널티 박스 / 골대+그물
export class HeadingField {
  constructor(scene) {
    this.scene = scene;
    this.bake('hd_bg', W, H, (g) => { this.drawStands(g); this.drawGrass(g); this.drawLines(g); }, 0);
    this.bake('hd_crowd', W, 182, (g) => this.drawCrowd(g), 1);
    this.crowd = scene.children.list[scene.children.list.length - 1];
    this.adTexts();
    this.drawGoal();
  }

  // 정적 배경은 텍스처로 굽는다 (매 프레임 Graphics 재렌더 방지 -> 성능)
  bake(key, w, h, draw, depth) {
    const s = this.scene;
    if (!s.textures.exists(key)) { const g = s.make.graphics({ add: false }); draw(g); g.generateTexture(key, w, h); g.destroy(); }
    return s.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
  }

  drawStands(g) {
    g.fillGradientStyle(0x0b1424, 0x0b1424, 0x1d2b44, 0x1d2b44, 1).fillRect(0, 0, W, 182);
    // 조명
    [160, 480, 800, 1120].forEach((x) => { g.fillStyle(0xfff6c8, 0.10).fillCircle(x, 6, 70).fillStyle(0xfff6c8, 0.9).fillCircle(x, 6, 7); });
    this.drawAds(g);
  }

  drawCrowd(c) {
    const cols = [0xe53935, 0x1e88e5, 0xfdd835, 0xffffff, 0x43a047, 0xff9800];
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < 6; r++) {
      const y = 62 + r * 20, shade = 0x0a0f18 + r * 0x02030a;
      for (let x = -10 + (r % 2) * 13; x < W + 20; x += 26) {
        const jx = x + rnd() * 6, jy = y + rnd() * 4, colored = rnd() < 0.3;
        c.fillStyle(colored ? cols[Math.floor(rnd() * cols.length)] : shade, colored ? 0.55 : 1).fillEllipse(jx, jy + 15, 22, 22);
        c.fillStyle(0x15110f + (rnd() < 0.3 ? 0x201208 : 0), 1).fillCircle(jx, jy, 7);
        if (rnd() < 0.08) c.fillStyle(0x15110f, 1).fillRect(jx + 6, jy - 14, 3, 14);   // 만세
      }
    }
  }

  adTexts() {
    const s = this.scene;
    for (let i = 0; i < 8; i++) s.add.text(i * 160 + 80, 190, i % 2 ? 'FOOTIVAL' : '풋티벌', { fontFamily: FONT, fontSize: '16px', color: i % 4 === 2 ? '#222' : '#fff' }).setOrigin(0.5).setDepth(2);
  }

  drawAds(ad) {
    ad.fillStyle(0x0c1a2e, 1).fillRect(0, 176, W, 28);
    const cs = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047];
    for (let i = 0; i < 8; i++) ad.fillStyle(cs[i % 4], 1).fillRect(i * 160 + 4, 180, 152, 20);
    ad.fillStyle(0x000000, 0.35).fillRect(0, 204, W, 4);
  }

  drawGrass(g) {
    const top = 204, n = 12;
    for (let k = 0; k < n; k++) {
      const y0 = top + (H - top) * Math.pow(k / n, 1.35), y1 = top + (H - top) * Math.pow((k + 1) / n, 1.35);
      g.fillStyle(k % 2 ? 0x2f8a37 : 0x3a9b41, 1).fillRect(0, y0, W, y1 - y0 + 1);
    }
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.0, 0.35, 0.35).fillRect(0, 560, W, 160);
  }

  drawLines(g) {
    g.lineStyle(4, 0xffffff, 0.8);
    const L = GOAL.line;
    g.lineBetween(0, L, W, L);                                                // 골 라인
    g.strokePoints([{ x: 400, y: L }, { x: 330, y: 440 }, { x: 950, y: 440 }, { x: 880, y: L }]);                // 골 에어리어
    g.strokePoints([{ x: 230, y: L }, { x: 90, y: 650 }, { x: 1190, y: 650 }, { x: 1050, y: L }]);              // 페널티 박스
    g.fillStyle(0xffffff, 0.85).fillCircle(640, 520, 5);                      // 페널티 마크
  }

  drawGoal() {
    const s = this.scene, { x, half, top, line } = GOAL, h = line - top;
    // 그물 (골라인 기준 컨테이너: 흔들기용, 텍스처로 구움)
    this.net = s.add.container(x, line).setDepth(2);
    const nw = half * 2 + 4;
    if (!s.textures.exists('hd_net')) {
      const n = s.make.graphics({ add: false }), o = half + 2;
      n.fillStyle(0x0a1a12, 0.55).fillRect(2, 0, half * 2, h);
      n.fillStyle(0xffffff, 0.06).fillPoints([{ x: 2, y: 0 }, { x: half * 2 + 2, y: 0 }, { x: half * 2 - 28, y: 22 }, { x: 32, y: 22 }]);
      n.lineStyle(1.5, 0xffffff, 0.38);
      for (let i = 0; i <= half * 2; i += 17) n.lineBetween(2 + i, 0, 2 + i, h);
      for (let j = 0; j <= h; j += 15) n.lineBetween(2, j, half * 2 + 2, j);
      n.generateTexture('hd_net', nw, h + 2); n.destroy();
    }
    this.net.add(s.add.image(0, 0, 'hd_net').setOrigin(0.5, 1));
    // 골대 틀 (고정)
    const p = s.add.graphics().setDepth(3).lineStyle(9, 0xf2f2f2, 1);
    p.lineBetween(x - half, line + 2, x - half, top).lineBetween(x + half, line + 2, x + half, top).lineBetween(x - half - 4, top, x + half + 4, top);
    p.lineStyle(3, 0x000000, 0.25).lineBetween(x - half + 5, line, x - half + 5, top + 5).lineBetween(x + half - 5, line, x + half - 5, top + 5);
  }

  shakeNet() {
    const s = this.scene; s.tweens.killTweensOf(this.net); this.net.setScale(1);
    s.tweens.add({ targets: this.net, scaleX: 1.07, scaleY: 1.1, angle: 1.4, duration: 60, yoyo: true, repeat: 5, ease: 'Sine.InOut', onComplete: () => this.net.setScale(1).setAngle(0) });
  }

  cheerCrowd() {
    const s = this.scene; s.tweens.killTweensOf(this.crowd); this.crowd.y = 0;
    s.tweens.add({ targets: this.crowd, y: -9, duration: 130, yoyo: true, repeat: 5, ease: 'Sine.Out', onComplete: () => { this.crowd.y = 0; } });
  }
}
