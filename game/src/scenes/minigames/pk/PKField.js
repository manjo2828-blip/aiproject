import { W, H } from '../../../config/constants.js';
import { GL, GR, GT, GB, SPOT, TARGET } from './PKConst.js';

// 배경(관중/광고판/잔디/라인) + 골대 + 그물 + 조준 표시
export class PKField {
  constructor(scene) {
    this.scene = scene; this.bulge = null; this.shake = 0;
    this.drawBackground();
    this.net = scene.add.graphics().setDepth(5).setVisible(false);
    this.netImg = null;
    this.frame = scene.add.graphics().setDepth(12);
    this.aim = scene.add.graphics().setDepth(8);
    this.drawNet();
    this.bakeNet();
    this.drawFrame();
  }
  // 정지 상태 그물은 텍스처로 구워 렌더 비용을 줄인다
  bakeNet() {
    const s = this.scene, w = GR - GL, h = GB - GT;
    if (this.netImg) this.netImg.destroy();
    if (s.textures.exists('pk_net')) s.textures.remove('pk_net');
    const g = s.make.graphics({ add: false });
    this.drawNet(0, g, GL, GT);
    g.generateTexture('pk_net', w + 4, h + 4); g.destroy();
    this.netImg = s.add.image(GL, GT, 'pk_net').setOrigin(0).setDepth(5);
  }
  drawBackground() {
    const s = this.scene;
    if (s.textures.exists('pk_bg')) { s.add.image(0, 0, 'pk_bg').setOrigin(0).setDepth(0); return; }
    const g = s.make.graphics({ add: false });
    g.fillStyle(0x10182e, 1).fillRect(0, 0, W, 150);
    const cols = [0xe53935, 0x1e90ff, 0xffd54f, 0xffffff, 0x43d95a, 0xff8a65, 0xba68c8];
    for (let r = 0; r < 6; r++) for (let i = 0; i < 64; i++) {
      g.fillStyle(cols[(i * 7 + r * 3) % cols.length], 0.55 + (r % 2) * 0.2).fillCircle(i * 20 + (r % 2) * 10 + Math.random() * 4, 20 + r * 20 + Math.random() * 3, 6);
    }
    g.fillStyle(0x000000, 0.55).fillRect(0, 50, W, 100);
    // 광고판
    const ad = [0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825];
    for (let i = 0; i < 8; i++) g.fillStyle(ad[i % 4], 1).fillRect(i * 160, 148, 158, 28).fillStyle(0xffffff, 0.25).fillRect(i * 160, 148, 158, 6);
    g.fillStyle(0x000000, 0.4).fillRect(0, 174, W, 4);
    // 잔디 줄무늬
    for (let i = 0; i < 12; i++) g.fillStyle(i % 2 ? 0x2f8a35 : 0x2a7d30, 1).fillRect(0, 178 + i * 46, W, 46);
    // 라인
    g.lineStyle(5, 0xffffff, 0.9);
    g.lineBetween(0, GB, W, GB);                                   // 골라인
    g.lineBetween(GL - 110, GB, GL - 230, 470).lineBetween(GR + 110, GB, GR + 230, 470).lineBetween(GL - 230, 470, GR + 230, 470); // 6야드 박스
    g.lineStyle(4, 0xffffff, 0.7);
    g.lineBetween(GL - 330, GB, GL - 520, 680).lineBetween(GR + 330, GB, GR + 520, 680);
    g.fillStyle(0xffffff, 1).fillEllipse(SPOT.x, SPOT.y + 12, 26, 9);                            // 페널티 스폿
    // 비네팅
    g.fillStyle(0x000000, 0.18).fillRect(0, 0, 40, H).fillRect(W - 40, 0, 40, H);
    g.generateTexture('pk_bg', W, H); g.destroy();
    s.add.image(0, 0, 'pk_bg').setOrigin(0).setDepth(0);
  }
  drawNet(offsetX = 0, g = this.net, ox = 0, oy = 0) {
    const w = GR - GL, h = GB - GT, cols = 28, rows = 12, b = this.bulge;
    g.clear().fillStyle(0x000000, 0.28).fillRect(GL - ox, GT - oy, w, h);
    g.lineStyle(1.5, 0xffffff, 0.5);
    const P = (i, j) => {
      let x = GL + (w * i) / cols + offsetX * (j / rows), y = GT + (h * j) / rows;
      if (b && b.amt > 0) { const dx = x - b.x, dy = y - b.y, k = b.amt * Math.exp(-(dx * dx + dy * dy) / 9000); x -= dx * k * 0.5; y -= dy * k * 0.5; }
      return [x - ox, y - oy];
    };
    for (let j = 0; j <= rows; j++) { g.beginPath(); for (let i = 0; i <= cols; i++) { const [x, y] = P(i, j); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokePath(); }
    for (let i = 0; i <= cols; i++) { g.beginPath(); for (let j = 0; j <= rows; j++) { const [x, y] = P(i, j); j ? g.lineTo(x, y) : g.moveTo(x, y); } g.strokePath(); }
  }
  drawFrame() {
    const g = this.frame;
    g.lineStyle(10, 0xf5f5f5, 1).beginPath().moveTo(GL, GB).lineTo(GL, GT).lineTo(GR, GT).lineTo(GR, GB).strokePath();
    g.lineStyle(3, 0x9e9e9e, 0.8).beginPath().moveTo(GL + 5, GB).lineTo(GL + 5, GT + 5).lineTo(GR - 5, GT + 5).lineTo(GR - 5, GB).strokePath();
  }
  // 그물 출렁임 (골 / 포스트 등)
  netBulge(x, y, amt = 0.55) {
    const o = { a: amt, t: 0 };
    this.scene.tweens.add({
      targets: o, a: 0, t: 1, duration: 900, ease: 'Sine.easeOut',
      onStart: () => { this.netImg.setVisible(false); this.net.setVisible(true); },
      onUpdate: () => { this.bulge = { x, y, amt: o.a }; this.drawNet(Math.sin(o.t * 20) * 6 * (1 - o.t)); },
      onComplete: () => { this.bulge = null; this.drawNet(); this.net.setVisible(false); this.netImg.setVisible(true); },
    });
  }
  // 조준(또는 키퍼 예측) 구역 표시
  showAim(dir, color = 0xffe14d) {
    const g = this.aim, tw = (GR - GL) / 3, i = dir + 1, t = TARGET[dir];
    g.clear().fillStyle(color, 0.22).fillRect(GL + i * tw, GT, tw, GB - GT).lineStyle(3, color, 0.9).strokeRect(GL + i * tw + 2, GT + 2, tw - 4, GB - GT - 4);
    g.lineStyle(4, color, 1).strokeCircle(t.x, t.y, 22).lineBetween(t.x - 32, t.y, t.x - 12, t.y).lineBetween(t.x + 12, t.y, t.x + 32, t.y).lineBetween(t.x, t.y - 32, t.x, t.y - 12).lineBetween(t.x, t.y + 12, t.x, t.y + 32);
  }
  clearAim() { this.aim.clear(); }
}
