import assert from 'node:assert/strict';
const { Rules } = await import('../src/board/Rules.js');
const { GameState: G } = await import('../src/core/GameState.js');
const { MINIGAMES } = await import('../src/config/constants.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const fresh = (p = 'jun', a = 'chloe') => { G.reset(p, a); Rules.rng = Math.random; };
const seq = (...v) => { let i = 0; Rules.rng = () => v[Math.min(i++, v.length - 1)]; };
const of = (evs, type) => evs.filter((e) => e.type === type);

t('basic move + path', () => {
  fresh(); G.pos.player = 2; G.pos.ai = 7;
  const ev = Rules.move('player', 3);
  assert.deepEqual(ev[0], { type: 'move', side: 'player', from: 2, to: 5, path: [3, 4, 5], dice: 3 });
  assert.equal(G.pos.player, 5); assert.equal(ev.length, 1);
});
t('lap bonus +10 passing 0', () => {
  fresh('jun', 'chloe'); G.pos.player = 7; G.pos.ai = 4;
  const ev = Rules.move('player', 2);
  assert.deepEqual(ev[0].path, [0, 1]);
  assert.deepEqual(of(ev, 'lap'), [{ type: 'lap', side: 'player', bonus: 10 }]);
  assert.equal(G.scores.player, 10); assert.equal(G.stats.player.laps, 1);
});
t('felipe lap +12', () => {
  fresh('felipe', 'chloe'); G.pos.player = 6; G.pos.ai = 3;
  Rules.move('player', 3);
  assert.equal(G.scores.player, 12);
});
t('landing exactly on 0 gives lap', () => {
  fresh(); G.pos.player = 6; G.pos.ai = 3;
  const ev = Rules.move('player', 2);
  assert.equal(G.pos.player, 0); assert.equal(of(ev, 'lap').length, 1);
});
t('no lap when not crossing', () => {
  fresh(); G.pos.player = 0; G.pos.ai = 4;
  assert.equal(of(Rules.move('player', 3), 'lap').length, 0);
});
t('tackle by passing', () => {
  fresh('felipe', 'chloe'); G.pos.player = 0; G.pos.ai = 2; G.scores.ai = 10;
  const ev = Rules.move('player', 3);
  assert.deepEqual(of(ev, 'tackle')[0], { type: 'tackle', attacker: 'player', victim: 'ai', amount: 3, at: 2 });
  assert.equal(G.scores.ai, 7); assert.equal(G.scores.player, 3);
  assert.equal(G.stats.player.tackles, 1); assert.equal(G.stats.ai.tackled, 1);
});
t('tackle by landing', () => {
  fresh('felipe', 'chloe'); G.pos.player = 0; G.pos.ai = 3; G.scores.ai = 5;
  const ev = Rules.move('player', 3);
  assert.equal(of(ev, 'tackle')[0].amount, 3);
});
t('jun tackled loses only 2', () => {
  fresh('felipe', 'jun'); G.pos.player = 0; G.pos.ai = 2; G.scores.ai = 10;
  const ev = Rules.move('player', 2);
  assert.equal(of(ev, 'tackle')[0].amount, 2);
  assert.equal(G.scores.ai, 8); assert.equal(G.scores.player, 2);
});
t('no tackle from same start tile', () => {
  fresh(); G.pos.player = 0; G.pos.ai = 0; G.scores.ai = 10;
  assert.equal(of(Rules.move('player', 3), 'tackle').length, 0);
  assert.equal(G.scores.ai, 10);
});
t('no tackle when opponent behind / not on path', () => {
  fresh(); G.pos.player = 3; G.pos.ai = 2; G.scores.ai = 9;
  assert.equal(of(Rules.move('player', 3), 'tackle').length, 0);
});
t('tackle clamped by victim score', () => {
  fresh('felipe', 'chloe'); G.pos.player = 0; G.pos.ai = 1; G.scores.ai = 1;
  const tk = of(Rules.move('player', 1), 'tackle')[0];
  assert.equal(tk.amount, 1); assert.equal(G.scores.ai, 0); assert.equal(G.scores.player, 1);
});
t('tackle with 0 score victim -> amount 0', () => {
  fresh('felipe', 'chloe'); G.pos.player = 0; G.pos.ai = 1;
  const tk = of(Rules.move('player', 2), 'tackle')[0];
  assert.equal(tk.amount, 0); assert.equal(G.scores.player, 0);
});
t('lap + tackle same move, tackle at most once', () => {
  fresh('jun', 'chloe'); G.pos.player = 7; G.pos.ai = 1; G.scores.ai = 10;
  const ev = Rules.move('player', 3);
  assert.equal(of(ev, 'tackle').length, 1); assert.equal(of(ev, 'lap').length, 1);
  assert.equal(G.scores.player, 13);
});
t('boots: 1~6, consumed', () => {
  fresh(); G.items.player.boots = true;
  const seen = new Set();
  let r = Rules.rollDice('player');
  assert.equal(r.usedBoots, true); assert.equal(r.max, 6); assert.equal(G.items.player.boots, false);
  seen.add(r.value);
  for (let i = 0; i < 3000; i++) {
    G.items.player.boots = true; r = Rules.rollDice('player');
    assert.ok(r.value >= 1 && r.value <= 6); seen.add(r.value);
  }
  assert.equal(seen.size, 6);
  r = Rules.rollDice('player');
  assert.equal(r.usedBoots, false); assert.equal(r.max, 3); assert.ok(r.value <= 3);
});
t('chloe dice-1 less frequent', () => {
  fresh(); let c = 0, b = 0;
  for (let i = 0; i < 20000; i++) {
    if (Rules.rollDice('ai').value === 1) c++;   // chloe
    if (Rules.rollDice('player').value === 1) b++; // jun
  }
  console.log('   chloe 1s:', c, 'jun 1s:', b);
  assert.ok(c < b * 0.8);
});
t('camila good event chance higher', () => {
  const run = (p) => {
    let good = 0; const N = 6000;
    for (let i = 0; i < N; i++) {
      fresh(p, p === 'camila' ? 'jun' : 'felipe'); G.pos.player = 2; G.pos.ai = 5; G.scores.player = 5;
      const ev = Rules.landTile('player'); if (of(ev, 'event')[0].good) good++;
    }
    return good / N;
  };
  const cam = run('camila'), base = run('felipe');
  console.log('   camila', cam.toFixed(3), 'base', base.toFixed(3));
  assert.ok(cam > base + 0.1);
});
t('cheer +3 / yellow -2 (clamped)', () => {
  fresh(); G.pos.player = 3;
  let ev = Rules.landTile('player');
  assert.deepEqual(ev, [{ type: 'tile', side: 'player', tile: 'cheer', delta: 3, idx: 3 }]);
  G.pos.player = 1; ev = Rules.landTile('player');
  assert.equal(ev[0].delta, -2); assert.equal(G.scores.player, 1);
  ev = Rules.landTile('player'); assert.equal(ev[0].delta, -1); assert.equal(G.scores.player, 0);
});
t('event swap', () => {
  fresh(); G.pos.player = 2; G.pos.ai = 5; seq(0.0, 0.1);
  const ev = Rules.landTile('player');
  assert.deepEqual(ev[0], { type: 'event', side: 'player', event: 'swap', good: true });
  assert.deepEqual(ev[1], { type: 'swap', a: { side: 'player', from: 2, to: 5 }, b: { side: 'ai', from: 5, to: 2 } });
  assert.equal(G.pos.player, 5); assert.equal(G.pos.ai, 2);
});
t('event extra', () => {
  fresh(); G.pos.player = 2; seq(0.0, 0.9);
  const ev = Rules.landTile('player');
  assert.deepEqual(ev, [{ type: 'event', side: 'player', event: 'extra', good: true }, { type: 'extraRoll', side: 'player' }]);
});
t('event tackle: other steals from side', () => {
  fresh('felipe', 'jun'); G.pos.player = 6; G.pos.ai = 1; G.scores.player = 8; seq(0.99);
  const ev = Rules.landTile('player');
  assert.deepEqual(ev[0], { type: 'event', side: 'player', event: 'tackle', good: false });
  assert.deepEqual(ev[1], { type: 'tackle', attacker: 'ai', victim: 'player', amount: 3, at: 6 });
  assert.equal(G.scores.player, 5); assert.equal(G.scores.ai, 3);
});
t('event tackle on jun = 2', () => {
  fresh('jun', 'felipe'); G.pos.player = 2; G.scores.player = 8; seq(0.99);
  const ev = Rules.landTile('player'); assert.equal(ev[1].amount, 2);
});
t('shop buy / cannot afford / already owned', () => {
  fresh(); G.pos.player = 4;
  let ev = Rules.landTile('player');
  assert.deepEqual(ev, [{ type: 'shop', side: 'player', price: 4, canBuy: false }]);
  assert.equal(Rules.buyBoots('player'), false);
  G.scores.player = 6; ev = Rules.landTile('player'); assert.equal(ev[0].canBuy, true);
  assert.equal(Rules.buyBoots('player'), true);
  assert.equal(G.scores.player, 2); assert.equal(G.items.player.boots, true); assert.equal(G.stats.player.shopBuys, 1);
  G.scores.player = 20; assert.equal(Rules.buyBoots('player'), false);
  assert.equal(Rules.landTile('player')[0].canBuy, false);
});
t('aiBuyDecision', () => {
  fresh(); G.scores.ai = 6; assert.equal(Rules.aiBuyDecision('ai'), false);
  G.scores.ai = 7; assert.equal(Rules.aiBuyDecision('ai'), true);
  G.items.ai.boots = true; assert.equal(Rules.aiBuyDecision('ai'), false);
});
t('minigame +5 / draw +2', () => {
  fresh();
  assert.deepEqual(Rules.resolveMinigame('player'), [{ type: 'minigame', winner: 'player', deltas: { player: 5, ai: 0 } }]);
  assert.equal(G.stats.player.miniWins, 1);
  Rules.resolveMinigame('ai'); assert.equal(G.scores.ai, 5); assert.equal(G.stats.ai.miniWins, 1);
  const ev = Rules.resolveMinigame('draw');
  assert.deepEqual(ev[0].deltas, { player: 2, ai: 2 }); assert.equal(G.scores.player, 7);
  assert.equal(G.stats.player.miniWins, 1);
});
t('advanceTurn / pickMinigame', () => {
  fresh();
  for (let i = 1; i <= 4; i++) assert.equal(Rules.advanceTurn().over, false);
  assert.equal(G.turn, 5); assert.equal(Rules.advanceTurn().over, true);
  let prev = null;
  for (let i = 0; i < 500; i++) {
    const k = Rules.pickMinigame(prev); assert.ok(MINIGAMES.includes(k)); assert.notEqual(k, prev); prev = k;
  }
  assert.ok(MINIGAMES.includes(Rules.pickMinigame(undefined)));
});
t('describe + logs', () => {
  fresh('felipe', 'jun'); G.pos.player = 2; G.pos.ai = 1;
  const evs = [...Rules.move('player', 1), ...Rules.landTile('player'), ...Rules.resolveMinigame('draw')];
  for (const e of evs) assert.equal(typeof Rules.describe(e), 'string');
  assert.ok(G.log.length > 0);
  assert.ok(G.log.some((l) => l.includes('펠리페')));
});
t('5-turn random simulations stay valid', () => {
  for (let g = 0; g < 500; g++) {
    const ids = ['felipe', 'jun', 'chloe', 'camila'];
    const p = ids[g % 4], a = ids[(g + 1 + (g % 3)) % 4]; fresh(p, a);
    let prev = null, over = false;
    const check = () => {
      for (const s of ['player', 'ai']) {
        assert.ok(Number.isInteger(G.scores[s]) && G.scores[s] >= 0, 'score ' + G.scores[s]);
        assert.ok(Number.isInteger(G.pos[s]) && G.pos[s] >= 0 && G.pos[s] < 8, 'pos ' + G.pos[s]);
      }
    };
    while (!over) {
      for (const side of ['player', 'ai']) {
        let rolls = 0, again = true;
        while (again && rolls++ < 10) {
          again = false;
          const d = Rules.rollDice(side); Rules.move(side, d.value); check();
          const ev = Rules.landTile(side); check();
          if (ev.some((e) => e.type === 'extraRoll')) again = true;
          const sh = ev.find((e) => e.type === 'shop');
          if (sh && Math.random() < 0.5) Rules.buyBoots(side);
          check();
        }
      }
      prev = Rules.pickMinigame(prev);
      Rules.resolveMinigame(['player', 'ai', 'draw'][Math.floor(Math.random() * 3)]); check();
      over = Rules.advanceTurn().over;
    }
    assert.equal(G.turn, 6);
  }
});
console.log(`\nALL ${n} TESTS PASSED`);
