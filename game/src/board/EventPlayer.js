import { W, SIDE } from '../config/constants.js';
import { CHARACTERS, moveSpeedMul } from '../config/characters.js';
import { EVENTS } from '../config/board.js';
import { GameState } from '../core/GameState.js';
import { SFX } from '../core/SoundFX.js';
import { txt } from '../ui/Button.js';
import { Rules } from './Rules.js';
import { tileCenter } from './BoardLayout.js';
import { askShop } from './ShopDialog.js';
import { wait, tw } from './Fx.js';

const nm = (side) => CHARACTERS[GameState.charOf(side)].name;
const cid = (side) => GameState.charOf(side);
const sgn = (n) => (n > 0 ? '+' : '') + n;

// Rules 가 돌려준 이벤트 배열을 애니메이션으로 재생한다. play() 는 { extra } 를 반환.
export class EventPlayer {
  constructor(scene, { tokens, hud, fx, board, auto = false }) {
    Object.assign(this, { s: scene, tokens, hud, fx, board, auto });
  }
  at(side) { const r = this.tokens.root(side); return { x: r.x, y: r.y }; }

  async play(events) {
    const done = new Set(); const out = { extra: false };
    for (const e of events) {
      if (done.has(e)) continue;
      switch (e.type) {
        case 'move': {
          const lap = events.find((x) => x.type === 'lap' && x.side === e.side && !done.has(x));
          const tk = events.find((x) => x.type === 'tackle' && x.attacker === e.side && !done.has(x));
          if (lap) done.add(lap);
          if (tk) done.add(tk);
          await this.move(e, lap, tk); break;
        }
        case 'lap': await this.lap(e); break;
        case 'tackle': await this.tackle(e); break;
        case 'tile': await this.tile(e); break;
        case 'event': await this.varCard(e); break;
        case 'swap': await this.swap(e); break;
        case 'extraRoll': out.extra = true; break;
        case 'shop': await this.shop(e); break;
        case 'minigame': await this.minigame(e); break;
        default: break;
      }
    }
    this.hud.refresh();
    return out;
  }

  async move(e, lap, tk) {
    const mul = moveSpeedMul(cid(e.side));
    if (mul > 1 && e.dice > 0) { const p = this.at(e.side); this.fx.tag(p.x, p.y - 70, '음바페급 치달!', 0x40c4ff); }
    for (const idx of e.path) {
      SFX.play('step');
      await this.tokens.step(e.side, idx, mul);
      if (lap && idx === 0) await this.lap(lap);
      if (tk && idx === tk.at) await this.tackle(tk);
    }
    await this.tokens.settle();
  }

  async lap(e) {
    const p = this.at(e.side);
    this.fx.confetti(p.x, p.y);
    this.hud.addScore(e.side, e.bonus);
    if (cid(e.side) === 'felipe') { SFX.play('samba'); this.fx.tag(p.x, p.y - 70, '삼바 세레머니 발동!', 0xffd700); }
    await this.fx.banner(`한 바퀴 완주! +${e.bonus}`, { color: '#ffd700', sub: `${nm(e.side)} 완주 보너스`, sfx: 'lap', hold: 700, size: 60 });
  }

  async tackle(e) {
    const { attacker, victim } = e;
    this.fx.flashScreen(0xffeb3b, 0.3, 300);
    await this.fx.banner('태클 찬스!', { color: '#ffeb3b', sfx: 'tackleChance', hold: 280, size: 60, band: 0x8b0000, y: 300 });
    const sl = await this.tokens.slide(attacker, victim);
    SFX.play('tackle');
    this.s.cameras.main.shake(260, 0.012);
    this.tokens.hitReact(victim);
    const vp = this.at(victim);
    if (cid(victim) === 'jun') this.fx.tag(vp.x, vp.y - 90, '수호신 태클 발동! -1 방어', 0x69f0ae);
    this.fx.banner('SLIDING TACKLE!', { color: '#ffffff', sfx: null, hold: 450, size: 58, band: 0xb71c1c, y: 300 });
    this.hud.addScore(victim, -e.amount); this.hud.addScore(attacker, e.amount);
    const ap = this.at(attacker);
    if (e.amount > 0) {
      this.fx.float(vp.x + 30, vp.y - 10, `-${e.amount}`, { color: '#ff8a8a', size: 40, delay: 100 });
      this.fx.float(ap.x - 10, ap.y - 20, `+${e.amount}`, { color: '#9cff9c', size: 40, delay: 100 });
    } else this.fx.float(vp.x, vp.y - 10, '뺏을 점수가 없어요', { color: '#ffffff', size: 26, delay: 100 });
    await wait(this.s, 950);
    await sl.done();
    await this.tokens.settle();
  }

