import { shade, poly, quad, line, arc } from './artUtil.js';

// 몸 부품 그리기 (각 부품 자체 원점 기준). 허리(엉덩이) = 토르소 원점, 위쪽이 -y.

// 토르소: x -28..28, y -50..0 (유니폼). 목도 포함.
export function drawTorso(g, c) {
  const { primary: p, secondary: s, pattern } = c.kit;
  g.fillStyle(shade(c.skin, -8)).fillRect(-8, -58, 16, 14);
  g.fillStyle(p).fillRoundedRect(-28, -50, 56, 50, { tl: 16, tr: 16, bl: 8, br: 8 });
  if (pattern === 'stripes') {
    for (const x of [-20, -4, 12]) g.fillStyle(s).fillRect(x, -48, 8, 46);
  } else {
    line(g, 4, s, -23, -36, -23, -6, 0.9); line(g, 4, s, 23, -36, 23, -6, 0.9);
  }
  g.fillStyle(s).fillRoundedRect(-28, -7, 56, 7, { tl: 0, tr: 0, bl: 8, br: 8 });
  poly(g, [[-13, -51], [13, -51], [0, -33]], s);
  poly(g, [[-9, -51], [9, -51], [0, -39]], c.skin);
  g.fillStyle(shade(p, 30), 0.35).fillRoundedRect(-24, -46, 14, 6, 3);
  // 가슴 엠블럼
  g.fillStyle(0xffffff, 0.85).fillCircle(-19, -39, 3); g.fillStyle(c.accent, 0.95).fillCircle(-19, -39, 1.7);
}

// 윗팔: 어깨 원점, 아래로 32. 소매 + 맨살
export function drawUpperArm(g, c) {
  g.fillStyle(c.skin).fillRoundedRect(-5, 6, 10, 28, 5).fillCircle(0, 32, 5.5);
  g.fillStyle(c.kit.primary).fillRoundedRect(-9, -8, 18, 24, 8);
  g.fillStyle(c.kit.secondary).fillRect(-9, 12, 18, 4);
}
// 아랫팔: 팔꿈치 원점, 아래로 28 + 손
export function drawForearm(g, c) {
  g.fillStyle(c.skin).fillRoundedRect(-5, -2, 10, 26, 5).fillCircle(0, 28, 7.5);
  g.fillStyle(shade(c.skin, -12), 0.5).fillCircle(2, 30, 3);
}

// 다리: 엉덩이 원점, 아래로 62. 반바지/맨살/양말/축구화
export function drawLeg(g, c) {
  const { primary: p, secondary: s } = c.kit;
  g.fillStyle(c.skin).fillRoundedRect(-5, 20, 10, 18, 3);
  g.fillStyle(p).fillRoundedRect(-6.5, 33, 13, 20, 4);
  g.fillStyle(s).fillRect(-6.5, 33, 13, 4);
  g.fillStyle(s === 0xffffff || p === s ? shade(p, -25) : s).fillRect(-6.5, 41, 13, 2.5);
  g.fillStyle(0x23232b).fillRoundedRect(-9, 51, 24, 11, { tl: 8, tr: 8, bl: 4, br: 4 });
  g.fillStyle(c.accent).fillRect(-9, 59.5, 24, 2.5);
  g.fillStyle(s === 0x111111 ? 0x1a1a1a : s).fillRoundedRect(-12, -9, 24, 32, 7);
  g.fillStyle(0xffffff, 0.18).fillRoundedRect(-9, -6, 6, 24, 3);
}

// 황금 트로피: 원점 = 받침 바닥 중앙, 위쪽이 -y
export function drawTrophy(g) {
  const gold = 0xffd700, dk = 0xd9a400;
  g.fillStyle(dk).fillRoundedRect(-17, -9, 34, 9, 3);
  g.fillStyle(gold).fillRect(-4.5, -22, 9, 14);
  g.fillStyle(dk).fillRect(-9, -26, 18, 6);
  arc(g, 5, gold, -23, -47, 10, Math.PI * 0.45, Math.PI * 1.5);
  arc(g, 5, gold, 23, -47, 10, Math.PI * 1.5, Math.PI * 0.55);
  poly(g, [[-23, -66], [23, -66], ...quad([23, -66], [21, -34], [8, -26], 6), ...quad([-8, -26], [-21, -34], [-23, -66], 6)], gold);
  poly(g, [[-15, -62], [-9, -62], ...quad([-9, -62], [-10, -38], [-2, -30], 5), [-8, -30], [-15, -40]], 0xfff3a0, 0.8);
  const star = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 10, a = -Math.PI / 2 + i * Math.PI / 5; star.push([7 + r * Math.cos(a), -47 + r * Math.sin(a)]); }
  poly(g, star, 0xffffff, 0.9);
}
