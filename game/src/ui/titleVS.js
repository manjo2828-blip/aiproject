import { W, H, FONT } from '../config/constants.js';
import { CHARACTERS } from '../config/characters.js';
import { SFX } from '../core/SoundFX.js';

// "A VS B" 짧은 인트로 (1.2초). 끝나면 onDone().
export function playVsIntro(scene, playerId, aiId, onDone) {
  const P = CHARACTERS[playerId], A = CHARACTERS[aiId];
  const ov = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(100).setInteractive();
  scene.tweens.add({ targets: ov, fillAlpha: 0.85, duration: 200 });
  const band = scene.add.graphics().setDepth(101);
  band.fillStyle(P.accent, 0.5).fillPoints([{ x: 0, y: 140 }, { x: W / 2 + 90, y: 140 }, { x: W / 2 - 90, y: 610 }, { x: 0, y: 610 }], true);
  band.fillStyle(A.accent, 0.5).fillPoints([{ x: W, y: 140 }, { x: W / 2 + 90, y: 140 }, { x: W / 2 - 90, y: 610 }, { x: W, y: 610 }], true);
  band.setAlpha(0); scene.tweens.add({ targets: band, alpha: 1, duration: 250 });
  const side = (c, x, from, label) => {
    const img = scene.add.image(x + from, 375, 'portrait_' + c.id).setScale(1.3).setDepth(102);
    scene.tweens.add({ targets: img, x, duration: 350, ease: 'Back.easeOut' });
    const n = scene.add.text(x, 575, c.name, { fontFamily: FONT, fontSize: '50px', color: '#ffffff', stroke: '#000000', strokeThickness: 8 }).setOrigin(0.5).setDepth(102).setAlpha(0);
    const l = scene.add.text(x, 172, label, { fontFamily: FONT, fontSize: '28px', color: c.accentHex, stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5).setDepth(102).setAlpha(0);
    scene.tweens.add({ targets: [n, l], alpha: 1, duration: 250, delay: 250 });
  };
  side(P, 330, -700, '나'); side(A, W - 330, 700, '상대');
  const vs = scene.add.text(W / 2, H / 2 - 10, 'VS', { fontFamily: FONT, fontSize: '170px', color: '#ffd700', stroke: '#7a1a00', strokeThickness: 20 }).setOrigin(0.5).setDepth(103).setScale(0);
  scene.tweens.add({ targets: vs, scale: 1, angle: { from: -15, to: 0 }, duration: 380, delay: 250, ease: 'Back.easeOut' });
  scene.time.delayedCall(250, () => SFX.play('whistle'));
  scene.cameras.main.shake(180, 0.004);
  scene.time.delayedCall(1250, onDone);
}
