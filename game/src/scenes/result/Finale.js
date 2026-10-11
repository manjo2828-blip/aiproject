import { W, H, FONT, SIDE } from '../../config/constants.js';
import { SFX } from '../../core/SoundFX.js';
import { Button, txt } from '../../ui/Button.js';
import { CharacterArt } from '../../characters/CharacterArt.js';
import { createTrophy } from '../../fx/Trophy.js';

const FIG_SCALE = 0.8, PODIUM_Y = 520, GROUND_Y = 580;

// 흑백 처리 (WebGL postFX colorMatrix). 실패하면 false 반환 -> 호출 측에서 오버레이로 대체
export function grayscale(obj, amount = 1) {
  try {
    if (!obj.postFX) return false;
    const cm = obj.postFX.addColorMatrix(); cm.grayscale(amount); return cm;
  } catch (e) { return false; }
}

// 3단계 피날레: 승리 / 패배 / 무승부 연출
export class Finale {
  constructor(scene, ctx) { this.scene = scene; this.ctx = ctx; this.timers = []; }

  at(ms, fn) { const t = this.scene.time.delayedCall(ms, fn); this.timers.push(t); return t; }

  podium(x) {
    const s = this.scene, g = s.add.graphics().setDepth(15);
    g.fillStyle(0x000000, 0.35).fillEllipse(x, PODIUM_Y + 84, 360, 36);
    g.fillStyle(0x7a5a10, 1).fillRoundedRect(x - 150, PODIUM_Y + 8, 300, 76, 8);
    g.fillStyle(0xffd700, 1).fillRoundedRect(x - 160, PODIUM_Y, 320, 18, 6);
    g.fillStyle(0xfff3a0, 0.8).fillRect(x - 150, PODIUM_Y + 2, 300, 4);
    g.fillStyle(0xb88a12, 1).fillRect(x - 150, PODIUM_Y + 26, 300, 4);
    const one = txt(s, x, PODIUM_Y + 56, '1', 46, '#fff3a0', { strokeThickness: 6, stroke: '#5a3b00' }).setDepth(16);
    g.alpha = 0; one.alpha = 0;
    s.tweens.add({ targets: [g, one], alpha: 1, duration: 400 });
    return g;
  }

