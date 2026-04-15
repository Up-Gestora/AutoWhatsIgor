import crypto from 'crypto'
import type { AuthStateStore } from '../auth'
import { computeBackoffMs } from './backoff'
import { AsyncSemaphore } from './semaphore'
import { RedisSessionLockManager, SessionLock } from './lockManager'
import type { MetricsStore } from '../observability/metrics'
import type {
  SessionBackoffState,
  SessionChatMetadataUpdate,
  SessionDriver,
  SessionDriverHandle,
  SessionSendContactInput,
  SessionInboundMessage,
  SessionMessageStatusUpdate,
  SessionSendMediaInput,
  SessionSendResult,
  SessionStatus,
  SessionStatusSnapshot,
  SessionStartAttempt,
  SessionWhatsappLookupResult
} from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type SessionEntry = {
  sessionId: string
  status: SessionStatus
  updatedAt: number
  reason?: string
  handle?: SessionDriverHandle
  lock?: SessionLock
  lockHeartbeat?: NodeJS.Timeout
  startAttempt?: SessionStartAttempt
  startTimeoutTimer?: NodeJS.Timeout
  startSlotRelease?: () => void
  backoff: SessionBackoffState
  hasConnected?: boolean
  sendQueue: SendQueue
}

type SendPriority = 'high' | 'low'

type SendOptions = {
  priority?: SendPriority
}

type SendTask = {
  priority: SendPriority
  run: () => Promise<SessionSendResult>
  resolve: (value: SessionSendResult) => void
  reject: (reason?: unknown) => void
}

type SendQueue = {
  running: boolean
  scheduled: boolean
  high: SendTask[]
  low: SendTask[]
}

type SessionManagerOptions = {
  driver: SessionDriver
  lockManager: RedisSessionLockManager
  authStore?: AuthStateStore
  logger?: Logger
  metrics?: MetricsStore
  maxSessions: number
  shardCount?: number
  shardIndex?: number
  onStatusUpdate?: (snapshot: SessionStatusSnapshot) => void
  onQr?: (sessionId: string, qr: string) => void
  onInboundMessage?: (sessionId: string, message: SessionInboundMessage) => void
  onChatMetadata?: (sessionId: string, update: SessionChatMetadataUpdate) => void
  onMessageStatus?: (sessionId: string, update: SessionMessageStatusUpdate) => void
  startTimeoutMs: number
  startConcurrency: number
  lockTtlMs: number
  lockRenewMs: number
  backoffBaseMs: number
  backoffMaxMs: number
  backoffResetMs: number
}

export class SessionManager {
  private readonly driver: SessionDriver
  private readonly lockManager: RedisSessionLockManager
  private readonly authStore?: AuthStateStore
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly maxSessions: number
  private readonly shardCount: number
  private readonly shardIndex: number
  private readonly onStatusUpdate?: (snapshot: SessionStatusSnapshot) => void
  private readonly onQr?: (sessionId: string, qr: string) => void
  private readonly onInboundMessage?: (sessionId: string, message: SessionInboundMessage) => void
  private readonly onChatMetadata?: (sessionId: string, update: SessionChatMetadataUpdate) => void
  private readonly onMessageStatus?: (sessionId: string, update: SessionMessageStatusUpdate) => void
  private readonly startTimeoutMs: number
  private readonly lockTtlMs: number
  private readonly lockRenewMs: number
  private readonly backoffBaseMs: number
  private readonly backoffMaxMs: number
  private readonly backoffResetMs: number
  private readonly semaphore: AsyncSemaphore
  private readonly sessions = new Map<string, SessionEntry>()

  constructor(options: SessionManagerOptions) {
    this.driver = options.driver
    this.lockManager = options.lockManager
    this.authStore = options.authStore
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.maxSessions = Math.max(0, options.maxSessions)
    this.shardCount = Math.max(0, options.shardCount ?? 0)
    this.shardIndex = Math.max(0, options.shardIndex ?? 0)
    this.onStatusUpdate = options.onStatusUpdate
    this.onQr = options.onQr
    this.onInboundMessage = options.onInboundMessage
    this.onChatMetadata = options.onChatMetadata
    this.onMessageStatus = options.onMessageStatus
    this.startTimeoutMs = options.startTimeoutMs
    this.lockTtlMs = options.lockTtlMs
    this.lockRenewMs = options.lockRenewMs
    this.backoffBaseMs = options.backoffBaseMs
    this.backoffMaxMs = options.backoffMaxMs
    this.backoffResetMs = options.backoffResetMs
    this.semaphore = new AsyncSemaphore(options.startConcurrency)
  }

