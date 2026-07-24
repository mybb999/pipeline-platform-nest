import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const currentApp = ref<{ id: number; name: string; app_key: string } | null>(null)

  function selectApp(app: { id: number; name: string; app_key: string }) {
    currentApp.value = app
  }

  return { currentApp, selectApp }
})
