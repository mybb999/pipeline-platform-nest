> ⚠️ **存档文件**:这是 M1 计划的早期版本,已被同目录的 `2026-09-08-agent-m1-plan.md` 取代(那份顶部带进度板、且持续更新)。本文件仅作历史参考,不要再按它执行。

# M1「懂我的助手」实施计划(AImyhome-agent 独立项目)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建独立 Python 项目 `AImyhome-agent`(LangGraph + pgvector),实现「懂熊仔的助手」:访客在博客聊天问刘俊雄个人资料问题,Agent 检索 profile.md 知识库并流式作答、附来源;博客仅做薄壳转发。

**Architecture:** 博客(Nuxt/Vercel)的 `agent.post.ts` 改为纯转发,把请求原样代理到独立 Agent 服务(FastAPI + LangGraph 状态图,跑在腾讯云 4核4G)。Agent 状态图含 3 节点(route → 条件边 → retrieve / generate),检索走 pgvector 余弦相似度,SSE 输出保持 OpenAI-compatible 格式使前端解析零改动。检索与 embedding 均抽象为 Protocol 接口,为 M2(MCP 复用)与 M4(文档库)留扩展口。

**Tech Stack:** Python 3.12 + uv · FastAPI + Uvicorn · LangGraph 1.x + langchain-openai(豆包/智谱,OpenAI-compatible)· pgvector 16(Docker,本机自托管)· psycopg3 · pytest + pytest-asyncio

**规格来源:** `docs/2026-09-08-ai-agent-upgrade-design.md`(定稿)。本计划只覆盖 M1(Task 1.1–1.7);M2/M3/M4 后续单独成计划。

---

## Global Constraints

