import { SCENES, SIDE } from '../../config/constants.js';
import { MiniGameScene } from '../../core/MiniGameScene.js';
import { SFX } from '../../core/SoundFX.js';
import { PKField } from './pk/PKField.js';
import { PKGauge } from './pk/PKGauge.js';
import { PKHud } from './pk/PKHud.js';
import { PKKicker, PKKeeper, PKBall } from './pk/PKActors.js';
import { aiKeeperDir, aiShot, resolveAttack, resolveDefense } from './pk/PKAI.js';
import { TARGET, DIR_NAME, GL, GR, GT } from './pk/PKConst.js';

// 미니게임 1: PK 승부차기. 3라운드 = (공격 -> 수비) x 3
export class PKScene extends MiniGameScene {
  constructor() { super(SCENES.PK); }
  preload() {
    if (!this.textures.exists('sports_equip')) this.load.atlasXML('sports_equip', 'assets/kenney/sports/Spritesheet/sheet_equipment.png', 'assets/kenney/sports/Spritesheet/sheet_equipment.xml');
  }
  create() {
    this.setupMini();
    this.state = 'intro'; this.kickIdx = 0; this.token = 0; this.dir = null; this.actors = null;
    this.field = new PKField(this);
    this.gauge = new PKGauge(this);
    this.ball = new PKBall(this);
    this.hud = new PKHud(this, { onDir: (d) => this.pressDir(d), onShoot: () => this.pressShoot() });
    const kb = this.input.keyboard;
    kb.on('keydown-LEFT', () => this.pressDir(-1)); kb.on('keydown-UP', () => this.pressDir(0));
    kb.on('keydown-RIGHT', () => this.pressDir(1)); kb.on('keydown-SPACE', () => this.pressShoot());
    this.hud.intro(() => this.nextKick());
  }
  update(time) {
    this.gauge.update(time);
    const left = this.hud.update(time);
    if (this.state === 'defend' && left <= 0) this.lockGuess(0, true);
  }

  // ----- 진행 -----
  get isAttack() { return this.kickIdx % 2 === 0; }
  get round() { return (this.kickIdx >> 1); }
  nextKick() {
    if (this.kickIdx >= 6) return this.endGame();
    this.clearActors(); this.ball.reset(); this.field.clearAim(); this.dir = null; this.token++;
    this.hud.setRound(this.round + 1);
    const atk = this.isAttack, kId = atk ? this.playerId : this.aiId, gId = atk ? this.aiId : this.playerId;
    this.actors = { kicker: new PKKicker(this, kId), keeper: new PKKeeper(this, gId) };
    SFX.play('whistle');
    if (atk) {
      this.state = 'aim'; this.hud.showShoot(true); this.gauge.hide();
      this.hud.setPrompt('공격! 방향을 고르세요', '← 왼쪽   ↑ 가운데   → 오른쪽');
    } else {
      this.state = 'defend'; this.hud.showShoot(false); this.gauge.hide();
      this.hud.setPrompt('수비! 슛 방향을 예측하세요', '← ↑ → 로 몸을 던지세요');
      this.shot = aiShot(); this.hud.startRing();
    }
  }
  clearActors() {
    if (!this.actors) return;
    this.actors.kicker.destroy(); this.actors.keeper.destroy(); this.actors = null; this.hud.stopRing();
  }

  // ----- 입력 (키보드/버튼/테스트 공용) -----
  pressDir(d) {
    if (this.finished) return;
    if (this.state === 'aim' || this.state === 'gauge') {
      this.dir = d; this.field.showAim(d); SFX.play('click');
      this.hud.setPrompt('방향: ' + DIR_NAME[d], '초록 구간에서 SPACE 로 슛!');
      if (this.state === 'aim') {
        this.state = 'gauge'; this.gauge.show(); this.gauge.start();
        const tk = this.token; this.time.delayedCall(7000, () => { if (this.state === 'gauge' && tk === this.token) this.pressShoot(); });
      }
    } else if (this.state === 'defend') this.lockGuess(d, false);
  }
  pressShoot() {
    if (this.state === 'aim') { this.hud.setPrompt('먼저 방향을 고르세요!', '← ↑ → 또는 화면 버튼'); return; }
    if (this.state !== 'gauge' || this.finished) return;
    const zone = this.gauge.stop(); this.state = 'busy';
    this.time.delayedCall(350, () => { this.gauge.hide(); });
    this.hud.showShoot(false);
    SFX.play(zone === 'perfect' ? 'perfect' : zone === 'good' ? 'good' : 'miss');
    this.hud.setPrompt({ perfect: 'PERFECT!', good: 'GOOD', bad: 'BAD...' }[zone], '');
    const dir = this.dir, kd = aiKeeperDir(), out = resolveAttack(dir, kd, zone);
    this.runKick({ dir, keeperDir: out === 'weak' ? dir : kd, outcome: out, wide: false, mine: true });
  }
  lockGuess(d, timeout) {
    if (this.state !== 'defend') return;
    this.state = 'busy'; this.hud.stopRing(); this.field.showAim(d, 0x6ec6ff);
    this.hud.setPrompt(timeout ? '시간 초과! 가운데로...' : '예측: ' + DIR_NAME[d], '');
    const out = resolveDefense(this.shot, d);
    this.runKick({ dir: this.shot.dir, keeperDir: d, outcome: out, wide: this.shot.wide, mine: false });
  }

