# 003 프론트 공통 헬퍼 레퍼런스 (`window.AP`)

작성: FE-공통. 파일: `static/js/common.js`, `static/css/app.css`, `templates/base.html`. 002 문서의 구체화판. 페이지 js 는 `DOMContentLoaded` 에서 `AP.*` 만 사용, 서버/사용자 문자열은 `textContent` 로만 삽입.

## 템플릿 규약 (base.html)
```jinja
{% extends "base.html" %}
{% block title %}이게 뭐게?{% endblock %}
{% block theme %}theme-classify{% endblock %}   {# <body class> #}
{% block head %}{% endblock %}                  {# 선택 #}
{% block content %}...{% endblock %}
{% block scripts %}<script src="/static/js/classify.js"></script>{% endblock %}
```
라우트는 `active` 컨텍스트 변수 (`classify|detect|pose|face|emotion|home`)를 템플릿에 넘기면 네비 하이라이트. (없으면 `request.url.path` 로 자동 판별하니 `request` 만 넘겨도 됨.) common.js 는 scripts 블록보다 먼저 로드됨.
페이지 전용 CSS 는 app.css 하단 `/* ---- page: xxx ---- */` 구간 또는 템플릿 `{% block head %}<style>` 에.

## 공통 HTML/CSS 클래스
- 레이아웃: `.container`(max 960), `.page-title`(h1) `.page-sub`(설명), `.grid`(auto-fit minmax 260), `.grid-2`(2열, 모바일 1열), `.stack`(세로 gap), `.row`(가로 flex wrap gap), `.muted`, `.center`, `.hidden`
- `.card` (스티커 카드), `.card-title`, `.btn`, `.btn-primary`(코랄), `.btn-accent`(페이지 `--accent` 배경), `.btn-ghost`, `.btn-sm`, `.btn:disabled`
- `.chip`(알약; `.chip.active` 선택됨, `button.chip` 클릭 가능, `.chip[style*=--c]` 대신 `style="--c:#hex"` 로 점 색 지정 → `.chip .dot`)
- `.tabs` > `button.tab[aria-selected=true]` + `.tab-panel` (hidden 속성으로 토글; JS 직접)
- `.field` / `input[type=range]` / `textarea` / `.counter`(글자수) 기본 스타일 제공
- `.canvas-wrap` > `<canvas>` : 100% 폭, 둥근 테두리. 캔버스 내부 해상도는 원본 px.
- `.comment` : 결과 맨 아래 "한 줄 코멘트" 큰 말풍선 (`<p class="comment">`)
- `.badge` (`.badge.ready/.loading/.error`), `.bar-*` 막대, `.gauge` 원형 게이지, `.spinner`, `.toast`, `.dropzone`, `.emoji-big`(큰 이모지) `.bounce`(바운스 애니)
- 로딩: 결과 영역 컨테이너(보통 `.card`)에 `AP.setLoading(el,true)` → 클래스 `is-loading` 이 붙고 반투명 오버레이 + 스피너 표시 (컨테이너가 position:relative 가 됨).
- 테마: body `theme-classify|detect|pose|face|emotion|home` → `--accent` 정의됨. 색은 항상 `var(--xxx)`.

## 함수
### 네트워크
| 함수 | 설명 |
|---|---|
| `AP.api(path, {method='GET', json, formData})` → Promise<JSON> | 실패 시 `throw {code, message, status}` (서버 에러 포맷 `{error:{code,message}}` 변환, 네트워크 실패는 `NETWORK_ERROR`). **호출측 catch 에서 `AP.toast(e.message,'error')`**. |
| `AP.postImage(path, file, extra)` → Promise<JSON> | `AP.resizeImage(file,1280)` 후 FormData(`file` + `extra` 객체 필드)로 POST. |
| `AP.postImages(path, {file_a: fileA, file_b: fileB}, extra)` → Promise<JSON> | 여러 파일 필드(리사이즈 포함). face/compare 용. |
| `AP.resizeImage(file, maxSide=1280)` → Promise<File> | 긴 변 축소 JPEG(0.9). 이미 작으면 원본 그대로. |
| `AP.loadImage(fileOrUrl)` → Promise<HTMLImageElement> | File/Blob/URL 로드 (EXIF 회전은 브라우저가 반영). |
| `AP.safe(asyncFn, loadingEl)` → Promise | `setLoading(true)` → 실행 → 예외 시 `toast(error)` 후 `null` 반환 → finally `setLoading(false)`. 보일러플레이트 제거용. 예: `const data = await AP.safe(()=>AP.postImage('/api/classify', file), resultCard); if(!data) return;` |

