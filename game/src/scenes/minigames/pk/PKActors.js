import { CharacterArt } from '../../../characters/CharacterArt.js';
import { CHARACTERS } from '../../../config/characters.js';
import { FONT } from '../../../config/constants.js';
import { SPOT, TARGET, GB, hex } from './PKConst.js';

export const safePlay = (fig, name) => { try { fig && fig.play && fig.play(name); } catch (e) { /* 애니 없어도 동작 */ } };

// 캐릭터 피규어를 목표 키(px)에 맞춰 정규화
function makeFig(scene, id, targetH) {
  const fig = CharacterArt.createFigure(scene, id);
  fig.setScale(targetH / 200);   // 원본 피규어 키 ≈ 200px (Graphics 는 getBounds 가 신뢰 불가)
  return fig;
}
export function nameTag(scene, id, label, fs = 18) {
  const c = CHARACTERS[id], t = scene.add.text(0, 0, label || c.name, { fontFamily: FONT, fontSize: fs + 'px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
  const w = t.width + 22, g = scene.add.graphics();
  g.fillStyle(0x000000, 0.5).fillRoundedRect(-w / 2, -14, w, 30, 10).fillStyle(c.kit.primary, 1).fillRoundedRect(-w / 2, -16, w, 30, 10).lineStyle(2, c.kit.secondary, 1).strokeRoundedRect(-w / 2, -16, w, 30, 10);
  t.setPosition(0, -1).setColor(c.id === 'camila' || c.id === 'felipe' ? '#1a1a1a' : '#ffffff').setStroke(c.id === 'camila' || c.id === 'felipe' ? '#ffffff88' : '#000', 3);
  return scene.add.container(0, 0, [g, t]);
}

// 키커: 달려와 슛 모션
export class PKKicker {
  constructor(scene, id) {
    this.scene = scene; this.x0 = 250; this.y0 = 592;
    this.fig = makeFig(scene, id, 175);
    this.tag = nameTag(scene, id).setPosition(0, 24);
    this.c = scene.add.container(this.x0, this.y0, [this.fig, this.tag]).setDepth(18);
    try { this.fig.setFacing(1); } catch (e) {}
    safePlay(this.fig, 'idle');
  }
  runUp(done) {
    safePlay(this.fig, 'run');
    this.scene.tweens.add({ targets: this.c, x: SPOT.x - 115, y: SPOT.y + 40, duration: 520, ease: 'Sine.easeIn', onComplete: () => { safePlay(this.fig, 'kick'); done && done(); } });
  }
  react(good) { safePlay(this.fig, good ? 'cheer' : 'sad'); }
  destroy() { this.c.destroy(); }
}

// 키퍼: 다이빙 (이름표에 GK 표기)
export class PKKeeper {
  constructor(scene, id) {
    this.scene = scene; this.H = 150; this.homeX = 640; this.homeY = GB - 2;
    this.fig = makeFig(scene, id, this.H);
    this.c = scene.add.container(this.homeX, this.homeY, [this.fig]).setDepth(15);
    this.tag = nameTag(scene, id, CHARACTERS[id].name + ' (GK)', 16).setPosition(640, GB + 24).setDepth(15);
    safePlay(this.fig, 'idle');
    scene.tweens.add({ targets: this.c, scaleY: { from: 1, to: 0.97 }, duration: 350, yoyo: true, repeat: -1 });
    this.sway = scene.tweens.add({ targets: this.c, x: { from: 622, to: 658 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  dive(dir, ms = 380) {
    this.sway.stop(); this.scene.tweens.killTweensOf(this.c);
    this.c.setScale(1);
    const t = { targets: this.c, duration: ms, ease: 'Cubic.easeOut' };
    if (dir === 0) this.scene.tweens.add({ ...t, x: 640, y: this.homeY - 55, scaleX: 1.12, scaleY: 1.12 });
    else this.scene.tweens.add({ ...t, x: 640 + dir * 90, y: this.homeY - 12, rotation: dir * 0.9 });
    safePlay(this.fig, 'cheer');
  }
  react(good) { safePlay(this.fig, good ? 'cheer' : 'sad'); }
  destroy() { this.scene.tweens.killTweensOf(this.c); this.c.destroy(); this.tag.destroy(); }
}

export class PKBall {
  constructor(scene) {
    const key = scene.textures.exists('sports_equip') ? 'sports_equip' : null;
    this.shadow = scene.add.ellipse(SPOT.x, SPOT.y + 26, 46, 14, 0x000000, 0.35).setDepth(19);
    this.s = key ? scene.add.image(SPOT.x, SPOT.y, 'sports_equip', 'ball_soccer1.png') : scene.add.circle(SPOT.x, SPOT.y, 9, 0xffffff);
    this.s.setDepth(20); this.scene = scene; this.reset();
  }
  reset() { this.scene.tweens.killTweensOf(this.s); this.s.setPosition(SPOT.x, SPOT.y).setScale(2.9).setAlpha(1).setRotation(0); this.shadow.setPosition(SPOT.x, SPOT.y + 26).setVisible(true).setAlpha(1); }
  // (x,y)까지 비행 (원근 축소). arc: 포물선 높이
  fly(to, { ms = 650, scale = 1.5, arc = 60, ease = 'Quad.easeOut', spin = 12, onComplete } = {}) {
    const s = this.s, from = { x: s.x, y: s.y, sc: s.scale }, o = { t: 0 };
    this.shadow.setVisible(false);
    this.scene.tweens.add({
      targets: o, t: 1, duration: ms, ease,
      onUpdate: () => {
        const t = o.t; s.x = from.x + (to.x - from.x) * t; s.y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * arc;
        s.setScale(from.sc + (scale - from.sc) * t); s.rotation = t * spin;
      },
      onComplete: () => onComplete && onComplete(),
    });
  }
}
export { TARGET, hex };
