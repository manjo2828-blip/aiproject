// PK 판정/AI (순수 로직)
const pick = (weights) => { let r = Math.random() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i - 1; } return 1; };
export const aiKeeperDir = () => pick([1, 1, 1]);
export const aiShot = () => ({ dir: pick([0.38, 0.24, 0.38]), wide: Math.random() < 0.15 });

// 플레이어 공격 판정. zone: 'perfect'|'good'|'bad'
export function resolveAttack(dir, keeperDir, zone, rng = Math.random) {
  if (zone === 'bad' && rng() < 0.8) return rng() < 0.5 ? 'over' : 'weak';   // 크게 뜨거나 약한 슛(키퍼가 잡음)
  if (keeperDir === dir) return 'save';
  if (zone === 'good' && rng() < 0.35) return 'post';
  return 'goal';
}
// AI 공격(플레이어 키퍼) 판정
export function resolveDefense(shot, guess) {
  if (shot.wide) return 'over';
  return shot.dir === guess ? 'save' : 'goal';
}
export const zoneOf = (p) => { const d = Math.abs(p - 0.5); return d <= 0.12 ? 'perfect' : d <= 0.30 ? 'good' : 'bad'; };
