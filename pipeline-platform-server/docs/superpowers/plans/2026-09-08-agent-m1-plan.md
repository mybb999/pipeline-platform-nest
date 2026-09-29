# AImyhome 博客 AI Agent 升级 · M1 实施计划

## 📋 进度板(人话版,给人看)

> 下面是施工细节;这一节是「现在到哪了」,每完成一步就更新勾选。

**这项目是干嘛的**:访客在博客问「熊仔做过什么」,Agent 回答并附出处。底层四件事:简历切片 → 存成向量 → 搜索 → 大模型生成回答。

**任务清单**:

- [x] **Task 1 环境**:Python + uv + 服务器 Docker + pgvector + SSH 隧道
- [x] **Task 2 骨架**:FastAPI + /health,测试跑通
- [x] **Task 3 知识源**:profile.md(新版简历已同步)
- [x] **Task 4 切片**:Markdown 两段式切片 + embedding 双写(豆包/智谱)
- [x] **Task 5 入库检索**:真库灌入 18 块,检索 + 自动降级(阈值 0.25)
- [x] **Task 5.5 混合检索**:向量 + 关键词(pg_trgm)两路召回,RRF 融合(标定集 13/13)
- [x] **Task 6 大脑**:LangGraph 工具调用循环(真 LLM 双场景验证通过)
- [x] **Task 7 接口**:SSE 流式输出,博客转发(端到端验证通过)
- [x] **Task 8 前端**:回答里显示来源(📎 参考资料块,列出「文件 · 章节」)
- [ ] **Task 9 上线**:部署腾讯云

**当前进度**:Task 5(`2915e7c`)、5.5(`68b48b8`)、6(`d51efb5`)、7(`9cb5070`)已提交,均未 push;Task 8 已完成(待提交)。下一步 **Task 9:部署上线**。

**技术栈一句话**:Python + FastAPI(接口)+ LangGraph(编排)+ pgvector(向量检索)+ 豆包/智谱(大模型与 embedding)

**已知遗留**:
- 智谱欠费,降级表 chunks_zhipu 为空 —— 充值后重灌即可
- 「最近在哪家公司」这类时间问题,留给 Task 6 的 Agent 推理解决

**Agent 相关文档索引**(全部在本仓库 `pipeline-platform-server/docs/superpowers/`,历史版本在 git 历史里,不占文件夹):

| 文件 | 是什么 |
|---|---|
| plans/2026-09-08-agent-m1-plan.md | **总计划**(本文件,含进度板)—— 唯一在执行的一份 |
| specs/2026-09-08-ai-agent-upgrade-design.md | M1 升级**设计文档**(定稿,方案与决策记录) |
| 面试亮点.md | **简历素材积累**(每任务补一节:技术点 + 面试问答) |

**Task 5.5 要点**(详细 spec 已并入本节,原独立文档删除):
- 两路召回:向量路(语义)+ pg_trgm 关键词路(字面),RRF 融合,并列时关键词优先
- `word_similarity(短问, 长文)` 参数顺序不能反,反了分数永远趋近 0(真库标定集抓出来的)
- 验收:标定集 13 题(专有名词 5 题 jsPlumb/HZero/ip2region/OnlyOffice/Wepy + 原 8 题)全过

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把博客的纯聊天助手升级为「懂我的助手」—— 访客问熊仔(刘俊雄)的简历资料,Agent 检索 pgvector 知识库后流式回答,答案附来源引用。

**Architecture:** 新建独立 Python 服务 `AImyhome-agent`(FastAPI + LangGraph 工具调用循环),博客 `agent.post.ts` 改为薄壳转发(SSE 契约保持 OpenAI 格式,前端解析零改动,仅新增来源展示)。pgvector 部署在新购腾讯云服务器(Docker),开发期本机经 SSH 隧道直连。

**Tech Stack:** Python 3.12 + uv、FastAPI、LangGraph(经典工具调用循环)、langchain-openai、httpx、psycopg 3、pgvector(HNSW 索引)、pytest;博客侧 Nuxt 3。

**设计依据:** 完整方案与决策记录见本仓库 `docs/superpowers/specs/2026-09-08-ai-agent-upgrade-design.md`(定稿,2026-09-25 从 AImyhome 仓库收编)。本计划比 spec 更精确的两处:**embedding 方案 A 双写+自动降级**(主豆包 doubao-embedding-vision 1024 维 / 降级智谱 embedding-3 2048 维,一表一模型,故障才降级、空结果不降级);**pgvector 开发期直接连新购服务器的 Docker**(SSH 隧道)。

## Global Constraints

- **博客 API 契约不变**:URL 路径不变;SSE 保持 OpenAI 格式(`data: {"choices":[{"delta":{"content":"..."}}]}` / `data: [DONE]`),前端现有解析零改动,新增 `event: sources` 块(老解析器天然跳过,向后兼容)
- **博客只改 4 个文件**:`server/api/agent.post.ts`(转发)、`types/chat.ts`、`components/agent/ChatPanel.vue`、`components/agent/ChatMessage.vue`(来源展示)。其余博客代码(含 llm.ts / models.get.ts)不动
- **旧项目 pipeline-platform-server 冻结**,只读参考,绝不修改;2G pipeline 生产机完全不动
- **新服务器**:腾讯云轻量 4核4G3M,Agent + pgvector + (M4) MinerU 同机;密码等敏感值不入 git(.env 在 .gitignore 内)
- **一库一模型**:每张 chunks 表绑定唯一 embedding 模型;换模型 = 改配置 + `--reset` 全量重灌
- **知识源只收 profile.md**(用户整理的真实简历);博客假文章不收录
- **工作偏好**:中文沟通;每个 Task 开始前用户确认;每个 Task 完成后更新文档并随代码一起提交
- **教学式执行**:用户是 Agent/Python 开发小白(8 年 Vue 前端),每步附「理解要点」,代码中文注释、语法从简,用户确认理解再进下一步

---

## 文件结构(本计划全部产出)

```
f:\AIproject\AImyhome-agent\            ← 新建的独立 Python 项目
├── .env.example          # 配置样例(真 .env 不入 git)
├── .gitignore
├── pyproject.toml        # uv 项目清单:依赖 + pytest 配置
├── README.md             # 项目说明,每个 Task 完成后更新
├── profile.md            # Task 3 用户整理的简历(知识源)
├── app/
│   ├── __init__.py
│   ├── config.py         # 全局配置(.env 读入,入库/检索共用同一份 = 防呆)
│   ├── chunking.py       # Markdown 按 ## 标题切片
│   ├── embeddings.py     # embedding 注册表(豆包/智谱)+ 裸调 API
│   ├── kb.py             # PgVectorKB:建表/入库/检索(含自动降级)—— 换库只换这个类
│   ├── llm.py            # 对话 LLM 注册表(豆包默认/智谱兜底)
│   ├── tools.py          # 工具层:search_profile(M2 把它包装成 MCP 工具)
│   ├── graph.py          # LangGraph 图:agent 节点 + call_tools 节点 + 条件边
│   └── main.py           # FastAPI 入口:/health + /api/agent(SSE)
├── scripts/
│   ├── ingest.py         # 入库脚本:切片 → 双写 embedding → 两表(--reset 清库重灌)
│   ├── embed_check.py    # 手动验证两个 embedding API
│   └── search_check.py   # 手动验证检索(真库真 API)
└── tests/
    ├── test_chunking.py
    ├── test_embeddings.py
    ├── test_kb.py        # 降级逻辑(monkeypatch,不连真库)
    ├── test_graph.py     # 假 LLM 驱动整张图
    └── test_api.py       # /health + 参数校验 + SSE 格式化

f:\AIproject\AImyhome\                    ← 博客(只动 4 个文件)
├── server/api/agent.post.ts              # Task 7:改为转发
├── types/chat.ts                         # Task 8:加 SourceItem
├── components/agent/ChatPanel.vue        # Task 8:解析 sources 事件
└── components/agent/ChatMessage.vue      # Task 8:渲染来源
```

---

## Task 1: 环境准备(买服务器 + Python 3.12 + uv + SSH 隧道)

**理解要点:** 为什么开发期就连服务器?—— 本机是 Windows LTSC 2019,装 Docker Desktop 基本不可行,而生产本来就要在服务器跑 pgvector,干脆一步到位:开发期 SSH 隧道连服务器的库,部署期(M1.7)同一台机器直接 localhost 连。SSH 隧道 = 把服务器的 5432 端口「搬」到本机 5433,本机代码无感知。

**产出/验证:** 本机能用 Python 连上服务器里的 agent_rag 库。

- [ ] **Step 1: 下单服务器(已下单则跳过)**
  腾讯云轻量应用服务器:**4核4G3M**,地域就近(广州/上海),系统镜像 **Ubuntu 22.04 或 24.04**。记下公网 IP。

- [ ] **Step 2: 本机装 Python 3.12(和现有 3.8 并存,不冲突)**
  python.org → Downloads → Windows → 选 **3.12.x** 安装器。安装时**勾选 Add Python to PATH**。
  验证(新开终端):
  ```bash
  py -3.12 --version    # 期望:Python 3.12.x
  ```

- [ ] **Step 3: 本机装 uv(Python 的包管理器,一条命令管依赖/环境)**
  ```powershell
  powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```
  验证:
  ```bash
  uv --version
  ```

