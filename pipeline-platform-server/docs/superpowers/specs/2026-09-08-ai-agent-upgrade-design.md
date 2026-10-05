# AImyhome 博客 AI Agent 升级 —— 设计方案(定稿)

> 日期:2026-09-08
> 状态:**方案已与用户逐项确认定稿**;M1 实施计划已产出 → `docs/superpowers/plans/2026-09-08-m1-agent-profile-rag.md`(M2/M3/M4 按里程碑依次单独成计划)
> 定位:面试作品(目标岗位:Agent 方向)+ 博客产品升级,以「边做边学 + 每阶段可演示」为原则

---

## 1. 背景与目标

现有博客 AImyhome(Nuxt 3 + Vercel)有一个纯聊天 AI 助手(`/api/agent` SSE 代理 + ChatPanel.vue,由豆包/智谱驱动,**无 RAG、无工具、无记忆**)。本次升级为真正的 AI Agent,作为面试作品:

- **懂我的助手**:访客对「熊仔(刘俊雄)」个人资料问答 —— 知识型 RAG
- **读文档的助手**:用户上传 PDF/Word(可能含图片)→ MinerU 解析 → 对文档内容问答
- **MCP 能力**:检索等能力封装为 MCP Server,让 Claude Code / Claude Desktop 可调用
- **账号 + 会话记忆**:登录体系 + LangGraph checkpointer 持久化会话

## 2. 最终决策记录(已确认,不再讨论)

| # | 决策 | 结论 | 原因 |
|---|---|---|---|
| 1 | 面试定位 | **面试作品优先** | 决定技术路线选 Python |
| 2 | Agent 语言/框架 | **Python + LangGraph** | LangGraph 官方主场、资料/面试答案最多;TS 版(=方言)面试价值打折 |
| 3 | 代码归属 | **新建独立项目 `AImyhome-agent`**(放 AImyhome 旁边),博客一行 Python 不加 | TS/Python 依赖部署两套体系,天然两个项目 |
| 4 | 博客改动面 | 只改 2 处:`server/api/agent.post.ts`(改为转发 Agent 服务)、ChatPanel.vue(来源展示) | 博客变薄壳 |
| 5 | 知识源 | **只收简历** → 用户手动整理 `profile.md`(放 AImyhome-agent 项目内);**博客文章不收录**(内容是假的示例);以后慢慢补充 | 内容可控、面试可讲 |
| 6 | 向量库 | **pgvector**(Neon 免费 vs 服务器本机 Docker 二选一,买了服务器后**倾向本机自托管**,M1.2 定)**;不用 Milvus** | 数据量几千~几万 chunk,pgvector 毫秒级够;Milvus 是百万级/高并发/分布式场景;4G 机跑不动 Milvus 全家桶;选型理由本身是面试加分点(写入简历叙事) |
| 7 | 服务器 | **新购腾讯云 4核4G3M**(轻量),Agent + MinerU + 可选 pgvector 同机;2G pipeline 生产机**完全不动** | 内存账:系统 0.5G + Agent 0.5G + MinerU 常驻 1.5~2G + 峰值 1~2G,4G 是性价比甜点(加 2G swap);3M 出网带宽够(页面在 Vercel,上传走入网不限,SSE 仅 KB 级) |
| 8 | MCP 演示客户端 | **Claude Code(用户已有)**,不依赖 Claude Desktop(电脑没装);可选经 **CC Switch v3.5+** GUI 管理 MCP 配置(注意 CC Switch 只是配置管理器,真正执行工具的是 Claude Code) | Claude Desktop 需另装且依赖网络条件 |
| 9 | MinerU 顺序 | 排 **M4**,主线先跑通再加重活 | — |
| 10 | stats 工具 | **E1 暂缓扩展**(从 M4 降级),后面想做再加 | 先跑通主流程 |
| 11 | 会话记忆 | **M3**:LangGraph checkpointer(先 session_id,账号体系后置)→ 账号(JWT,照搬 pipeline 模式) | 补「刷新后对话消失」短板 + LangGraph 第二面试叙事 |
| 12 | LLM/embedding | 复用现有豆包 Seed-2.0-Lite / 智谱 GLM-4.7-Flash(OpenAI-compatible);embedding 用智谱/豆包 embedding API(M1.3 定) | 零新增成本 |

