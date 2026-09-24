# AI 聊天工具多模型切换（智谱+豆包）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 AI 聊天工具增加服务端配置驱动的多模型支持（豆包 + 智谱），前端下拉切换、Key 不出服务端。

**Architecture:** 服务端新增 provider 配置表与白名单校验（`server/utils/llm.ts`），`GET /api/agent/models` 下发可用模型，`POST /api/agent` 按 `model` 字段路由到对应 provider 并保留 SSE 桥接；ChatPanel 头部加下拉选择器，选择存 localStorage。

**Tech Stack:** Nuxt 3.12.4（Nitro server utils + SSR）、Vue 3.5 Composition API、Tailwind CSS（Midnight Slate Token）。

## Global Constraints

- 所有 Vue 组件使用 `<script setup lang="ts">` + Composition API（CLAUDE.md）
- 服务端文件用显式 import（沿用 `server/api/agent.ts` 现有风格），不用隐式 auto-import 依赖
- API Key 只出现在服务端 env（`LLM_API_KEY` / `DOUBAO_API_KEY`），任何前端代码不得接触
- 样式用 Tailwind 类名 + `docs/DESIGN.md` 语义 Token；新 UI 视觉与现有 chip/按钮一致
- 本地 `.env` 已有 `LLM_API_KEY`（GLM 可用）；`.env` 已 gitignore，永远不提交
- `npm run build` 与 dev 服务器互斥：先 `taskkill //F //PID $(netstat -ano | grep ":3000.*LISTEN" | head -1 | awk '{print $NF}')` 停 dev 再构建；构建后再启 dev 做 curl/浏览器断言
- dev 服务器只监听 IPv6 `[::1]:3000`，curl 用 `http://localhost:3000`
- 提交信息风格：`feat:` / `refactor:` + 中文描述；工作区其他未提交改动不得 add

---

### Task 1: 类型扩展与 provider 配置表

**Files:**
- Modify: `types/chat.ts`
- Create: `server/utils/llm.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `types/chat.ts`：`AgentRequest.model?: string`、`LLMModelInfo { id: string; name: string; description: string }`
  - `server/utils/llm.ts`：`LLMProvider { id; name; description; baseURL; model; apiKey?: string }`、`LLM_PROVIDERS: LLMProvider[]`（数组顺序即默认优先级，doubao 在前）、`availableProviders(): LLMProvider[]`（过滤无 key 项）、`resolveProvider(modelId?: string): LLMProvider`（无 model 返回第一可用；未知抛 400 `unknown model: <id>`；全部无 key 抛 500 `LLM API key not configured`）、`buildSystemPrompt(providerName: string): string`

- [ ] **Step 1: 扩展 types/chat.ts**

在文件末尾 `AgentRequest` 接口改为：

```ts
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

（`ChatMessage` 与 `generateMessageId` 保持不变）

- [ ] **Step 2: 创建 server/utils/llm.ts**

```ts
/**
 * LLM provider registry — config-driven so adding a model needs zero frontend changes.
 * Providers without a configured API key are hidden from the frontend list.
 */

export interface LLMProvider {
  id: string
  name: string
  description: string
  baseURL: string
  model: string
  apiKey?: string
}

const DEFAULT_ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const DEFAULT_ZHIPU_MODEL = 'glm-4.7-flash'
const DOUBAO_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const DOUBAO_MODEL = 'doubao-seed-2-0-lite-260215'

/** Registry order = default priority (first available wins when client omits model) */
export const LLM_PROVIDERS: LLMProvider[] = [
  {
    id: 'doubao',
    name: '豆包 Seed-2.0-Lite',
    description: '每日免费 200 万 · 低延迟',
    baseURL: DOUBAO_BASE,
    model: DOUBAO_MODEL,
    apiKey: process.env.DOUBAO_API_KEY,
  },
  {
    id: 'glm',
    name: '智谱 GLM-4.7-Flash',
    description: '永久免费 · 中文强',
    baseURL: process.env.LLM_BASE_URL || DEFAULT_ZHIPU_BASE,
    model: process.env.LLM_MODEL || DEFAULT_ZHIPU_MODEL,
    apiKey: process.env.LLM_API_KEY,
  },
]

/** Providers usable right now (key configured) */
export function availableProviders(): LLMProvider[] {
  return LLM_PROVIDERS.filter(p => !!p.apiKey)
}

/** Whitelist resolve: unknown model id → 400 */
export function resolveProvider(modelId?: string): LLMProvider {
  const providers = availableProviders()
  if (providers.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'LLM API key not configured' })
  }
  if (!modelId) return providers[0]!
  const provider = providers.find(p => p.id === modelId)
  if (!provider) {
    throw createError({ statusCode: 400, statusMessage: `unknown model: ${modelId}` })
  }
  return provider
}

/** System prompt with the driving provider's name filled in */
export function buildSystemPrompt(providerName: string): string {
  return `你是 熊仔 的 AI 助手，由 ${providerName} 驱动。你的特点：
