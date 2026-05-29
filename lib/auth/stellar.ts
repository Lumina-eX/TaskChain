import { createPublicKey, verify } from 'crypto'
import { fromBase64Url } from '@/lib/auth/crypto'

const STELLAR_ACCOUNT_VERSION_BYTE = 6 << 3
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function crc16Xmodem(data: Uint8Array): number {
  let crc = 0x0000

  for (const value of data) {
    crc ^= value << 8
    for (let i = 0; i < 8; i += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021
      } else {
        crc <<= 1
      }
      crc &= 0xffff
    }
  }

  return crc
}

function decodeBase32(input: string): Uint8Array {
  const normalized = input.trim().toUpperCase().replace(/=+$/g, '')
  let bits = 0
  let value = 0
  const output: number[] = []

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error('Invalid base32 character')
    }

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bits -= 8
      output.push((value >>> bits) & 0xff)
    }
  }

  return Uint8Array.from(output)
}

function getSignatureBuffer(signature: string): Buffer {
  const trimmed = signature.trim()

  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return Buffer.from(trimmed.slice(2), 'hex')
  }

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, 'hex')
  }

  try {
    return fromBase64Url(trimmed)
  } catch {
    return Buffer.from(trimmed, 'base64')
  }
}

export function normalizeWalletAddress(walletAddress: string): string {
  return walletAddress.trim().toUpperCase()
}

export function getStellarPublicKey(walletAddress: string): Buffer {
  const normalized = normalizeWalletAddress(walletAddress)
  const decoded = decodeBase32(normalized)

  if (decoded.length !== 35) {
    throw new Error('Invalid Stellar address length')
  }

  const payload = decoded.subarray(0, 33)
  const checksum = decoded.subarray(33, 35)
  if (payload[0] !== STELLAR_ACCOUNT_VERSION_BYTE) {
    throw new Error('Invalid Stellar address version byte')
  }

  const expectedChecksum = crc16Xmodem(payload)
  const actualChecksum = checksum[0] | (checksum[1] << 8)
  if (expectedChecksum !== actualChecksum) {
    throw new Error('Invalid Stellar address checksum')
  }

  return Buffer.from(payload.subarray(1))
}

export function isValidStellarAddress(walletAddress: string): boolean {
  try {
    getStellarPublicKey(walletAddress)
    return true
  } catch {
    return false
  }
}

export function verifyStellarSignature({
  walletAddress,
  message,
  signature,
}: {
  walletAddress: string
  message: string
  signature: string
}): boolean {
  const rawKey = getStellarPublicKey(walletAddress)
  const signatureBuffer = getSignatureBuffer(signature)

  if (signatureBuffer.length !== 64) {
    return false
  }

  const publicKey = createPublicKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: rawKey.toString('base64url'),
    },
    format: 'jwk',
  })

  return verify(
    null,
    Buffer.from(message, 'utf8'),
    publicKey,
    signatureBuffer
  )
}

export function buildAuthMessage(
  walletAddress: string,
  nonce: string
): string {
  const normalized = normalizeWalletAddress(walletAddress)
  return [
    'TaskChain Authentication',
    `Wallet: ${normalized}`,
    `Nonce: ${nonce}`,
  ].join('\n')
}
