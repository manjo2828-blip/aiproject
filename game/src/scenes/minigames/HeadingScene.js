import { SCENES, SIDE } from '../../config/constants.js';
import { CHARACTERS } from '../../config/characters.js';
import { MiniGameScene } from '../../core/MiniGameScene.js';
import { SFX } from '../../core/SoundFX.js';
import { Button, txt } from '../../ui/Button.js';
import { HeadingField, GROUND_Y, GOAL } from './heading/HeadingField.js';
import { TimingRing } from './heading/TimingRing.js';
import { Contender, Ball, HEAD_Y } from './heading/HeadingActors.js';
import { HeadingHUD } from './heading/HeadingHUD.js';
import { judge, decide, matchResult } from './heading/HeadingJudge.js';
import { aiPressError } from './heading/HeadingAI.js';
import { popup, burst, confetti, flash, hitstop, ripple, GRADE_TXT, GRADE_HEX } from './heading/HeadingFX.js';

const MAX_ROUND = 3, RESOLVE_MS = 170, P_X = 510, A_X = 770, CX = 640;

// 미니게임 2: 공중전 헤딩 대결 - 줄어드는 링과 공 도착 타이밍 맞추기
export class HeadingScene extends MiniGameScene {
  constructor() { super(SCENES.HEADING); }

  preload() {
    if (!this.textures.exists('sports_equip')) this.load.atlasXML('sports_equip', 'assets/kenney/sports/Spritesheet/sheet_equipment.png', 'assets/kenney/sports/Spritesheet/sheet_equipment.xml');
  }

  create() {
    this.setupMini();
    this.state = 'intro'; this.round = 0; this.goals = { player: 0, ai: 0 }; this.cur = null; this._q = []; this._aiAuto = this._aiAuto || []; this._auto = this._auto || [];
    this.field = new HeadingField(this);
    const pc = CHARACTERS[this.playerId], ac = CHARACTERS[this.aiId];
    this.who = {
      player: new Contender(this, SIDE.PLAYER, this.playerId, P_X, 1),
      ai: new Contender(this, SIDE.AI, this.aiId, A_X, -1),
    };
    this.rings = { player: new TimingRing(this, P_X, HEAD_Y, pc.accent), ai: new TimingRing(this, A_X, HEAD_Y, ac.accent) };
    if (pc.accent === ac.accent) this.rings.ai.color = 0xffffff;
    this.ball = new Ball(this);
    this.hud = new HeadingHUD(this, this.playerId, this.aiId);
    this.names();
    this.buildInput();
    this.hud.showIntro(2800, () => this.hud.countdown(() => this.nextCross()));
  }

  names() {
    [['player', 'YOU', P_X], ['ai', 'CPU', A_X]].forEach(([side, tag, x]) => {
      const c = CHARACTERS[this.who[side].id];
      this.add.rectangle(x, GROUND_Y + 40, 190, 34, 0x000000, 0.55).setDepth(12).setStrokeStyle(2, c.accent);
      txt(this, x, GROUND_Y + 40, `${tag}  ${c.name}`, 22, c.accentHex).setDepth(13);
    });
  }

  buildInput() {
    const kb = this.input.keyboard;
    kb.addCapture('SPACE');
    kb.on('keydown-SPACE', (e) => { if (!e.repeat) this.onPress(); });
    this.input.on('pointerdown', () => this.onPress());     // 화면 어디든 / JUMP 버튼 포함
    this.jumpBtn = new Button(this, 1130, 650, 'JUMP [SPACE]', { w: 240, h: 76, color: 0xe67e22, fontSize: 30, sound: null }).setDepth(120);
  }

  // ---------------- 크로스 진행 ----------------
  nextCross() {
    this.round++;
    this.hud.setRound(this.round, MAX_ROUND);
    this.hud.banner(this.round === 1 ? 'KICK OFF!' : 'NEXT CROSS', '#ffffff', 600, 64);
    ['player', 'ai'].forEach((s) => { this.who[s].reset(); this.rings[s].hide(); });
    this.ball.hide();
    this.after(900, () => this.startCross());
  }