  async startSession(sessionId: string): Promise<SessionStatusSnapshot> {
    const entry = this.getOrCreate(sessionId)
    if (entry.status === 'connected' || entry.status === 'starting' || entry.status === 'waiting_qr') {
      return this.snapshot(entry)
    }

    const handleDecision = this.canHandleSession(sessionId)
    if (!handleDecision.ok) {
      this.updateStatus(entry, 'error', handleDecision.reason)
      this.metrics?.increment('sessions.start.rejected')
      if (handleDecision.reason) {
        this.metrics?.increment(`sessions.start.rejected.${sanitizeMetricKey(handleDecision.reason)}`)
      }
      this.logWarn('Session start rejected', { sessionId, reason: handleDecision.reason })
      return this.snapshot(entry)
    }

    if (this.isInBackoff(entry)) {
      return this.snapshot(entry, 'backoff')
    }

    const releaseSlot = await this.semaphore.acquire()
    entry.startSlotRelease = releaseSlot

    const lock = await this.lockManager.acquire(sessionId, this.lockTtlMs)
    if (!lock) {
      releaseSlot()
      entry.startSlotRelease = undefined
      this.updateStatus(entry, 'error', 'lock-unavailable')
      this.metrics?.increment('sessions.start.lock_unavailable')
      return this.snapshot(entry)
    }

    entry.lock = lock
    this.startLockHeartbeat(entry)
    this.beginStartAttempt(entry)
    this.metrics?.increment('sessions.start.attempt')
    this.updateStatus(entry, 'starting')

    try {
      entry.handle = await this.driver.start(sessionId, {
        onQr: (qr) => {
          this.updateStatus(entry, 'waiting_qr')
          this.finishStartAttempt(entry)
          this.onQr?.(sessionId, qr)
          this.logInfo('QR generated', { sessionId, length: qr.length })
        },
        onReady: () => {
          this.updateStatus(entry, 'connected')
          this.finishStartAttempt(entry)
          this.resetBackoff(entry)
          this.logInfo('Session connected', { sessionId })
          this.metrics?.increment('sessions.start.success')
        },
        onStatus: (status, reason) => {
          this.updateStatus(entry, status, reason)
        },
        onDisconnected: (reason) => {
          this.updateStatus(entry, 'stopped', reason)
          this.releaseLock(entry).catch((error) => {
            this.logError('Failed to release lock', { sessionId, error: error.message })
          })
        },
        onMessage: (message) => {
          if (!this.onInboundMessage) {
            return
          }
          try {
            this.onInboundMessage(sessionId, message)
          } catch (error) {
            this.logError('Failed to handle inbound message', {
              sessionId,
              error: (error as Error).message
            })
          }
        },
        onChatMetadata: (update) => {
          if (!this.onChatMetadata) {
            return
          }
          try {
            this.onChatMetadata(sessionId, update)
          } catch (error) {
            this.logError('Failed to handle chat metadata update', {
              sessionId,
              error: (error as Error).message
            })
          }
        },
        onMessageStatus: (update) => {
          if (!this.onMessageStatus) {
            return
          }
          try {
            this.onMessageStatus(sessionId, update)
          } catch (error) {
            this.logError('Failed to handle message status update', {
              sessionId,
              error: (error as Error).message
            })
          }
        },
        onError: (error) => {
          this.handleStartFailure(entry, error)
        },
        onPurgeRequested: (reason) => {
          this.metrics?.increment('sessions.auto_purge')
          this.metrics?.increment(`sessions.auto_purge.${sanitizeMetricKey(reason)}`)
          this.logWarn('Session auto-purged', { sessionId, reason })
          void this.purgeSession(sessionId, `auto-purge:${reason}`).catch((error) => {
            this.logError('Auto-purge failed', { sessionId, reason, error: (error as Error).message })
            this.metrics?.increment('errors.total')
          })
        }
      })
    } catch (error) {
      this.handleStartFailure(entry, error as Error)
    }

    return this.snapshot(entry)
  }

