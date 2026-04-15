import type { MetricsStore } from './metrics'
import type { Logger } from './logger'

type AlertMonitorOptions = {
  metrics: MetricsStore
  logger: Logger
  intervalMs: number
  errorRateThreshold: number
  queueChatThreshold: number
}

export class AlertMonitor {
  private readonly metrics: MetricsStore
  private readonly logger: Logger
  private readonly intervalMs: number
  private readonly errorRateThreshold: number
  private readonly queueChatThreshold: number
  private lastErrors = 0
  private timer?: NodeJS.Timeout

  constructor(options: AlertMonitorOptions) {
    this.metrics = options.metrics
    this.logger = options.logger
    this.intervalMs = Math.max(1000, options.intervalMs)
    this.errorRateThreshold = Math.max(0, options.errorRateThreshold)
    this.queueChatThreshold = Math.max(0, options.queueChatThreshold)
  }

  start() {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => this.tick(), this.intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  private tick() {
    this.checkErrors()
    this.checkQueues()
  }

  private checkErrors() {
    if (this.errorRateThreshold <= 0) {
      return
    }
    const totalErrors = this.metrics.getCounter('errors.total')
    const delta = totalErrors - this.lastErrors
    this.lastErrors = totalErrors
    if (delta >= this.errorRateThreshold) {
      this.logger.warn('High error rate detected', {
        errors: delta,
        intervalMs: this.intervalMs
      })
    }
  }

  private checkQueues() {
    if (this.queueChatThreshold <= 0) {
      return
    }
    const inboundChats = this.metrics.getGauge('queue.inbound.chats') ?? 0
    const outboundChats = this.metrics.getGauge('queue.outbound.chats') ?? 0
    if (inboundChats >= this.queueChatThreshold || outboundChats >= this.queueChatThreshold) {
      this.logger.warn('Queue backlog detected', {
        inboundChats,
        outboundChats,
        threshold: this.queueChatThreshold
      })
    }
  }
}
