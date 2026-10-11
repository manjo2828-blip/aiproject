# AI Playground (aiprj)

경량 비전/NLP 모델 5종을 FastAPI + Jinja2 로 묶은 재미있는 웹사이트.
모델: 이미지분류 / 객체인식 / Pose estimation / 얼굴인식 / 한국어 감정분류. **CPU 전용, 가벼운 모델만.**

## 하네스 규칙 (항상 지킬 것)
1. **HISTORY.md**: 모든 작업 단계가 끝날 때마다 `## YYYY-MM-DD HH:MM — 제목` 항목을 맨 아래에 추가 (누가/무엇을/결과).
2. **STATS.md**: 최신 상태 대시보드. 단계마다 덮어써서 갱신 (진행률, 모델별 상태, 테스트 결과, 서브에이전트 사용 현황).
3. **wiki/** (llm-wiki): 리서치 결과·결정사항은 `wiki/` 에 구조화해서 저장. `wiki/index.md` 에 항상 링크 등록. 규칙은 `wiki/README.md`.
4. 새 사실을 알게 되면 대화에 남기지 말고 wiki 에 기록.

## 모델 라우팅 (비용 절감)
| 역할 | 모델 | 에이전트 |
|---|---|---|
| 메인 오케스트레이터 | sonnet 5.5 | (메인) |
| 일반 개발 / 검색 / 리서치 | haiku 5.5 또는 sonnet 5.5 | `dev-worker`(sonnet), `researcher`(haiku) |
| 리뷰 / 검증 / 중요한 창의 결정 | opus 5.5 또는 fable 5.1 | `reviewer`(opus), `architect`(fable) |

Agent 도구 호출 시 `model` 파라미터로 명시: haiku / sonnet / opus / fable.

## 병렬 워크플로우
- Phase 0 하네스 → Phase 1 (병렬) 리서치 5개 + 가상환경 설치 → Phase 2 (병렬) 모델 서비스·라우터 5개 + 프론트엔드 → Phase 3 통합 → Phase 4 (병렬) 리뷰(opus) + 브라우저 E2E 테스트 → Phase 5 수정/마무리.
- 서로 다른 파일을 소유하는 작업만 병렬화. 에이전트마다 담당 파일 경로를 명시.

## 프로젝트 구조
```
app/main.py            FastAPI 앱, 라우터 등록, Jinja2
app/routers/<model>.py 모델별 API  (/api/<model>/...)
app/services/<model>.py 모델 로딩/추론 (lazy load, 싱글톤)
app/templates/         Jinja2 페이지
app/static/            css/js
models/                다운로드한 모델 가중치 (git 제외)
tests/  scripts/  wiki/
```
- 가상환경: `.venv` (Python 3.12). 실행: `.venv\Scripts\python -m uvicorn app.main:app --port 8000`
