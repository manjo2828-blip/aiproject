import { W, H, FONT } from '../config/constants.js';
import { CHAR_IDS } from '../config/characters.js';
import { CharacterArt } from '../characters/CharacterArt.js';

// 개발용 갤러리: ?scene=TitleScene&gallery=1 (포즈 시트) / gallery=2 (초상화+아이콘+큰 피규어)
const POSES = ['idle', 'run', 'dance', 'cheer', 'trophy', 'sad', 'kick'];

export function showGallery(scene, mode) {
  scene.add.rectangle(W / 2, H / 2, W, H, 0x3a8d3f);
  if (mode === 1) {
    const cw = W / POSES.length, rh = H / CHAR_IDS.length;
    CHAR_IDS.forEach((id, r) => POSES.forEach((p, i) => {
      const f = CharacterArt.createFigure(scene, id, { scale: 0.62 }); f.setPosition(cw * (i + 0.5), rh * (r + 1) - 14).play(p);
      if (r === 0) scene.add.text(cw * (i + 0.5), 12, p, { fontFamily: FONT, fontSize: '18px', color: '#fff' }).setOrigin(0.5);
    }));
  } else {
    CHAR_IDS.forEach((id, i) => {
      const x = 160 + i * 320;
      scene.add.image(x, 150, 'portrait_' + id).setScale(1.1);
      scene.add.image(x - 70, 340, 'icon_' + id); scene.add.image(x + 70, 340, 'icon_' + id).setScale(0.5);
      CharacterArt.createFigure(scene, id, { scale: 1.5 }).setPosition(x, 700).play(i % 2 ? 'dance' : 'idle');
    });
  }
}