  async stopSession(sessionId: string, reason?: string): Promise<SessionStatusSnapshot> {
    const entry = this.sessions.get(sessionId)
    if (!entry) {
      return {
        sessionId,
        status: 'stopped',
        updatedAt: Date.now(),
        reason: reason ?? 'not-found'
      }
    }

    this.updateStatus(entry, 'stopped', reason)
    this.flushSendQueue(entry, new Error(reason ? `session-stopped:${reason}` : 'session-stopped'))
    this.cancelStartAttempt(entry, 'stop')

    if (entry.handle) {
      await entry.handle.stop().catch((error) => {
        this.logError('Error stopping session handle', { sessionId, error: error.message })
      })
      entry.handle = undefined
    }

    await this.releaseLock(entry)
    return this.snapshot(entry)
  }

  async purgeSession(sessionId: string, reason?: string): Promise<SessionStatusSnapshot> {
    const snapshot = await this.stopSession(sessionId, reason ?? 'purge')
    if (this.authStore) {
      await this.authStore.delete(sessionId).catch((error) => {
        this.logError('Failed to purge auth state', { sessionId, error: error.message })
      })
    }
    this.sessions.delete(sessionId)
    return snapshot
  }

  getSessionStatus(sessionId: string): SessionStatusSnapshot | null {
    const entry = this.sessions.get(sessionId)
    return entry ? this.snapshot(entry) : null
  }

  async sendText(
    sessionId: string,
    chatId: string,
    text: string,
    options: SendOptions = {}
  ): Promise<SessionSendResult> {
    const safeSessionId = sessionId.trim()
    const safeChatId = chatId.trim()
    const safeText = text.trim()

    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeChatId) {
      throw new Error('chatId is required')
    }
    if (!safeText) {
      throw new Error('text is required')
    }

    const entry = this.sessions.get(safeSessionId)
    if (!entry) {
      throw new Error('session-not-ready')
    }

