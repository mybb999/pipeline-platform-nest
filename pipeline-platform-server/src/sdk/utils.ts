// SDK 工具函数 — 设备类型检测 / UUID 生成 / 页面路径提取
/**
 * 根据 User-Agent 判断设备类型
 */
export function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
  const ua = navigator.userAgent.toLowerCase()
  if (/tablet|ipad|playbook|silk/.test(ua)) return 'tablet'
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(ua)) return 'mobile'
  return 'desktop'
}

/**
 * 生成唯一 ID（简单版 UUID v4）
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * 获取当前页面路径（去掉域名，只保留路径）
 */
export function getPagePath(): string {
  return location.pathname + location.search
}
