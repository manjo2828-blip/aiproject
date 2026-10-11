import { RULES, SIDE, MINIGAMES } from '../config/constants.js';
import { TRACK, TRACK_LEN, TILE_TYPES, EVENTS } from '../config/board.js';
import { CHARACTERS, lapBonus, tacklePenalty, rollDice, goodEventChance } from '../config/characters.js';
import { GameState } from '../core/GameState.js';

// 순수 규칙 로직 (Phaser 의존 없음). 모든 함수는 GameState 를 즉시 갱신하고 연출용 이벤트 배열을 반환한다.
const nameOf = (side) => CHARACTERS[GameState.charOf(side)].name;
const log = (t) => GameState.addLog(t);

// 공격자(attacker)가 피해자(victim)에게서 점수를 뺏는다. 실제 이동량 반환.
function doTackle(attacker, victim, at) {
  const pen = tacklePenalty(GameState.charOf(victim));
  const amount = Math.abs(GameState.addScore(victim, -pen, "태클 피격"));
  if (amount > 0) GameState.addScore(attacker, amount, '태클 성공');
  GameState.stats[attacker].tackles++;
  GameState.stats[victim].tackled++;
  log(`${nameOf(attacker)}: 슬라이딩 태클! ${nameOf(victim)}에게서 ${amount}점 뺏음`);
  return { type: 'tackle', attacker, victim, amount, at };
}

