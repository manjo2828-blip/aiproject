// 캐릭터 그리기 공용 유틸
export const shade = (color, amt) => {
  const c = Phaser.Display.Color.ValueToColor(color);
  return (amt >= 0 ? c.lighten(amt) : c.darken(-amt)).color;
};

// 다각형 채우기 (pts = [[x,y],...])
export function poly(g, pts, color, alpha = 1) {
  g.fillStyle(color, alpha).beginPath().moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath().fillPath();
}

// 2차 베지어 곡선 점 목록
export function quad(p0, p1, p2, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

// 타원 호의 점들 (cx,cy,rx,ry, a0→a1 라디안)
export function arcPts(cx, cy, rx, ry, a0, a1, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return out;
}

export function line(g, w, color, x1, y1, x2, y2, alpha = 1) {
  g.lineStyle(w, color, alpha).beginPath().moveTo(x1, y1).lineTo(x2, y2).strokePath();
}
export function arc(g, w, color, x, y, r, a0, a1, alpha = 1) {
  g.lineStyle(w, color, alpha).beginPath().arc(x, y, r, a0, a1, false).strokePath();
}

// 유니폼 번호/글자색
export const NUMBERS = { felipe: 10, jun: 7, chloe: 9, camila: 11 };
export const NUM_COLORS = { felipe: '#1b4fb3', jun: '#ffffff', chloe: '#ffffff', camila: '#1c3f66' };