- [ ] **Step 4: 服务器装 Docker + 加 2G swap**
  SSH 登录服务器后执行(pipeline 的 deployment.md 同款,阿里云镜像源):
  ```bash
  # swap(4G 机也加,兜底高峰内存)
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

  # Docker(阿里云镜像)
  curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt update && apt install -y docker-ce
  ```

- [ ] **Step 5: 服务器起 pgvector 容器(只监听 127.0.0.1,不暴露公网)**
  ```bash
  docker run -d --name pgvector --restart always \
    -e POSTGRES_PASSWORD=agent_dev_2026 \
    -p 127.0.0.1:5432:5432 \
    -v pgvector-data:/var/lib/postgresql/data \
    pgvector/pgvector:pg17

  # 建业务用户和库
  docker exec -it pgvector psql -U postgres -c "CREATE USER agent WITH PASSWORD 'agent_dev_2026';"
  docker exec -it pgvector psql -U postgres -c "CREATE DATABASE agent_rag OWNER agent;"
  ```

- [ ] **Step 6: 本机配 SSH 免密 + 隧道**
  ```bash
  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_agent -N "" -C "agent-dev"
  ssh-copy-id -i ~/.ssh/id_ed25519_agent ubuntu@<服务器IP>     # 输入服务器密码一次
  # 隧道:开一个终端保持(断了重跑这条即可)
  ssh -fN -i ~/.ssh/id_ed25519_agent -L 5433:127.0.0.1:5432 ubuntu@<服务器IP>
  ```

- [ ] **Step 7: 验证连通**
  ```bash
  uv run --with psycopg python -c "import psycopg; psycopg.connect('postgresql://agent:agent_dev_2026@127.0.0.1:5433/agent_rag'); print('连接 OK')"
  ```
  期望输出:`连接 OK`(注意:uv 会先建一个临时环境,几秒后运行)

---

## Task 2: 项目骨架(uv 初始化 + FastAPI hello)

**理解要点:** `pyproject.toml` = Python 项目的「package.json + tsconfig」,声明依赖和工具配置;`uv sync` = 按它建虚拟环境(.venv,类似 node_modules)并装依赖;`.env` 放密钥和配置,永远不进 git。分层:`app/` 业务代码、`scripts/` 手动脚本、`tests/` 测试 —— 和 NestJS 的模块分层同一种思想。

**Files:** 创建 `f:\AIproject\AImyhome-agent\` 下 pyproject.toml、.gitignore、.env.example、app/\_\_init\_\_.py、app/config.py、app/main.py、tests/test_api.py

- [ ] **Step 1: 初始化 + 写项目文件**

```bash
cd f:\AIproject
uv init aimyhome-agent        # 生成骨架
cd aimyhome-agent
rm main.py                    # 删掉 uv 生成的演示文件,我们用自己的 app/ 结构
mkdir -p app tests scripts
```

`pyproject.toml`(整文件覆盖,解释见注释):
```toml
[project]
name = "aimyhome-agent"
version = "0.1.0"
description = "熊仔 AI Agent —— AImyhome 博客的智能助手服务(LangGraph + RAG + MCP)"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",          # Web 框架(你熟 Express,Nest 的底层——概念一一对应)
    "uvicorn[standard]>=0.34", # ASGI 服务器(相当于 node 的服务器运行时)
    "langgraph>=1.0",          # Agent 编排框架(本项目核心学习对象)
    "langchain-openai>=0.3",   # 让 langchain 能用 OpenAI 兼容接口(豆包/智谱都兼容)
    "httpx>=0.28",             # HTTP 客户端(相当于 axios),embedding 裸调用它
    "psycopg[binary]>=3.2",    # PostgreSQL 驱动(相当于 mysql2)
    "pydantic-settings>=2.6",  # 配置管理(读 .env)
]

