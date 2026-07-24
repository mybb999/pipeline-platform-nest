// 按天分表工具 — 根据日期生成分表名（如 events_20260724），用于日志存储和查询路由
/**
 * 输入: date → 输出: events_20260617
 */
export function getTableName(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `events_${y}${m}${d}`
}
