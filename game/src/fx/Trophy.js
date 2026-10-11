// 황금 트로피 (코드로 그림). 원점 = 받침 바닥 중앙, 위로 자란다. size = 전체 높이(px)
// const t = createTrophy(scene, x, y, { size: 120 }); t.sparkle() 반짝임 시작; t.shine 은 광택 스윕 이미지
export function createTrophy(scene, x, y, { size = 120 } = {}) {
  const s = size / 120;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const GOLD = 0xffd700, DARK = 0xc99700, LIGHT = 0xfff3a0, BASE = 0x5a3b12;
  // 받침 (대리석+금)
  g.fillStyle(BASE, 1).fillRoundedRect(-30 * s, -16 * s, 60 * s, 16 * s, 4 * s);
  g.fillStyle(GOLD, 1).fillRect(-24 * s, -24 * s, 48 * s, 8 * s);
  g.fillStyle(DARK, 1).fillRect(-24 * s, -19 * s, 48 * s, 3 * s);
  // 기둥
  g.fillStyle(DARK, 1).fillRect(-6 * s, -48 * s, 12 * s, 26 * s);
  g.fillStyle(GOLD, 1).fillRect(-6 * s, -48 * s, 7 * s, 26 * s);
  g.fillStyle(GOLD, 1).fillEllipse(0, -46 * s, 30 * s, 9 * s);
  // 손잡이 (양쪽 링)
  g.lineStyle(6 * s, DARK, 1);
  g.beginPath(); g.arc(-28 * s, -82 * s, 15 * s, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), false); g.strokePath();
  g.beginPath(); g.arc(28 * s, -82 * s, 15 * s, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(90), false); g.strokePath();
  g.lineStyle(3 * s, GOLD, 1);
  g.beginPath(); g.arc(-28 * s, -82 * s, 15 * s, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), false); g.strokePath();
  g.beginPath(); g.arc(28 * s, -82 * s, 15 * s, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(90), false); g.strokePath();
  // 컵 몸통
  g.fillStyle(DARK, 1).fillPoints([
    new Phaser.Math.Vector2(-36 * s, -118 * s), new Phaser.Math.Vector2(36 * s, -118 * s),
    new Phaser.Math.Vector2(26 * s, -70 * s), new Phaser.Math.Vector2(8 * s, -48 * s),
    new Phaser.Math.Vector2(-8 * s, -48 * s), new Phaser.Math.Vector2(-26 * s, -70 * s)], true);
  g.fillStyle(GOLD, 1).fillPoints([
    new Phaser.Math.Vector2(-36 * s, -118 * s), new Phaser.Math.Vector2(30 * s, -118 * s),
    new Phaser.Math.Vector2(21 * s, -72 * s), new Phaser.Math.Vector2(5 * s, -50 * s),
    new Phaser.Math.Vector2(-8 * s, -50 * s), new Phaser.Math.Vector2(-26 * s, -72 * s)], true);
  g.fillStyle(LIGHT, 0.9).fillRoundedRect(-27 * s, -112 * s, 8 * s, 40 * s, 4 * s);
  g.fillStyle(0xffffff, 0.8).fillCircle(-23 * s, -104 * s, 3 * s);
  // 컵 입구 + 별
  g.fillStyle(LIGHT, 1).fillEllipse(0, -118 * s, 72 * s, 10 * s);
  g.fillStyle(0xe0a800, 1).fillEllipse(0, -118 * s, 60 * s, 6 * s);
  g.fillStyle(0xffffff, 0.95);
  const pts = []; for (let i = 0; i < 10; i++) { const r = (i % 2 ? 4 : 10) * s, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(new Phaser.Math.Vector2(2 * s + Math.cos(a) * r, -88 * s + Math.sin(a) * r)); }
  g.fillPoints(pts, true);
  c.add(g);
  // 반짝임 별 4개
  const sparks = [[-34, -112], [30, -96], [-8, -60], [40, -126]].map(([px, py], i) => {
    const st = scene.add.star(px * s, py * s, 4, 1.5 * s, 8 * s, 0xffffff).setAlpha(0);
    c.add(st);
    st.run = () => scene.tweens.add({ targets: st, alpha: { from: 0, to: 1 }, scale: { from: 0.2, to: 1.3 }, angle: 90, duration: 420, yoyo: true, repeat: -1, repeatDelay: 600 + i * 230, delay: i * 350 });
    return st;
  });
  c.sparkle = () => { sparks.forEach((p) => p.run()); return c; };
  c.setSize(80 * s, 120 * s);
  return c;
}
