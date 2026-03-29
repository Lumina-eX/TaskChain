import { NextRequest } from 'next/server'

export function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  return new NextRequest(url, init)
}

export function adminToken() {
  return 'Bearer valid-admin-token'
}