- **用户工作偏好(规格 §8):** 写代码前先讨论方案并确认;每任务完成后更新开发文档(devlog)并随代码提交;中文沟通;一次一件事;边做边学,解释原因;`pipeline-platform-nest` 冻结项目**只读参考**,不可修改。
- **博客改动面(规格决策 #4):** 仅 `server/api/agent.post.ts`(改转发)与 `components/agent/ChatPanel.vue`(来源展示)+ `types/chat.ts`(类型,随 1.6 顺带);博客其他文件一律不动。
- **新项目路径:** `f:\AIproject\AImyhome-agent`(与 AImyhome 平级),独立 git 仓库,博客一行 Python 不加。
- **LLM(规格决策 #12,复用现有):** 豆包 `doubao-seed-2-0-lite-260215`(端点 `https://ark.cn-beijing.volces.com/api/v3`)、智谱 `glm-4.7-flash`(端点 `https://open.bigmodel.cn/api/paas/v4`),均为 OpenAI-compatible。Agent 服务的 provider id 必须与博客前端一致:`doubao`、`glm`(前端 model 参数原样透传)。请求统一带 `thinking: {type: "disabled"}`(否则智谱默认先发 reasoning 内容,前端空白)。
- **Embedding:** 接口抽象(config 驱动),供应商在 Task 1.3 实测确定(优先豆包,失败则智谱 embedding-3);维度写 `EMBEDDING_DIM` 环境变量。
- **pgvector(规格决策 #6):** 本机 Docker 自托管(`pgvector/pgvector:pg16`),不用 Neon/Milvus;Task 1.3 与用户确认实例位置(推荐:服务器 Docker,dev 机直连或 SSH 隧道)。
- **密钥:** 一律放 `.env`(已 gitignore),**绝不提交、绝不写死在代码**;取 key 用 `grep '^XXX=' .env | cut -d= -f2` 方式,命令文本不落明文。
- **Windows Git Bash 踩坑:** `curl -d` 发中文 JSON 会被编码成 GBK 导致 400;一律 `printf '...' > /tmp/req.json && curl --data-binary @/tmp/req.json`。
- **免费额度:** 智谱 GLM-4.7-flash 永久免费但限速(~5-10 次/分);豆包每日 200 万 tokens。embedding 批量入库若走智谱需在批间 sleep。
- **Nuxt 构建锁:** `npm run build` 与 dev 服务器(端口 3000)互斥,构建前先停 dev。
- **M1 无状态:** 前端每次携带全量 messages,Agent 服务不存会话(checkpointer/session_id 是 M3 的事);`thread_id` 在 M1 固定常量即可。
- **端口:** Agent 服务固定 `8000`(本机与服务器一致);pgvector `5432`。
- **所有命令在项目根目录执行**(`f:\AIproject\AImyhome-agent`,或博客任务在 `f:\AIproject\AImyhome`)。

---

## 前置准备(与 M1 并行,用户侧操作,不占计划任务)

| 项 | 说明 | 关联任务 |
|---|---|---|
| 下单腾讯云 4核4G3M | 轻量服务器,地域就近;系统 Ubuntu(与 pipeline 同,apt 生态) | 1.3、1.7 |
| 提交域名备案 | 阿里云→腾讯云接入,管局 1~2 周;期间用 IP:8000 直连 | 1.7 |
| 本地装 Python 3.12 + uv | 见 Task 1.2 Step 1(无 Python 基础预留 1~2 天热身) | 1.2 |
| 收集简历素材 | Task 1.1 填写用 | 1.1 |

---

## 跨任务接口契约(后续任务必须严格按此)

### SSE 事件格式(Task 1.5 生产,Task 1.6 消费)

```
data: {"choices":[{"delta":{"content":"你"},"index":0}]}    ← 逐 token,OpenAI 格式,前端解析零改动
data: {"choices":[{"delta":{"content":"好"},"index":0}]}
data: {"type":"sources","sources":[{"title":"项目经验","excerpt":"负责 Lucas Space 全栈开发…","score":0.93}]}
data: [DONE]
```

- `sources` 事件在 `[DONE]` 之前恰好一次(无来源时省略);`excerpt` 为内容前 120 字符。
- HTTP 语义:请求体 `{"messages":[{"role":"user"|"assistant","content":"..."}], "model":"doubao"|"glm"|省略}`;空 messages → 422;未知 model → 400;无可用 key → 500。

### 服务端类型(在 Agent 项目内定义,名称不可改)

```python
class SearchHit(BaseModel):   # app/services/vectorstore.py
    title: str    # profile.md 的 ## 小节标题,如「工作经历」
    content: str  # 片段全文
    score: float  # 余弦相似度(1 - distance)
```

### 依赖注入签名(测试靠这些签名注入 fake)

```python
def build_graph(*, chat_llm, router_llm, retriever: Retriever) -> CompiledGraph
def create_app(settings: Settings | None = None, agent_factory: Callable = build_agent) -> FastAPI
```

### 前端类型(Task 1.6,AImyhome 仓库)

```typescript
export interface ChatSource { title: string; excerpt: string; score: number }
// ChatMessage 增加可选字段 sources?: ChatSource[]
```

---

## 文件结构总览(AImyhome-agent,各文件单一职责)

```
AImyhome-agent/
├── pyproject.toml            # uv 管理;含 pytest asyncio_mode=auto
├── .env.example              # 环境变量模板(见 Task 1.2)
├── .env                      # 真实密钥(gitignore)
├── .gitignore
├── README.md                 # 面试作品门面:架构图 + 一句话主线
├── docker-compose.yml        # 仅 pgvector(Task 1.3)
├── data/
│   └── profile.md            # 知识源(Task 1.1,用户填写)
├── app/
│   ├── __init__.py
│   ├── config.py             # Settings(pydantic-settings,读 .env)
│   ├── main.py               # create_app + build_agent(装配)
│   ├── api/routes/
│   │   ├── __init__.py
│   │   ├── health.py         # GET /health
│   │   └── chat.py           # POST /api/agent/chat(SSE)
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── state.py          # AgentState TypedDict(单独文件,M3 checkpointer 会扩展它)
│   │   └── graph.py          # build_graph:节点/边/条件边/prompts
│   ├── tools/
│   │   ├── __init__.py
│   │   └── search_profile.py # ★ 工具层:make_search_profile 工厂 → search_profile(检索简历;M2 原样注册成 MCP 工具)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm.py            # provider 表 + get_chat_llm/get_router_llm
│   │   ├── embeddings.py     # Embedder Protocol + OpenAICompatibleEmbedder + get_embedder
│   │   ├── chunker.py        # split_markdown:按 ## 切片(纯函数)
│   │   └── vectorstore.py    # Retriever Protocol + PgvectorStore + get_retriever
├── scripts/
│   ├── init_db.py            # 建扩展+建表(幂等)
│   ├── ingest_profile.py     # 切片→embedding→入库(全量重建)
│   └── ask.py                # 手动冒烟:命令行流式提问
├── devlog/                   # 每任务更新
└── tests/
    ├── __init__.py
    ├── fakes.py              # ScriptedChatModel / FakeEmbedder / RecordingRetriever
    ├── test_health.py
    ├── test_chunker.py
    ├── test_vectorstore.py   # 集成测试(pgvector 不可达则 skip)
    ├── test_graph.py
    └── test_api_chat.py
```

依赖注入贯穿全程:`build_graph` 接收 chat_llm/router_llm/retriever,`create_app` 接收 agent_factory —— 单测全用 fake,真实 LLM/DB 只在手动冒烟和集成测试里出现,测试不花一分 API 钱。

---

## Task 1.1:profile.md 知识源(用户填写)

**Files:**
- Create: `f:\AIproject\AImyhome-agent\data\profile.md`
- Create: `f:\AIproject\AImyhome-agent\.gitignore`
- Create: `f:\AIproject\AImyhome-agent\devlog\2026-09-08.md`(初始日志)

**Interfaces:**
- Produces: 知识源文件;其 `## ` 小节标题即检索结果里的 `title` 字段(Task 1.3 切片器依赖此格式)。

- [ ] **Step 1:创建项目目录 + git 初始化 + .gitignore**

```bash
mkdir -p /f/AIproject/AImyhome-agent/data /f/AIproject/AImyhome-agent/devlog
cd /f/AIproject/AImyhome-agent && git init -b master
```

.gitignore 内容(Write 工具创建):

```gitignore
.venv/
__pycache__/
*.pyc
.env
.pytest_cache/
```

- [ ] **Step 2:创建 profile.md 模板(骨架 + 填写指引)**

用 Write 创建 `data/profile.md`:

```markdown
# 熊仔个人资料(知识库)

> 本文档是 AI Agent 的知识来源。请用**事实性、结构化**的语言填写。
> 切片规则:每个 `## ` 小节会被切成一个检索单元,小节标题会作为来源展示的标题。
> 不要写:手机号、身份证号等敏感信息;不公开的内容不要写。

## 基本信息
- 姓名:刘俊雄(网名「熊仔」)
- 岗位:前端开发工程师(X 年经验)
- 邮箱:
- GitHub:https://github.com/mybb999
- 简书:https://www.jianshu.com/u/08fae46b1348

## 技术栈
- 前端:Vue 2/3、React、TypeScript、Tailwind CSS、可视化(…)
- 后端:Node.js(Nuxt server / NestJS)、…
- 其他:…

## 工作经历
### 公司名(20XX.XX – 20XX.XX · 职位)
- 一句话职责 + 2~3 条亮点(尽量量化)

## 项目经验
### 项目名
- 一句话定位 + 我的角色 + 技术栈 + 量化成果

## 开源与社区
- …

## 教育背景
- …

## 个人亮点
- 证书 / 奖项 / 其他想让访客知道的事实
```

- [ ] **Step 3:【用户操作】填写真实简历内容**

把模板中的占位内容替换为真实简历(可参考 `AImyhome/public/刘俊雄-前端开发工程师.pdf`)。**这是用户任务,执行者停下等用户完成。**

- [ ] **Step 4:验收(执行者检查)**

```bash
cd /f/AIproject/AImyhome-agent && grep -c '^## ' data/profile.md
```

Expected: ≥ 5 个 `## ` 小节,且无占位符残留(检查 `…`、`XX`、`公司名` 等),无手机号/身份证号。

- [ ] **Step 5:初始提交**

```bash
git add -A && git commit -m "docs: 初始化 profile 知识库与项目骨架"
```

并在 `devlog/2026-09-08.md` 记录:今日完成 1.1、待办 1.2(随本 commit 一起提交)。

---

## Task 1.2:Python 工程骨架(uv + FastAPI hello)

**Files:**
- Create: `app/__init__.py`、`app/config.py`、`app/main.py`、`app/api/__init__.py`、`app/api/routes/__init__.py`、`app/api/routes/health.py`、`app/services/__init__.py`、`app/agent/__init__.py`、`app/tools/__init__.py`、`tests/__init__.py`、`tests/test_health.py`、`.env.example`、`README.md`、`pyproject.toml`

**Interfaces:**
- Consumes: Task 1.1 的 git 仓库。
- Produces: `Settings`(config.py,字段清单见 .env.example)、`create_app(settings: Settings | None = None) -> FastAPI`(main.py)、`GET /health → {"status":"ok"}`。Task 1.3–1.5 在此基础上扩展,**字段名/函数签名后续任务不得改名**。

- [ ] **Step 1:安装 Python 3.12 + uv(Windows)**

```powershell
# PowerShell 执行 uv 官方安装器(一次装好 uv;Python 由 uv 托管)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
# 验证
uv --version
uv python install 3.12
```

> 无 Python 基础时先花 1~2 天热身(语法 + venv 概念),规格「准备线 4」。

- [ ] **Step 2:pyproject.toml(uv 项目定义)**

用 Write 创建(替换 Task 1.1 的空目录):

```toml
[project]
name = "aimyhome-agent"
version = "0.1.0"
description = "Lucas Space 博客 AI Agent 服务(LangGraph + pgvector + FastAPI)"
requires-python = ">=3.12"
dependencies = []

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

```bash
cd /f/AIproject/AImyhome-agent
uv python pin 3.12   # 生成 .python-version 并锁定解释器
uv add fastapi "uvicorn[standard]" pydantic-settings
uv add --dev pytest pytest-asyncio
```

> 注意:不要跑 `uv init`(会生成冲突的根 main.py);上面 Step 2 已用 Write 写入完整 pyproject.toml,`uv add` 会自动建 .venv 并装依赖。

- [ ] **Step 3:写失败测试 tests/test_health.py**

```python
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health_returns_ok():
    # _env_file=None:测试不读真实 .env,不依赖密钥
    app = create_app(Settings(_env_file=None))
    client = TestClient(app)

    resp = client.get("/health")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 4:运行确认失败**

Run: `uv run pytest -q`
Expected: FAIL(收集错误:`ModuleNotFoundError: No module named 'app.main'`)

- [ ] **Step 5:实现 config.py + main.py + health.py**

`app/config.py`:

```python
"""应用配置:全部来自 .env,测试时可传 Settings(_env_file=None) 绕过。"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── LLM 供应商(OpenAI-compatible,id 与博客前端一致:doubao / glm)──
    doubao_api_key: str = ""
    doubao_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    doubao_model: str = "doubao-seed-2-0-lite-260215"
    glm_api_key: str = ""
    glm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    glm_model: str = "glm-4.7-flash"

    # ── Embedding(Task 1.3 实测后填写)──
    embedding_provider: str = "doubao"  # doubao | glm
    doubao_embedding_model: str = ""
    glm_embedding_model: str = "embedding-3"
    embedding_dim: int = 2048

    # ── pgvector ──
    database_url: str = "postgresql://agent:agent_dev_2026@127.0.0.1:5432/agent"

    # ── 知识源 ──
    profile_md_path: str = "data/profile.md"
```

`app/main.py`:

```python
"""FastAPI 入口。启动:uv run uvicorn app.main:app --reload --port 8000"""
from fastapi import FastAPI

from app.api.routes import health
from app.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="AImyhome Agent")
    app.state.settings = settings or Settings()
    app.include_router(health.router)
    return app


app = create_app()
```

`app/api/routes/health.py`:

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

其余 `__init__.py` 均为空文件(Write 创建空内容即可)。

- [ ] **Step 6:运行确认通过**

Run: `uv run pytest -q`
Expected: PASS(`1 passed`)

- [ ] **Step 7:手动冒烟:服务能起、/health 能通**

```bash
uv run uvicorn app.main:app --port 8000 &
sleep 3 && curl -s http://127.0.0.1:8000/health
```

Expected: `{"status":"ok"}`;随后停掉进程(Ctrl+C / kill)。

- [ ] **Step 8:.env.example + README + 提交**

`.env.example`:

```bash
# ── LLM(OpenAI-compatible)──
DOUBAO_API_KEY=
# DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
# DOUBAO_MODEL=doubao-seed-2-0-lite-260215
GLM_API_KEY=
# GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# GLM_MODEL=glm-4.7-flash

# ── Embedding(Task 1.3 实测确认后填写)──
EMBEDDING_PROVIDER=doubao
DOUBAO_EMBEDDING_MODEL=
# GLM_EMBEDDING_MODEL=embedding-3
# EMBEDDING_DIM=2048

# ── pgvector ──
DATABASE_URL=postgresql://agent:agent_dev_2026@127.0.0.1:5432/agent
```

README.md 骨架(面试作品门面,留架构图 TODO 后续补):

```markdown
# AImyhome-agent

Lucas Space 博客的 AI Agent 服务:同一份「工具」注册成两个入口 ——
LangGraph 里是 Agent 工具,Claude Code 里是 MCP 工具。

- M1:懂我的助手(RAG:pgvector + LangGraph 状态图 + SSE)
- M2:MCP Server(计划中)
- 技术栈:Python 3.12 · FastAPI · LangGraph · pgvector · 豆包/智谱

## 本地开发
见 docs/superpowers/plans/(本计划文档)。
```

复制 `.env.example` 为 `.env` 并填入 DOUBAO_API_KEY / GLM_API_KEY(从 `AImyhome/.env` 复制;注意博客里智谱的 key 叫 `LLM_API_KEY`,填到 Agent 侧要改名为 `GLM_API_KEY`。若用户把 key 贴进对话,只写入 .env,不回显)。

```bash
git add -A && git commit -m "feat: FastAPI 骨架(uv + health 端点 + 测试)"
```

devlog 同日更新。

---

## Task 1.3:pgvector 知识库(建库 → 切片 → embedding 入库)

**Files:**
- Create: `app/services/chunker.py`、`app/services/embeddings.py`、`app/services/vectorstore.py`、`scripts/init_db.py`、`scripts/ingest_profile.py`、`docker-compose.yml`、`tests/test_chunker.py`、`tests/test_vectorstore.py`
- Modify: `tests/fakes.py`(新增 FakeEmbedder)
- Modify: `app/config.py`(无需改,字段已备好)

**Interfaces:**
- Consumes: `Settings`(Task 1.2)、`data/profile.md`(Task 1.1)。
- Produces(后续任务依赖,签名不可改):
  - `SearchHit(BaseModel)`: `title: str, content: str, score: float`(SSE 来源事件与前端 ChatSource 的数据源)
  - `Embedder` Protocol:`async embed_documents(texts) -> list[list[float]]`、`async embed_query(text) -> list[float]`
  - `Retriever` Protocol:`async search(query: str, top_k: int = 4) -> list[SearchHit]`
  - `PgvectorStore(dsn, embedder, dim)`: `init_schema()` / `reset()` / `insert_chunks(rows: list[ChunkRow])` / `search(...)`
  - `ChunkRow` dataclass: `source, section, content, embedding`
  - `split_markdown(text) -> list[Chunk]`;`Chunk` dataclass: `title, content`
  - `get_embedder(settings)` / `get_retriever(settings)`(装配函数,main.py 与脚本共用)
- **面试点:检索接口做抽象(Retriever Protocol),换库只换实现不换调用方(M4 文档库将实现同一接口)。**

- [ ] **Step 1:【决策检查点】确认 pgvector 实例位置(先和用户确认再动手)**

规格决策 #6 倾向服务器本机 Docker,但服务器若未到货,本地需兜底。向用户确认:

- **方案 A(推荐):服务器 Docker** —— 服务器上 `docker compose up -d db`(本任务附的 compose 文件),dev 机 `DATABASE_URL` 指向 `<服务器IP>:5432`(腾讯云防火墙只放行本机出口 IP;更安全可用 SSH 隧道:`ssh -L 5432:127.0.0.1:5432 root@<服务器IP>` 后连 `127.0.0.1:5432`)
- **方案 B(兜底):本机 Docker Desktop** —— 本机 Windows LTSC 2019 可能装不上 Docker Desktop;若方案 A 不可行且本机装不上,与用户商量改 Neon(规格已备选项)

选定后把对应 `DATABASE_URL` 写进 `.env`。

- [ ] **Step 2:docker-compose.yml(pgvector,本机与服务器通用)**

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    container_name: agent-pgvector
    restart: unless-stopped
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent_dev_2026
      POSTGRES_DB: agent
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

启动并验证:

```bash
docker compose up -d db
docker exec agent-pgvector psql -U agent -d agent -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT version();"
```

Expected: 无报错(输出含 pgvector 版本信息)。

- [ ] **Step 3:【实测】确定 embedding 供应商与模型 ID(规格 M1.3 定)**

两个候选都要实测(命令在 Windows Git Bash 执行,**用 --data-binary 防 GBK 坑**):

```bash
# 候选 1:豆包(火山方舟)
KEY=$(grep '^DOUBAO_API_KEY=' .env | cut -d= -f2)
printf '{"model":"doubao-embedding-large-text-240915","input":["你好"]}' > /tmp/emb_req.json
curl -s https://ark.cn-beijing.volces.com/api/v3/embeddings -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" --data-binary @/tmp/emb_req.json | head -c 400

# 候选 2:智谱
KEY=$(grep '^GLM_API_KEY=' .env | cut -d= -f2)
printf '{"model":"embedding-3","input":["你好"]}' > /tmp/emb_req.json
curl -s https://open.bigmodel.cn/api/paas/v4/embeddings -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" --data-binary @/tmp/emb_req.json | head -c 400
```

判定规则:**豆包成功 → 用豆包**(记下实际返回的模型 ID 与向量维度);豆包失败/无额度 → 用智谱 `embedding-3`(2048 维)。把结论写进 `.env`(`EMBEDDING_PROVIDER`、`DOUBAO_EMBEDDING_MODEL` 或 `GLM_EMBEDDING_MODEL`、`EMBEDDING_DIM`),并把实测过程记入 devlog。

- [ ] **Step 4:写失败测试 tests/test_chunker.py(切片器,纯函数,先测)**

```python
from app.services.chunker import split_markdown


def test_splits_by_h2_headings():
    text = "开头简介\n## 技术栈\nVue、Node\n## 工作经历\n某公司 3 年"
    chunks = split_markdown(text)
    assert [c.title for c in chunks] == ["简介", "技术栈", "工作经历"]
    assert chunks[1].content == "Vue、Node"


def test_sub_headings_stay_in_parent_section():
    text = "## 工作经历\n### 公司A\n职责一\n### 公司B\n职责二"
    chunks = split_markdown(text)
    assert len(chunks) == 1
    assert "### 公司A" in chunks[0].content


def test_h1_and_empty_input_produce_no_chunks():
    assert split_markdown("") == []
    assert split_markdown("# 只有一级标题\n\n") == []
```

Run: `uv run pytest tests/test_chunker.py -q`
Expected: FAIL(`ModuleNotFoundError: app.services.chunker`)

- [ ] **Step 5:实现 chunker.py**

```python
"""profile.md 切片:按 ## 标题切分。标题即检索结果展示的 section 名(来源引用标题)。

M1 用最简单的标题切片即可(简历文档短);M4 文档库再升级更细的切片策略。
"""
from dataclasses import dataclass

DEFAULT_TITLE = "简介"


@dataclass
class Chunk:
    title: str
    content: str


def split_markdown(text: str) -> list[Chunk]:
    chunks: list[Chunk] = []
    current_title = DEFAULT_TITLE
    current_lines: list[str] = []

    for line in text.splitlines():
        if line.startswith("## "):
            # 新的二级标题:先把上一节收尾
            if current_lines:
                chunks.append(
                    Chunk(title=current_title, content="\n".join(current_lines).strip())
                )
            current_title = line[3:].strip()
            current_lines = []
        elif line.startswith("# "):
            continue  # 一级标题(文档大标题)不入库
        else:
            current_lines.append(line)

    if current_lines:
        chunks.append(
            Chunk(title=current_title, content="\n".join(current_lines).strip())
        )
    return [c for c in chunks if c.content]
```

Run: `uv run pytest tests/test_chunker.py -q`
Expected: PASS(`3 passed`)

- [ ] **Step 6:写 embeddings.py + vectorstore.py(含抽象接口)+ 对应测试**

`app/services/embeddings.py`:

```python
"""Embedding 抽象:Embedder Protocol 统一接口,供应商由 .env 切换。

OpenAICompatibleEmbedder 同时覆盖豆包/智谱(端点均为 OpenAI 格式)。
"""
from typing import Protocol

from langchain_openai import OpenAIEmbeddings

from app.config import Settings


class Embedder(Protocol):
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class OpenAICompatibleEmbedder:
    def __init__(self, base_url: str, api_key: str, model: str):
        self._client = OpenAIEmbeddings(model=model, api_key=api_key, base_url=base_url)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._client.aembed_documents(texts)

    async def embed_query(self, text: str) -> list[float]:
        return await self._client.aembed_query(text)


def get_embedder(settings: Settings) -> Embedder:
    if settings.embedding_provider == "doubao":
        if not settings.doubao_embedding_model:
            raise RuntimeError("EMBEDDING_PROVIDER=doubao 但 DOUBAO_EMBEDDING_MODEL 未配置(Task 1.3 Step 3 实测填写)")
        return OpenAICompatibleEmbedder(
            base_url=settings.doubao_base_url,
            api_key=settings.doubao_api_key,
            model=settings.doubao_embedding_model,
        )
    if settings.embedding_provider == "glm":
        return OpenAICompatibleEmbedder(
            base_url=settings.glm_base_url,
            api_key=settings.glm_api_key,
            model=settings.glm_embedding_model,
        )
    raise RuntimeError(f"unknown embedding_provider: {settings.embedding_provider}")
```

`app/services/vectorstore.py`:

```python
"""pgvector 存储与检索。

抽象设计(面试点):Retriever Protocol 是检索的唯一入口 —— 调用方只依赖接口,
不依赖 pgvector;M4 文档库、未来换库都只需提供新实现。
向量以字符串字面量 "[0.1,0.2,...]" 传给 ::vector 转换,不依赖 pgvector python 适配器。
"""
from dataclasses import dataclass
from typing import Protocol

from psycopg import AsyncConnection
from pydantic import BaseModel

from app.config import Settings
from app.services.embeddings import Embedder, get_embedder


class SearchHit(BaseModel):
    title: str
    content: str
    score: float


class Retriever(Protocol):
    async def search(self, query: str, top_k: int = 4) -> list[SearchHit]: ...


@dataclass
class ChunkRow:
    source: str
    section: str
    content: str
    embedding: list[float]


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(x) for x in vec) + "]"


class PgvectorStore:
    def __init__(self, dsn: str, embedder: Embedder, dim: int):
        self._dsn = dsn
        self._embedder = embedder
        self._dim = dim

    async def init_schema(self) -> None:
        async with await AsyncConnection.connect(self._dsn) as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS chunks (
                    id BIGSERIAL PRIMARY KEY,
                    source TEXT NOT NULL,
                    section TEXT NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector({self._dim}) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )

    async def reset(self) -> None:
        """全量重建(换 embedding 维度时必须 DROP)。"""
        async with await AsyncConnection.connect(self._dsn) as conn:
            await conn.execute("DROP TABLE IF EXISTS chunks")
        await self.init_schema()

    async def insert_chunks(self, rows: list[ChunkRow]) -> None:
        async with await AsyncConnection.connect(self._dsn) as conn:
            for row in rows:
                await conn.execute(
                    "INSERT INTO chunks (source, section, content, embedding) "
                    "VALUES (%s, %s, %s, %s::vector)",
                    (row.source, row.section, row.content, _vec_literal(row.embedding)),
                )

    async def search(self, query: str, top_k: int = 4) -> list[SearchHit]:
        vec = await self._embedder.embed_query(query)
        vec_str = _vec_literal(vec)
        async with await AsyncConnection.connect(self._dsn) as conn:
            cur = await conn.execute(
                "SELECT section, content, 1 - (embedding <=> %s::vector) AS score "
                "FROM chunks ORDER BY embedding <=> %s::vector LIMIT %s",
                (vec_str, vec_str, top_k),
            )
            rows = await cur.fetchall()
        return [
            SearchHit(title=row[0], content=row[1], score=round(float(row[2]), 4))
            for row in rows
        ]


def get_retriever(settings: Settings) -> Retriever:
    return PgvectorStore(
        dsn=settings.database_url,
        embedder=get_embedder(settings),
        dim=settings.embedding_dim,
    )
```

> 说明(面试点):M1 数据量(几十个 chunk)直接全表扫描,余弦距离毫秒级;不建 HNSW 索引 —— 量级决定选型。数据量过万再补索引,注释里已留这句话的素材。

测试:先 `uv add "psycopg[binary]" langchain-openai`,再写 `tests/fakes.py`(追加 FakeEmbedder)与 `tests/test_vectorstore.py`:

`tests/fakes.py`(本任务先建,FakeEmbedder 部分;ScriptedChatModel 等 Task 1.4 再加):

```python
import hashlib


class FakeEmbedder:
    """哈希伪向量:同一文本向量相同(无语义,仅验证管线;相似度断言只用于相同文本)。"""

    def __init__(self, dim: int = 8):
        self.dim = dim

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        digest = hashlib.md5(text.encode("utf-8")).digest()
        vec = [((b / 255.0) * 2 - 1) for b in digest]
        if len(vec) < self.dim:
            vec += [0.0] * (self.dim - len(vec))
        return vec[: self.dim]
```

`tests/test_vectorstore.py`:

```python
import pytest

from app.services.vectorstore import ChunkRow, PgvectorStore
from tests.fakes import FakeEmbedder

DSN = "postgresql://agent:agent_dev_2026@127.0.0.1:5432/agent"


async def _db_ready(store: PgvectorStore) -> bool:
    try:
        await store.init_schema()
        return True
    except Exception:
        return False


@pytest.mark.asyncio
async def test_insert_and_search_roundtrip():
    emb = FakeEmbedder(dim=8)
    store = PgvectorStore(dsn=DSN, embedder=emb, dim=8)
    if not await _db_ready(store):
        pytest.skip("pgvector 不可达,跳过集成测试")

    await store.reset()
    texts = ["在 A 公司做 Vue 开发", "熟悉 Python 与 FastAPI"]
    vecs = await emb.embed_documents(texts)
    await store.insert_chunks(
        [
            ChunkRow(source="profile.md", section="工作经历", content=t, embedding=v)
            for t, v in zip(texts, vecs)
        ]
    )

    hits = await store.search("熟悉 Python 与 FastAPI", top_k=2)

    assert len(hits) == 2
    assert hits[0].content == "熟悉 Python 与 FastAPI"
    assert hits[0].score > hits[1].score
    assert hits[0].title == "工作经历"
```

Run: `uv run pytest -q`
Expected: PASS(`4 passed`,1 skipped — 若 pgvector 可达则为 5 passed;不可达则 skip 不算失败)

- [ ] **Step 7:入库脚本 scripts/init_db.py + scripts/ingest_profile.py**

```python
"""建库建表(幂等)。用法:uv run python scripts/init_db.py"""
import asyncio

from app.config import Settings
from app.services.embeddings import get_embedder
from app.services.vectorstore import PgvectorStore


async def main() -> None:
    settings = Settings()
    store = PgvectorStore(
        dsn=settings.database_url,
        embedder=get_embedder(settings),
        dim=settings.embedding_dim,
    )
    await store.init_schema()
    print("✓ chunks 表就绪")


if __name__ == "__main__":
    asyncio.run(main())
```

```python
"""切片 → embedding → 入库(每次全量重建,幂等)。用法:uv run python scripts/ingest_profile.py"""
import asyncio
from pathlib import Path

from app.config import Settings
from app.services.chunker import split_markdown
from app.services.embeddings import get_embedder
from app.services.vectorstore import ChunkRow, PgvectorStore


async def main() -> None:
    settings = Settings()
    text = Path(settings.profile_md_path).read_text(encoding="utf-8")
    chunks = split_markdown(text)
    if not chunks:
        raise SystemExit(f"{settings.profile_md_path} 无内容,请先完成 Task 1.1 填写")

    embedder = get_embedder(settings)
    store = PgvectorStore(
        dsn=settings.database_url,
        embedder=embedder,
        dim=settings.embedding_dim,
    )
    await store.reset()
    vectors = await embedder.embed_documents([c.content for c in chunks])
    rows = [
        ChunkRow(
            source=Path(settings.profile_md_path).name,
            section=c.title,
            content=c.content,
            embedding=v,
        )
        for c, v in zip(chunks, vectors)
    ]
    await store.insert_chunks(rows)
    print(f"✓ 入库 {len(rows)} 个片段")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 8:本地跑一次入库并验证检索命中**

```bash
uv run python scripts/init_db.py
uv run python scripts/ingest_profile.py
docker exec agent-pgvector psql -U agent -d agent -c "SELECT count(*) FROM chunks;"
```

Expected: `count` ≥ 5(与 profile.md 小节数一致)。

检索冒烟(临时 python 片段,验证「检索能命中简历」):

```bash
uv run python - <<'PY'
import asyncio
from app.config import Settings
from app.services.vectorstore import get_retriever

async def main():
    retriever = get_retriever(Settings())
    hits = await retriever.search("刘俊雄做过什么项目", top_k=3)
    for h in hits:
        print(f"[{h.title}] {h.score:.3f} {h.content[:60]}")

asyncio.run(main())
PY
```

Expected: 命中简历项目经验/工作经历,score 高者排前。

- [ ] **Step 9:提交**

```bash
git add -A && git commit -m "feat: pgvector 知识库(切片 + embedding 入库 + 检索抽象)"
```

devlog 记录:embedding 供应商实测结论、chunk 数、pgvector 位置决策。

---

## Task 1.4:LangGraph Agent(检索节点 → 流式回答 + 条件边)

**Files:**
- Create: `app/agent/state.py`、`app/agent/graph.py`、`app/services/llm.py`、`app/tools/search_profile.py`、`scripts/ask.py`、`tests/test_graph.py`
- Modify: `tests/fakes.py`(追加 ScriptedChatModel、RecordingRetriever)

**Interfaces:**
- Consumes: `Retriever` / `SearchHit` / `Settings`(Task 1.2/1.3)。
- Produces(后续任务依赖,签名不可改):
  - `AgentState(TypedDict, total=False)`: `messages: Annotated[list[AnyMessage], add_messages]`、`needs_profile: bool`、`sources: list[SearchHit]`
  - `build_graph(*, chat_llm, router_llm, retriever) -> CompiledGraph`
  - `get_chat_llm(settings, model_id=None)` / `get_router_llm(settings, model_id=None)`(llm.py)
  - `make_search_profile(retriever) -> async search_profile(query: str, top_k: int = 4) -> list[SearchHit]`(tools/search_profile.py —— **M2 把同一函数注册成 MCP 工具**;FastMCP 原生支持 async 工具,签名无需改动)
- **面试点:状态图三节点 + 条件边(route → retrieve/generate);`search_profile` 是「一套能力多入口」的核心。**

- [ ] **Step 1:加依赖 + 写失败测试**

```bash
uv add langgraph langchain-openai
```

`tests/fakes.py` 追加:

```python
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult

from app.services.vectorstore import SearchHit


class ScriptedChatModel(BaseChatModel):
    """按预定顺序吐答案;记录每次调用;支持流式(_stream 逐字输出)。"""

    def __init__(self, responses: list[str]):
        super().__init__()
        self._responses = responses.copy()
        self.calls: list[list[BaseMessage]] = []

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.calls.append(list(messages))
        text = self._responses.pop(0) if self._responses else ""
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=text))])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        self.calls.append(list(messages))
        text = self._responses.pop(0) if self._responses else ""
        for char in text:
            yield ChatGenerationChunk(message=AIMessageChunk(content=char))


