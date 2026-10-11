// 선수 머리 주변 "줄어드는 타이밍 링". 링 반지름이 안쪽 기준원(base)과 같아지는 순간 = 공 도착.
const GRADE_COL = { perfect: 0xffd700, good: 0x69f0ae, miss: 0xff5252 };

export class TimingRing {
  constructor(scene, x, y, color) {
    this.scene = scene; this.x = x; this.y = y; this.color = color;
    this.g = scene.add.graphics().setDepth(30);
    this.base = 44; this.R0 = 120; this.active = false;
  }
  start(arrival, dur) {
    this.arrival = arrival; this.dur = dur; this.active = true; this.frozen = null; this.result = null; this.fade = 1;
  }
  radiusAt(now) { return Math.max(8, this.base + (this.R0 - this.base) * ((this.arrival - now) / this.dur)); }
  freeze(now, grade) {
    if (!this.active || this.frozen) return;
    this.frozen = { r: this.radiusAt(now), t: now, grade };
  }
  hide() { this.active = false; this.g.clear(); }
  fadeOut() { this.scene.tweens.add({ targets: this, fade: 0, duration: 350 }); }

  draw(now) {
    const g = this.g; g.clear();
    if (!this.active) return;
    const f = this.frozen, a = this.fade;
    let r = f ? f.r : this.radiusAt(now), col = this.color, alpha = a;
    const diff = Math.abs(r - this.base);
    // 기준원 (머리 위치)
    g.lineStyle(4, 0xffffff, 0.9 * a).strokeCircle(this.x, this.y, this.base);
    g.fillStyle(0xffffff, 0.10 * a).fillCircle(this.x, this.y, this.base);
    if (f) {
      col = GRADE_COL[f.grade];
      const k = Math.min(1, (now - f.t) / 300);                       // 판정 직후 펄스
      r = f.r + (1 - k) * 0 + Math.sin(k * Math.PI) * 10;
      g.fillStyle(col, 0.30 * (1 - k * 0.5) * a).fillCircle(this.x, this.y, r);
      alpha = a;
    } else if (diff < 7) {
      col = 0xffffff; g.fillStyle(this.color, 0.35 * a).fillCircle(this.x, this.y, r);   // 거의 일치: 번쩍
    }
    const w = f ? 7 : 3 + 5 * Math.max(0, 1 - (r - this.base) / (this.R0 - this.base));
    g.lineStyle(w + 8, col, 0.22 * alpha).strokeCircle(this.x, this.y, r);
    g.lineStyle(w, col, alpha).strokeCircle(this.x, this.y, r);
  }
}
