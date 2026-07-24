import request from './request'

export function getPvTrend(appId: number, range = 7) {
  return request.get('/stats/pv', { params: { appId, range } })
}

export function getDeviceDistribution(appId: number) {
  return request.get('/stats/device', { params: { appId } })
}

export function getRealtimeEvents(appId: number) {
  return request.get('/stats/realtime', { params: { appId } })
}
