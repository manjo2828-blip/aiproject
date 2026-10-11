# 002 컨셉 / UX / API 계약

상태: 확정 (architect). 코드 없음. 모든 UI 문구는 한국어.

## 1. 컨셉
- 이름: **AI 놀이터 (AI Nolitea)** — 영문 로고 표기 `AI Playground`
- 태그라인: **"사진 한 장, 문장 한 줄이면 AI가 놀아줘요!"**
- 테마: 동네 놀이터 + 문방구 스티커. AI를 "놀이기구 5종"으로 비유 (각 페이지 = 놀이기구).
- 톤: 반말 아닌 귀여운 존댓말 + 이모지. 결과는 항상 "한 줄 코멘트"로 끝낸다.
- 마스코트: 이모지 로봇 🤖 (이미지 파일 불필요).

## 2. 비주얼 스타일 (라이트 모드 단일, 다크모드 없음)
Google Fonts (head 에 `<link>` 한 줄):
`Jua` (제목/버튼, 둥근 한글), `Noto Sans KR` 400/700 (본문). 
`font-family: 'Jua','Noto Sans KR',sans-serif` 제목, 본문은 `'Noto Sans KR',sans-serif`.

CSS 변수 (app.css `:root`, 모든 페이지 공통 — 하드코딩 색 금지):
| 변수 | 값 | 용도 |
|---|---|---|
| --bg | #FFF9EC | 배경(크림) |
| --card | #FFFFFF | 카드 |
| --ink | #2B2A33 | 글자/테두리 |
| --primary | #FF6B6B | 코랄, 주요 버튼 |
| --sun | #FFD93D | 강조/하이라이트 |
| --mint | #4ECDC4 | 성공/게이지 |
| --sky | #5AA9FF | 링크/보조 |
| --grape | #9B7BFF | 포인트 |
| --danger | #E5484D | 에러 |
| --muted | #8A8798 | 보조 글자 |
| --radius | 18px | 카드 라운드 |
| --shadow | 4px 4px 0 var(--ink) | "스티커" 그림자 |

스타일 규칙: 카드/버튼은 `border:3px solid var(--ink); border-radius:var(--radius); box-shadow:var(--shadow)`.
버튼 hover 시 `translate(2px,2px)` + 그림자 축소. 페이지별 포인트 색 클래스 `.theme-classify{--accent:var(--sky)}`,
`.theme-detect{--accent:var(--primary)}`, `.theme-pose{--accent:var(--mint)}`, `.theme-face{--accent:var(--grape)}`, `.theme-emotion{--accent:var(--sun)}`.
본문 max-width 960px, 모바일 우선(그리드 `repeat(auto-fit,minmax(260px,1fr))`). 외부 JS/CSS 라이브러리 금지(폰트 제외).

## 3. 공통 레이아웃 (templates/base.html)
- 헤더: 로고 `🤖 AI 놀이터` (→ `/`), 네비 5개 (`🏷️ 뭐게?` `📦 찾아봐` `🕺 따라해` `👯 닮은꼴` `💬 마음읽기`), 우측 모델 상태 점(●, `/api/health` 로 색: 민트/회색).
- `{% block content %}`, `{% block scripts %}` (페이지 js 로딩), `<body class="theme-xxx">` 는 `{% block theme %}`.
- 푸터: "CPU에서 열심히 돌아가는 중 🐢 · 업로드한 사진은 저장되지 않아요".
- 토스트 컨테이너 `<div id="toast-root">`, 로딩 오버레이는 각 결과 카드 안 `.spinner`.
- 라우트(app/main.py): `/`, `/classify`, `/detect`, `/pose`, `/face`, `/emotion` → 각 `templates/<page>.html` (index.html, classify.html, detect.html, pose.html, face.html, emotion.html).

## 4. 홈 페이지 (index.html)
1. 히어로: 큰 제목 + 태그라인 + 떠다니는 이모지 5개(CSS 애니메이션 `float`), CTA "놀러 가기 👇".
2. 놀이기구 카드 5장 그리드 (아이콘, 이름, 한 줄 설명, "타러 가기" 버튼, 모델 준비 상태 배지 `준비됨/예열 중/점검 중`).
   - 🏷️ 이게 뭐게? — "사진 속 정체를 맞혀요"
   - 📦 다 찾아봐! — "사진 속 물건을 전부 네모로 콕콕"
   - 🕺 포즈 따라잡기 — "몸 관절을 점과 선으로 쏙"
   - 👯 닮은꼴 판독기 — "두 얼굴 닮은 정도를 %로"
   - 💬 마음 읽기 — "문장 속 감정을 게이지로"