[dependency-groups]
dev = [
    "pytest>=8.3",             # 测试框架(相当于 vitest/jest)
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

`.gitignore`:
```
.venv/
__pycache__/
.env
*.pyc
.pytest_cache/
```

`.env.example`(真 .env 照抄后填 key):
```
# 对话 LLM key(和博客共用同一套环境变量名)
DOUBAO_API_KEY=
LLM_API_KEY=

# embedding 双写(方案 A):主豆包,降级智谱 —— 名字必须存在于 embeddings.py 注册表
AGENT_EMBED_PRIMARY=doubao
AGENT_EMBED_FALLBACK=zhipu

# pgvector:开发期走 SSH 隧道(本机 5433 → 服务器 5432)
AGENT_DATABASE_URL=postgresql://agent:agent_dev_2026@127.0.0.1:5433/agent_rag

# 检索参数
AGENT_TOP_K=4
AGENT_SCORE_THRESHOLD=0.3

# 默认对话模型(doubao | glm)
AGENT_DEFAULT_LLM=doubao
```

`app/__init__.py`(空文件,标记 app 是一个 Python 包):
```python
"""AImyhome-agent 业务包。"""
```

复制一份真配置并填 key(后面 Task 4 要用):
```bash
cp .env.example .env   # Windows 直接复制文件重命名为 .env
# 编辑 .env:DOUBAO_API_KEY / LLM_API_KEY 填博客在用的那两个 key(火山方舟、智谱)
```

- [ ] **Step 2: 写失败的测试(先写测试再写实现 = TDD)**

`tests/test_api.py`:
```python
"""API 冒烟测试。"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `uv run pytest`
Expected: FAIL —— `ModuleNotFoundError: No module named 'app.main'`(实现还不存在)

- [ ] **Step 4: 写最小实现**

`app/config.py`:
```python
"""全局配置:从 .env 读入,入库和检索共用同一份(防呆:两边模型永远一致)。"""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 对话 LLM 的 key。注意:这两个字段用 alias 直接读 DOUBAO_API_KEY / LLM_API_KEY,
    # 不加 AGENT_ 前缀 —— 因为要和博客复用同一套环境变量
    doubao_api_key: str = Field(default="", validation_alias="DOUBAO_API_KEY")
    llm_api_key: str = Field(default="", validation_alias="LLM_API_KEY")

    # embedding 双写:主/降级提供方,名字必须存在于 embeddings.py 的注册表
    embed_primary: str = "doubao"
    embed_fallback: str = "zhipu"

    # pgvector 连接串
    database_url: str = "postgresql://agent:agent_dev_2026@127.0.0.1:5433/agent_rag"

    # 检索参数
    top_k: int = 4
    score_threshold: float = 0.3

    # 默认对话模型
    default_llm: str = "doubao"

    # AGENT_ 前缀:上面的 embed_primary 实际读 AGENT_EMBED_PRIMARY
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AGENT_", extra="ignore")


settings = Settings()
```

`app/main.py`:
```python
"""AImyhome-agent HTTP 服务入口。"""
from fastapi import FastAPI

app = FastAPI(title="AImyhome Agent", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: 跑测试,确认通过**

Run: `uv run pytest`
Expected: PASS(1 passed)

- [ ] **Step 6: 手动启动冒烟**

```bash
uv run uvicorn app.main:app --reload --port 8000
```
浏览器开 `http://127.0.0.1:8000/health`,期望看到 `{"status":"ok"}`。Ctrl+C 停掉。

- [ ] **Step 7: 提交**

```bash
cd f:\AIproject\AImyhome-agent
git init
git add .
git commit -m "feat: 初始化 FastAPI 骨架(uv 管理,含 /health 与首个测试)"
```

- [ ] **Step 8: 更新文档**

README.md 写「项目是什么 + 怎么跑(uv sync / uv run uvicorn / uv run pytest)+ 当前进度(Task 2 完成)」,随 Task 7 的 commit 一起提交(或现在单独 commit 一次)。

**新手提示:** `uv run xxx` 会自动使用 .venv 里的环境执行 xxx,不需要手动「激活」环境 —— 这就是选 uv 的原因之一。

---

## Task 3: profile.md(用户整理简历,唯一知识源)

**理解要点:** RAG 的「G」是检索,但检索的前提是**内容质量**。内容你自己掌控:真实、分节、有细节,访客问得出、Agent 答得准。以后想加资料(新技能、新项目)就编辑这个文件重跑入库。

**产出/验证:** profile.md 符合验收标准。

- [ ] **Step 1: 在 `f:\AIproject\AImyhome-agent\profile.md` 写简历**(照模板)

```markdown
# 熊仔(刘俊雄)个人资料

## 基本信息
(坐标 / 一句话介绍 / 联系方式想公开的)

## 技术栈
(前端:Vue 2/3、React、TypeScript、可视化…;后端:Node/Nest…;工程化…)

## 工作经历
### XX 公司(20XX - 20XX)
(职责 / 亮点项目 / 技术栈 / 成果,尽量带数据)

## 项目经历
### 项目名
(背景 / 你的角色 / 技术方案 / 成果)

## 教育背景
(...)

## 其他
(开源 / 博客 / 证书 / 兴趣,想展示给访客的都行)
```

- [ ] **Step 2: 按验收标准自查**
  - 至少 5 个 `##` 二级标题(切片按它切)
  - 每个 `##` 下正文 ≥ 50 字(太短会被并入上一节)
  - 总字数 ≥ 500
  - 无手机号/身份证/住址等敏感信息
  - 全部真实(面试作品,禁编造;博客文章是假示例,不收录)

- [ ] **Step 3: 提交**
  ```bash
  cd f:\AIproject\AImyhome-agent
  git add profile.md
  git commit -m "docs: 添加个人资料 profile.md(知识源)"
  ```

---

## Task 4: 切片 + embedding 注册表

**理解要点:** 为什么切片?—— 把简历整份塞给 LLM 浪费 token 且难命中;切成「一段一个主题」的小块,检索时只取最相关的 top-k 块,省钱又精准。为什么裸调 httpx 而不用 langchain 的 embedding 封装?—— 智谱 + langchain 组合有「返回零向量」的已知坑,裸调 20 行代码,透明可控。维度(dim)是什么?—— 每个模型输出固定长度的向量(豆包 2048 或 2560 个数字,视版本而定;智谱 2048 个数字),建表和校验都按注册表里的 dim 来,是「一表一模型」的防呆落点。

**方案变更(2026-09-17):切片换成 LangChain 标准实现;手写版注释保留在 app/chunking.py 底部。**

| 层 | 生效的(库版本) | 注释保留的(备用 + 加深理解) |
|---|---|---|
| 切片 | LangChain 的 `MarkdownHeaderTextSplitter` + `RecursiveCharacterTextSplitter` 两段式 | 原来的 74 行手写版,整块注释在 `app/chunking.py` 文件底部 |
| embedding | 无。**继续 httpx 裸调不换**(智谱 + langchain 封装有零向量坑,原因见上) | — |

两者接口完全一致(进 `str`,出 `list[Document]`,`metadata["section"]` 是标题路径),需要时解除注释即可切回,下游(入库脚本、检索、SSE 接口)一行都不用改。

**为什么换成标准版**(实测 profile.md:块数 8 → 13):
- 识别 `###` 三级标题 —— 「深圳极联」从糊在 779 字大块里,变成 171 字的独立精准块。检索「极联的工作经历」时命中精度完全不同,**这是实质提升,不是美观问题**
- `###` 标题行从正文提升到 metadata,不再白占字数
- `chunk_overlap` 免费拿到重叠,超长块被切断处自动保护(实测块 8→9 重叠 72 字)
- 产出标准 `Document`,以后接 PGVector / rerank / ParentDocumentRetriever 零转换

**手写时踩到的两个坑**(标准库版不会遇到,但面试能讲):H1 大标题变空块、无标点超长句切不动。

**方案变更(2026-09-23):豆包 embedding 换成 `doubao-embedding-vision-251215`,接口形状也从标准换成多模态。**

火山方舟的 `doubao-embedding-large` 即将下线,官方首推多模态版 `doubao-embedding-vision`。**赶在建表入库之前切换,零迁移成本。**

| 项 | 原 | 新 |
|---|---|---|
| 模型 | `doubao-embedding-large` | `doubao-embedding-vision-251215`(绑在推理接入点上,`.env` 填 `ep-xxx`) |
| 接口路径 | `POST /api/v3/embeddings` | `POST /api/v3/embeddings/multimodal` |
| `input` 形状 | `["文本1","文本2"]` | `[{"type":"text","text":"文本1"}]` |
| 返回形状 | `data` 是数组,每条带 `index` | `data` 是对象,`data.embedding` 就是那条向量 |
| 批量能力 | 一批进、一批出 | **没有**,一次一个向量,只能循环 |
| 维度 | 1024 | 1024(请求里 `dimensions` 参数显式指定) |

**实测结论(2026-09-23,真调接入点 `ep-20260923021617-g9dbh`):**

1. 用 EP 打 `/embeddings` → 400:`the requested model doubao-embedding-vision-251215 does not support this api`。
   **这个报错的含义要读懂**:模型名是对的,是接口不对 —— 换模型时先怀疑接口形状,别怀疑配置。
2. 改打 `/embeddings/multimodal` → 200,确认 `data` 是对象不是数组。
3. 传 `"dimensions": 1024` → 精确返回 1024 维。**所以维度既不用猜也不用测,是我们主动指定的**(该模型支持 1024 / 2048,默认 2048)。

**代码上的对应改动**:`EmbeddingProvider` 增加 `api_style` 字段区分两种形状(智谱仍是标准 OpenAI 形状),`embed()` 按形状分 `_embed_openai` / `_embed_ark_multimodal` 两条路。注册表的 `dim` 与请求里的 `dimensions` 同源,永远对得上。

**为什么现在换代价最低**:还没入库,没有历史向量要迁移。Task 5 的建表语句是 `vector({dim})`,dim 从注册表读,**改 dim 不用动建表代码** —— 这正是「一表一模型 + 维度从注册表来」这个设计的价值所在。

**顺带修掉的两个脆弱点:**

1. `tests/test_embeddings.py` 原本把维度写死成 `1024`,一换模型测试就炸。已改成从 `get_provider("doubao").dim` 动态读。
2. **配置项名和文档对不上**(排查上面那个 404 时才发现的):字段名叫 `doubao_embed_model`,环境变量实际是 `AGENT_DOUBAO_EMBED_MODEL`,而 `.env.example` 里写的是 `AGENT_EMBED_DOUBAO_MODEL`。因为 `Settings` 配了 `extra="ignore"`,写错的名字被**静默忽略**,最终表现为一个和配置毫无关系的 API 404。已把字段改名为 `embed_doubao_model`(与 `embed_primary` / `embed_fallback` 成组),并新增 `tests/test_config_env_example.py`:扫 `.env.example` 里所有变量名,验证 `Settings` 真的会读 —— 这类坑以后不会再犯。

**Files:** 创建 app/chunking.py(标准实现生效 + 手写实现注释保留)、app/embeddings.py、scripts/embed_check.py、tests/test_chunking.py、tests/test_embeddings.py

- [ ] **Step 1: 写失败的测试**

`tests/test_chunking.py`(实际写好的版本;断言用 `metadata["section"]`,样本文本要够长以免触发短块合并):
```python
"""标准切片实现(LangChain 两段式)的测试。"""
from app.chunking import chunk_markdown


def test_split_by_headings():
    """按 ## 标题切成独立的块。正文要超过 50 字,避免触发短节合并。"""
    text = (
        "## 简介\n" + "刘俊雄是一名前端工程师,专注 Vue 和 Node 全栈开发。" * 4 + "\n"
        "## 工作经历\n" + "在某公司负责 Vue 项目开发,参与架构设计与优化。" * 4
    )
    chunks = chunk_markdown(text)
    assert len(chunks) == 2
    assert chunks[0].metadata["section"] == "简介"
    assert chunks[1].metadata["section"] == "工作经历"


def test_headers_do_not_leak_into_content():
    """标题行只留在 metadata,不能进正文 —— 否则每块开头都重复一遍标题。"""
    text = "## 简介\n" + "刘俊雄是一名前端工程师。" * 6
    chunks = chunk_markdown(text)
    assert all(not c.page_content.startswith("##") for c in chunks)


def test_three_level_heading_lands_in_section():
    """### 三级标题也要被识别(手写版只认 ##,这是标准版的提升)。"""
    text = (
        "## 项目经历\n"
        "### 实时数据管道平台\n" + "负责后端 NestJS 迁移,完成 14 个模块。" * 6
    )
    chunks = chunk_markdown(text)
    assert len(chunks) == 1
    assert "实时数据管道平台" in chunks[0].metadata["section"]


def test_long_section_is_cut():
    """超长节必须切成多块,每块不超过上限。"""
    text = "## 项目\n" + "做了一个很长的项目。" * 90
    chunks = chunk_markdown(text)
    assert len(chunks) > 1
    assert all(len(c.page_content) <= 800 for c in chunks)


def test_overlap_between_adjacent_chunks():
    """相邻块必须有重叠:后一块的开头应该能在前一块里找到。

    这是手写版没有、标准版靠 chunk_overlap 参数免费拿到的能力。
    作用:答案刚好横跨两块边界时,不会两块各自都不完整。
    """
    text = "## 项目\n" + "".join(f"这是第{i}句,写长一点好触发切分。" for i in range(80))
    chunks = chunk_markdown(text)
    assert len(chunks) >= 2
    assert chunks[1].page_content[:50] in chunks[0].page_content


def test_oversized_sentence_without_delimiters_is_cut():
    """没有标点分隔的超长单句(兜底路径)也必须切块,不能整块超限。"""
    text = "## 项目\n" + "长" * 900
    chunks = chunk_markdown(text)
    assert len(chunks) > 1
    assert all(len(c.page_content) <= 800 for c in chunks)


def test_tiny_section_merges_into_previous():
    """过短的小节并进上一块,避免碎片化。"""
    text = (
        "## 简介\n刘俊雄,八年前端工程师,专注 Vue 和 Node 全栈开发。\n"
        "## 一句话\n喜欢写代码。"
    )
    chunks = chunk_markdown(text)
    assert len(chunks) == 1
    assert "喜欢写代码" in chunks[0].page_content
```

`tests/test_embeddings.py`:
```python
"""embedding 调用测试(monkeypatch 假响应,不真打 API)。"""
import httpx
import pytest

from app import embeddings


class FakeResponse:
    """httpx.post 的替身。"""
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_embed_orders_by_index(monkeypatch):
    """返回向量必须按 index 排序,和输入顺序一一对应。"""
    monkeypatch.setattr(embeddings.settings, "doubao_api_key", "test-key")
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return FakeResponse({"data": [
            {"index": 1, "embedding": [0.2] * 1024},
            {"index": 0, "embedding": [0.1] * 1024},
        ]})

    monkeypatch.setattr(httpx, "post", fake_post)

    result = embeddings.embed("doubao", ["甲", "乙"])
    assert result[0] == [0.1] * 1024
    assert result[1] == [0.2] * 1024
    assert captured["url"].endswith("/embeddings")


def test_embed_dim_mismatch_raises(monkeypatch):
    """实际维度与注册表不一致必须报错(防呆:配置错了当场发现)。"""
    monkeypatch.setattr(embeddings.settings, "doubao_api_key", "test-key")
    monkeypatch.setattr(
        httpx, "post",
        lambda *a, **k: FakeResponse({"data": [{"index": 0, "embedding": [0.1] * 100}]}),
    )
    with pytest.raises(RuntimeError):
        embeddings.embed("doubao", ["甲"])


def test_unknown_provider_raises():
    """未注册的提供方直接报错。"""
    with pytest.raises(ValueError):
        embeddings.get_provider("nope")
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `uv run pytest`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

`app/chunking.py`(标准实现;手写实现的完整代码注释在文件底部,此处不重复贴):
```python
"""Markdown 切片(标准实现:LangChain 两段式)。"""
from langchain_core.documents import Document
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

CHUNK_SIZE = 800        # 单块字符上限
CHUNK_OVERLAP = 100     # 相邻块重叠字符数(经验值:chunk_size 的 10%~20%)
MIN_CHUNK_CHARS = 50    # 低于此长度的块并入上一块

HEADERS_TO_SPLIT_ON = [("#", "h1"), ("##", "h2"), ("###", "h3")]

# 中文标点必须自己加 —— LangChain 默认只有 ["\n\n", "\n", " ", ""],会用中文句子乱切
SEPARATORS = ["\n\n", "\n", "。", "!", "?", ";", ",", " ", ""]


def _section_label(metadata: dict) -> str:
    """取出用于展示/入库的 section 名:优先最深的标题层级,退化到 h1。"""
    parts = [metadata[k] for k in ("h2", "h3") if metadata.get(k)]
    return " / ".join(parts) if parts else metadata.get("h1", "")


def _merge_short(chunks: list[Document]) -> list[Document]:
    """过短的块并进上一块,标题用 " / " 连起来。标准版没有这一步,是我们补的。"""
    result: list[Document] = []
    for ch in chunks:
        content = ch.page_content.strip()
        if not content:
            continue                      # 标题下面没内容的空节直接丢
        label = _section_label(ch.metadata)
        if len(content) <= MIN_CHUNK_CHARS and result:
            prev = result[-1]
            result[-1] = Document(
                page_content=f"{prev.page_content}\n{content}",
                metadata={
                    **prev.metadata,
                    "section": f"{prev.metadata.get('section', '')} / {label}",
                },
            )
            continue
        result.append(
            Document(page_content=content, metadata={**ch.metadata, "section": label})
        )
    return result


def chunk_markdown(text: str) -> list[Document]:
    """把 Markdown 切成 list[Document]。"""
    sections = MarkdownHeaderTextSplitter(
        headers_to_split_on=HEADERS_TO_SPLIT_ON,
    ).split_text(text)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=SEPARATORS,
    )
    return _merge_short(splitter.split_documents(sections))
```

`app/embeddings.py`:
```python
"""Embedding 注册表 + 裸调 API(方案 A 双写的基础)。

设计要点:
- 每个提供方声明自己的维度(dim),建表和校验都用它 —— 一表一模型
- 用 httpx 裸调,不用 langchain 的 OpenAIEmbeddings 封装(智谱 + langchain 有零向量坑)
- 换模型 = 改 .env 里的 AGENT_EMBED_* + 重跑入库脚本
"""
from dataclasses import dataclass

import httpx

from app.config import settings


@dataclass(frozen=True)
class EmbeddingProvider:
    name: str      # 注册名,配置里用它
    base_url: str  # 接口根地址(不含具体路径)
    model: str     # 模型名,或火山方舟的接入点 ID(ep-xxx)
    dim: int       # 向量维度:建表/校验都用它
    api_key: str
    api_style: str = API_OPENAI  # 接口形状:默认标准 OpenAI,豆包声明为多模态


def get_provider(name: str) -> EmbeddingProvider:
    """从注册表取提供方;未配 key 当场报错(启动即发现,而不是请求时才炸)。"""
    providers = {
        "doubao": EmbeddingProvider(
            name="doubao",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            model=settings.embed_doubao_model,  # 火山方舟接入点 ID(ep-xxx),填在 .env
            dim=1024,
            api_key=settings.doubao_api_key,
            api_style=API_ARK_MULTIMODAL,
        ),
        "zhipu": EmbeddingProvider(
            name="zhipu",
            base_url="https://open.bigmodel.cn/api/paas/v4",
            model="embedding-3",
            dim=2048,
            api_key=settings.llm_api_key,
        ),
    }
    p = providers.get(name)
    if p is None:
        raise ValueError(f"未知 embedding 提供方: {name}")
    if not p.api_key:
        raise RuntimeError(f"embedding 提供方 {name} 未配置 API key")
    return p


def embed(name: str, texts: list[str]) -> list[list[float]]:
    """把一批文本变成向量,返回与输入同序的向量列表。"""
    p = get_provider(name)
    resp = httpx.post(
        f"{p.base_url}/embeddings",
        headers={"Authorization": f"Bearer {p.api_key}"},
        json={"model": p.model, "input": texts},
        timeout=10.0,
    )
    resp.raise_for_status()
    data = resp.json()
    vectors = sorted(data["data"], key=lambda item: item["index"])
    result = [item["embedding"] for item in vectors]
    if result and len(result[0]) != p.dim:
        raise RuntimeError(f"提供方 {name} 返回维度 {len(result[0])},与注册表 {p.dim} 不一致")
    return result
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `uv run pytest`
Expected: PASS(6 passed)

- [ ] **Step 5: 真 API 手动验证(单测不碰真 API,这里验证 key/模型名可用)**

`scripts/embed_check.py`:
```python
"""手动验证两个 embedding 提供方(真打 API)。

用法: uv run python scripts/embed_check.py
"""
from app.embeddings import embed

for name in ("doubao", "zhipu"):
    try:
        vec = embed(name, ["熊仔是一名前端工程师"])
        print(f"[{name}] OK,维度={len(vec[0])}")
    except Exception as e:  # 手动脚本:直接把原因打出来
        print(f"[{name}] FAIL: {e}")
```

先确认本机 `.env` 已从 .env.example 复制并填好两个 key,然后:
```bash
uv run python scripts/embed_check.py
```
Expected:`[doubao] OK,维度=1024` 和 `[zhipu] OK,维度=2048`
(豆包必须用火山方舟的推理接入点 ID(ep-xxx),填在 `.env` 的 `AGENT_EMBED_DOUBAO_MODEL`;接入点绑 `doubao-embedding-vision-251215`,走多模态接口 —— 详见上方 2026-09-23 方案变更。)

- [ ] **Step 6: 提交**
```bash
git add app/chunking.py app/embeddings.py scripts/embed_check.py tests/test_chunking.py tests/test_embeddings.py
git commit -m "feat: 切片与 embedding 注册表(双写基础,裸调 API + 维度防呆)"
```

- [ ] **Step 7: 更新 README**(新增「当前进度:Task 4 完成,切片 + 双 embedding 验证通过」)

---

## Task 5: pgvector 双表 + 入库脚本 + 检索(含自动降级)

**理解要点:** pgvector 是 PostgreSQL 的扩展,一张普通表加一列 `vector(1024)` 就变向量库;`<=>` 运算符算余弦距离(越小越像),所以 `1 - (embedding <=> ?)` 是相关度分数;HNSW 是近似最近邻索引,几千行数据毫秒级。**降级语义**(面试会问):只有「故障」(超时/限流/网络/维度异常)才切换备库;「查不到内容」是正常结果,不降级 —— 分清这两者是这个设计的核心。

**Files:** 创建 app/kb.py、scripts/ingest.py、scripts/search_check.py、tests/test_kb.py

- [ ] **Step 1: 写失败的测试**

`tests/test_kb.py`:
```python
"""检索降级逻辑测试(monkeypatch 掉网络和数据库,纯逻辑验证)。"""
import pytest

from app.kb import PgVectorKB, SearchError, SourceRef


@pytest.fixture
def kb():
    # dsn 是假的:search 里的网络/库操作都会被 monkeypatch 掉,不会真连
    return PgVectorKB(dsn="postgresql://fake:fake@127.0.0.1:1/fake")


def test_search_primary_success_no_fallback(kb, monkeypatch):
    """主提供方正常:只用主,不碰备。"""
    calls: list[str] = []

    def fake_embed(name, texts):
        calls.append(name)
        return [[0.1, 0.2]]

    monkeypatch.setattr("app.kb.embed", fake_embed)
    monkeypatch.setattr(kb, "_query", lambda name, vec, top_k: [SourceRef("内容", "节", "profile.md", 0.9)])

    refs = kb.search("熊仔做过什么")
    assert calls == ["doubao"]
    assert refs[0].score == 0.9


def test_search_falls_back_on_primary_failure(kb, monkeypatch):
    """主提供方故障(超时) → 自动降级到备。"""
    calls: list[str] = []

    def fake_embed(name, texts):
        calls.append(name)
        if name == "doubao":
            raise TimeoutError("busy")
        return [[0.1, 0.2]]

    monkeypatch.setattr("app.kb.embed", fake_embed)
    monkeypatch.setattr(kb, "_query", lambda name, vec, top_k: [SourceRef("内容", "节", "profile.md", 0.8)])

    refs = kb.search("熊仔做过什么")
    assert calls == ["doubao", "zhipu"]
    assert len(refs) == 1


def test_search_empty_result_does_not_fall_back(kb, monkeypatch):
    """空结果 = 正常返回,不是故障,不降级。"""
    calls: list[str] = []

    def fake_embed(name, texts):
        calls.append(name)
        return [[0.1, 0.2]]

    monkeypatch.setattr("app.kb.embed", fake_embed)
    monkeypatch.setattr(kb, "_query", lambda name, vec, top_k: [])

    assert kb.search("xyz") == []
    assert calls == ["doubao"]


def test_search_all_providers_down_raises(kb, monkeypatch):
    """两个提供方都挂:抛 SearchError,上层统一处理。"""
    def fake_embed(name, texts):
        raise TimeoutError("busy")

    monkeypatch.setattr("app.kb.embed", fake_embed)
    with pytest.raises(SearchError):
        kb.search("熊仔")
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `uv run pytest`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

`app/kb.py`:
```python
"""知识库:pgvector 建表 / 入库 / 检索(含双写降级)。

方案 A 双写:
- 同一份文本用两个 embedding 模型各算一份向量,存两张表(一表一模型)
- 检索优先主提供方;主提供方故障(超时/限流/网络)自动降级到备
- 「查不到内容」不算故障:空结果直接返回,不降级

换库 = 换掉这个类,调用方(tools/graph)不用动 —— 这就是「检索接口抽象」。
"""
import logging
from dataclasses import dataclass

import psycopg

from app.config import settings
from app.embeddings import embed, get_provider

logger = logging.getLogger(__name__)


@dataclass
class SourceRef:
    """一条检索命中:content 正文 / section 标题 / source 文件 / score 相关度。"""
    content: str
    section: str
    source: str
    score: float


class SearchError(Exception):
    """所有 embedding 提供方都不可用。"""


class PgVectorKB:
    def __init__(self, dsn: str | None = None):
        self.dsn = dsn or settings.database_url

    # ── 连接(每次短连接:个人项目够用,也避开长连接断线的复杂度)──
    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.dsn, autocommit=True)

    # ── 表结构:一张表对应一个模型,维度取自注册表 ──
    @staticmethod
    def _table_name(provider: str) -> str:
        return f"chunks_{provider}"

    def ensure_tables(self, providers: list[str]) -> None:
        with self._connect() as conn:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            for name in providers:
                dim = get_provider(name).dim
                table = self._table_name(name)
                conn.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id bigserial PRIMARY KEY,
                        content text NOT NULL,
                        section text NOT NULL DEFAULT '',
                        source text NOT NULL DEFAULT 'profile.md',
                        embedding vector({dim}) NOT NULL
                    )
                """)
                conn.execute(f"""
                    CREATE INDEX IF NOT EXISTS {table}_embedding_idx
                    ON {table} USING hnsw (embedding vector_cosine_ops)
                """)

    def drop_tables(self, providers: list[str]) -> None:
        with self._connect() as conn:
            for name in providers:
                conn.execute(f"DROP TABLE IF EXISTS {self._table_name(name)} CASCADE")

    # ── 入库:切片 → 每提供方各算一份向量 → 各插各表 ──
    def ingest(self, chunks: list, providers: list[str]) -> dict[str, int]:
        counts: dict[str, int] = {}
        with self._connect() as conn:
            for name in providers:
                table = self._table_name(name)
                count = 0
                # 每 32 条一批:智谱单请求上限 64 条,留余量
                for start in range(0, len(chunks), 32):
                    batch = chunks[start:start + 32]
                    vectors = embed(name, [c.content for c in batch])
                    rows = [
                        (c.content, c.section, "profile.md", str(vec))
                        for c, vec in zip(batch, vectors)
                    ]
                    with conn.cursor() as cur:
                        cur.executemany(
                            f"INSERT INTO {table} (content, section, source, embedding)"
                            " VALUES (%s, %s, %s, %s::vector)",
                            rows,
                        )
                    count += len(rows)
                counts[name] = count
                logger.info("入库完成: %s 表 %d 行", table, count)
        return counts

    # ── 检索 ──
    def _query(self, provider: str, vector: list[float], top_k: int) -> list[SourceRef]:
        """单表检索:余弦距离越小越相似,1-距离 = 相关度。"""
        table = self._table_name(provider)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT content, section, source, 1 - (embedding <=> %s::vector) AS score
                FROM {table}
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (str(vector), str(vector), top_k),
            ).fetchall()
        return [SourceRef(content=r[0], section=r[1], source=r[2], score=float(r[3])) for r in rows]

    def search(self, text: str, top_k: int | None = None,
               providers: list[str] | None = None) -> list[SourceRef]:
        """检索入口:主提供方故障自动降级;空结果不算故障,不降级。"""
        providers = providers or [settings.embed_primary, settings.embed_fallback]
        top_k = top_k or settings.top_k
        last_error: Exception | None = None
        for name in providers:
            try:
                vector = embed(name, [text])[0]
            except Exception as e:  # 超时/限流/网络/维度异常 → 换下一个
                logger.warning("embedding 提供方 %s 故障,尝试下一个: %s", name, e)
                last_error = e
                continue
            refs = self._query(name, vector, top_k)
            return [r for r in refs if r.score >= settings.score_threshold]
        raise SearchError(f"所有 embedding 提供方均不可用: {last_error}")
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `uv run pytest`
Expected: PASS(10 passed)

- [ ] **Step 5: 写入库与检索验证脚本**

`scripts/ingest.py`:
```python
"""入库脚本:profile.md → 切片 → 双写 embedding → 两表。

