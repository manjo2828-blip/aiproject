import { SFX } from '../core/SoundFX.js';
import { txt } from './Button.js';
import { wait, tw } from '../board/Fx.js';

// 주사위 연출 창: 면이 빠르게 바뀌다 느려지며 멈춘다. (Kenney icon_dice_1..6 은 흰 아이콘 → 어두운 배경 위에)
export class DiceRoller extends Phaser.GameObjects.Container {
  constructor(scene, x, y, size = 110) {
    super(scene, x, y);
    this.size = size;
    this.bg = scene.add.graphics();
    this.drawBg(0x1565c0);
    this.img = scene.add.image(0, 0, 'icon_dice_question').setDisplaySize(size - 20, size - 20);
    this.cap = txt(scene, 0, size / 2 + 16, '주사위', 20, '#ffffff');
    this.add([this.bg, this.img, this.cap]);
    scene.add.existing(this);
  }
  drawBg(color) {
    const s = this.size, dark = Phaser.Display.Color.ValueToColor(color).darken(35).color;
    this.bg.clear().fillStyle(dark, 1).fillRoundedRect(-s / 2, -s / 2 + 6, s, s, 20).fillStyle(color, 1).fillRoundedRect(-s / 2, -s / 2, s, s, 20)
      .lineStyle(4, 0xffffff, 1).strokeRoundedRect(-s / 2, -s / 2, s, s, 20);
  }
  setCaption(t) { this.cap.setText(t); }
  async roll(value, max = 3, boots = false) {
    const s = this.scene; let prev = 0;
    this.drawBg(boots ? 0xe65100 : 0x1565c0);
    SFX.play('diceRoll');
    this.setCaption(boots ? '축구화! 1~6' : '굴리는 중...');
    const delays = [60, 60, 65, 70, 80, 90, 105, 125, 150, 185, 230];
    for (const d of delays) {
      let f; do { f = 1 + Math.floor(Math.random() * max); } while (f === prev);
      prev = f; this.img.setTexture('icon_dice_' + f).setAngle((Math.random() - 0.5) * 50);
      s.tweens.add({ targets: this.img, scaleX: this.img.scaleX, y: -8, duration: d / 2, yoyo: true });
      await wait(s, d);
    }
    this.img.setTexture('icon_dice_' + value).setAngle(0);
    SFX.play('diceLand', value);
    this.setCaption(`${value} 칸 이동!`);
    this.drawBg(0x2e7d32);
    await tw(s, { targets: this.img, scale: this.img.scale * 1.3, duration: 130, yoyo: true, ease: 'Quad.Out' });
    this.img.setDisplaySize(this.size - 20, this.size - 20);
  }
  idle() { this.setCaption('주사위'); this.drawBg(0x1565c0); this.img.setTexture('icon_dice_question'); }
}
