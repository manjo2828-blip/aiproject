import { W, H, COLORS } from '../config/constants.js';
import { TILE_TYPES } from '../config/board.js';
import { GameState } from '../core/GameState.js';
import { Button, txt } from '../ui/Button.js';
import { DiceRoller } from '../ui/DiceRoller.js';
import { panelTop } from './BoardLayout.js';

const LOG_LINES = 4, LOG_W = 480;

// 하단 패널: 기록 로그 / 주사위 창 / [주사위 굴리기] 버튼 / 범례
export class ActionPanel {
  constructor(scene) {
    this.s = scene; this.pending = null;
    scene.add.rectangle(W / 2, (panelTop + H) / 2, W, H - panelTop, 0x0d2410, 0.94).setDepth(300);
    scene.add.rectangle(W / 2, panelTop, W, 4, 0xffffff, 0.35).setDepth(300);
    this.buildLog(); this.buildLegend();
    this.dice = new DiceRoller(scene, 690, 625).setDepth(310);
    this.btn = new Button(scene, 935, 622, '주사위 굴리기', { w: 320, h: 84, color: 0xf9a825, fontSize: 36, onClick: () => this.fire() }).setDepth(310);
    this.hint = txt(scene, 935, 683, 'Space 키로도 굴릴 수 있어요', 17, '#cfe8d1').setDepth(310);
    this.btn.setEnabled(false);
    this.cap = txt(scene, 810, 566, '', 22, '#ffd700').setDepth(310);
    this.keyH = () => this.fire();
    scene.input.keyboard.on('keydown-SPACE', this.keyH);
    this.unsub = GameState.onChange((e) => { if (e.type === 'log') this.pushLog(e.text); });
    GameState.log.slice(-LOG_LINES).forEach((t) => this.pushLog(t));
    scene.events.once('shutdown', () => this.destroy());
  }
  buildLog() {
    const s = this.s;
    s.add.graphics().setDepth(305).fillStyle(0x000000, 0.35).fillRoundedRect(18, panelTop + 12, LOG_W + 20, 160, 14);
    txt(s, 36, panelTop + 26, '경기 기록', 18, '#ffd700').setOrigin(0, 0.5).setDepth(310);
    this.lines = [];
    for (let i = 0; i < LOG_LINES; i++) this.lines.push(txt(s, 36, panelTop + 56 + i * 29, '', 20, '#ffffff', { strokeThickness: 2 }).setOrigin(0, 0.5).setDepth(310));
    this.buf = [];
  }
  pushLog(text) {
    this.buf.push(text); if (this.buf.length > LOG_LINES) this.buf.shift();
    const off = LOG_LINES - this.buf.length;
    this.lines.forEach((t, i) => {
      const str = this.buf[i - off] || '';
      t.setText(str).setScale(1).setAlpha(0.45 + 0.55 * ((i + 1) / LOG_LINES));
      if (t.width > LOG_W) t.setScale(LOG_W / t.width);
    });
    const last = this.lines[LOG_LINES - 1]; last.setAlpha(0).y += 8;
    this.s.tweens.add({ targets: last, alpha: 1, y: last.y - 8, duration: 200 });
  }
  buildLegend() {
    const s = this.s, x0 = 1100;
    Object.entries(TILE_TYPES).forEach(([k, d], i) => {
      const y = panelTop + 30 + i * 36;
      s.add.rectangle(x0, y, 26, 26, d.color).setStrokeStyle(3, 0xffffff).setDepth(310);
      txt(s, x0 + 24, y, `${d.label}`, 19, '#ffffff', { strokeThickness: 2 }).setOrigin(0, 0.5).setDepth(310);
    });
  }
  setTurnCaption(t) { this.cap.setText(t); }
  fire() { if (this.pending) { const r = this.pending; this.pending = null; this.btn.setEnabled(false); this.stopPulse(); r(); } }
  stopPulse() { if (this.pulse) { this.pulse.stop(); this.pulse = null; this.btn.setScale(1); } }
  // 플레이어 굴림 대기
  waitRoll(auto = false) {
    return new Promise((res) => {
      this.pending = res; this.btn.setEnabled(true);
      this.pulse = this.s.tweens.add({ targets: this.btn, scale: 1.05, duration: 450, yoyo: true, repeat: -1 });
      if (auto) this.s.time.delayedCall(700, () => this.fire());
    });
  }
  destroy() { this.s.input.keyboard.off('keydown-SPACE', this.keyH); if (this.unsub) this.unsub(); this.unsub = null; }
}