用法:
  uv run python scripts/ingest.py            # 增量
  uv run python scripts/ingest.py --reset    # 清库重灌(换 embedding 模型后必须用这个)
"""
import argparse
from pathlib import Path

from app.chunking import chunk_markdown
from app.config import settings
from app.kb import PgVectorKB


def main() -> None:
    parser = argparse.ArgumentParser(description="profile.md 切片入库")
    parser.add_argument("--reset", action="store_true", help="先清空两张表再重灌")
    args = parser.parse_args()

    path = Path("profile.md")
    if not path.exists():
        raise SystemExit("找不到 profile.md,请先完成它")

    text = path.read_text(encoding="utf-8")
    chunks = chunk_markdown(text)
    print(f"切片完成: {len(chunks)} 块")

    providers = [settings.embed_primary, settings.embed_fallback]
    kb = PgVectorKB()
    if args.reset:
        kb.drop_tables(providers)
    kb.ensure_tables(providers)
    counts = kb.ingest(chunks, providers)
    print(f"入库完成: {counts}")


if __name__ == "__main__":
    main()
```

`scripts/search_check.py`:
```python
"""手动验证检索:真实走 embedding + pgvector(单测不覆盖的部分)。

用法: uv run python scripts/search_check.py "熊仔做过什么"
"""
import sys

from app.kb import PgVectorKB


def main() -> None:
    query = sys.argv[1] if len(sys.argv) > 1 else "熊仔做过什么"
    refs = PgVectorKB().search(query)
    if not refs:
        print("(未命中)")
        return
    for i, r in enumerate(refs, 1):
        preview = r.content[:120] + ("..." if len(r.content) > 120 else "")
        print(f"--- {i}. [{r.section}] 相关度 {r.score:.2f} ---")
        print(preview)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: 真库验证(需要 SSH 隧道开着 + profile.md 已填)**

```bash
uv run python scripts/ingest.py --reset
uv run python scripts/search_check.py "熊仔做过什么"
```
Expected:切片 20~40 块;检索命中简历里真实段落(如「工作经历」),相关度 ≥ 0.3。

- [ ] **Step 7: 提交**
```bash
git add app/kb.py scripts/ingest.py scripts/search_check.py tests/test_kb.py
git commit -m "feat: pgvector 双写入库与检索(方案 A 自动降级)"
```

- [ ] **Step 8: 更新 README**(当前进度 + 使用说明:如何重灌、如何换模型)

---

## Task 6: LangGraph Agent(经典工具调用循环)

**理解要点**(本项目核心,面试必考):
- **状态(State)**:整张图共享的数据包,这里就是 `messages` + `sources`,跨节点自动累加
- **节点(node)**:一个节点 = 一个函数,做一件事(`agent` 节点调 LLM、`call_tools` 节点执行工具)
- **边(edge)**:节点之间的固定流向
- **条件边(conditional edge)**:按状态动态决定下一步 —— 这里就是「LLM 说要调工具 → 去执行 → 再回到 LLM;没要 → 结束」。这个循环就是「Agent 会思考+会动手」的本质,区别于写死的 if/else 流水线
- `bind_tools`:把工具「说明书」交给 LLM,LLM 决定要不要调、参数填什么(这就是 function calling)

**Files:** 创建 app/llm.py、app/tools.py、app/graph.py、scripts/chat_check.py、tests/test_graph.py

**方案变更(2026-09-17):Agent 循环同样「库版本生效 + 手写注释保留」。**

| 层 | 生效的(库版本) | 注释保留的(备用 + 加深理解) |
|---|---|---|
| Agent 循环 | `langgraph.prebuilt.create_react_agent` —— 一行建出 agent 节点 + ToolNode + tools_condition | 本节 Step 3 里手写的 agent / call_tools / should_continue 三节点图 |

关键点:
- **`create_react_agent` 是官方维护的生产级实现,不是不能用**。签名里有 `state_schema` / `pre_model_hook` / `post_model_hook` / `prompt` / `response_format` / `checkpointer` / `store` 等参数,定制能力比想象中强
- 我们的 `sources`(命中的资料引用)靠 `state_schema` 扩展状态 + 工具返回 `Command` 写进去。**这条具体怎么写,Task 6 执行时先写个最小用例验证**,不要照抄网上的写法
- 手写版整块注释保留在 `app/graph.py` 底部(和切片那边一个套路),需要时解除注释即可切回
- 双写 + 降级检索的逻辑在**工具函数内部**(`app/kb.py`),跟用哪种循环实现无关 —— 这一点要记牢,别把两件事混在一起

> ⚠️ 术语别混:`create_react_agent` 是 **Agent 循环**的东西,和**切片**没有任何关系。切片层的库版本是 LangChain 的两个 splitter(见 Task 4)。

- [ ] **Step 1: 写失败的测试**

`tests/test_graph.py`:
```python
"""LangGraph 图测试:用假 LLM 驱动整张图,不真打 API。"""
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from app.graph import build_graph
from app.kb import SourceRef


class ScriptedLLM(BaseChatModel):
    """假模型:按剧本依次吐消息 —— 第一次带工具调用,第二次给最终答案。"""
    def __init__(self, script: list[AIMessage]):
        super().__init__()
        self.script = script
        self.calls = 0

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs) -> ChatResult:
        msg = self.script[min(self.calls, len(self.script) - 1)]
        self.calls += 1
        return ChatResult(generations=[ChatGeneration(message=msg)])


class FakeKB:
    """假知识库:search 返回固定命中。"""
    def search(self, text, top_k=None, providers=None):
        return [SourceRef(content="在 XX 公司做前端负责人", section="工作经历", source="profile.md", score=0.9)]


def test_tool_calling_loop_collects_sources():
    """完整循环:人 → AI(要调工具)→ 工具结果 → AI(最终答案),来源被收集。"""
    script = [
        AIMessage(
            content="",
            tool_calls=[{"name": "search_profile", "args": {"query": "工作经历"}, "id": "call_1"}],
        ),
        AIMessage(content="熊仔在 XX 公司做过前端负责人。"),
    ]
    graph = build_graph(ScriptedLLM(script), FakeKB())
    result = graph.invoke({"messages": [HumanMessage(content="熊仔做过什么?")]})

    assert len(result["messages"]) == 4
    assert result["messages"][-1].content == "熊仔在 XX 公司做过前端负责人。"
    assert len(result["sources"]) == 1
    assert result["sources"][0].section == "工作经历"


def test_no_tool_call_ends_immediately():
    """闲聊不需要工具:一轮就结束。"""
    script = [AIMessage(content="你好!")]
    graph = build_graph(ScriptedLLM(script), FakeKB())
    result = graph.invoke({"messages": [HumanMessage(content="你好")]})

    assert result["messages"][-1].content == "你好!"
    assert result["sources"] == []
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `uv run pytest`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

`app/llm.py`:
```python
"""对话 LLM 注册表:和博客 llm.ts 同思路 —— 配置驱动,加模型零改动。"""
from langchain_openai import ChatOpenAI

from app.config import settings

DOUBAO_BASE = "https://ark.cn-beijing.volces.com/api/v3"
DOUBAO_MODEL = "doubao-seed-2-0-lite-260215"
ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4"
ZHIPU_MODEL = "glm-4.7-flash"


def get_llm(model_id: str | None = None) -> ChatOpenAI:
    """按 id 取对话模型(白名单);未指定用默认;未知 id 报错。"""
    model_id = model_id or settings.default_llm
    if model_id == "doubao":
        if not settings.doubao_api_key:
            raise RuntimeError("doubao 未配置 API key")
        return ChatOpenAI(
            model=DOUBAO_MODEL,
            api_key=settings.doubao_api_key,
            base_url=DOUBAO_BASE,
            temperature=0.7,
            max_tokens=4096,
            max_retries=2,
            # 豆包特有:关闭 thinking,立即出字(和博客现行为一致)
            model_kwargs={"extra_body": {"thinking": {"type": "disabled"}}},
        )
    if model_id == "glm":
        if not settings.llm_api_key:
            raise RuntimeError("glm 未配置 API key")
        return ChatOpenAI(
            model=ZHIPU_MODEL,
            api_key=settings.llm_api_key,
            base_url=ZHIPU_BASE,
            temperature=0.7,
            max_tokens=4096,
            max_retries=2,
        )
    raise ValueError(f"未知模型: {model_id}")
```

`app/tools.py`:
```python
"""工具层:Agent 的「手」。