class RecordingRetriever:
    def __init__(self, hits: list[SearchHit]):
        self.hits = hits
        self.queries: list[str] = []

    async def search(self, query: str, top_k: int = 4) -> list[SearchHit]:
        self.queries.append(query)
        return self.hits
```

`tests/test_graph.py`:

```python
import pytest
from langchain_core.messages import HumanMessage

from app.agent.graph import build_graph
from app.services.vectorstore import SearchHit
from tests.fakes import RecordingRetriever, ScriptedChatModel

HIT = SearchHit(title="项目经验", content="负责 Lucas Space 全栈开发", score=0.93)


@pytest.mark.asyncio
async def test_profile_question_retrieves_and_answers():
    retriever = RecordingRetriever([HIT])
    graph = build_graph(
        chat_llm=ScriptedChatModel(["熊仔负责过 Lucas Space 全栈开发。"]),
        router_llm=ScriptedChatModel(['{"needs_profile": true}']),
        retriever=retriever,
    )

    result = await graph.ainvoke({"messages": [HumanMessage(content="熊仔做过什么?")]})

    assert retriever.queries == ["熊仔做过什么?"]
    assert result["sources"] == [HIT]
    assert result["messages"][-1].content == "熊仔负责过 Lucas Space 全栈开发。"


@pytest.mark.asyncio
async def test_general_chat_skips_retrieval():
    retriever = RecordingRetriever([HIT])
    graph = build_graph(
        chat_llm=ScriptedChatModel(["Vue 3 用 ref 定义响应式数据。"]),
        router_llm=ScriptedChatModel(['{"needs_profile": false}']),
        retriever=retriever,
    )

    result = await graph.ainvoke({"messages": [HumanMessage(content="Vue 3 的 ref 是什么?")]})

    assert retriever.queries == []
    assert result.get("sources", []) == []
    assert "ref" in result["messages"][-1].content


