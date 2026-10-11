// 드리블 런 순수 로직 (Phaser 의존 없음) — 러너 물리, 수비수 AI, 패턴 생성.
export const CFG = {
  D: 85,            // 결승선 거리(m)
  TIME: 10,         // 제한시간(s)
  PPM: 28,          // 픽셀/미터
  LW: 150,          // 레인 폭(px)
  BASE: 3.0,        // 기본 속도(m/s)
  IMPULSE: 1.9,     // 연타 1회당 속도 추가
  DECAY: 2.0,       // 부스트 감쇠(1/s)
  MAXB: 11,        // 부스트 속도 상한
  STUN: 0.5, INVULN: 0.7,
  VIEW: 19,         // 이 거리(m) 안으로 들어오면 수비수 활성화
  DEF_VY: 2.4,      // 수비수가 내려오는 속도(m/s)
  RUNNER_Y: 545, TOP: 72,
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 수비수 패턴: 양쪽 트랙이 공유. {id,d,lane,type,dir,phase}
export function makePattern(rng) {
  const out = []; let d = 15 + rng() * 3, id = 0, lastLane = 1;
  while (d < CFG.D - 5) {
    const r = rng();
    const type = r < 0.42 ? 'walker' : r < 0.72 ? 'cutter' : 'slider';
    let lane = Math.floor(rng() * 3); if (rng() < 0.4) lane = lastLane;
    const dir = rng() < 0.5 ? -1 : 1;
    out.push({ id: id++, d, lane, type, dir, phase: rng() * 6.28 });
    lastLane = lane;
    if (rng() < 0.28) { // 두 번째 수비수(다른 레인) — 한 레인은 비워둠
      const l2 = (lane + 1 + Math.floor(rng() * 2)) % 3;
      out.push({ id: id++, d: d + 1.5 + rng() * 2, lane: l2, type: rng() < 0.5 ? 'walker' : 'cutter', dir: rng() < 0.5 ? -1 : 1, phase: rng() * 6.28 });
    }
    d += 7.2 + rng() * 3.6;
  }
  return out;
}

export class DefSim {
  constructor(p, mirror) {
    this.id = p.id; this.type = p.type; this.d = p.d;
    this.base = mirror ? 2 - p.lane : p.lane; this.dir = mirror ? -p.dir : p.dir; this.x = this.base; this.phase = p.phase;
    this.state = 'idle'; this.t = 0; this.hit = false; this.tx = 0; this.lunged = false; this.angle = 0;
  }
  update(dt, run) {
    const ahead = this.d - run.dist;
    if (this.state === 'idle') { if (ahead <= CFG.VIEW) { this.state = 'walk'; this.t = 0; } else return; }
    this.t += dt;
    if (this.hit) { this.d += 3 * dt; this.x += this.dir * 2 * dt; this.angle += 14 * dt; return; }
    if (this.state === 'walk') {
      this.d -= CFG.DEF_VY * dt;
      if (this.type === 'walker') this.x = this.base + 0.4 * Math.sin(this.t * 2.2 + this.phase);
      else if (this.type === 'cutter') this.x = Math.max(0, Math.min(2, this.x + this.dir * 0.95 * dt));
      else { this.x = this.base + 0.25 * Math.sin(this.t * 2 + this.phase); if (!this.lunged && ahead <= 10.5) { this.state = 'tele'; this.t = 0; } }
    } else if (this.state === 'tele') {
      this.d -= 0.5 * dt;
      if (this.t >= 0.4) { this.state = 'lunge'; this.t = 0; this.tx = Math.max(0, Math.min(2, run.x)); this.lunged = true; }
    } else if (this.state === 'lunge') {
      this.d -= 6.5 * dt; const dx = this.tx - this.x; this.x += Math.sign(dx) * Math.min(Math.abs(dx), 6 * dt);
      if (this.t >= 0.4) { this.state = 'walk'; this.t = 0; this.base = this.x; this.type = 'walker'; }
    }
  }
}

export class RunnerSim {
  constructor(pattern, mirror, onEvent) {
    this.dist = 0; this.boost = 0; this.lane = 1; this.x = 1; this.stunT = 0; this.invT = 0; this.finished = false;
    this.hits = 0; this.presses = 0; this.onEvent = onEvent || (() => {});
    this.defs = pattern.map((p) => new DefSim(p, mirror));
  }
  get speed() { return this.stunT > 0 ? 0 : CFG.BASE + this.boost; }
  press() { if (this.stunT > 0 || this.finished) return false; this.boost = Math.min(CFG.MAXB, this.boost + CFG.IMPULSE); this.presses++; this.onEvent('press'); return true; }
  moveLane(dir) { if (this.stunT > 0 || this.finished) return false; const n = Math.max(0, Math.min(2, this.lane + dir)); if (n === this.lane) return false; this.lane = n; this.onEvent('lane', dir); return true; }
  stun(def) { this.stunT = CFG.STUN; this.boost = 0; this.hits++; this.onEvent('hit', def); }
  update(dt) {
    if (this.finished) return;
    this.x += (this.lane - this.x) * (1 - Math.exp(-dt * 16));
    if (this.stunT > 0) { this.stunT -= dt; if (this.stunT <= 0) { this.stunT = 0; this.invT = CFG.INVULN; this.onEvent('recover'); } }
    else { this.boost *= Math.exp(-CFG.DECAY * dt); if (this.invT > 0) this.invT -= dt; this.dist += this.speed * dt; }
    if (this.dist >= CFG.D) { this.dist = CFG.D; this.finished = true; this.onEvent('finish'); return; }
    for (const df of this.defs) {
      df.update(dt, this);
      if (df.hit || df.state === 'idle' || this.stunT > 0 || this.invT > 0) continue;
      const dy = (df.d - this.dist) * CFG.PPM, dx = (df.x - this.x) * CFG.LW;
      const wide = df.state === 'lunge' ? 14 : 0;
      if (dy > -42 && dy < 64 && Math.abs(dx) < 50 + wide) { df.hit = true; this.stun(df); }
    }
  }
}
