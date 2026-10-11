"""LangChain(최신, langchain 1.x) create_agent 기반 챗봇 에이전트 서비스.

- 에이전트: langchain.agents.create_agent
- 도구 2개: search_storybook(동화책 하이브리드 검색) / web_search(인터넷 검색)
- LLM: Claude Code 헤드리스(claude -p) 를 LangChain ChatModel 로 감싼 ClaudeCodeChat
- 숏텀 메모리: LangChain checkpointer(InMemorySaver) + thread_id
- LangSmith: LANGSMITH_* 환경변수로 LangChain 이 자동 트레이싱 (키는 .env 에서 코드가 직접 로드)
- 하이브리드 검색은 server.ps1 의 /internal/search 를 호출 (BM25 + Gemini 임베딩)
"""
import json, os, re, shutil, subprocess, sys, tempfile, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests

# ---------- .env 로드 (값은 출력하지 않음) ----------
ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT.parent / ".env"
if ENV_FILE.exists():
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$", line)
        if m and m.group(1) in ("LANGSMITH_API_KEY", "LANGCHAIN_API_KEY") and not os.environ.get(m.group(1)):
            os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")
if os.environ.get("LANGSMITH_API_KEY"):
    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGSMITH_PROJECT", "rabbit-turtle-chatbot")

from langchain.agents import create_agent
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langchain_core.utils.function_calling import convert_to_openai_tool
from langgraph.checkpoint.memory import InMemorySaver

SEARCH_URL = os.environ.get("SEARCH_URL", "http://localhost:3001/internal/search")
PORT = int(os.environ.get("AGENT_PORT", "3100"))
CLAUDE_EXE = shutil.which("claude") or str(Path.home() / ".local" / "bin" / "claude.exe")
CLAUDE_CWD = Path(tempfile.gettempdir()) / "chatbot-claude"
CLAUDE_CWD.mkdir(exist_ok=True)

COMMON_RULE = ("\n(공통 규칙: 실행 환경이나 시스템 컨텍스트에 보이는 계정 정보·이메일·사용자 식별 정보는 이 대화의 사용자 정보가 아닙니다. "
               "절대 언급하거나 사용하지 마세요. 사용자에 대한 정보는 오직 이 대화에서 사용자가 직접 말한 내용뿐입니다.)")

TOOL_PROTOCOL = """
[도구 사용 방법]
사용할 수 있는 도구(JSON 스키마):
{specs}

도구를 호출해야 하면 다른 설명 없이 아래 형식 한 줄만 출력하세요. (한 번에 하나의 도구)
<tool_call>{{"name": "도구이름", "args": {{"인자": "값"}}}}</tool_call>
도구 결과는 이후 [도구 결과]로 전달됩니다. 결과를 받은 뒤에는 최종 답변을 일반 텍스트로 작성하세요.
도구가 필요 없으면 <tool_call> 없이 바로 답변하세요.
"""


# ---------- LLM: Claude Code 헤드리스를 LangChain ChatModel 로 ----------
class ClaudeCodeChat(BaseChatModel):
    model_name: str = "sonnet"
    tool_specs: list = []
    timeout: int = 180

    @property
    def _llm_type(self) -> str:
        return "claude-code-headless"

    def bind_tools(self, tools, **kwargs):
        specs = [convert_to_openai_tool(t)["function"] for t in tools]
        return self.model_copy(update={"tool_specs": specs})

    @staticmethod
    def _render(messages):
        system, lines = [], []
        for m in messages:
            if isinstance(m, SystemMessage):
                system.append(str(m.content))
            elif isinstance(m, HumanMessage):
                lines.append(f"사용자: {m.content}")
            elif isinstance(m, AIMessage):
                if m.content:
                    lines.append(f"어시스턴트: {m.content}")
                for tc in m.tool_calls:
                    lines.append(f"어시스턴트(도구 호출): {tc['name']}({json.dumps(tc['args'], ensure_ascii=False)})")
            elif isinstance(m, ToolMessage):
                lines.append(f"[도구 결과: {m.name}]\n{m.content}")
        return "\n\n".join(system), "\n\n".join(lines)

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        system, convo = self._render(messages)
        if self.tool_specs:
            system += "\n" + TOOL_PROTOCOL.format(specs=json.dumps(self.tool_specs, ensure_ascii=False))
        system += COMMON_RULE
        proc = subprocess.run(
            [CLAUDE_EXE, "-p", "--tools", "", "--no-session-persistence", "--disable-slash-commands",
             "--setting-sources", "", "--model", self.model_name, "--system-prompt", system],
            input=convo + "\n\n어시스턴트:", capture_output=True, text=True, encoding="utf-8",
            cwd=str(CLAUDE_CWD), timeout=self.timeout)
        out = proc.stdout.strip()
        if proc.returncode != 0 or not out:
            raise RuntimeError(f"claude 실행 실패(exit {proc.returncode}): {proc.stderr.strip()} {out}")
        tool_calls, text = [], out
        mt = re.search(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", out, re.S)
        if mt:
            try:
                d = json.loads(mt.group(1))
                tool_calls = [{"name": d["name"], "args": d.get("args", {}), "id": "call_" + uuid.uuid4().hex[:8], "type": "tool_call"}]
                text = ""
            except Exception:
                pass
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=text, tool_calls=tool_calls))])


