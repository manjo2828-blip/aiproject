# aiproject

| 폴더 | 내용 |
|---|---|
| `game/` | Phaser 기반 게임 |
| `agent-dev/` | 에이전트/RAG 개발 |
| `aiprj/` | AI 놀이터 (FastAPI) + 모델 벤치마크 |

## 용량 때문에 저장소에서 제외한 것 (원본 PC에만 존재)
GitHub는 파일당 100MB 제한이 있어 아래는 커밋하지 않았습니다. 모두 재생성 가능합니다.

- `.venv/`, `node_modules/`: `pip install -r requirements.txt` / `npm install`
- `aiprj/models/*` (약 190MB): `python scripts/download_models.py`
- `aiprj/bench/weights/` (약 1.7GB, ONNX 가중치), `aiprj/bench/finetune/cache/`, `aiprj/bench/finetune/train/pretrained/`: 벤치/학습 스크립트로 다시 내려받기