@pytest.mark.asyncio
async def test_router_failure_falls_back_to_retrieval():
    retriever = RecordingRetriever([HIT])
    graph = build_graph(
        chat_llm=ScriptedChatModel(["好的。"]),
        router_llm=ScriptedChatModel(["这不是JSON"]),
        retriever=retriever,
    )

    result = await graph.ainvoke({"messages": [HumanMessage(content="你是谁?")]})

    assert retriever.queries == ["你是谁?"]
    assert result["sources"] == [HIT]
```

Run: `uv run pytest tests/test_graph.py -q`
Expected: FAIL(`ModuleNotFoundError: app.agent.graph`)

- [ ] **Step 2:实现 state.py + graph.py + llm.py + search_profile.py**

`app/agent/state.py`:

```python
"""Agent 状态。M3 加 checkpointer 时这里会扩展(会话记忆),单独文件便于演进。"""
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

from app.services.vectorstore import SearchHit


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    needs_profile: bool
    sources: list[SearchHit]
```

`app/agent/graph.py`:

```python
"""LangGraph 状态图:route → (条件边) → retrieve → generate。

面试主线:节点/边/状态图不是玩具 if/else —— 路由结果显式落在状态里,
条件边据此分支;LLM 令牌通过 stream_mode="messages" 逐字流回前端。
"""
import json
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.services.vectorstore import Retriever, SearchHit
from app.tools.search_profile import make_search_profile

