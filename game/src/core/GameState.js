import { MAX_TURNS, SIDE } from '../config/constants.js';
import { pickAI } from '../config/characters.js';

// 게임 전체 상태 (씬 간 공유 싱글톤). 점수 변경은 반드시 addScore 로.
class GameStateClass {
  constructor() { this.reset('felipe'); }
  reset(playerId, aiId) {
    this.playerId = playerId;
    this.aiId = aiId || pickAI(playerId);
    this.turn = 1; this.maxTurns = MAX_TURNS;
    this.scores = { player: 0, ai: 0 };
    this.pos = { player: 0, ai: 0 };          // 트랙 칸 인덱스
    this.items = { player: { boots: false }, ai: { boots: false } };  // 스피드 축구화(다음 굴림 1~6)
    this.stats = {
      player: { laps: 0, tackles: 0, tackled: 0, miniWins: 0, shopBuys: 0 },
      ai:     { laps: 0, tackles: 0, tackled: 0, miniWins: 0, shopBuys: 0 },
    };
    this.log = [];
    this.listeners = [];
  }
  charOf(side) { return side === SIDE.PLAYER ? this.playerId : this.aiId; }
  other(side) { return side === SIDE.PLAYER ? SIDE.AI : SIDE.PLAYER; }
  addScore(side, delta, reason = '') {
    const before = this.scores[side];
    this.scores[side] = Math.max(0, before + delta);   // 점수는 0 미만으로 내려가지 않음
    const applied = this.scores[side] - before;        // 실제 반영된 증감(클램프 후)
    this.emit({ type: 'score', side, delta: applied, reason });
    return applied;
  }
  addLog(text) { this.log.push(text); if (this.log.length > 50) this.log.shift(); this.emit({ type: 'log', text }); }
  onChange(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  emit(e) { this.listeners.forEach((f) => f(e)); }
  get winner() {
    if (this.scores.player === this.scores.ai) return 'draw';
    return this.scores.player > this.scores.ai ? SIDE.PLAYER : SIDE.AI;
  }
}
export const GameState = new GameStateClass();
