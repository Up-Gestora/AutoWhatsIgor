import type { Pool } from 'pg'
import type { AiResponseStore } from '../ai/responseStore'
import type { FindmyangelFailoverJob, FindmyangelFailoverJobStore } from '../integrations/findmyangelDelivery'
import {
  buildFindmyangelRecoveryRequestId,
  reissueFindmyangelWelcomeWithFailover
} from '../integrations/findmyangelDelivery'
import type { InboundMessageQueue, OutboundMessageQueue, OutboundMessageService, OutboundMessageStore } from '../messages'
import type { OutboundMessageRecord, OutboundMessageStatus } from '../messages'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type Queryable = Pick<Pool, 'query'>

type RecoveryTableNames = {
  inboundMessages: string
  outboundMessages: string
  aiResponses: string
  statusHistory: string
  broadcastJobs: string
}

export type RecoveryOutboundKind = 'ai_reply' | 'auto_followup' | 'findmyangel_welcome' | 'other'

export type RecoveryResultAction =
  | 'replayed'
  | 'reissued_welcome'
  | 'requeued_orphan_inbound'
  | 'skipped_newer_activity'
  | 'skipped_missing_context'
  | 'already_recovered'
  | 'no_orphan_inbound'

export type RecoveryChatActivity = {
  newerUserInbound: boolean
  newerPhoneHuman: boolean
  newerDashboardHuman: boolean
}

export type OrphanInboundCandidate = {
  inboundId: number
  chatId: string
  messageId: string | null
  messageTimestampMs: number
  aiStatus: string | null
  aiError: string | null
  outboundId: number | null
  outboundStatus: string | null
  newerActivity: RecoveryChatActivity
}

export type FailedOutboundCandidate = {
  outboundId: number
  chatId: string
  requestId: string | null
  createdAtMs: number
  status: OutboundMessageStatus
  error: string | null
  origin: string | null
  kind: RecoveryOutboundKind
  welcomeBaseRequestId: string | null
  newerActivity: RecoveryChatActivity
}

export type WelcomeRecoveryGroup = {
  baseRequestId: string
  recoveryRequestId: string
  rows: FailedOutboundCandidate[]
  job: FindmyangelFailoverJob | null
  existingRecovery: OutboundMessageRecord | null
  newerActivity: RecoveryChatActivity
}

export type DisconnectedSessionRecoverySummary = {
  sessionStatus: string | null
  activeBroadcastJobs: number
  orphanInboundCount: number
  replayableOrphanInboundCount: number
  failedOutboundRows: number
  aiReplyRows: number
  autoFollowUpRows: number
  findmyangelWelcomeRows: number
  findmyangelWelcomeGroups: number
  replayableOutboundRows: number
  replayableWelcomeGroups: number
}

export type DisconnectedSessionRecoveryScan = {
  sessionId: string
  fromMs: number
  toMs: number
  summary: DisconnectedSessionRecoverySummary
  orphanInbounds: OrphanInboundCandidate[]
  failedOutbounds: FailedOutboundCandidate[]
  welcomeRecoveries: WelcomeRecoveryGroup[]
}

export type RecoveryResultItem = {
  kind: 'orphan_inbound' | RecoveryOutboundKind
  action: RecoveryResultAction
  chatId?: string
  outboundId?: number
  inboundId?: number
  requestId?: string | null
  recoveryRequestId?: string | null
  reason?: string | null
}

export type DisconnectedSessionRecoveryApplyResult = {
  scan: DisconnectedSessionRecoveryScan
  results: RecoveryResultItem[]
}

type DisconnectedSessionRecoveryServiceOptions = {
  pool: Queryable
  tables: RecoveryTableNames
  inboundQueue: Pick<InboundMessageQueue, 'enqueue'>
  outboundQueue: Pick<OutboundMessageQueue, 'enqueue'>
  outboundStore: Pick<
    OutboundMessageStore,
    'listDisconnectedRecoveryCandidates' | 'getById' | 'findByRequestId' | 'resetForReplay'
  >
  aiResponseStore: Pick<AiResponseStore, 'resetForReplay'>
  failoverJobStore?: Pick<FindmyangelFailoverJobStore, 'getByRequestId' | 'enqueue'>
  outboundService?: Pick<OutboundMessageService, 'enqueueText'>
  failoverDelayMs?: number
  minDelayMs?: number
  maxDelayMs?: number
  now?: () => number
  delay?: (delayMs: number) => Promise<void>
  currentSessionStatusLookup?: (sessionId: string) => Promise<string | null>
  logger?: Logger
}

