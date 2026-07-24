// ===== 用户 & 应用 =====

export interface User {
  id: number
  email: string
  password: string       // bcrypt hash
  created_at: Date
}

export interface App {
  id: number
  user_id: number
  name: string
  app_key: string        // 24位 hex，公开标识
  secret_key: string     // 32位 hex，用于HMAC签名
  domain: string | null
  status: number         // 1=启用 0=停用
  created_at: Date
}

// ===== 事件 =====

export type EventType = 'page_view' | 'click' | 'error' | 'performance' | 'custom'

export interface TrackEvent {
  event_type: EventType
  url: string
  ua: string
  ip: string
  extra?: Record<string, unknown>
}

export interface ParsedEvent extends TrackEvent {
  device_type: 'desktop' | 'mobile' | 'tablet'
  city: string
  page_path: string
}

// ===== API 响应 =====

export interface ApiResponse<T = unknown> {
  code: number           // 0=成功
  message: string
  data?: T
}

// ===== 统计 =====

export interface PvSummary {
  app_id: number
  hour: string
  pv: number
  uv: number
}

export interface DeviceDistribution {
  app_id: number
  date: string
  device: string
  count: number
}

// ===== 扩展 Express =====
// 让中间件可以往 req 上挂 user 字段，TypeScript 不报红线
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        email: string
      }
    }
  }
}
