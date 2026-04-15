import type Redis from 'ioredis'
import type { SessionStatusSnapshot } from './types'
import { SessionEventBus } from './eventBus'
import { SessionStatusStore } from './statusStore'

type Logger = {
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type SessionEventServiceOptions = {
  eventBus: SessionEventBus
  statusStore: SessionStatusStore
  redis: Redis
  qrMinIntervalMs: number
  qrThrottlePrefix?: string
  logger?: Logger
}

export class SessionEventService {
  private readonly eventBus: SessionEventBus
  private readonly statusStore: SessionStatusStore
  private readonly redis: Redis
  private readonly qrMinIntervalMs: number
  private readonly qrThrottlePrefix: string
  private readonly logger: Logger

  constructor(options: SessionEventServiceOptions) {
    this.eventBus = options.eventBus
    this.statusStore = options.statusStore
    this.redis = options.redis
    this.qrMinIntervalMs = Math.max(0, options.qrMinIntervalMs)
    this.qrThrottlePrefix = options.qrThrottlePrefix ?? 'qr-throttle'
    this.logger = options.logger ?? {}
  }

  async handleStatus(snapshot: SessionStatusSnapshot): Promise<void> {
    await this.statusStore.setStatus(snapshot)
    this.eventBus.emit(snapshot.sessionId, 'status', snapshot)
  }

  async handleQr(sessionId: string, qr: string): Promise<void> {
    if (!(await this.shouldEmitQr(sessionId))) {
      this.logger.warn?.('QR suppressed by rate limit', { sessionId })
      return
    }

    this.eventBus.emit(sessionId, 'qr', {
      sessionId,
      qr,
      generatedAt: Date.now()
    })
  }

  private async shouldEmitQr(sessionId: string): Promise<boolean> {
    if (this.qrMinIntervalMs <= 0) {
      return true
    }

    const key = `${this.qrThrottlePrefix}:${sessionId}`
    try {
      const result = await this.redis.set(key, `${Date.now()}`, 'PX', this.qrMinIntervalMs, 'NX')
      return result === 'OK'
    } catch (error) {
      this.logger.error?.('QR throttle check failed', { sessionId, error: (error as Error).message })
      return true
    }
  }
}
