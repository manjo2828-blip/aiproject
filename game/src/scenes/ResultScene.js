import { SCENES } from '../config/constants.js';
import { GameState } from '../core/GameState.js';
import { pickAI } from '../config/characters.js';
import { SFX } from '../core/SoundFX.js';
import { Confetti } from '../fx/Confetti.js';
import { buildStadium } from './result/Stadium.js';
import { Scoreboard } from './result/Scoreboard.js';
import { Finale } from './result/Finale.js';

// 최종 결과: 1) 서스펜스(드럼롤+룰렛 스코어) -> 2) 기록 비교 -> 3) 피날레(승리/패배/무승부). 클릭/Space/Enter 로 3단계로 스킵.
export class ResultScene extends Phaser.Scene {
  constructor() { super(SCENES.RESULT); }

  create() {
    this.stage = 0; this.finaleStarted = false; this.buttonsReady = false;
    const q = new URLSearchParams(location.search);
    if (q.get('demo') === '1') this.fillDemoStats();
    const fast = +q.get('fast') || 1;   // 개발용 시간 배속 (?fast=4)
    if (fast !== 1) { this.time.timeScale = fast; this.tweens.timeScale = fast; }
    this.cameras.main.setBackgroundColor('#050b1f');
    try { SFX.unlock(); } catch (e) { /* 오디오 불가 환경 */ }
    SFX.bgm.stop();                      // 마지막 턴 직후 BGM 급정지
    SFX.drumroll(true);

    this.bg = buildStadium(this);
    this.confetti = new Confetti(this, { depth: 60 });
    this.board = new Scoreboard(this, GameState);
    this.finale = new Finale(this, {
      GS: GameState, confetti: this.confetti, bg: this.bg,
      toMain: () => this.toMain(), retry: () => this.retry(),
      onButtonsReady: () => { this.buttonsReady = true; },
    });

    // 스킵 입력
    this.input.on('pointerdown', () => this.skip());
    this.input.keyboard.on('keydown-SPACE', () => this.skip());
    this.input.keyboard.on('keydown-ENTER', () => this.skip());
    this.add.text(1270, 710, '클릭 / Space : 건너뛰기', { fontFamily: 'Jua, sans-serif', fontSize: '16px', color: '#ffffffaa' }).setOrigin(1, 1).setDepth(100).setName('skipHint');

    this.events.once('shutdown', () => { SFX.drumroll(false); this.tweens.killAll(); });
    this.stage = 1;
    this.board.runSuspense(() => { this.stage = 2; this.board.runStats(() => this.startFinale()); });
  }

  // ?demo=1 : 통계가 전부 0 이면 보기 좋은 가짜 값 채우기
  fillDemoStats() {
    const st = GameState.stats, sum = ['player', 'ai'].reduce((a, s) => a + Object.values(st[s]).reduce((x, y) => x + y, 0), 0);
    if (sum > 0) return;
    Object.assign(st.player, { laps: 2, tackles: 3, tackled: 1, miniWins: 3, shopBuys: 1 });
    Object.assign(st.ai, { laps: 1, tackles: 1, tackled: 3, miniWins: 2, shopBuys: 1 });
  }

  skip() {
    if (this.finaleStarted) return;
    this.board.finish();
    this.startFinale();
  }

  startFinale() {
    if (this.finaleStarted) return;
    this.finaleStarted = true; this.stage = 3;
    this.children.getByName('skipHint')?.setVisible(false);
    this.board.toCompact();
    const w = GameState.winner;
    if (w === 'draw') this.finale.draw();
    else if (w === 'player') this.finale.win();
    else this.finale.lose();
  }

  toMain() { SFX.bgm.stop(); SFX.drumroll(false); this.scene.start(SCENES.TITLE); }
  retry() {
    SFX.drumroll(false);
    const pid = GameState.playerId;
    GameState.reset(pid, pickAI(pid));
    this.scene.start(SCENES.BOARD);
  }
}
