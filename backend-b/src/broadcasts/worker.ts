import type { Pool } from 'pg'
import type { CreditsService } from '../credits'
import type { MetricsStore } from '../observability/metrics'
import type { OutboundMessageQueue, OutboundMessageStatus, OutboundMessageStore } from '../messages'
import type { SessionManager } from '../sessions'
import { downloadToBuffer } from '../sessions/mediaDownloader'
import { normalizeWhatsappToE164Digits, toUserJid } from '../whatsapp/normalize'
import { cleanupBroadcastMedia } from './mediaCleanup'
import { BROADCAST_BILLING_BLOCK_COST_BRL, calculateBroadcastBilledBlocks } from './pricing'
import type { SessionTrafficStore } from './sessionTrafficStore'
import type { BroadcastJobRecord, BroadcastMessagePayload } from './types'
import { BroadcastJobStore } from './jobStore'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type BroadcastWorkerOptions = {
  pool: Pool
  jobStore: BroadcastJobStore
  sessionManager: SessionManager
  outboundQueue: OutboundMessageQueue
  outboundStore?: OutboundMessageStore
  trafficStore: SessionTrafficStore
  defaultCountryCode: string
  brStripNinthDigit?: boolean
  pollIntervalMs: number
  maxInFlight: number
  delayMinMs: number
  delayMaxMs: number
  yieldOutboundMs: number
  successTimeoutMs?: number
  sendTimeoutMs?: number
  disconnectPauseGraceMs?: number
  mediaDownloadTimeoutMs?: number
  mediaDownloadMaxBytes?: number
  creditsService?: CreditsService
  logger?: Logger
  metrics?: MetricsStore
}

const SUCCESS_TIMEOUT_SWEEP_INTERVAL_MS = 5000
const DISCONNECT_PAUSE_BATCH_LIMIT = 100
const LAST_OUTBOUND_SENT_GRACE_MS = 5 * 60 * 1000
const AUTO_REMOVED_LAST_MESSAGE_UNDELIVERED_PREFIX = 'auto_removed_last_message_undelivered'

type CachedMedia = {
  url: string
  buffer: Buffer
  mimeType?: string
  downloadedAtMs: number
}

type SessionStatusView = {
  sessionId: string
  status: string
}

export class BroadcastWorker {
  private readonly pool: Pool
  private readonly jobStore: BroadcastJobStore
  private readonly sessionManager: SessionManager
  private readonly outboundQueue: OutboundMessageQueue
  private readonly outboundStore?: OutboundMessageStore
  private readonly trafficStore: SessionTrafficStore
  private readonly defaultCountryCode: string
  private readonly brStripNinthDigit: boolean
  private readonly pollIntervalMs: number
  private readonly maxInFlight: number
  private readonly delayMinMs: number
  private readonly delayMaxMs: number
  private readonly yieldOutboundMs: number
  private readonly successTimeoutMs: number
  private readonly sendTimeoutMs: number
  private readonly disconnectPauseGraceMs: number
  private readonly mediaDownloadTimeoutMs: number
  private readonly mediaDownloadMaxBytes: number
  private readonly creditsService?: CreditsService
  private readonly logger: Logger
  private readonly metrics?: MetricsStore

  private readonly mediaCache = new Map<string, CachedMedia>()
  private readonly disconnectedSinceBySession = new Map<string, number>()

  private running = false
  private timer?: NodeJS.Timeout
  private lastTickAt?: number
  private lastSuccessTimeoutSweepAtMs = 0

