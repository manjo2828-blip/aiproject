import { W, H } from '../config/constants.js';
import { SFX } from '../core/SoundFX.js';
import { txt } from '../ui/Button.js';

export const wait = (scene, ms) => new Promise((res) => scene.time.delayedCall(ms, res));
const tw = (scene, cfg) => new Promise((res) => scene.tweens.add({ ...cfg, onComplete: (...a) => { if (cfg.onComplete) cfg.onComplete(...a); res(); } }));
export { tw };

// 공용 연출 모음: 배너 / 플로팅 숫자 / 특성 태그 / 컨페티 / 카드 플래시
export class Fx {
  constructor(scene) { this.s = scene; }

  // 화면 가로 배너. await 하면 사라질 때까지 대기.
  async banner(text, { color = '#ffd700', sub = '', hold = 650, y = 300, band = 0x000000, size = 68, sfx = 'banner', bandAlpha = 0.78 } = {}) {
    const s = this.s; if (sfx) SFX.play(sfx);
    const h = sub ? 150 : 118;
    const bg = s.add.rectangle(W / 2, y, W, h, band, bandAlpha).setDepth(500).setScale(1, 0);
    const line = s.add.rectangle(W / 2, y, W, h, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0.5).setDepth(500).setScale(1, 0);
    const t = txt(s, W / 2, sub ? y - 22 : y, text, size, color, { strokeThickness: 8 }).setDepth(501).setAlpha(0).setScale(0.4);
    const st = sub ? txt(s, W / 2, y + 40, sub, 28, '#ffffff').setDepth(501).setAlpha(0) : null;
    s.tweens.add({ targets: [bg, line], scaleY: 1, duration: 180, ease: 'Cubic.Out' });
    s.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 320, ease: 'Back.Out' });
    if (st) s.tweens.add({ targets: st, alpha: 1, duration: 250, delay: 150 });
    await wait(s, 330 + hold);
    const outs = [bg, line, t, st].filter(Boolean);
    await tw(s, { targets: outs, alpha: 0, duration: 200 });
    outs.forEach((o) => o.destroy());
  }

  // 떠오르는 숫자/글자
  float(x, y, str, { color = '#ffd700', size = 34, dy = 70, dur = 1100, delay = 0 } = {}) {
    const t = txt(this.s, x, y, str, size, color, { strokeThickness: 6 }).setDepth(420).setAlpha(0);
    this.s.tweens.add({ targets: t, alpha: 1, duration: 120, delay });
    this.s.tweens.add({ targets: t, y: y - dy, duration: dur, delay, ease: 'Cubic.Out' });
    this.s.tweens.add({ targets: t, alpha: 0, duration: 300, delay: delay + dur - 300, onComplete: () => t.destroy() });
    return t;
  }

  // 캐릭터 특성 발동 태그 (작은 알약)
  tag(x, y, str, color = 0xffd700) {
    const s = this.s;
    const t = txt(s, 0, 0, str, 22, '#1b1b1b', { stroke: '#00000000', strokeThickness: 0 });
    const w = t.width + 30, c = s.add.container(x, y).setDepth(430);
    const bg = s.add.graphics().fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -17, w, 38, 19).fillStyle(color, 1).fillRoundedRect(-w / 2, -19, w, 38, 19);
    c.add([bg, t]); c.setScale(0.3).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
    s.tweens.add({ targets: c, y: y - 36, duration: 1700, ease: 'Sine.Out' });
    s.tweens.add({ targets: c, alpha: 0, duration: 300, delay: 1500, onComplete: () => c.destroy() });
    return c;
  }

  confetti(x, y, n = 44) {
    const s = this.s, cols = [0xffd700, 0xff5252, 0x40c4ff, 0x69f0ae, 0xffffff, 0xff80ab];
    SFX.play('confetti');
    for (let i = 0; i < n; i++) {
      const r = s.add.rectangle(x, y, 8 + Math.random() * 6, 12, cols[i % cols.length]).setDepth(450).setAngle(Math.random() * 360);
      const dx = (Math.random() - 0.5) * 520, up = 100 + Math.random() * 160;
      s.tweens.add({ targets: r, x: x + dx, duration: 1300, ease: 'Sine.Out' });
      s.tweens.add({ targets: r, y: y - up, duration: 450, ease: 'Quad.Out', yoyo: false, onComplete: () => s.tweens.add({ targets: r, y: y + 160 + Math.random() * 120, alpha: 0, duration: 900, ease: 'Quad.In', onComplete: () => r.destroy() }) });
      s.tweens.add({ targets: r, angle: r.angle + 500, duration: 1300 });
    }
  }

  // 옐로카드 그래픽 번쩍
  yellowCard(x, y) {
    const s = this.s, g = s.add.graphics().setDepth(440);
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-24, -34, 52, 72, 6).fillStyle(0xffe000, 1).fillRoundedRect(-26, -38, 52, 72, 6).lineStyle(3, 0xffffff, 1).strokeRoundedRect(-26, -38, 52, 72, 6);
    g.setPosition(x, y).setScale(0.2).setAngle(-12);
    s.tweens.add({ targets: g, scale: 1.5, angle: 8, duration: 280, ease: 'Back.Out' });
    s.tweens.add({ targets: g, alpha: 0.2, duration: 110, yoyo: true, repeat: 3, delay: 280 });
    s.tweens.add({ targets: g, alpha: 0, scale: 1.9, duration: 250, delay: 900, onComplete: () => g.destroy() });
  }

  flashScreen(color = 0xffffff, a = 0.45, dur = 200) {
    const r = this.s.add.rectangle(W / 2, H / 2, W, H, color, a).setDepth(480);
    this.s.tweens.add({ targets: r, alpha: 0, duration: dur, onComplete: () => r.destroy() });
  }

  shake(target, amp = 8, repeat = 5) {
    const x0 = target.x;
    return tw(this.s, { targets: target, x: x0 + amp, duration: 40, yoyo: true, repeat, onComplete: () => { target.x = x0; } });
  }
}
