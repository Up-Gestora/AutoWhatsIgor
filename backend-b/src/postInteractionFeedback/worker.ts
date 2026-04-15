import type { MetricsStore } from '../observability/metrics'
import type { PostInteractionFeedbackDueLead } from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type PostInteractionFeedbackWorkerOptions = {
  service: {
    claimDueLeads(options: { batchSize: number; leaseMs: number }): Promise<PostInteractionFeedbackDueLead[]>
    processDueLead(claim: PostInteractionFeedbackDueLead): Promise<void>
    releaseDueLead(claim: Pick<PostInteractionFeedbackDueLead, 'sessionId' | 'leadId'>, nextContactAt: number | null): Promise<void>
  }
  pollIntervalMs: number
  batchSize: number
  leaseMs: number
  retryBaseMs: number
  retryMaxMs: number
  logger?: Logger
  metrics?: MetricsStore
}

export class PostInteractionFeedbackWorker {
  private readonly service: PostInteractionFeedbackWorkerOptions['service']
  private readonly pollIntervalMs: number
  private readonly batchSize: number
  private readonly leaseMs: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly retryState = new Map<string, number>()

  private running = false
  private timer?: NodeJS.Timeout
  private lastTickAt?: number

  constructor(options: PostInteractionFeedbackWorkerOptions) {
    this.service = options.service
    this.pollIntervalMs = Math.max(500, Math.floor(options.pollIntervalMs))
    this.batchSize = Math.max(1, Math.floor(options.batchSize))
    this.leaseMs = Math.max(5_000, Math.floor(options.leaseMs))
    this.retryBaseMs = Math.max(1_000, Math.floor(options.retryBaseMs))
    this.retryMaxMs = Math.max(this.retryBaseMs, Math.floor(options.retryMaxMs))
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
    this.retryState.clear()
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
      const claims = await this.service.claimDueLeads({
        batchSize: this.batchSize,
        leaseMs: this.leaseMs
      })
      for (const claim of claims) {
        await this.processClaim(claim)
      }
    } catch (error) {
      this.logger.error?.('Post-interaction feedback worker tick failed', {
        error: (error as Error).message
      })
      this.metrics?.increment('errors.total')
    } finally {
      this.scheduleTick(this.pollIntervalMs)
    }
  }

  private async processClaim(claim: PostInteractionFeedbackDueLead) {
    const retryKey = `${claim.sessionId}:${claim.leadId}`
    try {
      await this.service.processDueLead(claim)
      this.retryState.delete(retryKey)
      this.metrics?.increment('post_interaction_feedback.processed')
    } catch (error) {
      this.logger.warn?.('Post-interaction feedback due lead failed', {
        sessionId: claim.sessionId,
        leadId: claim.leadId,
        chatId: claim.chatId,
        error: (error as Error).message
      })
      await this.releaseWithBackoff(claim, retryKey)
    }
  }

  private async releaseWithBackoff(claim: PostInteractionFeedbackDueLead, retryKey: string) {
    const attempt = (this.retryState.get(retryKey) ?? 0) + 1
    this.retryState.set(retryKey, attempt)
    const retryDelayMs = Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** (attempt - 1))
    await this.service.releaseDueLead(claim, Date.now() + retryDelayMs)
    this.metrics?.increment('post_interaction_feedback.retry')
  }
}