- 擅长Node全栈、前端开发、Vue 2、Vue 3、React、TypeScript、可视化等技术话题，包含所有前端技术栈以及Node相关的框架，例如Next和Nest后端技术栈
- 回答风格：专业但不枯燥，像一位有 7 年经验的前端架构师
- 代码示例优先使用 TypeScript/Vue 3，带简要注释
- 不知道就说不知道，不编造`
}
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: `Build complete`，无类型报错

- [ ] **Step 4: Commit**

```bash
git add types/chat.ts server/utils/llm.ts
git commit -m "feat: 新增 LLM provider 配置表与白名单校验（llm.ts）"
```

---

### Task 2: agent 接口按 model 路由 provider

**Files:**
- Rename: `server/api/agent.ts` → `server/api/agent.post.ts`（git mv 后改写内容）

**Interfaces:**
- Consumes: Task 1 的 `resolveProvider`、`buildSystemPrompt`（`import { resolveProvider, buildSystemPrompt } from '~/server/utils/llm'`）
- Produces: `POST /api/agent` 行为契约：body `{ messages, model? }`；未知 model → 400；未带 model → 默认第一可用 provider；SSE 流格式与现有完全一致

- [ ] **Step 1: git mv 并改写文件**

```bash
git mv server/api/agent.ts server/api/agent.post.ts
```

将 `server/api/agent.post.ts` 整文件替换为：

```ts
/**
 * AI Agent API endpoint — proxies chat requests to the selected LLM provider.
 * Uses SSE streaming for real-time token-by-token output.
 */

import { PassThrough } from 'node:stream'
import type { AgentRequest } from '~/types/chat'
import { resolveProvider, buildSystemPrompt } from '~/server/utils/llm'

// Provider error body: {"error":{"code":"...","message":"..."}}
function extractLlmErrorMessage(text: string): string {
  try {
    const message = JSON.parse(text)?.error?.message
    if (message) return message
  } catch {
    // keep raw text
  }
  return `LLM API error: ${text.slice(0, 200)}`
}

export default defineEventHandler(async (event) => {
  const body = await readBody<AgentRequest>(event)

  // Validate
  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  const { messages } = body

  // Route to the selected provider (whitelist-checked)
  const provider = resolveProvider(body.model)
  const apiKey = provider.apiKey!

  // Prepend system prompt (named after the selected provider)
  const fullMessages = [
    { role: 'system', content: buildSystemPrompt(provider.name) },
    ...messages,
  ]

  const baseUrl = provider.baseURL.replace(/\/$/, '')

  // Call provider API with streaming
  // thinking disabled → instant answers, no reasoning_content chunks
  const requestOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: fullMessages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
      thinking: { type: 'disabled' },
    }),
  }

  let llmResponse: Response
  try {
    llmResponse = await fetch(`${baseUrl}/chat/completions`, requestOptions)
  } catch (err) {
    throw createError({ statusCode: 502, statusMessage: 'AI service unavailable' })
  }

  let errorText = ''
  if (!llmResponse.ok) {
    errorText = await llmResponse.text().catch(() => 'Unknown error')
    // Free tier occasionally returns rate-limit/overload errors — retry once
    const retriable = llmResponse.status === 429 || llmResponse.status >= 500 || errorText.includes('1305')
    if (retriable) {
      await new Promise(resolve => setTimeout(resolve, 1200))
      try {
        llmResponse = await fetch(`${baseUrl}/chat/completions`, requestOptions)
      } catch {
        throw createError({ statusCode: 502, statusMessage: 'AI service unavailable' })
      }
      if (!llmResponse.ok) {
        errorText = await llmResponse.text().catch(() => 'Unknown error')
      }
    }
    if (!llmResponse.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: extractLlmErrorMessage(errorText),
      })
    }
  }

  // Bridge web ReadableStream → Node.js PassThrough for Nuxt's sendStream
  const webStream = llmResponse.body!
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