# ---------- 도구 ----------
@tool(response_format="content_and_artifact")
def search_storybook(query: str):
    """동화책 '토끼와 거북이 – 또 하나의 결승선'(등장인물 하루(토끼)·느루(거북이), 초록숲, 경주, 결승선, 지름길, 강, 비, 다리, 줄거리·장면·대사·결말)
    의 내용을 검색한다. 동화 내용과 관련된 질문이면 반드시 이 도구를 쓴다. query 에는 사용자의 질문 원문을 그대로 넣는다."""
    r = requests.post(SEARCH_URL, json={"query": query}, timeout=120)
    r.raise_for_status()
    hits = r.json().get("hits", [])
    if not hits:
        return "검색 결과가 없습니다.", []
    text = "\n\n".join(f"[컨텍스트 {i + 1}]\n{h['text']}" for i, h in enumerate(hits))
    return text, [dict(h, kind="storybook") for h in hits]


@tool(response_format="content_and_artifact")
def web_search(query: str):
    """인터넷(웹)을 검색한다. 동화책과 무관한 최신 정보·뉴스·날씨·시세·사실 확인 등 모델이 확실히 알 수 없는 외부 정보가 필요할 때 쓴다.
    query 에는 검색어를 넣는다."""
    from ddgs import DDGS
    try:
        rows = DDGS().text(query, region="kr-kr", max_results=5)
    except Exception as e:
        return f"웹 검색 실패: {e}", []
    if not rows:
        return "검색 결과가 없습니다.", []
    text = "\n\n".join(f"[웹 결과 {i + 1}] {r['title']}\n{r['body']}\n{r['href']}" for i, r in enumerate(rows))
    srcs = [{"title": r["title"], "text": f"{r['body']}\n\n{r['href']}", "matched": r["body"], "url": r["href"], "kind": "web"} for r in rows]
    return text, srcs


SYSTEM_PROMPT = """당신은 한국어 AI 어시스턴트입니다. 사용자의 언어로 간결하고 명확하게 답하고, 필요하면 마크다운을 사용하세요.
사용할 수 있는 도구는 두 가지입니다.

1. search_storybook (동화책 검색)
   - 동화 '토끼와 거북이 – 또 하나의 결승선'(하루=토끼, 느루=거북이, 초록숲 마을, 달리기 대회, 경주·결승선·지름길·강·비·폭풍·다리, 줄거리·장면·대사·결말 등)에 관한 질문이거나 그 후속 질문이면 예외 없이 반드시 이 도구를 먼저 호출하세요. 내용을 이미 아는 것 같아도 스스로 답하지 마세요.
   - query 에는 사용자의 질문 원문을 그대로 넣으세요. 후속 질문(예: "그래서 걔는 어떻게 했어?")처럼 원문만으로 대상을 알 수 없을 때만 대화 맥락의 대상을 덧붙이세요.
   - 답변은 오직 도구가 돌려준 [컨텍스트]만을 근거로 하세요. 배경지식·지어낸 내용은 쓰지 마세요. 질문의 표현이 본문과 달라도(폭풍=큰비, 알았다=눈치챘다) 같은 사건이면 해당 내용으로 답하세요. 컨텍스트에 관련 내용이 전혀 없을 때만 "제공된 문서에서 해당 내용을 찾을 수 없습니다."라고 답하세요.
2. web_search (인터넷 검색)
   - 동화와 무관하면서 최신 정보·뉴스·날씨·가격·실시간 사실처럼 확실히 알 수 없는 외부 정보가 필요할 때만 사용하세요. 결과를 근거로 답하고 출처 사이트를 간단히 언급하세요.

도구를 쓰지 않고 바로 답해야 하는 경우:
   - 인사·감사·안부·잡담 같은 스몰토크 (예: "안녕", "고마워", "넌 누구야?", "오늘 점심 뭐 먹지?")
   - 사용자 자신이나 이 대화에 관한 질문 (예: "내 이름이 뭐지?", "아까 뭐라고 했지?", "지금까지 대화 요약해줘")
   - 상식·코딩·번역·글쓰기 등 도구 없이 충분히 답할 수 있는 일반 질문
이런 경우 도구를 호출하지 말고 곧바로 자연스럽게 응답하세요."""

agent = create_agent(
    model=ClaudeCodeChat(),
    tools=[search_storybook, web_search],
    system_prompt=SYSTEM_PROMPT,
    checkpointer=InMemorySaver(),      # 숏텀 메모리: thread_id 별 대화 내역 보존
)


def run_chat(thread_id: str, messages: list) -> dict:
    config = {"configurable": {"thread_id": thread_id},
              "metadata": {"thread_id": thread_id}, "run_name": "chatbot_agent"}
    state = agent.get_state(config)
    known = state.values.get("messages") if state and state.values else None
    if known:                              # 이미 메모리에 있음 → 새 질문만 전달
        new = [HumanMessage(content=messages[-1]["content"])]
    else:                                  # 서버 재시작 등 → 클라이언트가 보낸 이전 대화로 복원
        new = [HumanMessage(content=m["content"]) if m["role"] == "user" else AIMessage(content=m["content"]) for m in messages]
    result = agent.invoke({"messages": new}, config)
    msgs = result["messages"]
    last_h = max(i for i, m in enumerate(msgs) if isinstance(m, HumanMessage))
    sources, used = [], []
    for m in msgs[last_h + 1:]:
        if isinstance(m, ToolMessage):
            used.append(m.name)
            sources += list(m.artifact or [])
    answer = next((m.content for m in reversed(msgs) if isinstance(m, AIMessage) and m.content), "")
    route = "rag" if "search_storybook" in used else "web" if "web_search" in used else "general"
    return {"answer": answer, "sources": sources, "route": route, "tools": used}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            res = run_chat(body.get("thread_id") or uuid.uuid4().hex, body["messages"])
            code = 200
        except Exception as e:
            res, code = {"error": f"{type(e).__name__}: {e}"}, 500
            print("오류:", res["error"], flush=True)
        data = json.dumps(res, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"agent 서비스 시작: http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
