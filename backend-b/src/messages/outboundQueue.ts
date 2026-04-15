import type Redis from 'ioredis'
import type { OutboundQueueItem } from './outboundTypes'

type OutboundMessageQueueOptions = {
  redis: Redis
  queuePrefix?: string
  chatSetKey?: string
}

type ChatKey = {
  sessionId: string
  chatId: string
}

export class OutboundMessageQueue {
  private readonly redis: Redis
  private readonly queuePrefix: string
  private readonly chatSetKey: string

  constructor(options: OutboundMessageQueueOptions) {
    this.redis = options.redis
    this.queuePrefix = options.queuePrefix ?? 'outbound-queue'
    this.chatSetKey = options.chatSetKey ?? 'outbound-queue-chats'
  }

  async enqueue(item: OutboundQueueItem): Promise<number> {
    const queueKey = this.getQueueKey(item.sessionId, item.chatId)
    const payload = JSON.stringify(item)
    const length = await this.redis.rpush(queueKey, payload)
    await this.redis.sadd(this.chatSetKey, this.getChatIndexValue(item.sessionId, item.chatId))
    await this.redis.sadd(this.getSessionSetKey(item.sessionId), this.getSessionChatIndexValue(item.chatId))
    return length
  }

  async peek(sessionId: string, chatId: string): Promise<OutboundQueueItem | null> {
    const queueKey = this.getQueueKey(sessionId, chatId)
    const raw = await this.redis.lindex(queueKey, 0)
    if (!raw) {
      await this.redis.srem(this.chatSetKey, this.getChatIndexValue(sessionId, chatId))
      await this.redis.srem(this.getSessionSetKey(sessionId), this.getSessionChatIndexValue(chatId))
      return null
    }
    return JSON.parse(raw) as OutboundQueueItem
  }

  async dequeue(sessionId: string, chatId: string): Promise<OutboundQueueItem | null> {
    const queueKey = this.getQueueKey(sessionId, chatId)
    const raw = await this.redis.lpop(queueKey)
    if (!raw) {
      await this.redis.srem(this.chatSetKey, this.getChatIndexValue(sessionId, chatId))
      await this.redis.srem(this.getSessionSetKey(sessionId), this.getSessionChatIndexValue(chatId))
      return null
    }

    const parsed = JSON.parse(raw) as OutboundQueueItem
    const remaining = await this.redis.llen(queueKey)
    if (remaining === 0) {
      await this.redis.srem(this.chatSetKey, this.getChatIndexValue(sessionId, chatId))
      await this.redis.srem(this.getSessionSetKey(sessionId), this.getSessionChatIndexValue(chatId))
    }

    return parsed
  }

  async listChatsWithPending(): Promise<ChatKey[]> {
    const entries = await this.redis.smembers(this.chatSetKey)
    return entries
      .map((entry) => this.parseChatIndexValue(entry))
      .filter((value): value is ChatKey => Boolean(value))
  }

  async hasPendingForSession(sessionId: string): Promise<boolean> {
    const key = this.getSessionSetKey(sessionId)
    const count = await this.redis.scard(key)
    return Number(count) > 0
  }

  private getQueueKey(sessionId: string, chatId: string) {
    return `${this.queuePrefix}:${sessionId}:${encodeURIComponent(chatId)}`
  }

  private getSessionSetKey(sessionId: string) {
    return `${this.chatSetKey}:session:${sessionId}`
  }

  private getChatIndexValue(sessionId: string, chatId: string) {
    return `${sessionId}:${encodeURIComponent(chatId)}`
  }

  private getSessionChatIndexValue(chatId: string) {
    return encodeURIComponent(chatId)
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
