import { W, H } from '../../config/constants.js';

// 스타디움 배경: 밤하늘 + 관중 실루엣(웨이브) + 조명 빔 + 피치. 반환 container 에 postFX(흑백) 적용 가능.
export function buildStadium(scene) {
  const root = scene.add.container(0, 0).setDepth(0);
  const g = scene.add.graphics();
  g.fillGradientStyle(0x050b1f, 0x050b1f, 0x16305a, 0x16305a, 1).fillRect(0, 0, W, 430);
  // 스탠드
  g.fillStyle(0x0b1224, 1).fillRect(0, 250, W, 200);
  g.fillStyle(0x121c36, 1).fillRect(0, 250, W, 6);
  // 별/불빛
  for (let i = 0; i < 40; i++) g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.2, 0.7)).fillCircle(Math.random() * W, Math.random() * 120, Phaser.Math.FloatBetween(0.8, 1.8));
  // 피치
  g.fillStyle(0x1f6b2c, 1).fillRect(0, 440, W, H - 440);
  for (let i = 0; i < 8; i++) { g.fillStyle(i % 2 ? 0x24792f : 0x1c5f27, 1).fillRect(0, 440 + i * 36, W, 36); }
  g.lineStyle(4, 0xffffff, 0.25).strokeEllipse(W / 2, 600, 760, 150).lineBetween(0, 446, W, 446);
  g.fillStyle(0x000000, 0.35).fillRect(0, 436, W, 6);
  root.add(g);

  // 관중 2줄 (웨이브 트윈)
  const rows = [];
  [{ y: 330, s: 1.0, dim: 0.8 }, { y: 388, s: 1.15, dim: 1 }].forEach((r, ri) => {
    const cg = scene.add.graphics();
    const pal = [0x2b3a67, 0x4a2b5e, 0x1f4d4a, 0x5e3a2b, 0x3a3a3a, 0x6a2330, 0x24507a];
    for (let x = -10; x < W + 30; x += 30 * r.s) {
      const col = Phaser.Utils.Array.GetRandom(pal), hx = x + Math.random() * 6, hy = Math.random() * 6;
      cg.fillStyle(col, r.dim).fillCircle(hx, hy - 16 * r.s, 10 * r.s).fillRoundedRect(hx - 14 * r.s, hy - 8 * r.s, 28 * r.s, 60, 10);
      if (Math.random() < 0.18) cg.fillStyle(0xffe9a8, 0.9).fillCircle(hx + 12, hy - 26, 2.5);   // 폰 라이트
    }
    cg.y = r.y; root.add(cg); rows.push(cg);
    scene.tweens.add({ targets: cg, y: r.y - 7, duration: 520 + ri * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: ri * 260 });
  });
  // 광고판
  const ad = scene.add.graphics();
  ad.fillStyle(0x0a2a5a, 1).fillRect(0, 418, W, 24);
  for (let i = 0; i < 8; i++) ad.fillStyle(i % 2 ? 0xffd700 : 0xe53935, 1).fillRect(i * 160 + 20, 424, 120, 12);
  root.add(ad);

  // 조명 빔 (apex 고정, 좌우로 스윙)
  const beams = [];
  [[160, 0x9fd0ff], [480, 0xffffff], [800, 0xffe9a8], [1120, 0x9fd0ff]].forEach(([bx, col], i) => {
    const b = scene.add.graphics({ x: bx, y: -10 });
    b.fillStyle(col, 0.13).fillTriangle(0, 0, -90, 560, 90, 560);
    b.fillStyle(col, 0.08).fillTriangle(0, 0, -45, 560, 45, 560);
    b.setBlendMode(Phaser.BlendModes.ADD); b.angle = i % 2 ? -10 : 10;
    scene.tweens.add({ targets: b, angle: i % 2 ? 10 : -10, duration: 2400 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    root.add(b); beams.push(b);
  });
  // 철탑 조명
  const lamps = scene.add.graphics();
  [160, 480, 800, 1120].forEach((x) => lamps.fillStyle(0xfff6c8, 1).fillRoundedRect(x - 26, 0, 52, 14, 4));
  root.add(lamps);
  return { root, beams, rows };
}
