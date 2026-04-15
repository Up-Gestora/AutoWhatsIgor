import type Redis from 'ioredis'

type SessionTrafficStoreOptions = {
  redis: Redis
  keyPrefix?: string
  inboundTtlSec: number
}

export class SessionTrafficStore {
  private readonly redis: Redis
  private readonly keyPrefix: string
  private readonly inboundTtlSec: number

  constructor(options: SessionTrafficStoreOptions) {
    this.redis = options.redis
    this.keyPrefix = options.keyPrefix?.trim() || 'session-traffic'
    this.inboundTtlSec = Math.max(1, options.inboundTtlSec)
  }

  async touchInbound(sessionId: string): Promise<void> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return
    }

    const key = this.getInboundKey(safeSessionId)
    await this.redis.set(key, '1', 'EX', this.inboundTtlSec)
  }

  async hasRecentInbound(sessionId: string): Promise<boolean> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return false
    }
    const key = this.getInboundKey(safeSessionId)
    const result = await this.redis.exists(key)
    return Number(result) === 1
  }

  private getInboundKey(sessionId: string) {
    return `${this.keyPrefix}:inbound:${sessionId}`
  }
}

