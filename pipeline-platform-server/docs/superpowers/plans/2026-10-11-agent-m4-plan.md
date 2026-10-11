# M4 MinerU 读文档助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会员上传 PDF/Word → MinerU 解析成 Markdown → 切片进临时知识库(挂在会话下,24h 清理)→ Agent 用 search_document 工具查文档问答 → 用户表达「长期记住」意图时 save_document 工具确认后转永久库(挂账号下)。

**Architecture:** 解析做成**独立 FastAPI 服务**(同仓库第二个入口 `app/parse_server.py`,端口 8001,pm2 第二进程):MinerU 常驻 1.5~2G 内存、解析时吃满 CPU,和聊天 Agent 隔离(崩了/卡了不影响聊天)。解析串行队列 + 队列限长。知识库沿用 M1 双写模式(豆包/智谱两套 embedding),新增「临时库」(session 维度,24h 清理)和「永久文档库」(用户维度)。Agent 图加两个工具:search_document(查文档)、save_document(转永久,确认式交互)。

**Tech Stack:** mineru[core] 2.x(pipeline 后端,纯 CPU)、FastAPI multipart 上传、asyncio 串行队列、pgvector 双表(复用 M1 embed 注册表)、LangGraph 工具注入 RunnableConfig、前端 Nuxt 拖拽上传。

## Global Constraints

- **仅会员可上传**(用户决定,2026-10-11):/parse 必须验 JWT;访客无上传入口
- 博客 API 契约不变;SSE 保持 OpenAI 格式
- 旧项目 pipeline-platform-server 冻结;2G pipeline 生产机不动
- 新服务器 4核4G3M 同机:Agent + PG + MinerU;解析任务**串行**
- 一库一模型(豆包/智谱双表,和 M1 一致);知识源 profile.md 不受影响
- 工作偏好:中文沟通、每 Task 用户确认、完成后更新文档随代码提交、教学式注释
- 服务器依赖变更后 deploy.sh 要能自动装(uv sync);pm2 两个进程都要在 deploy.sh 里重启
- **域名依赖**:浏览器直传大文件需 agent 域名 HTTPS(备案审核中,2026-10-05 提交)。备案未过时的临时方案:Vercel 代理 + 4MB 文件上限(见 Task 13.6)
- MinerU 4G 内存风险:先实测(M4.1);扛不住 → 备选 docling(轻量)或 MinerU 在线 API

---

## 文件结构(本计划全部产出)

```
f:\AIproject\aimyhome-agent\
├── pyproject.toml                 # +mineru[core] 依赖
├── app/
│   ├── parse_server.py            # 新:解析服务(8001,独立 FastAPI app)
│   ├── docparse.py                # 新:调 MinerU CLI 解析 + 切片(Markdown 两段式复用 chunking)
│   ├── dockb.py                   # 新:临时/永久文档库数据层(建表/入库/检索/清理/转永久)
│   ├── tools.py                   # 改:+search_document +save_document
│   ├── graph.py                   # 改:build_graph 增加工具注入参数
│   ├── main.py                    # 改:build_inputs 带 user_id;startup 挂 24h 清理任务
│   └── chunking.py                # 复用(切片函数)
├── scripts/
│   ├── run_parse.py               # 新:解析服务本地入口(SelectorEventLoop)
│   ├── doc_check.py               # 新:真库文档全流程验证脚本
│   └── deploy.sh                  # 改:pm2 两个进程 + uv sync
└── tests/
    ├── test_parse_server.py       # 新:鉴权/大小/类型/队列上限(注入假解析器)
    ├── test_dockb.py              # 新:SQL 拼接/过期清理查询(monkeypatch embed,不连真库)
    └── test_tools.py              # 新:两个工具的 config 注入与调用(假 kb)

f:\AIproject\AImyhome\
├── components/agent/ChatPanel.vue # 改:会员上传按钮 + 状态提示
└── server/api/parse.post.ts       # 新(备案未过时):Vercel 代理 /api/parse(4MB 上限临时方案)
```

---

### Task 13.1: MinerU 部署 + 4G 内存实测

**Files:**
- Modify: `f:\AIproject\aimyhome-agent\pyproject.toml`(加 mineru[core] 依赖)
- 服务器:/etc/fstab 或 rc.local(2G swap,如无)

**Interfaces:**
- Produces: 服务器上 `uv run mineru --version` 可用;一个测试 PDF 解析出 Markdown;实测数据(耗时/峰值内存)记入本文件「实测记录」节

- [ ] **Step 1: 加依赖**

在 aimyhome-agent 执行(本机,写入 pyproject + lock):

```bash
uv add "mineru[core]"
```

- [ ] **Step 2: 服务器装依赖 + 下载模型**

SSH 到 `106.55.76.235`(root,密钥已配),在 `/root/aimyhome-agent` 执行:

```bash
cd /root/aimyhome-agent
git pull --ff-only
UV_DEFAULT_INDEX=https://mirrors.cloud.tencent.com/pypi/simple uv sync
uv run mineru --version
# 下载 pipeline 后端所需模型(几 GB,耐心等)
uv run mineru-models-download --model_type all
```

- [ ] **Step 3: 检查/创建 2G swap**