### 이미지 입력 위젯
```js
const picker = AP.createImagePicker(document.getElementById('picker'), {
  onImage(file, objectUrl) { ... },   // 파일 선택/드롭/붙여넣기/웹캠/샘플 모두 여기로 (File 객체)
  onClear() {},                        // 선택사항: "다시 고르기" 눌렀을 때
  samples: [{label:'고양이', url:'/static/img/samples/cat.jpg'}],  // 로드 실패(404) 시 해당 버튼 자동 숨김
  webcam: true,                        // 기본 true. getUserMedia 없으면 버튼 숨김
  hint: '여기에 사진을 끌어놓거나 클릭!',  // 선택
  label: 'A'                           // 선택. 좌상단 라벨 칩 (face compare 의 A/B)
});
picker.getFile()   // 마지막 File|null
picker.setFile(f)  // 코드로 지정 (onImage 호출됨)
picker.clear()     // 초기화 (onClear 호출 안 함)
```
- `rootEl` 은 빈 `<div id="picker"></div>` 하나면 충분. 내부 DOM 은 위젯이 생성 (`.picker > .dropzone, .picker-actions, .picker-samples, .picker-preview`).
- 붙여넣기(Ctrl+V)는 `document` 전역 리스닝, 여러 picker 가 있으면 **마지막으로 포커스/호버한 picker** 가 받음.
- 이미지가 선택되면 dropzone 안에 미리보기 썸네일이 표시됨 (별도 미리보기 불필요).

### 그리기 (canvas)
좌표는 항상 서버 응답 픽셀 좌표 = 캔버스 내부 해상도. 선 굵기/폰트는 표시 크기에 맞게 자동 보정(`AP.canvasScale`).
| 함수 | 설명 |
|---|---|
| `AP.fitCanvas(canvas, source, image)` → ctx | `source`(HTMLImageElement/ImageBitmap/canvas)를 `image.width×height` 로 canvas 에 그리고 ctx 반환. 다시 그릴 때마다 호출하면 배경이 리셋됨(하이라이트 재그리기에 사용). |
| `AP.canvasScale(canvas)` → number | 내부px / CSS px 비율 (≥1). 직접 그릴 때 `lineWidth = 3*AP.canvasScale(c)`. |
| `AP.drawBoxes(ctx, boxes, opts)` | `boxes`: `[{bbox:[x1,y1,x2,y2], label?:string, color?:string, dim?:bool, bold?:bool}]`. `opts`: `{color:string\|fn(box,i), labelFn:fn(box,i)→string, lineWidth=3, fontSize=14(css px)}`. 라벨 칩은 박스 위(공간 없으면 안쪽)에 `color` 배경 + 흰/검 글자. `dim` → 투명도 0.25, `bold` → 선 굵게. |
| `AP.hitBox(canvas, mouseEvent, boxes)` → index\|-1 | 마우스 위치가 들어있는 가장 작은 박스 인덱스 (hover 구현용). |
| `AP.drawPoints(ctx, points, opts)` | `points`: `[[x,y]]` 또는 `[{x,y,score}]`. `opts`: `{color, radius=5(css px), minScore=0, stroke=true}`. |
| `AP.drawSkeleton(ctx, person, opts)` | `person`: `{keypoints:[{x,y,score}]}`. `opts`: `{edges, color, lineWidth=4, radius=6, minScore=0.3}`. 선+점 모두 그림 (score<minScore 점/선 생략). |
| `AP.colorFor(key)` → '#hex' | 문자열/숫자 해시 → 팔레트 8색 (같은 키는 항상 같은 색). `AP.PALETTE` 배열도 공개. |

