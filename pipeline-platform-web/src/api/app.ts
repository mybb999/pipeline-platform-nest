import request from './request'

export function createApp(name: string, domain?: string) {
  return request.post('/apps', { name, domain })
}

export function listApps() {
  return request.get('/apps')
}

export function deleteApp(id: number) {
  return request.delete(`/apps/${id}`)
}