    return this.enqueueSend(entry, {
      priority: options.priority ?? 'high',
      run: async () => {
        const current = this.sessions.get(safeSessionId)
        if (!current || !current.handle) {
          throw new Error('session-not-ready')
        }

        if (current.status !== 'connected') {
          throw new Error('session-not-connected')
        }

        if (!current.handle.sendText) {
          throw new Error('session-send-not-supported')
        }

        return current.handle.sendText(safeChatId, safeText)
      }
    })
  }

  async sendMedia(
    sessionId: string,
    chatId: string,
    input: SessionSendMediaInput,
    options: SendOptions = {}
  ): Promise<SessionSendResult> {
    const safeSessionId = sessionId.trim()
    const safeChatId = chatId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeChatId) {
      throw new Error('chatId is required')
    }

    const entry = this.sessions.get(safeSessionId)
    if (!entry) {
      throw new Error('session-not-ready')
    }

    const normalizedInput = normalizeMediaInput(input)

    return this.enqueueSend(entry, {
      priority: options.priority ?? 'high',
      run: async () => {
        const current = this.sessions.get(safeSessionId)
        if (!current || !current.handle) {
          throw new Error('session-not-ready')
        }

        if (current.status !== 'connected') {
          throw new Error('session-not-connected')
        }

        if (!current.handle.sendMedia) {
          throw new Error('session-send-not-supported')
        }

        return current.handle.sendMedia(safeChatId, normalizedInput)
      }
    })
  }

  async sendContact(
    sessionId: string,
    chatId: string,
    input: SessionSendContactInput,
    options: SendOptions = {}
  ): Promise<SessionSendResult> {
    const safeSessionId = sessionId.trim()
    const safeChatId = chatId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeChatId) {
      throw new Error('chatId is required')
    }

    const entry = this.sessions.get(safeSessionId)
    if (!entry) {
      throw new Error('session-not-ready')
    }

    const normalizedInput = normalizeContactInput(input)

    return this.enqueueSend(entry, {
      priority: options.priority ?? 'high',
      run: async () => {
        const current = this.sessions.get(safeSessionId)
        if (!current || !current.handle) {
          throw new Error('session-not-ready')
        }

        if (current.status !== 'connected') {
          throw new Error('session-not-connected')
        }

        if (!current.handle.sendContact) {
          throw new Error('session-send-not-supported')
        }

        return current.handle.sendContact(safeChatId, normalizedInput)
      }
    })
  }

  async checkWhatsappNumbers(sessionId: string, phoneNumbers: string[]): Promise<SessionWhatsappLookupResult[]> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const normalizedNumbers = normalizeWhatsappLookupNumbers(phoneNumbers)
    if (normalizedNumbers.length === 0) {
      return []
    }

    const entry = this.sessions.get(safeSessionId)
    if (!entry || !entry.handle) {
      throw new Error('session-not-ready')
    }

    if (entry.status !== 'connected') {
      throw new Error('session-not-connected')
    }

    if (!entry.handle.checkWhatsappNumbers) {
      throw new Error('session-lookup-not-supported')
    }

    return entry.handle.checkWhatsappNumbers(normalizedNumbers)
  }

  getDiagnostics() {
    const statuses = Array.from(this.sessions.values()).map((entry) => this.snapshot(entry))
    const startAttempts = Array.from(this.sessions.values())
      .map((entry) => entry.startAttempt)
      .filter(Boolean) as SessionStartAttempt[]
    const locks = Array.from(this.sessions.values()).map((entry) => ({
      sessionId: entry.sessionId,
      hasLock: Boolean(entry.lock)
    }))
    const backoffs = Array.from(this.sessions.values()).map((entry) => ({
      sessionId: entry.sessionId,
      backoffUntil: entry.backoff.backoffUntil ?? null,
      failureCount: entry.backoff.failureCount
    }))

    return {
      sessionsCount: this.sessions.size,
      statuses,
      startAttempts,
      locks,
      backoffs,
      startSemaphore: this.semaphore.snapshot()
    }
  }

  canHandleSession(sessionId: string): { ok: boolean; reason?: string } {
    if (this.shardCount > 1 && this.shardIndex >= this.shardCount) {
      return { ok: false, reason: 'shard-config-invalid' }
    }

    if (this.shardCount > 1) {
      const shard = hashSessionId(sessionId) % this.shardCount
      if (shard !== this.shardIndex) {
        return { ok: false, reason: 'shard-mismatch' }
      }
    }

    if (this.maxSessions > 0 && this.countActiveSessions() >= this.maxSessions) {
      return { ok: false, reason: 'capacity-exceeded' }
    }

    return { ok: true }
  }

  private enqueueSend(entry: SessionEntry, task: { priority: SendPriority; run: () => Promise<SessionSendResult> }) {
    return new Promise<SessionSendResult>((resolve, reject) => {
      const queued: SendTask = {
        priority: task.priority,
        run: task.run,
        resolve,
        reject
      }

      if (queued.priority === 'low') {
        entry.sendQueue.low.push(queued)
      } else {
        entry.sendQueue.high.push(queued)
      }

      this.scheduleDrain(entry)
    })
  }

  private scheduleDrain(entry: SessionEntry) {
    if (entry.sendQueue.running || entry.sendQueue.scheduled) {
      return
    }
    entry.sendQueue.scheduled = true
    queueMicrotask(() => {
      entry.sendQueue.scheduled = false
      void this.drainSendQueue(entry)
    })
  }

  private async drainSendQueue(entry: SessionEntry) {
    if (entry.sendQueue.running) {
      return
    }

    entry.sendQueue.running = true
    try {
      while (true) {
        const next = entry.sendQueue.high.shift() ?? entry.sendQueue.low.shift()
        if (!next) {
          break
        }

        try {
          const result = await next.run()
          next.resolve(result)
        } catch (error) {
          next.reject(error)
        }
      }
    } finally {
      entry.sendQueue.running = false
    }
  }

  private flushSendQueue(entry: SessionEntry, error: Error) {
    const pending = [...entry.sendQueue.high.splice(0), ...entry.sendQueue.low.splice(0)]
    for (const task of pending) {
      try {
        task.reject(error)
      } catch {
        // Ignore
      }
    }
  }

  private getOrCreate(sessionId: string): SessionEntry {
    const existing = this.sessions.get(sessionId)
    if (existing) {
      return existing
    }

    const entry: SessionEntry = {
      sessionId,
      status: 'idle',
      updatedAt: Date.now(),
      backoff: {
        failureCount: 0
      },
      sendQueue: {
        running: false,
        scheduled: false,
        high: [],
        low: []
      }
    }

    this.sessions.set(sessionId, entry)
    return entry
  }

  private updateStatus(entry: SessionEntry, status: SessionStatus, reason?: string) {
    const previousStatus = entry.status
    const changed = entry.status !== status || entry.reason !== reason
    entry.status = status
    entry.updatedAt = Date.now()
    entry.reason = reason
    if (changed) {
      this.recordStatusChange(entry, previousStatus, status, reason)
    }
    if (changed && status !== 'connected') {
      this.flushSendQueue(entry, new Error(reason ? `session-not-connected:${reason}` : 'session-not-connected'))
    }
    if (changed && this.onStatusUpdate) {
      this.onStatusUpdate(this.snapshot(entry))
    }
  }

  private snapshot(entry: SessionEntry, overrideStatus?: SessionStatus): SessionStatusSnapshot {
    return {
      sessionId: entry.sessionId,
      status: overrideStatus ?? entry.status,
      updatedAt: entry.updatedAt,
      reason: entry.reason
    }
  }

  private beginStartAttempt(entry: SessionEntry) {
    const attemptId = crypto.randomUUID()
    const now = Date.now()
    entry.startAttempt = {
      attemptId,
      startedAt: now,
      timeoutAt: now + this.startTimeoutMs,
      cancelled: false
    }

    entry.startTimeoutTimer = setTimeout(() => {
      this.cancelStartAttempt(entry, 'timeout')
      this.handleStartFailure(entry, new Error('start-timeout'))
    }, this.startTimeoutMs)
  }

  private finishStartAttempt(entry: SessionEntry) {
    if (!entry.startAttempt || entry.startAttempt.cancelled) {
      return
    }

    if (entry.startTimeoutTimer) {
      clearTimeout(entry.startTimeoutTimer)
      entry.startTimeoutTimer = undefined
    }

    entry.startAttempt = undefined
    if (entry.startSlotRelease) {
      entry.startSlotRelease()
      entry.startSlotRelease = undefined
    }
  }

  private cancelStartAttempt(entry: SessionEntry, reason: string) {
    if (!entry.startAttempt || entry.startAttempt.cancelled) {
      return
    }

    entry.startAttempt.cancelled = true
    entry.startAttempt.cancelReason = reason
    if (entry.startTimeoutTimer) {
      clearTimeout(entry.startTimeoutTimer)
      entry.startTimeoutTimer = undefined
    }

    if (entry.startSlotRelease) {
      entry.startSlotRelease()
      entry.startSlotRelease = undefined
    }
  }

  private handleStartFailure(entry: SessionEntry, error: Error) {
    this.updateStatus(entry, 'error', error.message)
    this.finishStartAttempt(entry)
    this.recordFailure(entry)
    this.metrics?.increment('sessions.start.failure')
    this.metrics?.increment('errors.total')
    this.releaseLock(entry).catch((releaseError) => {
      this.logError('Failed to release lock after error', {
        sessionId: entry.sessionId,
        error: releaseError.message
      })
    })
  }

  private recordFailure(entry: SessionEntry) {
    const now = Date.now()
    if (entry.backoff.lastFailureAt && now - entry.backoff.lastFailureAt > this.backoffResetMs) {
      entry.backoff.failureCount = 0
    }

    entry.backoff.failureCount += 1
    entry.backoff.lastFailureAt = now
    entry.backoff.backoffUntil = now + computeBackoffMs(entry.backoff.failureCount, this.backoffBaseMs, this.backoffMaxMs)
    this.metrics?.increment('sessions.backoff')
  }

  private resetBackoff(entry: SessionEntry) {
    entry.backoff.failureCount = 0
    entry.backoff.lastFailureAt = undefined
    entry.backoff.backoffUntil = undefined
  }

  private isInBackoff(entry: SessionEntry) {
    if (!entry.backoff.backoffUntil) {
      return false
    }

    if (Date.now() < entry.backoff.backoffUntil) {
      this.updateStatus(entry, 'backoff')
      return true
    }

    entry.backoff.backoffUntil = undefined
    return false
  }

  private startLockHeartbeat(entry: SessionEntry) {
    if (!entry.lock) {
      return
    }

    if (entry.lockHeartbeat) {
      clearInterval(entry.lockHeartbeat)
    }

    entry.lockHeartbeat = setInterval(async () => {
      if (!entry.lock) {
        return
      }

      try {
        const ok = await entry.lock.renew()
        if (!ok) {
          this.logWarn('Lost session lock', { sessionId: entry.sessionId })
          this.metrics?.increment('sessions.lock_lost')
          await this.stopSession(entry.sessionId, 'lock-lost')
          this.recordFailure(entry)
        }
      } catch (error) {
        this.logError('Failed to renew lock', {
          sessionId: entry.sessionId,
          error: (error as Error).message
        })
        this.metrics?.increment('errors.total')
      }
    }, this.lockRenewMs)
  }

  private async releaseLock(entry: SessionEntry) {
    if (entry.lockHeartbeat) {
      clearInterval(entry.lockHeartbeat)
      entry.lockHeartbeat = undefined
    }

    if (entry.lock) {
      await entry.lock.release().catch((error) => {
        this.logError('Failed to release lock', { sessionId: entry.sessionId, error: error.message })
      })
      entry.lock = undefined
    }
  }

  private countActiveSessions() {
    let count = 0
    for (const entry of this.sessions.values()) {
      if (entry.status === 'connected' || entry.status === 'starting' || entry.status === 'waiting_qr') {
        count += 1
      }
    }
    return count
  }

  private logInfo(message: string, meta?: Record<string, unknown>) {
    if (this.logger.info) {
      this.logger.info(message, meta)
    }
  }

  private logWarn(message: string, meta?: Record<string, unknown>) {
    if (this.logger.warn) {
      this.logger.warn(message, meta)
    }
  }

  private logError(message: string, meta?: Record<string, unknown>) {
    if (this.logger.error) {
      this.logger.error(message, meta)
    }
  }

  private recordStatusChange(
    entry: SessionEntry,
    previousStatus: SessionStatus,
    nextStatus: SessionStatus,
    reason?: string
  ) {
    if (previousStatus === nextStatus) {
      return
    }

    this.metrics?.increment(`sessions.status.${nextStatus}`)

    if (nextStatus === 'connected') {
      if (entry.hasConnected) {
        this.metrics?.increment('sessions.reconnects')
      } else {
        this.metrics?.increment('sessions.first_connect')
        entry.hasConnected = true
      }
    }

    if (nextStatus === 'error') {
      this.metrics?.increment('errors.total')
      if (reason) {
        this.metrics?.increment(`sessions.error.${sanitizeMetricKey(reason)}`)
      }
    }
  }
}

