# 混合检索实施计划(Task 5.5)

> 执行方式:inline(TDD,每个任务红→绿,用户全程可见)。设计见 specs/2026-09-24-hybrid-search-design.md。

**Goal:** 给检索加关键词路(pg_trgm),两路 RRF 合并,治缩写词搜不准。

**Architecture:** `search()` = 向量路(现有)+ 关键词路(新增 `_keyword_query`,word_similarity)→ `_rrf_merge` 排名融合 → top_k。

**Tech Stack:** PostgreSQL 17 + pg_trgm 1.6 + pgvector;Python(psycopg)。

## Global Constraints

- 关键词路只查主提供方表(`embed_primary`),不查降级表
- 向量路阈值沿用 `settings.score_threshold`(0.25);关键词路阈值 `KEYWORD_THRESHOLD = 0.2`
- embedding 故障降级语义不变;关键词路只是融合方
- 时间类问题不做(留 Task 6)

---

### Task 1: RRF 合并纯函数

**Files:**
- Modify: `aimyhome-agent/app/kb.py`(加常量 + 函数)
- Test: `aimyhome-agent/tests/test_kb.py`

**Interfaces:**
- Produces: `_rrf_merge(vector_refs: list[SourceRef], keyword_refs: list[SourceRef], top_k: int) -> list[SourceRef]`,按 `1/(60+rank)` 求和排序;两路同块按 `(content, section)` 去重合并

- [ ] **Step 1: 写失败测试**

```python
def test_rrf_merge_ranks_by_combined_rank():
    v = [SourceRef("A", "sA", "f", 0.8), SourceRef("B", "sB", "f", 0.5)]
    k = [SourceRef("B", "sB", "f", 0.9), SourceRef("C", "sC", "f", 0.7)]
    merged = _rrf_merge(v, k, top_k=3)
    assert [m.content for m in merged] == ["B", "A", "C"]   # B 两路都有 → 最前
    assert merged[0].score > merged[1].score > merged[2].score
```

- [ ] **Step 2:** `pytest tests/test_kb.py::test_rrf_merge_ranks_by_combined_rank -v` → FAIL(`_rrf_merge` 不存在)
- [ ] **Step 3: 最小实现**

```python
RRF_K = 60  # 排名融合平滑系数(教科书默认)

def _rrf_merge(vector_refs, keyword_refs, top_k):
    """两路按排名融合:rrf = Σ 1/(60+rank)。分数不是一个尺子,只比排名。"""
    scores: dict[tuple, float] = {}
    blocks: dict[tuple, SourceRef] = {}
    for refs in (vector_refs, keyword_refs):
        for rank, r in enumerate(refs, start=1):
            key = (r.content, r.section)
            blocks[key] = r
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank)
    return [SourceRef(blocks[k].content, blocks[k].section, blocks[k].source, round(s, 4))
            for k, s in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:top_k]]
```

- [ ] **Step 4:** 重跑 → PASS
- [ ] **Step 5:** 先不单独提交(和 Task 2 一起)

### Task 2: 关键词路

**Files:**
- Modify: `aimyhome-agent/app/kb.py`(`ensure_tables` + `_keyword_query`)
- Test: `aimyhome-agent/tests/test_kb.py`

**Interfaces:**
- Consumes: `self._table_name(provider)`、`self._connect()`(已有)
- Produces: `_keyword_query(table: str, text: str, top_k: int) -> list[SourceRef]`,score = `word_similarity(content, text)`,过滤 `>= KEYWORD_THRESHOLD`

- [ ] **Step 0: 先读 test_kb.py 现有 `kb` fixture 的 mock 风格,照它写**(不发明新 mock 方式)
- [ ] **Step 1: 写失败测试**

```python
def test_ensure_tables_creates_trgm_index(kb, monkeypatch):
    # 照现有 fixture 风格 fake 掉 _connect,记录所有 execute 的 SQL
    kb.ensure_tables()
    sqls = " ".join(记录到的所有 SQL)
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in sqls
    assert "gin_trgm_ops" in sqls

def test_keyword_query_uses_word_similarity(kb):
    rows = _keyword_query("chunks_doubao", "bdms 项目", top_k=2)
    # 断言 SQL 含 word_similarity 与 >= KEYWORD_THRESHOLD,返回 SourceRef 列表
```

- [ ] **Step 2:** 跑 → FAIL(函数不存在)
- [ ] **Step 3: 最小实现**

```python
KEYWORD_THRESHOLD = 0.2   # 关键词路过滤:查询词在块里的覆盖度下限

# ensure_tables() 里追加(两张表都执行):
#   CREATE EXTENSION IF NOT EXISTS pg_trgm
#   CREATE INDEX IF NOT EXISTS {table}_content_trgm ON {table} USING gin (content gin_trgm_ops)

def _keyword_query(self, table: str, text: str, top_k: int) -> list[SourceRef]:
    """关键词路:word_similarity 衡量「查询词在块里出现多少」,短问长文比 similarity 公平。"""
    with self._connect() as conn:
        rows = conn.execute(f"""
            SELECT content, section, source, word_similarity(content, %s) AS score
            FROM {table}
            WHERE word_similarity(content, %s) >= {KEYWORD_THRESHOLD}
            ORDER BY score DESC
            LIMIT %s
            """, (text, text, top_k)).fetchall()
    return [SourceRef(r[0], r[1], r[2], float(r[3])) for r in rows]
```

- [ ] **Step 4:** 跑 → PASS(全量 21 个)
- [ ] **Step 5:** 提交 Task 1+2:`feat: 检索新增关键词路(pg_trgm + RRF 合并)`(先问用户)

### Task 3: search() 编排 + 真库验证 + 文档

**Files:**
- Modify: `aimyhome-agent/app/kb.py`(`search()`)、`tests/test_kb.py`
- Modify: 两份人话版、README、spec 状态

- [ ] **Step 1: 写失败测试**

```python
def test_search_merges_keyword_hits(kb, monkeypatch):
    # fake embed 与两路查询:关键词命中的块必须出现在最终结果,且 score 是 RRF 分

def test_search_falls_back_to_vector_when_keyword_empty(kb, monkeypatch):
    # 关键词路空 → 结果 = 向量路原样(分数仍是余弦)
```

- [ ] **Step 2:** 跑 → FAIL
- [ ] **Step 3: 最小实现**(search() 内,embedding 循环之前取一次关键词路;向量路过滤照旧)

```python
keyword_refs = self._keyword_query(self._table_name(providers[0]), text, top_k)
...
vector_refs = [r for r in self._query(name, vector, top_k) if r.score >= settings.score_threshold]
if not keyword_refs:
    return vector_refs
return _rrf_merge(vector_refs, keyword_refs, top_k)
```

- [ ] **Step 4:** 全量测试 PASS
- [ ] **Step 5: 真库验证**:`--reset` 重灌 → 标定集 = 原 8 题 + 新增 5 题(jsPlumb→金融AI、HZero→采购系统、ip2region→金融AI、OnlyOffice→金融AI、Wepy→技术栈前端);原题不退化
- [ ] **Step 6: 更新文档**:README 勾 Task 5.5;`PLAN.md` + 人话版同步进度;spec 状态改「已完成」
- [ ] **Step 7:** 提交(两仓库,先问用户)

## 自审

- spec 的 5 条改动点 → Task 1/2/3 全覆盖;「明确不做」在 Global Constraints
- 无占位符;类型/命名跨任务一致(`SourceRef` 4 字段、`_rrf_merge`、`_keyword_query`)
- 依赖顺序:Task 3 消费 Task 1/2 的产物,不交叉
