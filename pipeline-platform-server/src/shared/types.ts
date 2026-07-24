// 共享类型定义 — 项目全局使用的接口和类型（User、App、Event、JWT、统计等）
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

// ===== JWT & 应用信息 =====

export interface JwtPayload {
  id: number
  email: string
}

export interface AppInfo {
  id: number
  name: string
  app_key: string
  secret_key: string
  domain: string | null
  status: number
  created_at: string
}

// ===== 事件采集 =====

export interface IncomingEvent {
  event_type: string
  url: string
  ua: string
  ip: string
  extra?: Record<string, unknown>
}

export interface RawEvent extends IncomingEvent {
  app_key: string
  created_at: string
}

export interface CleanedEvent {
  app_id: number
  event_type: string
  url: string
  ua: string
  ip: string
  extra: string
  device_type: 'desktop' | 'mobile' | 'tablet'
  city: string
  page_path: string
  created_at: string
}
