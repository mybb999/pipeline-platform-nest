// getTableName 单元测试 — 分表名的生成规则
import { getTableName } from './shard'

describe('getTableName', () => {
  it('普通日期生成 events_YYYYMMDD', () => {
    expect(getTableName(new Date(2026, 7, 14))).toBe('events_20260814')
  })

  it('个位数的月和日自动补零', () => {
    expect(getTableName(new Date(2026, 0, 5))).toBe('events_20260105')
  })

  it('年末最后一天不串年', () => {
    expect(getTableName(new Date(2025, 11, 31))).toBe('events_20251231')
  })

  it('不传参数时返回今天的表名', () => {
    expect(getTableName()).toMatch(/^events_\d{8}$/)
  })
})
