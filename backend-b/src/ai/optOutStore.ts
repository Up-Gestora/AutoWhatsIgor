import type Redis from 'ioredis'

type AiOptOutStoreOptions = {
  redis: Redis
  keyPrefix?: string
}

export class AiOptOutStore {
  private readonly redis: Redis
  private readonly keyPrefix: string

  constructor(options: AiOptOutStoreOptions) {
    this.redis = options.redis
    this.keyPrefix = options.keyPrefix ?? 'ai-optout'
  }

  async isOptedOut(sessionId: string, chatId: string): Promise<boolean> {
    const key = this.getKey(sessionId)
    const member = await this.redis.sismember(key, chatId)
    return member === 1
  }

  async setOptOut(sessionId: string, chatId: string): Promise<void> {
    await this.redis.sadd(this.getKey(sessionId), chatId)
  }

  async clearOptOut(sessionId: string, chatId: string): Promise<void> {
    await this.redis.srem(this.getKey(sessionId), chatId)
  }

  private getKey(sessionId: string) {
    return `${this.keyPrefix}:${sessionId}`
  }
}
