# 保护 Myblog 应用删除按钮 — 设计文档

日期：2026-08-24

## 背景

`test@test.com` 是共享演示账号，其下的 `Myblog` 应用承载演示数据。演示时任何人都可能用该账号登录并误删 `Myblog`，导致演示环境被破坏。需要在前端禁用该应用的删除按钮。

## 目标

- `test@test.com` 账号登录时，应用列表中名称为 `Myblog` 的应用，删除按钮置灰禁用，悬停提示"演示应用不可删除"。
- 其他账号、其他应用完全不受影响。

## 范围

**仅前端** `pipeline-platform-web`，后端 API 不变。

已确认的限制：前端按钮禁用可被绕过，直接调 `DELETE /api/apps/:id` 仍能删除（后端目前只有归属校验）。用户已知悉并接受此限制。

## 方案

### 识别规则

同时满足两个条件才禁用：

1. 当前登录用户 `email === 'test@test.com'`（来自 `useAuthStore` 的 `user.email`）
2. 应用行数据 `name === 'Myblog'`（来自 `GET /apps` 列表响应）

用 email + name 双重匹配：只有演示账号自己登录时才生效，其他账号的同名应用不受影响。

维护说明：若演示应用改名或更换演示账号，需同步更新 `PROTECTED_APP` 常量。

### 改动点（仅 `pipeline-platform-web/src/pages/AppManage.vue` 一个文件）

1. 文件顶部定义常量：

   ```ts
   // 受保护的演示应用：该账号下此名称的应用不允许在前端删除
   const PROTECTED_APP = { email: 'test@test.com', name: 'Myblog' }
   ```

2. 引入 `useAuthStore`，新增判断函数：

   ```ts
   const authStore = useAuthStore()
   const isProtectedApp = (row: AppInfo) =>
     authStore.user?.email === PROTECTED_APP.email && row.name === PROTECTED_APP.name
   ```

3. 操作列模板分支渲染（现状为 [AppManage.vue:30-38](pipeline-platform-web/src/pages/AppManage.vue#L30-L38)）：
   - 受保护行：`el-tooltip`（content="演示应用不可删除"）包一层 `<span>`，内部为 `:disabled` 的 danger 删除按钮，不套 `el-popconfirm`。disabled 按钮不响应点击，不会触发删除。
   - 普通行：保持现有 `el-popconfirm` + 删除按钮不变。

### Element Plus 细节

- disabled 的 `<el-button>` 不触发鼠标事件，`el-tooltip` 直接挂在 disabled 按钮上不会显示提示，必须将 tooltip 包在 `<span>` 外层。
- 判断函数取 `authStore.user?.email`，未登录状态下为 `undefined`，不命中保护条件（且该页面本身需要登录才能进入）。

## 数据流

```
登录态(email) ──┐
                ├─> isProtectedApp(row) ──> 受保护行渲染 disabled+tooltip
应用列表(name) ──┘                            普通行渲染现有 popconfirm
```

## 错误处理

无新增错误路径。受保护行按钮 disabled 不可点击，不会发起请求；普通行删除失败时由现有 `handleDelete` 抛错（保持现状，不做改动）。

## 验证

1. `npm run build`（vue-tsc 类型检查 + vite 构建）通过。
2. 手动验证（`npm run dev`）：
   - test@test.com 登录 → `Myblog` 行按钮置灰、悬停显示"演示应用不可删除"、点击无反应。
   - 同账号下其他应用可正常弹确认框并删除。
   - 其他账号登录 → 列表正常，名为 Myblog 的应用（若有）可正常删除。

## 测试

前端项目无测试框架，不新增自动化测试；以构建 + 手动验证为准。
