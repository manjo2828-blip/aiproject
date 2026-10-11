import { SCENES, W, FONT } from '../config/constants.js';
import { CHARACTERS, CHAR_IDS, pickAI } from '../config/characters.js';
import { GameState } from '../core/GameState.js';
import { SFX } from '../core/SoundFX.js';
import { Button } from '../ui/Button.js';
import { CharacterArt } from '../characters/CharacterArt.js';
import { createTitleBackground } from '../ui/titleBackground.js';
import { createTitleLogo } from '../ui/titleLogo.js';
import { CharacterCard, CARD_W } from '../ui/titleCard.js';
import { playVsIntro } from '../ui/titleVS.js';
import { showGallery } from '../ui/titleGallery.js';

// 타이틀: 캐릭터 선택 → 게임 시작 → VS 인트로 → BoardScene
export class TitleScene extends Phaser.Scene {
  constructor() { super(SCENES.TITLE); }

  create() {
    this.selected = null; this.starting = false; this.audioOn = false;
    const g = +new URLSearchParams(location.search).get('gallery');
    if (g) { showGallery(this, g); return; }
    createTitleBackground(this);
    createTitleLogo(this);
    const gap = 24, x0 = (W - (CHAR_IDS.length * CARD_W + (CHAR_IDS.length - 1) * gap)) / 2 + CARD_W / 2;
    this.cards = CHAR_IDS.map((id, i) => new CharacterCard(this, x0 + i * (CARD_W + gap), 420, CHARACTERS[id], (cid) => this.select(cid)));
    this.buildBottom();
    this.buildMute();
    this.input.on('pointerdown', () => this.firstInteract());
    this.input.keyboard.on('keydown', () => this.firstInteract());
    this.input.keyboard.on('keydown-LEFT', () => this.step(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.step(1));
    ['ENTER', 'SPACE'].forEach((k) => this.input.keyboard.on('keydown-' + k, () => this.start()));
    this.events.once('shutdown', () => { this.input.keyboard.removeAllListeners(); });
  }

  buildBottom() {
    const panel = (x, label) => {
      const gr = this.add.graphics().fillStyle(0x0b2a10, 0.8).fillRoundedRect(x - 130, 635, 260, 54, 16).lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(x - 130, 635, 260, 54, 16);
      return [gr, this.add.text(x, 662, label, { fontFamily: FONT, fontSize: '24px', color: '#ffffff', stroke: '#000000aa', strokeThickness: 4 }).setOrigin(0.5)];
    };
    [, this.meText] = panel(350, '내 선수 : 선택하세요');
    [, this.foeText] = panel(950, '상대 : ???');
    this.q = this.add.image(1100, 662, 'emote_question').setScale(0.6);
    this.tweens.add({ targets: this.q, y: 650, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.startBtn = new Button(this, W / 2, 654, '게임 시작', { w: 330, h: 68, color: 0x2fa84f, fontSize: 38, sound: 'click', onClick: () => this.start() });
    this.startBtn.setEnabled(false);
    this.hint = this.add.text(W / 2, 707, '카드를 클릭하거나 ← → 키로 선택하고 Enter 로 시작!', { fontFamily: FONT, fontSize: '17px', color: '#d7ecd9', stroke: '#0b2a10', strokeThickness: 4 }).setOrigin(0.5);
  }

  buildMute() {
    this.muteBtn = new Button(this, W - 90, 40, SFX.muted ? '소리 OFF' : '소리 ON', {
      w: 130, h: 46, fontSize: 22, color: 0x3d7a46, sound: null,
      onClick: (b) => { this.firstInteract(); b.setLabel(SFX.toggleMute() ? '소리 OFF' : '소리 ON'); },
    });
  }

  firstInteract() {
    if (this.audioOn) return;
    this.audioOn = true; SFX.unlock(); SFX.bgm.start('title');
  }

  step(d) {
    const i = this.selected ? CHAR_IDS.indexOf(this.selected) : (d > 0 ? -1 : 0);
    this.select(CHAR_IDS[(i + d + CHAR_IDS.length) % CHAR_IDS.length]);
  }

  select(id) {
    if (this.starting) return;
    this.firstInteract();
    if (this.selected === id) return;
    SFX.play('select');
    this.selected = id;
    this.cards.forEach((c) => c.setSelected(c.c.id === id));
    const c = CHARACTERS[id];
    this.meText.setText('내 선수 : ' + c.name).setColor(c.accentHex);
    this.startBtn.setEnabled(true);
    if (!this.pulse) this.pulse = this.tweens.add({ targets: this.startBtn, scale: { from: 1, to: 1.05 }, duration: 600, yoyo: true, repeat: -1 });
    this.hint.setText('준비 완료! Enter 또는 [게임 시작] 을 눌러요');
    if (this.fig) this.fig.destroy();
    this.fig = CharacterArt.createFigure(this, id, { scale: 0.5 }).setPosition(165, 716);
    this.fig.play('cheer');
    this.time.delayedCall(1600, () => this.fig && this.fig.active && this.selected === id && this.fig.play('dance'));
  }

  start() {
    if (!this.selected || this.starting) return;
    this.starting = true; this.firstInteract();
    const p = this.selected, ai = pickAI(p);
    GameState.reset(p, ai);
    this.input.keyboard.removeAllListeners();
    playVsIntro(this, p, ai, () => { SFX.bgm.stop(); this.scene.start(SCENES.BOARD); });
  }
}
