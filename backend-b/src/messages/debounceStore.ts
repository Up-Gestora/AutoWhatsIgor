import type Redis from 'ioredis'

type InboundDebounceStoreOptions = {
  redis: Redis
  keyPrefix?: string
  ttlSec: number
}

export class InboundDebounceStore {
  private readonly redis: Redis
  private readonly keyPrefix: string
  private readonly ttlSec: number

  constructor(options: InboundDebounceStoreOptions) {
    this.redis = options.redis
    this.keyPrefix = options.keyPrefix ?? 'ai-debounce'
    this.ttlSec = Math.max(30, options.ttlSec)
  }

  async touch(sessionId: string, chatId: string, timestampMs: number): Promise<void> {
    const key = this.getKey(sessionId, chatId)
    await this.redis.set(key, String(timestampMs), 'EX', this.ttlSec)
  }

  async getLastAt(sessionId: string, chatId: string): Promise<number | null> {
    const key = this.getKey(sessionId, chatId)
    const value = await this.redis.get(key)
    if (!value) {
      return null
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return null
    }
    return parsed
  }

  private getKey(sessionId: string, chatId: string) {
    return `${this.keyPrefix}:${sessionId}:${encodeURIComponent(chatId)}`
  }
}
