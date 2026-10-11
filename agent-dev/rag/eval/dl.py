from sentence_transformers import SentenceTransformer
for m in ["BAAI/bge-m3", "jhgan/ko-sroberta-multitask"]:
    try:
        SentenceTransformer(m); print("OK", m)
    except Exception as e:
        print("FAIL", m, e)