type RawOrphanInboundRow = {
  inbound_id: number | string
  chat_id: string
  message_id: string | null
  message_ts_ms: number | string
  ai_status: string | null
  ai_error: string | null
  outbound_id: number | string | null
  outbound_status: string | null
}

export class DisconnectedSessionRecoveryService {
  private readonly pool: Queryable
  private readonly tables: RecoveryTableNames
  private readonly inboundQueue: Pick<InboundMessageQueue, 'enqueue'>
  private readonly outboundQueue: Pick<OutboundMessageQueue, 'enqueue'>
  private readonly outboundStore: DisconnectedSessionRecoveryServiceOptions['outboundStore']
  private readonly aiResponseStore: Pick<AiResponseStore, 'resetForReplay'>
  private readonly failoverJobStore?: Pick<FindmyangelFailoverJobStore, 'getByRequestId' | 'enqueue'>
  private readonly outboundService?: Pick<OutboundMessageService, 'enqueueText'>
  private readonly failoverDelayMs: number
  private readonly minDelayMs: number
  private readonly maxDelayMs: number
  private readonly now: () => number
  private readonly delay: (delayMs: number) => Promise<void>
  private readonly currentSessionStatusLookup?: (sessionId: string) => Promise<string | null>
  private readonly logger: Logger