3. "오늘의 한마디" 랜덤 문구 (common.js 배열에서 선택).
4. 모델 상태는 `GET /api/models/status` 로 카드 배지 갱신 (실패 시 배지 숨김).

## 5. 페이지별 재미 요소
공통 입력 위젯 (common.js `createImagePicker`): 드래그앤드롭 영역 + 파일 선택 + `📷 웹캠으로 찍기` 버튼 + 붙여넣기(Ctrl+V) + 샘플 버튼들.
샘플 이미지는 `static/img/samples/<이름>.jpg` (라이선스 자유/직접 생성, 각 <200KB). 필요 파일명은 페이지별 아래에 명시. 없으면 버튼 숨김.

### 5.1 /classify — 🏷️ 이게 뭐게?
- 입력: 이미지 picker (웹캠 가능), 샘플: `cat.jpg dog.jpg pizza.jpg car.jpg`.
- 결과: top-5 가로 막대 (확률 %, 1등은 `--accent` + 왕관 👑, 막대 너비 CSS transition 0.6s).
- 멘트: 1등 확률 ≥70% "100% 확실해요! 이건 {label}!", 30~70% "음… {label} 같은데요? 🤔", <30% "저도 잘 모르겠어요 😵 (사진을 더 가까이!)".
- 재미: "맞혔나요?" 👍/👎 버튼 (클릭 시 토스트만, 저장 안 함). 1등 라벨은 `label_ko` 있으면 우선 표기.

### 5.2 /detect — 📦 다 찾아봐!
- 입력: picker, 샘플: `street.jpg room.jpg animals.jpg`. 슬라이더 "민감도"(= `conf` 0.1~0.9, 기본 0.4).
- 결과: 이미지 위 canvas 에 박스(클래스별 색 해시 팔레트) + 라벨 칩 `{label_ko} 87%`. 박스 위 hover 시 굵게.
- 요약 칩 줄: "사람 3 · 자동차 2 · 강아지 1" (개수 집계). 0개면 "아무것도 못 찾았어요 🫥 민감도를 낮춰 봐요".
- 재미: 칩 클릭 → 해당 클래스만 하이라이트(나머지 반투명). "숨은 그림 찾기" 느낌의 카운트업 애니메이션.

### 5.3 /pose — 🕺 포즈 따라잡기
- 입력: picker (웹캠 강력 추천 문구), 샘플: `dance.jpg yoga.jpg`.
- 결과: canvas 에 관절 점(반지름 6, `--accent`) + 뼈대선(굵기 4) + 사람별 다른 색. `score < 0.3` 키포인트는 그리지 않음.
- 재미: 간단 포즈 판정 문구(클라이언트 계산, 키포인트 이름 기준): 양 손목이 코보다 위 → "만세! 🙌", 한 손목만 위 → "손 흔들어요 👋", 그 외 "차렷 자세네요 🧍". 사람 수 "{n}명 발견!".
- 웹캠 "연속 모드" 토글(선택): 1.5초 간격 스냅샷 → 재요청 (이전 요청 진행 중이면 건너뜀). 시간 없으면 생략 가능.

### 5.4 /face — 👯 닮은꼴 판독기 (탭 2개)
- 탭 A "얼굴 찾기": 이미지 1장 → `/api/face/detect` → 얼굴 박스 + 5 랜드마크 점 canvas, "얼굴 {n}개 발견! 😎".
- 탭 B "닮은꼴 %": 좌/우 두 개의 picker (A, B 라벨), `💘 비교하기` 버튼 → `/api/face/compare`.
  - 결과: 두 얼굴에 박스(번호 칩) + 중앙 큰 원형 게이지(CSS conic-gradient, 숫자 count-up) `similarity_percent`%.
  - 멘트 구간: ≥85 "쌍둥이 아니세요?! 👯", 65~85 "가족이라고 해도 믿겠어요", 40~65 "어딘가 닮은 구석이…?", <40 "완전 다른 매력! ✨".
  - `same_person` true 이면 컨페티(이모지 🎉 20개 CSS 낙하).
