# AI Agent v1.0 设计文档

**日期**: 2026-06-10
**版本**: v1.0
**状态**: 待审核

---

## 1. 概述

为 Lucas Space 个人网站新增一个 AI Agent 页面，访问者可以与 AI 进行多轮文本对话。采用轻量架构（方案 A），在 Nuxt 3 项目内实现，无需额外基础设施。

### 核心目标

- 访问者可在 `/ai-agent` 页面与 AI 聊天
- 支持 Markdown 渲染 + 代码语法高亮
- 流式逐字输出，体验接近 ChatGPT/豆包
- API Key 仅存服务端，前端不可见
- 100% 复用现有 Midnight Slate 设计系统

### 非目标（v1.0 不做）

- 工具调用（联网搜索、代码执行）
- 对话持久化（刷新即清）
- 用户认证/多会话
- 文件上传

---

## 2. 技术选型

| 层面 | 选型 | 理由 |
|------|------|------|
| LLM | 智谱 GLM-4-Flash | 永久免费、中文强、OpenAI 兼容格式 |
| API 代理 | Nuxt server/api/agent.ts | 保护 API Key，转发流式响应 |
| 前端框架 | Vue 3 Composition API | 项目已有 |
| Markdown | markdown-it | 轻量（~11KB）、插件生态 |
| 代码高亮 | highlight.js | Prism 替代，更小更快 |
| 流式传输 | SSE（Server-Sent Events） | Nuxt/Nitro 原生支持 ReadableStream |
| 样式 | Tailwind CSS | 项目已有，Midnight Slate Token |

---

## 3. 文件结构

```
新建:
  server/api/agent.ts              # LLM 转发代理（~60行）
  components/agent/ChatPanel.vue   # 聊天面板 + 流式逻辑（~150行）
  components/agent/ChatMessage.vue # 单条消息气泡（~40行）

修改:
  pages/ai-agent.vue               # 替换占位内容（~10行）
  docs/ARCHITECTURE.md             # 已更新

配置:
  .env                             # LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
```

---

## 4. 架构与数据流

```
浏览器                                       Nitro Server
┌──────────────────────────┐                ┌─────────────────────┐
│  ChatPanel.vue           │  POST /api/agent│  server/api/agent   │
│  messages[] ─────────────┼───────────────→│  1. 读 messages[]   │
│                          │                │  2. 拼 system prompt │
│  ← SSE 流式逐字追加 ─────┼────────────────│  3. fetch 智谱 API  │
│                          │                │  4. sendStream 转发  │
│  ChatMessage.vue         │                └──────────┬──────────┘
│  markdown-it 渲染        │                           │
└──────────────────────────┘              ┌───────────▼──────────┐
                                          │  智谱 GLM API        │
                                          │  glm-4-flash         │
                                          └──────────────────────┘
```

---

## 5. 组件设计

### 5.1 ChatMessage.vue

**职责**: 渲染单条对话消息

**Props**:
```typescript
interface Props {
  message: {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
  }
}
```

**行为**:
- `role === 'user'`: 右对齐，品牌主色背景（`bg-brand-accent/15`），纯文本
- `role === 'assistant'`: 左对齐，深色表面背景（`bg-surface-high`），Markdown 渲染
- 代码块使用 highlight.js 语法高亮
- 时间戳悬停显示（`text-label-sm text-on-surface-variant/60`）

### 5.2 ChatPanel.vue

**职责**: 聊天面板容器，管理消息列表 + 输入 + 流式逻辑

**状态**:
```typescript
const messages = ref<ChatMessage[]>([])
const input = ref('')
const isStreaming = ref(false)
const isThinking = ref(false)     // AI 思考中占位
const messagesContainer = ref<HTMLElement>()
```

**行为**:
- 发送：用户消息入列表 → POST `/api/agent` → 读取 SSE 流 → 逐字追加到 Assistant 消息
- 输入框：Enter 发送、Shift+Enter 换行、空内容禁用发送按钮、发送中禁用输入框
- 流式：TextDecoder 解析 ReadableStream → 提取 SSE `data:` 行 → JSON.parse → 追加 content → 自动滚动到底部
- 空状态：首次进入显示欢迎语 "👋 你好！我是 Lucas 的 AI 助手，有什么可以帮你的？"
- 错误状态：网络异常或 API 错误时显示提示 "生成失败，请重试"

**SSE 解析逻辑**（智谱兼容 OpenAI 格式）:
```typescript
// SSE 格式: "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n"
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6)
      if (data === '[DONE]') break
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          // 追加到当前 Assistant 消息
          lastAssistantMessage.content += content
        }
      } catch { /* 跳过解析失败的行 */ }
    }
  }
}
```

### 5.3 pages/ai-agent.vue（修改）

**修改前**: 静态占位文字 "AI Agent 模块建设中..."

**修改后**: `<ChatPanel />` 组件

保留现有的 `useHead` meta 信息。

---

## 6. API 设计

### 6.1 POST /api/agent

**请求**:
```json
{
  "messages": [
    { "role": "user", "content": "什么是 Vue 3？" }
  ]
}
```

**响应**: SSE 流式（`text/event-stream`）

**System Prompt**:
```
你是 Lucas Space 的 AI 助手，由智谱 GLM 驱动。
- 擅长前端开发、Vue 3、TypeScript、可视化等技术话题
- 回答风格：专业但不枯燥，像一位有 7 年经验的前端架构师
- 代码示例优先使用 TypeScript/Vue 3，带简要注释
- 不知道就说不知道，不编造
```

### 6.2 错误处理

| 场景 | HTTP 状态码 | 响应 |
|------|-----------|------|
| 请求体无 messages | 400 | `{ error: 'messages is required' }` |
| LLM API 不可用 | 502 | `{ error: 'AI service unavailable' }` |
| LLM 返回错误 | 502 | `{ error: 'LLM API error', detail: ... }` |
| 请求超时 | 504 | 前端显示 "回答超时，请重试" |

---

## 7. 配置

### 7.1 环境变量

```env
# 智谱 AI
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4-flash
```

### 7.2 依赖

```bash
npm install markdown-it highlight.js
npm install -D @types/markdown-it
```

---

## 8. 样式规范

全部使用 Midnight Slate 设计 Token（参考 `docs/DESIGN.md`）：

| 元素 | Token |
|------|-------|
| 用户气泡底色 | `bg-brand-accent/15` |
| AI 气泡底色 | `bg-surface-high` |
| 气泡边框 | `border-brand-border` |
| 输入框背景 | `bg-surface-high` |
| 发送按钮 | `bg-brand-accent hover:bg-brand-accent/80` |
| 文字颜色 | `text-on-surface` / `text-on-surface-variant` |
| 代码块背景 | `bg-brand-bg` |
| 滚动条 | 自定义细滚动条（`scrollbar-thin`） |

---

## 9. 验收标准

1. 访问 `http://localhost:3000/ai-agent`，看到聊天界面
2. 输入问题，AI 流式逐字回复，Markdown 正确渲染
3. 代码块语法高亮正常
4. Enter 发送、Shift+Enter 换行
5. 刷新页面对话消失（符合 v1.0 预期）
6. `npm run build` 构建无报错
7. API Key 不在浏览器 Network 面板中暴露
8. 移动端布局正常（单列垂直）
