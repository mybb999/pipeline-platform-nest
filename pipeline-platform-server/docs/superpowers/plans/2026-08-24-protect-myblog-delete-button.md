# 保护 Myblog 应用删除按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在前端禁用 `test@test.com` 账号下 `Myblog` 应用的删除按钮（置灰 + 悬停提示），防止演示时被误删。

**Architecture:** 仅改前端 `pipeline-platform-web` 一个文件 `AppManage.vue`。用 `useAuthStore` 拿当前登录 email，与行数据 `name` 双重匹配判断受保护行；受保护行渲染 disabled 按钮 + el-tooltip，普通行保持原 `el-popconfirm` 流程。后端不动。

**Tech Stack:** Vue 3 (`<script setup>` + TS) · Element Plus (`el-tooltip` / `el-popconfirm` / `el-button`) · Pinia (`useAuthStore`)

## Global Constraints

- 识别规则：`email === 'test@test.com'` 且 `name === 'Myblog'` 同时满足才禁用
- 悬停提示文案：`演示应用不可删除`（一字不差）
- 代码层面仅修改 `pipeline-platform-web/src/pages/AppManage.vue`；后端 API 不改
- 前端无测试框架，自动化验证 = `npm run build`（vue-tsc + vite build）+ 手动验证
- 参考规格：`pipeline-platform-server/docs/superpowers/specs/2026-08-24-protect-myblog-delete-button-design.md`

---

### Task 1: AppManage.vue 增加保护逻辑与模板分支

**Files:**
- Modify: `pipeline-platform-web/src/pages/AppManage.vue`（script 区：1-8 行附近导入、51-55 行状态定义；template 区：30-38 行操作列）

**Interfaces:**
- Consumes: `useAuthStore`（`pipeline-platform-web/src/stores/auth.ts`，已有，暴露 `user: { id: number; email: string } | null`）
- Produces: `isProtectedApp(row: AppInfo): boolean` — 后续任务不依赖，仅本文件模板使用

- [ ] **Step 1: 修改 script 区 — 导入 useAuthStore**

在 `AppManage.vue` 的 `<script setup lang="ts">` 中，把导入区改为：

```ts
import { ref, onMounted } from 'vue'
import { createApp, listApps, deleteApp } from '../api/app'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
```

- [ ] **Step 2: 添加 PROTECTED_APP 常量**

紧接导入之后（`interface AppInfo` 之前）添加：

```ts
// 受保护的演示应用：该账号下此名称的应用不允许在前端删除
// 详见 pipeline-platform-server/docs/superpowers/specs/2026-08-24-protect-myblog-delete-button-design.md
const PROTECTED_APP = { email: 'test@test.com', name: 'Myblog' }
```

- [ ] **Step 3: 添加 isProtectedApp 判断函数**

在 `const loading = ref(false)` 之后添加：

```ts
const authStore = useAuthStore()

const isProtectedApp = (row: AppInfo) =>
  authStore.user?.email === PROTECTED_APP.email && row.name === PROTECTED_APP.name
```

- [ ] **Step 4: 修改操作列模板**

把操作列（原 30-38 行）替换为：

```vue
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-tooltip v-if="isProtectedApp(row)" content="演示应用不可删除" placement="top">
              <span>
                <el-button type="danger" size="small" disabled>删除</el-button>
              </span>
            </el-tooltip>
            <el-popconfirm v-else title="确定删除该应用？" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
```

说明：disabled 按钮不响应鼠标事件，`el-tooltip` 必须包在 `<span>` 外层才能显示悬停提示；受保护行不套 `el-popconfirm`，点击无任何反应。

- [ ] **Step 5: 运行构建验证**

Run: `cd f:/AIproject/pipeline-platform-nest/pipeline-platform-web && npm run build`
Expected: `vue-tsc -b` 无类型错误，`vite build` 正常产出 dist

- [ ] **Step 6: Commit**

```bash
cd f:/AIproject/pipeline-platform-nest
git add pipeline-platform-web/src/pages/AppManage.vue
git commit -m "feat: 前端禁用演示账号 Myblog 应用删除按钮（置灰+提示）"
```

---

### Task 2: 手动验证与文档收尾

**Files:**
- Modify: `pipeline-platform-server/docs/development-guide.md`（Task 8 节末尾，约 262 行"安全设计"代码块之后）

**Interfaces:**
- Consumes: Task 1 完成的 `AppManage.vue`

- [ ] **Step 1: 启动前后端并手动验证**

后端：`cd f:/AIproject/pipeline-platform-nest/pipeline-platform-server && npm run dev`
前端：`cd f:/AIproject/pipeline-platform-nest/pipeline-platform-web && npm run dev`

逐一验证三场景，全部符合才通过：

| 场景 | 预期 |
|---|---|
| test@test.com 登录，查看 Myblog 行 | 删除按钮置灰、悬停显示"演示应用不可删除"、点击无反应 |
| test@test.com 登录，查看其他应用行 | 删除按钮正常，弹确认框后可删除 |
| 其他账号登录（若该账号也有名为 Myblog 的应用） | 删除按钮正常可删 |

若环境无法登录 test@test.com，如实记录"未验证"并报告，不得宣称已验证。

- [ ] **Step 2: 更新开发文档**

在 `pipeline-platform-server/docs/development-guide.md` 的 Task 8 节末尾（"安全设计" SQL 代码块之后、`---` 分隔线之前）追加：

```markdown
**前端演示保护：**
`test@test.com` 账号下 `Myblog` 应用的前端删除按钮已禁用（置灰 + 悬停提示，仅前端）。
设计见 `docs/superpowers/specs/2026-08-24-protect-myblog-delete-button-design.md`。
```

- [ ] **Step 3: Commit**

```bash
cd f:/AIproject/pipeline-platform-nest
git add pipeline-platform-server/docs/development-guide.md
git commit -m "docs: 记录 Myblog 前端删除保护到开发指南"
```

- [ ] **Step 4: 汇报结果**

如实汇报：构建结果、三个手动验证场景的通过/未验证情况、两个 commit 的 hash。
