import { CFG } from './DribbleSim.js';
import { FONT } from '../../../config/constants.js';

const SC = 3.0;

// 러너(선수 + 공 + 그림자 + 스턴 별)
export class RunnerView {
  constructor(scene, track, team, kit, label, depth = 10) {
    this.scene = scene; this.track = track; this.t = Math.random() * 6; this.lastStun = false;
    const c = this.c = scene.add.container(track.cx, CFG.RUNNER_Y).setDepth(depth);
    this.shadow = scene.add.ellipse(0, 6, 86, 62, 0x000000, 0.28);
    this.aura = scene.add.ellipse(0, 4, 100, 100, kit, 0.0);
    this.body = scene.add.image(0, 0, 'sports_chars', `character${team} (1).png`).setScale(SC).setRotation(-Math.PI / 2);
    this.ball = scene.add.image(0, -66, 'sports_equip', 'ball_soccer1.png').setScale(1.7);
    this.ballShadow = scene.add.ellipse(3, -62, 26, 20, 0x000000, 0.25);
    this.stars = scene.add.image(0, -42, "emote_stars").setScale(1.5).setVisible(false);
    this.tag = scene.add.text(0, 62, label, { fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#000000', strokeThickness: 5, backgroundColor: Phaser.Display.Color.IntegerToColor(kit).rgba, padding: { x: 8, y: 1 } }).setOrigin(0.5);
    c.add([this.shadow, this.aura, this.ballShadow, this.ball, this.body, this.stars, this.tag]);
    this.dust = [];
  }
  update(dt, sim) {
    this.t += dt; const stun = sim.stunT > 0, c = this.c;
    c.x = this.track.cx + (sim.x - 1) * CFG.LW;
    const sp = sim.speed, f = this.t * (6 + sp * 1.3);
    if (stun) {
      this.body.rotation += dt * 22; this.stars.setVisible(true).setRotation(this.t * 8).setPosition(Math.cos(this.t * 9) * 8, -70 + Math.sin(this.t * 9) * 4);
      this.ball.y += (-34 - this.ball.y) * 0.2; this.ball.x = Math.sin(this.t * 14) * 40;
      this.body.setAlpha(1);
    } else {
      if (this.lastStun) { this.body.rotation = -Math.PI / 2; this.stars.setVisible(false); }
      this.body.rotation = -Math.PI / 2 + Math.sin(f) * 0.12 + (sim.lane - sim.x) * 0.25;
      this.body.setScale(SC * (1 + Math.sin(f * 2) * 0.03), SC * (1 + Math.cos(f) * 0.05));
      this.ball.x = Math.sin(f + 1) * 14; this.ball.y = -64 - Math.abs(Math.sin(f)) * 9 - Math.min(14, sp * 0.8);
      this.ball.rotation += dt * sp * 0.9;
      this.body.setAlpha(sim.invT > 0 ? (Math.floor(this.t * 20) % 2 ? 0.35 : 1) : 1);
    }
    this.ballShadow.setPosition(this.ball.x + 4, this.ball.y + 5);
    this.lastStun = stun;
    this.aura.fillAlpha = Math.max(0, (sim.boost - 4) / 14);
    this.aura.setScale(1 + sim.boost * 0.02);
  }
  puff(sim) {   // 부스트 먼지
    const s = this.scene, c = this.c;
    for (let i = 0; i < 2; i++) {
      const d = s.add.circle(c.x + (Math.random() - 0.5) * 30, c.y + 40, 5 + Math.random() * 6, 0xe8e0c8, 0.55).setDepth(c.depth - 1);
      s.tweens.add({ targets: d, y: d.y + 40 + Math.random() * 30, x: d.x + (Math.random() - 0.5) * 50, alpha: 0, scale: 2, duration: 420, onComplete: () => d.destroy() });
    }
  }
  burst(color = 0xffffff) {   // 스턴 임팩트
    const s = this.scene, c = this.c;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.28, p = s.add.circle(c.x, c.y - 20, 4 + Math.random() * 4, i % 2 ? 0xffe14d : color, 1).setDepth(c.depth + 5);
      s.tweens.add({ targets: p, x: c.x + Math.cos(a) * (60 + Math.random() * 50), y: c.y - 20 + Math.sin(a) * (60 + Math.random() * 50), alpha: 0, duration: 450, onComplete: () => p.destroy() });
    }
  }
}

// 수비수 풀
export class DefenderViews {
  constructor(scene, track, sims) {
    this.track = track; this.items = new Map(); this.t = 0;
    sims.forEach((d) => {
      const c = scene.add.container(0, 0).setVisible(false);
      const ring = scene.add.ellipse(0, 4, 84, 64, 0xff2222, 0.0).setStrokeStyle(4, 0xff3030, 0.7);
      const body = scene.add.image(0, 0, 'sports_chars', `characterRed (${1 + (d.id % 5)}).png`).setScale(SC).setRotation(Math.PI / 2).setTint(0xffa0a0);
      const warn = scene.add.image(0, -74, 'emote_exclamation').setScale(0.95).setVisible(false);
      c.add([ring, body, warn]); track.world.add(c);
      this.items.set(d, { c, body, warn, ring });
    });
  }
  update(dt, sims) {
    this.t += dt;
    for (const d of sims) {
      const v = this.items.get(d); if (!v) continue;
      if (d.state === 'idle') { v.c.setVisible(false); continue; }
      const px = CFG.LW * (d.x - 1) + 240;
      v.c.setVisible(d.d - 0 < 1e9).setPosition(px, -d.d * CFG.PPM);
      const lunge = d.state === 'lunge', tele = d.state === 'tele';
      v.warn.setVisible(tele).setScale(0.95 + Math.sin(this.t * 40) * 0.12);
      v.ring.setStrokeStyle(4, 0xff3030, tele ? 1 : lunge ? 1 : 0.55);
      if (d.hit) { v.body.rotation = Math.PI / 2 + d.angle; v.c.alpha = Math.max(0, 1 - d.angle / 5); v.ring.setVisible(false); v.warn.setVisible(false); continue; }
      const sway = Math.sin(this.t * 9 + d.id) * 0.1;
      if (lunge) { const dir = Math.sign(d.tx - d.x) || 0; v.body.rotation = Math.PI / 2 + dir * -0.9; v.body.setScale(SC * 1.15, SC * 1.5); }
      else if (tele) { v.body.rotation = Math.PI / 2 + Math.sin(this.t * 50) * 0.12; v.body.setScale(SC * 1.1, SC * 0.95); }
      else { v.body.rotation = Math.PI / 2 + sway; v.body.setScale(SC); }
    }
  }
}