  constructor(options: DisconnectedSessionRecoveryServiceOptions) {
    this.pool = options.pool
    this.tables = options.tables
    this.inboundQueue = options.inboundQueue
    this.outboundQueue = options.outboundQueue
    this.outboundStore = options.outboundStore
    this.aiResponseStore = options.aiResponseStore
    this.failoverJobStore = options.failoverJobStore
    this.outboundService = options.outboundService
    this.failoverDelayMs = Math.max(1_000, Math.floor(options.failoverDelayMs ?? 60_000))
    this.minDelayMs = Math.max(0, Math.floor(options.minDelayMs ?? 1_000))
    this.maxDelayMs = Math.max(this.minDelayMs, Math.floor(options.maxDelayMs ?? 3_000))
    this.now = options.now ?? (() => Date.now())
    this.delay = options.delay ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)))
    this.currentSessionStatusLookup = options.currentSessionStatusLookup
    this.logger = options.logger ?? {}
  }

  async scan(input: {
    sessionId: string
    fromMs: number
    toMs: number
    errors?: string[]
  }): Promise<DisconnectedSessionRecoveryScan> {
    const sessionId = input.sessionId.trim()
    const fromMs = Math.max(0, Math.floor(input.fromMs))
    const toMs = Math.max(fromMs, Math.floor(input.toMs))
    const errors = normalizeRecoveryErrors(input.errors)
    const [sessionStatus, activeBroadcastJobs, orphanRows, failedRows] = await Promise.all([
      this.getLatestSessionStatus(sessionId),
      this.countActiveBroadcastJobs(sessionId),
      this.listOrphanInboundCandidates(sessionId, fromMs, toMs),
      this.outboundStore.listDisconnectedRecoveryCandidates({
        sessionId,
        fromMs,
        toMs,
        errors
      })
    ])

    const orphanInbounds: OrphanInboundCandidate[] = []
    for (const row of orphanRows) {
      const messageTimestampMs = toNumber(row.message_ts_ms)
      const newerActivity = await this.getNewerChatActivity(sessionId, row.chat_id, messageTimestampMs)
      orphanInbounds.push({
        inboundId: toNumber(row.inbound_id),
        chatId: row.chat_id,
        messageId: row.message_id ?? null,
        messageTimestampMs,
        aiStatus: row.ai_status ?? null,
        aiError: row.ai_error ?? null,
        outboundId: row.outbound_id === null ? null : toNumber(row.outbound_id),
        outboundStatus: row.outbound_status ?? null,
        newerActivity
      })
    }

    const failedOutbounds: FailedOutboundCandidate[] = []
    for (const record of failedRows) {
      const newerActivity = await this.getNewerChatActivity(record.sessionId, record.chatId, record.createdAtMs)
      const requestId = normalizeString(record.requestId)
      failedOutbounds.push({
        outboundId: record.id,
        chatId: record.chatId,
        requestId,
        createdAtMs: record.createdAtMs,
        status: record.status,
        error: normalizeString(record.error),
        origin: resolveOutboundOrigin(record),
        kind: classifyRecoveryOutboundKind(requestId),
        welcomeBaseRequestId: extractFindmyangelWelcomeBaseRequestId(requestId),
        newerActivity
      })
    }

    const welcomeRecoveries = await this.buildWelcomeRecoveryGroups(sessionId, failedOutbounds)
    const summary: DisconnectedSessionRecoverySummary = {
      sessionStatus,
      activeBroadcastJobs,
      orphanInboundCount: orphanInbounds.length,
      replayableOrphanInboundCount: orphanInbounds.filter((entry) => !hasNewerChatActivity(entry.newerActivity)).length,
      failedOutboundRows: failedOutbounds.length,
      aiReplyRows: failedOutbounds.filter((entry) => entry.kind === 'ai_reply').length,
      autoFollowUpRows: failedOutbounds.filter((entry) => entry.kind === 'auto_followup').length,
      findmyangelWelcomeRows: failedOutbounds.filter((entry) => entry.kind === 'findmyangel_welcome').length,
      findmyangelWelcomeGroups: welcomeRecoveries.length,
      replayableOutboundRows: failedOutbounds.filter(
        (entry) => entry.kind !== 'findmyangel_welcome' && !hasNewerChatActivity(entry.newerActivity)
      ).length,
      replayableWelcomeGroups: welcomeRecoveries.filter((entry) => this.isWelcomeGroupActionable(entry)).length
    }

    return {
      sessionId,
      fromMs,
      toMs,
      summary,
      orphanInbounds,
      failedOutbounds,
      welcomeRecoveries
    }
  }

  async apply(input: {
    sessionId: string
    fromMs: number
    toMs: number
    errors?: string[]
  }): Promise<DisconnectedSessionRecoveryApplyResult> {
    const scan = await this.scan(input)
    const currentSessionStatus =
      scan.summary.sessionStatus !== 'connected' && this.currentSessionStatusLookup
        ? await this.currentSessionStatusLookup(scan.sessionId)
        : scan.summary.sessionStatus

    if (currentSessionStatus !== 'connected') {
      throw new Error(`session_not_connected:${currentSessionStatus ?? scan.summary.sessionStatus ?? 'unknown'}`)
    }
    if (scan.summary.activeBroadcastJobs > 0) {
      throw new Error(`active_broadcast_jobs:${scan.summary.activeBroadcastJobs}`)
    }

    const results: RecoveryResultItem[] = []
    const replayableOutbounds = scan.failedOutbounds
      .filter((entry) => entry.kind !== 'findmyangel_welcome')
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.outboundId - b.outboundId)
    const replayableWelcomes = scan.welcomeRecoveries.sort(
      (a, b) => a.rows[0]!.createdAtMs - b.rows[0]!.createdAtMs || a.baseRequestId.localeCompare(b.baseRequestId)
    )
    const orphanInbounds = scan.orphanInbounds.sort(
      (a, b) => a.messageTimestampMs - b.messageTimestampMs || a.inboundId - b.inboundId
    )

    const dispatchableCount =
      replayableOutbounds.filter((entry) => !hasNewerChatActivity(entry.newerActivity)).length +
      replayableWelcomes.filter((entry) => this.isWelcomeGroupActionable(entry)).length +
      orphanInbounds.filter((entry) => !hasNewerChatActivity(entry.newerActivity)).length
    let dispatched = 0

    for (const candidate of replayableOutbounds) {
      if (hasNewerChatActivity(candidate.newerActivity)) {
        results.push({
          kind: candidate.kind,
          action: 'skipped_newer_activity',
          chatId: candidate.chatId,
          outboundId: candidate.outboundId,
          requestId: candidate.requestId,
          reason: 'chat_activity_after_failure'
        })
        continue
      }

      const current = await this.outboundStore.getById(candidate.outboundId)
      if (!current || current.messageId || current.status !== 'failed') {
        results.push({
          kind: candidate.kind,
          action: 'skipped_missing_context',
          chatId: candidate.chatId,
          outboundId: candidate.outboundId,
          requestId: candidate.requestId,
          reason: !current ? 'outbound_not_found' : 'outbound_no_longer_failed'
        })
        continue
      }

      const reset = await this.outboundStore.resetForReplay(candidate.outboundId)
      if (!reset) {
        results.push({
          kind: candidate.kind,
          action: 'skipped_missing_context',
          chatId: candidate.chatId,
          outboundId: candidate.outboundId,
          requestId: candidate.requestId,
          reason: 'outbound_reset_failed'
        })
        continue
      }

      const enqueuedAtMs = this.now()
      await this.outboundQueue.enqueue({
        outboundId: reset.id,
        sessionId: reset.sessionId,
        chatId: reset.chatId,
        enqueuedAtMs
      })

      results.push({
        kind: candidate.kind,
        action: 'replayed',
        chatId: candidate.chatId,
        outboundId: candidate.outboundId,
        requestId: candidate.requestId
      })
      dispatched += 1
      await this.delayIfNeeded(dispatched, dispatchableCount)
    }

    for (const group of replayableWelcomes) {
      if (hasNewerChatActivity(group.newerActivity)) {
        results.push({
          kind: 'findmyangel_welcome',
          action: 'skipped_newer_activity',
          chatId: group.rows[0]?.chatId,
          requestId: group.baseRequestId,
          recoveryRequestId: group.recoveryRequestId,
          reason: 'chat_activity_after_failure'
        })
        continue
      }
      if (group.existingRecovery) {
        results.push({
          kind: 'findmyangel_welcome',
          action: 'already_recovered',
          chatId: group.rows[0]?.chatId,
          requestId: group.baseRequestId,
          recoveryRequestId: group.recoveryRequestId,
          outboundId: group.existingRecovery.id
        })
        continue
      }
      if (!group.job || !this.failoverJobStore || !this.outboundService) {
        results.push({
          kind: 'findmyangel_welcome',
          action: 'skipped_missing_context',
          chatId: group.rows[0]?.chatId,
          requestId: group.baseRequestId,
          recoveryRequestId: group.recoveryRequestId,
          reason: group.job ? 'recovery_dependencies_missing' : 'failover_job_missing'
        })
        continue
      }

      const recovery = await reissueFindmyangelWelcomeWithFailover({
        job: group.job,
        outboundService: this.outboundService,
        failoverJobStore: this.failoverJobStore,
        failoverDelayMs: this.failoverDelayMs,
        logger: this.logger,
        now: this.now
      })

      results.push({
        kind: 'findmyangel_welcome',
        action: 'reissued_welcome',
        chatId: group.job.primaryChatId,
        outboundId: recovery.outboundId,
        requestId: group.baseRequestId,
        recoveryRequestId: recovery.requestId,
        reason: recovery.failoverScheduled ? 'failover_recreated' : null
      })
      dispatched += 1
      await this.delayIfNeeded(dispatched, dispatchableCount)
    }

    if (orphanInbounds.length === 0) {
      results.push({
        kind: 'orphan_inbound',
        action: 'no_orphan_inbound'
      })
    }

    for (const orphan of orphanInbounds) {
      if (hasNewerChatActivity(orphan.newerActivity)) {
        results.push({
          kind: 'orphan_inbound',
          action: 'skipped_newer_activity',
          chatId: orphan.chatId,
          inboundId: orphan.inboundId,
          reason: 'chat_activity_after_inbound'
        })
        continue
      }

      await this.aiResponseStore.resetForReplay(orphan.inboundId)
      await this.inboundQueue.enqueue({
        sessionId: scan.sessionId,
        chatId: orphan.chatId,
        inboundId: orphan.inboundId,
        messageId: orphan.messageId,
        enqueuedAtMs: this.now()
      })

      results.push({
        kind: 'orphan_inbound',
        action: 'requeued_orphan_inbound',
        chatId: orphan.chatId,
        inboundId: orphan.inboundId
      })
      dispatched += 1
      await this.delayIfNeeded(dispatched, dispatchableCount)
    }

    return {
      scan,
      results
    }
  }

  private async buildWelcomeRecoveryGroups(
    sessionId: string,
    failedOutbounds: FailedOutboundCandidate[]
  ): Promise<WelcomeRecoveryGroup[]> {
    const byBaseRequestId = new Map<string, FailedOutboundCandidate[]>()
    for (const entry of failedOutbounds) {
      if (entry.kind !== 'findmyangel_welcome' || !entry.welcomeBaseRequestId) {
        continue
      }
      const group = byBaseRequestId.get(entry.welcomeBaseRequestId) ?? []
      group.push(entry)
      byBaseRequestId.set(entry.welcomeBaseRequestId, group)
    }

    const groups: WelcomeRecoveryGroup[] = []
    for (const [baseRequestId, rows] of byBaseRequestId.entries()) {
      const recoveryRequestId = buildFindmyangelRecoveryRequestId(baseRequestId)
      const [job, existingRecovery] = await Promise.all([
        this.failoverJobStore?.getByRequestId(baseRequestId) ?? Promise.resolve(null),
        this.outboundStore.findByRequestId(sessionId, recoveryRequestId)
      ])

      groups.push({
        baseRequestId,
        recoveryRequestId,
        rows: rows.sort((a, b) => a.createdAtMs - b.createdAtMs || a.outboundId - b.outboundId),
        job,
        existingRecovery,
        newerActivity: mergeChatActivities(rows.map((entry) => entry.newerActivity))
      })
    }

    return groups.sort(
      (a, b) => a.rows[0]!.createdAtMs - b.rows[0]!.createdAtMs || a.baseRequestId.localeCompare(b.baseRequestId)
    )
  }

  private isWelcomeGroupActionable(group: WelcomeRecoveryGroup): boolean {
    return !hasNewerChatActivity(group.newerActivity) && !group.existingRecovery && Boolean(group.job)
  }

  private async delayIfNeeded(dispatched: number, dispatchableCount: number): Promise<void> {
    if (dispatched >= dispatchableCount) {
      return
    }
    const delayMs = randomIntBetween(this.minDelayMs, this.maxDelayMs)
    await this.delay(delayMs)
  }

  private async getLatestSessionStatus(sessionId: string): Promise<string | null> {
    const table = quoteIdentifier(this.tables.statusHistory)
    const result = await this.pool.query(
      `SELECT status
       FROM ${table}
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [sessionId]
    )
    if ((result.rowCount ?? 0) === 0) {
      return null
    }
    return normalizeString((result.rows[0] as { status?: string | null }).status)
  }

  private async countActiveBroadcastJobs(sessionId: string): Promise<number> {
    const table = quoteIdentifier(this.tables.broadcastJobs)
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM ${table}
       WHERE session_id = $1
         AND status IN ('running', 'paused')`,
      [sessionId]
    )
    return toNumber((result.rows[0] as { count?: number | string }).count ?? 0)
  }

  private async listOrphanInboundCandidates(
    sessionId: string,
    fromMs: number,
    toMs: number
  ): Promise<RawOrphanInboundRow[]> {
    const inboundTable = quoteIdentifier(this.tables.inboundMessages)
    const aiResponsesTable = quoteIdentifier(this.tables.aiResponses)
    const outboundTable = quoteIdentifier(this.tables.outboundMessages)
    const result = await this.pool.query(
      `SELECT
         im.id AS inbound_id,
         im.chat_id,
         im.message_id,
         EXTRACT(EPOCH FROM im.message_ts) * 1000 AS message_ts_ms,
         ar.status AS ai_status,
         ar.error AS ai_error,
         ar.outbound_id,
         om.status AS outbound_status
       FROM ${inboundTable} im
       LEFT JOIN ${aiResponsesTable} ar
         ON ar.inbound_id = im.id
       LEFT JOIN ${outboundTable} om
         ON om.id = ar.outbound_id
       WHERE im.session_id = $1
         AND im.from_me = FALSE
         AND im.message_ts >= to_timestamp($2 / 1000.0)
         AND im.message_ts <= to_timestamp($3 / 1000.0)
         AND (
           ar.inbound_id IS NULL
           OR ar.status IN ('processing', 'failed')
         )
       ORDER BY im.message_ts ASC, im.id ASC`,
      [sessionId, fromMs, toMs]
    )

    return result.rows as RawOrphanInboundRow[]
  }

  private async getNewerChatActivity(
    sessionId: string,
    chatId: string,
    afterMs: number
  ): Promise<RecoveryChatActivity> {
    const inboundTable = quoteIdentifier(this.tables.inboundMessages)
    const outboundTable = quoteIdentifier(this.tables.outboundMessages)
    const result = await this.pool.query(
      `SELECT
         EXISTS(
           SELECT 1
           FROM ${inboundTable}
           WHERE session_id = $1
             AND chat_id = $2
             AND from_me = FALSE
             AND message_ts > to_timestamp($3 / 1000.0)
         ) AS newer_user_inbound,
         EXISTS(
           SELECT 1
           FROM ${inboundTable}
           WHERE session_id = $1
             AND chat_id = $2
             AND from_me = TRUE
             AND message_ts > to_timestamp($3 / 1000.0)
         ) AS newer_phone_human,
         EXISTS(
           SELECT 1
           FROM ${outboundTable}
           WHERE session_id = $1
             AND chat_id = $2
             AND created_at > to_timestamp($3 / 1000.0)
             AND payload->>'origin' = 'human_dashboard'
         ) AS newer_dashboard_human`,
      [sessionId, chatId, afterMs]
    )

    const row = (result.rows[0] ?? {}) as Record<string, unknown>
    return {
      newerUserInbound: row.newer_user_inbound === true,
      newerPhoneHuman: row.newer_phone_human === true,
      newerDashboardHuman: row.newer_dashboard_human === true
    }
  }
}

