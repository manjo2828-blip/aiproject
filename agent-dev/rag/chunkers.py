import re
from llm_data import FIXED150_TITLES, LLM_CHUNKS

LINE = "─"
HEAD_RE = re.compile(r"^(제\d+장\..*|맺음말.*)$", re.M)


def is_noise(line):
    s = line.strip()
    return bool(s) and (set(s) <= {LINE} or s.startswith("– 끝") or s.startswith("토끼와 거북이 –"))


def clean(s):
    lines = [l for l in s.split("\n") if not is_noise(l)]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# ───────── 청킹 함수: [{"text":..., ...}] 반환 ─────────
def fixed(text, size=300, overlap=50):
    step = size - overlap
    return [{"text": text[i:i + size]} for i in range(0, len(text), step) if text[i:i + size].strip()]


def recursive(text, size=300, seps=("\n\n", "\n", ". ", " ", "")):
    """큰 구분자(문단) → 작은 구분자(줄, 문장, 단어, 글자) 순으로 size 이하가 될 때까지 재귀 분할 후 size까지 다시 병합."""
    def split(t, level):
        if len(t) <= size:
            return [t]
        sep = seps[level]
        parts = list(t) if sep == "" else [p + sep for p in t.split(sep)]
        out = []
        for p in parts:
            out += [p] if len(p) <= size else split(p, level + 1)
        return out

    chunks, cur = [], ""
    for piece in split(text, 0):
        if len(cur) + len(piece) <= size:
            cur += piece
        else:
            chunks.append(cur)
            cur = piece
    chunks.append(cur)
    return [{"text": c.strip()} for c in chunks if c.strip() and not set(c.strip()) <= {LINE}]


def chapters(text):
    """장 단위 분할: [{"title","body","full"}]"""
    heads = list(HEAD_RE.finditer(text))
    out = []
    for i, m in enumerate(heads):
        body = clean(text[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(text)])
        out.append({"title": m.group().strip(), "body": body, "full": f"[{m.group().strip()}]\n{body}"})
    return out


def structured(text, max_len=400):
    """장 제목 → 문단 구조를 따라 자르고 각 청크 앞에 장 제목을 붙임. 문단은 장 안에서만 병합."""
    chunks = []
    for ch in chapters(text):
        cur = ""
        for p in [p.strip() for p in ch["body"].split("\n\n") if p.strip()]:
            if cur and len(cur) + len(p) > max_len:
                chunks.append({"text": f"[{ch['title']}]\n{cur}", "chapter": ch["title"]})
                cur = p
            else:
                cur = f"{cur}\n{p}".strip()
        if cur:
            chunks.append({"text": f"[{ch['title']}]\n{cur}", "chapter": ch["title"]})
    return chunks


def llm_semantic(text):
    """Claude가 정한 (제목, 시작 구절) 경계로 원문을 그대로 잘라냄. 장 정보를 함께 부여."""
    starts, pos = [], 0
    for title, phrase in LLM_CHUNKS:
        idx = text.find(phrase, pos)
        assert idx >= 0, f"시작 구절을 찾을 수 없음: {phrase}"
        starts.append(idx)
        pos = idx + 1
    heads = [(m.start(), m.group().strip()) for m in HEAD_RE.finditer(text)]
    out = []
    for i, (title, _) in enumerate(LLM_CHUNKS):
        end = starts[i + 1] if i + 1 < len(starts) else len(text)
        chapter = [h for p, h in heads if p < starts[i]][-1]
        body = HEAD_RE.sub("", text[starts[i]:end])  # 다음 장 제목 줄이 꼬리에 딸려오면 제거
        out.append({"text": clean(body), "title": title, "chapter": chapter})
    return out


