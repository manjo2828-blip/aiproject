from sentence_transformers import SentenceTransformer

MODEL_NAME = "intfloat/multilingual-e5-small"  # 약 470MB, 다국어(한국어 포함) 경량 모델
COLLECTION = "rabbit_turtle"
DB_PATH = "./chroma_db"

_model = None


def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed(texts, prefix):
    # e5 모델은 문서에 "passage: ", 질의에 "query: " 접두어를 붙이는 것이 규칙
    return get_model().encode([prefix + t for t in texts], normalize_embeddings=True).tolist()