- 샘플: `face_a.jpg face_b.jpg` (직접 생성/무저작권 이미지만; 실제 인물 사진 사용 금지 권장).
- 얼굴 없음/여러 명: 에러 코드 `NO_FACE` 토스트 "얼굴이 안 보여요 🙈", 여러 명이면 가장 큰 얼굴 사용 후 안내 문구 표시.
- 개인정보 문구 고정 표기: "사진은 서버에 저장되지 않아요".

### 5.5 /emotion — 💬 마음 읽기
- 입력: textarea (최대 500자, 글자수 카운터), 샘플 버튼 5개 (예: "오늘 로또 맞았어!! 😆", "시험 망쳐서 너무 우울해…", "진짜 짜증나, 왜 이래?", "그냥 그저 그래요.", "무서워서 잠이 안 와요"), `읽어보기` 버튼 (Ctrl+Enter 도 동작).
- 결과: 큰 이모지(1등 감정) 바운스 + 감정별 가로 막대 게이지(확률 순) + 반원 "기분 미터"(긍정↔부정, `sentiment` 값 -1..1 로 바늘 회전).
- 감정→이모지/색 매핑 (프론트 상수, emotion.js): 기쁨😄 --sun / 슬픔😢 --sky / 분노😡 --danger / 불안😰 --grape / 놀람😲 --mint / 중립😐 --muted / 기타는 label 그대로 + 🙂. (라벨 집합이 모델마다 다르므로 매핑 없으면 🙂.)
- 멘트: "{label} 가득한 문장이네요! {emoji}" + 확률 낮으면(<0.4) "감정이 섞여 있어요 🌈".
- 재미: 입력 중이 아닌 결과 시 배경 카드에 감정색 파스텔 플래시.

## 6. 공통 프론트 규약
### static/js/common.js (전역 `window.AP` 네임스페이스, ES5/ES6 모듈 아님, 순수 JS)
- `AP.api(path, {method, json, formData})` → fetch 래퍼. 성공 시 JSON 반환, 실패 시 `{error:{code,message}}` 를 던져 (`throw` 객체 `{code,message}`) 호출측이 `AP.toast(e.message,'error')`.
- `AP.postImage(path, file, extraFields)` → FormData(`file` + 필드) 업로드. 업로드 전 `AP.resizeImage(file, 1280)` 으로 긴 변 1280px JPEG(0.9) 축소 (서버 부하 절감; 응답 좌표는 서버가 본 이미지 크기 기준이므로 `image.width/height` 를 반드시 사용).
- `AP.createImagePicker(rootEl, {onImage(file, objectUrl), samples:[{label,url}], webcam:true})` — D&D, 클릭 선택, 붙여넣기, 웹캠(getUserMedia → 모달 비디오 → 캡처 → File). 웹캠 거부 시 토스트.
- 그리기: `AP.fitCanvas(canvas, imgEl|bitmap, image{width,height})` (캔버스 내부 해상도=원본 크기, CSS 로 100% 폭 축소 → 좌표 변환 불필요), `AP.drawBoxes(ctx, boxes, {color, labelFn, lineWidth})`, `AP.drawSkeleton(ctx, person, {edges, color})`, `AP.drawPoints(ctx, points, opts)`, `AP.colorFor(key)` (문자열 해시 → 팔레트 8색).
- UI: `AP.toast(msg, type='info'|'error'|'success', ms=3000)`, `AP.setLoading(el, bool)`, `AP.countUp(el, to, ms)`, `AP.confetti()`, `AP.pick(array)`, `AP.statusDots()` (health/models status 폴링 1회).
- 규칙: 페이지 js 는 `DOMContentLoaded` 에서 `AP.*` 만 사용, 전역 변수 추가 금지, innerHTML 에 서버/사용자 문자열 삽입 금지(`textContent` 사용).
### static/css/app.css
`:root` 변수, 리셋, 헤더/푸터, `.card .btn .btn-primary .chip .bar .gauge .spinner .toast .dropzone .canvas-wrap .grid`, 애니메이션 `float bounce confetti`, 반응형 (<640px 네비는 가로 스크롤). 페이지 전용 스타일은 같은 파일 하단 섹션 주석으로 (파일 충돌 방지를 위해 페이지별 `/* ---- page: xxx ---- */` 구간만 각자 수정).