function normalizeMediaInput(input: SessionSendMediaInput): SessionSendMediaInput {
  const anyInput = input as any
  if (anyInput && typeof anyInput === 'object' && anyInput.data !== undefined) {
    const raw = anyInput.data
    const buffer = Buffer.isBuffer(raw) ? raw : raw instanceof Uint8Array ? Buffer.from(raw) : null
    if (!buffer || buffer.byteLength <= 0) {
      throw new Error('data is required')
    }
    return {
      ...input,
      data: buffer
    } as any
  }

  const url = (anyInput?.url ?? '').trim()
  if (!url) {
    throw new Error('url is required')
  }

  return {
    ...input,
    url
  } as any
}

function normalizeContactInput(input: SessionSendContactInput): SessionSendContactInput {
  const anyInput = input as any
  const rows = Array.isArray(anyInput?.contacts) ? anyInput.contacts : []
  if (rows.length === 0) {
    throw new Error('contacts is required')
  }
  if (rows.length > 3) {
    throw new Error('contacts_limit_exceeded')
  }

  const unique = new Map<string, { name: string; whatsapp: string }>()
  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    const whatsapp = typeof row?.whatsapp === 'string' ? row.whatsapp.replace(/\D/g, '') : ''
    if (!name) {
      throw new Error('contact_name_required')
    }
    if (!whatsapp || whatsapp.length < 10 || whatsapp.length > 15) {
      throw new Error('invalid_whatsapp')
    }
    if (!unique.has(whatsapp)) {
      unique.set(whatsapp, { name, whatsapp })
    }
  }

  const contacts = Array.from(unique.values())
  if (contacts.length === 0) {
    throw new Error('contacts is required')
  }

  const displayNameRaw = typeof anyInput?.displayName === 'string' ? anyInput.displayName.trim() : ''
  const displayName = displayNameRaw || (contacts.length === 1 ? contacts[0].name : `${contacts.length} contatos`)

  return {
    contacts,
    ...(displayName ? { displayName } : {})
  }
}

function normalizeWhatsappLookupNumbers(phoneNumbers: string[]): string[] {
  if (!Array.isArray(phoneNumbers)) {
    return []
  }

  const unique = new Set<string>()
  for (const phoneNumber of phoneNumbers) {
    const digits = typeof phoneNumber === 'string' ? phoneNumber.replace(/\D/g, '') : ''
    if (digits.length < 7 || digits.length > 15) {
      continue
    }
    unique.add(digits)
  }

  return Array.from(unique.values())
}

function sanitizeMetricKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function hashSessionId(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}