M1 只有一个工具 search_profile;以后加能力(如 E1 的 query_stats)
= 这里加一个函数 + graph.py 的 bind_tools 加一条声明,两处改动。
M2 会把同一个函数包装成 MCP 工具 —— 一套能力,多个入口(面试主线)。
"""
from dataclasses import dataclass

from app.kb import PgVectorKB, SourceRef


@dataclass
class SearchResult:
    """检索结果:text 是给 LLM 看的;sources 是给前端展示的引用。"""
    text: str
    sources: list[SourceRef]


def search_profile(kb: PgVectorKB, query: str) -> SearchResult:
    """在熊仔的简历资料中检索与 query 最相关的内容。"""
    refs = kb.search(query)
    if not refs:
        return SearchResult(text="未在简历资料中找到与问题相关的内容。", sources=[])
    lines = [f"【{r.section}】(相关度 {r.score:.2f})\n{r.content}" for r in refs]
    return SearchResult(text="\n\n".join(lines), sources=refs)
```

`app/graph.py`:
```python
"""LangGraph Agent:经典工具调用循环(官方教程同款结构)。

图结构:
    START → agent(LLM + 工具) → 条件边 → 有 tool_calls? → call_tools → 回到 agent
                                          └ 没有 → END

面试必讲:节点 / 边 / 条件边 / 状态;messages 用 add_messages 自动累加。
M3 会加 checkpointer 把这张图的状态存 PG,会话就能跨刷新恢复。
"""
import operator
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AnyMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from app.kb import PgVectorKB, SourceRef
from app.tools import search_profile

SYSTEM_PROMPT = """你是 熊仔 的 AI 助手,负责回答访客关于熊仔(刘俊雄)个人资料的问题。