## 7. API 계약 (JSON, UTF-8)
공통 규칙
- 이미지 업로드: `multipart/form-data`, 필드 `file` (jpeg/png/webp/gif/bmp, ≤ 10MB, ≤ 약 4천만 화소). 서버는 EXIF 회전 적용 후 처리, 긴 변 > 1600 이면 축소. 반환 `image.width/height` 는 **서버가 추론에 쓴 최종 이미지 크기**이며 모든 좌표는 그 이미지의 **픽셀 좌표**(원점 좌상단, 정규화 아님). 프론트는 업로드 전 1280 이하로 줄이므로 보통 동일.
- 박스 형식: `bbox: [x1, y1, x2, y2]` (float, 이미지 경계로 clip). 점: `[x, y]`.
- 확률/점수는 0~1 float (소수 4자리). 퍼센트 표기는 프론트 책임(단, face 의 `similarity_percent` 는 0~100).
- 추론 시간 `elapsed_ms` (int) 모든 추론 응답에 포함.
- 에러(모든 엔드포인트 동일): HTTP 상태 + 본문 `{"error":{"code":"<UPPER_SNAKE>","message":"<한국어 사용자용 문장>"}}`.
  | HTTP | code | 상황 |
  |---|---|---|
  | 400 | INVALID_IMAGE | 디코딩 실패/지원 안 하는 형식 |
  | 400 | MISSING_FIELD | 필수 필드 없음 |
  | 400 | INVALID_PARAM | 범위 밖 값 |
  | 413 | FILE_TOO_LARGE | 10MB 초과 (요청 본문 12MB 초과는 읽기 전에 즉시 거절, /api/emotion 본문은 16KB) |
  | 413 | IMAGE_TOO_LARGE | 해상도 약 4천만 화소 초과 (디코드 전에 거절) |
  | 422 | NO_FACE | 얼굴 미검출 (compare 에서 `message` 에 어느 쪽인지 "A/B" 명시) |
  | 422 | TEXT_EMPTY / TEXT_TOO_LONG | 텍스트 비었음 / 500자 초과 |
  | 503 | MODEL_NOT_READY | 모델 파일/로딩 실패 (message: "모델이 아직 준비되지 않았어요") |
  | 500 | INTERNAL_ERROR | 기타 (스택 노출 금지) |
  FastAPI 기본 422/HTTPException 응답도 위 형식으로 변환하는 전역 exception handler 를 `app/main.py` 에 둔다.

### GET /api/health
`200 {"status":"ok","version":"0.1.0"}` (모델 로딩 안 함, 항상 가벼움)

### GET /api/models/status
```
200 {"models":{
  "classify":{"name":"<모델명>","state":"ready|loading|not_loaded|error","loaded":true,"error":null},
  "detect":{...}, "pose":{...}, "face":{...}, "emotion":{...}}}
```
state 의미: not_loaded=파일 있으나 lazy 로딩 전, error=파일 없음/로딩 실패(`error` 에 사유). 이 호출은 모델을 **로드하지 않는다**.

### POST /api/classify
요청: multipart `file`, 선택 `top_k` (int 1~10, 기본 5)
```
200 {"image":{"width":640,"height":480},
 "predictions":[{"label":"tabby cat","label_ko":"얼룩 고양이","score":0.8312}, ...],  // score 내림차순, label_ko 는 없으면 null
 "elapsed_ms":42}
```

### POST /api/detect
요청: multipart `file`, 선택 `conf` (float 0.05~0.95, 기본 0.4), `max_det` (int 1~100, 기본 50)
```
200 {"image":{"width":640,"height":480},
 "detections":[{"label":"person","label_ko":"사람","class_id":0,"score":0.91,"bbox":[12.0,30.5,200.0,410.2]}, ...],
 "counts":{"person":3,"car":2},          // label(영문) 기준
 "elapsed_ms":88}
```