## 3. 目标架构

```
[博客 Nuxt · Vercel]              [Claude Code / Claude Desktop]
    │ HTTP + SSE                         │ MCP
    ▼                                    ▼
┌────────────────────────────────────────────────┐
│  AImyhome-agent 独立服务 (Python · 腾讯云 4核4G)  │
│  FastAPI + LangGraph 状态图                     │
│    └─ 工具层: search_profile(检索简历资料)        │
│         └─ pgvector(简历知识库,本机 Docker)      │
│    └─ (M4 起) MinerU 解析服务 + 临时知识库        │
└────────────────────────────────────────────────┘
```

**面试主线一句话**:同一份「工具」注册成两个入口 —— LangGraph 里是 Agent 工具,Claude Code 里是 MCP 工具;加能力只是往工具层注册一个工具。

## 4. 里程碑计划(执行序列 M1→M2→M3→M4,E1 暂缓)

### 准备线(并行,不占主线工期)

1. 下单腾讯云 4核4G3M(地域就近)
2. 域名接入备案(阿里云→腾讯云,管局审核 1~2 周,期间用 IP:8000 直连调试,备案过再绑域名 HTTPS)
3. 服务器装环境:加 2G swap → Docker → Nginx(模式参考 pipeline-platform-nest 的 deployment.md)
4. 本地装 Python 环境(用户无 Python 基础则 M1 前加 1~2 天热身)

### M1 · 懂我的助手 —— 10~14 天,¥0

| # | 任务 | 产出/验证 | 面试点 |
|---|---|---|---|
| 1.1 | 简历 → `profile.md`(用户手动整理,内容可控) | 1 份 md | — |
| 1.2 | 新建 `AImyhome-agent` 项目(FastAPI 骨架 + venv/uv) | localhost:8000 hello | Python 工程结构 |
| 1.3 | 知识库:pgvector 建库建表(内容+向量+来源)→ 切片 → embedding 入库脚本(本地跑一次) | 检索能命中简历 | embedding + 向量检索;**检索接口做抽象**,为将来换库留口 |
| 1.4 | LangGraph Agent:检索节点 → LLM 流式回答;收尾加「条件边」(判断是否需查资料) | 能答「熊仔做过什么」 | ★ 状态图/节点/边/条件边 |
| 1.5 | FastAPI + SSE;改博客 `agent.post.ts` 为转发 | 博客聊天走通 Agent 服务 | 流式 + 前后端分离 |
| 1.6 | 前端来源引用展示 | 答案下方显示资料出处 | — |
| 1.7 | 部署腾讯云(PM2/Docker + Nginx + HTTPS) | 公网可问 | 部署能力 |

### M2 · MCP Server —— 2~3 天,¥0

| # | 任务 | 产出/验证 | 面试点 |
|---|---|---|---|
| 2.1 | 同一个 `search_profile` 注册成 MCP 工具(Python MCP SDK) | MCP Server 能 list/call | ★ 工具注册复用 |
| 2.2 | Claude Code 接入(可经 CC Switch GUI 配置) | Claude Code 里问简历有答 | MCP 协议 |

### 🔖 验收点 1:博客 + Claude Code 双入口跑通 —— 主线闭环

### M3 · 会话记忆 + 账号体系 —— 4~6 天,¥0

| # | 任务 | 面试点 |
|---|---|---|
| 3.1 | LangGraph **checkpointer** 会话持久化(session_id,存 PG) | ★ 状态持久化 |
| 3.2 | 注册/登录/JWT(照搬 pipeline-platform-nest 的 auth 模式到 Nuxt),登录后会话归属账号 | JWT 用户体系 |

### 🔖 验收点 2:刷新对话不丢;登录后记忆归属账号

### M4 · MinerU 文档解析 —— 6~8 天,¥0(同机)

