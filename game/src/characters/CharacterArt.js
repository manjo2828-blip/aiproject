import { CHARACTERS, CHAR_IDS } from '../config/characters.js';
import { FONT } from '../config/constants.js';
import { drawHead } from './HeadArt.js';
import { drawTorso, drawUpperArm, drawForearm, drawLeg, drawTrophy } from './BodyArt.js';
import { resetPose, playAnim } from './FigureAnim.js';
import { NUMBERS, NUM_COLORS, shade } from './artUtil.js';

// 캐릭터 그림 (코드로 그리는 플랫 벡터 스타일).
//   CharacterArt.ensureTextures(scene)  → 텍스처 생성 (BootScene.create 에서 1회 호출, 중복 호출 안전)
//       'portrait_<id>' : 256x256 상반신 초상화 (선택 카드/HUD 용, 배경 투명)
//       'icon_<id>'     : 96x96 원형 얼굴 아이콘 (HUD/로그/말풍선 용, 포인트컬러 테두리 포함)
//   CharacterArt.createFigure(scene, id, { scale = 1 }) → Phaser.GameObjects.Container (원점 = 발 중앙 바닥)
//       fig.play(name)  name ∈ 'idle' | 'run' | 'dance'(삼바) | 'cheer'(만세) | 'trophy'(트로피 들기) | 'sad'(아쉬워함) | 'kick'
//       fig.stopAnim()  진행 중 트윈 정리
//       fig.setFacing(dir)  dir = 1 | -1
//       fig.setExpression('normal'|'happy'|'cheer'|'sad'|'blink')  (선택)
function makePortrait(scene, c) {
  const g = scene.make.graphics({ add: false });
  g.save(); g.translateCanvas(128, 338); g.scaleCanvas(3.2, 3.2); drawTorso(g, c); g.restore();
  g.save(); g.translateCanvas(128, 112); g.scaleCanvas(1.7, 1.7); drawHead(g, c, 'happy'); g.restore();
  g.generateTexture('portrait_' + c.id, 256, 256); g.destroy();
}

function makeIcon(scene, c) {
  const g = scene.make.graphics({ add: false });
  g.fillStyle(c.accent).fillCircle(48, 48, 47);
  g.fillStyle(shade(c.accent, 45)).fillCircle(48, 48, 42);
  g.fillStyle(c.kit.primary).fillCircle(48, 100, 34);
  g.save(); g.translateCanvas(48, 49); g.scaleCanvas(0.8, 0.8); drawHead(g, c, 'normal', { noTail: true }); g.restore();
  g.lineStyle(6, c.accent).strokeCircle(48, 48, 44);
  g.generateTexture('icon_' + c.id, 96, 96); g.destroy();
}

const gfx = (scene, parent, fn, c, x = 0, y = 0) => {
  const g = scene.add.graphics({ x, y }); fn(g, c); parent.add(g); return g;
};

export const CharacterArt = {
  ensureTextures(scene) {
    CHAR_IDS.forEach((id) => {
      if (!scene.textures.exists('portrait_' + id)) makePortrait(scene, CHARACTERS[id]);
      if (!scene.textures.exists('icon_' + id)) makeIcon(scene, CHARACTERS[id]);
    });
  },

  createFigure(scene, id, { scale = 1 } = {}) {
    const c = CHARACTERS[id];
    const fig = scene.add.container(0, 0);
    const rig = scene.add.container(0, 0), body = scene.add.container(0, -62), head = scene.add.container(0, -80);
    const mkArm = (sx) => {
      const up = scene.add.container(sx * 30, -38), fo = scene.add.container(0, 32);
      gfx(scene, up, drawUpperArm, c); gfx(scene, fo, drawForearm, c); up.add(fo);
      return { up, fo };
    };
    const legL = scene.add.container(-12, -62), legR = scene.add.container(12, -62);
    gfx(scene, legL, drawLeg, c); gfx(scene, legR, drawLeg, c);
    gfx(scene, body, drawTorso, c);
    const num = scene.add.text(0, -24, String(NUMBERS[id]), { fontFamily: FONT, fontSize: '25px', color: NUM_COLORS[id], stroke: '#00000055', strokeThickness: 2 }).setOrigin(0.5);
    body.add(num);
    const headG = gfx(scene, head, (g) => drawHead(g, c, 'normal'), c);
    const armL = mkArm(-1), armR = mkArm(1);
    const trophy = scene.add.container(0, -127).setVisible(false); gfx(scene, trophy, drawTrophy, c);
    body.add([armL.up, armR.up, head, trophy]);
    rig.add([legL, legR, body]);
    fig.add(rig);
    fig.parts = { rig, body, head, legL, legR, armL, armR, trophy };
    fig._tw = []; fig._ev = []; fig._scale = scale; fig._dir = 1;
    fig.setScale(scale);

    fig.setExpression = (e) => { headG.clear(); drawHead(headG, c, e); return fig; };
    fig.stopAnim = () => {
      fig._tw.forEach((t) => t.stop && t.stop()); fig._ev.forEach((e) => e.remove && e.remove()); fig._tw = []; fig._ev = [];
      if (fig.scene) resetPose(fig); return fig;
    };
    fig.play = (name = 'idle') => { playAnim(fig, name); return fig; };
    fig.setFacing = (dir) => { fig._dir = dir < 0 ? -1 : 1; fig.scaleX = fig._scale * fig._dir; num.scaleX = fig._dir; return fig; };
    fig.once('destroy', () => { fig._tw.forEach((t) => t.stop && t.stop()); fig._ev.forEach((e) => e.remove && e.remove()); });
    resetPose(fig);
    return fig;
  },
};
