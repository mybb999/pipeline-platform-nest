// 性能采集插件 — LCP（最大内容绘制）/ FCP（首次内容绘制）/ 导航耗时（DNS/TCP/TTFB/DOM/Load）
import type { Plugin, Tracker } from '../tracker'

/**
 * 性能采集插件
 * - LCP（最大内容绘制）
 * - FCP（首次内容绘制）
 * - DOM 解析耗时 / 页面加载耗时
 */
export function performancePlugin(): Plugin {
  return {
    name: 'performance',
    setup(tracker: Tracker) {
      // 等页面完全加载后再采集，避免拿到 0 值
      if (document.readyState === 'complete') {
        collect()
      } else {
        window.addEventListener('load', collect)
      }

      function collect() {
        // 基础导航耗时
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        if (nav) {
          tracker.track('performance', {
            metric: 'navigation',
            dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
            tcp: Math.round(nav.connectEnd - nav.connectStart),
            ttfb: Math.round(nav.responseStart - nav.requestStart),     // 首字节
            dom_parse: Math.round(nav.domContentLoadedEventEnd - nav.responseEnd),
            load: Math.round(nav.loadEventEnd - nav.fetchStart),
          })
        }

        // LCP
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const last = entries[entries.length - 1]
          tracker.track('performance', {
            metric: 'lcp',
            value: Math.round(last.startTime),
          })
        }).observe({ type: 'largest-contentful-paint', buffered: true })

        // FCP
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]
        if (fcp) {
          tracker.track('performance', {
            metric: 'fcp',
            value: Math.round(fcp.startTime),
          })
        }
      }
    },
  }
}
