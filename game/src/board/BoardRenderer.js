import { W, H, FONT, COLORS } from '../config/constants.js';
import { TRACK, TILE_TYPES } from '../config/board.js';
import { TW, TH, CX, CY, PITCH, tileCenter } from './BoardLayout.js';
import { txt } from '../ui/Button.js';
import { bake } from './Bake.js';

const ICONS = { cheer: 'icon_award', yellow: null, event: 'icon_dice_question', shop: 'icon_pouch' };
const SUB = { cheer: '+3점', yellow: '-2점', event: 'VAR 판독!', shop: '축구화 4점' };

// 잔디 + 흰 라인 + 8칸 링 트랙을 그린다 (정적).
export class BoardRenderer {
  constructor(scene) {
    this.s = scene; this.tiles = [];
    this.drawField(); TRACK.forEach((t, i) => this.tiles.push(this.drawTile(t, i)));
    this.drawCenter();
  }

  drawField() {
    const s = this.s;
    bake(s, 'board_field', W, H, (g) => {
      g.fillStyle(COLORS.field, 1).fillRect(0, 0, W, H);
      for (let i = 0; i < 14; i++) if (i % 2) g.fillStyle(0x000000, 0.07).fillRect(PITCH.x + i * (PITCH.w / 14), 0, PITCH.w / 14, H);
      g.lineStyle(5, 0xffffff, 0.9).strokeRect(PITCH.x, PITCH.y, PITCH.w, PITCH.h);
      g.lineBetween(CX, PITCH.y, CX, PITCH.y + PITCH.h);
      const my = PITCH.y + PITCH.h / 2, R = PITCH.x + PITCH.w;
      g.strokeRect(PITCH.x, my - 98, 160, 196).strokeRect(PITCH.x, my - 52, 62, 104);
      g.strokeRect(R - 160, my - 98, 160, 196).strokeRect(R - 62, my - 52, 62, 104);
      g.fillStyle(0xffffff, 0.9).fillCircle(PITCH.x + 118, my, 5).fillCircle(R - 118, my, 5);
      g.lineStyle(5, 0xffffff, 0.9).strokeCircle(CX, CY, 56);
      g.fillStyle(0xffffff, 0.25).fillRect(PITCH.x - 22, my - 46, 22, 92).fillRect(R, my - 46, 22, 92);
    });
    s.add.image(0, 0, 'board_field').setOrigin(0).setDepth(0);
  }

  drawCenter() {
    const s = this.s;
    s.add.image(CX, CY - 4, 'sports_equip', 'ball_soccer1.png').setScale(2.6).setDepth(2);
    s.add.image(CX, CY + 80, 'icon_arrow_clockwise').setDisplaySize(26, 26).setDepth(2).setAlpha(0.8);
  }

  drawTile(type, i) {
    const s = this.s, { x, y } = tileCenter(i), def = TILE_TYPES[type];
    const c = s.add.container(x, y).setDepth(10);
    bake(s, 'tile_' + type, TW + 8, TH + 14, (g) => {
      const dark = Phaser.Display.Color.ValueToColor(def.color).darken(35).color, ox = 4, oy = 3;
      g.fillStyle(0x000000, 0.28).fillRoundedRect(ox + 3, oy + 8, TW, TH, 16);
      g.fillStyle(dark, 1).fillRoundedRect(ox, oy + 6, TW, TH, 16);
      g.fillStyle(def.color, 1).fillRoundedRect(ox, oy, TW, TH - 2, 16);
      g.fillStyle(0xffffff, 0.16).fillRoundedRect(ox + 5, oy + 4, TW - 10, 30, 12);
      g.lineStyle(4, 0xffffff, 0.95).strokeRoundedRect(ox, oy, TW, TH - 2, 16);
    });
    c.add(s.add.image(0, 0, 'tile_' + type).setOrigin((4 + TW / 2) / (TW + 8), (3 + (TH - 2) / 2) / (TH + 14)));
    // 아이콘
    if (type === 'yellow') {
      bake(s, 'ycard', 40, 54, (g) => { g.fillStyle(0x000000, 0.25).fillRoundedRect(4, 5, 34, 48, 5).fillStyle(0xffe000, 1).fillRoundedRect(2, 2, 34, 48, 5).lineStyle(2, 0xffffff, 1).strokeRoundedRect(2, 2, 34, 48, 5); });
      c.add(s.add.image(-108, -12, 'ycard').setOrigin(0.5, 0.5));
    }
    else c.add(s.add.image(-108, -12, ICONS[type]).setDisplaySize(52, 52));
    c.add(txt(s, -76, -16, def.label, 27, '#ffffff').setOrigin(0, 0.5));
    c.add(txt(s, -76, 16, SUB[type], 19, '#fff7c2').setOrigin(0, 0.5));
    // 번호 배지
    c.add(s.add.circle(-TW / 2 + 4, -TH / 2 + 4, 17, 0x14301a).setStrokeStyle(3, 0xffffff));
    c.add(txt(s, -TW / 2 + 4, -TH / 2 + 3, String(i), 21, '#ffffff'));
    if (i === 0) {
      bake(s, 'start_pill', 132, 30, (g) => { g.fillStyle(0xffffff, 1).fillRoundedRect(0, 0, 132, 30, 15); });
      c.add(s.add.image(0, TH / 2 + 19, 'start_pill'));
      c.add(s.add.image(-42, TH / 2 + 19, 'icon_flag_square').setDisplaySize(22, 22).setTint(0x14301a));
      c.add(txt(s, 8, TH / 2 + 19, '출발선', 20, '#14301a', { stroke: '#00000000', strokeThickness: 0 }));
    }
    return c;
  }

  pulseTile(i) {
    const c = this.tiles[i];
    this.s.tweens.add({ targets: c, scale: 1.06, duration: 140, yoyo: true });
  }
}
