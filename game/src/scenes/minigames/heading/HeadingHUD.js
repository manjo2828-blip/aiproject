import { W, H, SIDE } from '../../../config/constants.js';
import { CHARACTERS } from '../../../config/characters.js';
import { SFX } from '../../../core/SoundFX.js';
import { txt } from '../../../ui/Button.js';

// 제목 배너 / 좌우 점수(공 아이콘 2칸) / CROSS n/3 / 중앙 배너 / 조작 안내 / 카운트다운
export class HeadingHUD {
  constructor(scene, playerId, aiId) {
    this.s = scene; this.slots = { player: [], ai: [] };
    const D = 100;
    scene.add.rectangle(W / 2, 30, 420, 50, 0x000000, 0.65).setDepth(D).setStrokeStyle(3, 0xffd700);
    txt(scene, W / 2, 30, '공중전 헤딩 대결', 32, '#ffd700').setDepth(D + 1);
    this.panel(SIDE.PLAYER, playerId, 20, 'YOU'); this.panel(SIDE.AI, aiId, W - 20 - 270, 'CPU');
    this.round = txt(scene, W / 2, 84, '', 34, '#ffffff').setDepth(D + 1);
    this.hint = null;
  }
  panel(side, id, x, tag) {
    const s = this.s, c = CHARACTERS[id], y = 62, D = 100;
    s.add.rectangle(x + 135, y + 28, 270, 66, 0x000000, 0.62).setDepth(D).setStrokeStyle(3, c.accent);
    if (s.textures.exists('icon_' + id)) s.add.image(x + 38, y + 28, 'icon_' + id).setDisplaySize(52, 52).setDepth(D + 1);
    txt(s, x + 154, y + 12, `${tag}  ${c.name}`, 22, c.accentHex).setDepth(D + 1);
    for (let i = 0; i < 2; i++) {
      const bx = x + 118 + i * 44, by = y + 44;
      const ring = s.add.circle(bx, by, 15, 0x000000, 0.5).setStrokeStyle(2, 0xffffff, 0.6).setDepth(D + 1);
      const ball = s.textures.exists('sports_equip') ? s.add.image(bx, by, 'sports_equip', 'ball_soccer1.png').setScale(1.55) : s.add.circle(bx, by, 11, 0xffffff);
      ball.setDepth(D + 2).setAlpha(0.0);
      this.slots[side].push({ ball, ring });
    }
  }
  setGoals(side, n) {
    this.slots[side].forEach((sl, i) => {
      if (i < n && sl.ball.alpha < 1) {
        sl.ball.setAlpha(1).setScale(sl.ball.scaleX * 3);
        this.s.tweens.add({ targets: sl.ball, scale: sl.ball.scaleX / 3, duration: 400, ease: 'Bounce.Out' });
      }
    });
  }
  setRound(r, max = 3) { this.round.setText(`CROSS ${r}/${max}`); this.s.tweens.add({ targets: this.round, scale: { from: 1.5, to: 1 }, duration: 260, ease: 'Back.Out' }); }

  banner(text, color = '#ffffff', ms = 900, size = 78) {
    const s = this.s, t = txt(s, W / 2, 300, text, size, color, { strokeThickness: 10 }).setDepth(250).setScale(0.3).setAlpha(0);
    s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });
    s.tweens.add({ targets: t, alpha: 0, y: 270, duration: 250, delay: ms, onComplete: () => t.destroy() });
    return t;
  }

  // 조작 안내 오버레이
  showIntro(ms, onDone) {
    const s = this.s, D = 500, objs = [];
    const add = (o) => { objs.push(o); return o; };
    add(s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(D));
    add(s.add.rectangle(W / 2, 360, 860, 380, 0x10301c, 0.96).setDepth(D + 1).setStrokeStyle(5, 0xffd700));
    add(txt(s, W / 2, 205, '공중전 헤딩 대결', 54, '#ffd700').setDepth(D + 2));
    add(txt(s, W / 2, 275, '[ SPACE ]  /  마우스 클릭  /  JUMP 버튼', 34, '#ffffff').setDepth(D + 2));
    add(txt(s, W / 2, 330, '줄어드는 링이 안쪽 흰 원과 딱 겹치는 순간 점프!', 28, '#bdf5c6').setDepth(D + 2));
    // 데모 링
    const g = add(s.add.graphics().setDepth(D + 2)), cx = W / 2 - 300, cy = 440, st = { k: 0 };
    s.tweens.add({ targets: st, k: 1, duration: 1100, repeat: -1, repeatDelay: 250, onUpdate: () => {
      g.clear().lineStyle(4, 0xffffff, 1).strokeCircle(cx, cy, 30);
      const r = 30 + 40 * (1 - st.k); g.lineStyle(7, st.k > 0.93 ? 0xffd700 : 0x40c4ff, 1).strokeCircle(cx, cy, r);
    } });
    add(txt(s, W / 2 + 60, 420, 'PERFECT > GOOD > MISS', 30, '#ffd700').setDepth(D + 2));
    add(txt(s, W / 2 + 60, 462, '더 정확한 쪽이 헤딩 골! 동점이면 먼저 누른 쪽', 24, '#ffffff').setDepth(D + 2));
    add(txt(s, W / 2, 520, '3번의 크로스 중 먼저 2골 (또는 더 많은 골) 승리', 24, '#ffffff').setDepth(D + 2));
    SFX.play('whistle');
    s.after(ms, () => {
      s.tweens.add({ targets: objs, alpha: 0, duration: 250 });
      s.after(260, () => { objs.forEach((o) => o.destroy()); onDone(); });
    });
  }

  countdown(onDone) {
    const s = this.s, seq = ['3', '2', '1', 'GO!'];
    seq.forEach((t, i) => s.after(i * 700, () => {
      const go = i === 3;
      SFX.play(go ? 'go' : 'countdown');
      const o = txt(s, W / 2, 330, t, go ? 140 : 160, go ? '#ffd700' : '#ffffff', { strokeThickness: 14 }).setDepth(400).setScale(2).setAlpha(0);
      s.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 200, ease: 'Back.Out' });
      s.tweens.add({ targets: o, alpha: 0, scale: 1.4, duration: 250, delay: 400, onComplete: () => o.destroy() });
      if (go) s.after(450, onDone);
    }));
  }

}