  async tile(e) {
    const p = this.at(e.side), c = tileCenter(e.idx);
    this.board.pulseTile(e.idx);
    if (e.tile === 'cheer') { SFX.play('cheer'); this.fx.float(p.x, p.y - 40, `응원석! ${sgn(e.delta)}`, { color: '#9cff9c', size: 38 }); this.fx.confetti(c.x, c.y - 30, 14); }
    else { SFX.play('yellow'); this.fx.yellowCard(c.x + 20, c.y - 10); this.fx.float(p.x, p.y - 40, `옐로카드! ${sgn(e.delta)}`, { color: '#ff8a8a', size: 38 }); }
    this.hud.addScore(e.side, e.delta);
    await wait(this.s, 1100);
  }

  // VAR 판독 카드
  async varCard(e) {
    const s = this.s, info = EVENTS[e.event];
    SFX.play('event');
    const col = e.good ? 0xf9a825 : 0xc62828;
    const c = s.add.container(W / 2, 290).setDepth(520).setScale(0.3).setAlpha(0);
    const g = s.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-230 + 4, -120 + 8, 460, 240, 24);
    g.fillStyle(0x1a1a1a, 1).fillRoundedRect(-230, -120, 460, 240, 24).lineStyle(6, col, 1).strokeRoundedRect(-230, -120, 460, 240, 24);
    g.fillStyle(col, 1).fillRoundedRect(-230, -120, 460, 62, { tl: 24, tr: 24, bl: 0, br: 0 });
    c.add(g);
    c.add(txt(s, 0, -89, `VAR 판독! (${nm(e.side)})`, 32, e.good ? '#1a1a1a' : '#ffffff', { stroke: '#00000000', strokeThickness: 0 }));
    const ico = { swap: 'icon_arrow_reserve', extra: 'icon_dice_6', tackle: 'icon_sword' }[e.event];
    c.add(s.add.image(-150, 15, ico).setDisplaySize(84, 84).setTint(col));
    c.add(txt(s, -90, -2, info.label + (e.good ? '!' : '...'), 36, e.good ? '#ffd54f' : '#ff8a80').setOrigin(0, 0.5));
    c.add(txt(s, -90, 44, info.desc, 21, '#ffffff').setOrigin(0, 0.5));
    c.add(txt(s, 0, 92, e.good ? '좋은 판정!' : '나쁜 판정...', 22, e.good ? '#9cff9c' : '#ff8a8a'));
    await tw(s, { targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.Out' });
    if (e.good && cid(e.side) === 'camila') this.fx.tag(W / 2, 140, '마법의 패스 발동!', 0x87ceeb);
    await wait(s, 1300);
    await tw(s, { targets: c, alpha: 0, scale: 0.8, duration: 220 });
    c.destroy();
  }

  async swap(e) {
    SFX.play('swap');
    this.fx.float(W / 2, 300, '위치 교환!', { color: '#80d8ff', size: 44 });
    await this.tokens.swap(e.a, e.b);
    await this.tokens.settle();
    await wait(this.s, 250);
  }

  async shop(e) {
    SFX.play('shop');
    const side = e.side, p = this.at(side);
    if (side === SIDE.PLAYER) {
      const buy = await askShop(this.s, { price: e.price, canBuy: e.canBuy, score: GameState.scores.player, owned: GameState.items.player.boots, auto: this.auto });
      if (buy && Rules.buyBoots(side)) await this.bought(side, e.price);
      else this.fx.float(p.x, p.y - 40, '패스', { color: '#ffffff', size: 30 });
      return;
    }
    await wait(this.s, 500);
    if (Rules.aiBuyDecision(side) && Rules.buyBoots(side)) await this.bought(side, e.price);
    else { this.fx.float(p.x, p.y - 40, `${nm(side)}: 구매 안 함`, { color: '#ffffff', size: 28 }); await wait(this.s, 700); }
  }

  async bought(side, price) {
    const p = this.at(side);
    SFX.play('coin'); this.hud.addScore(side, -price); this.hud.refresh();
    this.fx.confetti(p.x, p.y, 16);
    await this.fx.banner(`${nm(side)} 스피드 축구화 구매!`, { color: '#ffb74d', sub: '다음 주사위 1~6', sfx: 'gain', hold: 700, size: 48 });
  }

  async minigame(e) {
    const draw = e.winner === 'draw';
    for (const sd of [SIDE.PLAYER, SIDE.AI]) if (e.deltas[sd]) this.hud.addScore(sd, e.deltas[sd]);
    const t = draw ? '무승부! 양쪽 +2' : `${nm(e.winner)} 승리! +${e.deltas[e.winner]}`;
    await this.fx.banner(t, { color: draw ? '#ffffff' : e.winner === SIDE.PLAYER ? '#ffd700' : '#ff9e9e', sfx: null, hold: 800, size: 54 });
  }
}
