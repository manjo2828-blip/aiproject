import { W, FONT, SIDE } from '../config/constants.js';
import { CHARACTERS } from '../config/characters.js';
import { GameState } from '../core/GameState.js';
import { SFX } from '../core/SoundFX.js';
import { txt } from './Button.js';
import { bake } from '../board/Bake.js';

const CARD_W = 340, CARD_H = 76;

// 상단 HUD: 플레이어 카드 / 턴 표시 / AI 카드 / 음소거. 표시 점수(shown)는 연출과 동기화되도록 수동 갱신.
export class HUD {
  constructor(scene, fx) {
    this.s = scene; this.fx = fx;
    scene.add.rectangle(W / 2, 46, W, 92, 0x0d2410, 0.92).setDepth(300);
    scene.add.rectangle(W / 2, 92, W, 4, 0xffffff, 0.35).setDepth(300);
    this.shown = { player: GameState.scores.player, ai: GameState.scores.ai };
    this.cards = {};
    this.cards.player = this.card(SIDE.PLAYER, 10 + CARD_W / 2, 46);
    this.cards.ai = this.card(SIDE.AI, W - 70 - CARD_W / 2, 46);
    this.turnTxt = txt(scene, W / 2, 33, '', 42, '#ffffff').setDepth(310);
    this.pips = [];
    for (let i = 0; i < GameState.maxTurns; i++) this.pips.push(scene.add.circle(W / 2 - 60 + i * 30, 72, 9, 0x444444).setStrokeStyle(2, 0xffffff).setDepth(310));
    this.mute = this.muteButton(W - 36, 46);
    this.setTurn(GameState.turn);
  }

  card(side, x, y) {
    const s = this.s, ch = CHARACTERS[GameState.charOf(side)], isP = side === SIDE.PLAYER;
    const c = s.add.container(x, y).setDepth(310), o = {};
    const key = bake(s, 'hudcard_' + side + ch.id, CARD_W + 10, CARD_H + 12, (g) => {
      g.fillStyle(0x000000, 0.35).fillRoundedRect(7, 10, CARD_W, CARD_H, 16);
      g.fillStyle(isP ? 0x1b5e20 : 0x4a1a1a, 1).fillRoundedRect(5, 5, CARD_W, CARD_H, 16).lineStyle(4, ch.accent, 1).strokeRoundedRect(5, 5, CARD_W, CARD_H, 16);
    });
    c.add(s.add.image(0, 0, key));
    c.add(s.add.image(-CARD_W / 2 + 46, 0, 'icon_' + ch.id).setDisplaySize(60, 60));
    c.add(txt(s, -CARD_W / 2 + 90, -16, ch.name, 27, '#ffffff').setOrigin(0, 0.5));
    c.add(txt(s, -CARD_W / 2 + 90 + 90, -14, isP ? '나' : 'AI', 16, '#ffd700').setOrigin(0, 0.5));
    c.add(txt(s, -CARD_W / 2 + 90, 15, ch.country, 16, '#d8f3dc').setOrigin(0, 0.5));
    // 점수
    const sx = CARD_W / 2 - 58;
    c.add(txt(s, sx, -22, '🪙 점수', 16, '#ffe082'));
    o.score = txt(s, sx, 8, String(this.shown[side]), 40, '#ffffff'); c.add(o.score);
    // 축구화 표시
    o.boots = s.add.container(-CARD_W / 2 + 190, 20);
    bake(s, 'boots_pill', 108, 28, (g) => { g.fillStyle(0xffa000, 1).fillRoundedRect(2, 2, 104, 24, 12).lineStyle(2, 0xffffff, 1).strokeRoundedRect(2, 2, 104, 24, 12); });
    o.boots.add(s.add.image(0, 0, 'boots_pill'));
    o.boots.add(txt(s, 0, 0, '👟 축구화', 16, '#ffffff', { strokeThickness: 2 }));
    o.boots.setVisible(false); c.add(o.boots);
    o.counter = { v: this.shown[side] };
    o.root = c;
    return o;
  }

  muteButton(x, y) {
    const s = this.s, c = s.add.container(x, y).setDepth(320);
    const bg = s.add.circle(0, 0, 22, 0x1b5e20).setStrokeStyle(3, 0xffffff);
    const t = txt(s, 0, 0, '🔊', 24, '#ffffff', { strokeThickness: 0 });
    c.add([bg, t]).setSize(44, 44).setInteractive({ useHandCursor: true });
    c.on('pointerup', () => { SFX.unlock(); const m = SFX.toggleMute(); t.setText(m ? '🔇' : '🔊'); });
    return c;
  }

  setTurn(n) {
    this.turnTxt.setText(`턴 ${Math.min(n, GameState.maxTurns)}/${GameState.maxTurns}`);
    this.pips.forEach((p, i) => p.setFillStyle(i < n - 1 ? 0xffd700 : i === n - 1 ? 0x69f0ae : 0x444444));
  }

  // 점수 변화 연출: 숫자 카운트 + 팝업
  addScore(side, delta, { popup = true } = {}) {
    if (!delta) return;
    const o = this.cards[side], from = this.shown[side];
    this.shown[side] = Math.max(0, from + delta);
    o.counter.v = from;
    this.s.tweens.killTweensOf(o.counter);
    this.s.tweens.add({ targets: o.counter, v: this.shown[side], duration: 600, onUpdate: () => o.score.setText(String(Math.round(o.counter.v))) });
    this.s.tweens.add({ targets: o.score, scale: 1.4, duration: 120, yoyo: true });
    o.score.setColor(delta > 0 ? '#9cff9c' : '#ff8a8a');
    this.s.time.delayedCall(900, () => o.score.setColor('#ffffff'));
    if (popup) this.fx.float(o.root.x + CARD_W / 2 - 112, 62, (delta > 0 ? '+' : '') + delta, { color: delta > 0 ? '#9cff9c' : '#ff8a8a', size: 34, dy: 24, dur: 1000 });
  }

  // 실제 상태와 강제 동기화
  sync() {
    ['player', 'ai'].forEach((sd) => {
      const real = GameState.scores[sd];
      if (this.shown[sd] !== real) this.addScore(sd, real - this.shown[sd], { popup: false });
    });
    this.refresh();
  }
  refresh() {
    ['player', 'ai'].forEach((sd) => this.cards[sd].boots.setVisible(!!GameState.items[sd].boots));
  }
  scorePos(side) { const o = this.cards[side].root; return { x: o.x + CARD_W / 2 - 58, y: 60 }; }
}