规则:
1. 当问题涉及熊仔的经历、技能、项目、教育等个人情况时,必须先用 search_profile 工具查资料,再基于资料回答
2. 纯闲聊或技术话题可以不用工具直接回答
3. 答案要专业但不枯燥,像一位有 7 年经验的前端架构师
4. 不知道就说不知道,绝不编造
"""

# 工具声明:给 LLM 看的「说明书」(function calling 协议)
SEARCH_PROFILE_TOOL = {
    "type": "function",
    "function": {
        "name": "search_profile",
        "description": "在熊仔的个人简历资料中检索与问题最相关的内容片段。当访客询问熊仔的经历、技能、项目、教育背景等个人资料问题时必须使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "检索关键词或短语,如「工作经历」「技术栈」"},
            },
            "required": ["query"],
        },
    },
}


class AgentState(TypedDict):
    """图的状态:跨节点传递的唯一「数据包」。"""
    messages: Annotated[list[AnyMessage], operator.add]  # 对话消息,自动累加
    sources: Annotated[list[SourceRef], operator.add]    # 本轮命中的资料引用,自动累加


def build_graph(llm, kb: PgVectorKB):
    """构建并编译图。llm/kb 参数注入:测试传假对象,生产传真对象。"""
    llm_with_tools = llm.bind_tools([SEARCH_PROFILE_TOOL])

    def call_model(state: AgentState) -> dict[str, Any]:
        """agent 节点:把历史消息喂给 LLM。系统提示在这里前置,不进 state。"""
        response = llm_with_tools.invoke(
            [SystemMessage(content=SYSTEM_PROMPT)] + list(state["messages"])
        )
        return {"messages": [response]}

    def should_continue(state: AgentState) -> str:
        """条件边:最后一条消息带工具调用 → 去执行;否则结束。"""
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "call_tools"
        return END

    def call_tools(state: AgentState) -> dict[str, Any]:
        """工具节点:执行 LLM 要调的工具,结果作为 ToolMessage 还给 LLM。"""
        last = state["messages"][-1]
        replies: list[ToolMessage] = []
        sources: list[SourceRef] = []
        for tc in last.tool_calls:
            if tc["name"] == "search_profile":
                result = search_profile(kb, tc["args"]["query"])
                sources.extend(result.sources)
                replies.append(ToolMessage(content=result.text, tool_call_id=tc["id"]))
            else:
                replies.append(ToolMessage(content=f"未知工具: {tc['name']}", tool_call_id=tc["id"]))
        return {"messages": replies, "sources": sources}

    builder = StateGraph(AgentState)
    builder.add_node("agent", call_model)
    builder.add_node("call_tools", call_tools)
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", should_continue, {"call_tools": "call_tools", END: END})
    builder.add_edge("call_tools", "agent")
    return builder.compile()
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `uv run pytest`
Expected: PASS(12 passed)

- [ ] **Step 5: 真 LLM 手动验证(带工具调用的真实对话)**

临时写一个交互脚本 `scripts/chat_check.py`:
```python
"""手动验证:真 LLM + 真库跑一遍完整 Agent 循环(非流式)。