# ───────── 적재용 엔트리 빌더 ─────────
# 엔트리 = 벡터로 임베딩되는 단위. 메타데이터로 "무엇을 반환할지"를 지정한다.
#   kind: "본문" | "제목"   return_id/return_text: 검색 결과로 돌려줄 원본(청크 또는 부모 챕터)
def build_plain(chunks, name):
    return [{"id": f"{name}-{i}", "doc": c["text"],
             "meta": {"kind": "본문", "index": i, "return_id": f"{name}-{i}", "return_text": c["text"], "parent": False}}
            for i, c in enumerate(chunks)]


def build_titled(chunks, titles, name):
    """청크 본문 + 청크 제목을 각각 임베딩. 제목이 매칭되면 원본 청크를 반환."""
    assert len(chunks) == len(titles), (len(chunks), len(titles))
    out = build_plain(chunks, name)
    for i, (c, t) in enumerate(zip(chunks, titles)):
        out.append({"id": f"{name}-{i}-title", "doc": t,
                    "meta": {"kind": "제목", "index": i, "return_id": f"{name}-{i}", "return_text": c["text"], "parent": False}})
    return out


def build_parent_child(children, name, titles=None):
    """child(작은 청크)를 임베딩하고, 매칭되면 메타데이터의 부모(챕터) 전문을 반환."""
    out = []
    for i, c in enumerate(children):
        base = {"index": i, "return_id": c["parent_id"], "return_text": c["parent_text"], "chapter": c["chapter"], "parent": True}
        out.append({"id": f"{name}-{i}", "doc": c["text"], "meta": {"kind": "본문", **base}})
        if titles:
            out.append({"id": f"{name}-{i}-title", "doc": titles[i], "meta": {"kind": "제목", **base}})
    return out


def _fixed150(t):
    return fixed(t, 150, 25)


def m_fixed150(t):
    return build_plain(_fixed150(t), "fixed150")


def m_recursive(t):
    return build_plain(recursive(t, 300), "recursive")


def m_structured(t):
    return build_plain(structured(t), "structured")


def m_fixed150_title(t):
    return build_titled(_fixed150(t), FIXED150_TITLES, "fixed150_title")


def m_structured_pc(t):
    by_title = {c["title"]: c for c in chapters(t)}
    children = []
    for s in structured(t):
        ch = by_title[s["chapter"]]
        body = s["text"].split("\n", 1)[1]  # 첫 줄 [장 제목] 제외
        for c in _fixed150(body):
            children.append({"text": c["text"], "chapter": ch["title"], "parent_id": f"ch-{ch['title']}", "parent_text": ch["full"]})
    return build_parent_child(children, "structured_pc")


def m_llm_pc(t):
    by_title = {c["title"]: c for c in chapters(t)}
    chunks = llm_semantic(t)
    children = [{"text": c["text"], "chapter": c["chapter"], "parent_id": f"ch-{c['chapter']}",
                 "parent_text": by_title[c["chapter"]]["full"]} for c in chunks]
    return build_parent_child(children, "llm_pc", titles=[c["title"] for c in chunks])


METHODS = {
    "fixed150": ("고정 길이 150자", "150자 + 25자 겹침. 기준선.", m_fixed150),
    "recursive": ("Recursive", "문단→줄→문장→단어 순으로 300자 이하가 되게 재귀 분할.", m_recursive),
    "structured": ("Structured", "장 제목/문단 구조를 따라 분할, 장 제목을 청크에 포함.", m_structured),
    "fixed150_title": ("고정 150자 + 제목", "청크마다 Claude가 제목을 붙여 제목도 임베딩. 제목이 매칭되면 원본 청크를 반환.", m_fixed150_title),
    "structured_pc": ("Structured 150자 Parent-Child", "Structured를 150자로 재청킹(child) 후 임베딩, 매칭되면 부모 챕터 전문을 반환.", m_structured_pc),
    "llm_pc": ("LLM 의미 청킹 + 제목 + Parent-Child", "Claude가 의미 단위로 청킹, 청크 본문·제목을 임베딩, 매칭되면 부모 챕터 전문을 반환.", m_llm_pc),
}
