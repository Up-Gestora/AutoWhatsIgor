import type Redis from 'ioredis'

type AiPresentationStoreOptions = {
  redis: Redis
  keyPrefix?: string
}

export class AiPresentationStore {
  private readonly redis: Redis
  private readonly keyPrefix: string

  constructor(options: AiPresentationStoreOptions) {
    this.redis = options.redis
    this.keyPrefix = options.keyPrefix ?? 'ai-presentation'
  }

  async getCounter(sessionId: string, chatId: string): Promise<number> {
    const value = await this.redis.get(this.key(sessionId, chatId))
    if (!value) {
      return 0
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  async increment(sessionId: string, chatId: string): Promise<number> {
    const result = await this.redis.incr(this.key(sessionId, chatId))
    return Number(result)
  }

  async reset(sessionId: string, chatId: string): Promise<void> {
    await this.redis.set(this.key(sessionId, chatId), '0')
  }

  private key(sessionId: string, chatId: string) {
    return `${this.keyPrefix}:${sessionId}:${chatId}`
  }
}
