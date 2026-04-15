import crypto from 'crypto'

export type EncryptedPayload = {
  v: number
  iv: string
  tag: string
  data: string
}

const ENVELOPE_VERSION = 1
const IV_LENGTH = 12

function resolveKey(secret: string): Buffer {
  const trimmed = secret.trim()
  if (!trimmed) {
    throw new Error('AUTH_ENCRYPTION_KEY is required')
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 64) {
    return Buffer.from(trimmed.slice(0, 64), 'hex')
  }

  const base64 = Buffer.from(trimmed, 'base64')
  if (base64.length >= 32) {
    return base64.subarray(0, 32)
  }

  const utf8 = Buffer.from(trimmed, 'utf8')
  if (utf8.length >= 32) {
    return utf8.subarray(0, 32)
  }

  throw new Error('AUTH_ENCRYPTION_KEY must be at least 32 bytes')
}

function assertEnvelope(value: unknown): EncryptedPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid encrypted payload')
  }

  const payload = value as Record<string, unknown>
  const v = payload.v
  if (typeof v !== 'number') {
    throw new Error('Invalid encrypted payload version')
  }

  if (v !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported encrypted payload version: ${v}`)
  }

  if (typeof payload.iv !== 'string' || typeof payload.tag !== 'string' || typeof payload.data !== 'string') {
    throw new Error('Invalid encrypted payload fields')
  }

  return {
    v,
    iv: payload.iv,
    tag: payload.tag,
    data: payload.data
  }
}

export class AuthStateCrypto {
  private readonly key: Buffer

  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error('Encryption key must be 32 bytes')
    }
    this.key = key
  }

  static fromSecret(secret: string) {
    return new AuthStateCrypto(resolveKey(secret))
  }

  encrypt(plaintext: string): EncryptedPayload {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
      v: ENVELOPE_VERSION,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    }
  }

  decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'base64')
    const tag = Buffer.from(payload.tag, 'base64')
    const data = Buffer.from(payload.data, 'base64')

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])

    return decrypted.toString('utf8')
  }

  serialize(payload: EncryptedPayload): string {
    return JSON.stringify(payload)
  }

  parse(raw: string): EncryptedPayload {
    return assertEnvelope(JSON.parse(raw))
  }
}
