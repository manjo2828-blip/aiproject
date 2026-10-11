import { W, SIDE } from '../../config/constants.js';
import { CHARACTERS, lapBonus } from '../../config/characters.js';
import { SFX } from '../../core/SoundFX.js';
import { txt } from '../../ui/Button.js';

const CARD_X = { player: 250, ai: 1030 };
const ROWS = [
  { label: '완주 횟수 / 보너스', key: 'laps', fmt: (n, id) => `${n}회 (+${n * lapBonus(id)})` },
  { label: '태클 성공 횟수', key: 'tackles', fmt: (n) => `${n}회` },
  { label: '미니게임 승리 횟수', key: 'miniWins', fmt: (n) => `${n}회` },
  { label: '용품 구매', key: 'shopBuys', fmt: (n) => `${n}개` },
];

// 1단계(서스펜스: 룰렛 스코어) + 2단계(기록 비교 표) + 3단계용 상단 요약 바
export class Scoreboard {
  constructor(scene, GS) {
    this.scene = scene; this.GS = GS; this.timers = []; this.done = false;
    this.final = { player: GS.scores.player, ai: GS.scores.ai };
    this.group = scene.add.container(0, 0).setDepth(10);
    this.dim = scene.add.rectangle(W / 2, 360, W, 720, 0x000000, 0.28).setDepth(5);
    this.title = txt(scene, W / 2, 50, 'FINAL RESULT', 58, '#ffd700', { strokeThickness: 8 });
    this.sub = txt(scene, W / 2, 100, '최종 스코어 집계 중...', 26, '#ffffff');
    this.group.add([this.title, this.sub]);
    this.cards = {}; this.scoreTxt = {};
    [SIDE.PLAYER, SIDE.AI].forEach((side) => this.buildCard(side));
    this.vs = txt(scene, W / 2, 360, 'VS', 110, '#ffffff', { strokeThickness: 12 });
    this.vsTween = scene.tweens.add({ targets: this.vs, scale: { from: 0.92, to: 1.08 }, duration: 380, yoyo: true, repeat: -1 });
    this.group.add(this.vs);
    this.table = scene.add.container(0, 0).setAlpha(0); this.group.add(this.table);
    this.rowObjs = [];
    this.buildTable();
    this.buildCompact();
    scene.tweens.add({ targets: this.group, alpha: { from: 0, to: 1 }, duration: 500 });
  }