export function classifyRecoveryOutboundKind(requestId: string | null | undefined): RecoveryOutboundKind {
  const normalized = normalizeString(requestId)
  if (!normalized) {
    return 'other'
  }
  if (normalized.startsWith('ai:')) {
    return 'ai_reply'
  }
  if (normalized.startsWith('auto_followup:')) {
    return 'auto_followup'
  }
  if (extractFindmyangelWelcomeBaseRequestId(normalized)) {
    return 'findmyangel_welcome'
  }
  return 'other'
}

export function extractFindmyangelWelcomeBaseRequestId(requestId: string | null | undefined): string | null {
  const normalized = normalizeString(requestId)
  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(findmyangel:user:[^:]+:welcome-v1)(?::recovery:v\d+)?(?::failover:v1)?$/i)
  return match?.[1] ?? null
}

export function hasNewerChatActivity(activity: RecoveryChatActivity): boolean {
  return activity.newerUserInbound || activity.newerPhoneHuman || activity.newerDashboardHuman
}

export function mergeChatActivities(activities: RecoveryChatActivity[]): RecoveryChatActivity {
  return activities.reduce<RecoveryChatActivity>(
    (acc, activity) => ({
      newerUserInbound: acc.newerUserInbound || activity.newerUserInbound,
      newerPhoneHuman: acc.newerPhoneHuman || activity.newerPhoneHuman,
      newerDashboardHuman: acc.newerDashboardHuman || activity.newerDashboardHuman
    }),
    {
      newerUserInbound: false,
      newerPhoneHuman: false,
      newerDashboardHuman: false
    }
  )
}

function resolveOutboundOrigin(record: OutboundMessageRecord): string | null {
  const payload = record.payload as Record<string, unknown>
  return normalizeString(payload.origin)
}

function normalizeRecoveryErrors(errors: string[] | null | undefined): string[] {
  if (!Array.isArray(errors) || errors.length === 0) {
    return ['session-not-connected', 'session-not-ready']
  }

  const normalized = errors
    .map((value) => normalizeString(value))
    .filter((value): value is string => Boolean(value))

  return normalized.length > 0 ? [...new Set(normalized)] : ['session-not-connected', 'session-not-ready']
}

function randomIntBetween(min: number, max: number): number {
  if (max <= min) {
    return min
  }
  const delta = max - min
  return min + Math.floor(Math.random() * (delta + 1))
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed)
    }
  }
  return 0
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
