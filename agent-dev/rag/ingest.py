import chromadb
from chunkers import METHODS
from common import DB_PATH, embed

SRC = "../토끼와_거북이.txt"
text = open(SRC, encoding="utf-8").read()
client = chromadb.PersistentClient(path=DB_PATH)

for c in client.list_collections():  # 이전 방식(고정 300, semantic 등) 포함 전부 정리 후 재적재
    client.delete_collection(c.name if hasattr(c, "name") else c)

for name, (label, desc, fn) in METHODS.items():
    entries = fn(text)
    col = client.create_collection(f"rt_{name}", metadata={"hnsw:space": "cosine"})
    docs = [e["doc"] for e in entries]
    col.add(ids=[e["id"] for e in entries], documents=docs, embeddings=embed(docs, "passage: "),
            metadatas=[e["meta"] for e in entries])
    kinds = {k: sum(1 for e in entries if e["meta"]["kind"] == k) for k in ("본문", "제목")}
    print(f"{label:<28} 임베딩 {len(entries):>3}개 (본문 {kinds['본문']}, 제목 {kinds['제목']}), 반환단위 {len({e['meta']['return_id'] for e in entries})}개")