export const Rules = {
  rng: Math.random,   // 테스트에서 교체 가능

  rollDice(side) {
    const items = GameState.items[side];
    const usedBoots = !!items.boots;
    const max = usedBoots ? RULES.BOOST_DICE_MAX : RULES.DICE_MAX;
    if (usedBoots) items.boots = false;
    const value = rollDice(GameState.charOf(side), max, Rules.rng);
    log(`${nameOf(side)}: 주사위 ${value}!${usedBoots ? ' (스피드 축구화 사용)' : ''}`);
    return { value, max, usedBoots };
  },

  move(side, dice) {
    const from = GameState.pos[side];
    const path = [];
    let lapped = false;
    for (let i = 1; i <= dice; i++) {
      const idx = (from + i) % TRACK_LEN;
      path.push(idx);
      if (idx === 0) lapped = true;
    }
    const to = path.length ? path[path.length - 1] : from;
    GameState.pos[side] = to;
    const events = [{ type: 'move', side, from, to, path, dice }];
    if (lapped) {
      const bonus = GameState.addScore(side, lapBonus(GameState.charOf(side)), '완주 보너스');
      GameState.stats[side].laps++;
      log(`${nameOf(side)}: 한 바퀴 완주! +${bonus}점`);
      events.push({ type: 'lap', side, bonus });
    }
    const foe = GameState.other(side);
    const foePos = GameState.pos[foe];
    if (foePos !== from && path.includes(foePos)) events.push(doTackle(side, foe, foePos));
    return events;
  },

  landTile(side) {
    const idx = GameState.pos[side];
    const tile = TRACK[idx];
    const nm = nameOf(side);
    const events = [];
    if (tile === 'cheer' || tile === 'yellow') {
      const want = tile === 'cheer' ? RULES.CHEER : RULES.YELLOW;
      const delta = GameState.addScore(side, want, TILE_TYPES[tile].label);
      log(tile === 'cheer' ? `${nm}: 응원석 도착 +${delta}점` : `${nm}: 옐로카드! ${delta}점`);
      events.push({ type: 'tile', side, tile, delta, idx });
    } else if (tile === 'event') {
      const good = Rules.rng() < goodEventChance(GameState.charOf(side));
      const event = good ? (Rules.rng() < 0.5 ? 'swap' : 'extra') : 'tackle';
      log(`${nm}: VAR 찬스! ${EVENTS[event].label}`);
      events.push({ type: 'event', side, event, good });
      const foe = GameState.other(side);
      if (event === 'swap') {
        const a = { side, from: GameState.pos[side], to: GameState.pos[foe] };
        const b = { side: foe, from: GameState.pos[foe], to: GameState.pos[side] };
        GameState.pos[side] = a.to; GameState.pos[foe] = b.to;
        log(`${nm}: ${nameOf(foe)}와 위치를 맞바꿨다`);
        events.push({ type: 'swap', a, b });
      } else if (event === 'extra') {
        events.push({ type: 'extraRoll', side });
      } else {
        events.push(doTackle(foe, side, idx));
      }
    } else if (tile === 'shop') {
      const canBuy = !GameState.items[side].boots && GameState.scores[side] >= RULES.SHOP_PRICE;
      log(`${nm}: 용품점 도착 (스피드 축구화 ${RULES.SHOP_PRICE}점)`);
      events.push({ type: 'shop', side, price: RULES.SHOP_PRICE, canBuy });
    }
    return events;
  },

  buyBoots(side) {
    if (GameState.items[side].boots || GameState.scores[side] < RULES.SHOP_PRICE) return false;
    GameState.addScore(side, -RULES.SHOP_PRICE, '스피드 축구화 구매');
    GameState.items[side].boots = true;
    GameState.stats[side].shopBuys++;
    log(`${nameOf(side)}: 스피드 축구화 구매! -${RULES.SHOP_PRICE}점`);
    return true;
  },

  aiBuyDecision(side) {
    return !GameState.items[side].boots && GameState.scores[side] >= RULES.SHOP_PRICE + 3;
  },

  resolveMinigame(winner) {
    const deltas = { player: 0, ai: 0 };
    if (winner === 'draw') {
      for (const s of [SIDE.PLAYER, SIDE.AI]) deltas[s] = GameState.addScore(s, RULES.MINIGAME_DRAW, '미니게임 무승부');
      log(`미니게임 무승부! 양쪽 +${RULES.MINIGAME_DRAW}점`);
    } else {
      deltas[winner] = GameState.addScore(winner, RULES.MINIGAME_WIN, '미니게임 승리');
      GameState.stats[winner].miniWins++;
      log(`미니게임: ${nameOf(winner)} 승리! +${deltas[winner]}점`);
    }
    return [{ type: 'minigame', winner, deltas }];
  },

  advanceTurn() {
    GameState.turn++;
    const over = GameState.turn > GameState.maxTurns;
    log(over ? '경기 종료!' : `턴 ${GameState.turn}/${GameState.maxTurns} 시작`);
    return { over };
  },

  pickMinigame(prevKey) {
    const pool = MINIGAMES.filter((k) => k !== prevKey);
    return pool[Math.floor(Rules.rng() * pool.length)];
  },

  describe(e) {
    const n = (s) => nameOf(s);
    switch (e.type) {
      case 'move': return `${n(e.side)}: ${e.dice}칸 이동`;
      case 'lap': return `${n(e.side)}: 한 바퀴 완주! +${e.bonus}점`;
      case 'tackle': return `${n(e.attacker)}의 슬라이딩 태클! ${n(e.victim)}에게서 ${e.amount}점 획득`;
      case 'tile': return e.tile === 'cheer'
        ? `${n(e.side)}: 응원석 도착 +${e.delta}점` : `${n(e.side)}: 옐로카드! ${e.delta}점`;
      case 'event': return `${n(e.side)}: VAR 찬스 - ${EVENTS[e.event].label}${e.good ? '!' : '...'}`;
      case 'swap': return `${n(e.a.side)}와 ${n(e.b.side)}의 위치가 바뀌었다`;
      case 'extraRoll': return `${n(e.side)}: 주사위 한 번 더!`;
      case 'shop': return `${n(e.side)}: 용품점 - 스피드 축구화 ${e.price}점${e.canBuy ? '' : ' (구매 불가)'}`;
      case 'minigame': return e.winner === 'draw'
        ? `미니게임 무승부! 양쪽 +${e.deltas.player}점` : `미니게임 ${n(e.winner)} 승리! +${e.deltas[e.winner]}점`;
      default: return '';
    }
  },
};
