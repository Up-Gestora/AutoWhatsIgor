import type Redis from 'ioredis'
import type { InboundQueueItem } from './types'

type InboundMessageQueueOptions = {
  redis: Redis
  queuePrefix?: string
  chatSetKey?: string
}

type ChatKey = {
  sessionId: string
  chatId: string
}

export class InboundMessageQueue {
  private readonly redis: Redis
  private readonly queuePrefix: string
  private readonly chatSetKey: string

  constructor(options: InboundMessageQueueOptions) {
    this.redis = options.redis
    this.queuePrefix = options.queuePrefix ?? 'inbound-queue'
    this.chatSetKey = options.chatSetKey ?? 'inbound-queue-chats'
  }

  async enqueue(item: InboundQueueItem): Promise<number> {
    const queueKey = this.getQueueKey(item.sessionId, item.chatId)
    const payload = JSON.stringify(item)
    const length = await this.redis.rpush(queueKey, payload)
    await this.redis.sadd(this.chatSetKey, this.getChatIndexValue(item.sessionId, item.chatId))
    return length
  }

  async dequeue(sessionId: string, chatId: string): Promise<InboundQueueItem | null> {
    const queueKey = this.getQueueKey(sessionId, chatId)
    const raw = await this.redis.lpop(queueKey)
    if (!raw) {
      await this.redis.srem(this.chatSetKey, this.getChatIndexValue(sessionId, chatId))
      return null
    }

    const parsed = JSON.parse(raw) as InboundQueueItem
    const remaining = await this.redis.llen(queueKey)
    if (remaining === 0) {
      await this.redis.srem(this.chatSetKey, this.getChatIndexValue(sessionId, chatId))
    }

    return parsed
  }

  async listChatsWithPending(): Promise<ChatKey[]> {
    const entries = await this.redis.smembers(this.chatSetKey)
    return entries
      .map((entry) => this.parseChatIndexValue(entry))
      .filter((value): value is ChatKey => Boolean(value))
  }

  private getQueueKey(sessionId: string, chatId: string) {
    return `${this.queuePrefix}:${sessionId}:${encodeURIComponent(chatId)}`
  }

  private getChatIndexValue(sessionId: string, chatId: string) {
    return `${sessionId}:${encodeURIComponent(chatId)}`
  }

  private parseChatIndexValue(value: string): ChatKey | null {
    const idx = value.indexOf(':')
    if (idx === -1) {
      return null
    }
    const sessionId = value.slice(0, idx)
    const chatId = decodeURIComponent(value.slice(idx + 1))
    if (!sessionId || !chatId) {
      return null
    }
    return { sessionId, chatId }
  }
}
