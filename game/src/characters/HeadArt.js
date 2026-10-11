import { shade, poly, quad, arcPts, line, arc } from './artUtil.js';

// 머리 그리기. 원점 = 얼굴 중심, 얼굴 92x86. expr: normal | happy | cheer | sad | blink
const INK = 0x2a1a1a, MOUTH = 0x8b1a2b;

function hairBack(g, c, o) {
  const hc = c.hair.color;
  if (c.hair.style === 'bob') {
    g.fillStyle(hc).fillRoundedRect(-53, -46, 106, 88, 28);
    g.fillStyle(shade(hc, -18)).fillRoundedRect(-53, 28, 106, 14, { tl: 0, tr: 0, bl: 18, br: 18 });
  } else if (c.hair.style === 'ponytail' && !o.noTail) {
    const tail = [[30, -36], ...quad([30, -36], [86, -52], [78, -2], 8), ...quad([78, -2], [76, 36], [60, 56], 6),
      ...quad([60, 56], [52, 24], [40, -6], 6)];
    poly(g, tail, shade(c.hair.color, -8));
    poly(g, [[44, -22], ...quad([44, -22], [70, -20], [68, 10], 6), ...quad([68, 10], [66, 34], [58, 46], 4)], shade(hc, 14), 0.5);
  }
}

function hairFront(g, c) {
  const hc = c.hair.color, hl = shade(hc, 22), st = c.hair.style;
  if (st === 'short') {
    const edge = [[50, -2], [45, -10], [37, -27], [26, -20], [15, -31], [3, -22], [-9, -32], [-21, -22], [-33, -28], [-44, -12], [-50, -2]];
    poly(g, [...arcPts(0, -2, 51, 48, Math.PI, Math.PI * 2, 20), ...edge], hc);
    poly(g, [[-14, -50], [-4, -60], [6, -50]], hc); poly(g, [[8, -49], [20, -58], [28, -46]], hc); poly(g, [[-30, -42], [-24, -55], [-12, -48]], hc);
    arc(g, 4, hl, 0, -4, 40, Math.PI * 1.18, Math.PI * 1.42, 0.8);
  } else if (st === 'dandy') {
    const edge = [[50, -4], [49, 12], [43, 12], [42, -12], [30, -27], [8, -33], [-14, -27], [-30, -19], [-42, -13], [-43, 12], [-49, 12], [-51, -4]];
    poly(g, [...arcPts(-1, -5, 52, 49, Math.PI, Math.PI * 2, 20), ...edge], hc);
    poly(g, [...quad([-34, -34], [-4, -78], [44, -40], 10), [30, -30], [-20, -26]], hc);   // 올려 빗은 앞머리 볼륨
    arc(g, 4, hl, 4, -8, 44, Math.PI * 1.25, Math.PI * 1.62, 0.8);
    line(g, 3, shade(hc, 12), -26, -26, 18, -40, 0.7);
  } else if (st === 'bob') {
    const edge = [[51, -2], [49, 30], [41, 36], [36, 28], [36, -4], [30, -13], [16, -19], [0, -21], [-16, -19], [-30, -13], [-36, -4], [-36, 28], [-41, 36], [-49, 30], [-51, -2]];
    poly(g, [...arcPts(0, -2, 51, 49, Math.PI, Math.PI * 2, 20), ...edge], hc);
    arc(g, 4, hl, 0, -4, 42, Math.PI * 1.15, Math.PI * 1.4, 0.8);
    line(g, 3, shade(hc, 14), 44, 8, 44, 26, 0.6);
  } else { // ponytail
    const edge = [[50, -2], [46, -12], [34, -24], [16, -27], [-4, -21], [-22, -12], [-36, -2], [-37, 18], [-42, 25], [-48, 18], [-51, -2]];
    poly(g, [...arcPts(0, -3, 51, 49, Math.PI, Math.PI * 2, 20), ...edge], hc);
    poly(g, [[46, -4], [44, 18], [39, 14], [40, -8]], hc);
    arc(g, 4, hl, 0, -4, 41, Math.PI * 1.15, Math.PI * 1.4, 0.8);
    g.fillStyle(0xffffff).fillCircle(36, -30, 6).fillStyle(0xff6f91).fillCircle(36, -30, 3.4);
  }
}

function eye(g, x, expr, female) {
  if (expr === 'happy' || expr === 'cheer') { arc(g, 4.5, INK, x, 9, 8, Math.PI * 1.08, Math.PI * 1.92); return; }
  if (expr === 'blink') { line(g, 4, INK, x - 8, 8, x + 8, 8); return; }
  const y = expr === 'sad' ? 8 : 5;
  g.fillStyle(0xffffff).fillEllipse(x, y, 19, 23);
  g.fillStyle(INK).fillEllipse(x, y + 1, 14, 18);
  g.fillStyle(0x5a3a2a).fillEllipse(x, y + 4, 10, 8);
  g.fillStyle(0xffffff).fillCircle(x + 3, y - 3, 3.6).fillCircle(x - 2.5, y + 5, 1.7);
  if (female) { line(g, 3.2, INK, x + Math.sign(x) * 8, y - 8, x + Math.sign(x) * 13, y - 12); }
  if (expr === 'sad') { g.fillStyle(0x7fd0ff, 0.9).fillEllipse(x + Math.sign(x) * 6, y + 17, 6, 10); }
}

function face(g, c, expr) {
  const female = c.gender === 'f', bc = shade(c.hair.color, -35);
  g.fillStyle(0xff7a8a, 0.4).fillEllipse(-29, 17, 15, 9).fillEllipse(29, 17, 15, 9);
  eye(g, -17, expr, female); eye(g, 17, expr, female);
  const sad = expr === 'sad', up = expr === 'happy' || expr === 'cheer';
  const by = sad ? 0 : up ? -4 : 0;
  for (const s of [-1, 1]) {
    const o = [s * 27, -14 + by + (sad ? 3 : 0)], i = [s * 9, -16 + by - (sad ? 4 : 0)];
    line(g, 4.5, bc, o[0], o[1], i[0], i[1]);
  }
  g.fillStyle(shade(c.skin, -22), 0.9).fillCircle(0, 17, 2.4);
  if (expr === 'cheer' || expr === 'happy') {
    g.fillStyle(MOUTH).beginPath().arc(0, 22, 12, 0, Math.PI, false).closePath().fillPath();
    g.fillStyle(0xffffff).fillRect(-9, 22, 18, 4);
    g.fillStyle(0xff7a8a).fillEllipse(0, 31, 12, 7);
  } else if (sad) arc(g, 3.4, MOUTH, 0, 38, 9, Math.PI * 1.15, Math.PI * 1.85);
  else arc(g, 3.4, MOUTH, 0, 20, 9, Math.PI * 0.15, Math.PI * 0.85);
}

export function drawHead(g, c, expr = 'normal', o = {}) {
  hairBack(g, c, o);
  g.fillStyle(c.skin).fillCircle(-46, 6, 8).fillCircle(46, 6, 8);
  g.fillStyle(shade(c.skin, -14), 0.8).fillCircle(-46, 6, 4).fillCircle(46, 6, 4);
  g.fillStyle(c.skin).fillEllipse(0, 0, 92, 86);
  g.fillStyle(shade(c.skin, -10), 0.35).fillEllipse(0, 34, 60, 14);
  face(g, c, expr);
  hairFront(g, c);
}
