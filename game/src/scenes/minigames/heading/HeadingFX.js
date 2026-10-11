import { txt } from '../../../ui/Button.js';

export const GRADE_TXT = { perfect: 'PERFECT!', good: 'GOOD', miss: 'MISS' };
export const GRADE_HEX = { perfect: '#ffd700', good: '#69f0ae', miss: '#ff5252' };

export function popup(scene, x, y, text, color, size = 52, hold = 650) {
  const t = txt(scene, x, y, text, size, color, { stroke: '#000', strokeThickness: Math.round(size / 6) }).setDepth(200).setScale(0.2);
  scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.Out' });
  scene.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 380, delay: hold, onComplete: () => t.destroy() });
  return t;
}

export function burst(scene, x, y, colors, n = 18, speed = 220, depth = 150) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8), r = 3 + Math.random() * 5;
    const c = scene.add.circle(x, y, r, colors[i % colors.length]).setDepth(depth);
    scene.tweens.add({
      targets: c, x: x + Math.cos(a) * v, y: y + Math.sin(a) * v + 60, alpha: 0, scale: 0.2,
      duration: 450 + Math.random() * 350, ease: 'Quad.Out', onComplete: () => c.destroy(),
    });
  }
}

// 하늘에서 쏟아지는 색종이
export function confetti(scene, n = 40) {
  const cols = [0xffd700, 0xff5252, 0x69f0ae, 0x40c4ff, 0xffffff, 0xff80ab];
  for (let i = 0; i < n; i++) {
    const x = 120 + Math.random() * 1040, r = scene.add.rectangle(x, -20, 8, 14, cols[i % cols.length]).setDepth(160).setAngle(Math.random() * 180);
    scene.tweens.add({ targets: r, y: 720, x: x + (Math.random() - 0.5) * 160, angle: r.angle + 360 * (Math.random() > 0.5 ? 1 : -1), duration: 1100 + Math.random() * 900, delay: Math.random() * 350, onComplete: () => r.destroy() });
  }
}

export function flash(scene, alpha = 0.55, ms = 220, color = 0xffffff) {
  const r = scene.add.rectangle(640, 360, 1280, 720, color, alpha).setDepth(300);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}

// 순간 슬로모션(히트스톱): 트윈만 느려짐
export function hitstop(scene, ms = 170, scale = 0.12) {
  scene.tweens.timeScale = scale;
  const restore = () => { try { scene.tweens.timeScale = 1; } catch (e) { /* scene gone */ } };
  setTimeout(restore, ms);
  scene.events.once('shutdown', restore);
}

// 링 충돌 파문 (판정 순간 머리 위 원형 파동)
export function ripple(scene, x, y, color) {
  const c = scene.add.circle(x, y, 36).setStrokeStyle(5, color, 1).setDepth(140);
  scene.tweens.add({ targets: c, scale: 2.6, alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => c.destroy() });
}
