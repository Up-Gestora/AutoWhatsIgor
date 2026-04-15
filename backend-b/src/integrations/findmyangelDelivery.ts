import type { Pool } from 'pg'
import type { OutboundMessageService, OutboundMessageStatus, OutboundMessageStore } from '../messages'

export type FindmyangelWhatsappVariant = 'with9' | 'without9'
export type FindmyangelFailoverFlow = 'template-message' | 'user-created'
export type FindmyangelFailoverPhase = 'primary_check' | 'final_check'
export type FindmyangelFailoverStatus = 'pending' | 'processing' | 'completed' | 'failed'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type Metrics = {
  increment: (name: string, value?: number) => void
  setGauge?: (name: string, value: number) => void
}

type FindmyangelBrPreferenceStoreOptions = {
  pool: Pool
  tableName?: string
  memoryTtlDays?: number
}

type FindmyangelBrPreferenceRow = {
  session_id: string
  br_base_key: string
  preferred_variant: string
  reason: string | null
  last_delivered_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

export type UpsertFindmyangelBrPreferenceInput = {
  sessionId: string
  brBaseKey: string
  preferredVariant: FindmyangelWhatsappVariant
  reason?: string | null
  deliveredAtMs?: number | null
}

export class FindmyangelBrPreferenceStore {
  private readonly pool: Pool
  private readonly tableName: string
  private readonly memoryTtlMs: number

  constructor(options: FindmyangelBrPreferenceStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'findmyangel_br_preferences'
    const ttlDays = Number.isFinite(options.memoryTtlDays)
      ? Math.max(0, Math.floor(options.memoryTtlDays ?? 0))
      : 30
    this.memoryTtlMs = ttlDays <= 0 ? 0 : ttlDays * 24 * 60 * 60 * 1000
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT NOT NULL,
        br_base_key TEXT NOT NULL,
        preferred_variant TEXT NOT NULL,
        reason TEXT,
        last_delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, br_base_key)
      )`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_updated_idx`)}
       ON ${table} (updated_at DESC)`
    )
  }

  async getPreferredVariant(sessionId: string, brBaseKey: string): Promise<FindmyangelWhatsappVariant | null> {
    const safeSessionId = sessionId.trim()
    const safeBaseKey = normalizeDigits(brBaseKey)
    if (!safeSessionId || !safeBaseKey) {
      return null
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT *
       FROM ${table}
       WHERE session_id = $1
         AND br_base_key = $2
       LIMIT 1`,
      [safeSessionId, safeBaseKey]
    )

    if (result.rowCount === 0) {
      return null
    }

    const row = result.rows[0] as FindmyangelBrPreferenceRow
    const variant = normalizeVariant(row.preferred_variant)
    if (!variant) {
      return null
    }

    if (this.memoryTtlMs > 0) {
      const updatedAtMs = toTimestampMs(row.updated_at)
      if (updatedAtMs !== null && Date.now() - updatedAtMs > this.memoryTtlMs) {
        return null
      }
    }

    return variant
  }

  async upsertPreferredVariant(input: UpsertFindmyangelBrPreferenceInput): Promise<void> {
    const sessionId = input.sessionId.trim()
    const brBaseKey = normalizeDigits(input.brBaseKey)
    const variant = normalizeVariant(input.preferredVariant)
    if (!sessionId || !brBaseKey || !variant) {
      return
    }

    const reason = normalizeString(input.reason)
    const deliveredAtMs =
      typeof input.deliveredAtMs === 'number' && Number.isFinite(input.deliveredAtMs)
        ? Math.max(0, Math.floor(input.deliveredAtMs))
        : null
    const table = this.quoteIdentifier(this.tableName)

    await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        br_base_key,
        preferred_variant,
        reason,
        last_delivered_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        CASE WHEN $5::bigint IS NULL THEN NULL ELSE to_timestamp($5 / 1000.0) END
      )
      ON CONFLICT (session_id, br_base_key)
      DO UPDATE SET
        preferred_variant = EXCLUDED.preferred_variant,
        reason = EXCLUDED.reason,
        last_delivered_at = COALESCE(EXCLUDED.last_delivered_at, ${table}.last_delivered_at),
        updated_at = NOW()`,
      [sessionId, brBaseKey, variant, reason, deliveredAtMs]
    )
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }
}

type FindmyangelFailoverJobStoreOptions = {
  pool: Pool
  tableName?: string
}

type FindmyangelFailoverJobRow = {
  id: number
  request_id: string
  session_id: string
  flow: string
  user_id: string | null
  template_id: string | null
  br_base_key: string
  primary_variant: string
  alternate_variant: string
  primary_chat_id: string
  alternate_chat_id: string
  text: string
  primary_outbound_id: string | number
  failover_outbound_id: string | number | null
  phase: string
  status: string
  run_at: Date | string
  attempts: number
  last_error: string | null
  primary_status: string | null
  failover_status: string | null
  final_delivered_variant: string | null
  completion_reason: string | null
  created_at: Date | string
  updated_at: Date | string
}

export type FindmyangelFailoverJob = {
  id: number
  requestId: string
  sessionId: string
  flow: FindmyangelFailoverFlow
  userId: string | null
  templateId: string | null
  brBaseKey: string
  primaryVariant: FindmyangelWhatsappVariant
  alternateVariant: FindmyangelWhatsappVariant
  primaryChatId: string
  alternateChatId: string
  text: string
  primaryOutboundId: number
  failoverOutboundId: number | null
  phase: FindmyangelFailoverPhase
  status: FindmyangelFailoverStatus
  runAtMs: number
  attempts: number
  lastError: string | null
  primaryStatus: OutboundMessageStatus | null
  failoverStatus: OutboundMessageStatus | null
  finalDeliveredVariant: FindmyangelWhatsappVariant | null
  completionReason: string | null
  createdAtMs: number
  updatedAtMs: number
}

export type EnqueueFindmyangelFailoverJobInput = {
  requestId: string
  sessionId: string
  flow: FindmyangelFailoverFlow
  userId?: string | null
  templateId?: string | null
  brBaseKey: string
  primaryVariant: FindmyangelWhatsappVariant
  alternateVariant: FindmyangelWhatsappVariant
  primaryChatId: string
  alternateChatId: string
  text: string
  primaryOutboundId: number
  runAtMs: number
}

export type ReissueFindmyangelWelcomeWithFailoverInput = {
  job: Pick<
    FindmyangelFailoverJob,
    | 'requestId'
    | 'sessionId'
    | 'flow'
    | 'userId'
    | 'templateId'
    | 'brBaseKey'
    | 'primaryVariant'
    | 'alternateVariant'
    | 'primaryChatId'
    | 'alternateChatId'
    | 'text'
  >
  outboundService: Pick<OutboundMessageService, 'enqueueText'>
  failoverJobStore: Pick<FindmyangelFailoverJobStore, 'enqueue'>
  failoverDelayMs: number
  logger?: Logger
  now?: () => number
}

export type ReissueFindmyangelWelcomeWithFailoverResult = {
  requestId: string
  outboundId: number
  failoverScheduled: boolean
}

export class FindmyangelFailoverJobStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: FindmyangelFailoverJobStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'findmyangel_failover_jobs'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        flow TEXT NOT NULL,
        user_id TEXT,
        template_id TEXT,
        br_base_key TEXT NOT NULL,
        primary_variant TEXT NOT NULL,
        alternate_variant TEXT NOT NULL,
        primary_chat_id TEXT NOT NULL,
        alternate_chat_id TEXT NOT NULL,
        text TEXT NOT NULL,
        primary_outbound_id BIGINT NOT NULL,
        failover_outbound_id BIGINT,
        phase TEXT NOT NULL DEFAULT 'primary_check',
        status TEXT NOT NULL DEFAULT 'pending',
        run_at TIMESTAMPTZ NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        last_error TEXT,
        primary_status TEXT,
        failover_status TEXT,
        final_delivered_variant TEXT,
        completion_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_status_run_idx`)}
       ON ${table} (status, run_at ASC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_status_idx`)}
       ON ${table} (session_id, status, run_at ASC)`
    )
  }

  async enqueue(input: EnqueueFindmyangelFailoverJobInput): Promise<{ scheduled: boolean }> {
    const requestId = input.requestId.trim()
    const sessionId = input.sessionId.trim()
    const flow = normalizeFlow(input.flow)
    const userId = normalizeString(input.userId)
    const templateId = normalizeString(input.templateId)
    const brBaseKey = normalizeDigits(input.brBaseKey)
    const primaryVariant = normalizeVariant(input.primaryVariant)
    const alternateVariant = normalizeVariant(input.alternateVariant)
    const primaryChatId = input.primaryChatId.trim()
    const alternateChatId = input.alternateChatId.trim()
    const text = input.text.trim()
    const primaryOutboundId =
      typeof input.primaryOutboundId === 'number' && Number.isFinite(input.primaryOutboundId)
        ? Math.floor(input.primaryOutboundId)
        : NaN
    const runAtMs =
      typeof input.runAtMs === 'number' && Number.isFinite(input.runAtMs)
        ? Math.floor(input.runAtMs)
        : NaN

    if (
      !requestId ||
      !sessionId ||
      !flow ||
      !brBaseKey ||
      !primaryVariant ||
      !alternateVariant ||
      !primaryChatId ||
      !alternateChatId ||
      !text ||
      !Number.isFinite(primaryOutboundId) ||
      !Number.isFinite(runAtMs) ||
      primaryVariant === alternateVariant
    ) {
      return { scheduled: false }
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        request_id,
        session_id,
        flow,
        user_id,
        template_id,
        br_base_key,
        primary_variant,
        alternate_variant,
        primary_chat_id,
        alternate_chat_id,
        text,
        primary_outbound_id,
        run_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        to_timestamp($13 / 1000.0)
      )
      ON CONFLICT (request_id) DO NOTHING
      RETURNING id`,
      [
        requestId,
        sessionId,
        flow,
        userId,
        templateId,
        brBaseKey,
        primaryVariant,
        alternateVariant,
        primaryChatId,
        alternateChatId,
        text,
        primaryOutboundId,
        runAtMs
      ]
    )

    return { scheduled: (result.rowCount ?? 0) > 0 }
  }

  async getByRequestId(requestId: string): Promise<FindmyangelFailoverJob | null> {
    const normalized = requestId.trim()
    if (!normalized) {
      return null
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT *
       FROM ${table}
       WHERE request_id = $1
       LIMIT 1`,
      [normalized]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.mapRow(result.rows[0] as FindmyangelFailoverJobRow)
  }

  async claimDueJobs(options: {
    limit: number
    staleProcessingBeforeMs: number
  }): Promise<FindmyangelFailoverJob[]> {
    const limit = Math.max(1, Math.floor(options.limit))
    const staleProcessingBeforeMs = Math.max(0, Math.floor(options.staleProcessingBeforeMs))
    const table = this.quoteIdentifier(this.tableName)

    const result = await this.pool.query(
      `WITH due AS (
        SELECT id
        FROM ${table}
        WHERE (
          status = 'pending'
          AND run_at <= NOW()
        ) OR (
          status = 'processing'
          AND updated_at <= to_timestamp($2 / 1000.0)
        )
        ORDER BY run_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE ${table} AS job
      SET
        status = 'processing',
        attempts = job.attempts + 1,
        updated_at = NOW()
      FROM due
      WHERE job.id = due.id
      RETURNING job.*`,
      [limit, staleProcessingBeforeMs]
    )

    return result.rows
      .map((row) => this.mapRow(row as FindmyangelFailoverJobRow))
      .filter((row): row is FindmyangelFailoverJob => row !== null)
  }

  async scheduleFinalCheck(input: {
    jobId: number
    failoverOutboundId: number
    runAtMs: number
    primaryStatus: OutboundMessageStatus | null
    failoverStatus: OutboundMessageStatus | null
  }): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET
         failover_outbound_id = $2,
         phase = 'final_check',
         status = 'pending',
         run_at = to_timestamp($3 / 1000.0),
         primary_status = $4,
         failover_status = $5,
         completion_reason = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [
        input.jobId,
        input.failoverOutboundId,
        Math.max(0, Math.floor(input.runAtMs)),
        normalizeOutboundStatus(input.primaryStatus),
        normalizeOutboundStatus(input.failoverStatus)
      ]
    )
  }

  async markCompleted(input: {
    jobId: number
    primaryStatus: OutboundMessageStatus | null
    failoverStatus: OutboundMessageStatus | null
    finalDeliveredVariant: FindmyangelWhatsappVariant | null
    completionReason: string
  }): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET
         status = 'completed',
         primary_status = $2,
         failover_status = $3,
         final_delivered_variant = $4,
         completion_reason = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [
        input.jobId,
        normalizeOutboundStatus(input.primaryStatus),
        normalizeOutboundStatus(input.failoverStatus),
        normalizeVariant(input.finalDeliveredVariant),
        normalizeString(input.completionReason)
      ]
    )
  }

  async reschedule(input: { jobId: number; runAtMs: number; error: string }): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET
         status = 'pending',
         run_at = to_timestamp($2 / 1000.0),
         last_error = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [input.jobId, Math.max(0, Math.floor(input.runAtMs)), input.error.trim() || 'unknown_error']
    )
  }

  async markFailed(input: { jobId: number; error: string }): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET
         status = 'failed',
         last_error = $2,
         completion_reason = 'failed',
         updated_at = NOW()
       WHERE id = $1`,
      [input.jobId, input.error.trim() || 'unknown_error']
    )
  }

  private mapRow(row: FindmyangelFailoverJobRow): FindmyangelFailoverJob | null {
    const flow = normalizeFlow(row.flow)
    const primaryVariant = normalizeVariant(row.primary_variant)
    const alternateVariant = normalizeVariant(row.alternate_variant)
    const phase = normalizePhase(row.phase)
    const status = normalizeStatus(row.status)
    const runAtMs = toTimestampMs(row.run_at)
    const createdAtMs = toTimestampMs(row.created_at)
    const updatedAtMs = toTimestampMs(row.updated_at)
    const primaryOutboundId = toInt(row.primary_outbound_id)

    if (
      !flow ||
      !primaryVariant ||
      !alternateVariant ||
      !phase ||
      !status ||
      runAtMs === null ||
      createdAtMs === null ||
      updatedAtMs === null ||
      primaryOutboundId === null
    ) {
      return null
    }

    return {
      id: row.id,
      requestId: row.request_id,
      sessionId: row.session_id,
      flow,
      userId: normalizeString(row.user_id),
      templateId: normalizeString(row.template_id),
      brBaseKey: normalizeDigits(row.br_base_key),
      primaryVariant,
      alternateVariant,
      primaryChatId: row.primary_chat_id,
      alternateChatId: row.alternate_chat_id,
      text: row.text,
      primaryOutboundId,
      failoverOutboundId: toInt(row.failover_outbound_id),
      phase,
      status,
      runAtMs,
      attempts: Math.max(0, Number(row.attempts ?? 0)),
      lastError: normalizeString(row.last_error),
      primaryStatus: normalizeOutboundStatus(row.primary_status),
      failoverStatus: normalizeOutboundStatus(row.failover_status),
      finalDeliveredVariant: normalizeVariant(row.final_delivered_variant),
      completionReason: normalizeString(row.completion_reason),
      createdAtMs,
      updatedAtMs
    }
  }

  private quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }
}

type FindmyangelFailoverWorkerOptions = {
  enabled: boolean
  failoverDelayMs: number
  pollIntervalMs?: number
  maxJobsPerTick?: number
  staleProcessingMs?: number
  maxAttempts?: number
  retryDelayMs?: number
  jobStore: Pick<
    FindmyangelFailoverJobStore,
    'claimDueJobs' | 'scheduleFinalCheck' | 'markCompleted' | 'reschedule' | 'markFailed'
  >
  preferenceStore: Pick<FindmyangelBrPreferenceStore, 'upsertPreferredVariant'>
  outboundStore: Pick<OutboundMessageStore, 'getById'>
  outboundService: Pick<OutboundMessageService, 'enqueueText'>
  logger?: Logger
  metrics?: Metrics
}

export class FindmyangelFailoverWorker {
  private readonly enabled: boolean
  private readonly failoverDelayMs: number
  private readonly pollIntervalMs: number
  private readonly maxJobsPerTick: number
  private readonly staleProcessingMs: number
  private readonly maxAttempts: number
  private readonly retryDelayMs: number
  private readonly jobStore: FindmyangelFailoverWorkerOptions['jobStore']
  private readonly preferenceStore: FindmyangelFailoverWorkerOptions['preferenceStore']
  private readonly outboundStore: FindmyangelFailoverWorkerOptions['outboundStore']
  private readonly outboundService: FindmyangelFailoverWorkerOptions['outboundService']
  private readonly logger: Logger
  private readonly metrics?: Metrics

  private running = false
  private timer?: NodeJS.Timeout
  private lastTickAt: number | null = null

  constructor(options: FindmyangelFailoverWorkerOptions) {
    this.enabled = options.enabled
    this.failoverDelayMs = Math.max(1_000, Math.floor(options.failoverDelayMs))
    this.pollIntervalMs = Math.max(500, Math.floor(options.pollIntervalMs ?? 2_000))
    this.maxJobsPerTick = Math.max(1, Math.floor(options.maxJobsPerTick ?? 20))
    this.staleProcessingMs = Math.max(5_000, Math.floor(options.staleProcessingMs ?? 120_000))
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 5))
    this.retryDelayMs = Math.max(1_000, Math.floor(options.retryDelayMs ?? 10_000))
    this.jobStore = options.jobStore
    this.preferenceStore = options.preferenceStore
    this.outboundStore = options.outboundStore
    this.outboundService = options.outboundService
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
      enabled: this.enabled,
      lastTickAt: this.lastTickAt
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
    }, Math.max(0, delayMs))
  }

  private async tick() {
    if (!this.running) {
      return
    }

    try {
      this.lastTickAt = Date.now()
      if (!this.enabled) {
        this.scheduleTick(this.pollIntervalMs)
        return
      }

      const jobs = await this.jobStore.claimDueJobs({
        limit: this.maxJobsPerTick,
        staleProcessingBeforeMs: Date.now() - this.staleProcessingMs
      })
      this.metrics?.setGauge?.('findmyangel.failover.jobs_claimed', jobs.length)

      for (const job of jobs) {
        await this.processJob(job)
      }
    } catch (error) {
      this.logger.error?.('FindmyAngel failover worker tick failed', {
        error: (error as Error).message
      })
      this.metrics?.increment('errors.total')
    } finally {
      this.scheduleTick(this.pollIntervalMs)
    }
  }

  private async processJob(job: FindmyangelFailoverJob): Promise<void> {
    try {
      if (job.phase === 'primary_check') {
        await this.processPrimaryCheck(job)
      } else {
        await this.processFinalCheck(job)
      }
    } catch (error) {
      await this.handleJobError(job, error as Error)
    }
  }

  private async processPrimaryCheck(job: FindmyangelFailoverJob): Promise<void> {
    const primaryRecord = await this.outboundStore.getById(job.primaryOutboundId)
    if (!primaryRecord) {
      throw new Error('primary_outbound_not_found')
    }

    const primaryStatus = primaryRecord.status
    if (isDeliveredStatus(primaryStatus)) {
      await this.updatePreferenceSafe(job, job.primaryVariant, 'primary_delivered')
      await this.jobStore.markCompleted({
        jobId: job.id,
        primaryStatus,
        failoverStatus: job.failoverStatus,
        finalDeliveredVariant: job.primaryVariant,
        completionReason: 'primary_delivered'
      })
      this.metrics?.increment('findmyangel.failover.primary_delivered')
      return
    }

    const failoverIdempotencyKey = `${job.requestId}:failover:v1`
    const failoverRecord = await this.outboundService.enqueueText({
      sessionId: job.sessionId,
      chatId: job.alternateChatId,
      text: job.text,
      idempotencyKey: failoverIdempotencyKey,
      origin: 'automation_api'
    })

    await this.jobStore.scheduleFinalCheck({
      jobId: job.id,
      failoverOutboundId: failoverRecord.id,
      runAtMs: Date.now() + this.failoverDelayMs,
      primaryStatus,
      failoverStatus: failoverRecord.status
    })

    this.logger.info?.('FindmyAngel failover triggered', {
      jobId: job.id,
      requestId: job.requestId,
      sessionId: job.sessionId,
      primaryVariant: job.primaryVariant,
      alternateVariant: job.alternateVariant,
      primaryStatus,
      failoverOutboundId: failoverRecord.id
    })
    this.metrics?.increment('findmyangel.failover.triggered')
  }

  private async processFinalCheck(job: FindmyangelFailoverJob): Promise<void> {
    const primaryRecord = await this.outboundStore.getById(job.primaryOutboundId)
    const primaryStatus = primaryRecord?.status ?? null
    const failoverRecord =
      typeof job.failoverOutboundId === 'number' ? await this.outboundStore.getById(job.failoverOutboundId) : null
    const failoverStatus = failoverRecord?.status ?? null

    const deliveredVariant = resolveDeliveredVariant({
      primaryStatus,
      failoverStatus,
      primaryVariant: job.primaryVariant,
      alternateVariant: job.alternateVariant
    })

    if (deliveredVariant) {
      await this.updatePreferenceSafe(job, deliveredVariant, 'final_check_delivered')
    }

    await this.jobStore.markCompleted({
      jobId: job.id,
      primaryStatus,
      failoverStatus,
      finalDeliveredVariant: deliveredVariant,
      completionReason: deliveredVariant ? `final_${deliveredVariant}` : 'final_unknown'
    })

    this.logger.info?.('FindmyAngel failover final check completed', {
      jobId: job.id,
      requestId: job.requestId,
      sessionId: job.sessionId,
      deliveredVariant,
      primaryStatus,
      failoverStatus
    })
    this.metrics?.increment('findmyangel.failover.finalized')
    if (!deliveredVariant) {
      this.metrics?.increment('findmyangel.failover.final_unknown')
    }
  }

  private async updatePreferenceSafe(
    job: FindmyangelFailoverJob,
    preferredVariant: FindmyangelWhatsappVariant,
    reason: string
  ): Promise<void> {
    try {
      await this.preferenceStore.upsertPreferredVariant({
        sessionId: job.sessionId,
        brBaseKey: job.brBaseKey,
        preferredVariant,
        reason,
        deliveredAtMs: Date.now()
      })
    } catch (error) {
      this.logger.warn?.('FindmyAngel preference update failed', {
        jobId: job.id,
        requestId: job.requestId,
        sessionId: job.sessionId,
        preferredVariant,
        error: (error as Error).message
      })
      this.metrics?.increment('errors.total')
    }
  }

  private async handleJobError(job: FindmyangelFailoverJob, error: Error): Promise<void> {
    const message = error.message.trim() || 'unknown_error'
    if (job.attempts >= this.maxAttempts) {
      await this.jobStore.markFailed({
        jobId: job.id,
        error: message
      })
      this.logger.error?.('FindmyAngel failover job failed permanently', {
        jobId: job.id,
        requestId: job.requestId,
        attempts: job.attempts,
        error: message
      })
      this.metrics?.increment('findmyangel.failover.failed')
      this.metrics?.increment('errors.total')
      return
    }

    await this.jobStore.reschedule({
      jobId: job.id,
      runAtMs: Date.now() + this.retryDelayMs,
      error: message
    })
    this.logger.warn?.('FindmyAngel failover job rescheduled', {
      jobId: job.id,
      requestId: job.requestId,
      attempts: job.attempts,
      error: message
    })
    this.metrics?.increment('findmyangel.failover.rescheduled')
  }
}

function resolveDeliveredVariant(input: {
  primaryStatus: OutboundMessageStatus | null
  failoverStatus: OutboundMessageStatus | null
  primaryVariant: FindmyangelWhatsappVariant
  alternateVariant: FindmyangelWhatsappVariant
}): FindmyangelWhatsappVariant | null {
  const primaryDelivered = isDeliveredStatus(input.primaryStatus)
  const alternateDelivered = isDeliveredStatus(input.failoverStatus)

  if (primaryDelivered && !alternateDelivered) {
    return input.primaryVariant
  }
  if (!primaryDelivered && alternateDelivered) {
    return input.alternateVariant
  }
  if (primaryDelivered && alternateDelivered) {
    return input.primaryVariant
  }
  return null
}

export function buildFindmyangelRecoveryRequestId(requestId: string): string {
  const normalized = requestId.trim()
  if (!normalized) {
    throw new Error('request_id_required')
  }
  if (/:(?:recovery):v\d+$/i.test(normalized)) {
    return normalized
  }
  return `${normalized}:recovery:v1`
}

export async function reissueFindmyangelWelcomeWithFailover(
  input: ReissueFindmyangelWelcomeWithFailoverInput
): Promise<ReissueFindmyangelWelcomeWithFailoverResult> {
  const requestId = buildFindmyangelRecoveryRequestId(input.job.requestId)
  const failoverDelayMs = Math.max(1_000, Math.floor(input.failoverDelayMs))
  const nowMs = input.now?.() ?? Date.now()

  const primaryRecord = await input.outboundService.enqueueText({
    sessionId: input.job.sessionId,
    chatId: input.job.primaryChatId,
    text: input.job.text,
    idempotencyKey: requestId,
    origin: 'automation_api'
  })

  const failoverScheduledResult = await input.failoverJobStore.enqueue({
    requestId,
    sessionId: input.job.sessionId,
    flow: input.job.flow,
    userId: input.job.userId,
    templateId: input.job.templateId,
    brBaseKey: input.job.brBaseKey,
    primaryVariant: input.job.primaryVariant,
    alternateVariant: input.job.alternateVariant,
    primaryChatId: input.job.primaryChatId,
    alternateChatId: input.job.alternateChatId,
    text: input.job.text,
    primaryOutboundId: primaryRecord.id,
    runAtMs: nowMs + failoverDelayMs
  })

  input.logger?.info?.('FindmyAngel welcome recovery queued', {
    requestId,
    originalRequestId: input.job.requestId,
    sessionId: input.job.sessionId,
    primaryOutboundId: primaryRecord.id,
    failoverScheduled: failoverScheduledResult.scheduled
  })

  return {
    requestId,
    outboundId: primaryRecord.id,
    failoverScheduled: failoverScheduledResult.scheduled
  }
}

function isDeliveredStatus(status: OutboundMessageStatus | null | undefined): boolean {
  return status === 'delivered' || status === 'read'
}

function normalizeFlow(value: unknown): FindmyangelFailoverFlow | null {
  if (value === 'template-message') {
    return 'template-message'
  }
  if (value === 'user-created') {
    return 'user-created'
  }
  return null
}

function normalizePhase(value: unknown): FindmyangelFailoverPhase | null {
  if (value === 'primary_check') {
    return 'primary_check'
  }
  if (value === 'final_check') {
    return 'final_check'
  }
  return null
}

function normalizeStatus(value: unknown): FindmyangelFailoverStatus | null {
  if (value === 'pending') {
    return 'pending'
  }
  if (value === 'processing') {
    return 'processing'
  }
  if (value === 'completed') {
    return 'completed'
  }
  if (value === 'failed') {
    return 'failed'
  }
  return null
}

function normalizeVariant(value: unknown): FindmyangelWhatsappVariant | null {
  if (value === 'with9') {
    return 'with9'
  }
  if (value === 'without9') {
    return 'without9'
  }
  return null
}

function normalizeOutboundStatus(value: unknown): OutboundMessageStatus | null {
  if (
    value === 'queued' ||
    value === 'sending' ||
    value === 'sent' ||
    value === 'delivered' ||
    value === 'read' ||
    value === 'retrying' ||
    value === 'failed'
  ) {
    return value
  }
  return null
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeDigits(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.replace(/\D/g, '')
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed)
    }
  }
  return null
}

function toTimestampMs(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
