import type { InboundMessageQueue } from './queue'
import type { InboundQueueItem } from './types'
import type { InboundDebounceStore } from './debounceStore'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type Metrics = {
  increment: (name: string, value?: number) => void
  setGauge: (name: string, value: number) => void
}

type InboundMessageWorkerOptions = {
  queue: InboundMessageQueue
  handler: (item: InboundQueueItem) => Promise<void>
  pollIntervalMs?: number
  maxPerChat?: number
  debounceMs?: number
  debounceStore?: InboundDebounceStore
  logger?: Logger
  metrics?: Metrics
}

export class InboundMessageWorker {
  private readonly queue: InboundMessageQueue
  private readonly handler: (item: InboundQueueItem) => Promise<void>
  private readonly pollIntervalMs: number
  private readonly maxPerChat: number
  private readonly debounceMs: number
  private readonly debounceStore?: InboundDebounceStore
  private readonly logger: Logger
  private readonly metrics?: Metrics
  private running = false
  private timer?: NodeJS.Timeout
  private lastTickAt?: number

  constructor(options: InboundMessageWorkerOptions) {
    this.queue = options.queue
    this.handler = options.handler
    this.pollIntervalMs = Math.max(200, options.pollIntervalMs ?? 1000)
    this.maxPerChat = Math.max(1, options.maxPerChat ?? 50)
    this.debounceMs = Math.max(0, options.debounceMs ?? 0)
    this.debounceStore = options.debounceStore
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
      this.metrics?.setGauge('queue.inbound.chats', chats.length)
      if (chats.length === 0) {
        this.scheduleTick(this.pollIntervalMs)
        return
      }

      for (const chat of chats) {
        if (this.debounceStore && this.debounceMs > 0) {
          const lastAt = await this.debounceStore.getLastAt(chat.sessionId, chat.chatId)
          if (lastAt && Date.now() - lastAt < this.debounceMs) {
            this.metrics?.increment('ai.debounce.wait')
            continue
          }
        }
        let processed = 0
        while (this.running && processed < this.maxPerChat) {
          const item = await this.queue.dequeue(chat.sessionId, chat.chatId)
          if (!item) {
            break
          }
          try {
            await this.handler(item)
          } catch (error) {
            this.logger.error?.('Inbound handler failed', {
              sessionId: item.sessionId,
              chatId: item.chatId,
              inboundId: item.inboundId,
              error: (error as Error).message
            })
            this.metrics?.increment('errors.total')
            await this.queue.enqueue(item)
            break
          }
          processed += 1
        }
      }
    } catch (error) {
      this.logger.error?.('Inbound worker tick failed', { error: (error as Error).message })
      this.metrics?.increment('errors.total')
    } finally {
      this.scheduleTick(this.pollIntervalMs)
    }
  }
}
