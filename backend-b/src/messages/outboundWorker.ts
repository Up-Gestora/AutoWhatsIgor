import type { SessionManager } from '../sessions'
import type { OutboundMessageQueue } from './outboundQueue'
import type { OutboundMessageStore } from './outboundStore'
import type { OutboundRateLimiter } from './outboundRateLimiter'
import type { OutboundMessagePayload, OutboundQueueItem } from './outboundTypes'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type Metrics = {
  increment: (name: string, value?: number) => void
  setGauge: (name: string, value: number) => void
}

type OutboundMessageWorkerOptions = {
  queue: OutboundMessageQueue
  store: OutboundMessageStore
  sessionManager: SessionManager
  rateLimiter: OutboundRateLimiter
  maxRetries: number
  retryBaseMs: number
  retryMaxMs: number
  pollIntervalMs?: number
  maxPerChat?: number
  logger?: Logger
  metrics?: Metrics
}

export class OutboundMessageWorker {
  private readonly queue: OutboundMessageQueue
  private readonly store: OutboundMessageStore
  private readonly sessionManager: SessionManager
  private readonly rateLimiter: OutboundRateLimiter
  private readonly maxRetries: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly pollIntervalMs: number
  private readonly maxPerChat: number
  private readonly logger: Logger
  private readonly metrics?: Metrics
  private running = false
  private timer?: NodeJS.Timeout
  private readonly retryTimers = new Set<NodeJS.Timeout>()
  private lastTickAt?: number

  constructor(options: OutboundMessageWorkerOptions) {
    this.queue = options.queue
    this.store = options.store
    this.sessionManager = options.sessionManager
    this.rateLimiter = options.rateLimiter
    this.maxRetries = Math.max(0, options.maxRetries)
    this.retryBaseMs = Math.max(1000, options.retryBaseMs)
    this.retryMaxMs = Math.max(this.retryBaseMs, options.retryMaxMs)
    this.pollIntervalMs = Math.max(200, options.pollIntervalMs ?? 1000)
    this.maxPerChat = Math.max(1, options.maxPerChat ?? 25)
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.scheduleTick(0)
  }

  stop() {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    for (const timer of this.retryTimers) {
      clearTimeout(timer)
    }
    this.retryTimers.clear()
  }

  getStatus() {
    return {
      running: this.running,
      lastTickAt: this.lastTickAt ?? null
    }
  }

  private scheduleTick(delayMs: number) {
    if (!this.running) {
      return
    }

    if (this.timer) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      void this.tick()
    }, delayMs)
  }

  private async tick() {
    if (!this.running) {
      return
    }

    try {
      this.lastTickAt = Date.now()
      const chats = await this.queue.listChatsWithPending()
      this.metrics?.setGauge('queue.outbound.chats', chats.length)
      if (chats.length === 0) {
        this.scheduleTick(this.pollIntervalMs)
        return
      }

      for (const chat of chats) {
        let processed = 0
        while (this.running && processed < this.maxPerChat) {
          const item = await this.queue.peek(chat.sessionId, chat.chatId)
          if (!item) {
            break
          }

          const allowed = await this.rateLimiter.allow(chat.sessionId, chat.chatId)
          if (!allowed) {
            break
          }

          const dequeued = await this.queue.dequeue(chat.sessionId, chat.chatId)
          if (!dequeued) {
            break
          }

          await this.processItem(dequeued)
          processed += 1
        }
      }
    } catch (error) {
      this.logger.error?.('Outbound worker tick failed', { error: (error as Error).message })
      this.metrics?.increment('errors.total')
    } finally {
      this.scheduleTick(this.pollIntervalMs)
    }
  }

  private async processItem(item: OutboundQueueItem) {
    const record = await this.store.getById(item.outboundId)
    if (!record) {
      return
    }

    if (record.status !== 'queued' && record.status !== 'retrying') {
      return
    }

    const attempts = await this.store.markSending(record.id)
    if (attempts === null) {
      return
    }

    const maxAttempts = this.maxRetries + 1
    try {
      const payload = record.payload as OutboundMessagePayload | ({ text?: string } & Record<string, unknown>)
      const kind = (payload as any)?.type
      const legacyText = typeof (payload as any)?.text === 'string' ? (payload as any).text : ''

      const result =
        kind === 'media'
          ? await this.sessionManager.sendMedia(record.sessionId, record.chatId, {
              mediaType: (payload as any).mediaType,
              url: (payload as any).url,
              mimeType: (payload as any).mimeType,
              fileName: (payload as any).fileName,
              caption: (payload as any).caption
            })
          : kind === 'contact'
            ? await this.sessionManager.sendContact(record.sessionId, record.chatId, {
                contacts: Array.isArray((payload as any).contacts) ? (payload as any).contacts : [],
                displayName: (payload as any).displayName
              })
            : await this.sessionManager.sendText(record.sessionId, record.chatId, legacyText)
      await this.store.markSent(record.id, result.messageId ?? null)
      this.logger.info?.('Outbound message sent', {
        outboundId: record.id,
        sessionId: record.sessionId,
        chatId: record.chatId,
        messageId: result.messageId ?? null
      })
      this.metrics?.increment('messages.outbound.sent')
    } catch (error) {
      const message = (error as Error).message
      if (attempts < maxAttempts) {
        await this.store.markRetrying(record.id, message)
        const delayMs = computeBackoffMs(attempts, this.retryBaseMs, this.retryMaxMs)
        this.scheduleRetry(item, delayMs)
        this.logger.warn?.('Outbound message retry scheduled', {
          outboundId: record.id,
          sessionId: record.sessionId,
          chatId: record.chatId,
          attempts,
          delayMs,
          error: message
        })
        this.metrics?.increment('messages.outbound.retry')
      } else {
        await this.store.markFailed(record.id, message)
        this.logger.error?.('Outbound message failed', {
          outboundId: record.id,
          sessionId: record.sessionId,
          chatId: record.chatId,
          attempts,
          error: message
        })
        this.metrics?.increment('messages.outbound.failed')
        this.metrics?.increment('errors.total')
      }
    }
  }

  private scheduleRetry(item: OutboundQueueItem, delayMs: number) {
    const timer = setTimeout(() => {
      if (this.running) {
        void this.queue.enqueue({
          ...item,
          enqueuedAtMs: Date.now()
        })
      }
      this.retryTimers.delete(timer)
    }, delayMs)
    this.retryTimers.add(timer)
  }
}

function computeBackoffMs(attempt: number, baseMs: number, maxMs: number) {
  if (attempt <= 1) {
    return baseMs
  }
  const value = baseMs * Math.pow(2, attempt - 1)
  return Math.min(value, maxMs)
}