  startCross() {
    const now = performance.now(), T = 1700 + Math.random() * 400;
    const sx = CX + (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 120);
    this.cur = {
      start: now, arrival: now + T, T, sx, ex: CX, ey: HEAD_Y - 14,
      player: { pressed: false, t: Infinity, grade: 'miss', err: null },
      ai: { pressed: false, t: now + T + aiPressError(), grade: 'miss', err: null, plan: true },
      auto: null,
    };
    if (this._aiAuto.length) { const v = this._aiAuto.shift(); if (v !== null && v !== undefined) this.cur.ai.t = this.cur.arrival + v; }
    const a = this._auto.length ? this._auto.shift() : null;
    if (a !== null && a !== undefined) this.cur.auto = this.cur.arrival + a;
    this.rings.player.start(this.cur.arrival, T); this.rings.ai.start(this.cur.arrival, T);
    this.state = 'flight';
  }

  // 실제 시간(ms) 기준 예약 (프레임이 느려도 흐름이 어긋나지 않게 performance.now 기준)
  after(ms, fn) { this._q.push({ t: performance.now() + ms, fn }); }

  update() {
    if (!this.who) return;
    const nowQ = performance.now();
    if (this._q.length) { const due = this._q.filter((e) => e.t <= nowQ); this._q = this._q.filter((e) => e.t > nowQ); due.forEach((e) => e.fn()); }
    ['player', 'ai'].forEach((s) => this.who[s].tick());
    const now = performance.now();
    this.rings.player.draw(now); this.rings.ai.draw(now);
    if (this.state !== 'flight') return;
    const c = this.cur;
    this.ball.fall((now - c.start) / c.T, c.sx, c.ex, c.ey);
    if (c.auto !== null && now >= c.auto) { const t = c.auto; c.auto = null; this.onPress(t); }
    if (c.ai.plan && now >= c.ai.t) { c.ai.plan = false; this.press('ai', c.ai.t); }
    if (now >= c.arrival + RESOLVE_MS) this.resolve();
  }

  // ---------------- 입력 / 판정 ----------------
  onPress(t) { SFX.unlock(); if (this.state === 'flight') this.press('player', t === undefined ? performance.now() : t); }

  press(side, t) {
    const c = this.cur, r = c[side];
    if (r.pressed || this.state !== 'flight') return;    // 중복 입력 무시
    r.pressed = true; r.t = t; r.err = t - c.arrival;
    const j = judge(r.err); r.grade = j.grade;
    this.rings[side].freeze(t, j.grade);
    const w = this.who[side];
    w.jump((side === 'player' ? 1 : -1) * 38);
    if (side === 'player') SFX.play('jump');
    const col = GRADE_HEX[j.grade];
    popup(this, w.homeX, HEAD_Y - 150, j.tooEarly ? 'TOO EARLY' : GRADE_TXT[j.grade], col, j.tooEarly ? 40 : (side === 'player' ? 56 : 44));
    if (j.grade === 'miss') w.stumble();
    if (side === 'player') SFX.play(j.tooEarly ? 'miss' : j.grade);
    ripple(this, w.homeX, HEAD_Y, parseInt(col.slice(1), 16));
  }

  resolve() {
    if (this.state !== 'flight') return;
    this.state = 'resolve';
    const c = this.cur, now = performance.now();
    ['player', 'ai'].forEach((s) => {
      if (c[s].pressed) return;
      c[s].grade = 'miss'; c[s].pressed = true; this.rings[s].freeze(now, 'miss');
      popup(this, this.who[s].homeX, HEAD_Y - 150, 'MISS', GRADE_HEX.miss, s === 'player' ? 56 : 44);
      if (s === 'player') SFX.play('miss');
    });
    const o = decide({ grade: c.player.grade, t: c.player.t }, { grade: c.ai.grade, t: c.ai.t });
    const winner = o === 'a' ? 'player' : o === 'b' ? 'ai' : null;
    if (winner) this.header(winner); else this.noGoal();
  }

