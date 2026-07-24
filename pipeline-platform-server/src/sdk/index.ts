// 浏览器 SDK 入口 — 自动从 <script> 标签读取配置，初始化 Tracker 并注册内置插件（PV/错误/性能）
import { Tracker } from './tracker'
import { pvPlugin } from './plugins/pv'
import { errorPlugin } from './plugins/error'
import { performancePlugin } from './plugins/performance'

// 自动初始化：读取 <script> 标签上的 data 属性
;(function () {
  const script = document.currentScript as HTMLScriptElement | null
  if (!script) return

  const appKey = script.getAttribute('data-app-key')
  if (!appKey) {
    console.warn('[PipelineSDK] 缺少 data-app-key 属性')
    return
  }

  const endpoint = script.getAttribute('data-endpoint') || undefined

  // 创建 Tracker 并注册插件
  const tracker = new Tracker(appKey, endpoint)
  tracker.use(pvPlugin())
  tracker.use(errorPlugin())
  tracker.use(performancePlugin())

  // 暴露到全局 window，方便用户手动调用 tracker.track('custom', { ... })
  ;(window as any).__pipeline_tracker__ = tracker
})()