ROUTER_SYSTEM = (
    "你是查询意图分类器。判断用户最后一条消息是否需要查询"
    "「熊仔(刘俊雄)的个人资料」才能回答。只输出 JSON,不要输出任何其他内容:"
    '{"needs_profile": true} 或 {"needs_profile": false}'
)

GENERATE_SYSTEM = (
    "你是「熊仔」(刘俊雄)的 AI 助手,由个人博客 Lucas Space 部署。特点:\n"
    "- 擅长Node全栈、前端开发、Vue 2/3、React、TypeScript、可视化等技术话题\n"
    "- 回答风格:专业但不枯燥,像一位有 7 年经验的前端架构师\n"
    "- 代码示例优先使用 TypeScript/Vue 3,带简要注释\n"
    "- 不知道就说不知道,不编造"
)


class AgentState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    needs_profile: bool
    sources: list[SearchHit]


def format_context(hits: list[SearchHit]) -> str:
    parts = [f"[{i}] ({h.title}) {h.content}" for i, h in enumerate(hits, start=1)]
    return (
        "以下是「熊仔个人资料」中与问题相关的片段,请基于这些资料回答;"
        "资料中没有的信息不要编造,引用时在句末标注 [来源 n]:\n" + "\n\n".join(parts)
    )


def build_graph(*, chat_llm, router_llm, retriever: Retriever):
    search_profile = make_search_profile(retriever)

    async def route(state: AgentState) -> dict:
        last = state["messages"][-1].content
        try:
            resp = await router_llm.ainvoke(
                [SystemMessage(content=ROUTER_SYSTEM), HumanMessage(content=str(last))]
            )
            needs = bool(json.loads(resp.content)["needs_profile"])
        except Exception:
            needs = True  # 路由失败默认走检索:宁可多查,不漏查
        return {"needs_profile": needs}

    async def retrieve(state: AgentState) -> dict:
        query = str(state["messages"][-1].content)
        hits = await search_profile(query, top_k=4)
        return {"sources": hits}

    async def generate(state: AgentState) -> dict:
        messages = [SystemMessage(content=GENERATE_SYSTEM)]
        hits = state.get("sources") or []
        if hits:
            messages.append(SystemMessage(content=format_context(hits)))
        messages.extend(state["messages"])

        full = ""
        async for chunk in chat_llm.astream(messages):
            full += chunk.content
        return {"messages": [AIMessage(content=full)]}

    graph = StateGraph(AgentState)
    graph.add_node("route", route)
    graph.add_node("retrieve", retrieve)
    graph.add_node("generate", generate)
    graph.add_edge(START, "route")
    graph.add_conditional_edges(
        "route",
        lambda s: "retrieve" if s.get("needs_profile") else "generate",
        {"retrieve": "retrieve", "generate": "generate"},
    )
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    return graph.compile()
```

`app/services/llm.py`:

```python
"""LLM 供应商配置(OpenAI-compatible):豆包 / 智谱。

model id 与博客前端保持一致(doubao / glm),前端 model 参数原样透传解析。
"""
from dataclasses import dataclass

from langchain_openai import ChatOpenAI

from app.config import Settings


@dataclass
class Provider:
    id: str
    name: str
    base_url: str
    model: str
    api_key: str


def configured_providers(settings: Settings) -> list[Provider]:
    providers: list[Provider] = []
    if settings.doubao_api_key:
        providers.append(
            Provider(
                id="doubao",
                name="豆包 Seed-2.0-Lite",
                base_url=settings.doubao_base_url,
                model=settings.doubao_model,
                api_key=settings.doubao_api_key,
            )
        )
    if settings.glm_api_key:
        providers.append(
            Provider(
                id="glm",
                name="智谱 GLM-4.7-Flash",
                base_url=settings.glm_base_url,
                model=settings.glm_model,
                api_key=settings.glm_api_key,
            )
        )
    return providers


def resolve_provider(settings: Settings, model_id: str | None) -> Provider:
    """默认取第一位(豆包优先,与博客一致);未知 id 抛 ValueError。"""
    providers = configured_providers(settings)
    if not providers:
        raise RuntimeError("LLM API key not configured")
    if not model_id:
        return providers[0]
    for p in providers:
        if p.id == model_id:
            return p
    raise ValueError(f"unknown model: {model_id}")


