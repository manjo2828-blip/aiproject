import { FONT } from '../config/constants.js';
import { SFX } from '../core/SoundFX.js';

export const CARD_W = 260, CARD_H = 350;

// 캐릭터 선택 카드. new CharacterCard(scene, x, y, charData, onPick)
export class CharacterCard extends Phaser.GameObjects.Container {
  constructor(scene, x, y, c, onPick) {
    super(scene, x, y);
    this.c = c; this.baseY = y; this.selected = false; this.hover = false;
    const t = (px, py, s, size, color, extra = {}) => scene.add.text(px, py, s, { fontFamily: FONT, fontSize: size + 'px', color, ...extra }).setOrigin(0.5);
    this.glow = scene.add.graphics(); this.bg = scene.add.graphics();
    this.panel = scene.add.graphics();
    this.panel.fillStyle(c.accent, 0.22).fillRoundedRect(-112, -170, 224, 152, 22);
    this.portrait = scene.add.image(0, -94, 'portrait_' + c.id).setScale(0.58);
    this.nameT = t(0, 4, c.name, 36, '#ffffff', { stroke: '#000000aa', strokeThickness: 5 });
    this.enT = t(0, 33, c.en.toUpperCase(), 15, '#b8d8bb');
    this.countryT = t(0, 58, `${c.flag} ${c.country}`, 21, '#ffffff', { stroke: '#00000088', strokeThickness: 3 });
    this.chips = scene.add.graphics();
    this.chips.fillStyle(0xffffff).fillCircle(-17, 86, 11).fillCircle(17, 86, 11);
    this.chips.fillStyle(c.kit.primary).fillCircle(-17, 86, 9).fillStyle(c.kit.secondary).fillCircle(17, 86, 9);
    this.traitBox = scene.add.graphics();
    this.traitBox.fillStyle(c.accent, 0.2).fillRoundedRect(-118, 104, 236, 66, 12).lineStyle(2, c.accent, 0.9).strokeRoundedRect(-118, 104, 236, 66, 12);
    this.traitName = t(0, 118, '★ ' + c.traitName, 18, c.accentHex, { stroke: '#000000cc', strokeThickness: 4 });
    this.traitDesc = t(0, 144, c.traitDesc, 14, '#e8f5e9', { align: 'center', wordWrap: { width: 222 }, lineSpacing: -2 });
    this.add([this.glow, this.bg, this.panel, this.portrait, this.nameT, this.enT, this.countryT, this.chips, this.traitBox, this.traitName, this.traitDesc]);
    this.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { this.hover = true; SFX.play('hover'); this.refresh(); });
    this.on('pointerout', () => { this.hover = false; this.refresh(); });
    this.on('pointerup', () => { SFX.unlock(); onPick(c.id); });
    this.drawBg(); this.refresh(true);
    scene.add.existing(this);
    this.glowTween = scene.tweens.add({ targets: this.glow, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1, paused: true });
    this.setSelected(false);
  }
  drawBg() {
    const c = this.c, w = CARD_W, h = CARD_H;
    this.bg.clear().fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 4, -h / 2 + 10, w, h, 26);
    this.bg.fillStyle(this.selected ? 0x1d4a26 : 0x14301a, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, 26);
    this.bg.lineStyle(this.selected ? 7 : 3, this.selected ? c.accent : 0xffffff, this.selected ? 1 : 0.35).strokeRoundedRect(-w / 2, -h / 2, w, h, 26);
    this.glow.clear();
    if (this.selected) for (let i = 1; i <= 3; i++) this.glow.lineStyle(6 * i, c.accent, 0.2 / i).strokeRoundedRect(-w / 2 - 3 * i, -h / 2 - 3 * i, w + 6 * i, h + 6 * i, 26 + 3 * i);
  }
  setSelected(v) {
    this.selected = v; this.drawBg(); this.refresh();
    this.traitBox.setVisible(v); this.traitDesc.setColor(v ? '#ffffff' : '#c5dcc7');
    this.traitName.setScale(v ? 1.08 : 1).setAlpha(v ? 1 : 0.8);
    if (this.glowTween) v ? this.glowTween.resume() : this.glowTween.pause();
    if (v) this.scene.tweens.add({ targets: this.portrait, scale: { from: 0.52, to: 0.6 }, duration: 260, ease: 'Back.easeOut' });
  }
  refresh(instant) {
    const s = this.selected ? 1.08 : this.hover ? 1.04 : 1, y = this.baseY - (this.selected ? 8 : this.hover ? 10 : 0);
    if (instant) { this.setScale(s).setY(y); return; }
    this.scene.tweens.add({ targets: this, scale: s, y, duration: 140, ease: 'Quad.easeOut' });
  }
}
