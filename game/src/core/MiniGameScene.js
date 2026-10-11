import { GameState } from './GameState.js';
import { SFX } from './SoundFX.js';
import { W, H, FONT, SIDE } from '../config/constants.js';

// 미니게임 공통 베이스.
// BoardScene 이 `scene.launch(KEY, { playerId, aiId, onDone })` 로 실행한다.
// 단독 테스트: index.html?scene=PKScene  (data 없으면 felipe vs jun)
//
// 서브클래스 규칙:
//   - constructor: super(KEY)
//   - create(): 반드시 this.setupMini() 호출 후 게임 시작
//   - 게임이 끝나면 this.finishMini({ winner: 'player'|'ai'|'draw', detail: '3:2 승리' }) 한 번 호출
//     (결과 배너 + 효과음 + 점수 반영은 여기서 처리, 이후 onDone 콜백 호출 & scene stop)
export class MiniGameScene extends Phaser.Scene {
  init(data) {
    this.mini = {
      playerId: (data && data.playerId) || GameState.playerId,
      aiId: (data && data.aiId) || GameState.aiId,
      onDone: (data && data.onDone) || null,
      standalone: !(data && data.onDone),
    };
    this.finished = false;
  }
  get playerId() { return this.mini.playerId; }
  get aiId() { return this.mini.aiId; }

  setupMini() {
    SFX.bgm.start('mini');
    this.events.once('shutdown', () => { SFX.drumroll(false); });
  }

  // 점수 +5(승) / +2씩(무) 는 BoardScene(onDone 수신 측)에서 GameState 에 반영한다. 여기서는 연출만.
  finishMini(result) {
    if (this.finished) return; this.finished = true;
    const { winner, detail = '' } = result;
    const title = winner === 'draw' ? '무승부!' : winner === SIDE.PLAYER ? '미니게임 승리!' : '미니게임 패배...';
    const sub = winner === 'draw' ? '양쪽 모두 +2점' : winner === SIDE.PLAYER ? '+5점 획득!' : '상대가 +5점 획득';
    SFX.play(winner === 'draw' ? 'drawMini' : winner === SIDE.PLAYER ? 'winMini' : 'loseMini');
    const bg = this.add.rectangle(W / 2, H / 2, W, 170, 0x000000, 0.7).setDepth(1000).setScale(1, 0);
    const t1 = this.add.text(W / 2, H / 2 - 28, title, { fontFamily: FONT, fontSize: '64px', color: winner === SIDE.PLAYER ? '#ffd700' : winner === 'draw' ? '#ffffff' : '#ff7777', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setDepth(1001).setAlpha(0);
    const t2 = this.add.text(W / 2, H / 2 + 36, [sub, detail].filter(Boolean).join('   '), { fontFamily: FONT, fontSize: '30px', color: '#ffffff', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(1001).setAlpha(0);
    this.tweens.add({ targets: bg, scaleY: 1, duration: 250 });
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 250, delay: 150 });
    this.time.delayedCall(2200, () => {
      const cb = this.mini.onDone;
      if (cb) { this.scene.stop(); cb(result); }
      else { this.scene.restart(); }      // 단독 실행: 다시 시작
    });
  }
}
