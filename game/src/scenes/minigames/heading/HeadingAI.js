// AI 타이밍: 사람 같은 가우시안 지터 + 가끔 크게 빗나감 (순수 함수)
export const AI_SD = 80, AI_BIAS = 12, AI_BIG_CHANCE = 0.12;
export function gauss(rng = Math.random) {
  let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// 도착 시각 기준 오차(ms)
export function aiPressError(rng = Math.random) {
  if (rng() < AI_BIG_CHANCE) return (rng() < 0.5 ? -1 : 1) * (170 + rng() * 100);
  return AI_BIAS + gauss(rng) * AI_SD;
}
