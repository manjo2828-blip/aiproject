import { CFG } from './DribbleSim.js';
import { FONT } from '../../../config/constants.js';

export const PW = 480;   // 패널 폭 (3레인 x 160)

// 잔디/레인 텍스처 1회 생성
export function ensureTrackTextures(scene) {
  const T = scene.textures;
  if (!T.exists('dr_grass')) {
    const g = scene.make.graphics({ add: false }), bh = CFG.PPM * 4;
    g.fillStyle(0x3aa655, 1).fillRect(0, 0, PW, bh).fillStyle(0x33994d, 1).fillRect(0, bh, PW, bh);
    // 잔디 결 (고정 시드 느낌의 점들)
    for (let i = 0; i < 160; i++) { const x = (i * 97) % PW, y = (i * 53) % (bh * 2); g.fillStyle(i % 2 ? 0x2d8a45 : 0x45b563, 0.5).fillRect(x, y, 3, 8); }
    g.generateTexture('dr_grass', PW, bh * 2); g.destroy();
  }
  if (!T.exists('dr_dash')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 0.35).fillRect(0, 0, 4, 28); g.generateTexture('dr_dash', 4, 56); g.destroy();
  }
  if (!T.exists('dr_check')) {   // 결승선 체커
    const g = scene.make.graphics({ add: false }), s = 20, cols = PW / s;
    for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) g.fillStyle((r + c) % 2 ? 0x111111 : 0xffffff, 1).fillRect(c * s, r * s, s, s);
    g.generateTexture('dr_check', PW, s * 2); g.destroy();
  }
  if (!T.exists('dr_dot')) { const g = scene.make.graphics({ add: false }); g.fillStyle(0xffffff, 1).fillCircle(6, 6, 6); g.generateTexture('dr_dot', 12, 12); g.destroy(); }
}

// 스크롤하는 피치 한 패널. world 컨테이너는 (월드 거리 d → y = -d*PPM) 로 배치하고 scroll(dist) 로 이동시킨다.
export class DribbleTrack {
  constructor(scene, x0, depth = 0) {
    this.scene = scene; this.x0 = x0; this.cx = x0 + PW / 2;
    const top = CFG.TOP, h = 720 - top;
    this.grass = scene.add.tileSprite(x0, top, PW, h, 'dr_grass').setOrigin(0, 0).setDepth(depth);
    this.dash = scene.add.tileSprite(0, top, 4, h, 'dr_dash').setOrigin(0.5, 0).setDepth(depth + 1);
    this.dash2 = scene.add.tileSprite(0, top, 4, h, 'dr_dash').setOrigin(0.5, 0).setDepth(depth + 1);
    this.dash.x = this.cx - CFG.LW / 2; this.dash2.x = this.cx + CFG.LW / 2;
    this.world = scene.add.container(x0, CFG.RUNNER_Y).setDepth(depth + 2);   // 월드 좌표 컨테이너(패널 좌측 기준)
    this.buildMarkings();
    // 터치라인(흰 사이드 라인)
    const g = scene.add.graphics().setDepth(depth + 3);
    g.fillStyle(0xffffff, 0.95).fillRect(x0, top, 7, h).fillRect(x0 + PW - 7, top, 7, h);
    this.speedLines = [];
    for (let i = 0; i < 14; i++) {
      const l = scene.add.rectangle(x0 + 14 + Math.random() * (PW - 28), top + Math.random() * h, 2, 40 + Math.random() * 50, 0xffffff, 0).setOrigin(0.5, 0).setDepth(depth + 6);
      l.sp = 0.8 + Math.random() * 0.9; this.speedLines.push(l);
    }
  }
  buildMarkings() {
    const { D, PPM } = CFG, w = this.world, sc = this.scene, y = (d) => -d * PPM;
    const g = sc.add.graphics(); w.add(g);
    g.lineStyle(5, 0xffffff, 0.85);
    g.lineBetween(0, y(D / 2), PW, y(D / 2));                                        // 하프라인
    g.strokeCircle(PW / 2, y(D / 2), 70); g.fillStyle(0xffffff, 0.85).fillCircle(PW / 2, y(D / 2), 5);
    g.strokeRect(70, y(D + 18), PW - 140, 18 * PPM);                                  // 페널티 에어리어 (결승선 앞)
    g.strokeRect(150, y(D + 6), PW - 300, 6 * PPM);
    // 결승선 뒤 골대 영역
    g.fillStyle(0x1f7a3a, 1).fillRect(0, y(D + 40), PW, 36 * PPM - 20);
    g.fillStyle(0xffffff, 0.9).fillRect(PW / 2 - 90, y(D + 9), 180, 6);
    this.finish = sc.add.image(0, y(D), 'dr_check').setOrigin(0, 1); w.add(this.finish);
    // 결승선 아치
    const arch = sc.add.graphics(); w.add(arch);
    arch.fillStyle(0xffd700, 1).fillRect(0, y(D) - 70, PW, 34).fillStyle(0x111111, 1).fillRect(0, y(D) - 36, 10, 36).fillRect(PW - 10, y(D) - 36, 10, 36);
    const t = sc.add.text(PW / 2, y(D) - 53, 'FINISH  결승선', { fontFamily: FONT, fontSize: '26px', color: '#111111' }).setOrigin(0.5); w.add(t);
    // 거리 표지(20m 단위)
    for (let m = 20; m < D; m += 20) {
      const label = sc.add.text(34, y(m) - 6, m + 'm', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0, 1).setAlpha(0.6); w.add(label);
      g.lineStyle(2, 0xffffff, 0.35).lineBetween(8, y(m), 90, y(m));
    }
  }
  // dist: 러너 월드 거리(m), speed: 현재 속도
  scroll(dist, speed, dt, boosting) {
    const off = dist * CFG.PPM;
    this.grass.tilePositionY = -off; this.dash.tilePositionY = -off; this.dash2.tilePositionY = -off;
    this.world.y = CFG.RUNNER_Y + off;
    const k = Math.max(0, (speed - 6) / 6);
    for (const l of this.speedLines) {
      l.y += speed * CFG.PPM * 1.2 * l.sp * dt; l.fillAlpha = boosting ? 0.1 + 0.3 * Math.min(1, k) : 0; l.height = 30 + 70 * Math.min(1, k) * l.sp;
      if (l.y > 720) { l.y = CFG.TOP - 90; l.x = this.x0 + 14 + Math.random() * (PW - 28); }
    }
  }
  laneX(lane) { return this.cx + (lane - 1) * CFG.LW; }
}
