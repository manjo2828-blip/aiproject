import { W, FONT } from '../../../config/constants.js';
import { CHARACTERS } from '../../../config/characters.js';
import { Button, txt } from '../../../ui/Button.js';
import { SFX } from '../../../core/SoundFX.js';
import { DEFEND_MS } from './PKConst.js';

const POP = { GOAL: '#ffd700', SAVED: '#6ec6ff', MISS: '#ff7a7a', POST: '#ffb74d' };

export class PKHud {
  constructor(scene, { onDir, onShoot }) {
    this.scene = scene;
    // 제목 배너
    const b = scene.add.graphics().setDepth(70);
    b.fillStyle(0x000000, 0.65).fillRect(0, 0, W, 48).fillStyle(0xffd700, 1).fillRect(0, 46, W, 3);
    this.title = txt(scene, W / 2, 24, 'PK 승부차기', 30, '#ffd700').setDepth(71);
    this.round = txt(scene, W - 110, 24, '라운드 1/3', 24, '#ffffff').setDepth(71);
    // 점수판
    this.board = scene.add.graphics().setDepth(70);
    this.board.fillStyle(0x000000, 0.6).fillRoundedRect(14, 58, 290, 100, 14).lineStyle(2, 0xffffff, 0.4).strokeRoundedRect(14, 58, 290, 100, 14);
    this.dots = scene.add.graphics().setDepth(71);
    this.rows = {};
    [['player', 82], ['ai', 130]].forEach(([side, y]) => {
      const id = side === 'player' ? scene.playerId : scene.aiId, c = CHARACTERS[id];
      const tag = scene.add.rectangle(24, y, 8, 34, c.kit.primary).setOrigin(0, 0.5).setDepth(71).setStrokeStyle(2, c.kit.secondary);
      const nm = scene.add.text(40, y, (side === 'player' ? '나 ' : '') + c.name, { fontFamily: FONT, fontSize: '22px', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5).setDepth(71);
      this.rows[side] = { y, tag, nm };
    });
    this.res = { player: [null, null, null], ai: [null, null, null] };
    this.drawDots();
    // 안내 문구
    this.prompt = txt(scene, W / 2, 84, '', 30, '#ffffff').setDepth(71);
    this.sub = txt(scene, W / 2, 118, '', 20, '#cfe8cf').setDepth(71);
    // 키퍼 제한시간 링
    this.ring = scene.add.graphics().setDepth(72); this.ringTxt = txt(scene, W - 90, 120, '', 34, '#fff').setDepth(73);
    this.ringOn = false;
    // 버튼
    const mk = (x, label, dir, color) => new Button(scene, x, 668, label, { w: 104, h: 58, fontSize: 26, color, onClick: () => onDir(dir) }).setDepth(80);
    this.dirBtns = [mk(120, '← 좌', -1, 0x3d7ae8), mk(236, '↑ 중', 0, 0x3d7ae8), mk(352, '우 →', 1, 0x3d7ae8)];
    this.shoot = new Button(scene, 1090, 648, 'SHOOT', { w: 200, h: 66, fontSize: 32, color: 0xe53935, onClick: () => onShoot() }).setDepth(80);
    scene.add.text(120, 626, '방향 (← ↑ →)', { fontFamily: FONT, fontSize: '16px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setDepth(80).setOrigin(0, 0.5).setX(70);
    this.shootHint = scene.add.text(1090, 600, 'SPACE', { fontFamily: FONT, fontSize: '16px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(80);
    this.showShoot(false);
  }
  setRound(r) { this.round.setText(`라운드 ${r}/3`); }
  setPrompt(a, b = '') { this.prompt.setText(a); this.sub.setText(b); this.scene.tweens.add({ targets: this.prompt, scale: { from: 1.25, to: 1 }, duration: 200 }); }
  showShoot(v) { this.shoot.setVisible(v); this.shootHint.setVisible(v); }
  setResult(side, i, ok) { this.res[side][i] = ok ? 'goal' : 'miss'; this.drawDots(); }
  goals(side) { return this.res[side].filter((v) => v === 'goal').length; }
  drawDots() {
    const g = this.dots.clear();
    ['player', 'ai'].forEach((side) => this.res[side].forEach((v, i) => {
      const x = 200 + i * 34, y = this.rows[side].y;
      if (v === 'goal') g.fillStyle(0x43d95a, 1).fillCircle(x, y, 11).lineStyle(2, 0xffffff, 1).strokeCircle(x, y, 11);
      else if (v === 'miss') g.lineStyle(5, 0xff5252, 1).lineBetween(x - 8, y - 8, x + 8, y + 8).lineBetween(x + 8, y - 8, x - 8, y + 8);
      else g.lineStyle(3, 0xffffff, 0.7).strokeCircle(x, y, 10);
    }));
  }
  // 키퍼 카운트다운 링
  startRing() { this.ringOn = true; this.ringT0 = this.scene.time.now; }
  stopRing() { this.ringOn = false; this.ring.clear(); this.ringTxt.setText(''); }
  update(now) {
    if (!this.ringOn) return 1;
    const left = Math.max(0, 1 - (now - this.ringT0) / DEFEND_MS), cx = W - 90, cy = 120;
    this.ring.clear().lineStyle(10, 0x000000, 0.5).strokeCircle(cx, cy, 36)
      .lineStyle(10, left > 0.35 ? 0x43d95a : 0xff5252, 1).beginPath().arc(cx, cy, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false).strokePath();
    this.ringTxt.setText(String(Math.ceil(left * DEFEND_MS / 1000)));
    return left;
  }
  popup(kind, text) {
    const s = this.scene, t = txt(s, 760, 480, text || kind + '!', 110, POP[kind] || '#fff', { strokeThickness: 14 }).setDepth(90).setScale(0.2).setAngle(-6);
    s.tweens.add({ targets: t, scale: 1, angle: 0, duration: 260, ease: 'Back.easeOut' });
    s.tweens.add({ targets: t, alpha: 0, y: 450, duration: 350, delay: 1050, onComplete: () => t.destroy() });
  }
  // 조작 안내 + 3,2,1,GO
  intro(onGo) {
    const s = this.scene, ov = s.add.container(0, 0).setDepth(500);
    const bg = s.add.rectangle(W / 2, 360, W, 720, 0x000000, 0.78).setInteractive();
    const card = s.add.graphics().fillStyle(0x14301a, 1).fillRoundedRect(W / 2 - 400, 110, 800, 360, 24).lineStyle(4, 0xffd700, 1).strokeRoundedRect(W / 2 - 400, 110, 800, 360, 24);
    const lines = [
      txt(s, W / 2, 160, 'PK 승부차기', 52, '#ffd700'),
      txt(s, W / 2, 232, '공격: ← ↑ → 로 방향 선택  →  게이지가 초록일 때 SPACE!', 26),
      txt(s, W / 2, 280, '수비: 슛 방향을 예측해서 ← ↑ → 를 누르세요 (2.5초)', 26),
      txt(s, W / 2, 328, '총 3라운드 (공격 3 + 수비 3), 골이 많은 쪽이 승리!', 24, '#cfe8cf'),
      txt(s, W / 2, 372, '화면 아래 버튼으로도 조작할 수 있어요', 22, '#cfe8cf'),
    ];
    const num = txt(s, W / 2, 420, '', 78, '#ffffff', { strokeThickness: 10 });
    ov.add([bg, card, ...lines, num]);
    const seq = ['3', '2', '1', 'GO!'];
    seq.forEach((n, i) => s.time.delayedCall(i * 700, () => {
      num.setText(n).setScale(1.6).setColor(n === 'GO!' ? '#ffd700' : '#ffffff'); SFX.play(n === 'GO!' ? 'go' : 'countdown');
      s.tweens.add({ targets: num, scale: 1, duration: 280, ease: 'Back.easeOut' });
    }));
    s.time.delayedCall(seq.length * 700, () => { s.tweens.add({ targets: ov, alpha: 0, duration: 200, onComplete: () => { ov.destroy(); onGo(); } }); });
  }
}
