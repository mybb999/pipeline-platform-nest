// JS 错误捕获插件 — 全局 JS 错误（window.onerror）+ Promise 未捕获异常（unhandledrejection）
import type { Plugin, Tracker } from '../tracker'

/**
 * JS 错误捕获插件
 * - 全局 JS 错误（window.onerror）
 * - Promise 未捕获异常（unhandledrejection）
 */
export function errorPlugin(): Plugin {
  return {
    name: 'error',
    setup(tracker: Tracker) {
      // 全局 JS 错误
      const onError = (message: string | Event, source?: string, lineno?: number, colno?: number, error?: Error) => {
        // message 可能是 ErrorEvent（如资源加载失败），过滤掉
        if (typeof message !== 'string') return

        tracker.track('error', {
          message,
          source: source || '',
          line: lineno || 0,
          col: colno || 0,
          stack: error?.stack || '',
        })
      }
      window.addEventListener('error', onError as EventListener)

      // Promise 未捕获异常
      const onRejection = (event: PromiseRejectionEvent) => {
        tracker.track('error', {
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack || '',
          type: 'unhandledrejection',
        })
      }
      window.addEventListener('unhandledrejection', onRejection)
    },
  }
}
