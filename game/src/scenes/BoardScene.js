import { SCENES } from '../config/constants.js';
import { GameState } from '../core/GameState.js';
import { SFX } from '../core/SoundFX.js';
import { HUD } from '../ui/HUD.js';
import { BoardRenderer } from '../board/BoardRenderer.js';
import { TokenSprites } from '../board/TokenSprites.js';
import { ActionPanel } from '../board/ActionPanel.js';
import { EventPlayer } from '../board/EventPlayer.js';
import { TurnFlow } from '../board/TurnFlow.js';
import { Fx } from '../board/Fx.js';
import { Rules } from '../board/Rules.js';

window.__rules = Rules; window.__gs = GameState;   // 개발/자동테스트용 디버그 핸들

// 메인 보드 화면. 개발용 URL 파라미터: ?minigame=skip  ?auto=1  ?turn=N  ?pos=p,a  ?realtime=1(느린 헤드리스용)
const ICONS = ['award', 'card', 'pouch', 'sword', 'arrow_reserve', 'arrow_clockwise', 'dice_6', 'flag_square'];

export class BoardScene extends Phaser.Scene {
  constructor() { super(SCENES.BOARD); }

  preload() {
    ICONS.forEach((n) => { if (!this.textures.exists('icon_' + n)) this.load.image('icon_' + n, `assets/kenney/icons/default/${n}.png`); });
  }

  create() {
    const q = new URLSearchParams(location.search);
    const opts = { skipMini: q.get('minigame') === 'skip', auto: q.get('auto') === '1' };
    if (q.get('pos')) { const [a, b] = q.get('pos').split(',').map(Number); GameState.pos.player = a; GameState.pos.ai = b; }   // ?pos=플레이어칸,AI칸
    if (q.get('turn')) GameState.turn = Math.max(1, Math.min(GameState.maxTurns, +q.get('turn') || 1));
    if (q.get('realtime') === '1') this.game.loop.smoothStep = false;   // 개발용: 느린 헤드리스 환경에서 게임 시간을 실시간에 맞춤
    this.cameras.main.setBackgroundColor('#2e7d32');
    this.fx = new Fx(this);
    this.board = new BoardRenderer(this);
    this.tokens = new TokenSprites(this);
    this.hud = new HUD(this, this.fx);
    this.panel = new ActionPanel(this);
    const player = new EventPlayer(this, { tokens: this.tokens, hud: this.hud, fx: this.fx, board: this.board, auto: opts.auto });
    this.flow = new TurnFlow(this, { tokens: this.tokens, hud: this.hud, fx: this.fx, panel: this.panel, player, opts });
    SFX.bgm.start('board');
    this.events.on('wake', () => { SFX.bgm.start('board'); this.hud.sync(); });
    this.flow.run().catch((err) => { console.error("BoardFlow error:", err && err.stack || err); });
  }
}
