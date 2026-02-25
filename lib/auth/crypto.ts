import { createHash, randomBytes, timingSafeEqual } from 'crypto'

function toBase64Url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded =
    padding === 0 ? normalized : normalized + '='.repeat(4 - padding)
  return Buffer.from(padded, 'base64')
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function randomNonce(bytes = 32): string {
  return toBase64Url(randomBytes(bytes))
}

export function randomId(bytes = 24): string {
  return toBase64Url(randomBytes(bytes))
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

export function encodeBase64Url(value: Buffer | string): string {
  return toBase64Url(value)
}