用法: uv run python scripts/chat_check.py "熊仔做过什么"
"""
import sys

from langchain_core.messages import HumanMessage

from app.graph import build_graph
from app.kb import PgVectorKB
from app.llm import get_llm


def main() -> None:
    question = sys.argv[1] if len(sys.argv) > 1 else "熊仔做过什么"
    graph = build_graph(get_llm(), PgVectorKB())
    result = graph.invoke({"messages": [HumanMessage(content=question)]})
    # 打印执行轨迹:哪轮调了工具、最终答案是什么
    for msg in result["messages"]:
        role = "工具" if getattr(msg, "tool_call_id", None) else "AI" if msg.content and not getattr(msg, "tool_calls", None) else "AI(调工具)"
        print(f"[{role}] {str(msg.content)[:200]}")
    print("\n来源:")
    for s in result["sources"]:
        print(f"  - [{s.section}] {s.content[:60]}")


if __name__ == "__main__":
    main()
```

```bash
uv run python scripts/chat_check.py "熊仔做过什么"
```
Expected:能看到「AI(调工具)」→「工具」→「AI」的轨迹,最终答案基于简历真实内容,来源非空。
再试一句闲聊:`uv run python scripts/chat_check.py "你好"` —— 期望一轮结束、无工具调用。

- [ ] **Step 6: 提交**
```bash
git add app/llm.py app/tools.py app/graph.py scripts/chat_check.py tests/test_graph.py
git commit -m "feat: LangGraph 工具调用循环 Agent(检索+回答+来源收集)"
```

- [ ] **Step 7: 更新 README**(画上图的 ASCII 结构,写「面试要点:节点/边/条件边」)

---

## Task 7: FastAPI SSE 接口 + 博客转发

**理解要点:** SSE = 服务器单向推送,格式是「event: 类型」和「data: 内容」成对的行;`astream_events` 是 LangGraph 的流式事件源,每个 token 一个事件,工具节点结束也给一个事件 —— 我们把它翻译成前端认得的格式。**为什么保持 OpenAI 格式?** 前端 ChatPanel 现成的解析代码一行不用改,加新事件(`event: sources`)老解析器会自动跳过(它只看 `data:` 行)—— 这就是向后兼容的协议设计。

**Files:** 修改 app/main.py(SSE)、tests/test_api.py(补 400 校验)、创建 tests/test_sse_format.py;修改博客 server/api/agent.post.ts

- [ ] **Step 1: 写失败的测试**

`tests/test_sse_format.py`:
```python
"""SSE 格式化测试:保证和前端约定的格式分毫不差。"""
import json

from app.kb import SourceRef
from app.main import format_delta, format_sources


def test_format_delta_openai_shape():
    """文本流必须是 OpenAI 格式,前端解析零改动。"""
    out = format_delta("你好")
    assert out.startswith("data: ")
    payload = json.loads(out[6:].strip())
    assert payload["choices"][0]["delta"]["content"] == "你好"


def test_format_sources_event_block():
    """来源用独立事件块,老解析器自动跳过(向后兼容)。"""
    refs = [SourceRef(content="内容", section="工作经历", source="profile.md", score=0.9123)]
    out = format_sources(refs)
    assert out.startswith("event: sources\n")
    payload = json.loads(out.split("data: ", 1)[1].strip())
    assert payload["items"][0]["section"] == "工作经历"
    assert payload["items"][0]["score"] == 0.9123
```

`tests/test_api.py` 追加:
```python
def test_agent_rejects_empty_messages():
    resp = client.post("/api/agent", json={"messages": []})
    assert resp.status_code == 400
```

- [ ] **Step 2: 跑测试,确认失败**

Run: `uv run pytest`
Expected: FAIL(format_delta 不存在)

- [ ] **Step 3: 写实现(整文件覆盖 app/main.py)**

```python
"""AImyhome-agent HTTP 服务入口:FastAPI + SSE。

