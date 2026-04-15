import type Redis from 'ioredis'
import type { AiContextMessage } from './types'

type AiContextCacheOptions = {
  redis: Redis
  keyPrefix?: string
  ttlSec: number
  maxMessages: number
}

export class AiContextCache {
  private readonly redis: Redis
  private readonly keyPrefix: string
  private readonly ttlSec: number
  private readonly maxMessages: number

  constructor(options: AiContextCacheOptions) {
    this.redis = options.redis
    this.keyPrefix = options.keyPrefix ?? 'ai-context'
    this.ttlSec = Math.max(60, options.ttlSec)
    this.maxMessages = Math.max(2, options.maxMessages)
  }

  async getMessages(sessionId: string, chatId: string): Promise<AiContextMessage[]> {
    const key = this.getKey(sessionId, chatId)
    const raw = await this.redis.lrange(key, 0, this.maxMessages - 1)
    const parsed = raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as AiContextMessage
        } catch {
          return null
        }
      })
      .filter((entry): entry is AiContextMessage => Boolean(entry))

    return parsed.reverse()
  }

  async appendMessage(sessionId: string, chatId: string, message: AiContextMessage): Promise<void> {
    const key = this.getKey(sessionId, chatId)
    const last = await this.redis.lindex(key, 0)
    if (last) {
      try {
        const parsed = JSON.parse(last) as AiContextMessage
        if (message.messageId && parsed?.messageId === message.messageId) {
          await this.redis.expire(key, this.ttlSec)
          return
        }
      } catch {
        // Ignore parse errors and append anyway.
      }
    }

    await this.redis
      .multi()
      .lpush(key, JSON.stringify(message))
      .ltrim(key, 0, this.maxMessages - 1)
      .expire(key, this.ttlSec)
      .exec()
  }

  async seedMessages(sessionId: string, chatId: string, messages: AiContextMessage[]): Promise<void> {
    const key = this.getKey(sessionId, chatId)
    if (messages.length === 0) {
      await this.redis.del(key)
      return
    }

    const payloads = messages.map((message) => JSON.stringify(message))
    const pipeline = this.redis.multi()
    pipeline.del(key)
    pipeline.rpush(key, ...payloads)
    pipeline.ltrim(key, -this.maxMessages, -1)
    pipeline.expire(key, this.ttlSec)
    await pipeline.exec()
  }

  private getKey(sessionId: string, chatId: string) {
    return `${this.keyPrefix}:${sessionId}:${encodeURIComponent(chatId)}`
  }
}