```bash
free -h | grep -i swap
# 没有 swap 则:
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

- [ ] **Step 4: 实测解析(小 PDF)**

```bash
# 造一个 2~3 页测试 PDF(任意文档转 PDF 上传服务器)
/usr/bin/time -v uv run mineru -p /tmp/test.pdf -o /tmp/mtest --backend pipeline 2>&1 | tail -5
cat /tmp/mtest/test/*.md | head -20
```

记录:耗时、峰值内存(Maximum resident set size)。

- [ ] **Step 5: 记录实测数据 + 结论**

把数字写进本文件「实测记录」节。若峰值内存 < 3.5G → 继续;若 OOM 或被 kill → 停,回退方案(docling)和用户讨论。

- [ ] **Step 6: 提交**

```bash
git add pyproject.toml uv.lock
git commit -m "build: 加 mineru[core] 依赖(M4 文档解析)"
git push
```

---

### Task 13.2: 解析服务 parse_server(/parse 接口,串行队列)

**Files:**
- Create: `f:\AIproject\aimyhome-agent\app\parse_server.py`
- Create: `f:\AIproject\aimyhome-agent\app\docparse.py`
- Create: `f:\AIproject\aimyhome-agent\scripts\run_parse.py`
- Test: `f:\AIproject\aimyhome-agent\tests\test_parse_server.py`

**Interfaces:**
- Consumes: `app.auth.decode_token(token) -> user_id`(M3.2 已有);`app.auth.hash_password` 不需要
- Produces:
  - `docparse.parse_file(file_path: str, out_dir: str) -> str`(返回 Markdown 文本)
  - `parse_server.app`(FastAPI 实例,供 uvicorn 和 TestClient 用)
  - `parse_server.build_parse_app(parser=docparse.parse_file)`(测试注入假解析器的工厂)

- [ ] **Step 1: 写失败测试(test_parse_server.py)**

```python
"""解析服务测试:鉴权/大小/类型/队列 —— 解析函数注入假的,不真跑 MinerU。"""
from fastapi.testclient import TestClient

from app.parse_server import build_parse_app
from app.auth import create_token


def make_client(parser=None):
    """假解析器:记录调用次数,返回固定 Markdown;连队列限长一起可测。"""
    def fake_parser(file_path: str, out_dir: str) -> str:
        fake_parser.calls.append(file_path)
        return "# 测试文档\n\n正文内容"
    fake_parser.calls = []
    app = build_parse_app(parser=parser or fake_parser)
    return TestClient(app)


def _pdf_bytes() -> bytes:
    return b"%PDF-1.4 fake pdf content"


def test_parse_requires_token():
    """无 token 上传 → 401。"""
    client = make_client()
    resp = client.post("/parse", files={"file": ("a.pdf", _pdf_bytes())})
    assert resp.status_code == 401


def test_parse_rejects_bad_token():
    """乱码 token → 401。"""
    client = make_client()
    resp = client.post(
        "/parse",
        files={"file": ("a.pdf", _pdf_bytes())},
        headers={"Authorization": "Bearer garbage"},
    )
    assert resp.status_code == 401


def test_parse_rejects_wrong_type():
    """只有 PDF/Word 能上传,.exe 拒绝 → 400。"""
    client = make_client()
    resp = client.post(
        "/parse",
        files={"file": ("evil.exe", b"MZ...")},
        headers={"Authorization": f"Bearer {create_token(1)}"},
    )
    assert resp.status_code == 400


def test_parse_rejects_oversize():
    """超过 20MB 拒绝 → 413。"""
    client = make_client()
    big = b"%PDF" + b"x" * (21 * 1024 * 1024)
    resp = client.post(
        "/parse",
        files={"file": ("big.pdf", big)},
        headers={"Authorization": f"Bearer {create_token(1)}"},
    )
    assert resp.status_code == 413


def test_parse_returns_markdown():
    """正常 PDF → 200 + 返回解析出的 Markdown 文本。"""
    calls = []
    client = make_client(calls)
    resp = client.post(
        "/parse",
        files={"file": ("a.pdf", _pdf_bytes())},
        headers={"Authorization": f"Bearer {create_token(1)}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "# 测试文档" in data["markdown"]
    assert len(calls) == 1   # 真调了解析器


def test_queue_limit_rejects_when_full():
    """排队超 3 个直接拒绝 → 429(队列限长防算力被吃满)。

    做法:假解析器阻塞,并发发 6 个请求 —— 名额一共 3 个
    (1 解析中 + 2 排队),其余 3 个必须立刻 429。
    并发发起 + gate 阻塞解析器,保证前 3 个还在占着名额时
    后 3 个已经打到服务上。
    """
    import threading
    import time
    from concurrent.futures import ThreadPoolExecutor

    gate = threading.Event()
    calls = []

    def slow_parser(file_path: str, out_dir: str) -> str:
        calls.append(file_path)
        gate.wait(timeout=5)   # 阻塞,让名额一直占着
        return "# ok"

    client = make_client(parser=slow_parser)
    headers = {"Authorization": f"Bearer {create_token(1)}"}
    results = []

    def send(i):
        r = client.post("/parse", files={"file": (f"a{i}.pdf", _pdf_bytes())}, headers=headers)
        results.append(r.status_code)

    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(send, i) for i in range(6)]
        time.sleep(1.5)          # 让 6 个请求都打到服务,堆满名额
        gate.set()               # 放行解析
        [f.result() for f in futs]

    assert results.count(200) == 3   # 1 执行 + 2 排队
    assert results.count(429) == 3   # 超出名额的立刻被拒
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_parse_server.py -v`
Expected: 全部 FAIL(ImportError: app.parse_server 不存在)

- [ ] **Step 3: 写 docparse.py(真解析器,薄薄一层)**

```python
"""MinerU 解析封装:上传的 PDF/Word → Markdown 文本。

MinerU 是命令行工具,这里用 subprocess 调它的 CLI(接口最稳,
比直接 import 它的 python API 抗版本变化)。解析是 CPU 密集 +
耗时的活,统一走 asyncio.to_thread,不堵事件循环。
"""
import subprocess
from pathlib import Path

# 允许上传的文件后缀(白名单)
ALLOWED_SUFFIXES = {".pdf", ".doc", ".docx"}

# 上传大小上限:20MB(会员也要防超大文件吃磁盘)
MAX_FILE_SIZE = 20 * 1024 * 1024


def parse_file(file_path: str, out_dir: str) -> str:
    """跑 mineru CLI 把文件解析成 Markdown,返回 Markdown 全文。

    --backend pipeline:唯一纯 CPU 后端(hybrid/vlm 要 GPU)。
    输出目录里会有 <同名>/*.md,读出来拼成全文返回。
    """
    result = subprocess.run(
        ["uv", "run", "mineru", "-p", file_path, "-o", out_dir, "--backend", "pipeline"],
        capture_output=True, text=True, timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"MinerU 解析失败: {result.stderr[-300:]}")
    md_files = sorted(Path(out_dir).rglob("*.md"))
    if not md_files:
        raise RuntimeError("MinerU 没产出 Markdown 文件")
    return "\n\n".join(f.read_text(encoding="utf-8", errors="replace") for f in md_files)
```

- [ ] **Step 4: 写 parse_server.py(路由 + 串行队列)**

```python
"""解析服务(M4):独立 FastAPI app,跑在 8001 端口。

为什么独立进程:mineru 常驻内存 1.5~2G、解析时吃满 CPU,
和聊天 Agent 同进程会互相拖垮;独立进程崩了 pm2 单独拉起,
聊天不受影响。

串行队列:4 核机器上一次只解析一个文件;队列上限 3,
排不上直接 429 —— 防恶意刷上传吃满算力(计费保护)。
"""
import asyncio
import tempfile
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile

from app.auth import decode_token
from app.docparse import ALLOWED_SUFFIXES, MAX_FILE_SIZE

# 队列上限:1 个在执行 + 2 个排队,再多直接拒
QUEUE_LIMIT = 3


async def _user_id(authorization: str | None = Header(default=None)) -> int:
    """Bearer token → user_id;缺/坏一律 401(仅会员可上传)。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    try:
        return decode_token(authorization.removeprefix("Bearer "))
    except Exception:
        raise HTTPException(status_code=401, detail="登录已失效")


def build_parse_app(parser=None) -> FastAPI:
    """建解析服务 app。parser 参数注入:测试传假的,生产不传(用真 MinerU)。

    串行队列用「计数 + 锁」而不是 asyncio.Semaphore:
    Semaphore 没有原子 try_acquire,先检查再 acquire 有竞态窗口
    (并发多请求可能都过检查)。计数器加锁 = 检查+加一是原子的,
    「满 3 个立刻 429」才是确定性的。
    """
    from app.docparse import parse_file

    app = FastAPI(title="AImyhome Parse", version="0.1.0")
    _counter = 0                              # 当前占用名额(解析中 + 排队)
    _counter_lock = asyncio.Lock()            # 保护计数器的锁
    _serial = asyncio.Lock()                  # 真正串行:一次只解析一个文件
    parse = parser or parse_file

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/parse")
    async def parse_upload(
        file: UploadFile,
        user_id: int = Depends(_user_id),
    ):
        """上传 PDF/Word → 解析 → 返回 Markdown。串行队列 + 限长防滥用。"""
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(status_code=400, detail="只支持 PDF/Word 文档")

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="文件超过 20MB 上限")

        # 名额制:解析中 1 + 排队 2,满 3 个立刻 429(不排队等,防算力被吃满)
        async with _counter_lock:
            if _counter >= QUEUE_LIMIT:
                raise HTTPException(status_code=429, detail="解析任务已满,请稍后再试")
            _counter += 1
        try:
            async with _serial:   # 排队:前一个解析完才轮到下一个
                with tempfile.TemporaryDirectory() as tmp:
                    src = Path(tmp) / f"upload_{uuid.uuid4().hex[:8]}{suffix}"
                    src.write_bytes(content)
                    try:
                        markdown = await asyncio.to_thread(parse, str(src), str(Path(tmp) / "out"))
                    except RuntimeError as e:
                        raise HTTPException(status_code=500, detail=str(e))
        finally:
            async with _counter_lock:
                _counter -= 1     # 还名额(成功/失败都还)
        return {"markdown": markdown}


app = build_parse_app()
```

- [ ] **Step 5: 跑测试确认通过**

Run: `uv run pytest tests/test_parse_server.py -v`
Expected: 6 PASS(注意:队列测试里 make_client 的调用要统一成传 list)

- [ ] **Step 6: 写本地入口 scripts/run_parse.py**

```python
"""解析服务本地入口(8001)。Windows 坑同 run_dev.py:必须 SelectorEventLoop。"""
import asyncio
import sys

import uvicorn

if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    uvicorn.run(
        "app.parse_server:app", host="127.0.0.1", port=8001, reload=False,
        loop=asyncio.SelectorEventLoop,
    )
```

- [ ] **Step 7: 提交**

```bash
git add app/parse_server.py app/docparse.py scripts/run_parse.py tests/test_parse_server.py
git commit -m "feat(M4.2): 解析服务 /parse —— 会员上传 PDF/Word 串行解析,队列限长防滥用"
```

---

### Task 13.3: 临时文档库(会话维度 + 24h 清理)

**Files:**
- Create: `f:\AIproject\aimyhome-agent\app\dockb.py`
- Test: `f:\AIproject\aimyhome-agent\tests\test_dockb.py`

**Interfaces:**
- Consumes: `app.embeddings.embed(provider, texts) -> list[list[float]]`(M1 已有);`app.kb.get_provider`;`app.chunking.split_markdown(text) -> list[Document]`(M1 两段式切片)
- Produces:
  - `class DocKB`: `ensure_tables()`, `ingest_temp(session_key, title, chunks, providers)`, `search_temp(session_key, text, top_k)`, `cleanup_expired(hours=24) -> int`, `promote(session_key, user_id, title) -> int`(临时→永久)
  - 表:`chunks_doc_temp`(session_key text + created_at)、`chunks_doc`(user_id bigint)

- [ ] **Step 1: 写失败测试(test_dockb.py,monkeypatch embed 不连真库)**

```python
"""文档库测试:SQL 组装 + 过期清理条件 + 转永久 —— monkeypatch embed,不连真库。

模式照抄 test_kb.py:真 pgvector 结构不动,把「调 embedding API」换成假函数。
"""
from app.dockb import DocKB, EXPIRY_HOURS


def test_table_sql_contains_session_scope(monkeypatch):
    """临时库建表 SQL 必须有 session_key 和 created_at(清理靠它俩)。"""
    kb = DocKB(dsn="fake://")
    sql = kb._temp_table_sql()
    assert "session_key" in sql
    assert "created_at" in sql


def test_cleanup_deletes_only_expired(monkeypatch):
    """清理 SQL 只删 created_at 超过 24h 的行。"""
    kb = DocKB(dsn="fake://")
    sql = kb._cleanup_sql()
    assert f"{EXPIRY_HOURS} hours" in sql or "interval" in sql.lower()


def test_ingest_temp_embeds_and_inserts(monkeypatch):
    """入库:每个 provider 都调 embed,插进临时表带 session_key。"""
    from langchain_core.documents import Document

    calls = []
    monkeypatch.setattr("app.dockb.embed", lambda p, texts: calls.append((p, len(texts))) or [[0.1]*4 for _ in texts])

    inserted = []
    kb = DocKB(dsn="fake://")

    # 用假连接替换 _connect,记录 SQL
    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def cursor(self): return FakeCur()
        def execute(self, sql, params=None): executed.append(sql); return FakeCur()

    class FakeCur:
        def executemany(self, sql, rows): executed.append(sql); inserted.append(len(rows))

    executed = []
    monkeypatch.setattr(kb, "_connect", lambda: FakeConn())

    chunks = [Document(page_content="第一段", metadata={"section": "A"})]
    kb.ingest_temp("sess-1", "文档标题", chunks, ["doubao"])
    assert calls == [("doubao", 1)]
    assert inserted == [1]


def test_promote_moves_rows_to_user_scope(monkeypatch):
    """转永久:INSERT ... SELECT 带 user_id,然后删临时行。"""
    kb = DocKB(dsn="fake://")
    executed = []
    class FakeConn:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def execute(self, sql, params=None): executed.append(sql); return self
    monkeypatch.setattr(kb, "_connect", lambda: FakeConn())
    kb.promote("sess-1", user_id=7, title="某某文档")
    assert any("INSERT" in s and "SELECT" in s for s in executed)
    assert any("DELETE" in s and "session_key" in s for s in executed)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_dockb.py -v`
Expected: FAIL(ImportError: app.dockb 不存在)

- [ ] **Step 3: 写 dockb.py**

```python
"""文档知识库(M4):临时库(挂在会话下,24h 清理)+ 永久库(挂账号下)。

和 M1 简历库的关系:简历库 chunks_* 是「熊仔是谁」;
本模块是「用户上传的文档」—— 检索时 Agent 会两个都查。
表结构照抄 M1(chunks_doubao/chunks_zhipu)的字段,只是加了
归属维度:临时库 session_key、永久库 user_id。
"""
from datetime import datetime, timedelta, timezone

import psycopg
from langchain_core.documents import Document

from app.config import settings
from app.embeddings import embed, get_provider

# 临时库保留时长:24 小时(过期由清理任务删掉)
EXPIRY_HOURS = 24

# 检索阈值、top_k 和 M1 一致
TOP_K = 6


class DocKB:
    """文档库管家:建表/入库/检索/清理/转永久。"""

    def __init__(self, dsn: str | None = None):
        self.dsn = dsn or settings.database_url

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.dsn, autocommit=True)

    # 表名:临时库 chunks_doc_temp,永久库 chunks_doc(provider 后缀和 M1 一样)
    @staticmethod
    def _table(scope: str, provider: str) -> str:
        return f"chunks_doc_{scope}_{provider}" if scope == "temp" else f"chunks_doc_{provider}"

    def _temp_table_sql(self, provider: str) -> str:
        dim = get_provider(provider).dim
        table = self._table("temp", provider)
        return f"""
            CREATE TABLE IF NOT EXISTS {table} (
                id bigserial PRIMARY KEY,
                session_key text NOT NULL,
                title text NOT NULL DEFAULT '',
                content text NOT NULL,
                section text NOT NULL DEFAULT '',
                source text NOT NULL DEFAULT '',
                embedding vector({dim}) NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            )
        """

    def ensure_tables(self, providers: list[str]) -> None:
        """建临时/永久两套表 + 索引(临时库的清理靠 created_at 索引)。"""
        with self._connect() as conn:
            for name in providers:
                conn.execute(self._temp_table_sql(name))
                conn.execute(f"CREATE INDEX IF NOT EXISTS {self._table('temp', name)}_session_idx ON {self._table('temp', name)} (session_key)")
                conn.execute(f"CREATE INDEX IF NOT EXISTS {self._table('temp', name)}_created_idx ON {self._table('temp', name)} (created_at)")
                dim = get_provider(name).dim
                conn.execute(f"""
                    CREATE TABLE IF NOT EXISTS {self._table('perm', name)} (
                        id bigserial PRIMARY KEY,
                        user_id bigint NOT NULL,
                        title text NOT NULL DEFAULT '',
                        content text NOT NULL,
                        section text NOT NULL DEFAULT '',
                        source text NOT NULL DEFAULT '',
                        embedding vector({dim}) NOT NULL,
                        created_at timestamptz NOT NULL DEFAULT now()
                    )
                """)
                conn.execute(f"CREATE INDEX IF NOT EXISTS {self._table('perm', name)}_user_idx ON {self._table('perm', name)} (user_id)")

    def ingest_temp(self, session_key: str, title: str, chunks: list[Document], providers: list[str]) -> dict[str, int]:
        """切片 → 逐 provider 算向量 → 插临时表(带 session_key)。

        每 32 块一批(照抄 M1:智谱单请求上限 64 条,留余量)。
        """
        counts: dict[str, int] = {}
        for name in providers:
            table = self._table("temp", name)
            count = 0
            with self._connect() as conn:
                for start in range(0, len(chunks), 32):
                    batch = chunks[start:start + 32]
                    vectors = embed(name, [c.page_content for c in batch])
                    rows = [
                        (session_key, title, c.page_content, c.metadata.get("section", ""), "upload", str(vectors[i]))
                        for i, c in enumerate(batch)
                    ]
                    with conn.cursor() as cur:
                        cur.executemany(
                            f"INSERT INTO {table} (session_key, title, content, section, source, embedding)"
                            " VALUES (%s, %s, %s, %s, %s, %s::vector)",
                            rows,
                        )
                    count += len(rows)
            counts[name] = count
        return counts

    # ── 检索(临时库按 session_key 限定;永久库按 user_id 限定)──
    def _search_scoped(self, table: str, scope_col: str, scope_val, text: str, provider: str, top_k: int):
        dim = get_provider(provider).dim
        vector = embed(provider, [text])[0]
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT content, section, source, 1 - (embedding <=> %s::vector) AS score
                FROM {table}
                WHERE {scope_col} = %s AND 1 - (embedding <=> %s::vector) >= 0.25
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (str(vector), scope_val, str(vector), str(vector), top_k),
            ).fetchall()
        return [{"content": r[0], "section": r[1], "source": r[2], "score": float(r[3])} for r in rows]

    def search_temp(self, session_key: str, text: str, provider: str, top_k: int = TOP_K) -> list[dict]:
        """在「这个会话」上传的文档里检索。"""
        return self._search_scoped(self._table("temp", provider), "session_key", session_key, text, provider, top_k)

    def search_user(self, user_id: int, text: str, provider: str, top_k: int = TOP_K) -> list[dict]:
        """在「这个用户」的永久文档里检索。"""
        return self._search_scoped(self._table("perm", provider), "user_id", user_id, text, provider, top_k)

    # ── 清理:过期临时行(返回删掉的行数)──
    def _cleanup_sql(self, provider: str) -> str:
        table = self._table("temp", provider)
        return f"DELETE FROM {table} WHERE created_at < now() - interval '{EXPIRY_HOURS} hours'"

    def cleanup_expired(self, providers: list[str]) -> int:
        """删掉超过 24h 的临时库行(定时任务调)。返回删除总数。"""
        total = 0
        with self._connect() as conn:
            for name in providers:
                cur = conn.execute(self._cleanup_sql(name))
                total += cur.rowcount
        return total

    # ── 转永久:临时行 → 永久表(挂 user_id),然后删临时行 ──
    def promote(self, session_key: str, user_id: int, title: str, providers: list[str]) -> int:
        """「长期记住这个文件」确认后调用:把该会话的临时切片挪进
        用户永久文档库(embedding 原样搬,不重新算,不重复烧钱)。"""
        total = 0
        with self._connect() as conn:
            for name in providers:
                temp_t, perm_t = self._table("temp", name), self._table("perm", name)
                conn.execute(f"""
                    INSERT INTO {perm_t} (user_id, title, content, section, source, embedding)
                    SELECT %s, %s, content, section, source, embedding
                    FROM {temp_t} WHERE session_key = %s
                """, (user_id, title, session_key))
                cur = conn.execute(f"DELETE FROM {temp_t} WHERE session_key = %s", (session_key,))
                total += cur.rowcount
        return total
```

- [ ] **Step 4: 跑测试确认通过**

Run: `uv run pytest tests/test_dockb.py -v`
Expected: 5 PASS(注意:`test_ingest_temp_embeds_and_inserts` 里 monkeypatch `app.dockb.embed` 后,`_search_scoped` 里 embed 也是这个假函数 —— 检查一致)

- [ ] **Step 5: 提交**

```bash
git add app/dockb.py tests/test_dockb.py
git commit -m "feat(M4.3): 文档知识库 —— 临时库(session 维度 24h 清理)+ 永久库(user 维度)"
```

---

### Task 13.4: Agent 加 search_document 工具(查上传的文档)

**Files:**
- Modify: `f:\AIproject\aimyhome-agent\app\tools.py`
- Modify: `f:\AIproject\aimyhome-agent\app\graph.py`(build_graph 把新工具一起绑给 create_react_agent)
- Test: `f:\AIproject\aimyhome-agent\tests\test_tools.py`

**Interfaces:**
- Consumes: `DocKB.search_temp / search_user`(Task 13.3);`RunnableConfig`(langchain_core.runnables,工具里自动注入)
- Produces:
  - `tools.make_search_document(dockb) -> tool`(绑定文档库的检索工具)
  - `graph.build_graph(llm, kb, dockb=None, checkpointer=None)`(签名加 dockb)

- [ ] **Step 1: 写失败测试(test_tools.py)**

```python
"""工具层测试:search_document 从 config 拿 thread_id/user_id 限定检索范围。"""
from langchain_core.runnables import RunnableConfig

from app.tools import make_search_document


class FakeDocKB:
    """记录调用参数,返回固定结果。"""
    def __init__(self):
        self.calls = []
        self.reply = [{"content": "文档里的一段", "section": "1", "source": "a.pdf", "score": 0.9}]

    def search_temp(self, session_key, text, provider, top_k):
        self.calls.append(("temp", session_key, text, provider, top_k))
        return self.reply

    def search_user(self, user_id, text, provider, top_k):
        self.calls.append(("user", user_id, text, provider, top_k))
        return []


def test_search_document_scopes_to_thread_and_user():
    """工具从 config 里拿 thread_id(会话)和 user_id(账号),查两个范围。"""
    kb = FakeDocKB()
    tool = make_search_document(kb)
    config: RunnableConfig = {"configurable": {"thread_id": "42", "user_id": 7}}

    result = tool.invoke({"query": "这份文档讲了什么"}, config)

    assert ("temp", "42", "这份文档讲了什么") == (kb.calls[0][0], kb.calls[0][1], kb.calls[0][2])
    assert ("user", 7, "这份文档讲了什么") == (kb.calls[1][0], kb.calls[1][1], kb.calls[1][2])
    assert "文档里的一段" in result


def test_search_document_no_docs_returns_hint():
    """两边都搜不到 → 返回「没找到」提示,不是空字符串(LLM 才好接话)。"""
    kb = FakeDocKB()
    kb.reply = []
    tool = make_search_document(kb)
    config: RunnableConfig = {"configurable": {"thread_id": "42", "user_id": 7}}
    result = tool.invoke({"query": "随便问"}, config)
    assert "没有找到" in result
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_tools.py -v`
Expected: FAIL(ImportError: make_search_document 不存在)

- [ ] **Step 3: 写 tools.py 的新工具**

```python
# tools.py 追加(M4):
"""search_document:查用户上传的文档 —— 临时库(当前会话)+ 永久库(账号)。

为什么用 RunnableConfig:工具执行时 graph 会把运行配置传给工具,
里面就有 thread_id(= 会话 id)和 user_id(= 账号 id),工具不需要
额外参数就能知道「谁在哪个会话问的」—— 这也是 M4 和 M3 的
「conversation.id == thread_id」设计连起来的地方。
"""
from langchain_core.runnables import RunnableConfig

from app.dockb import DocKB


def make_search_document(dockb: DocKB):
    """造 search_document 工具(闭包绑住文档库实例;测试传 FakeDocKB)。"""

    def search_document(query: str, config: RunnableConfig) -> str:
        """在用户上传的文档中检索与 query 最相关的内容(当前会话的临时文档 + 账号的永久文档)。当用户问「这份文档/上传的文件讲了什么」时必须使用。"""
        thread_id = config["configurable"].get("thread_id", "")
        user_id = config["configurable"].get("user_id", 0)
        hits = []
        if thread_id:
            hits += dockb.search_temp(str(thread_id), query, "doubao")
        if user_id:
            hits += dockb.search_user(int(user_id), query, "doubao")
        hits.sort(key=lambda r: r["score"], reverse=True)
        if not hits:
            return "没有在已上传的文档里找到相关内容。"
        parts = [f"【{h['source']} · {h['section']}】{h['content']}" for h in hits[:4]]
        return "\n\n".join(parts)

    return search_document
```

- [ ] **Step 4: 改 graph.py:build_graph 把工具绑进图**

```python
# graph.py 改动:build_graph 签名加 dockb,工具列表动态拼
def build_graph(llm, kb: PgVectorKB, dockb=None, checkpointer=None):
    ...
    tools = [search_profile]                      # 简历检索(老工具)
    if dockb is not None:
        # M4:有文档库才注册文档工具(测试和 M1 场景不传 dockb,行为不变)
        tools.append(make_search_document(dockb))
    return AgentGraph(create_react_agent(
        model=llm,
        tools=tools,
        state_schema=AgentState,
        prompt=SYSTEM_PROMPT + DOC_RULES,
        checkpointer=checkpointer,
    ))
```

SYSTEM_PROMPT 末尾加(模块级常量):

```python
DOC_RULES = """
5. 当用户提到「这份文档」「上传的文件」「文档里说」等,或问的问题明显是
   针对他上传的资料时,必须先用 search_document 工具查,再基于结果回答
"""
```

- [ ] **Step 5: 跑测试确认通过**

Run: `uv run pytest tests/test_tools.py -v && uv run pytest -q`
Expected: 新测试 PASS;全套(63 + 新)全绿 —— 老测试不受影响(dockb 默认 None)

- [ ] **Step 6: 提交**

```bash
git add app/tools.py app/graph.py tests/test_tools.py
git commit -m "feat(M4.4): search_document 工具 —— 查上传文档(临时+永久),config 注入会话/账号范围"
```

---

### Task 13.5: save_document 工具(按意图入库 + 确认式交互)

**Files:**
- Modify: `f:\AIproject\aimyhome-agent\app\tools.py`
- Modify: `f:\AIproject\aimyhome-agent\app\graph.py`(绑新工具)
- Test: `f:\AIproject\aimyhome-agent\tests\test_tools.py`

**Interfaces:**
- Consumes: `DocKB.promote(session_key, user_id, title) -> int`(Task 13.3)
- Produces: `tools.make_save_document(dockb) -> tool`

**设计(用户定,2026-10-06 spec 已记)**:上传解析后不默认入库。LLM 判断用户话术(「长期记住这个文件」等)→ 工具先返回确认问句 → 用户明确同意(「是/保存吧」)→ 再调工具执行 promote。确认的机制:**prompt 规则 + 两次调用**:第一次 LLM 表达存储意图时调 save_document(confirm=True) 只返回确认问句不落库;用户同意后 LLM 再调 save_document(confirm=False) 才真正 promote。

- [ ] **Step 1: 写失败测试**

```python
def test_save_document_confirm_mode_does_not_promote():
    """confirm=True:只回确认问句,不落库(等用户明确同意)。"""
    kb = FakeDocKB()
    kb.promoted = []
    def fake_promote(session_key, user_id, title, providers):
        kb.promoted.append(session_key)
        return 3
    kb.promote = fake_promote
    tool = make_save_document(kb)
    config: RunnableConfig = {"configurable": {"thread_id": "42", "user_id": 7}}
    result = tool.invoke({"confirm": True, "title": "某某文档"}, config)
    assert kb.promoted == []
    assert "记住" in result and "?" in result   # 确认问句


def test_save_document_confirmed_promotes():
    """confirm=False:真正转永久,返回成功消息。"""
    kb = FakeDocKB()
    kb.promoted = []
    def fake_promote(session_key, user_id, title, providers):
        kb.promoted.append((session_key, user_id, title))
        return 3
    kb.promote = fake_promote
    tool = make_save_document(kb)
    config: RunnableConfig = {"configurable": {"thread_id": "42", "user_id": 7}}
    result = tool.invoke({"confirm": False, "title": "某某文档"}, config)
    assert kb.promoted == [("42", 7, "某某文档")]
    assert "已保存" in result
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL(ImportError)

- [ ] **Step 3: 写工具**

```python
# tools.py 追加:
def make_save_document(dockb: DocKB):
    """造 save_document 工具(闭包绑文档库)。

    按意图入库 + 确认式交互(用户 2026-10-06 定的设计):
    - confirm=True:LLM 判断用户想长期存时第一次调用,只问一句确认,不落库
    - confirm=False:用户明确同意后第二次调用,才真正转永久库
    两步走防误判:光靠 LLM 猜意图不可靠,落库前必须过用户确认。
    """

    def save_document(confirm: bool, title: str, config: RunnableConfig) -> str:
        """把当前会话里上传的文档转存到账号的永久文档库。confirm=True 时只返回确认问句(不真正存储),用户在对话中明确同意后,再以 confirm=False 调用执行转存。"""
        thread_id = config["configurable"].get("thread_id", "")
        user_id = config["configurable"].get("user_id", 0)
        if confirm:
            return f"你是想让我长期记住《{title}》这个文件吗?以后换会话也能继续问我它里面的内容。回复「是」我就保存。"
        if not thread_id or not user_id:
            return "保存失败:找不到会话或账号信息。"
        try:
            n = dockb.promote(str(thread_id), int(user_id), title, ["doubao", "zhipu"])
        except Exception as e:
            return f"保存失败:{e}"
        return f"已保存《{title}》,以后随时可以问我这个文件里的内容。"

    return save_document
```

- [ ] **Step 4: graph.py 绑定 + prompt 规则**

build_graph 的 tools 追加:

```python
    if dockb is not None:
        tools.append(make_search_document(dockb))
        tools.append(make_save_document(dockb))
```

DOC_RULES 追加:

```python
6. 当用户表达想长期保存/记住上传的文档(如「记住这个文件」「长期存起来」)时,
   调用 save_document(confirm=True) 询问确认;用户明确同意后再调
   save_document(confirm=False) 执行保存。绝不能未经确认就保存。
```

- [ ] **Step 5: 跑测试确认通过 + 全套回归**

Run: `uv run pytest tests/test_tools.py -v && uv run pytest -q`
Expected: 全绿

- [ ] **Step 6: 提交**

```bash
git add app/tools.py app/graph.py tests/test_tools.py
git commit -m "feat(M4.5): save_document 工具 —— 按意图入库,confirm 两步确认防误判"
```

---

### Task 13.6: Agent 服务接入文档库(路由 + 清理任务 + user_id 注入)

**Files:**
- Modify: `f:\AIproject\aimyhome-agent\app\main.py`
- Modify: `f:\AIproject\aimyhome-agent\app\config.py`(如需要加默认 provider 配置)

**Interfaces:**
- Consumes: Task 13.3/13.4/13.5 全部
- Produces: `POST /api/agent` 跑图时带 dockb;config 注入 user_id;24h 清理后台任务

- [ ] **Step 1: 写失败测试(test_api.py 追加)**

```python
def test_build_inputs_injects_user_id_into_config():
    """登录用户的 config 带 user_id —— save_document/search_document 靠它定账号范围。"""
    req = AgentRequest(messages=[ChatMsg(role="user", content="x")], session_id="42")
    inputs, config = build_inputs(req, user_id=7)
    assert config == {"configurable": {"thread_id": "42", "user_id": 7}}


def test_build_inputs_visitor_no_user_id():
    """访客 config 为 None(老行为不变)。"""
    req = AgentRequest(messages=[ChatMsg(role="user", content="x")])
    inputs, config = build_inputs(req, user_id=None)
    assert config is None
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL(TypeError: build_inputs() got unexpected keyword 'user_id')

- [ ] **Step 3: 改 main.py**

```python
# build_inputs 签名加 user_id;登录用户 config 注入:
def build_inputs(req: AgentRequest, user_id: int | None = None):
    """组装图的输入和运行配置(独立成函数,方便单测)。

    M4:登录用户的 config 额外带 user_id —— 文档工具靠它把
    「永久库」限定到账号(checkpointer 只认 thread_id,别的 key 透传)。
    """
    if req.session_id:
        last = req.messages[-1]
        inputs = {"messages": [HumanMessage(content=last.content)]}
        config = {"configurable": {"thread_id": req.session_id, "user_id": user_id}}
        return inputs, config
    inputs = {"messages": [HumanMessage(content=m.content) for m in req.messages]}
    return inputs, None
```

get_graph 也带 dockb(和 checkpointer 一样按图缓存):

```python
# 模块级:
dockb = DocKB()

def get_graph(model_id: str | None, with_checkpoint: bool):
    key = (model_id or settings.default_llm, with_checkpoint)
    if key not in _graphs:
        _graphs[key] = build_graph(
            get_llm(key[0]), kb, dockb=dockb, checkpointer=_checkpointer if with_checkpoint else None
        )
    return _graphs[key]
```

agent 路由:build_inputs 传入 user_id:

```python
    inputs, config = build_inputs(req, user_id=user_id)
```

lifespan 加清理任务(24h 定时,每 10 分钟扫一次):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    ...原内容...
    cleanup_task = asyncio.create_task(_cleanup_loop(dockb))
    yield
    cleanup_task.cancel()
    ...

async def _cleanup_loop(dockb: DocKB):
    """后台任务:每 10 分钟清一次超过 24h 的临时文档切片。"""
    while True:
        await asyncio.sleep(600)
        try:
            n = await asyncio.to_thread(dockb.cleanup_expired, ["doubao", "zhipu"])
            if n:
                logger.info("临时文档清理: %d 行", n)
        except Exception:
            logger.exception("临时文档清理失败")
```

- [ ] **Step 4: 跑测试确认通过 + 全套回归**

Run: `uv run pytest -q`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add app/main.py tests/test_api.py
git commit -m "feat(M4.6): agent 接入文档库 —— user_id 注入 config,24h 清理后台任务"
```

---

### Task 13.7: 前端上传 UI(仅会员)+ 解析接入

**Files:**
- Modify: `f:\AIproject\AImyhome\components\agent\ChatPanel.vue`
- Create: `f:\AIproject\AImyhome\server\api\parse.post.ts`(备案未过时临时代理;备案过则直传)

**Interfaces:**
- Consumes: `POST /parse`(multipart file + Authorization,返回 {markdown});`POST /api/agent`
- Produces: 上传按钮(会员可见)→ 解析成功提示 → 会话里可问文档问题

**分两种情况(域名依赖,见 Global Constraints)**:
- **备案已过**:前端直传 `https://agent.ai-myhome.space/parse`(Nginx → 8001,client_max_body_size 25m)
- **备案未过**:走 Vercel 代理 `/api/parse`(博客转发,文件 ≤ 4MB;Vercel 请求体上限 4.5MB)

- [ ] **Step 1: ChatPanel.vue 加上传区**

输入区上方(仅 `authUser` 显示):

```html
<!-- 文档上传(仅会员;M4):解析成功挂在当前会话的临时库,直接开问 -->
<div v-if="authUser" class="mb-2 flex items-center gap-2">
  <label class="chip cursor-pointer hover:bg-surface-high/50 transition-colors">
    📄 上传文档
    <input type="file" accept=".pdf,.doc,.docx" class="hidden" :disabled="uploading"
      @change="handleUpload" />
  </label>
  <span v-if="uploading" class="text-label-sm text-on-surface-variant/70">解析中,稍等…</span>
  <span v-else-if="uploadMsg" class="text-label-sm" :class="uploadOk ? 'text-green-400' : 'text-red-400'">
    {{ uploadMsg }}
  </span>
</div>
```

script 里:

```ts
const uploading = ref(false)
const uploadOk = ref(false)
const uploadMsg = ref('')

// 上传文档(M4):先解析成 Markdown 入库(服务端按当前会话挂临时库),
// 解析完直接开问 —— 问题会命中 search_document 工具
async function handleUpload(e: Event) {
  const inputEl = e.target as HTMLInputElement
  const file = inputEl.files?.[0]
  if (!file) return
  inputEl.value = ''               // 同一文件可重复选
  if (!currentConversationId.value) {
    uploadMsg.value = '先选一个会话再上传'
    uploadOk.value = false
    return
  }
  const form = new FormData()
  form.append('file', file)
  uploading.value = true
  uploadOk.value = false
  uploadMsg.value = ''
  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken.value}` },
      body: form,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.detail || '解析失败,请重试')
    }
    uploadOk.value = true
    uploadMsg.value = `《${file.name}》解析完成,直接问它内容吧`
  } catch (err: any) {
    uploadOk.value = false
    uploadMsg.value = err.message || '解析失败,请重试'
  } finally {
    uploading.value = false
  }
}
```

- [ ] **Step 2: server/api/parse.post.ts(备案未过时的代理)**

```ts
/**
 * 文档解析接口转发(M4):multipart 透传到 Agent 服务。
 * multipart 透传两个要点:①readRawBody 读原始字节(不能用 readBody,
 * 它会按 JSON 解析 body 直接报错)②原样带上 Content-Type(含 boundary,
 * 丢了它服务端解析不了 multipart)。
 * 备案通过后改为浏览器直传 agent 域名,删掉本文件。
 */