  // ---------------- 연출 ----------------
  header(winner) {
    const loser = winner === 'player' ? 'ai' : 'player', Wn = this.who[winner], Ls = this.who[loser];
    const dir = winner === 'player' ? 1 : -1, bx = this.ball.spr.x, by = this.ball.spr.y;
    this.state = 'anim';
    this.rings[winner].fadeOut(); this.rings[loser].fadeOut();
    Wn.holder.setDepth(15); Wn.jump(dir * (CX - Wn.homeX) * 0.55, 1.15);
    Ls.push(-dir);
    SFX.play('header'); flash(this, 0.5, 240); hitstop(this, 190);
    this.cameras.main.shake(200, 0.009);
    burst(this, bx, by, [0xffffff, 0xffd700, 0xff9800], 22, 260);
    ripple(this, bx, by, 0xffffff);
    this.after(230, () => this.shoot(winner, dir));
  }

  shoot(winner, dir) {
    const tx = CX + dir * (20 + Math.random() * 60), ty = GOAL.line - 52;
    SFX.play('kick');
    this.ball.shadow.setVisible(false);
    this.tweens.add({ targets: this.ball.spr, x: tx, y: ty, scale: 2.2, angle: this.ball.spr.angle + 540, duration: 520, ease: 'Quad.Out', onComplete: () => this.scored(winner, tx, ty) });
  }

  scored(winner, tx, ty) {
    this.goals[winner]++;
    this.hud.setGoals(winner, this.goals[winner]);
    this.field.shakeNet(); this.field.cheerCrowd();
    SFX.play('goal'); this.cameras.main.shake(260, 0.006);
    burst(this, tx, ty, [0xffffff, 0xffd700], 18, 200);
    confetti(this, 36);
    this.tweens.add({ targets: this.ball.spr, y: ty + 22, scale: 2.1, duration: 260, ease: 'Bounce.Out' });
    this.hud.banner(winner === 'player' ? 'GOAL!' : 'CPU GOAL', winner === 'player' ? '#ffd700' : '#ff8a80', 1100, 110);
    this.who[winner].celebrate(); this.who[winner === 'player' ? 'ai' : 'player'].sad();
    this.after(2100, () => this.afterCross());
  }

  noGoal() {
    this.state = 'anim';
    const dir = this.cur.sx < CX ? -1 : 1, b = this.ball.spr;
    SFX.play('save'); SFX.play('whistle');
    this.rings.player.fadeOut(); this.rings.ai.fadeOut();
    this.ball.shadow.setVisible(false);
    this.tweens.add({
      targets: b, y: GROUND_Y + 8, scale: 3, duration: 260, ease: 'Quad.In',
      onComplete: () => {
        SFX.play('kick');
        this.tweens.add({ targets: b, y: GROUND_Y - 70, duration: 220, yoyo: true, ease: 'Quad.Out' });
        this.tweens.add({ targets: b, x: b.x + dir * 420, angle: b.angle + dir * 700, duration: 1100, ease: 'Quad.Out' });
      },
    });
    this.who.player.sad(); this.who.ai.sad();
    this.hud.banner('NO GOAL', '#cfd8dc', 1100, 96);
    this.after(2000, () => this.afterCross());
  }

  afterCross() {
    const res = matchResult(this.goals, this.round, MAX_ROUND, 2);
    if (res) return this.end(res);
    return this.nextCross();
  }

  end(res) {
    this.state = 'done';
    this.finishMini({ winner: res, detail: `${this.goals.player}:${this.goals.ai}` });
  }

  // ---------------- 테스트/디버그 ----------------
  msToArrival() { return this.cur && this.state === 'flight' ? this.cur.arrival - performance.now() : null; }
  // 자동 플레이: 크로스별 (도착 대비 ms 오프셋 | null=안 누름) 배열
  debugAI(offsets) { this._aiAuto = offsets.slice(); }
  debugAuto(offsets) { this._auto = offsets.slice(); return this._auto.length; }
}
