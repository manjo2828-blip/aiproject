# Footival(풋티벌) 개발 계약서 — 모든 에이전트 필독

웹게임 / **Phaser 3.80.1** (전역 `Phaser`, `lib/phaser.min.js`) / ES Modules / 해상도 **1280x720 고정**(Scale FIT).
원 기획서는 사용자 메시지에 있었고, 아래는 그 핵심 + 확정된 해석이다. **자기 담당 파일만 수정**한다 (다른 에이전트가 동시에 작업 중).

## 실행/검증
- 서버: `node serve.js 8123` (shot.js 가 자동 기동). 수동: `start.bat`.
- 캡처/자동테스트: `node tools/shot.js "scene=PKScene&char=jun" shots/xxx.png --wait 2000 --keys "Space@800" --multi "500:shots/a.png,1500:shots/b.png"`
  (상단 주석에 옵션 전부 설명. 콘솔 에러 있으면 종료코드 1 — **반드시 에러 0 확인**). 캡처 이미지를 Read 로 직접 눈으로 확인해서 UI 겹침/잘림/한글 깨짐을 점검할 것.
- 직접 디버그: `window.__game` (Phaser.Game). URL 파라미터: `?scene=<SceneKey>&char=<id>&ai=<id>&score=<p>,<a>`.
- 파일 하나가 400줄을 넘지 않게 **잘게 분리**할 것 (사용자 요구). 클래스/모듈 단위로 나눈다.
- 한글 UI. 폰트는 `FONT` 상수(Jua). 텍스트는 `txt()` 헬퍼나 `fontFamily: FONT`.
- 효과음은 **전부 `SFX.play('이름')`** (src/core/SoundFX.js, 이름 목록은 그 파일 `sounds` 참고). 필요한 새 소리가 있으면 SoundFX.js 의 `sounds` 에 **추가만** (기존 수정 금지) — 단, 같은 파일을 동시에 수정하면 충돌하므로 새 사운드는 자기 씬 안에서 `SFX.tone/noise/seq` 저수준 함수로 직접 합성해도 됨(권장).
- 그래픽: Kenney(CC0) 에셋 우선 사용 (assets/kenney/…, 로드 키는 src/core/Assets.js 참고. 필요 시 자기 씬 preload 에서 추가 로드: `if(!this.textures.exists(k)) this.load.image(...)`). 탑다운 선수 스프라이트: 아틀라스 `sports_chars` 프레임명 `characterBlue (1).png` 등(팀색: Blue/Red/Green/White/Special(노랑)). 공: 아틀라스 `sports_equip` `ball_soccer1.png` 등.
- 새 에셋을 쓰면 assets/CREDITS.md 에 한 줄 추가하지 말고(충돌 방지) 최종 보고에 적을 것.

## 공용 모듈 (이미 존재, 수정 금지 — 버그 발견 시 보고)
- `config/constants.js` : W,H,FONT,COLORS,RULES,SIDE('player'|'ai'),SCENES,MINIGAMES
- `config/characters.js` : CHARACTERS(id: felipe/jun/chloe/camila; hair/skin/kit/accent/…), `lapBonus(id)`, `tacklePenalty(victimId)`, `rollDice(id,max)`, `moveSpeedMul(id)`, `goodEventChance(id)`, `pickAI`
- `config/board.js` : TRACK(8칸 배열, 0=출발선), TILE_TYPES, EVENTS
- `core/GameState.js` : 싱글톤. `playerId, aiId, turn, maxTurns(5), scores{player,ai}, pos{player,ai}, items{side:{boots}}, stats{side:{laps,tackles,tackled,miniWins,shopBuys}}`, `addScore(side,delta,reason)`→실제 반영 증감(0 미만 클램프), `addLog`, `onChange(fn)`, `charOf(side)`, `other(side)`, `winner`
- `core/SoundFX.js` : `SFX.unlock()`(첫 클릭), `SFX.play(name)`, `SFX.bgm.start('title'|'board'|'mini')`, `SFX.bgm.stop()`, `SFX.drumroll(bool)`, `SFX.toggleMute()`
- `core/MiniGameScene.js` : 미니게임 베이스(아래)
- `ui/Button.js` : `new Button(scene,x,y,label,{w,h,color,fontSize,onClick})`, `txt(scene,x,y,str,size,color)`
- `characters/CharacterArt.js` : 아래 API (Agent A 가 구현, 현재 stub)

