import { W, H, FONT, SCENES } from '../config/constants.js';
import { preloadShared } from '../core/Assets.js';
import { GameState } from '../core/GameState.js';
import { CHAR_IDS } from '../config/characters.js';
import { CharacterArt } from '../characters/CharacterArt.js';

// 로딩 → URL 파라미터(?scene=PKScene&char=jun&ai=felipe) 로 특정 씬 바로 실행(개발/캡처용), 없으면 Title.
export class BootScene extends Phaser.Scene {
  constructor() { super(SCENES.BOOT); }
  preload() {
    const bar = this.add.rectangle(W / 2 - 200, H / 2, 0, 16, 0xffd700).setOrigin(0, 0.5);
    this.add.rectangle(W / 2, H / 2, 404, 22).setStrokeStyle(2, 0xffffff);
    this.add.text(W / 2, H / 2 - 40, 'LOADING...', { fontFamily: FONT, fontSize: '28px', color: '#fff' }).setOrigin(0.5);
    this.load.on('progress', (p) => { bar.width = 400 * p; });
    preloadShared(this);
  }
  async create() {
    try { await Promise.race([document.fonts.load('28px Jua'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* 폰트 실패 시 대체 폰트 */ }
    CharacterArt.ensureTextures(this);
    const q = new URLSearchParams(location.search);
    const char = CHAR_IDS.includes(q.get('char')) ? q.get('char') : 'felipe';
    const ai = CHAR_IDS.includes(q.get('ai')) && q.get('ai') !== char ? q.get('ai') : undefined;
    GameState.reset(char, ai);
    const target = q.get('scene');
    if (target && this.scene.get(target)) {
      if (q.get('score')) { const [a, b] = q.get('score').split(',').map(Number); GameState.scores.player = a; GameState.scores.ai = b; }
      this.scene.start(target);
    } else this.scene.start(SCENES.TITLE);
  }
}
