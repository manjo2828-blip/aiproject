import { CFG } from './DribbleSim.js';

// AI 조종사: 사람처럼 불규칙하게 연타하고, 가끔 수비수를 못 보고 부딪힌다.
// 같은 로직을 "사람 흉내 봇"(튜닝/자동테스트)으로도 쓸 수 있도록 옵션화.
export class DribbleAI {
  constructor(run, opt = {}) {
    this.run = run; const r = Math.random;
    this.rate = opt.rate || (6.4 + r() * 1.4);     // 평균 연타 속도(/s)
    this.blunder = opt.blunder ?? 0.2;             // 수비수 한 명을 무시할 확률
    this.react = opt.react ?? 0.22;                // 반응 지연
    this.t = 0; this.acc = r(); this.ignore = new Set(); this.seen = new Set(); this.pending = null; this.cool = 0;
    this.wob = r() * 6.28;
  }
  update(dt) {
    const run = this.run; if (run.finished) return; this.t += dt;
    // 연타: 느리게 변하는 속도 + 짧은 변동 (후반 약간 지침)
    const rate = Math.max(2, this.rate + 0.9 * Math.sin(this.t * 1.7 + this.wob) + 0.5 * Math.sin(this.t * 5.3) - this.t * 0.05);
    this.acc += rate * dt * (0.75 + Math.random() * 0.5);
    while (this.acc >= 1) { this.acc -= 1; run.press(); }
    // 회피
    this.cool -= dt;
    if (this.pending) { this.pending.t -= dt; if (this.pending.t <= 0) { run.moveLane(this.pending.dir); this.pending = null; this.cool = 0.15; } return; }
    if (this.cool > 0 || run.stunT > 0) return;
    const thr = (lane, strict) => {
      let worst = 99;
      for (const d of run.defs) {
        if (d.hit || d.state === 'idle' || this.ignore.has(d.id)) continue;
        const ahead = d.d - run.dist; if (ahead < -1.2 || ahead > 12) continue;
        if (!this.seen.has(d.id)) { this.seen.add(d.id); if (Math.random() < this.blunder) { this.ignore.add(d.id); continue; } }
        const reach = d.state === 'tele' || d.state === 'lunge' ? 1.5 : (d.type === 'cutter' ? 0.85 : 0.8);
        const px = d.state === 'lunge' ? d.tx : d.x;
        const tt = Math.max(0, ahead) / Math.max(2, run.speed + CFG.DEF_VY);
        if (Math.abs(px - lane) < reach && tt < (strict ? 1.3 : 1.6)) worst = Math.min(worst, tt);
      }
      return worst;
    };
    if (thr(run.lane, true) >= 99) return;
    let best = run.lane, bt = thr(run.lane, true);
    for (const dir of [-1, 1]) { const l = run.lane + dir; if (l < 0 || l > 2) continue; const t2 = thr(l, false); if (t2 > bt + 0.05) { bt = t2; best = l; } }
    if (best !== run.lane) this.pending = { dir: Math.sign(best - run.lane), t: this.react * (0.6 + Math.random() * 0.8) };
  }
}
