// PV（页面浏览）自动采集插件 — 页面加载 + SPA 路由变化时上报 page_view 事件
import type { Plugin, Tracker } from '../tracker'

/**
 * PV 自动采集插件
 * - 页面加载时上报一次
 * - SPA 路由变化时（popstate）也上报
 */
export function pvPlugin(): Plugin {
  return {
    name: 'pv',
    setup(tracker: Tracker) {
      // 首次加载
      tracker.track('page_view', {
        title: document.title,
        referrer: document.referrer,
      })

      // 监听浏览器前进/后退
      const handler = () => {
        tracker.track('page_view', {
          title: document.title,
          referrer: document.referrer,
        })
      }
      window.addEventListener('popstate', handler)
    },
  }
}
