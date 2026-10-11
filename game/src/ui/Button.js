import { FONT } from '../config/constants.js';
import { SFX } from '../core/SoundFX.js';

// 공용 버튼: 입체감 있는 둥근 사각형. const b = new Button(scene, x, y, '텍스트', { w, h, color, onClick })
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, label, { w = 260, h = 70, color = 0x2f80ed, textColor = '#ffffff', fontSize = 30, onClick = null, sound = 'click' } = {}) {
    super(scene, x, y);
    this.w = w; this.h = h; this.color = color; this.enabled = true; this.onClick = onClick; this.sound = sound;
    this.shadow = scene.add.graphics(); this.face = scene.add.graphics();
    this.text = scene.add.text(0, -3, label, { fontFamily: FONT, fontSize: fontSize + 'px', color: textColor, stroke: '#00000066', strokeThickness: 4 }).setOrigin(0.5);
    this.add([this.shadow, this.face, this.text]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.draw(0);
    this.on('pointerover', () => { if (this.enabled) { this.setScale(1.05); SFX.play('hover'); } });
    this.on('pointerout', () => { this.setScale(1); this.draw(0); });
    this.on('pointerdown', () => { if (this.enabled) this.draw(4); });
    this.on('pointerup', () => { if (!this.enabled) return; this.draw(0); SFX.unlock(); if (this.sound) SFX.play(this.sound); this.onClick && this.onClick(this); });
    scene.add.existing(this);
  }
  draw(press) {
    const { w, h } = this, c = this.enabled ? this.color : 0x777777, dark = Phaser.Display.Color.ValueToColor(c).darken(35).color, light = Phaser.Display.Color.ValueToColor(c).lighten(18).color;
    this.shadow.clear().fillStyle(dark, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18);
    this.face.clear().fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2 + press, w, h, 18)
      .fillStyle(light, 0.5).fillRoundedRect(-w / 2 + 6, -h / 2 + press + 5, w - 12, h * 0.35, 12);
    this.text.y = -3 + press;
  }
  setEnabled(v) { this.enabled = v; this.draw(0); this.input.cursor = v ? 'pointer' : 'default'; return this; }
  setLabel(t) { this.text.setText(t); return this; }
}

// 공용 텍스트 스타일 헬퍼
export const txt = (scene, x, y, s, size = 28, color = '#ffffff', extra = {}) =>
  scene.add.text(x, y, s, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#000000aa', strokeThickness: Math.max(2, size / 8), ...extra }).setOrigin(0.5);