## 확정 규칙 해석 (불명확했던 부분)
- 점수 1종류만 존재 (HUD의 "점수/코인" 은 같은 값으로 표시해도 되고 점수 아래 작은 글씨로 🪙=점수 표시). 점수는 0 미만 불가.
- 트랙 8칸 `TRACK=['cheer','yellow','event','cheer','shop','yellow','event','cheer']`, 인덱스 0=출발선(응원석). 둘 다 0에서 시작. 시계방향 진행, 인덱스 증가.
- 주사위 1~3 (`rollDice`). 스피드 축구화 보유 시 다음 굴림만 1~6(굴림 후 소모). 가격 `RULES.SHOP_PRICE`(4점).
- **완주 보너스**: 이동 경로가 인덱스 0 을 (7→0 으로 넘어가며) 통과하거나 정확히 0 에 도착하면 +`lapBonus(id)`. 출발 시점 위치(칸)는 경로에 포함 안 됨. 스탯 laps++.
- **슬라이딩 태클**: 이동 경로(출발칸 제외, 도착칸 포함)에 상대가 서 있는 칸이 있으면 발동. 이동자(공격자)가 상대에게서 `tacklePenalty(victimId)` 만큼 점수를 뺏는다(피해자의 실제 감소분 = 공격자의 획득분. 클램프로 부족하면 가진 만큼만). 이동 시작 칸에서 이미 같은 칸이면 발동 안 함. 한 번의 이동에 태클은 최대 1회. (게임 시작 시 둘 다 0번 칸이어도 무관.)
- **이벤트 칸(VAR)**: 3종 — `swap`(위치 맞바꿈, 태클/완주 보너스 없음), `extra`(주사위 한 번 더 굴림 → 추가 이동), `tackle`(강제 태클: 상대가 나에게서 점수 `tacklePenalty(나)` 뺏어감). 확률: 좋은 이벤트(swap/extra) 합 `goodEventChance(id)`, 나머지가 tackle.
- **용품점**: 도착 시 플레이어는 [구매]/[패스] 선택 UI, AI 는 점수≥가격+3 이면 구매. 이미 보유 중이거나 점수 부족 시 구매 불가.
- 응원석 +3 / 옐로카드 -2 / 도착한 칸에서만 효과 (통과 칸은 효과 없음). 이벤트로 이동한 칸(swap)의 칸 효과는 적용하지 않음.
- **턴 구성**: 한 턴 = 플레이어 이동 → AI 이동 → 미니게임 1개 → 턴+1. 5턴 끝나면 ResultScene. 미니게임은 3종 중 랜덤(직전과 같은 것 연속 금지).
- 미니게임 결과: 승자 +5(`RULES.MINIGAME_WIN`), 무승부면 양쪽 +2. 스탯 miniWins++.
- 캐릭터 특성: 펠리페 완주+12 / 준 태클 피격 -2 / 클로에 주사위1 확률↓+이동속도↑ / 카밀라 이벤트 긍정 확률↑ (모두 config/characters.js 헬퍼 사용).

## 미니게임 계약 (PK / Heading / Dribble)
- `extends MiniGameScene` (core/MiniGameScene.js 읽을 것). `create()` 에서 `this.setupMini()` 호출. 끝나면 `this.finishMini({winner:'player'|'ai'|'draw', detail:'3:2'})` **정확히 1회**.
- 입력: 키보드 + 화면 버튼 병행. 게임 시작 전 **2~3초 조작 안내 오버레이/카운트다운(3,2,1,GO)** 필수. 플레이어 캐릭터 = `this.playerId`, 상대 = `this.aiId` (포인트컬러/유니폼 색을 `CHARACTERS[id].kit` 로 반영). 상단에 미니게임 제목 배너.
- 단독 테스트: `?scene=PKScene` — 끝나면 자동 재시작.
- AI 난이도는 "이길 수도 질 수도 있는" 수준(플레이어 승률 ≈ 55~65%).
- 결정론적 테스트를 위해 `?seed=` 같은 건 불필요. 대신 자동 플레이 검증은 `window.__game.scene.getScene('PKScene')` 을 통해 입력 메서드를 직접 호출하는 방식으로.

## CharacterArt API (Agent A 구현)
- `CharacterArt.ensureTextures(scene)` → 텍스처 `portrait_<id>`(256x256 상반신), `icon_<id>`(96x96 원형 얼굴+포인트컬러 테두리). BootScene 이 호출.
- `CharacterArt.createFigure(scene,id,{scale})` → Container(원점=발 중앙). `fig.play('idle'|'run'|'dance'|'cheer'|'trophy'|'sad'|'kick')`, `fig.stopAnim()`, `fig.setFacing(±1)`.
- 외형(기획서): 펠리페=금발 숏컷 남/노랑+파랑 유니폼, 준=흑발 댄디컷 남/빨강+검정, 클로에=흑발 단발 여/딥블루+흰색, 카밀라=금발 포니테일 여/하늘색+흰색 세로줄무늬.

## Rules API (Agent R 구현, src/board/Rules.js — 순수 로직, Phaser 의존 금지) — BoardScene(Agent V)이 사용
모든 함수는 GameState 를 **즉시 갱신**하고, 연출용 이벤트 배열을 반환한다. 이벤트 객체:
- `{type:'move', side, from, to, path:[idx...], dice}`  (path: 출발칸 제외 ~ 도착칸 포함, 인덱스는 mod 8)
- `{type:'lap', side, bonus}`            완주 보너스 (이미 점수 반영됨)
- `{type:'tackle', attacker, victim, amount, at}`   amount=실제 이동한 점수 (0일 수 있음)
- `{type:'tile', side, tile, delta, idx}`  응원석/옐로카드 (delta 는 실제 반영분)
- `{type:'event', side, event:'swap'|'extra'|'tackle', good:boolean}` 후속 효과는 뒤따르는 이벤트(`swap`→`{type:'swap', a:{side,from,to}, b:{side,from,to}}`, `tackle`→위 tackle 이벤트, `extra`→`{type:'extraRoll', side}`)
- `{type:'shop', side, price, canBuy}`    (구매 결정 대기 — 플레이어는 UI, AI 는 `Rules.aiBuyDecision(side)`)
- `{type:'minigame', winner, deltas:{player,ai}}`
API:
- `Rules.rollDice(side)` → `{value, max, usedBoots}` (축구화 소모 포함)
- `Rules.move(side, dice)` → events[] (move + lap + tackle; 이동·완주·태클까지)
- `Rules.landTile(side)` → events[] (현재 칸 효과: tile / event(+후속) / shop)
- `Rules.buyBoots(side)` → boolean (성공 시 점수 차감, items.boots=true, stats.shopBuys++)
- `Rules.aiBuyDecision(side)` → boolean
- `Rules.resolveMinigame(winner)` → events[] ('player'|'ai'|'draw')
- `Rules.advanceTurn()` → 턴++ 후 `{over:boolean}`
- `Rules.pickMinigame(prevKey)` → SCENES 의 미니게임 키
