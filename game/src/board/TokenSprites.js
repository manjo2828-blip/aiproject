import { CHARACTERS } from '../config/characters.js';
import { GameState } from '../core/GameState.js';
import { txt } from '../ui/Button.js';
import { tileCenter, TOKEN_X, TOKEN_Y, SHARE_DX } from './BoardLayout.js';
import { tw } from './Fx.js';
import { bake } from './Bake.js';

class Token {
  constructor(scene, side, charId) {
    const c = CHARACTERS[charId];
    this.side = side; this.s = scene;
    this.root = scene.add.container(0, 0).setDepth(200);
    this.body = scene.add.container(0, 0);
    const shadow = scene.add.ellipse(0, 24, 46, 14, 0x000000, 0.3);
    const ring = scene.add.circle(0, 0, 27, 0xffffff).setStrokeStyle(0);
    const acc = scene.add.circle(0, 0, 24, c.accent);
    const disc = scene.add.circle(0, 0, 19, c.kit.primary);
    const frame = `character${c.sportsTeam} (1).png`;
    const sprite = scene.add.image(0, -2, 'sports_chars', frame).setScale(1.5);
    const badge = scene.add.image(21, 14, 'icon_' + charId).setDisplaySize(28, 28);
    const badgeRing = scene.add.circle(21, 14, 15).setStrokeStyle(3, 0xffffff);
    const tagBg = scene.add.image(0, -42, bake(scene, 'tag_' + charId + side, 52, 26, (g) => { g.fillStyle(side === 'player' ? 0x14301a : 0x300f0f, 0.9).fillRoundedRect(2, 2, 48, 22, 11).lineStyle(2, c.accent, 1).strokeRoundedRect(2, 2, 48, 22, 11); }));
    const tag = txt(scene, 0, -42, side === 'player' ? '나' : 'AI', 17, '#ffffff', { strokeThickness: 0, stroke: '#00000000' });
    this.body.add([ring, acc, disc, sprite, badge, badgeRing]);
    this.root.add([shadow, this.body, tagBg, tag]);
  }
}

// 두 말(플레이어/AI)의 위치/이동 연출. 표시 위치(shown)는 GameState.pos 와 별도로 추적(연출 도중 보드 상태가 앞서가므로).
export class TokenSprites {
  constructor(scene) {
    this.s = scene;
    this.t = { player: new Token(scene, 'player', GameState.playerId), ai: new Token(scene, 'ai', GameState.aiId) };
    this.shown = { player: GameState.pos.player, ai: GameState.pos.ai };
    ['player', 'ai'].forEach((sd) => { const p = this.slot(sd); this.t[sd].root.setPosition(p.x, p.y); });
  }
  other(side) { return side === 'player' ? 'ai' : 'player'; }
  root(side) { return this.t[side].root; }
  slot(side, idx = this.shown[side]) {
    const c = tileCenter(idx), shared = this.shown[this.other(side)] === idx;
    return { x: c.x + TOKEN_X + (shared ? (side === 'player' ? -SHARE_DX : SHARE_DX) : 0), y: c.y + TOKEN_Y };
  }
  // 한 칸 이동(통통 뛰기)
  step(side, idx, mul = 1) {
    this.shown[side] = idx;
    const p = this.slot(side), dur = 300 / mul, tk = this.t[side];
    this.s.tweens.add({ targets: tk.body, y: -26, duration: dur / 2, yoyo: true, ease: 'Quad.Out' });
    return tw(this.s, { targets: tk.root, x: p.x, y: p.y, duration: dur, ease: 'Sine.InOut' });
  }
  // 양쪽 말을 현재 shown 위치의 슬롯으로 정렬
  settle() {
    return Promise.all(['player', 'ai'].map((sd) => { const p = this.slot(sd); return tw(this.s, { targets: this.t[sd].root, x: p.x, y: p.y, duration: 200, ease: 'Sine.Out' }); }));
  }
  // 위치 맞바꾸기(swap 이벤트): 각자 상대 칸으로 포물선 이동
  swap(a, b) {
    this.shown[a.side] = a.to; this.shown[b.side] = b.to;
    return Promise.all([a, b].map((e) => {
      const p = this.slot(e.side), tk = this.t[e.side];
      this.s.tweens.add({ targets: tk.body, y: -70, duration: 280, yoyo: true, ease: 'Quad.Out' });
      this.s.tweens.add({ targets: tk.body, angle: 360, duration: 560 });
      return tw(this.s, { targets: tk.root, x: p.x, y: p.y, duration: 560, ease: 'Sine.InOut', onComplete: () => { tk.body.angle = 0; } });
    }));
  }
  // 슬라이딩 대시: 공격자가 목표 좌표로 쓸고 지나간 후 돌아온다
  async slide(attacker, victim) {
    const tk = this.t[attacker].root, v = this.t[victim].root, home = { x: tk.x, y: tk.y };
    const dir = v.x >= tk.x ? 1 : -1;
    tk.setDepth(260);
    this.s.tweens.add({ targets: this.t[attacker].body, angle: 70 * dir, duration: 200 });
    await tw(this.s, { targets: tk, x: v.x - 30 * dir, y: v.y + 6, duration: 240, ease: 'Cubic.In' });
    return { home, done: async () => {
      this.s.tweens.add({ targets: this.t[attacker].body, angle: 0, duration: 250 });
      await tw(this.s, { targets: tk, x: home.x, y: home.y, duration: 300, ease: 'Sine.Out' });
      tk.setDepth(200);
    } };
  }
  hitReact(side) {
    const tk = this.t[side];
    this.s.tweens.add({ targets: tk.body, scale: 0.8, duration: 70, yoyo: true, repeat: 2 });
    tk.body.list.forEach((o) => { if (o.setTint) o.setTint(0xff7777); });
    this.s.time.delayedCall(450, () => tk.body.list.forEach((o) => o.clearTint && o.clearTint()));
  }
}