  // ----- 킥 연출 -----
  runKick({ dir, keeperDir, outcome, wide, mine }) {
    const { kicker, keeper } = this.actors, tk = this.token, t = TARGET[dir];
    kicker.runUp(() => {
      if (tk !== this.token) return;
      SFX.play('kick'); this.cameras.main.shake(80, 0.002);
      keeper.dive(keeperDir, 400);
      let to = { x: t.x, y: t.y };
      const o = { scale: 1.45, arc: 70, ms: 650 };
      if (outcome === 'over') { to = { x: t.x + (wide ? (dir || 1) * 330 : dir * 30), y: GT - (wide ? 20 : 110) }; o.scale = 1.1; o.arc = 20; o.ms = 700; }
      if (outcome === 'post') to = { x: dir < 0 ? GL : GR, y: GT + 40 };
      if (outcome === 'weak') { o.ms = 1000; o.arc = 20; to = { x: t.x, y: t.y + 20 }; }
      o.onComplete = () => { if (tk === this.token) this.settle({ dir, outcome, to, mine }); };
      this.ball.fly(to, o);
    });
  }
  settle({ dir, outcome, to, mine }) {
    const goal = outcome === 'goal', cam = this.cameras.main, hud = this.hud, ball = this.ball, { kicker, keeper } = this.actors;
    if (goal) {
      SFX.play('goal'); hud.popup(mine ? 'GOAL' : 'MISS', 'GOAL!'); this.field.netBulge(to.x, to.y); cam.flash(180, 255, 255, 255);
      this.tweens.add({ targets: ball.s, y: to.y + 14, scale: 1.3, duration: 300, ease: 'Sine.easeOut' });
      keeper.react(false); kicker.react(true);
    } else if (outcome === 'save' || outcome === 'weak') {
      SFX.play('save'); hud.popup('SAVED', 'SAVED!'); cam.shake(160, 0.006); keeper.react(true); kicker.react(false);
      ball.fly({ x: to.x + (dir || 1) * (outcome === 'weak' ? 20 : 70), y: to.y + 120 }, { ms: 380, scale: 1.7, arc: 40, spin: 8 });
    } else if (outcome === 'post') {
      SFX.play('post'); hud.popup('POST', 'POST!'); cam.shake(200, 0.008); kicker.react(false);
      ball.fly({ x: to.x - (dir || 1) * 40, y: to.y + 230 }, { ms: 450, scale: 2.2, arc: 50, spin: 10 });
    } else {
      SFX.play('miss'); hud.popup('MISS', 'MISS!'); kicker.react(false); keeper.react(true);
      this.tweens.add({ targets: ball.s, alpha: 0, duration: 300 });
    }
    hud.setResult(mine ? SIDE.PLAYER : SIDE.AI, this.round, goal);
    hud.setPrompt(mine ? (goal ? '나이스 슛!' : '아쉬워요...') : (goal ? '실점...' : '나이스 세이브!'), '');
    const tk = this.token;
    this.time.delayedCall(1700, () => { if (tk !== this.token || this.finished) return; this.kickIdx++; this.nextKick(); });
  }

  endGame() {
    this.state = 'over'; this.clearActors(); this.gauge.hide(); this.hud.showShoot(false); this.field.clearAim();
    const p = this.hud.goals('player'), a = this.hud.goals('ai');
    SFX.play('whistle'); this.hud.setPrompt(`최종 ${p} : ${a}`, '');
    const winner = p > a ? SIDE.PLAYER : p < a ? SIDE.AI : 'draw';
    this.time.delayedCall(700, () => this.finishMini({ winner, detail: `${p}:${a}` }));
  }
}