- [ ] **Step 2: 验证（先停 dev 构建，再启 dev 做 curl 断言）**

```bash
npm run build   # 期望 Build complete
npm run dev &   # 后台启动（等待就绪后再继续）
timeout 90 bash -c 'until curl -sf http://localhost:3000/api/agent/models >/dev/null 2>&1; do sleep 2; done'
```

未知模型 → 400：

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"model":"nope"}'
# 期望输出: 400
```

不带 model 走默认（本地 GLM key 已配）→ 应返回 SSE 流：

```bash
curl -s -N -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"说一个字：好"}]}' | head -c 400
# 期望: 出现 data: 开头的 SSE 分片，无 4xx/5xx JSON 错误体
```

- [ ] **Step 3: Commit**

```bash
git add server/api/agent.post.ts
git commit -m "feat: agent 接口按 model 路由 provider（豆包/智谱）"
```

---

### Task 3: 模型列表接口

**Files:**
- Create: `server/api/agent/models.get.ts`

**Interfaces:**
- Consumes: Task 1 的 `availableProviders`
- Produces: `GET /api/agent/models` → `{ models: Array<{ id, name, description }> }`（自动过滤未配 key 的 provider，doubao 在前）

- [ ] **Step 1: 创建 server/api/agent/models.get.ts**

```ts
import { availableProviders } from '~/server/utils/llm'

export default defineEventHandler(() => {
  return {
    models: availableProviders().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
    })),
  }
})
```

- [ ] **Step 2: 验证**

dev 服务器运行中时执行：

```bash
curl -s http://localhost:3000/api/agent/models
# 期望（本地未配 DOUBAO_API_KEY 时）: {"models":[{"id":"glm","name":"智谱 GLM-4.7-Flash","description":"永久免费 · 中文强"}]}
```

- [ ] **Step 3: 验证构建并提交**

```bash
npm run build   # 期望 Build complete
git add server/api/agent/models.get.ts
git commit -m "feat: 新增 /api/agent/models 模型列表接口"
```

---

### Task 4: ChatPanel 模型选择器

**Files:**
- Modify: `components/agent/ChatPanel.vue`

**Interfaces:**
- Consumes: Task 3 的 `GET /api/agent/models` 响应形状；Task 1 的 `LLMModelInfo` 类型（`import type { ChatMessage, LLMModelInfo } from '~/types/chat'`）
- Produces: 前端行为契约：列表空或仅 1 项时不渲染选择器；流式中禁用；选中存 `localStorage('agent-model')`；`send()` 请求体带 `model`

- [ ] **Step 1: 修改模板 header 区**

将现有：

```vue
    <div class="flex items-center justify-between pb-4 border-b border-brand-border shrink-0">
      <div>
        <h1 class="text-headline-lg text-on-surface flex items-center gap-3">
          🤖 聊天工具
        </h1>
        <p class="mt-1 text-body-md text-on-surface-variant">
          AI 驱动 · 智能助手
        </p>
      </div>
      <button v-if="messages.length > 0" class="btn-ghost text-body-sm" :disabled="isStreaming" @click="clearChat">
        清空对话
      </button>
    </div>
```

替换为：

```vue
    <div class="flex items-center justify-between pb-4 border-b border-brand-border shrink-0">
      <div>
        <h1 class="text-headline-lg text-on-surface flex items-center gap-3">
          🤖 聊天工具
        </h1>
        <p class="mt-1 text-body-md text-on-surface-variant">
          AI 驱动 · 智能助手
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Model selector -->
        <div v-if="models.length > 1" class="relative">
          <button
            class="chip cursor-pointer hover:bg-surface-high/50 transition-colors"
            :disabled="isStreaming"
            :title="isStreaming ? '回复生成中，暂不可切换' : '切换模型'"
            @click="showModelMenu = !showModelMenu"
          >
            <span class="status-dot" />
            <span>{{ currentModelName }}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div v-if="showModelMenu" class="fixed inset-0 z-10" @click="showModelMenu = false" />
          <div v-if="showModelMenu" class="absolute right-0 top-full mt-2 w-64 card p-2 z-20 space-y-1">
            <button
              v-for="m in models"
              :key="m.id"
              class="w-full text-left px-3 py-2 rounded-lg text-body-md transition-colors"
              :class="selectedModel === m.id
                ? 'text-brand-accent bg-brand-accent/10'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/50'"
              @click="selectModel(m.id)"
            >
              <div class="font-medium">{{ m.name }}</div>
              <div class="text-label-sm text-on-surface-variant/60">{{ m.description }}</div>
            </button>
          </div>
        </div>

        <button v-if="messages.length > 0" class="btn-ghost text-body-sm" :disabled="isStreaming" @click="clearChat">
          清空对话
        </button>
      </div>
    </div>