  buildCard(side) {
    const s = this.scene, x = CARD_X[side], id = this.GS.charOf(side), c = CHARACTERS[id];
    const card = s.add.container(x, 0);
    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.65).fillRoundedRect(-150, 140, 300, 500, 26);
    bg.lineStyle(4, c.accent, 0.9).strokeRoundedRect(-150, 140, 300, 500, 26);
    const frame = s.add.graphics();
    frame.fillStyle(0x16305a, 1).fillRoundedRect(-95, 165, 190, 190, 22).lineStyle(5, c.accent, 1).strokeRoundedRect(-95, 165, 190, 190, 22);
    const img = s.add.image(0, 262, 'portrait_' + id).setDisplaySize(186, 186);
    const mask = s.make.graphics({ add: false }); mask.fillStyle(0xffffff).fillRoundedRect(x - 93, 167, 186, 186, 20);
    img.setMask(mask.createGeometryMask());
    const nm = txt(s, 0, 390, c.name, 38, '#ffffff');
    const tag = txt(s, 0, 428, side === SIDE.PLAYER ? '(플레이어)' : '(AI)', 22, side === SIDE.PLAYER ? '#7fd1ff' : '#ffb3b3');
    const lab = txt(s, 0, 476, '최종 점수', 22, '#ffd700');
    const sc = txt(s, 0, 550, '0', 88, '#ffffff', { strokeThickness: 10 });
    const unit = txt(s, 70, 574, '점', 30, '#dddddd').setAlpha(0);
    card.add([bg, frame, img, nm, tag, lab, sc, unit]);
    this.group.add(card); this.cards[side] = card; this.scoreTxt[side] = sc; card.unit = unit;
  }

  buildTable() {
    const s = this.scene, t = this.table;
    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.72).fillRoundedRect(W / 2 - 205, 140, 410, 500, 26).lineStyle(4, 0xffd700, 0.8).strokeRoundedRect(W / 2 - 205, 140, 410, 500, 26);
    t.add(bg); t.add(txt(s, W / 2, 182, '경기 기록 비교', 30, '#ffd700'));
    ROWS.forEach((r, i) => {
      const y = 270 + i * 92, row = s.add.container(0, 0).setAlpha(0);
      const pill = s.add.graphics();
      pill.fillStyle(0xffffff, 0.1).fillRoundedRect(W / 2 - 185, y - 38, 370, 78, 16);
      const lab = txt(s, W / 2, y - 18, r.label, 20, '#d8e8ff', { strokeThickness: 3 });
      const vp = txt(s, W / 2 - 92, y + 14, '', 30, '#ffffff'), va = txt(s, W / 2 + 92, y + 14, '', 30, '#ffffff');
      row.add([pill, lab, vp, va]); t.add(row);
      this.rowObjs.push({ row, vp, va, def: r });
    });
  }

  buildCompact() {
    const s = this.scene, GS = this.GS;
    const c = this.compact = s.add.container(W / 2, 46).setDepth(12).setAlpha(0);
    const bg = s.add.graphics();
    bg.fillStyle(0x000000, 0.6).fillRoundedRect(-320, -32, 640, 64, 32).lineStyle(3, 0xffd700, 0.8).strokeRoundedRect(-320, -32, 640, 64, 32);
    c.add(bg);
    c.add(s.add.image(-285, 0, 'icon_' + GS.playerId).setDisplaySize(52, 52));
    c.add(s.add.image(285, 0, 'icon_' + GS.aiId).setDisplaySize(52, 52));
    c.add(txt(s, -185, 0, CHARACTERS[GS.playerId].name, 26));
    c.add(txt(s, 185, 0, CHARACTERS[GS.aiId].name, 26));
    const w = this.final.player > this.final.ai ? SIDE.PLAYER : this.final.ai > this.final.player ? SIDE.AI : null;
    c.add([
      txt(s, -60, 2, String(this.final.player), 44, w === SIDE.PLAYER ? '#ffd700' : '#ffffff'),
      txt(s, 60, 2, String(this.final.ai), 44, w === SIDE.AI ? '#ffd700' : '#ffffff'),
      txt(s, 0, 0, ':', 40),
    ]);
  }

  after(ms, fn) { const t = this.scene.time.delayedCall(ms, () => { if (!this.done) fn(); }); this.timers.push(t); return t; }

  // 1단계: 룰렛처럼 숫자가 섞이다가 하나씩 확정
  runSuspense(onDone) {
    const s = this.scene, max = Math.max(30, this.final.player + 8, this.final.ai + 8);
    this.settled = { player: false, ai: false };
    const roll = s.time.addEvent({ delay: 55, loop: true, callback: () => {
      [SIDE.PLAYER, SIDE.AI].forEach((side) => {
        if (this.settled[side]) return;
        this.scoreTxt[side].setText(String(Phaser.Math.Between(0, max))).setColor('#ffe27a').setScale(1 + Math.random() * 0.06);
      });
      SFX.play('reveal');
    } });
    this.timers.push(roll);
    this.after(2600, () => this.settle(SIDE.PLAYER));
    this.after(4000, () => this.settle(SIDE.AI));
    this.after(4900, () => { roll.remove(); onDone && onDone(); });
  }

  settle(side) {
    const t = this.scoreTxt[side], s = this.scene;
    this.settled[side] = true; t.setText(String(this.final[side])).setColor('#ffffff').setScale(1.5);
    s.tweens.add({ targets: t, scale: 1, duration: 380, ease: 'Back.easeOut' });
    const u = this.cards[side].unit; u.x = t.width / 2 + 26; s.tweens.add({ targets: u, alpha: 1, duration: 300 });
    SFX.play('click'); s.cameras.main.shake(120, 0.004);
  }

  // 2단계: VS -> 표, 행을 하나씩 카운트업
  runStats(onDone) {
    const s = this.scene;
    this.sub.setText('경기 기록 집계');
    s.tweens.add({ targets: this.vs, alpha: 0, scale: 0.4, duration: 300 });
    s.tweens.add({ targets: this.table, alpha: 1, duration: 400 });
    this.rowObjs.forEach((ro, i) => this.after(500 + i * 1050, () => this.revealRow(ro)));
    this.after(500 + ROWS.length * 1050 + 500, () => onDone && onDone());
  }

  revealRow(ro) {
    const s = this.scene, GS = this.GS, k = ro.def.key;
    const np = GS.stats.player[k], na = GS.stats.ai[k], n = Math.max(np, na);
    s.tweens.add({ targets: ro.row, alpha: 1, duration: 250 });
    const apply = (v) => {
      ro.vp.setText(ro.def.fmt(Math.min(v, np), GS.playerId)); ro.va.setText(ro.def.fmt(Math.min(v, na), GS.aiId));
    };
    const finishRow = () => { apply(n); if (np !== na) (np > na ? ro.vp : ro.va).setColor('#ffd700'); };
    apply(0);
    if (n === 0) { finishRow(); return; }
    let i = 0;
    const ev = s.time.addEvent({ delay: 260, repeat: n - 1, callback: () => {
      i++; apply(i); SFX.play('reveal');
      [ro.vp, ro.va].forEach((o) => s.tweens.add({ targets: o, scale: { from: 1.25, to: 1 }, duration: 160 }));
      if (i === n) finishRow();
    } });
    this.timers.push(ev);
  }

  // 스킵: 즉시 최종 상태 (표 포함)
  finish() {
    if (this.done) return; this.done = true;
    this.timers.forEach((t) => t.remove());
    ['player', 'ai'].forEach((side) => { this.scoreTxt[side].setText(String(this.final[side])).setColor('#ffffff').setScale(1); });
  }

  // 3단계 진입: 카드/표가 사라지고 상단 요약 바
  toCompact() {
    const s = this.scene;
    s.tweens.killTweensOf(this.group);
    s.tweens.add({ targets: [this.group, this.dim], alpha: 0, duration: 450, onComplete: () => this.group.setVisible(false) });
    s.tweens.add({ targets: this.compact, alpha: 1, duration: 450, delay: 200 });
    this.vsTween.stop();
  }
}
