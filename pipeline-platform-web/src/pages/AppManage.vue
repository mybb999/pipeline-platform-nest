<template>
  <div class="app-manage">
    <el-page-header content="应用管理" />

    <el-card style="margin-top:16px">
      <div class="create-form">
        <el-input v-model="name" placeholder="应用名称" style="width:200px" />
        <el-input v-model="domain" placeholder="域名（选填）" style="width:200px;margin:0 8px" />
        <el-button type="primary" @click="handleCreate" :loading="creating" :disabled="!name">创建应用</el-button>
      </div>
    </el-card>

    <el-card style="margin-top:16px">
      <el-table :data="apps" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="app_key" label="AppKey" width="240">
          <template #default="{ row }">
            <el-tag type="info">{{ row.app_key }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
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
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createApp, listApps, deleteApp } from '../api/app'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

interface AppInfo { id: number; name: string; app_key: string; status: number; created_at: string }

// 受保护的演示应用：该账号下此名称的应用不允许在前端删除
// 详见 pipeline-platform-server/docs/superpowers/specs/2026-08-24-protect-myblog-delete-button-design.md
const PROTECTED_APP = { email: 'test@test.com', name: 'Myblog' }

const name = ref('')
const domain = ref('')
const apps = ref<AppInfo[]>([])
const creating = ref(false)
const loading = ref(false)

const authStore = useAuthStore()

const isProtectedApp = (row: AppInfo) =>
  authStore.user?.email === PROTECTED_APP.email && row.name === PROTECTED_APP.name

onMounted(() => fetchApps())

async function fetchApps() {
  loading.value = true
  const res = await listApps()
  apps.value = res.data.data
  loading.value = false
}

async function handleCreate() {
  creating.value = true
  try {
    const res = await createApp(name.value, domain.value || undefined)
    ElMessage.success(`应用创建成功！AppKey: ${res.data.data.app_key}`)
    name.value = ''
    domain.value = ''
    await fetchApps()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleDelete(id: number) {
  await deleteApp(id)
  ElMessage.success('删除成功')
  await fetchApps()
}
</script>

<style scoped>
.create-form {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.el-table .el-table__cell {
  padding: 10px 12px;
}
</style>
