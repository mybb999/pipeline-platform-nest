<template>
  <div class="login-page">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <h2>Pipeline Platform</h2>
          <p>实时数据管道平台</p>
        </div>
      </template>

      <el-tabs v-model="mode" stretch>
        <el-tab-pane label="登录" name="login" />
        <el-tab-pane label="注册" name="register" />
      </el-tabs>

      <el-form @submit.prevent="handleSubmit">
        <el-form-item>
          <el-input v-model="email" type="email" placeholder="邮箱" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="密码（至少6位）" size="large" show-password />
        </el-form-item>

        <el-button type="primary" native-type="submit" size="large" :loading="loading" style="width:100%">
          {{ mode === 'login' ? '登录' : '注册' }}
        </el-button>
      </el-form>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-top:12px" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { login, register } from '../api/auth'

const router = useRouter()
const auth = useAuthStore()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const fn = mode.value === 'login' ? login : register
    const res = await fn(email.value, password.value)
    const { token, id, email: mail } = res.data.data
    auth.setAuth(token, { id, email: mail })
    router.push('/')
  } catch (err: any) {
    error.value = err.response?.data?.message || '请求失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.login-card { width: 400px; }
.card-header { text-align: center; }
.card-header h2 { margin: 0; font-size: 22px; }
.card-header p { margin: 4px 0 0; color: #999; font-size: 13px; }
</style>
