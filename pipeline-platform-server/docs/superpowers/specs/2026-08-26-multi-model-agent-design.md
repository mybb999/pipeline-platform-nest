# 设计文档：AI 聊天工具多模型切换（智谱 + 豆包）

- 日期：2026-08-26
- 状态：已批准（待实施）

## 1. 背景与问题

AI 聊天工具当前单一对接智谱 GLM-4.7-flash（`server/api/agent.ts` 通过 env `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY` 直连）。用户反馈：免费档响应慢、经常「卡住」（实为免费档限速约 5-10 次/分钟）。

豆包 doubao-seed-2-0-lite（火山方舟）每日免费额度 200 万 tokens（协作奖励计划，每日重置）、实测延迟更低（约 0.9s vs GLM 1.2s），是理想的第二选择。

目标：**页面下拉即可在智谱 / 豆包间切换**，服务端配置驱动，后续加模型零前端改动；API Key 不出服务端。

## 2. 目标架构

```
ChatPanel（前端）
  ├─ onMounted → GET /api/agent/models → 渲染下拉选择器（选中值存 localStorage）
  └─ send() → POST /api/agent { messages, model }

server/utils/llm.ts（新，配置驱动）
  ├─ LLM_PROVIDERS：provider 配置表（baseURL / model / apiKey 来源 env；key 为空自动隐藏）
  └─ resolveProvider(modelId)：白名单校验，未知 model 抛 400

server/api/agent/models.get.ts（新）：返回 [{ id, name, description }]
server/api/agent.post.ts（改）：按 model 路由到对应 provider，SSE 桥接与重试逻辑保留
```

关键决策：
- **模型列表单一事实来源在服务端**（前端不硬编码列表）
- **前端永远接触不到 API Key**（key 只在服务端 env）
- 白名单校验：客户端传入的 model id 不在配置表 → 400 拒绝
- 系统提示语与欢迎文案去掉「由智谱 GLM 驱动」硬编码，改为按所选模型动态描述

## 3. 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/utils/llm.ts` | 新建 | `LLM_PROVIDERS` 配置表、`resolveProvider`、`buildSystemPrompt(providerName)`、provider 类型定义 |
| `server/api/agent/models.get.ts` | 新建 | GET 模型列表（自动过滤未配 key 的 provider） |
| `server/api/agent.ts` | 改写 | 现文件改为 `server/api/agent.post.ts`（POST-only）+ 读取 body.model 路由 provider；保留 SSE 桥接、429/5xx 重试、错误提取 |
| `components/agent/ChatPanel.vue` | 改写 | 头部加模型下拉选择器；请求带 model；欢迎文案通用化；流式中禁用切换；localStorage 记忆选择 |
| `types/chat.ts` | 改写 | `AgentRequest` 增加 `model?: string`；新增 `LLMModelInfo` 类型 |
| `.env.example`（或 README 说明） | 新建/补充 | `DOUBAO_API_KEY` 等变量说明 |

不动：ChatMessage 组件、SSE 解析逻辑主体、`thinking: {type:'disabled'}`（豆包同形支持）、既有 1305/429/5xx 重试。

## 4. 数据流与接口

### GET /api/agent/models

```json
{ "models": [ { "id": "glm", "name": "智谱 GLM-4.7-Flash", "description": "永久免费 · 中文强" },
              { "id": "doubao", "name": "豆包 Seed-2.0-Lite", "description": "每日免费 200 万 · 低延迟" } ] }
```

未配置 key 的 provider 不出现在列表。默认排序：doubao 在前（当前主推），glm 在后。

### POST /api/agent

```json
{ "model": "doubao", "messages": [ ... ] }
```

- `model` 缺省时用列表第一个可用 provider（向后兼容：不带 model 的旧调用仍可用）
- `model` 未知 → 400 `unknown model`
- provider 请求失败：保留现有重试（429/5xx/1305 重试一次），最终失败返回 502 + 可读错误；前端错误横幅提示「可尝试切换模型」

### provider 配置

| id | baseURL | model | key env | 备注 |
|----|---------|-------|---------|------|
| `doubao` | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-lite-260215` | `DOUBAO_API_KEY` | 模型 ID 版本化，集中配置便于升级 |
| `glm` | env `LLM_BASE_URL`（缺省智谱地址） | env `LLM_MODEL`（缺省 `glm-4.7-flash`） | `LLM_API_KEY` | 兼容现有 env |

## 5. 前端交互

- 选择器位置：ChatPanel 头部「AI 驱动 · 智能助手」右侧，chip 风格下拉（Midnight Slate 深色主题，与现有按钮/chip 视觉一致）
- 状态：选中值存 `localStorage('agent-model')`；`onMounted` 拉列表后恢复选中（选中的 id 已不存在则回退列表第一项）
- 流式回复中：选择器 `disabled`（防止流中断期间切换导致归属混乱）
- 切换语义：只影响后续消息，**不自动清空**已有对话
- 欢迎文案：改为「由智谱 GLM-4.7-Flash / 豆包 Seed-2.0-Lite 双模型驱动」

## 6. 部署准备（用户操作步骤）

1. 登录 [火山方舟控制台](https://console.volcengine.com/ark)（火山引擎账号）
2. 「开通管理」→ 开通模型 `doubao-seed-2-0-lite`
3. 「API Key 管理」→ 创建 API Key，复制保存
4. 本地 `.env` 添加 `DOUBAO_API_KEY=<key>`；Vercel 项目环境变量（Settings → Environment Variables）同样添加，部署后生效
5. 建议参与「协作奖励计划」领取每日 200 万 tokens 免费额度

## 7. 验证计划

1. 未配 `DOUBAO_API_KEY` 时：`GET /api/agent/models` 只返回 glm；前端下拉只显示智谱
2. 配置后：下拉出现两模型；各选一次发同一问题，豆包应明显更低延迟，回答正常流式渲染
3. 切换只影响后续消息；流式中选择器禁用；刷新页面记住上次选择
4. 传入未知 model id → 400；不带 model → 用默认 provider 正常回答
5. `npm run build` 通过；现有 ai-agent 页面其他功能无回归