```

- [ ] **Step 2: 修改欢迎文案与错误横幅**

欢迎文案（空状态 `<p class="mt-2 ...">` 内文字）改为：

```
由智谱 GLM-4.7-Flash / 豆包 Seed-2.0-Lite 双模型驱动。我可以聊 Node 全栈、前端开发、Vue、React、TypeScript、可视化等技术话题，有什么想了解的？
```

错误横幅（`errorMessage` 的 div 内、`<span>{{ errorMessage }}</span>` 之后、✕ 按钮之前）插入：

```vue
        <span v-if="models.length > 1" class="text-label-sm text-on-surface-variant/60">可尝试切换模型重试</span>
```

- [ ] **Step 3: 修改 script**

import 行改为：

```ts
import type { ChatMessage, LLMModelInfo } from '~/types/chat'
import { generateMessageId } from '~/types/chat'
```

在 State 区追加：

```ts
const models = ref<LLMModelInfo[]>([])
const selectedModel = ref('')
const showModelMenu = ref(false)

const currentModelName = computed(() =>
  models.value.find(m => m.id === selectedModel.value)?.name || 'AI 助手'
)
```

新增函数（放在 `clearChat` 之后、`Lifecycle` 之前）：

```ts
// ── Model selection ──
function selectModel(id: string) {
  selectedModel.value = id
  showModelMenu.value = false
  localStorage.setItem('agent-model', id)
}
```

`send()` 的 fetch body 改为：

```ts
      body: JSON.stringify({ messages: requestMessages, model: selectedModel.value || undefined }),
```

`onMounted` 现有逻辑之后追加模型列表加载：

```ts
  // Load available models (selector hidden when list has <2 entries)
  try {
    const res = await fetch('/api/agent/models')
    if (res.ok) {
      const data = await res.json()
      models.value = data.models || []
      const saved = localStorage.getItem('agent-model')
      selectedModel.value = models.value.some(m => m.id === saved)
        ? saved!
        : (models.value[0]?.id || '')
    }
  } catch {
    // keep selector hidden — chat still works with server default
  }
```

- [ ] **Step 4: 浏览器验证**

dev 服务器运行中，用 `%TEMP%/pw-driver` 的 playwright-core + Edge 跑（若目录不存在先 `mkdir -p "$TEMP/pw-driver" && cd "$TEMP/pw-driver" && npm init -y >/dev/null 2>&1 && npm i playwright-core --no-audit --no-fund`）：

创建 `sel.js`：

```js
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/EdgeCore/148.0.3967.96/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000/ai-agent', { waitUntil: 'commit' });
  await page.waitForSelector('textarea', { timeout: 60000 });
  await sleep(1500);
  // 本地未配 DOUBAO_API_KEY：只有 1 个模型 → 选择器不应渲染
  const chipCount = await page.locator('button.chip').count();
  console.log('selector chip count (expect 0 with only glm):', chipCount);
  if (chipCount !== 0) process.exitCode = 1;
  // 发送一条消息验证 SSE 仍工作（用户消息本身含「好」字，需出现 ≥2 次才算收到回复）
  await page.fill('textarea', '回复一个字：好');
  await page.click('button:has-text("发送")');
  await page.waitForFunction(() => {
    const t = document.querySelector('main').textContent;
    return (t.match(/好/g) || []).length >= 2;
  }, { timeout: 60000 });
  console.log('got response: YES');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