def _build_chat_openai(p: Provider, *, temperature: float, max_tokens: int) -> ChatOpenAI:
    return ChatOpenAI(
        model=p.model,
        api_key=p.api_key,
        base_url=p.base_url,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=60,
        # 智谱/豆包默认关闭 thinking,避免 reasoning 内容混入正文
        extra_body={"thinking": {"type": "disabled"}},
    )


def get_chat_llm(settings: Settings, model_id: str | None = None) -> ChatOpenAI:
    return _build_chat_openai(
        resolve_provider(settings, model_id), temperature=0.7, max_tokens=4096
    )


def get_router_llm(settings: Settings, model_id: str | None = None) -> ChatOpenAI:
    return _build_chat_openai(
        resolve_provider(settings, model_id), temperature=0, max_tokens=50
    )
```

`app/tools/search_profile.py`:

```python
"""★ 核心工具函数:检索「熊仔个人资料」知识库。

面试主线「一套能力,多个入口」:make_search_profile 工厂返回的 search_profile
在 LangGraph 里被 retrieve 节点调用;M2 把同一个函数注册成 MCP 工具供 Claude Code 调用
(FastMCP 原生支持 async 工具,函数签名无需改动)。
"""
from app.services.vectorstore import Retriever, SearchHit


def make_search_profile(retriever: Retriever):
    """工厂:注入 retriever,返回工具函数(依赖注入 → 测试可用 fake)。"""

    async def search_profile(query: str, top_k: int = 4) -> list[SearchHit]:
        """检索「熊仔个人资料」知识库,返回相关片段(按相似度降序)。"""
        return await retriever.search(query, top_k=top_k)

    return search_profile
```

Run: `uv run pytest tests/test_graph.py -q`
Expected: PASS(`3 passed`)

- [ ] **Step 3:手动冒烟脚本 scripts/ask.py(真实 LLM + 真实检索,验证端到端)**

```python
"""命令行冒烟:uv run python scripts/ask.py "熊仔做过什么"

要求:项目根目录已配置 .env 且 profile 已入库(Task 1.3)。逐字打印流式回答与来源。
装配代码自包含(不依赖 app.main 的 build_agent),与 Task 1.5 保持独立。
"""
import asyncio
import sys

from langchain_core.messages import HumanMessage

from app.agent.graph import build_graph
from app.config import Settings
from app.services.llm import get_chat_llm, get_router_llm
from app.services.vectorstore import get_retriever


