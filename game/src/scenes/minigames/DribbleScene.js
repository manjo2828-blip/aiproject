import { SCENES, W, H, SIDE } from '../../config/constants.js';
import { CHARACTERS } from '../../config/characters.js';
import { MiniGameScene } from '../../core/MiniGameScene.js';
import { SFX } from '../../core/SoundFX.js';
import { CFG, makePattern, mulberry32, RunnerSim } from './dribble/DribbleSim.js';
import { DribbleAI } from './dribble/DribbleAI.js';
import { DribbleTrack, ensureTrackTextures } from './dribble/DribbleTrack.js';
import { RunnerView, DefenderViews } from './dribble/Actors.js';
import { DribbleHUD } from './dribble/DribbleHUD.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// 미니게임 3: 수비수 피하기 드리블 런 (연타 + 회피)
export class DribbleScene extends MiniGameScene {
  constructor() { super(SCENES.DRIBBLE); }

  create() {
    this.setupMini();
    ensureTrackTextures(this);
    const P = CHARACTERS[this.playerId], A = CHARACTERS[this.aiId];
    this.add.rectangle(W / 2, H / 2, W, H, 0x0b1f0e).setDepth(-5);
    const pattern = makePattern(mulberry32((Math.random() * 1e9) | 0));   // 양쪽 동일 패턴
    this.trackP = new DribbleTrack(this, 40, 0); this.trackA = new DribbleTrack(this, 760, 0);
    this.ps = new RunnerSim(pattern, false, (e, a) => this.onPlayerEvent(e, a));
    this.as = new RunnerSim(pattern, true, (e, a) => this.onAIEvent(e, a));
    this.ai = new DribbleAI(this.as);
    this.defP = new DefenderViews(this, this.trackP, this.ps.defs); this.defA = new DefenderViews(this, this.trackA, this.as.defs);
    this.runP = new RunnerView(this, this.trackP, P.sportsTeam, P.kit.primary, '나', 10);
    this.runA = new RunnerView(this, this.trackA, A.sportsTeam, A.kit.primary, 'AI', 10);
    this.hud = new DribbleHUD(this, { pName: P.name, aName: A.name, pHex: hex(P.accent), aHex: hex(A.accent), pKit: P.kit.primary, aKit: A.kit.primary },
      { left: () => this.moveLane(-1), right: () => this.moveLane(1), boost: () => this.pressBoost() });
    this.phase = 'intro'; this.elapsed = 0; this.extra = { p: 0, a: 0 }; this.pressTimes = []; this.lastBoostSfx = 0; this.lastPuff = 0;
    this.setupInput();
    // 인트로 → 3,2,1,GO
    const step = (n) => () => { if (n > 0) { this.hud.showBig(String(n), n === 1 ? '#ffe14d' : '#ffffff'); SFX.play('countdown'); } else this.startRun(); };
    this.clock = 0; this.lastT = -1; this.tl = [];
    this.at(2.6, () => { this.hud.hideIntro(); this.phase = 'count'; step(3)(); });
    this.at(3.35, step(2)); this.at(4.1, step(1)); this.at(4.85, step(0));
    this.events.once('shutdown', () => { this.input.keyboard.removeAllListeners('keydown'); });
  }

  // 자체 타임라인 (Phaser Clock 은 저FPS 에서 delta 가 줄어들어 쓰지 않음)
  at(sec, fn) { this.tl.push({ t: this.clock + sec, fn }); }

  setupInput() {
    const kb = this.input.keyboard;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    kb.on('keydown', (e) => {
      if (e.repeat) return;
      const c = e.code;
      if (c === 'ArrowUp' || c === 'KeyW' || c === 'Space') this.pressBoost();
      else if (c === 'ArrowLeft' || c === 'KeyA') this.moveLane(-1);
      else if (c === 'ArrowRight' || c === 'KeyD') this.moveLane(1);
    });
  }

  // --- 공개 입력 메서드 (테스트용 포함) ---
  pressBoost() { if (this.phase !== 'run') return false; return this.ps.press(); }
  moveLane(dir) { if (this.phase !== 'run') return false; return this.ps.moveLane(dir); }