### UI 유틸
| 함수 | 설명 |
|---|---|
| `AP.toast(msg, type='info', ms=3000)` | `'info'|'error'|'success'`. |
| `AP.setLoading(el, bool)` | 위 "로딩" 참고. |
| `AP.countUp(el, to, ms=800, {decimals=0, suffix=''})` | 숫자 증가 애니 (`textContent`). reduced-motion 이면 즉시. |
| `AP.confetti(n=20)` | 🎉 이모지 낙하. |
| `AP.pick(array)` | 랜덤 요소. |
| `AP.el(tag, {class, text, attrs..}, children[])` → Element | 안전한 DOM 생성 (text 는 textContent). 예 `AP.el('li',{class:'chip',text:'안녕'})` |
| `AP.clear(el)` | 자식 모두 제거. |
| `AP.pct(x, decimals=0)` → '87%' | 0~1 확률 → 퍼센트 문자열. |
| `AP.renderBars(container, items, opts)` | 가로 막대 차트. `items:[{label, value(0..1), color?, badge?(예 '👑'), highlight?:bool, text?}]`, `opts:{max=1, format=fn(v)→str, animate=true}`. 컨테이너 내용을 교체. 생성 DOM: `.bars > .bar-row(.top) > .bar-label, .bar-track > .bar-fill(style width, --c), .bar-value`. 너비 transition 0.6s 로 0 → 값. 막대 색 기본 `var(--accent)`. |
| `AP.setGauge(el, percent, {color, countUp=true})` | 원형 게이지. `el` = `<div class="gauge"><span class="gauge-num"></span></div>` (`gauge-num` 없으면 생성). `--pct`/`--c` CSS 변수 갱신 + 숫자 count-up(`%`). |
| `AP.statusDots()` → Promise | `/api/health` 로 헤더 점 갱신 (자동 1회 실행됨. 직접 호출 불필요). |
| `AP.sleep(ms)`, `AP.debounce(fn, ms)` | 편의. |

## 결과 카드 권장 구조
```html
<section class="card" id="result" hidden>
  <h2 class="card-title">결과</h2>
  <div class="canvas-wrap"><canvas id="cv"></canvas></div>
  <div id="chips" class="row"></div>
  <p class="comment" id="comment"></p>
</section>
```
요청 중: `AP.setLoading(card,true)`; 결과 표시 시 `card.hidden=false` 후 `.bounce`/`.pop` 클래스로 등장 애니(`pop` 은 app.css 제공).

## 인라인 스타일 금지 색
하드코딩 색 금지 — `var(--primary|--sun|--mint|--sky|--grape|--danger|--muted|--ink|--bg|--card|--accent)` 만 사용. 캔버스 색은 `getComputedStyle` 대신 `AP.colorFor` / `AP.cssVar('--accent')` (→ 현재 값 문자열).

## 개정 (리뷰 반영, 하위 호환)
- `AP.safe(fn, loadingEl)`: 카드별 진행 중 요청 수를 세어 **마지막 요청이 끝날 때만** 스피너 해제. 더 새 요청에 밀린(superseded) 호출은 결과·에러 모두 버리고 `null` 반환 → 기존 `if(!data) return;` 가 stale 결과를 자동 무시. (loadingEl 이 key; 없으면 stale 보호 없음)
- `AP.latest(key)` → `{id, ok()}`: 직접 비동기 흐름(pose 라이브 등)에서 `var t=AP.latest(card); ...await...; if(!t.ok()) return;`.
- `AP.loadImage(File)`: 로드/실패 시 objectURL 자동 revoke. (picker 의 `onImage(file, objectUrl)` URL 은 picker 가 교체/clear 시 revoke)
- `AP.onCanvasResize(canvas, redrawFn)` → off(): CSS 폭이 바뀔 때(리사이즈/회전/숨김 탭이 보여질 때) `redrawFn` 호출. 등록 즉시 호출 안 함, 같은 canvas 재등록 시 교체.
- `AP.canvasScale`: 숨김 캔버스(clientWidth=0)는 600css px 가정. `drawBoxes` 선 ≥3css px + 어두운 후광, 폰트 ≥12css px, 점 반경 ≥4, 스켈레톤 선 ≥3.
- `AP.announce(msg)`: 스크린리더용 polite 안내 (결과 요약 등). `.sr-only` 클래스 제공.
- 웹캠 모달: 중복 열기 방지, 포커스 트랩, Esc 닫기, 닫을 때 트랙 항상 stop + 트리거 버튼으로 포커스 복귀, pagehide 시 정리.