  constructor(options: BroadcastWorkerOptions) {
    this.pool = options.pool
    this.jobStore = options.jobStore
    this.sessionManager = options.sessionManager
    this.outboundQueue = options.outboundQueue
    this.outboundStore = options.outboundStore
    this.trafficStore = options.trafficStore
    this.defaultCountryCode = options.defaultCountryCode
    this.brStripNinthDigit = Boolean(options.brStripNinthDigit)
    this.pollIntervalMs = Math.max(200, Math.floor(options.pollIntervalMs))
    this.maxInFlight = Math.max(1, Math.floor(options.maxInFlight))
    this.delayMinMs = Math.max(0, Math.floor(options.delayMinMs))
    this.delayMaxMs = Math.max(this.delayMinMs, Math.floor(options.delayMaxMs))
    this.yieldOutboundMs = Math.max(0, Math.floor(options.yieldOutboundMs))
    this.successTimeoutMs = Math.max(1, Math.floor(options.successTimeoutMs ?? 120000))
    this.sendTimeoutMs = Math.max(1, Math.floor(options.sendTimeoutMs ?? 30000))
    this.disconnectPauseGraceMs = Math.max(1000, Math.floor(options.disconnectPauseGraceMs ?? 45000))
    this.mediaDownloadTimeoutMs = Math.max(1000, Math.floor(options.mediaDownloadTimeoutMs ?? 20000))
    this.mediaDownloadMaxBytes = Math.max(1, Math.floor(options.mediaDownloadMaxBytes ?? 16777216))
    this.creditsService = options.creditsService
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
    this.mediaCache.clear()
    this.disconnectedSinceBySession.clear()
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
      this.pruneMediaCache()
      await this.maybeCancelJobsBySuccessTimeout()
      const sessionStatuses = this.getSessionStatuses()
      await this.maybePauseJobsByDisconnectGrace(sessionStatuses)
      const connectedSessionIds = this.getConnectedSessionIds(sessionStatuses)
      if (connectedSessionIds.length === 0) {
        this.scheduleTick(this.pollIntervalMs)
        return
      }

      const slots = Math.max(1, Math.min(this.maxInFlight, connectedSessionIds.length))
      const tasks = Array.from({ length: slots }).map(() => this.processOne(connectedSessionIds))
      await Promise.all(tasks)
    } catch (error) {
      this.logger.error?.('Broadcast worker tick failed', { error: (error as Error).message })
      this.metrics?.increment('errors.total')
    } finally {
      this.scheduleTick(this.pollIntervalMs)
    }
  }

  private getSessionStatuses(): SessionStatusView[] {
    const statuses = this.sessionManager.getDiagnostics().statuses
    if (!Array.isArray(statuses)) {
      return []
    }
    return statuses
      .map((entry: any) => ({
        sessionId: typeof entry?.sessionId === 'string' ? entry.sessionId : '',
        status: typeof entry?.status === 'string' ? entry.status : ''
      }))
      .filter((entry) => entry.sessionId)
  }

  private getConnectedSessionIds(statuses: SessionStatusView[]): string[] {
    return statuses.filter((s) => s.status === 'connected').map((s) => s.sessionId)
  }

  private async maybePauseJobsByDisconnectGrace(statuses: SessionStatusView[]): Promise<void> {
    const now = Date.now()
    const activeSessionIds = new Set<string>()

    for (const entry of statuses) {
      const sessionId = entry.sessionId.trim()
      if (!sessionId) {
        continue
      }
      activeSessionIds.add(sessionId)
      if (entry.status === 'connected') {
        this.disconnectedSinceBySession.delete(sessionId)
        continue
      }
      if (!this.disconnectedSinceBySession.has(sessionId)) {
        this.disconnectedSinceBySession.set(sessionId, now)
      }
    }

    for (const sessionId of this.disconnectedSinceBySession.keys()) {
      if (!activeSessionIds.has(sessionId)) {
        this.disconnectedSinceBySession.delete(sessionId)
      }
    }

    const overdueSessionIds = statuses
      .filter((entry) => entry.status !== 'connected')
      .map((entry) => entry.sessionId.trim())
      .filter(Boolean)
      .filter((sessionId) => {
        const disconnectedSince = this.disconnectedSinceBySession.get(sessionId)
        if (!disconnectedSince) {
          return false
        }
        return now - disconnectedSince >= this.disconnectPauseGraceMs
      })

    if (overdueSessionIds.length === 0) {
      return
    }

    const pausedJobs = await this.jobStore.pauseRunningJobsBySessionIds(
      overdueSessionIds,
      'session_not_connected',
      DISCONNECT_PAUSE_BATCH_LIMIT
    )
    if (pausedJobs.length === 0) {
      return
    }

    for (const pausedJob of pausedJobs) {
      const disconnectedSince = this.disconnectedSinceBySession.get(pausedJob.sessionId) ?? now
      const disconnectedForMs = Math.max(0, now - disconnectedSince)
      this.logger.info?.('Broadcast job auto-paused by disconnect grace', {
        sessionId: pausedJob.sessionId,
        jobId: pausedJob.id,
        disconnectedForMs,
        graceMs: this.disconnectPauseGraceMs
      })
      this.metrics?.increment('broadcast.jobs.paused.disconnect_grace')
    }
  }

  private async processOne(connectedSessionIds: string[]): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const job = await this.jobStore.lockNextRunnableJob(client as any, connectedSessionIds)
      if (!job) {
        await client.query('COMMIT')
        return
      }

      let jobCompletedNow = false

      const yielded = await this.maybeYieldForAi(client as any, job)
      if (yielded) {
        await client.query('COMMIT')
        return
      }

      const sessionStatus = this.sessionManager.getSessionStatus(job.sessionId)
      if (!sessionStatus || sessionStatus.status !== 'connected') {
        await this.jobStore.pauseJob(client as any, job.sessionId, job.id, 'session_not_connected')
        await client.query('COMMIT')
        return
      }

      const item = await this.jobStore.lockNextPendingItem(client as any, job.sessionId, job.id)
      if (!item) {
        await this.jobStore.completeJob(client as any, job.sessionId, job.id)
        await client.query('COMMIT')
        jobCompletedNow = true
        this.onJobCompleted(job, 'completed')
        return
      }

      const nextProcessed = job.sentCount + job.failedCount + 1
      const autoRemovalReason = await this.resolveAutoRemovalReason(job, item.chat_id)
      if (autoRemovalReason) {
        let removedFromList = false
        try {
          removedFromList = await this.jobStore.deleteContactByWhatsapp(
            client as any,
            job.sessionId,
            job.listId,
            item.contact_whatsapp
          )
        } catch (error) {
          this.logger.warn?.('Broadcast worker failed to remove contact from list after delivery guard', {
            sessionId: job.sessionId,
            jobId: job.id,
            listId: job.listId,
            whatsapp: item.contact_whatsapp,
            error: (error as Error).message
          })
          this.metrics?.increment('broadcast.guard.list_remove_failed')
        }

        await this.jobStore.markItemFailed(
          client as any,
          item.id,
          buildAutoRemovedReason(autoRemovalReason, removedFromList)
        )
        if (nextProcessed >= job.totalCount) {
          await this.jobStore.incrementJobCounts(client as any, {
            sessionId: job.sessionId,
            jobId: job.id,
            sentInc: 0,
            failedInc: 1,
            nextSendAtMs: null
          })
          await this.jobStore.completeJob(client as any, job.sessionId, job.id)
          jobCompletedNow = true
        } else {
          await this.jobStore.incrementJobCounts(client as any, {
            sessionId: job.sessionId,
            jobId: job.id,
            sentInc: 0,
            failedInc: 1,
            nextSendAtMs: Date.now() + this.randomDelayMs()
          })
        }

        await client.query('COMMIT')
        this.metrics?.increment('broadcast.items.failed')
        this.metrics?.increment('broadcast.items.auto_removed.last_undelivered')
        if (jobCompletedNow) {
          this.onJobCompleted(job, 'completed')
        }
        return
      }

      try {
        const chatId = this.resolveChatId(item)
        const sendResult = await this.sendWithTimeout(job, chatId)
        await this.jobStore.markItemSent(client as any, item.id, sendResult.messageId ?? null)

        if (nextProcessed >= job.totalCount) {
          await this.jobStore.incrementJobCounts(client as any, {
            sessionId: job.sessionId,
            jobId: job.id,
            sentInc: 1,
            failedInc: 0,
            nextSendAtMs: null
          })
          await this.jobStore.completeJob(client as any, job.sessionId, job.id)
          jobCompletedNow = true
        } else {
          await this.jobStore.incrementJobCounts(client as any, {
            sessionId: job.sessionId,
            jobId: job.id,
            sentInc: 1,
            failedInc: 0,
            nextSendAtMs: Date.now() + this.randomDelayMs()
          })
        }
        await this.chargeBroadcastBlocks(client as any, job, job.sentCount + 1)

        await client.query('COMMIT')
        this.metrics?.increment('broadcast.items.sent')
        if (jobCompletedNow) {
          this.onJobCompleted(job, 'completed')
        }
        return
      } catch (error) {
        const message = (error as Error).message

        if (isSessionUnavailableError(message)) {
          await this.jobStore.pauseJob(client as any, job.sessionId, job.id, 'session_not_connected')
          await client.query('COMMIT')
          return
        }

        if (isFatalJobError(message)) {
          await this.jobStore.failJob(client as any, job.sessionId, job.id, message)
          await client.query('COMMIT')
          this.onJobCompleted(job, 'failed')
          return
        }

        await this.jobStore.markItemFailed(client as any, item.id, message)
        if (nextProcessed >= job.totalCount) {
          await this.jobStore.incrementJobCounts(client as any, {
            sessionId: job.sessionId,
            jobId: job.id,
            sentInc: 0,
            failedInc: 1,
            nextSendAtMs: null
          })
          await this.jobStore.completeJob(client as any, job.sessionId, job.id)
          jobCompletedNow = true
        } else {
          await this.jobStore.incrementJobCounts(client as any, {
            sessionId: job.sessionId,
            jobId: job.id,
            sentInc: 0,
            failedInc: 1,
            nextSendAtMs: Date.now() + this.randomDelayMs()
          })
        }

        await client.query('COMMIT')
        this.metrics?.increment('broadcast.items.failed')
        if (jobCompletedNow) {
          this.onJobCompleted(job, 'completed')
        }
        return
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {}
      this.logger.warn?.('Broadcast worker job failed', { error: (error as Error).message })
      this.metrics?.increment('errors.total')
    } finally {
      client.release()
    }
  }

  private async maybeYieldForAi(client: { query: (sql: string, params?: unknown[]) => Promise<any> }, job: BroadcastJobRecord): Promise<boolean> {
    const hasOutboundPending = await this.outboundQueue.hasPendingForSession(job.sessionId).catch(() => false)
    if (hasOutboundPending) {
      await this.jobStore.scheduleNextSendAt(client as any, job.sessionId, job.id, Date.now() + this.yieldOutboundMs)
      return true
    }

    const hasRecentInbound = await this.trafficStore.hasRecentInbound(job.sessionId).catch(() => false)
    if (hasRecentInbound) {
      await this.jobStore.scheduleNextSendAt(client as any, job.sessionId, job.id, Date.now() + this.yieldOutboundMs)
      return true
    }

    return false
  }

  private async resolveAutoRemovalReason(job: BroadcastJobRecord, chatId: string): Promise<string | null> {
    if (!isAutoRemovalGuardEnabled(job.payload)) {
      return null
    }
    if (!this.outboundStore) {
      return null
    }

    try {
      const latest = await this.outboundStore.getLatestByChat(job.sessionId, chatId)
      if (!latest) {
        return null
      }

      if (latest.status === 'failed') {
        return 'status_failed'
      }

      if (latest.status === 'sent' && isSentBeyondGrace(latest.status, latest.updatedAtMs, latest.createdAtMs, Date.now())) {
        return 'status_sent_timeout'
      }

      return null
    } catch (error) {
      this.logger.warn?.('Broadcast worker failed to resolve latest outbound status for guard', {
        sessionId: job.sessionId,
        jobId: job.id,
        chatId,
        error: (error as Error).message
      })
      this.metrics?.increment('broadcast.guard.last_outbound.lookup_failed')
      return null
    }
  }

  private async send(job: BroadcastJobRecord, chatId: string) {
    const payload = job.payload as BroadcastMessagePayload
    if (!payload || typeof payload !== 'object') {
      throw new Error('broadcast_payload_invalid')
    }

    if (payload.type === 'text') {
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      if (!text) {
        throw new Error('broadcast_text_required')
      }
      return this.sessionManager.sendText(job.sessionId, chatId, text, { priority: 'low' })
    }

    if (payload.type === 'media') {
      const url = typeof payload.url === 'string' ? payload.url.trim() : ''
      if (!url) {
        throw new Error('broadcast_url_required')
      }

      const cached = this.mediaCache.get(job.id)
      const ttlMs = 6 * 60 * 60 * 1000
      const canReuse = cached && cached.url === url && Date.now() - cached.downloadedAtMs < ttlMs

      const download = async () => {
        const downloaded = await downloadToBuffer(url, {
          timeoutMs: this.mediaDownloadTimeoutMs,
          maxBytes: this.mediaDownloadMaxBytes
        })
        const headerMime = downloaded.contentType?.split(';')[0]?.trim() || undefined
        const payloadMime = typeof payload.mimeType === 'string' ? payload.mimeType.trim() : ''
        const effectiveMimeType = payloadMime || headerMime
        this.mediaCache.set(job.id, {
          url,
          buffer: downloaded.buffer,
          ...(effectiveMimeType ? { mimeType: effectiveMimeType } : {}),
          downloadedAtMs: Date.now()
        })
        return this.mediaCache.get(job.id)!
      }

      const media = canReuse ? cached! : await download()

      return this.sessionManager.sendMedia(
        job.sessionId,
        chatId,
        {
          mediaType: payload.mediaType,
          data: media.buffer,
          ...(media.mimeType ? { mimeType: media.mimeType } : {}),
          ...(payload.fileName ? { fileName: payload.fileName } : {}),
          ...(payload.caption ? { caption: payload.caption } : {})
        },
        { priority: 'low' }
      )
    }

    throw new Error('broadcast_payload_invalid')
  }

  private async sendWithTimeout(job: BroadcastJobRecord, chatId: string) {
    return withTimeout(this.send(job, chatId), this.sendTimeoutMs, 'send-timeout')
  }

  private async maybeCancelJobsBySuccessTimeout() {
    const now = Date.now()
    if (now - this.lastSuccessTimeoutSweepAtMs < SUCCESS_TIMEOUT_SWEEP_INTERVAL_MS) {
      return
    }
    this.lastSuccessTimeoutSweepAtMs = now

    const cancelledJobs = await this.jobStore.cancelJobsBySuccessTimeout(this.successTimeoutMs, 'timeout_no_success', 100)
    if (cancelledJobs.length === 0) {
      return
    }

    for (const cancelledJob of cancelledJobs) {
      this.logger.info?.('Broadcast job cancelled by success timeout', {
        sessionId: cancelledJob.sessionId,
        jobId: cancelledJob.id,
        timeoutMs: this.successTimeoutMs
      })
      this.metrics?.increment('broadcast.jobs.cancelled.timeout')
      this.onJobCompleted(cancelledJob, 'cancelled')
    }
  }

  private resolveChatId(item: { chat_id: string; contact_whatsapp: string }): string {
    if (!this.brStripNinthDigit) {
      return item.chat_id
    }

    try {
      const digits = normalizeWhatsappToE164Digits(item.contact_whatsapp, this.defaultCountryCode, {
        brStripNinthDigit: true
      })
      return toUserJid(digits)
    } catch {
      // Fallback to the persisted chat_id if the stored whatsapp is malformed.
      return item.chat_id
    }
  }

  private randomDelayMs(): number {
    if (this.delayMaxMs <= this.delayMinMs) {
      return this.delayMinMs
    }
    const delta = this.delayMaxMs - this.delayMinMs
    return this.delayMinMs + Math.floor(Math.random() * (delta + 1))
  }

  private async chargeBroadcastBlocks(
    client: { query: (sql: string, params?: unknown[]) => Promise<any> },
    job: BroadcastJobRecord,
    sentCount: number
  ): Promise<void> {
    const expectedBlocks = calculateBroadcastBilledBlocks(sentCount)
    const initialBlocks = Math.max(0, Math.floor(job.chargedBlocks ?? 0))
    if (expectedBlocks <= initialBlocks) {
      return
    }

    let latestChargedBlocks = initialBlocks

    for (let block = initialBlocks + 1; block <= expectedBlocks; block += 1) {
      const referenceId = `broadcast:${job.id}:block:${block}`

      if (!this.creditsService) {
        break
      }

      try {
        await this.creditsService.consume(job.sessionId, BROADCAST_BILLING_BLOCK_COST_BRL, {
          reason: 'broadcast_transmission',
          referenceId
        })
        latestChargedBlocks = block
        this.metrics?.increment('broadcast.credits.debited')
      } catch (error) {
        const code = getPgErrorCode(error)
        if (code === '23505') {
          latestChargedBlocks = block
          this.metrics?.increment('broadcast.credits.debited_idempotent')
          continue
        }

        this.logger.warn?.('Broadcast credits debit failed', {
          sessionId: job.sessionId,
          jobId: job.id,
          block,
          error: (error as Error).message
        })
        this.metrics?.increment('broadcast.credits.debit_failed')
        break
      }
    }

    if (latestChargedBlocks > initialBlocks) {
      await this.jobStore.updateChargedBlocks(client as any, job.sessionId, job.id, latestChargedBlocks)
      job.chargedBlocks = latestChargedBlocks
    }
  }

  private pruneMediaCache() {
    if (this.mediaCache.size === 0) {
      return
    }
    const ttlMs = 6 * 60 * 60 * 1000
    const now = Date.now()
    for (const [jobId, entry] of this.mediaCache.entries()) {
      if (now - entry.downloadedAtMs > ttlMs) {
        this.mediaCache.delete(jobId)
      }
    }
    const maxEntries = 25
    if (this.mediaCache.size <= maxEntries) {
      return
    }
    const entries = Array.from(this.mediaCache.entries()).sort((a, b) => a[1].downloadedAtMs - b[1].downloadedAtMs)
    const overflow = entries.length - maxEntries
    for (let i = 0; i < overflow; i += 1) {
      this.mediaCache.delete(entries[i][0])
    }
  }

  private onJobCompleted(job: BroadcastJobRecord, status: 'completed' | 'cancelled' | 'failed') {
    this.mediaCache.delete(job.id)
    if (status === 'completed' || status === 'failed') {
      void cleanupBroadcastMedia(job.sessionId, job.payload as any, this.logger)
    }
  }
}