### POST /api/pose
요청: multipart `file`, 선택 `conf` (float 기본 0.3)
```
200 {"image":{"width":640,"height":480},
 "keypoint_names":["nose","left_eye","right_eye","left_ear","right_ear","left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist","right_wrist","left_hip","right_hip","left_knee","right_knee","left_ankle","right_ankle"],   // COCO 17, 고정 순서
 "edges":[[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]],
 "people":[{"score":0.88,"bbox":[x1,y1,x2,y2]|null,
            "keypoints":[{"x":310.5,"y":120.2,"score":0.93}, ... 17개]}],   // 미검출 점은 score 0
 "elapsed_ms":120}
```
모델이 다른 키포인트 체계를 쓰면 서비스가 COCO17 로 변환해서 반환한다(프론트는 COCO17 만 안다). 사람 0명이면 `people:[]` (200).

### POST /api/face/detect
요청: multipart `file`, 선택 `conf` (기본 0.5)
```
200 {"image":{"width":640,"height":480},
 "faces":[{"score":0.99,"bbox":[x1,y1,x2,y2],
           "landmarks":[[x,y],[x,y],[x,y],[x,y],[x,y]]}],   // 순서: 왼눈, 오른눈, 코, 왼입꼬리, 오른입꼬리 (이미지 기준 좌→우), 없으면 null
 "elapsed_ms":30}
```
얼굴 0개여도 200 + `faces:[]` (detect 는 에러 아님).

### POST /api/face/compare
요청: multipart 두 파일 `file_a`, `file_b` (둘 다 필수), 선택 `threshold` (float, 코사인 유사도 기준값, 기본 서비스 상수)
```
200 {"a":{"image":{"width":..,"height":..},"face":{"score":0.99,"bbox":[..],"landmarks":[..]|null},"num_faces":1},
     "b":{...same...},
     "cosine_similarity":0.62,           // -1..1 원값
     "similarity_percent":78.4,          // 0..100, 서비스가 코사인을 UX용으로 매핑(단조증가, 같은 사람≈85+ 목표). 매핑식은 서비스 docstring + wiki 에 기록
 "same_person":false,                    // cosine >= threshold
 "threshold":0.36,
 "elapsed_ms":150}
```
각 이미지에서 얼굴이 여러 개면 **면적이 가장 큰 얼굴**을 사용(`num_faces` 로 알림). 얼굴 없으면 422 NO_FACE.

### POST /api/emotion
요청: JSON `Content-Type: application/json` `{"text":"오늘 너무 행복해!"}` (1~500자, 공백 trim)
```
200 {"text":"오늘 너무 행복해!",
 "label":"기쁨",                       // 한국어 라벨 (모델 라벨이 영문이면 서비스가 매핑)
 "score":0.9132,
 "scores":[{"label":"기쁨","score":0.9132},{"label":"슬픔","score":0.02}, ...],  // 전체, 내림차순, 합≈1
 "sentiment":0.82,                      // -1(부정)..1(긍정), 서비스 계산(라벨별 극성 가중합). 모델이 2클래스(긍/부정)뿐이면 score 기반.
 "elapsed_ms":25}
```

## 8. 병렬 작업 분담 (파일 소유)
| 담당 | 파일 |
|---|---|
| FE-공통 | `templates/base.html`, `templates/index.html`, `static/css/app.css`(공통 구간), `static/js/common.js`, 샘플 이미지 |
| FE-classify/detect | `templates/{classify,detect}.html`, `static/js/{classify,detect}.js` |
| FE-pose/face | `templates/{pose,face}.html`, `static/js/{pose,face}.js` |
| FE-emotion | `templates/emotion.html`, `static/js/emotion.js` |
| BE | `app/main.py`(페이지 라우트 + 에러 핸들러), `app/routers/*`, `app/services/*`, `app/schemas.py`(pydantic 응답 모델 = 본 계약) |
- 공통 의존: FE 는 BE 없이 개발하도록 `static/js/mock/` 에 계약 예시 JSON 을 두는 대신, 각 js 상단 주석의 예시 응답으로 로컬 스텁 테스트. 
- 완료 정의: 각 페이지에서 샘플 버튼 → 결과 표시 → 에러 토스트(모델 없음 503 포함)까지 동작, 모바일 폭(375px)에서 깨지지 않음.