  glowTex() {
    const s = this.scene;
    if (!s.textures.exists('glow_rad')) {
      const t = s.textures.createCanvas('glow_rad', 256, 256), ctx = t.getContext(), gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,230,140,0.55)'); gr.addColorStop(0.5, 'rgba(255,210,90,0.2)'); gr.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 256); t.refresh();
    }
    return 'glow_rad';
  }

  rays(x, y, color = 0xffe27a) {
    const s = this.scene, g = s.add.graphics({ x, y }).setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, w = 0.11; g.fillStyle(color, 0.16).fillTriangle(0, 0, Math.cos(a - w) * 900, Math.sin(a - w) * 900, Math.cos(a + w) * 900, Math.sin(a + w) * 900); }
    s.tweens.add({ targets: g, alpha: 1, duration: 800 });
    s.tweens.add({ targets: g, angle: 360, duration: 24000, repeat: -1 });
    return g;
  }

  bigText(str, y, color, size, { glow = '#ffffff', stroke = '#5a3b00' } = {}) {
    const s = this.scene;
    const glowT = txt(s, W / 2, y, str, size, glow, { strokeThickness: 26, stroke: glow }).setDepth(40).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    const t = txt(s, W / 2, y, str, size, color, { strokeThickness: Math.round(size / 8), stroke }).setDepth(41).setAlpha(0);
    return { t, glowT };
  }

  bottomBar(msg, color = '#ffffff') {
    const s = this.scene;
    const bar = s.add.graphics().setDepth(30).setAlpha(0);
    bar.fillStyle(0x000000, 0.55).fillRect(0, 598, W, 122);
    const t = txt(s, W / 2, 626, msg, 32, color).setDepth(31).setAlpha(0).setY(640);
    s.tweens.add({ targets: bar, alpha: 1, duration: 400 });
    s.tweens.add({ targets: t, alpha: 1, y: 626, duration: 500, ease: 'Back.easeOut' });
  }

  buttons(defs) {
    const s = this.scene, n = defs.length, gap = 340;
    defs.forEach((d, i) => {
      const b = new Button(s, W / 2 + (i - (n - 1) / 2) * gap, 680, d.label, { w: 310, h: 54, fontSize: 26, color: d.color, onClick: d.onClick }).setDepth(50);
      b.setScale(0); s.tweens.add({ targets: b, scale: 1, duration: 380, ease: 'Back.easeOut', delay: i * 120 });
    });
    this.ctx.onButtonsReady && this.ctx.onButtonsReady();
  }

  runIn(fig, toX, dur, onDone) {
    fig.play('run');
    this.scene.tweens.add({ targets: fig, x: toX, duration: dur, ease: 'Sine.easeOut', onComplete: () => { fig.play('idle'); onDone && onDone(); } });
  }

  // 트로피를 번쩍 들고 삼바 (winnerFig 기준)
  liftTrophy(fig, pose = 'trophy') {
    const s = this.scene;
    fig.play(pose); SFX.play('cheer');
    // 트로피 자세(캐릭터가 직접 컵을 듦) 동안 후광, 삼바로 넘어갈 때 황금 트로피가 머리 위로 떠오름
    const glow = s.add.image(fig.x, fig.y - 190, this.glowTex()).setDepth(21).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(1.4);
    s.tweens.add({ targets: glow, alpha: 1, duration: 500, delay: 300 });
    s.tweens.add({ targets: glow, scale: { from: 1.2, to: 1.8 }, duration: 700, yoyo: true, repeat: -1 });
    this.at(1900, () => {
      fig.play('dance');
      SFX.play('samba');
      const base = fig.y - 175 * FIG_SCALE / 0.8;
      const tr = createTrophy(s, fig.x, base + 40, { size: 92 }).setDepth(22).setScale(0).setAngle(-12);
      s.tweens.add({ targets: tr, scale: 1, angle: 0, y: base, duration: 600, ease: 'Back.easeOut', onComplete: () => {
        tr.sparkle(); s.tweens.add({ targets: tr, y: base - 10, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } });
      glow.y = base - 50; this.trophy = tr;
      const ev = s.time.addEvent({ delay: 1000, loop: true, callback: () => SFX.play('samba') }); this.timers.push(ev);
    });
  }

  // ---------------- 승리 ----------------
  win() {
    const s = this.scene, c = this.ctx, GS = c.GS;
    SFX.drumroll(false); SFX.play('thud'); s.cameras.main.shake(300, 0.012);
    this.at(500, () => {
      s.cameras.main.flash(600, 255, 255, 255);
      SFX.play('fanfare'); SFX.play('confetti');
      c.confetti.burst(120, 640, 90, { angle: -65, spread: 30, power: 1250 });
      c.confetti.burst(1160, 640, 90, { angle: -115, spread: 30, power: 1250 });
      c.confetti.burst(W / 2, 330, 80, { angle: -90, spread: 100, power: 800 });
      c.confetti.rain(true);
      const { t, glowT } = this.bigText('VICTORY!', 158, '#ffd700', 120, { glow: '#fff3a0' });
      [t, glowT].forEach((o) => { o.setAlpha(1).setScale(0); s.tweens.add({ targets: o, scale: 1, duration: 900, ease: 'Elastic.easeOut' }); });
      s.tweens.add({ targets: glowT, alpha: { from: 0.9, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
      s.tweens.add({ targets: t, angle: { from: -2, to: 2 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    this.at(900, () => { c.confetti.burst(300, 560, 50, { angle: -80, spread: 40, power: 1000 }); c.confetti.burst(980, 560, 50, { angle: -100, spread: 40, power: 1000 }); SFX.play('confetti'); });
    this.rays(W / 2, 380);
    this.podium(W / 2);
    const me = CharacterArt.createFigure(s, GS.playerId, { scale: FIG_SCALE }).setDepth(20).setPosition(-140, PODIUM_Y + 4);
    me.setFacing(1);
    const foe = CharacterArt.createFigure(s, GS.aiId, { scale: FIG_SCALE }).setDepth(20).setPosition(1080, GROUND_Y + 30);
    foe.setFacing(-1); foe.play('sad');
    this.at(900, () => this.runIn(me, W / 2, 1500, () => this.liftTrophy(me)));
    this.at(4200, () => this.bottomBar('챔피언 등극! 완벽한 경기력이었습니다!', '#fff3a0'));
    this.at(4600, () => this.buttons([
      { label: '메인으로 돌아가기', color: 0x2f80ed, onClick: c.toMain },
      { label: '다시 하기', color: 0xe8a010, onClick: c.retry },
    ]));
  }

  // ---------------- 패배 ----------------
  lose() {
    const s = this.scene, c = this.ctx, GS = c.GS;
    SFX.drumroll(false); SFX.play('thud'); s.cameras.main.shake(300, 0.012);
    // 배경 흑백 + 어두운 비네트
    if (!grayscale(c.bg.root)) c.bg.root.setAlpha(0.45);
    const shade = s.add.rectangle(W / 2, 360, W, 720, 0x0a0f1c, 0).setDepth(6);
    s.tweens.add({ targets: shade, fillAlpha: 0.35, duration: 1200 });
    this.at(600, () => {
      SFX.play('sadTrombone');
      const { t, glowT } = this.bigText('DEFEATED...', 120, '#aab4c0', 104, { glow: '#4a5568', stroke: '#1a1f2b' });
      glowT.setAlpha(0.0); t.setAlpha(0);
      s.tweens.add({ targets: t, alpha: 1, y: 160, duration: 1800, ease: 'Sine.easeOut' });
      s.tweens.add({ targets: glowT, alpha: 0.5, y: 160, duration: 1800, ease: 'Sine.easeOut' });
    });
    this.podium(W / 2);
    const me = CharacterArt.createFigure(s, GS.playerId, { scale: FIG_SCALE }).setDepth(20).setPosition(230, GROUND_Y + 30);
    me.setFacing(1); me.play('sad'); grayscale(me, 1);
    const foe = CharacterArt.createFigure(s, GS.aiId, { scale: FIG_SCALE }).setDepth(20).setPosition(W + 140, PODIUM_Y + 4);
    foe.setFacing(-1);
    this.at(1000, () => this.runIn(foe, W / 2, 1600, () => this.liftTrophy(foe, 'trophy')));
    this.at(1500, () => {   // 패배자: 풀 죽어 고개를 숙임
      s.tweens.add({ targets: me, y: me.y + 6, scaleY: FIG_SCALE * 0.96, duration: 1400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    });
    this.at(3600, () => this.bottomBar('아쉽습니다! 다음 경기에선 태클 타이밍을 노려보세요!', '#d6dde6'));
    this.at(4000, () => this.buttons([
      { label: '다시 도전하기', color: 0xe8a010, onClick: c.retry },
      { label: '메인으로 돌아가기', color: 0x4a5a7a, onClick: c.toMain },
    ]));
  }

  // ---------------- 무승부 ----------------
  draw() {
    const s = this.scene, c = this.ctx, GS = c.GS;
    SFX.drumroll(false); SFX.play('thud'); s.cameras.main.shake(260, 0.01);
    this.at(500, () => {
      SFX.play('whistleLong');
      const { t, glowT } = this.bigText('DRAW', 160, '#ffffff', 120, { glow: '#9fd0ff', stroke: '#1b3a66' });
      [t, glowT].forEach((o) => { o.setAlpha(1).setScale(0); s.tweens.add({ targets: o, scale: 1, duration: 800, ease: 'Elastic.easeOut' }); });
      s.tweens.add({ targets: glowT, alpha: { from: 0.7, to: 0.2 }, duration: 800, yoyo: true, repeat: -1 });
    });
    const y = PODIUM_Y + 60;
    const left = CharacterArt.createFigure(s, GS.playerId, { scale: FIG_SCALE }).setDepth(20).setPosition(-120, y).setFacing(1);
    const right = CharacterArt.createFigure(s, GS.aiId, { scale: FIG_SCALE }).setDepth(20).setPosition(W + 120, y).setFacing(-1);
    const g = s.add.graphics().setDepth(15); g.fillStyle(0x000000, 0.3).fillEllipse(W / 2, y + 6, 520, 30);
    this.at(700, () => { this.runIn(left, 500, 1400); this.runIn(right, 780, 1400, () => this.handshake(left, right)); });
    this.at(3800, () => this.bottomBar('무승부! 아쉽게 승부를 가리지 못했습니다', '#e8f2ff'));
    this.at(4200, () => this.buttons([
      { label: '다시 하기', color: 0xe8a010, onClick: c.retry },
      { label: '메인으로 돌아가기', color: 0x2f80ed, onClick: c.toMain },
    ]));
  }

  handshake(a, b) {
    const s = this.scene;
    s.tweens.add({ targets: a, x: 560, duration: 450, ease: 'Sine.easeOut' });
    s.tweens.add({ targets: b, x: 720, duration: 450, ease: 'Sine.easeOut', onComplete: () => {
      SFX.play('click');
      s.tweens.add({ targets: [a, b], y: '+=8', duration: 140, yoyo: true, repeat: 5 });   // 악수하며 위아래로 흔들기
      this.at(1400, () => { a.play('cheer'); b.play('cheer'); });
    } });
  }
}
