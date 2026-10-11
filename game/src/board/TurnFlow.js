import { SCENES, SIDE } from '../config/constants.js';
import { CHARACTERS } from '../config/characters.js';
import { GameState } from '../core/GameState.js';
import { SFX } from '../core/SoundFX.js';
import { Rules } from './Rules.js';
import { wait } from './Fx.js';

const nm = (side) => CHARACTERS[GameState.charOf(side)].name;

// 턴 진행 상태기계 (async/await). 플레이어 굴림 → AI 굴림 → 미니게임 → 다음 턴.
export class TurnFlow {
  constructor(scene, { tokens, hud, fx, panel, player, opts }) {
    Object.assign(this, { s: scene, tokens, hud, fx, panel, ep: player, opts });
    this.prevMini = null;
  }

  async run() {
    const s = this.s;
    for (;;) {
      this.hud.setTurn(GameState.turn);
      await this.fx.banner(`턴 ${GameState.turn} 시작`, { sfx: 'whistle', hold: 350, size: 60, sub: `${GameState.turn}/${GameState.maxTurns}` });
      await this.sideTurn(SIDE.PLAYER);
      await this.sideTurn(SIDE.AI);
      await this.minigamePhase();
      const { over } = Rules.advanceTurn();
      this.hud.sync();
      if (over) break;
    }
    SFX.bgm.stop();
    await this.fx.banner('경기 종료!', { color: '#ffffff', sfx: 'whistleLong', hold: 800, size: 72 });
    s.scene.start(SCENES.RESULT);
  }

  async sideTurn(side) {
    const isP = side === SIDE.PLAYER, panel = this.panel;
    panel.setTurnCaption(isP ? '내 차례! 주사위를 굴려요' : `${nm(side)}(AI) 차례...`);
    if (isP) await panel.waitRoll(this.opts.auto);
    else await wait(this.s, 900);
    for (let rolls = 0; rolls < 4; rolls++) {
      const r = Rules.rollDice(side);
      this.hud.refresh();
      await panel.dice.roll(r.value, r.max, r.usedBoots);
      await wait(this.s, 150);
      await this.ep.play(Rules.move(side, r.value));
      const res = await this.ep.play(Rules.landTile(side));
      this.hud.sync();
      if (!res.extra) break;
      await this.fx.banner('주사위 한 번 더!', { color: '#80d8ff', sfx: 'good', hold: 350, size: 54 });
    }
    panel.dice.idle();
    await wait(this.s, 350);
  }

  async minigamePhase() {
    const s = this.s;
    this.panel.setTurnCaption('미니게임 시간!');
    await this.fx.banner('미니게임 페이즈!', { color: '#69f0ae', sfx: 'whistle', hold: 650, size: 64 });
    const key = Rules.pickMinigame(this.prevMini); this.prevMini = key;
    let result;
    if (this.opts.skipMini) {
      const w = ['player', 'ai', 'player', 'ai', 'draw'][Math.floor(Math.random() * 5)];
      result = { winner: w, detail: 'skip' };
    } else {
      result = await new Promise((res) => {
        s.scene.launch(key, { playerId: GameState.playerId, aiId: GameState.aiId, onDone: (r) => { s.scene.wake(); res(r); } });
        s.scene.sleep();
      });
      SFX.bgm.start('board');
      await wait(s, 300);
    }
    await this.ep.play(Rules.resolveMinigame(result.winner));
    this.hud.sync();
    await wait(s, 300);
  }
}
