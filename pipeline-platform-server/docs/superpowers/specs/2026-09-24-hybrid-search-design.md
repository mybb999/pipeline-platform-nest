# 混合检索设计(人话版)

日期:2026-09-24
状态:已完成(标定集 13/13)
关联:施工图纸 `plans/2026-09-08-agent-m1-plan.md` 的 Task 5.5

## 要解决的问题

「bdms」「HZero」这类缩写/专有名词,纯向量检索搜不准 —— 向量算「意思像不像」,缩写词的字面信息被稀释。
实测:「bdms 项目用了什么技术」在修 chunk 前命中了别的项目。

## 方案:两条路,各排各的榜,合并取前几名

- **老路(向量)**:现有逻辑不动,管「意思像不像」
- **新路(关键词)**:Postgres 自带插件 `pg_trgm`(三元组),管「字面有没有」
- **合并**:RRF(只比排名,不比分数,因为两路分数不是一个尺子)

## 实现中的两个修正(真库验证抓出来的)

1. **`word_similarity(短问, 长文)` 参数顺序**:短问在前、长文在后(衡量「查询词在块里出现多少」)。写反了会永远趋近 0,单测锁死了顺序。
2. **RRF 并列时关键词路优先**:专有名词靠字面命中,同一分数下让它上前(单测覆盖)。

## 改动点

1. `ensure_tables()`:加 `CREATE EXTENSION IF NOT EXISTS pg_trgm` + content 列建 GIN 三元组索引(两张表)
2. `kb.py`:`_query` 拆成 `_vector_query`(现有逻辑)+ 新增 `_keyword_query`(similarity 排序)
3. `search()`:两路各取 top_k → RRF 合并 → 返回
4. 语义调整:
   - 返回的 score 变成 RRF 分(排序键,不是置信度)
   - `score_threshold` 改为各路内部过滤:向量路 cos ≥ 0.25,关键词路 similarity ≥ 0.2
   - 关键词路只查主提供方表(内容与降级表重复,查两遍会重复计分)
5. 降级语义不变:embedding 故障照旧降级;关键词路只是融合方

## 明确不做的

- 时间类问题(「最近在哪家公司」)—— 留给 Task 6 的 Agent 推理

## 验收标准(真库)

1. 标定集新增专有名词题(jsPlumb / HZero / ip2region / OnlyOffice / Wepy),应命中对应项目块
2. 原 8 题不退化
3. 测试全绿(TDD:先写失败测试再改代码)

## 文件

- `app/kb.py`、`tests/test_kb.py`(aimyhome-agent 仓库)
- 真库重灌一次(`scripts/ingest --reset`)
