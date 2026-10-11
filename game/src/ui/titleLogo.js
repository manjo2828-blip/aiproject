import { W, FONT } from '../config/constants.js';

// 로고: "풋티벌" 글자별 통통 + FOOTIVAL + 부제 + 양옆 공
export function createTitleLogo(scene) {
  const cx = W / 2, cy = 82;
  const cols = ['#ffd700', '#ffffff', '#ffd700'];
  [...'풋티벌'].forEach((ch, i) => {
    const mk = (color, dx, dy, stroke) => scene.add.text(dx, dy, ch, { fontFamily: FONT, fontSize: '112px', color, stroke, strokeThickness: 16 }).setOrigin(0.5);
    const sh = mk('#0b2a10', 0, 9, '#0b2a10'), main = mk(cols[i], 0, 0, '#17481f');
    const cont = scene.add.container(cx + (i - 1) * 112, cy, [sh, main]);
    cont.setScale(0).setAngle(-12 + i * 12);
    scene.tweens.add({ targets: cont, scale: 1, duration: 500, delay: 150 + i * 130, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: cont, y: cy - 12, angle: { from: -3 + i * 3, to: 3 - i * 3 }, duration: 800 + i * 90, yoyo: true, repeat: -1, delay: 900 + i * 160, ease: 'Sine.easeInOut' });
  });
  const en = scene.add.text(cx, 160, 'F O O T I V A L', { fontFamily: FONT, fontSize: '42px', color: '#ffffff', stroke: '#17481f', strokeThickness: 8 }).setOrigin(0.5).setAlpha(0);
  scene.tweens.add({ targets: en, alpha: 1, duration: 500, delay: 700 });
  const sub = scene.add.text(cx, 204, '미니 사커 파티 - Mini Soccer Party', { fontFamily: FONT, fontSize: '26px', color: '#e8f5e9', stroke: '#0b2a10', strokeThickness: 6 }).setOrigin(0.5).setAlpha(0);
  scene.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 900 });
  // 바운스하는 공
  [[cx - 330, 'ball_soccer1.png', 0], [cx + 330, 'ball_soccer3.png', 350]].forEach(([x, f, d]) => {
    const sh = scene.add.ellipse(x, 150, 70, 14, 0x000000, 0.3);
    const b = scene.add.image(x, 60, 'sports_equip', f).setScale(1.4);
    scene.tweens.add({ targets: b, y: 120, duration: 520, delay: d, yoyo: true, repeat: -1, ease: 'Quad.easeIn' });
    scene.tweens.add({ targets: b, angle: 360, duration: 2400, repeat: -1 });
    scene.tweens.add({ targets: sh, scaleX: { from: 0.5, to: 1 }, alpha: { from: 0.15, to: 0.35 }, duration: 520, delay: d, yoyo: true, repeat: -1, ease: 'Quad.easeIn' });
  });
}
