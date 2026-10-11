import json, sys
sys.path.insert(0, ".")
from chunkers import m_fixed150, m_recursive, m_structured_pc
text = open("../토끼와_거북이.txt", encoding="utf-8").read()
out = {}
for name, fn in [("fixed150", m_fixed150), ("recursive", m_recursive), ("structured_pc", m_structured_pc)]:
    out[name] = [{"id": e["id"], "text": e["doc"], "return_id": e["meta"]["return_id"]} for e in fn(text)]
    print(name, len(out[name]), sum(len(e["text"]) for e in out[name]) // len(out[name]))
json.dump(out, open("eval/chunks.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
