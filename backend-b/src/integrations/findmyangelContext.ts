import type Redis from 'ioredis'

import type { MetricsStore } from '../observability/metrics'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export type FindmyangelContextProviderConfig = {
  enabled: boolean
  url?: string
  secret?: string
  timeoutMs: number
  cacheTtlSec: number
  maxBytes: number
  targetSessionId?: string
}

export type FindmyangelContextQuery = {
  sessionId: string
  chatId: string
  userId?: string | null
  whatsappDigits?: string | null
}

export class FindmyangelContextProvider {
  private readonly redis: Redis
  private readonly config: FindmyangelContextProviderConfig
  private readonly logger?: Logger
  private readonly metrics?: MetricsStore

  constructor(options: {
    redis: Redis
    config: FindmyangelContextProviderConfig
    logger?: Logger
    metrics?: MetricsStore
  }) {
    this.redis = options.redis
    this.config = options.config
    this.logger = options.logger
    this.metrics = options.metrics
  }

  isEnabledForSession(sessionId: string) {
    if (!this.config.enabled) {
      return false
    }
    const target = (this.config.targetSessionId ?? '').trim()
    if (!target) {
      return false
    }
    return sessionId === target
  }

  getMaxBytesForPrompt() {
    return Math.max(1000, Math.round(this.config.maxBytes))
  }

  truncateForPrompt(payload: Record<string, unknown>): Record<string, unknown> {
    const maxBytes = this.getMaxBytesForPrompt()
    const redacted = redactFindmyangelPayloadForPrompt(payload)
    const raw = safeStringify(redacted)
    if (Buffer.byteLength(raw, 'utf8') <= maxBytes) {
      return redacted
    }

    const shrunk = shrinkFindmyangelPayload(redacted)
    const shrunkRaw = safeStringify(shrunk)
    if (Buffer.byteLength(shrunkRaw, 'utf8') <= maxBytes) {
      return shrunk
    }

    return {
      truncated: true,
      version: redacted.version ?? null,
      hasAccount: redacted.hasAccount ?? null,
      tokens: isRecord(redacted.tokens) ? redacted.tokens : null,
      subscription: isRecord(redacted.subscription) ? redacted.subscription : null,
      profileFields: isRecord(redacted.profileFields) ? redacted.profileFields : null
    }
  }

  async getForChat(query: FindmyangelContextQuery): Promise<Record<string, unknown> | null> {
    if (!this.isEnabledForSession(query.sessionId)) {
      return null
    }

    const url = (this.config.url ?? '').trim()
    const secret = (this.config.secret ?? '').trim()
    if (!url || !secret) {
      this.metrics?.increment('findmyangel.context.error')
      this.logger?.warn?.('FindmyAngel context is enabled but url/secret is missing')
      return null
    }

    const cacheKey = buildCacheKey(query.sessionId, query.chatId)
    const ttl = Math.max(0, Math.round(this.config.cacheTtlSec))

    if (ttl > 0) {
      try {
        const cached = await this.redis.get(cacheKey)
        if (cached && cached.trim()) {
          const parsed = safeParseJson(cached)
          if (parsed && isRecord(parsed)) {
            this.metrics?.increment('findmyangel.context.hit')
            return parsed
          }
        }
      } catch (error) {
        this.metrics?.increment('findmyangel.context.error')
        this.logger?.warn?.('FindmyAngel context cache read failed', {
          error: (error as Error).message
        })
      }
    }

    const body: Record<string, unknown> = {}
    const userId = (query.userId ?? '').trim()
    const whatsappDigits = (query.whatsappDigits ?? '').trim()
    if (userId) {
      body.userId = userId
    }
    if (whatsappDigits) {
      body.whatsappDigits = whatsappDigits
    }

    if (!body.userId && !body.whatsappDigits) {
      this.metrics?.increment('findmyangel.context.miss')
      return null
    }

    const controller = new AbortController()
    const timeoutMs = Math.max(200, Math.round(this.config.timeoutMs))
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      const text = await response.text().catch(() => '')
      if (!response.ok) {
        this.metrics?.increment('findmyangel.context.error')
        this.logger?.warn?.('FindmyAngel context HTTP error', {
          status: response.status,
          body: text.slice(0, 200)
        })
        return null
      }

      const parsed = safeParseJson(text)
      if (!parsed || !isRecord(parsed) || parsed.success !== true) {
        this.metrics?.increment('findmyangel.context.miss')
        return null
      }

      this.metrics?.increment('findmyangel.context.hit')

      if (ttl > 0) {
        try {
          const raw = safeStringify(parsed)
          await this.redis.set(cacheKey, raw, 'EX', ttl)
        } catch (error) {
          this.metrics?.increment('findmyangel.context.error')
          this.logger?.warn?.('FindmyAngel context cache write failed', {
            error: (error as Error).message
          })
        }
      }

      return parsed
    } catch (error) {
      if (isAbortError(error)) {
        this.metrics?.increment('findmyangel.context.timeout')
        this.logger?.warn?.('FindmyAngel context timeout', {
          timeoutMs
        })
        return null
      }

      this.metrics?.increment('findmyangel.context.error')
      this.logger?.warn?.('FindmyAngel context request failed', {
        error: (error as Error).message
      })
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

function buildCacheKey(sessionId: string, chatId: string) {
  return `findmyangel:ctx:v1:${sessionId}:${chatId}`
}

function safeParseJson(raw: string): unknown {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAbortError(error: unknown) {
  const anyErr = error as any
  return anyErr?.name === 'AbortError'
}

function redactFindmyangelPayloadForPrompt(payload: Record<string, unknown>): Record<string, unknown> {
  // Avoid leaking internal identifiers into the AI prompt. The full payload may still be cached in Redis.
  const redacted: Record<string, unknown> = { ...payload }
  delete (redacted as any).userId
  delete (redacted as any).match
  return redacted
}

function shrinkFindmyangelPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Keep the most useful bits for answering user questions.
  for (const key of ['version', 'hasAccount', 'fetchedAtMs'] as const) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      result[key] = payload[key]
    }
  }

  if (isRecord(payload.tokens)) {
    result.tokens = payload.tokens
  }
  if (isRecord(payload.subscription) || payload.subscription === null) {
    result.subscription = payload.subscription
  }
  if (isRecord(payload.profileFields)) {
    // Limit missing fields list to keep prompt smaller.
    const filled = Array.isArray((payload.profileFields as any).filled) ? (payload.profileFields as any).filled : []
    const missing = Array.isArray((payload.profileFields as any).missing) ? (payload.profileFields as any).missing : []
    result.profileFields = {
      filled: Array.isArray(filled) ? filled.slice(0, 30) : [],
      missing: Array.isArray(missing) ? missing.slice(0, 30) : []
    }
  }

  // User profile can be large; keep a narrow subset.
  if (isRecord(payload.user)) {
    const user = payload.user as Record<string, unknown>
    const keepUserKeys = [
      'type',
      'displayName',
      'username',
      'emailVerified',
      'approvalStatus',
      'accountDeleted',
      'cpfPresent',
      'withdrawalDataPresent'
    ] as const
    const slimUser: Record<string, unknown> = {}
    for (const key of keepUserKeys) {
      if (Object.prototype.hasOwnProperty.call(user, key)) {
        slimUser[key] = user[key]
      }
    }
    result.user = slimUser
  }

  return result
}
