import { W, H, SCENES } from './config/constants.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { BoardScene } from './scenes/BoardScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { PKScene } from './scenes/minigames/PKScene.js';
import { HeadingScene } from './scenes/minigames/HeadingScene.js';
import { DribbleScene } from './scenes/minigames/DribbleScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: W, height: H, backgroundColor: '#0b1f0e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, TitleScene, BoardScene, ResultScene, PKScene, HeadingScene, DribbleScene],
});
window.__game = game;   // 디버그/자동 캡처용
