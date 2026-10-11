// 날것(raw) WebAudio 합성 효과음/BGM — 외부 오디오 파일 없음.
// 사용: SFX.unlock() (첫 클릭 시) → SFX.play('coin'); SFX.bgm.start('title'); SFX.bgm.stop(); SFX.drumroll(true/false)
class SoundFXClass {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.bgmTimer = null; this.bgmName = null; this.roll = null; }

  // 브라우저 정책상 첫 사용자 입력 후 호출. 여러 번 호출해도 안전.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.7;
      const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
      this.bgmBus = this.ctx.createGain(); this.bgmBus.gain.value = 0.28; this.bgmBus.connect(this.master);
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // --- 저수준 빌딩블록 ---
  tone(freq, dur, { type = 'square', vol = 0.3, slide = 0, delay = 0, attack = 0.005, bus = null, detune = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, { vol = 0.3, filter = 'lowpass', freq = 2000, q = 1, delay = 0, slide = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.sfxBus); s.start(t); s.stop(t + dur + 0.05);
  }
  seq(notes, { type = 'square', vol = 0.25, gap = 0.1, dur = 0.12 } = {}) {
    notes.forEach((n, i) => this.tone(n, dur, { type, vol, delay: i * gap }));
  }

  // --- 효과음 ---
  play(name, arg) {
    if (!this.ctx || this.muted) return;
    const f = this.sounds[name]; if (f) f.call(this, arg);
  }

  get sounds() {
    return this._sounds || (this._sounds = {
      // UI
      click()    { this.tone(660, 0.06, { vol: 0.18 }); this.tone(990, 0.07, { vol: 0.12, delay: 0.04 }); },
      hover()    { this.tone(520, 0.04, { type: 'triangle', vol: 0.1 }); },
      select()   { this.seq([523, 659, 784], { type: 'triangle', gap: 0.06, dur: 0.12, vol: 0.25 }); },
      back()     { this.seq([660, 440], { type: 'triangle', gap: 0.07, dur: 0.1, vol: 0.2 }); },
      // 보드
      diceRoll() { for (let i = 0; i < 9; i++) this.noise(0.04, { filter: 'bandpass', freq: 1800 + Math.random() * 1500, q: 4, vol: 0.28, delay: i * 0.075 }); },
      diceLand(n = 1) { this.tone(300 + n * 90, 0.18, { type: 'triangle', vol: 0.35, slide: -80 }); this.noise(0.08, { freq: 1200, vol: 0.2 }); },
      step()     { this.tone(220 + Math.random() * 40, 0.07, { type: 'triangle', vol: 0.22, slide: -60 }); this.noise(0.05, { freq: 900, vol: 0.12 }); },
      coin()     { this.tone(988, 0.07, { vol: 0.22 }); this.tone(1319, 0.28, { vol: 0.22, delay: 0.07 }); },
      gain()     { this.seq([523, 659, 784, 1047], { gap: 0.07, dur: 0.12, vol: 0.2 }); },
      lose()     { this.seq([392, 330, 262], { type: 'sawtooth', gap: 0.1, dur: 0.16, vol: 0.2 }); },
      yellow()   { this.tone(180, 0.28, { type: 'sawtooth', vol: 0.28, slide: -60 }); this.tone(120, 0.3, { vol: 0.18, delay: 0.1 }); },
      cheer()    { this.noise(0.9, { filter: 'bandpass', freq: 900, q: 0.7, vol: 0.35, slide: 700 }); this.seq([523, 659, 784], { type: 'triangle', gap: 0.1, dur: 0.2, vol: 0.2 }); },
      lap()      { this.seq([392, 523, 659, 784, 1047, 1319], { gap: 0.08, dur: 0.14, vol: 0.2 }); this.noise(0.6, { filter: 'highpass', freq: 5000, vol: 0.12, delay: 0.4 }); },
      tackle()   { this.noise(0.28, { freq: 2400, vol: 0.55, slide: -2000 }); this.tone(140, 0.22, { type: 'sawtooth', vol: 0.4, slide: -90 }); },
      tackleChance() { this.seq([880, 660, 880, 660], { gap: 0.09, dur: 0.1, vol: 0.2 }); },
      event()    { this.seq([659, 784, 988, 784, 1175], { type: 'triangle', gap: 0.08, dur: 0.12, vol: 0.25 }); },
      swap()     { this.tone(300, 0.4, { type: 'sine', vol: 0.3, slide: 900 }); this.tone(1200, 0.4, { type: 'sine', vol: 0.25, slide: -900, delay: 0.05 }); },
      shop()     { this.tone(1568, 0.1, { type: 'sine', vol: 0.25 }); this.tone(2093, 0.3, { type: 'sine', vol: 0.25, delay: 0.1 }); this.tone(1046, 0.4, { type: 'sine', vol: 0.12, delay: 0.1 }); },
      whistle()  { [0, 0.18].forEach((d) => { this.tone(2900, 0.16, { type: 'sine', vol: 0.3, delay: d }); this.tone(3000, 0.16, { type: 'sine', vol: 0.2, delay: d }); }); this.noise(0.3, { filter: 'highpass', freq: 6000, vol: 0.06 }); },
      whistleLong() { this.tone(2900, 0.7, { type: 'sine', vol: 0.3 }); this.tone(3050, 0.7, { type: 'sine', vol: 0.2 }); },
      banner()   { this.noise(0.35, { filter: 'bandpass', freq: 400, q: 1, vol: 0.4, slide: 3000 }); this.seq([392, 523, 784], { type: 'sawtooth', gap: 0.08, dur: 0.25, vol: 0.2 }); },
      // 미니게임 공용
      kick()     { this.tone(150, 0.12, { type: 'sine', vol: 0.55, slide: -90 }); this.noise(0.07, { freq: 1500, vol: 0.3 }); },
      kickHard() { this.tone(110, 0.2, { type: 'sine', vol: 0.7, slide: -70 }); this.noise(0.12, { freq: 2200, vol: 0.45 }); },
      gaugeTick(){ this.tone(1000, 0.025, { vol: 0.06 }); },
      post()     { this.tone(1500, 0.3, { type: 'sine', vol: 0.4, slide: -300 }); this.tone(900, 0.3, { type: 'triangle', vol: 0.3 }); },
      save()     { this.noise(0.12, { freq: 800, vol: 0.5 }); this.tone(200, 0.15, { vol: 0.3, slide: -100 }); },
      goal()     { this.noise(1.2, { filter: 'bandpass', freq: 800, q: 0.6, vol: 0.45, slide: 1200 }); this.seq([523, 659, 784, 1047, 784, 1047, 1319], { gap: 0.09, dur: 0.16, vol: 0.22 }); },
      miss()     { this.tone(400, 0.4, { type: 'sawtooth', vol: 0.25, slide: -300 }); },
      perfect()  { this.seq([880, 1175, 1568], { gap: 0.06, dur: 0.12, vol: 0.25 }); this.noise(0.3, { filter: 'highpass', freq: 7000, vol: 0.12 }); },
      good()     { this.seq([700, 988], { type: 'triangle', gap: 0.07, dur: 0.12, vol: 0.28 }); },
      jump()     { this.tone(250, 0.18, { vol: 0.22, slide: 400 }); },
      header()   { this.tone(180, 0.1, { type: 'sine', vol: 0.6, slide: -80 }); this.noise(0.06, { freq: 1000, vol: 0.3 }); },
      boost()    { this.tone(300, 0.08, { vol: 0.12, slide: 500 }); },
      stun()     { this.tone(200, 0.4, { type: 'sawtooth', vol: 0.3, slide: -150 }); this.noise(0.25, { freq: 700, vol: 0.4 }); this.seq([700, 500, 700, 500], { type: 'triangle', gap: 0.07, dur: 0.07, vol: 0.15 }); },
      dodge()    { this.noise(0.12, { filter: 'bandpass', freq: 1500, q: 2, vol: 0.2, slide: 1500 }); },
      countdown(){ this.tone(660, 0.18, { vol: 0.3 }); },
      go()       { this.tone(1046, 0.4, { vol: 0.32 }); this.tone(1568, 0.4, { vol: 0.2 }); },
      finish()   { this.noise(0.5, { filter: 'highpass', freq: 3000, vol: 0.25 }); this.seq([784, 988, 1175, 1568], { gap: 0.08, dur: 0.18, vol: 0.22 }); },
      winMini()  { this.seq([523, 659, 784, 1047], { gap: 0.1, dur: 0.18, vol: 0.25 }); },
      loseMini() { this.seq([392, 349, 311, 262], { type: 'sawtooth', gap: 0.14, dur: 0.22, vol: 0.2 }); },
      drawMini() { this.seq([523, 523], { type: 'triangle', gap: 0.15, dur: 0.2, vol: 0.25 }); },
      // 결과 화면
      reveal()   { this.tone(1200, 0.05, { vol: 0.12 }); },
      thud()     { this.tone(70, 0.5, { type: 'sine', vol: 0.8, slide: -30 }); this.noise(0.3, { freq: 300, vol: 0.5 }); },
      fanfare()  {
        [[523, 0], [523, 0.15], [523, 0.3], [659, 0.45], [523, 0.7], [659, 0.85], [784, 1.1]].forEach(([f, d]) => { this.tone(f, 0.25, { vol: 0.25, delay: d }); this.tone(f / 2, 0.25, { type: 'triangle', vol: 0.25, delay: d }); });
        this.tone(1047, 1.0, { vol: 0.25, delay: 1.35 }); this.tone(784, 1.0, { vol: 0.18, delay: 1.35 }); this.noise(1.5, { filter: 'highpass', freq: 5000, vol: 0.12, delay: 1.35 });
      },
      confetti() { this.noise(0.4, { filter: 'bandpass', freq: 2500, q: 0.8, vol: 0.4, slide: -1500 }); },
      sadTrombone() { [[311, 0], [293, 0.45], [277, 0.9]].forEach(([f, d]) => this.tone(f, 0.42, { type: 'sawtooth', vol: 0.25, delay: d })); this.tone(262, 1.1, { type: 'sawtooth', vol: 0.25, delay: 1.35, slide: -60 }); },
      samba()    { [0, 0.25, 0.5, 0.75].forEach((d, i) => { this.tone(i % 2 ? 180 : 120, 0.1, { type: 'sine', vol: 0.5, delay: d, slide: -50 }); this.noise(0.05, { filter: 'highpass', freq: 6000, vol: 0.15, delay: d + 0.125 }); }); },
    });
  }

  // 서스펜스 드럼 롤 (스네어 연타, 점점 커짐)
  drumroll(on) {
    if (!this.ctx) return;
    if (!on) { clearInterval(this.roll); this.roll = null; return; }
    if (this.roll) return;
    let n = 0;
    this.roll = setInterval(() => {
      if (this.muted) return; n++;
      const v = Math.min(0.5, 0.12 + n * 0.008);
      this.noise(0.07, { filter: 'bandpass', freq: 3000, q: 0.8, vol: v });
      this.tone(180, 0.06, { type: 'triangle', vol: v * 0.8, slide: -40 });
    }, 60);
  }

  // --- BGM: 코드 진행 + 베이스 + 멜로디 + 킥/하이햇 루프 ---
  get bgm() { return this._bgm || (this._bgm = { start: (n = 'title') => this.startBgm(n), stop: () => this.stopBgm() }); }
  startBgm(name) {
    if (!this.ctx) return;
    if (this.bgmName === name && this.bgmTimer) return;
    this.stopBgm(); this.bgmName = name;
    const songs = {
      title: { bpm: 124, chords: [[261, 329, 392], [220, 261, 329], [174, 220, 261], [196, 247, 294]], lead: [523, 0, 659, 784, 659, 0, 523, 392, 440, 0, 523, 659, 587, 0, 494, 392], wave: 'square' },
      board: { bpm: 108, chords: [[196, 247, 294], [220, 277, 330], [174, 220, 261], [196, 247, 294]], lead: [392, 0, 494, 0, 587, 494, 392, 0, 440, 0, 523, 0, 659, 523, 440, 0], wave: 'triangle' },
      mini:  { bpm: 150, chords: [[220, 261, 330], [196, 247, 294], [174, 220, 261], [196, 247, 294]], lead: [659, 659, 0, 784, 659, 0, 523, 0, 587, 587, 0, 698, 587, 0, 494, 0], wave: 'square' },
    };
    const s = songs[name] || songs.title, stepDur = 60 / s.bpm / 2; let step = 0;
    const bus = this.bgmBus;
    this.bgmTimer = setInterval(() => {
      step++;
      if (this.muted) return;
      const chord = s.chords[Math.floor(step / 16) % s.chords.length], i = step % 16;
      if (i % 4 === 0) this.tone(chord[0] / 2, stepDur * 3.6, { type: 'triangle', vol: 0.5, bus });
      if (i % 2 === 0 && i % 4 !== 0) chord.forEach((f) => this.tone(f, stepDur * 0.8, { vol: 0.07, bus }));
      if (s.lead[i]) this.tone(s.lead[i], stepDur * 1.6, { type: s.wave, vol: 0.16, bus });
      if (i % 4 === 2) this.noise(0.04, { filter: 'highpass', freq: 7000, vol: 0.12, bus });
      if (i % 8 === 0) this.tone(90, 0.12, { type: 'sine', vol: 0.5, slide: -50, bus });
    }, stepDur * 1000);
  }
  stopBgm() { clearInterval(this.bgmTimer); this.bgmTimer = null; this.bgmName = null; }
}
export const SFX = new SoundFXClass();
