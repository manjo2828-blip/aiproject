import { W, H, COLORS } from '../config/constants.js';

// 타이틀 배경: 잔디 줄무늬 + 흰 라인 + 떠다니는 공/색종이
export function createTitleBackground(scene) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.field).fillRect(0, 0, W, H);
  for (let i = 0; i < W / 80; i += 2) g.fillStyle(COLORS.fieldDark, 0.55).fillRect(i * 80, 0, 80, H);
  g.lineStyle(5, 0xffffff, 0.45);
  g.strokeRect(36, 30, W - 72, H - 60);
  g.lineBetween(W / 2, 30, W / 2, H - 30);
  g.strokeCircle(W / 2, H / 2, 120); g.fillStyle(0xffffff, 0.45).fillCircle(W / 2, H / 2, 7);
  [[36, 1], [W - 36, -1]].forEach(([x, d]) => {
    g.strokeRect(d > 0 ? x : x - 190, H / 2 - 180, 190, 360);
    g.strokeRect(d > 0 ? x : x - 80, H / 2 - 90, 80, 180);
    g.beginPath().arc(x + d * 190, H / 2, 70, d > 0 ? -0.93 : Math.PI - 0.93, d > 0 ? 0.93 : Math.PI + 0.93, false).strokePath();
  });
  // 상/하단 어둡게 (로고/버튼 가독성)
  g.fillGradientStyle(0x0b2a10, 0x0b2a10, 0x0b2a10, 0x0b2a10, 0.75, 0.75, 0, 0).fillRect(0, 0, W, 250);
  g.fillGradientStyle(0x0b2a10, 0x0b2a10, 0x0b2a10, 0x0b2a10, 0, 0, 0.8, 0.8).fillRect(0, H - 150, W, 150);

  // 떠다니는 공
  for (let i = 0; i < 9; i++) {
    const b = scene.add.image(Phaser.Math.Between(40, W - 40), Phaser.Math.Between(250, 640), 'sports_equip', 'ball_soccer' + (1 + (i % 4)) + '.png')
      .setAlpha(0.35).setScale(Phaser.Math.FloatBetween(0.5, 0.9));
    scene.tweens.add({ targets: b, y: b.y - Phaser.Math.Between(30, 70), angle: Phaser.Math.Between(-180, 180), duration: Phaser.Math.Between(2500, 4500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  // 색종이
  const cg = scene.make.graphics({ add: false }); cg.fillStyle(0xffffff).fillRect(0, 0, 10, 16); cg.generateTexture('title_confetti', 10, 16); cg.destroy();
  const cols = [0xffd700, 0xff4d4d, 0x1e90ff, 0x87ceeb, 0xffffff];
  for (let i = 0; i < 26; i++) {
    const c = scene.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(-H, 0), 'title_confetti').setTint(cols[i % cols.length]).setAlpha(0.8).setScale(Phaser.Math.FloatBetween(0.5, 0.9));
    scene.tweens.add({ targets: c, y: H + 30, x: c.x + Phaser.Math.Between(-90, 90), angle: Phaser.Math.Between(240, 720), duration: Phaser.Math.Between(6000, 11000), delay: Phaser.Math.Between(0, 5000), repeat: -1, onRepeat: () => { c.y = -20; c.x = Phaser.Math.Between(0, W); } });
  }
}
