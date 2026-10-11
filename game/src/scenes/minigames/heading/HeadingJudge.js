// 판정 로직 (순수 함수, Phaser 의존 없음)
export const PERFECT_MS = 60, GOOD_MS = 150, TOO_EARLY_MS = 400;
const RANK = { perfect: 2, good: 1, miss: 0 };

// err = 누른 시각 - 도착 시각 (ms). 음수 = 일찍 누름
export function judge(err) {
  if (err < -TOO_EARLY_MS) return { grade: 'miss', tooEarly: true };
  const a = Math.abs(err);
  if (a <= PERFECT_MS) return { grade: 'perfect', tooEarly: false };
  if (a <= GOOD_MS) return { grade: 'good', tooEarly: false };
  return { grade: 'miss', tooEarly: false };
}

// a, b: { grade, t } (t = 누른 시각 performance.now, 못 눌렀으면 Infinity)
// 반환: 'a' | 'b' | null (둘 다 Miss → 골 없음)
export function decide(a, b) {
  const ra = RANK[a.grade], rb = RANK[b.grade];
  if (ra === 0 && rb === 0) return null;
  if (ra !== rb) return ra > rb ? 'a' : 'b';
  return a.t <= b.t ? 'a' : 'b';
}

// 종료 판정: 반환 null = 계속, 아니면 'player'|'ai'|'draw'
export function matchResult(goals, round, maxRound = 3, goalsToWin = 2) {
  if (goals.player >= goalsToWin) return 'player';
  if (goals.ai >= goalsToWin) return 'ai';
  if (round >= maxRound) return goals.player === goals.ai ? 'draw' : goals.player > goals.ai ? 'player' : 'ai';
  return null;
}