async def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit('用法: uv run python scripts/ask.py "问题"')
    settings = Settings()
    agent = build_graph(
        chat_llm=get_chat_llm(settings),
        router_llm=get_router_llm(settings),
        retriever=get_retriever(settings),
    )

    input_state = {"messages": [HumanMessage(content=sys.argv[1])]}
    async for mode, chunk in agent.astream(input_state, stream_mode=["messages", "values"]):
        if mode == "messages":
            msg_chunk, meta = chunk
            if meta.get("langgraph_node") == "generate" and msg_chunk.content:
                print(msg_chunk.content, end="", flush=True)
        else:
            for s in chunk.get("sources") or []:
                print(f"\n\n[来源] {s.title} (score={s.score})\n{s.content[:120]}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
```

验证两条:

```bash
uv run python scripts/ask.py "熊仔做过什么项目?"
uv run python scripts/ask.py "Vue 3 的 ref 是什么?"
```

Expected: 第一条流式输出答案 + 末尾打印来源(命中简历);第二条无来源输出(条件边走了 generate 直连)。**若令牌没有逐字流式输出而是整段跳出**:把 generate 节点内 `chat_llm.astream` 换成 `answer = await chat_llm.ainvoke(messages); return {"messages": [answer]}`,重跑验证(LangGraph messages 模式两种调用都能捕获令牌,以实测为准)。

- [ ] **Step 4:提交**

```bash
git add -A && git commit -m "feat: LangGraph Agent(route/retrieve/generate + 条件边 + 流式)"
```

devlog 记录:图结构说明(面试叙事素材)、实测流式结论。

---

## Task 1.5:FastAPI SSE 接口 + 博客改转发(打通博客 ↔ Agent)

**Files:**
- Create: `app/api/routes/chat.py`、`tests/test_api_chat.py`
- Modify: `app/main.py`(加 build_agent + agent_factory 装配)
- Modify(AImyhome 仓库): `server/api/agent.post.ts`(重写为转发)
- Modify(AImyhome 仓库): `.env.example`(加 AGENT_SERVICE_URL)

**Interfaces:**
- Consumes: `build_graph` / `get_chat_llm` / `get_router_llm` / `get_retriever`(Task 1.4/1.3)、`Settings`。
- Produces(契约,Task 1.6/1.7 依赖):
  - `POST /api/agent/chat`(SSE,格式见「跨任务接口契约」节)
  - `build_agent(settings, model_id=None) -> CompiledGraph`(main.py,每次请求现配)
  - 博客侧 `AGENT_SERVICE_URL`(默认 `http://127.0.0.1:8000`)
- **面试点:流式(SSE)+ 前后端分离(博客薄壳化)。**

- [ ] **Step 1:写失败测试 tests/test_api_chat.py**

```python
import json

import pytest
from fastapi.testclient import TestClient

from app.agent.graph import build_graph
from app.config import Settings
from app.main import create_app
from app.services.vectorstore import SearchHit
from tests.fakes import RecordingRetriever, ScriptedChatModel

HIT = SearchHit(title="项目经验", content="负责 Lucas Space 全栈开发", score=0.93)


def _make_factory(needs_profile: bool):
    def factory(settings, model_id=None):
        if model_id not in (None, "doubao", "glm"):
            raise ValueError(f"unknown model: {model_id}")
        return build_graph(
            chat_llm=ScriptedChatModel(["你好,我是熊仔的助手。"]),
            router_llm=ScriptedChatModel([f'{{"needs_profile": {str(needs_profile).lower()}}}']),
            retriever=RecordingRetriever([HIT]),
        )

    return factory


def _client(needs_profile: bool) -> TestClient:
    app = create_app(Settings(_env_file=None), agent_factory=_make_factory(needs_profile))
    return TestClient(app)


def _stream_lines(client: TestClient, body: dict) -> list[str]:
    with client.stream("POST", "/api/agent/chat", json=body) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        return [line.strip() for line in resp.iter_lines()]


def test_chat_streams_openai_compatible_events():
    with _client(needs_profile=False) as client:
        lines = _stream_lines(client, {"messages": [{"role": "user", "content": "你好"}]})

    assert "data: [DONE]" in lines
    payloads = [
        json.loads(line[5:])
        for line in lines
        if line.startswith("data:") and line[5:].strip() != "[DONE]"
    ]
    deltas = [p["choices"][0]["delta"]["content"] for p in payloads if "choices" in p]
    assert "".join(deltas) == "你好,我是熊仔的助手。"
    # 路由器的 LLM 输出不能漏进正文(按 langgraph_node 过滤)
    assert "needs_profile" not in "".join(deltas)


def test_chat_emits_sources_event_when_profile_needed():
    with _client(needs_profile=True) as client:
        lines = _stream_lines(client, {"messages": [{"role": "user", "content": "熊仔做过什么"}]})

    payloads = [
        json.loads(line[5:])
        for line in lines
        if line.startswith("data:") and line[5:].strip() != "[DONE]"
    ]
    sources_events = [p for p in payloads if p.get("type") == "sources"]
    assert len(sources_events) == 1
    first = sources_events[0]["sources"][0]
    assert first["title"] == "项目经验"
    assert first["excerpt"] == "负责 Lucas Space 全栈开发"
    assert isinstance(first["score"], float)


def test_chat_rejects_empty_messages():
    with _client(needs_profile=False) as client:
        resp = client.post("/api/agent/chat", json={"messages": []})
        assert resp.status_code == 422


def test_chat_unknown_model_returns_400():
    with _client(needs_profile=False) as client:
        with client.stream("POST", "/api/agent/chat",
                           json={"messages": [{"role": "user", "content": "hi"}], "model": "nope"}) as resp:
            assert resp.status_code == 400
```

Run: `uv run pytest tests/test_api_chat.py -q`
Expected: FAIL(`ImportError: cannot import name 'chat'`)

- [ ] **Step 2:实现 chat.py + 扩展 main.py**

`app/api/routes/chat.py`:

```python
"""POST /api/agent/chat — SSE 流式回答。

事件格式与 OpenAI chat.completions 兼容(choices[0].delta.content),博客前端解析零改动;
来源通过自定义事件 {"type":"sources"} 在 [DONE] 前下发。
"""
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from pydantic import BaseModel, Field

router = APIRouter()


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1)
    model: str | None = None


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _to_langchain(m: ChatMessageIn):
    if m.role == "user":
        return HumanMessage(content=m.content)
    return AIMessage(content=m.content)


@router.post("/chat")
async def chat(req: ChatRequest, request: Request) -> StreamingResponse:
    settings = request.app.state.settings
    try:
        agent = request.app.state.agent_factory(settings, req.model)
    except ValueError as e:  # unknown model
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:  # no API keys
        raise HTTPException(status_code=500, detail=str(e)) from e

    input_state = {"messages": [_to_langchain(m) for m in req.messages]}

    async def event_stream():
        final_sources: list[dict] = []
        async for mode, chunk in agent.astream(
            input_state, stream_mode=["messages", "values"]
        ):
            if mode == "messages":
                msg_chunk, meta = chunk
                # 只转发 generate 节点的令牌;route 节点的路由 LLM 输出会被过滤掉
                if (
                    meta.get("langgraph_node") == "generate"
                    and isinstance(msg_chunk, AIMessageChunk)
                    and msg_chunk.content
                ):
                    yield _sse(
                        {"choices": [{"delta": {"content": msg_chunk.content}, "index": 0}]}
                    )
            else:  # mode == "values":每个超步后的完整状态,取最后一次的 sources
                final_sources = [s.model_dump() for s in (chunk.get("sources") or [])]

        if final_sources:
            slim = [
                {"title": s["title"], "excerpt": s["content"][:120], "score": s["score"]}
                for s in final_sources
            ]
            yield _sse({"type": "sources", "sources": slim})
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

`app/main.py` 整体替换为(注意保留 Task 1.2 的 health 逻辑):

```python
"""FastAPI 入口。启动:uv run uvicorn app.main:app --reload --port 8000"""
from collections.abc import Callable

from fastapi import FastAPI

from app.agent.graph import build_graph
from app.api.routes import chat, health
from app.config import Settings
from app.services.llm import get_chat_llm, get_router_llm
from app.services.vectorstore import get_retriever


def build_agent(settings: Settings, model_id: str | None = None):
    """每次请求现配一张图:LLM 供应商按请求的 model 参数切换(代价极小,compile 毫秒级)。"""
    return build_graph(
        chat_llm=get_chat_llm(settings, model_id),
        router_llm=get_router_llm(settings, model_id),
        retriever=get_retriever(settings),
    )


def create_app(
    settings: Settings | None = None,
    agent_factory: Callable = build_agent,
) -> FastAPI:
    app = FastAPI(title="AImyhome Agent")
    app.state.settings = settings or Settings()
    app.state.agent_factory = agent_factory
    app.include_router(health.router)
    app.include_router(chat.router)
    return app


app = create_app()
```

Run: `uv run pytest -q`
Expected: PASS(此前全部测试通过;新增 4 个 API 测试)

- [ ] **Step 3:手动验证 Agent 侧 SSE(真实 LLM,Windows Git Bash)**

启动服务并 curl(注意 --data-binary 防 GBK):

```bash
uv run uvicorn app.main:app --port 8000 &
sleep 3
printf '{"messages":[{"role":"user","content":"熊仔做过什么"}]}' > /tmp/chat_req.json
curl -N http://127.0.0.1:8000/api/agent/chat -H "Content-Type: application/json" --data-binary @/tmp/chat_req.json
```

Expected: 逐 token 的 `data: {"choices":...}` 事件流 → `data: {"type":"sources",...}` → `data: [DONE]`。顺带验证 model 透传:`... "model":"glm" ...` 能切到智谱回答;`"model":"nope"` 返回 400。

- [ ] **Step 4:【AImyhome 仓库】agent.post.ts 重写为转发**

用 Write 整体替换 `f:\AIproject\AImyhome\server\api\agent.post.ts`:

```ts
/**
 * AI Agent API endpoint — 薄壳转发:把请求原样代理到独立 Agent 服务
 * (AImyhome-agent,FastAPI + LangGraph),SSE 流透传。
 * Agent 服务地址由环境变量 AGENT_SERVICE_URL 控制(默认本机 8000)。
 */

import { PassThrough } from 'node:stream'
import type { AgentRequest } from '~/types/chat'

const TARGET = (process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export default defineEventHandler(async (event) => {
  const body = await readBody<AgentRequest>(event)

  // Validate (与旧实现保持一致)
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  // Forward to Agent service — model 参数原样透传(doubao / glm)
  let upstream: Response
  try {
    upstream = await fetch(`${TARGET}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'AI service unavailable' })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    throw createError({
      statusCode: 502,
      statusMessage: text.slice(0, 200) || `AI service error (${upstream.status})`,
    })
  }

  // Bridge web ReadableStream → Node.js PassThrough for Nuxt's sendStream
  const webStream = upstream.body!
  const nodeStream = new PassThrough()

  const reader = webStream.getReader()
  const pump = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          nodeStream.end()
          break
        }
        nodeStream.write(Buffer.from(value))
      }
    } catch {
      nodeStream.destroy()
    }
  }
  pump() // Background — sendStream will wait for nodeStream to end

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  return sendStream(event, nodeStream)
})
```

`AImyhome/.env.example` 追加:

```bash
# AI Agent 服务地址(AImyhome-agent;生产填 https://agent.ai-myhome.space)
AGENT_SERVICE_URL=http://127.0.0.1:8000
```

- [ ] **Step 5:【AImyhome 仓库】本地打通验证**

Agent 服务保持运行,另开终端:

```bash
cd /f/AIproject/AImyhome
npm run dev
# 再开一个终端
curl -N http://localhost:3000/api/agent -H "Content-Type: application/json" --data-binary @/tmp/chat_req.json
```

Expected: 与 Step 3 相同的事件流(经博客转发)。然后浏览器打开 `http://localhost:3000/ai-agent`,问「熊仔做过什么」:回答逐字流式出现(此阶段还看不到来源,Task 1.6 加)。

- [ ] **Step 6:【AImyhome 仓库】构建验证(先停 dev,再 build)**

```bash
# dev 与 build 互斥:先停掉 npm run dev
npm run build
```

Expected: 无报错。构建后若继续调试可再 `npm run dev`。

- [ ] **Step 7:两个仓库分别提交**

```bash
# Agent 仓库
cd /f/AIproject/AImyhome-agent && git add -A && git commit -m "feat: POST /api/agent/chat SSE 接口(OpenAI 兼容 + sources 事件)"

# 博客仓库
cd /f/AIproject/AImyhome && git add server/api/agent.post.ts .env.example && git commit -m "feat: agent.post.ts 改为转发独立 Agent 服务"
```

两个仓库 devlog 各自更新(博客任务更新 `AImyhome/devlog/`,Agent 任务更新 `AImyhome-agent/devlog/`)。

---

## Task 1.6:前端来源引用展示

**Files:**
- Modify(AImyhome 仓库): `types/chat.ts`、`components/agent/ChatPanel.vue`

**Interfaces:**
- Consumes: SSE `{"type":"sources","sources":[...]}` 事件(Task 1.5 契约);Midnight Slate token(`docs/DESIGN.md`)。
- Produces: `ChatSource { title, excerpt, score }`;ChatMessage 增 `sources?: ChatSource[]`。
- **面试点:前端薄壳 —— 新增 Agent 能力只动展示层。**

- [ ] **Step 1:types/chat.ts 增加来源类型**

在 `f:\AIproject\AImyhome\types\chat.ts` 中,`ChatMessage` 接口增加字段,并新增接口(插在 `ChatMessage` 之后):

```typescript
/** AI Agent chat message types */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 资料来源引用(Agent 服务经 SSE sources 事件下发,仅 assistant 消息有) */
  sources?: ChatSource[]
}

/** 一条资料引用:来自 profile.md 知识库的检索片段 */
export interface ChatSource {
  title: string
  excerpt: string
  score: number
}
```

- [ ] **Step 2:ChatPanel.vue 解析 sources 事件**

`components/agent/ChatPanel.vue` 的 SSE 解析循环里,在 `parsed.choices` 分支之前插入(现有代码位置:约 [ChatPanel.vue:236-244](../../../components/agent/ChatPanel.vue#L236-L244) 的 try 块内):

```typescript
        try {
          const parsed = JSON.parse(data)
          // Agent 服务下发的来源引用事件(自定义事件,在 [DONE] 之前)
          if (parsed.type === 'sources' && Array.isArray(parsed.sources)) {
            messages.value[assistantIndex].sources = parsed.sources
            continue
          }
          // 智谱 GLM uses OpenAI-compatible format
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            messages.value[assistantIndex].content += content
            scrollToBottom()
          }
        } catch {
          // Skip unparseable lines (e.g., keepalive comments)
        }
```

- [ ] **Step 3:ChatPanel.vue 渲染来源块(保持只改本文件,不新增组件)**

把消息列表的 v-for 从「直接渲染 ChatMessage」改为「消息 + 来源块」包装模板(现有代码位置:约 [ChatPanel.vue:65](../../../components/agent/ChatPanel.vue#L65)):

```vue
      <!-- Messages -->
      <template v-for="msg in messages" :key="msg.id">
        <ChatMessage :message="msg" />
        <!-- 来源引用:仅 assistant 且有 sources 时展示 -->
        <div
          v-if="msg.role === 'assistant' && msg.sources?.length"
          class="ml-11 mt-1 flex flex-wrap gap-2"
        >
          <div
            v-for="(src, i) in msg.sources"
            :key="i"
            class="chip max-w-full cursor-default"
            :title="src.excerpt"
          >
            <span class="text-brand-accent">📎</span>
            <span class="text-label-sm text-on-surface-variant">
              {{ src.title }}<span class="opacity-60"> · {{ (src.score * 100).toFixed(0) }}%</span>
            </span>
          </div>
        </div>
      </template>
```

(样式 token 说明:`chip`、`text-label-sm`、`text-on-surface-variant`、`text-brand-accent` 均来自 `docs/DESIGN.md` 现有语义类;`ml-11` 对齐头像+气泡左边距;hover 显示 excerpt 全文。)

- [ ] **Step 4:构建 + 浏览器验证**

```bash
cd /f/AIproject/AImyhome
npm run build   # dev 停掉再 build
npm run dev
```

浏览器 `http://localhost:3000/ai-agent`:
- 问「熊仔做过什么项目?」→ 回答流式出现,**答案下方出现来源 chips**(如「📎 项目经验 · 93%」,悬停见片段全文)
- 问「Vue 3 的 ref 是什么?」→ 正常回答,**无来源 chips**
- 清空对话、切模型(豆包/智谱)仍正常

- [ ] **Step 5:提交**

```bash
cd /f/AIproject/AImyhome && git add types/chat.ts components/agent/ChatPanel.vue && git commit -m "feat: 聊天答案展示资料来源引用"
```

devlog 更新。

---

## Task 1.7:部署腾讯云(PM2 + Nginx + HTTPS)+ 公网闭环

**Files:**
- Create(AImyhome-agent 仓库): `ecosystem.config.cjs`(PM2 配置)、`docs/deployment.md`(部署记录,随代码提交 —— 用户偏好「更新开发文档并随代码提交」)
- Modify: 服务器 `/etc/nginx/sites-available/agent`(服务器侧,不入仓库,内容写入 deployment.md)
- Modify: Vercel 环境变量 `AGENT_SERVICE_URL`

**Interfaces:**
- Consumes: Task 1.5 的服务与契约;服务器(前置准备:腾讯云 4核4G3M,Ubuntu;备案并行中)。
- Produces: 公网可问的 Agent 服务 + 博客→Agent→pgvector 全链路。
- **面试点:部署能力(swap/PM2/Nginx/HTTPS 模式沿用 pipeline-platform-nest 的 deployment.md,只读参考)。**

- [ ] **Step 1:服务器环境(若前置准备未完成则现在做,命令照搬 pipeline 模式)**

SSH 上服务器后(pipeline deployment.md §1 的 Ubuntu 流程):

```bash
# 2G swap(4G 机内存账:MinerU 常驻 1.5~2G,峰值另需 1~2G)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

# Docker(阿里云镜像,见 pipeline deployment.md §1)+ Nginx
# (命令与 pipeline 文档一致,执行时照抄该文档,不在此重复粘贴)

# uv(Python 工具链)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

- [ ] **Step 2:GitHub 仓库 + 推送**

**与用户确认仓库可见性(面试作品建议 public,用户定)**,然后:

```bash
cd /f/AIproject/AImyhome-agent
git remote add origin https://github.com/mybb999/AImyhome-agent.git  # 用户在 GitHub 先建空仓库
git push -u origin master
```

- [ ] **Step 3:服务器拉代码 + 装依赖 + 配 .env**

```bash
git clone https://github.com/mybb999/AImyhome-agent.git /opt/AImyhome-agent
cd /opt/AImyhome-agent
uv sync --frozen   # 或 uv sync(首次)
# 服务器 .env:DATABASE_URL 指向 127.0.0.1(本机 pgvector),密钥与本地一致
cp .env.example .env && vim .env
```

- [ ] **Step 4:服务器 pgvector + 入库**

```bash
docker compose up -d db
uv run python scripts/init_db.py
uv run python scripts/ingest_profile.py
curl -s http://127.0.0.1:8000/health 2>/dev/null || echo "(服务还没起,下一步)"
```

- [ ] **Step 5:PM2 托管 uvicorn**

`ecosystem.config.cjs`(入仓库):

```javascript
module.exports = {
  apps: [
    {
      name: 'agent',
      // uv 安装器装在 /root/.local/bin,PM2 的 PATH 未必包含,用绝对路径最稳
      script: '/root/.local/bin/uv',
      args: 'run uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: '/opt/AImyhome-agent',
      autorestart: true,
      max_memory_restart: '800M',
      out_file: '/opt/AImyhome-agent/logs/out.log',
      error_file: '/opt/AImyhome-agent/logs/err.log',
    },
  ],
}
```

```bash
mkdir -p /opt/AImyhome-agent/logs
cd /opt/AImyhome-agent
# 服务器需 Node 环境跑 PM2(照 pipeline deployment.md 装 nodejs + npm i -g pm2)
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
curl -s http://127.0.0.1:8000/health
```

Expected: `{"status":"ok"}`;`pm2 logs agent` 无报错。

- [ ] **Step 6:验证服务端问答(服务器本机,Linux UTF-8 可直接 -d)**

```bash
curl -N -X POST http://127.0.0.1:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"熊仔做过什么"}]}'
```

Expected: 流式事件 + sources 事件 + [DONE]。

- [ ] **Step 7:Nginx 反代 + 备案前直连验证**

腾讯云防火墙放行 80(和备案期间的 8000)。Nginx 配置(SSE 必须关缓冲):

```nginx
server {
    listen 80;
    server_name agent.ai-myhome.space;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;        # SSE 关键:禁用缓冲
        proxy_cache off;
        proxy_read_timeout 300s;    # 流式长连接
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/agent /etc/nginx/sites-enabled/agent
nginx -t && systemctl restart nginx
# 本机(dev 机)验证——备案完成前走 IP:8000 直连:
curl -N -X POST http://<服务器IP>:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/chat_req.json
```

- [ ] **Step 8:备案通过后:域名 + HTTPS**

DNS:A 记录 `agent.ai-myhome.space` → 服务器公网 IP(阿里云控制台,与 pipeline 同);然后:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d agent.ai-myhome.space
curl -s https://agent.ai-myhome.space/health
```

Expected: `{"status":"ok"}`(HTTP→HTTPS 自动跳转,certbot 自动续期;证书步骤与 pipeline deployment.md §8 一致)。

- [ ] **Step 9:Vercel 接线 → 公网全链路验证**

1. Vercel 项目设置环境变量 `AGENT_SERVICE_URL=https://agent.ai-myhome.space`(备案前临时用 `http://<服务器IP>:8000`)→ 触发重新部署博客
2. 浏览器打开线上博客 `/ai-agent` → 问「熊仔做过什么」→ 流式回答 + 来源 chips
3. `curl -N` 线上博客 `/api/agent` 验证事件流

- [ ] **Step 10:部署记录 + 提交**

把 Step 1/5/7/8 的全部命令与结论写入 `AImyhome-agent/docs/deployment.md`(格式参考 pipeline deployment.md),连同 `ecosystem.config.cjs` 提交:

```bash
cd /f/AIproject/AImyhome-agent && git add -A && git commit -m "docs: 腾讯云部署记录 + PM2 配置"
```

devlog 记录上线结论。

**🔖 M1 验收(与规格一致):** 博客聊天走通 Agent 服务 —— 公网访客问「熊仔做过什么」,Agent 检索 pgvector 流式作答、附资料来源;普通技术问题不走检索。→ 进入 M2(MCP Server)再单独成计划。

---

## 自审记录(writing-plans self-review)

1. **规格覆盖:** 1.1 profile.md ✓(Task 1.1)· 1.2 骨架 ✓(Task 1.2)· 1.3 建库/切片/入库/检索抽象 ✓(Task 1.3,Retriever Protocol)· 1.4 状态图+条件边+流式 ✓(Task 1.4)· 1.5 SSE+转发 ✓(Task 1.5)· 1.6 来源展示 ✓(Task 1.6)· 1.7 部署 ✓(Task 1.7);M2/M3/M4/E1 不在本计划范围(规格已注明后续单独计划)。
2. **占位符扫描:** 无 TBD/TODO;所有代码块为完整实现;唯一「以后补」项(Task 1.3 的 embedding 模型 ID、Task 1.2 README 架构图)均为**实测/后续任务性质**,不影响 M1 交付。
3. **类型一致性:** `SearchHit(title/content/score)` 在 Task 1.3 定义,Task 1.4(状态)、Task 1.5(SSE 序列化)、Task 1.6(ChatSource)引用一致;`build_graph`/`create_app`/`get_retriever` 签名跨任务一致;SSE 事件字段名(`type/choices/delta/content/sources/title/excerpt/score`)与前端解析代码逐字对应。
