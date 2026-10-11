import { CHARACTERS } from '../../../config/characters.js';
import { CharacterArt } from '../../../characters/CharacterArt.js';
import { GROUND_Y } from './HeadingField.js';

const TARGET_H = 250;   // 화면상 선수 키(px) - 실제 그림 높이를 재서 맞춘다
export const HEAD_Y = GROUND_Y - TARGET_H * 0.74;   // 머리 중심

// 선수: holder(내가 트윈) 안에 CharacterArt figure(자체 애니) 를 넣어 충돌 방지
export class Contender {
  constructor(scene, side, id, x, facing) {
    this.scene = scene; this.side = side; this.id = id; this.homeX = x; this.facing = facing;
    this.char = CHARACTERS[id];
    this.shadow = scene.add.ellipse(x, GROUND_Y + 3, 110, 26, 0x000000, 0.35).setDepth(5);
    this.holder = scene.add.container(x, GROUND_Y).setDepth(10);
    // 실제 CharacterArt 는 scale 1 에서 약 192px 높이 (stub 은 254px)
    this.fig = CharacterArt.createFigure(scene, id, { scale: 1 });
    const native = this.fig.parts ? 192 : 254;
    this.fig.destroy();
    this.fig = CharacterArt.createFigure(scene, id, { scale: TARGET_H / native });
    this.holder.add(this.fig);
    this.call('setFacing', facing);
    this.anim('idle');
  }
  call(fn, ...a) { try { if (this.fig[fn]) this.fig[fn](...a); } catch (e) { /* robust */ } }
  anim(name) { this.call('play', name); }

  tick() {   // 그림자 동기화
    const lift = Math.max(0, -this.holder.y);
    this.shadow.x = this.holder.x; this.shadow.setScale(1 - Math.min(0.5, lift / 260), 1 - Math.min(0.5, lift / 260));
    this.shadow.setAlpha(0.35 - Math.min(0.2, lift / 600));
  }
  reset() {
    this.scene.tweens.killTweensOf(this.holder);
    this.holder.setPosition(this.homeX, GROUND_Y).setAngle(0).setScale(1).setDepth(10);
    this.anim('idle');
  }
  jump(dx = 0, power = 1) {   // 점프 (시작 즉시 상승, 천천히 하강)
    const t = this.scene.tweens, h = this.holder; t.killTweensOf(h);
    this.anim('cheer');
    t.add({ targets: h, x: this.homeX + dx, duration: 170, ease: 'Sine.Out' });
    t.add({
      targets: h, y: GROUND_Y - 95 * power, duration: 170, ease: 'Quad.Out',
      onComplete: () => t.add({ targets: h, y: GROUND_Y, duration: 340, ease: 'Quad.In', onComplete: () => this.anim('idle') }),
    });
  }
  stumble() {   // 헛점프/미스 시 살짝 휘청
    this.scene.tweens.add({ targets: this.holder, angle: this.facing * -6, duration: 120, yoyo: true });
  }
  push(dir) {   // 상대에게 밀려남
    const t = this.scene.tweens, h = this.holder; t.killTweensOf(h);
    t.add({ targets: h, x: this.homeX + dir * 85, y: GROUND_Y - 25, angle: dir * 16, duration: 220, ease: 'Quad.Out', onComplete: () => t.add({ targets: h, y: GROUND_Y, duration: 160 }) });
    this.anim('sad');
  }
  celebrate() {
    this.scene.tweens.killTweensOf(this.holder); this.holder.setAngle(0);
    this.scene.tweens.add({ targets: this.holder, y: GROUND_Y, duration: 200 });
    this.anim('cheer');
    this.scene.tweens.add({ targets: this.holder, y: GROUND_Y - 22, duration: 170, yoyo: true, repeat: 3, delay: 250, ease: 'Sine.Out' });
  }
  sad() { this.anim('sad'); }
}

// 공 + 바닥 그림자
export class Ball {
  constructor(scene) {
    this.scene = scene;
    this.shadow = scene.add.ellipse(640, GROUND_Y + 6, 60, 18, 0x000000, 0.4).setDepth(6).setVisible(false);
    if (scene.textures.exists('sports_equip')) this.spr = scene.add.image(640, 0, 'sports_equip', 'ball_soccer1.png');
    else this.spr = scene.add.circle(640, 0, 9, 0xffffff).setStrokeStyle(2, 0x000000);
    this.spr.setDepth(25).setVisible(false);
    this.baseScale = 1;
  }
  // 낙하 중: u = 0(화면 위) → 1(도착)
  fall(u, sx, ex, ey) {
    const k = Math.min(1.12, u), e = 1 - Math.pow(1 - Math.min(1, k), 2);
    const x = sx + (ex - sx) * (k <= 1 ? e : 1), y = -50 + (ey + 50) * Math.pow(k, 1.25);
    const sc = 2.2 + 2 * k;
    this.spr.setPosition(x, y).setScale(sc).setVisible(true).angle += 7;
    this.shadow.setVisible(true).setPosition(x, GROUND_Y + 8).setScale(0.35 + 0.9 * k).setAlpha(0.12 + 0.3 * Math.min(1, k));
  }
  hide() { this.scene.tweens.killTweensOf(this.spr); this.spr.setVisible(false); this.shadow.setVisible(false); }
}