function isSessionUnavailableError(message: string): boolean {
  const value = (message ?? '').toLowerCase()
  return value.includes('session-not-connected') || value.includes('session-not-ready')
}

function isFatalJobError(message: string): boolean {
  const value = (message ?? '').toLowerCase()
  if (!value) {
    return false
  }
  return value.startsWith('broadcast_') || value.includes('session-send-not-supported')
}

function getPgErrorCode(error: unknown): string | null {
  const value = error as any
  const direct = value?.code
  if (typeof direct === 'string' && direct) {
    return direct
  }
  const cause = value?.cause?.code
  return typeof cause === 'string' && cause ? cause : null
}

function isAutoRemovalGuardEnabled(payload: BroadcastMessagePayload): boolean {
  const guard = (payload as { removeContactIfLastMessageUndelivered?: boolean }).removeContactIfLastMessageUndelivered
  return guard !== false
}

function isSentBeyondGrace(
  status: OutboundMessageStatus,
  updatedAtMs: number,
  createdAtMs: number,
  nowMs: number
): boolean {
  if (status !== 'sent') {
    return false
  }

  const baseTimestamp =
    Number.isFinite(updatedAtMs) && updatedAtMs > 0
      ? updatedAtMs
      : Number.isFinite(createdAtMs) && createdAtMs > 0
        ? createdAtMs
        : 0
  if (baseTimestamp <= 0) {
    return false
  }
  return nowMs - baseTimestamp >= LAST_OUTBOUND_SENT_GRACE_MS
}

function buildAutoRemovedReason(reason: string, removedFromList: boolean): string {
  return `${AUTO_REMOVED_LAST_MESSAGE_UNDELIVERED_PREFIX}:${reason}:removed=${removedFromList ? '1' : '0'}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, reason: string): Promise<T> {
  if (!timeoutMs) {
    return promise
  }

  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(reason)), timeoutMs)
      })
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