| # | 任务 | 说明 |
|---|---|---|
| 4.1 | 部署 MinerU 到 4G 机(拉模型、版面分析验证;加 2G swap、**解析任务串行**) | 先实测再定并发 |
| 4.2 | FastAPI `/parse` 接口(PDF/Word → Markdown) | curl 上传验证 |
| 4.3 | 浏览器**直传**解析服务器(绕 Vercel 请求体 ~4.5MB 限制,Nginx client_max_body_size)+ 临时知识库(session_id,24h 清理) | 前端拖文件上传 |
| 4.4 | 文档问答:解析结果切片入库,复用 M1 检索管道;文档库可挂账号下 + 上传 UI | 上传 PDF → 提问有答 |

### 🔖 验收点 3:上传 PDF/Word 可问答

**M4 设计补充(用户提出,2026-10-06 记录):「按意图入库」**

上传文件解析后**不默认入库** —— 由 LLM 判断访客意图:表达「长期存储/记住这个文件」之类话术 → 调 `save_document` 工具写进 pgvector;只是临时问问 → 不存。判断为「存」时 Agent 回问一句确认(「你是想让我长期记住这个文件吗?」)防误判。

- **面试点**:知识库治理(防「上传就入库」的垃圾堆积)、Agent 意图判断、确认式交互
- **实现**:给 Agent 加第二个工具 `save_document`(与 E1 `query_stats` 同一套路 —— 「加能力 = 注册一个工具」的又一实锤);意图判断依赖对话上下文 → 排在 M3(会话记忆)之后
- **与 4.4 的关系**:4.4 的「文档库挂账号」是存储机制(存哪),本设计是触发策略(何时存)

### 🔖 验收点 3:上传 PDF/Word 可问答

### E1 · stats 工具(暂缓,编号保留)

- 给 Agent 加第二个工具 `query_stats`:HTTP 调 pipeline-platform-nest 的 stats API;同时挂 MCP
- 演示「加能力 = 注册个工具」;工期 2~3 天

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 备案慢(1~2 周) | 并行处理;IP:8000 直连先调通,备案过再绑域名 |
| 4G 内存解析高峰 | 2G swap + 串行解析(M4.1 实测);MinerU 常驻 1.5~2G 正常 |
| pgvector 在 Neon(海外)网络不稳 | 已购服务器 → 本机 Docker 自托管 pgvector,零外部依赖 |
| Vercel 上传限制 | 浏览器直传解析服务器(不走 Vercel) |
| 账号合规(手机/邮箱验证资质) | 用户名+密码(JWT),不做短信验证,不涉及资质 |

## 6. 面试叙事(从 spec 到简历)

1. **LangGraph 状态图编排**(M1):不是玩具 if/else,是节点/边/状态的 Agent 图,含条件边
2. **MCP 工具复用**(M2):同一工具 = LangGraph 工具 + MCP 工具,「一套能力,多个入口」
3. **checkpointer 记忆**(M3):LangGraph 状态持久化,会话跨刷新恢复
4. **多模态文档解析**(M4):MinerU(版面分析+OCR)接入 RAG
5. **选型判断力**:pgvector vs Milvus 的评估理由(量级决定选型,接口抽象留了换库口)
6. **架构**:前端薄壳 + 独立 Agent 服务(MCP/HTTP 双协议对外)

## 7. 立即行动清单(下次对话开始前可先做)

- [ ] 下单腾讯云 4核4G3M + 提交域名接入备案(并行,别等开发)
- [ ] 用户整理简历 → profile.md(内容想好放哪:AImyhome-agent 项目内)
- [ ] 本地装 Python(官网安装包即可,装时勾 Add to PATH)
- [ ] 服务器到手后:加 2G swap → Docker → Nginx

## 8. 规范引用

- 博客代码规范:AImyhome/CLAUDE.md(组件 `<script setup lang="ts">`、类型在 types/、API 在 server/api/)
- 部署模式参考:pipeline-platform-nest/pipeline-platform-server/docs/deployment.md(swap/PM2/Nginx/certbot)
- 用户工作偏好:**写代码前先讨论方案并确认**;每任务完成后更新开发文档并随代码提交;中文沟通;一次一件事;边做边学解释原因;旧项目 pipeline-platform-server 冻结不可修改(只读参考)
