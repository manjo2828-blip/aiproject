// 컨페티 파티클 시스템 (직접 구현). 텍스처 1장을 틴트해서 사용, 풀링.
// const cf = new Confetti(scene, { depth: 50 }); cf.burst(x,y,n); cf.rain(true); (scene update 불필요: 자체 이벤트 사용)
const COLS = [0xff3b5c, 0xffd700, 0x2ee6a8, 0x3aa0ff, 0xff8a1f, 0xc16bff, 0xffffff, 0x7cff4f];
export class Confetti {
  constructor(scene, { depth = 50, max = 320 } = {}) {
    this.scene = scene; this.depth = depth; this.max = max; this.items = []; this.raining = false; this.acc = 0;
    if (!scene.textures.exists('confetti_px')) {
      const g = scene.make.graphics({ add: false }); g.fillStyle(0xffffff, 1).fillRect(0, 0, 14, 9); g.generateTexture('confetti_px', 14, 9); g.destroy();
    }
    this.cam = scene.cameras.main;
    this.ev = scene.events.on('update', this.update, this);
    scene.events.once('shutdown', () => this.destroy());
  }
  spawn(x, y, vx, vy, life = 5) {
    if (this.items.length >= this.max) return;
    const s = this.scene.add.image(x, y, 'confetti_px').setDepth(this.depth).setTint(Phaser.Utils.Array.GetRandom(COLS));
    s.setScale(Phaser.Math.FloatBetween(0.7, 1.4)); s.setRotation(Math.random() * 6.28);
    s.p = { vx, vy, vr: Phaser.Math.FloatBetween(-6, 6), ph: Math.random() * 6.28, fs: Phaser.Math.FloatBetween(5, 11), life, age: 0, base: s.scaleX };
    this.items.push(s);
  }
  // 대포처럼 터뜨리기: 위쪽 부채꼴
  burst(x, y, n = 80, { spread = 80, power = 900, angle = -90 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Phaser.Math.DegToRad(angle + Phaser.Math.FloatBetween(-spread, spread));
      const sp = power * Phaser.Math.FloatBetween(0.35, 1);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, Phaser.Math.FloatBetween(3.5, 6));
    }
  }
  rain(on) { this.raining = on; }
  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    if (this.raining) {
      this.acc += dt * 70;
      while (this.acc >= 1) { this.acc--; this.spawn(Math.random() * 1320 - 20, -20, Phaser.Math.FloatBetween(-40, 40), Phaser.Math.FloatBetween(20, 120), 8); }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i], p = s.p; p.age += dt;
      p.vy += 520 * dt; p.vx *= 1 - 1.6 * dt; if (p.vy > 190) p.vy = 190 + (p.vy - 190) * (1 - 5 * dt);   // 공기저항: 종단속도
      p.ph += p.fs * dt;
      s.x += (p.vx + Math.sin(p.ph) * 40) * dt; s.y += p.vy * dt; s.rotation += p.vr * dt;
      s.scaleY = p.base * Math.cos(p.ph);          // 팔랑팔랑 뒤집힘
      if (p.age > p.life - 0.5) s.alpha = Math.max(0, (p.life - p.age) / 0.5);
      if (p.age > p.life || s.y > 760) { s.destroy(); this.items.splice(i, 1); }
    }
  }
  destroy() { this.scene.events.off('update', this.update, this); this.items.forEach((s) => s.destroy()); this.items = []; }
}
