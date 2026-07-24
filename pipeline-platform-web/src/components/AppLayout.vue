<template>
  <el-container class="layout">
    <el-aside width="220px">
      <div class="logo">📊 Pipeline</div>
      <el-menu
        :default-active="route.path"
        background-color="#001529"
        text-color="rgba(255,255,255,0.65)"
        active-text-color="#fff"
        router
      >
        <el-menu-item index="/">
          <el-icon><DataBoard /></el-icon>
          <span>数据大屏</span>
        </el-menu-item>
        <el-menu-item index="/apps">
          <el-icon><Grid /></el-icon>
          <span>应用管理</span>
        </el-menu-item>
        <el-menu-item index="/stats">
          <el-icon><TrendCharts /></el-icon>
          <span>详细统计</span>
        </el-menu-item>
      </el-menu>
      <div class="user-bar" v-if="auth.user">
        <span>{{ auth.user.email }}</span>
        <el-button type="danger" size="small" plain @click="handleLogout">退出</el-button>
      </div>
    </el-aside>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'

const route = useRoute()
const auth = useAuthStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout { min-height: 100vh; }
.el-aside { background: #001529; display: flex; flex-direction: column; }
.logo { padding: 24px 20px; color: #fff; font-size: 18px; font-weight: bold; letter-spacing: 1px; }
.el-menu { border-right: none; flex: 1; }
.el-main { padding: 24px 32px; background: #f5f7fa; }
.user-bar { padding: 14px 16px; border-top: 1px solid rgba(255,255,255,.08); }
.user-bar span { display: block; color: rgba(255,255,255,.55); font-size: 13px; margin-bottom: 8px; word-break: break-all; }
</style>