```

Run: `node sel.js`
Expected: `selector chip count (expect 0 with only glm): 0` 且 `got response: YES`，退出码 0（GLM 免费档较慢，60s 超时足够）

- [ ] **Step 5: 验证构建并提交**

```bash
npm run build   # 期望 Build complete
git add components/agent/ChatPanel.vue
git commit -m "feat: ChatPanel 增加模型下拉选择器（localStorage 记忆、流式中禁用）"
```

---

### Task 5: 豆包路由验证（假 key）+ 收尾

**Files:**
- Create: `.env.example`
- Modify: `devlog/2026-08-26.md`（新建今日日志）

**Interfaces:**
- Consumes: Task 2 的 provider 路由、Task 3 的列表接口、Task 4 的选择器

- [ ] **Step 1: 假 key 验证豆包路由**

在 `.env` 临时追加一行 `DOUBAO_API_KEY=fake-key-for-routing-test`（**验证后必须删除**），重启 dev：

```bash
curl -s http://localhost:3000/api/agent/models
# 期望: doubao 出现在列表首位，glm 第二
curl -s -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"model":"doubao"}' | head -c 300
# 期望: 返回 502 JSON，错误信息来自火山方舟（AuthenticationError/InvalidApiKey 之类）
#       —— 说明请求确实路由到了 ark.cn-beijing.volces.com（baseURL/model 正确）
```

浏览器验证选择器出现与刷新记忆（`%TEMP%/pw-driver` 下创建 `sel2.js`）：

```js
const { chromium } = require('playwright-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/EdgeCore/148.0.3967.96/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:3000/ai-agent', { waitUntil: 'commit' });
  await page.waitForSelector('textarea', { timeout: 60000 });
  await sleep(1500);
  // 两个模型 → 选择器渲染，显示当前模型名
  const chip = page.locator('button.chip');
  console.log('chip count (expect 1):', await chip.count());
  console.log('chip text:', (await chip.first().textContent())?.trim());
  // 打开菜单选 glm
  await chip.first().click();
  await page.click('div.card button:has-text("智谱")');
  await sleep(300);
  console.log('after select:', (await page.locator('button.chip').first().textContent())?.trim());
  // 刷新页面 → localStorage 记忆应恢复为 glm
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('textarea', { timeout: 60000 });
  await sleep(1500);
  console.log('after reload:', (await page.locator('button.chip').first().textContent())?.trim());
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
```

Run: `node sel2.js`
Expected: chip count 1；chip text 初始含「豆包」（默认第一个可用）；选智谱后含「智谱」；刷新后仍含「智谱」（localStorage 记忆生效）

验证后从 `.env` 删除 `DOUBAO_API_KEY` 行并重启 dev，再确认 `curl -s http://localhost:3000/api/agent/models` 恢复为只有 glm。

- [ ] **Step 2: 创建 .env.example**

```bash
# LLM 服务商配置（复制为 .env 后填写）
# 智谱（GLM）— 当前默认
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4.7-flash
LLM_API_KEY=

# 豆包（火山方舟）— 可选；配置后前端下拉自动出现豆包选项
DOUBAO_API_KEY=
```

- [ ] **Step 3: 最终构建**

Run: `npm run build`
Expected: `Build complete`

- [ ] **Step 4: 更新开发日志**

创建 `devlog/2026-08-26.md`（模板同 `devlog/TEMPLATE.md`），「已完成事项」含：

```markdown
- [x] AI 聊天工具多模型支持：服务端 provider 配置表 + 白名单校验（server/utils/llm.ts），GET /api/agent/models 模型列表，POST /api/agent 按 model 路由（豆包 doubao-seed-2-0-lite-260215 / 智谱 glm-4.7-flash），ChatPanel 下拉选择器（localStorage 记忆、流式中禁用）
```

「待办事项」含：

```markdown
- [ ] 注册火山方舟并配置 DOUBAO_API_KEY（本地 .env + Vercel 环境变量）后实测豆包
```

- [ ] **Step 5: Commit**

```bash
git add .env.example devlog/2026-08-26.md
git commit -m "docs: 环境变量示例与开发日志（多模型功能）"
```

---

## 完成标准

- `POST /api/agent` 未带 model 走默认 provider（本地为 glm）且 SSE 正常；未知 model 返回 400
- `GET /api/agent/models` 按 key 配置过滤列表
- ChatPanel：本地仅 glm 时不显示选择器（`models.length > 1` 条件）；假 key 场景下选择器出现且请求路由到豆包
- `.env.example` 存在；本地 `.env` 无残留 fake key
- `npm run build` 通过；各任务独立 commit
