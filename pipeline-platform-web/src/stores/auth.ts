import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<{ id: number; email: string } | null>(null)

  function setAuth(t: string, u: { id: number; email: string }) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
  }

  function isLoggedIn() {
    return !!token.value
  }

  return { token, user, setAuth, logout, isLoggedIn }
})
