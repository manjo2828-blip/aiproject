import { FONT } from '../../../config/constants.js';
import { GAUGE } from './PKConst.js';
import { zoneOf } from './PKAI.js';
import { SFX } from '../../../core/SoundFX.js';

// 슛 게이지: 빨강(가장자리) / 노랑 / 초록(중앙). 일정 속도로 좌우 핑퐁.
export class PKGauge {
  constructor(scene) {
    this.scene = scene; this.running = false; this.pos = 0; this.t0 = 0; this.lastTick = 0;
    const { x, y, w, h } = GAUGE;
    this.c = scene.add.container(x, y).setDepth(60).setVisible(false);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.55).fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 14);
    const seg = (a, b, col) => g.fillStyle(col, 1).fillRect(-w / 2 + a * w, -h / 2, (b - a) * w, h);
    seg(0, 0.2, 0xe53935); seg(0.2, 0.38, 0xffc107); seg(0.38, 0.62, 0x43d95a); seg(0.62, 0.8, 0xffc107); seg(0.8, 1, 0xe53935);
    g.lineStyle(3, 0xffffff, 0.9).strokeRect(-w / 2, -h / 2, w, h);
    this.cursor = scene.add.graphics();
    this.cursor.fillStyle(0xffffff, 1).fillRect(-3, -h / 2 - 9, 6, h + 18).fillTriangle(-10, -h / 2 - 18, 10, -h / 2 - 18, 0, -h / 2 - 4);
    this.cursor.lineStyle(2, 0x000000, 0.8).strokeRect(-3, -h / 2 - 9, 6, h + 18);
    this.label = scene.add.text(0, -h / 2 - 34, 'PERFECT', { fontFamily: FONT, fontSize: '16px', color: '#9dffb0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    this.label.x = 0;
    this.c.add([g, this.cursor, this.label]);
  }
  show() { this.c.setVisible(true); this.cursor.x = 0; this.label.setText('초록 구간에서 SPACE!'); }
  hide() { this.running = false; this.c.setVisible(false); }
  start() { this.running = true; this.t0 = this.scene.time.now; }
  // 정지하고 구간 반환
  stop() { this.running = false; return zoneOf(this.pos); }
  update(now) {
    if (!this.running) return;
    const ph = ((now - this.t0) / GAUGE.sweepMs) % 2;
    this.pos = ph <= 1 ? ph : 2 - ph;
    this.cursor.x = (this.pos - 0.5) * GAUGE.w;
    if (now - this.lastTick > 90) { this.lastTick = now; SFX.play('gaugeTick'); }
  }
}