SSE 契约(和博客前端约定,见 ChatPanel.vue):
- 文本流:  data: {"choices":[{"delta":{"content":"..."}}]}   (OpenAI 格式,前端零改动)
- 来源:    event: sources + data: {"items":[...]}           (前端 Task 8 新增解析;老解析器自动跳过)
- 结束:    data: [DONE]
"""
import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from app.config import settings
from app.graph import build_graph
from app.kb import PgVectorKB
from app.llm import get_llm

app = FastAPI(title="AImyhome Agent", version="0.1.0")


class ChatMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentRequest(BaseModel):
    messages: list[ChatMsg]
    model: str | None = None


# 图按模型缓存:每个模型一个编译好的图,避免每请求重建
kb = PgVectorKB()
_graphs: dict[str, object] = {}


def get_graph(model_id: str | None):
    key = model_id or settings.default_llm
    if key not in _graphs:
        _graphs[key] = build_graph(get_llm(key), kb)
    return _graphs[key]


def format_delta(content: str) -> str:
    """一段文本 → OpenAI 格式的 SSE data 行。"""
    payload = json.dumps({"choices": [{"delta": {"content": content}}]}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def format_sources(sources) -> str:
    """引用列表 → sources 事件块(老解析器自动跳过,向前兼容)。"""
    items = [
        {"content": s.content, "section": s.section, "source": s.source, "score": round(s.score, 4)}
        for s in sources
    ]
    payload = json.dumps({"items": items}, ensure_ascii=False)
    return f"event: sources\ndata: {payload}\n\n"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/agent")
async def agent(req: AgentRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is required")
    graph = get_graph(req.model)
    inputs = {"messages": [HumanMessage(content=m.content) for m in req.messages]}

    async def gen():
        try:
            async for event in graph.astream_events(inputs, version="v2"):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    # LLM 每吐一个 token 就是一个事件;工具调用轮的流是空的,跳过
                    content = event["data"]["chunk"].content
                    if content:
                        yield format_delta(content)
                elif kind == "on_chain_end" and event["name"] == "call_tools":
                    # 工具节点执行完,把命中的资料引用发给前端
                    output = event["data"]["output"]
                    sources = output.get("sources", [])
                    if sources:
                        yield format_sources(sources)
            yield "data: [DONE]\n\n"
        except Exception as e:  # 流已开始,只能以错误块收尾
            payload = json.dumps({"error": {"message": f"生成失败: {e}"}}, ensure_ascii=False)
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 4: 跑测试,确认通过**

Run: `uv run pytest`
Expected: PASS(15 passed)

- [ ] **Step 5: 本机 curl 验证 SSE**

```bash
uv run uvicorn app.main:app --port 8000   # 另开终端
curl -N -X POST http://127.0.0.1:8000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"熊仔做过什么"}]}'
```
Expected:先 `event: sources` 块,再逐 token 的 `data:` 行,最后 `data: [DONE]`。

- [ ] **Step 6: 改博客 agent.post.ts 为转发(整文件覆盖)**

```ts
/**
 * AI Agent API endpoint — 转发到 Python Agent 服务(AImyhome-agent)。
 * Agent 服务负责 RAG 检索 + LangGraph 编排 + 流式输出,博客只做薄壳透传。
 * SSE 契约保持 OpenAI 格式,前端解析零改动。
 */

import { PassThrough } from 'node:stream'
import type { AgentRequest } from '~/types/chat'

export default defineEventHandler(async (event) => {
  const body = await readBody<AgentRequest>(event)

  // Validate
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  // Agent 服务地址:本地开发默认 127.0.0.1:8000,生产在 Vercel 配环境变量
  const agentBase = (process.env.AGENT_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

  let res: Response
  try {
    res = await fetch(`${agentBase}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Agent service unavailable' })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw createError({ statusCode: 502, statusMessage: `Agent error: ${text.slice(0, 200)}` })
  }

  // Bridge web ReadableStream → Node.js PassThrough(和原实现一致)
  const webStream = res.body!
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

注意:`server/utils/llm.ts` 与 `models.get.ts` 不动(模型下拉列表仍由博客侧维护,id 透传给 Agent 服务解析)。

- [ ] **Step 7: 端到端验证(博客 + Agent 双服务)**

```bash
# 终端 1:Agent 服务
cd f:\AIproject\AImyhome-agent && uv run uvicorn app.main:app --port 8000
# 终端 2:博客(按 AImyhome/CLAUDE.md 验证流程)
cd f:\AIproject\AImyhome && npm run dev
```
浏览器开 `http://localhost:3000` 聊天页,问「熊仔做过什么」:
Expected:逐字流式输出、内容基于简历资料、无报错。此时来源还不显示(那是 Task 8)。

- [ ] **Step 8: 提交(两个仓库分别提交)**

```bash
cd f:\AIproject\AImyhome-agent
git add app/main.py tests/test_api.py tests/test_sse_format.py
git commit -m "feat: /api/agent SSE 接口(OpenAI 格式流 + sources 事件)"

cd f:\AIproject\AImyhome
git add server/api/agent.post.ts
git commit -m "feat: /api/agent 改为转发 Python Agent 服务(薄壳)"
```

- [ ] **Step 9: 更新文档**(两个仓库:AImyhome-agent README 进度;AImyhome devlog/YYYY-MM-DD.md 记今日改动)

---

## Task 8: 前端来源展示

**理解要点:** 协议向后兼容的实操 —— SSE 的 `event:` 行被老解析器跳过,新解析器记录它、并把它后面紧跟的 `data:` 行按新格式解读。前端只加展示,不改交互逻辑。相关度分数来自余弦相似度(0~1),乘 100 就是「相关度 90%」。

**Files:** 修改博客 types/chat.ts、components/agent/ChatPanel.vue、components/agent/ChatMessage.vue

- [ ] **Step 1: types/chat.ts 加来源类型**

```ts
/** AI Agent chat message types */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 回答引用的资料来源(RAG 命中,仅 assistant 消息) */
  sources?: SourceItem[]
}

/** RAG 命中来源,由 Agent 服务经 SSE sources 事件下发 */
export interface SourceItem {
  content: string
  section: string
  source: string
  score: number
}

/** Generate unique message ID */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** API request body for /api/agent */
export interface AgentRequest {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  /** Optional model id; server falls back to the first available provider */
  model?: string
}

/** Available LLM model option exposed to the frontend */
export interface LLMModelInfo {
  id: string
  name: string
  description: string
}
```

- [ ] **Step 2: ChatPanel.vue 解析 sources 事件**

改 SSE 解析循环(其余不动),原代码在 `send()` 里:

```ts
    // Parse SSE stream
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = ''   // ← 新增:记录当前 SSE 事件类型

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue // Skip empty lines and SSE comments

        // ← 新增:记录 event: 行,决定后面 data: 行怎么解读
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim()
          continue
        }

        // Extract payload after "data:" prefix (with or without space)
        let data: string
        if (trimmed.startsWith('data:')) {
          data = trimmed.slice(5)  // Remove "data:"
          if (data.startsWith(' ')) data = data.slice(1) // Remove leading space
        } else {
          continue
        }

        if (data === '[DONE]') {
          break
        }

        try {
          const parsed = JSON.parse(data)
          if (currentEvent === 'sources') {
            // ← 新增:来源事件 → 挂到当前 assistant 消息,不追加正文
            messages.value[assistantIndex].sources = parsed.items || []
          } else {
            // 智谱 GLM uses OpenAI-compatible format
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              messages.value[assistantIndex].content += content
              scrollToBottom()
            }
          }
        } catch {
          // Skip unparseable lines (e.g., keepalive comments)
        }
        currentEvent = ''   // ← 新增:事件块结束,重置
      }
    }
```

顶部 import 加类型:
```ts
import type { ChatMessage, LLMModelInfo, SourceItem } from '~/types/chat'
```

- [ ] **Step 3: ChatMessage.vue 渲染来源**

在 assistant 消息的时间戳 `<p class="text-label-sm ...">{{ formattedTime }}</p>` 之前插入:

```html
      <!-- Sources(RAG 命中来源,仅 assistant 消息) -->
      <div v-if="!isUser && message.sources?.length"
        class="mt-2 pt-2 border-t border-brand-border space-y-1">
        <p class="text-label-sm text-on-surface-variant/60">📎 参考资料</p>
        <div
          v-for="(s, i) in message.sources"
          :key="i"
          class="text-label-sm text-on-surface-variant/80 bg-surface-low px-2 py-1 rounded"
        >
          <span class="text-brand-accent">{{ s.source }} · {{ s.section }}</span>
          <span class="text-on-surface-variant/60"> · 相关度 {{ Math.round(s.score * 100) }}%</span>
        </div>
      </div>
```

- [ ] **Step 4: 端到端验证**

双服务起(Task 7 Step 7 同款),问「熊仔做过什么」:
Expected:答案下方出现「📎 参考资料」,列出 `profile.md · 工作经历` 及相关度百分比。
再跑博客构建:`cd f:\AIproject\AImyhome && npm run build` —— 期望 SSR 构建无报错。

- [ ] **Step 5: 提交**

```bash
cd f:\AIproject\AImyhome
git add types/chat.ts components/agent/ChatPanel.vue components/agent/ChatMessage.vue
git commit -m "feat: 聊天答案展示 RAG 来源引用(sources 事件解析)"
```

- [ ] **Step 6: 更新 AImyhome devlog/YYYY-MM-DD.md**

---

## Task 9: 部署上线(服务器 + Nginx + HTTPS)

**理解要点:** 生产与开发的区别就三条:①服务绑定 127.0.0.1(不让外界直连,只经 Nginx);②进程要托管(pm2 守护,崩溃自动拉起);③Nginx 是唯一对外口(HTTPS 证书、`proxy_buffering off` —— SSE 必须关缓冲,否则流式变成一次性吐)。**备案检查**:ai-myhome.space 主域名若此前已备案,新子域 agent.ai-myhome.space 直接解析可用;若只是阿里云备案、服务器在腾讯云,需提交「接入备案」(通常 1~3 个工作日),期间先 IP 直连调试。

**产出/验证:** `https://agent.ai-myhome.space/health` 可访问;线上博客聊天走通。

- [ ] **Step 1: 检查备案状态**
  登录腾讯云控制台 → 备案管理,查 ai-myhome.space 状态:
  - 已在腾讯云备案 → 直接 Step 3
  - 已备案但未接入腾讯云 → 提交接入备案,先做 Step 2~5,等审核过再绑域名
  - 未备案 → 提交首次备案(1~2 周),期间同样先 IP 调试

- [ ] **Step 2: 服务器部署 Agent 服务**
  ```bash
  # 装 Node.js 22(pm2 依赖它)+ uv
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
  npm install -g pm2
  curl -LsSf https://astral.sh/uv/install.sh | sh

  # 拉代码(替换为你的 GitHub 仓库地址)
  git clone https://github.com/<你的账号>/aimyhome-agent.git /opt/aimyhome-agent
  cd /opt/aimyhome-agent
  uv sync

  # 生产 .env:数据库改回本机 127.0.0.1:5432(不再走隧道)
  cp .env.example .env
  # 编辑 .env:AGENT_DATABASE_URL=postgresql://agent:agent_dev_2026@127.0.0.1:5432/agent_rag

  # 入库
  uv run python scripts/ingest.py --reset

  # pm2 托管
  npm install -g pm2
  pm2 start "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000" --name agent-api
  pm2 save
  ```

- [ ] **Step 3: Nginx + HTTPS**
  ```bash
  apt install -y nginx certbot python3-certbot-nginx

  cat > /etc/nginx/sites-available/agent << 'EOF'
  server {
      listen 80;
      server_name agent.ai-myhome.space;

      location / {
          proxy_pass http://127.0.0.1:8000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          # SSE 关键:关缓冲、拉长读超时
          proxy_buffering off;
          proxy_read_timeout 300s;
          proxy_http_version 1.1;
          proxy_set_header Connection '';
      }
  }
  EOF
  ln -sf /etc/nginx/sites-available/agent /etc/nginx/sites-enabled/agent
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl restart nginx
  ```

- [ ] **Step 4: DNS + 证书**
  腾讯云 DNS:新增 A 记录 `agent` → 服务器公网 IP。
  ```bash
  certbot --nginx -d agent.ai-myhome.space
  # 验证自动续期
  certbot renew --dry-run
  ```
  备案未通过前的替代:防火墙放行 8000 端口,直接 `http://<服务器IP>:8000/health` 调试。

- [ ] **Step 5: Vercel 配环境变量**
  Vercel 项目设置 → Environment Variables:`AGENT_BASE_URL=https://agent.ai-myhome.space`,重新部署博客。

- [ ] **Step 6: 公网验证**
  ```bash
  curl https://agent.ai-myhome.space/health          # {"status":"ok"}
  ```
  线上博客聊天页问「熊仔做过什么」→ 流式回答 + 来源展示。✓ 验收点 1 达成。

- [ ] **Step 7: 提交部署文档 + 更新 spec**
  AImyhome-agent 仓库新增 `docs/deployment.md`(把 Step 1~6 的最终命令固化);更新 `AImyhome/docs/2026-09-08-ai-agent-upgrade-design.md` 决策表 #6/#12 为新定稿(服务器 Docker + 双写降级),提交。AImyhome devlog 更新。

---

## 附:每任务完成后的文档更新约定

- **AImyhome-agent/README.md**:项目说明 + 进度 + 使用方法,每个 Task 更新一节
- **AImyhome/devlog/YYYY-MM-DD.md**:博客侧改动当天记录
- **面试叙事**:M1 全部完成后,把面试 6 条叙事(见 spec 第 6 节)与真实实现细节对照写进 AImyhome-agent/docs/interview-notes.md

## 验证命令速查

```bash
# AImyhome-agent
cd f:\AIproject\AImyhome-agent
uv sync                                    # 装依赖
uv run pytest                              # 全部测试
uv run uvicorn app.main:app --reload --port 8000   # 起服务
uv run python scripts/ingest.py --reset    # 重灌知识库
uv run python scripts/search_check.py "熊仔做过什么"   # 检索验证
uv run python scripts/chat_check.py "熊仔做过什么"     # Agent 全链路验证

# 博客
cd f:\AIproject\AImyhome
npm run dev                                # 本地跑(需 Agent 服务在 8000)
npm run build                              # 构建验证
```