  skipIntro() { this.tl = []; if (this.phase === 'intro' || this.phase === 'count') { this.hud.hideIntro(); this.startRun(); } }

  startRun() {
    this.phase = 'run'; this.hud.showBig('GO!', '#4cd964', 170); SFX.play('go');
  }

  onPlayerEvent(e) {
    const now = this.clock * 1000;
    if (e === 'press') {
      this.pressTimes.push(now);
      if (now - this.lastBoostSfx > 70) { this.lastBoostSfx = now; SFX.play('boost'); }
      if (now - this.lastPuff > 90) { this.lastPuff = now; this.runP.puff(this.ps); }
      this.runP.c.y = CFG.RUNNER_Y + 5; this.tweens.add({ targets: this.runP.c, y: CFG.RUNNER_Y, duration: 90 });
    } else if (e === 'lane') SFX.play('dodge');
    else if (e === 'hit') {
      SFX.play('stun'); this.cameras.main.shake(180, 0.006); this.runP.burst(); this.hud.pop(this.runP.c.x, CFG.RUNNER_Y - 90, '으악!', '#ff6666', 44);
    } else if (e === 'finish') SFX.play('finish');
  }
  onAIEvent(e) {
    if (e === 'hit') { this.runA.burst(); this.hud.pop(this.runA.c.x, CFG.RUNNER_Y - 90, '아야!', '#ffaaaa', 36); }
    else if (e === 'press' && Math.random() < 0.3) this.runA.puff(this.as);
  }

  update(time) {
    const dt = this.lastT < 0 ? 0.016 : Math.min((time - this.lastT) / 1000, 0.05); this.lastT = time;
    this.tick(dt, time);
  }

  // 한 프레임 진행 (테스트에서 직접 호출 가능: scene.tick(1/60))
  tick(dt, time = this.clock * 1000) {
    this.clock += dt;
    for (let i = this.tl.length - 1; i >= 0; i--) if (this.tl[i].t <= this.clock) { const f = this.tl[i].fn; this.tl.splice(i, 1); f(); }
    if (this.phase === 'run') {
      this.elapsed += dt;
      this.ai.update(dt); this.ps.update(dt); this.as.update(dt);
      const pf = this.ps.finished, af = this.as.finished;
      if (pf || af) this.endRace(pf && af ? 'draw' : pf ? SIDE.PLAYER : SIDE.AI, 'finish');
      else if (this.elapsed >= CFG.TIME) {
        const p = Math.round(this.ps.dist), a = Math.round(this.as.dist);
        this.endRace(p === a ? 'draw' : p > a ? SIDE.PLAYER : SIDE.AI, 'time');
      }
    } else if (this.phase === 'end') {
      for (const k of ['p', 'a']) { const s = k === 'p' ? this.ps : this.as; if (s.finished) this.extra[k] += Math.max(0, 6 - this.extra[k] * 1.6) * dt; }
    }
    this.defP.update(dt, this.ps.defs); this.defA.update(dt, this.as.defs);
    this.runP.update(dt, this.ps); this.runA.update(dt, this.as);
    const ep = this.ps.dist + this.extra.p, ea = this.as.dist + this.extra.a;
    this.trackP.scroll(ep, this.ps.speed, dt, this.ps.boost > 3 && this.phase === 'run'); this.trackA.scroll(ea, this.as.speed, dt, this.as.boost > 3 && this.phase === 'run');
    this.pressTimes = this.pressTimes.filter((t) => this.clock * 1000 - t < 1000);
    this.hud.setTime(this.phase === 'intro' || this.phase === 'count' ? CFG.TIME : CFG.TIME - this.elapsed);
    this.hud.setProgress(this.ps.dist, this.as.dist);
    this.hud.setSpeed(this.ps.speed, this.pressTimes.length);
  }

  endRace(winner, how) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    const detail = `${Math.round(this.ps.dist)}m vs ${Math.round(this.as.dist)}m`;
    if (how === 'finish') { SFX.play('finish'); this.hud.showBig('FINISH!', '#ffd700', 140); } else { SFX.play('whistleLong'); this.hud.showBig('TIME UP!', '#ffffff', 130); }
    this.at(how === 'finish' ? 0.9 : 0.7, () => this.finishMini({ winner, detail }));
  }
}
