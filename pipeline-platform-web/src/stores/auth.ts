import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  // user 需持久化：页面刷新后从 localStorage 恢复，否则依赖登录态的判断（如 AppManage 删除保护）会失效
  const user = ref<{ id: number; email: string } | null>(
    JSON.parse(localStorage.getItem('user') || 'null')
  )

  function setAuth(t: string, u: { id: number; email: string }) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  function isLoggedIn() {
    return !!token.value
  }

  return { token, user, setAuth, logout, isLoggedIn }
})
