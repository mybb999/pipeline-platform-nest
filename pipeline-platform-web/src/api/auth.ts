import request from './request'

export function register(email: string, password: string) {
  return request.post('/auth/register', { email, password })
}

export function login(email: string, password: string) {
  return request.post('/auth/login', { email, password })
}
