// Tracker — SDK 核心类：事件队列、批量上报（定时 + 阈值）、sendBeacon/Fetch 双通道、插件机制
import { generateId, getPagePath } from './utils'

export interface Plugin {
  name: string
  setup: (tracker: Tracker) => void
}

export interface TrackEvent {
  event_type: 'page_view' | 'click' | 'error' | 'performance' | 'custom'
  url: string
  ua: string
  ip: string          // 服务端覆盖，SDK 不填
  extra?: Record<string, unknown>
}

export class Tracker {
  appKey: string
  endpoint: string
  sessionId: string

  private queue: TrackEvent[] = []
  private timer: number | null = null
  private readonly FLUSH_INTERVAL = 5000    // 每 5 秒批量发送
  private readonly BATCH_SIZE = 20           // 或攒够 20 条就发

  constructor(appKey: string, endpoint?: string) {
    this.appKey = appKey
    this.endpoint = endpoint || '/api/collect'
    this.sessionId = generateId()
  }

  /** 注册插件 */
  use(plugin: Plugin): void {
    plugin.setup(this)
  }

  /** 手动上报一条事件 */
  track(eventType: TrackEvent['event_type'], extra?: Record<string, unknown>): void {
    this.queue.push({
      event_type: eventType,
      url: getPagePath(),
      ua: navigator.userAgent,
      ip: '',
      extra,
    })

    // 攒够了就立刻发，否则等定时器
    if (this.queue.length >= this.BATCH_SIZE) {
      this.flush()
    } else if (!this.timer) {
      this.timer = window.setTimeout(() => this.flush(), this.FLUSH_INTERVAL)
    }
  }

  /** 批量发送队列中的事件 */
  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.queue.length === 0) return

    const batch = this.queue.splice(0)
    this.send(batch)
  }

  /** HTTP 上报 */
  private send(events: TrackEvent[]): void {
    const payload = JSON.stringify({ appKey: this.appKey, events })

    // 用 sendBeacon 或 fetch（优先 sendBeacon，页面关闭时也能发）
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon(this.endpoint, blob)
    } else {
      // 降级方案：fetch，忽略响应
      fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }
  }

  /** 销毁时强制发送剩余数据 */
  destroy(): void {
    this.flush()
  }
}