export default defineEventHandler(async (event) => {
  const agentBase = (process.env.AGENT_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  const auth = getHeader(event, 'authorization')
  const contentType = getHeader(event, 'content-type')

  let res: Response
  try {
    res = await fetch(`${agentBase}/api/parse`, {
      method: 'POST',
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(auth ? { Authorization: auth } : {}),
      },
      body: await readRawBody(event),   // 原始字节透传
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Agent service unavailable' })
  }
  setResponseStatus(event, res.status)
  return res.json()
})
```

- [ ] **Step 3: 构建验证**

Run: `npx nuxi build`
Expected: ✨ Build complete

- [ ] **Step 4: 提交**

```bash
git add components/agent/ChatPanel.vue server/api/parse.post.ts
git commit -m "feat(M4.7): 会员文档上传 —— 上传按钮(仅会员)+ Vercel 代理 /api/parse"
```

---

### Task 13.8: 部署 + 全链路验证 + 文档收尾

**Files:**
- Modify: `f:\AIproject\aimyhome-agent\scripts\deploy.sh`(pm2 起两个进程)
- Modify: `f:\AIproject\aimyhome-agent\README.md`(M4 使用说明)
- Modify: `f:\AIproject\pipeline-platform-nest\pipeline-platform-server\docs\superpowers\plans\2026-09-08-agent-m1-plan.md`(Task 13 进度)
- Modify: `f:\AIproject\aimyhome-agent\PLAN.md`(同步简版)

- [ ] **Step 1: deploy.sh 加第二进程**

```bash
# deploy.sh 里 pm2 启动段追加:
pm2 start "uv run python -m app.parse_server" --name ai-agent-parse --cwd /root/aimyhome-agent
# 或(生产用 uvicorn):
pm2 start "/root/.local/bin/uv run uvicorn app.parse_server:app --host 127.0.0.1 --port 8001" --name ai-agent-parse
```

服务器 Nginx 加(备案过才有域名,临时只监听 127.0.0.1:8001 供博客代理):

```nginx
location /api/parse {
    proxy_pass http://127.0.0.1:8001;
    client_max_body_size 25m;
    proxy_read_timeout 600s;   # 解析慢,超时放宽
}
```

- [ ] **Step 2: 真库文档全流程验证脚本 scripts/doc_check.py**

```python
"""M4 真库验证:注册 → 建会话 → 临时库入库 → 检索 → promote → 清理。
用法(先开 SSH 隧道):uv run python -m scripts.doc_check
"""
# 1. 注册临时用户 + 建会话
# 2. DocKB.ensure_tables → ingest_temp(2 个切片,假 embedding 不行 —— 真 embed 要钱;
#    本脚本用真 embed,2 块开销极小)
# 3. search_temp 用文档里的原句检索 → 命中(score 高)
# 4. promote(session_key, user_id) → search_user 命中、search_temp 空
# 5. cleanup_expired 不误删新数据(把某行 created_at 改成 25h 前再清,只删它)
# 6. 清理测试数据
```

- [ ] **Step 3: 端到端人工/脚本验证**

1. `uv run python -m scripts.doc_check` 真库 6 项过
2. 本机起 run_dev + run_parse,浏览器(或 puppeteer)走:登录 → 上传小 PDF → 解析成功提示 → 问「这份文档讲了什么」→ 回答带文档内容 + 来源
3. 服务器:pm2 两进程健康检查 `/health`

- [ ] **Step 4: 文档收尾 + 提交**

```bash
git add scripts/doc_check.py scripts/deploy.sh README.md
git commit -m "feat(M4.8): 部署双进程 + doc_check 真库验证 + 文档"
git push   # cron 自动部署
```

---

## 实测记录(Task 13.1 填)

| 项目 | 数值 |
|---|---|
| mineru 版本 | 待填 |
| 测试 PDF 页数 | 待填 |
| 解析耗时 | 待填 |
| 峰值内存(Max RSS) | 待填 |
| 4G 机结论 | 待填(能跑/降级方案) |

## 风险

| 风险 | 对策 |
|---|---|
| MinerU 4G 内存不够 | 2G swap + 串行;再不行换 docling / 在线 API(和用户商量) |
| 备案迟迟不过 | Vercel 代理 + 4MB 上限过渡,过备案后切直传 |
| embedding 成本被刷 | 仅会员可上传 + 队列限长 + 20MB 上限;会员滥用再加每日次数 |
| 解析超时 | subprocess timeout=600,超时报 500 让用户重试 |
