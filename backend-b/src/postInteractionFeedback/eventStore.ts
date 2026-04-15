import type { Pool } from 'pg'
import type {
  PostInteractionFeedbackDetailsByCompany,
  PostInteractionFeedbackDetailsByDay,
  PostInteractionFeedbackDetailsByScore,
  PostInteractionFeedbackDetailsFilters,
  PostInteractionFeedbackDetailsPageInfo,
  PostInteractionFeedbackDetailsRow,
  PostInteractionFeedbackDetailsStats,
  PostInteractionFeedbackEventInput,
  PostInteractionFeedbackQualifiedEventContext,
  PostInteractionFeedbackSummary,
  PostInteractionFeedbackSummaryDiagnostics
} from './types'

type PostInteractionFeedbackEventStoreOptions = {
  pool: Pool
  tableName?: string
}

export class PostInteractionFeedbackEventStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: PostInteractionFeedbackEventStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'post_interaction_feedback_events'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        sender_session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        phone TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        source_company_name TEXT NOT NULL,
        source_system TEXT NOT NULL DEFAULT 'autowhats',
        qualification_key TEXT,
        event_name TEXT NOT NULL,
        score INTEGER,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL
      )`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS source_system TEXT NOT NULL DEFAULT 'autowhats'`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS qualification_key TEXT`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_sender_phone_idx`)}
       ON ${table} (sender_session_id, phone, occurred_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_sender_event_idx`)}
       ON ${table} (sender_session_id, event_name, occurred_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_qualification_idx`)}
       ON ${table} (qualification_key)
       WHERE qualification_key IS NOT NULL`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_dedupe_idx`)}
       ON ${table} (
         sender_session_id,
         event_name,
         qualification_key,
         COALESCE(payload->>'reminder', '')
       )
       WHERE qualification_key IS NOT NULL`
    )
  }

  async record(input: PostInteractionFeedbackEventInput): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (
        sender_session_id,
        chat_id,
        phone,
        source_session_id,
        source_company_name,
        source_system,
        qualification_key,
        event_name,
        score,
        payload,
        occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11 / 1000.0))
      ON CONFLICT DO NOTHING`,
      [
        input.senderSessionId,
        input.chatId,
        input.phone,
        input.sourceSessionId,
        input.sourceCompanyName,
        input.sourceSystem,
        input.qualificationKey ?? null,
        input.eventName,
        input.score ?? null,
        input.payload ?? {},
        input.occurredAtMs
      ]
    )
  }

  async getLatestEventAt(senderSessionId: string, phone: string): Promise<number | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT EXTRACT(EPOCH FROM MAX(occurred_at)) * 1000 AS latest_at_ms
       FROM ${table}
       WHERE sender_session_id = $1
         AND phone = $2`,
      [senderSessionId, phone]
    )
    const value = Number(result.rows[0]?.latest_at_ms)
    return Number.isFinite(value) ? value : null
  }

  async getSummary(senderSessionId: string, fromMs: number, toMs: number): Promise<PostInteractionFeedbackSummary> {
    const details = await this.getSummaryDetails(senderSessionId, fromMs, toMs)
    return details.summary
  }

  async getSummaryDetails(
    senderSessionId: string,
    fromMs: number,
    toMs: number
  ): Promise<Pick<PostInteractionFeedbackSummaryDiagnostics, 'lastScoreAtMs' | 'rawScoreEvents'> & { summary: PostInteractionFeedbackSummary }> {
    const table = this.quoteIdentifier(this.tableName)
    const safeFromMs = Math.max(0, Math.floor(fromMs))
    const safeToMs = Math.max(safeFromMs, Math.floor(toMs))
    const result = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_name = 'qualified')::int AS qualified,
         COUNT(*) FILTER (WHERE event_name = 'initial_message_sent')::int AS approaches_sent,
         COUNT(*) FILTER (WHERE event_name = 'score_received')::int AS feedbacks_received,
         COALESCE(AVG(score) FILTER (WHERE event_name = 'score_received'), 0)::float8 AS average_score,
         COUNT(*) FILTER (WHERE event_name = 'score_received')::int AS raw_score_events,
         EXTRACT(EPOCH FROM MAX(occurred_at) FILTER (WHERE event_name = 'score_received')) * 1000 AS last_score_at_ms,
         COUNT(*) FILTER (WHERE event_name = 'offer_sent')::int AS offers_sent,
         COUNT(*) FILTER (WHERE event_name = 'closed_no_score')::int AS timeouts_no_score,
         COUNT(*) FILTER (WHERE event_name = 'opted_out')::int AS opt_outs
       FROM ${table}
       WHERE sender_session_id = $1
         AND occurred_at >= to_timestamp($2 / 1000.0)
         AND occurred_at <= to_timestamp($3 / 1000.0)`,
      [senderSessionId, safeFromMs, safeToMs]
    )

    const row = result.rows[0] ?? {}
    return {
      summary: {
        qualified: Number(row.qualified ?? 0),
        approachesSent: Number(row.approaches_sent ?? 0),
        feedbacksReceived: Number(row.feedbacks_received ?? 0),
        averageScore: Number(row.average_score ?? 0),
        offersSent: Number(row.offers_sent ?? 0),
        timeoutsNoScore: Number(row.timeouts_no_score ?? 0),
        optOuts: Number(row.opt_outs ?? 0)
      },
      rawScoreEvents: Number(row.raw_score_events ?? 0),
      lastScoreAtMs: Number.isFinite(Number(row.last_score_at_ms)) ? Number(row.last_score_at_ms) : null
    }
  }

  async getFeedbackDetails(
    senderSessionId: string,
    filters: PostInteractionFeedbackDetailsFilters
  ): Promise<{
    rows: PostInteractionFeedbackDetailsRow[]
    stats: PostInteractionFeedbackDetailsStats
    pageInfo: PostInteractionFeedbackDetailsPageInfo
  }> {
    const normalizedFilters = normalizeFeedbackDetailsFilters(filters)
    const rowsResult = await this.listFeedbackRows(senderSessionId, normalizedFilters)
    const stats = await this.getFeedbackStats(senderSessionId, normalizedFilters)

    return {
      rows: rowsResult.rows,
      stats,
      pageInfo: {
        limit: normalizedFilters.limit,
        nextCursor: rowsResult.nextCursor,
        hasMore: rowsResult.hasMore
      }
    }
  }

  async listEventStateByQualificationKeys(
    senderSessionId: string,
    qualificationKeys: string[]
  ): Promise<Map<string, { hasScoreEvent: boolean; hasCommentEvent: boolean }>> {
    const uniqueKeys = Array.from(
      new Set(
        qualificationKeys
          .map((key) => (typeof key === 'string' ? key.trim() : ''))
          .filter((key) => key.length > 0)
      )
    )
    if (uniqueKeys.length === 0) {
      return new Map()
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT qualification_key,
              BOOL_OR(event_name = 'score_received') AS has_score_event,
              BOOL_OR(event_name = 'comment_received') AS has_comment_event
       FROM ${table}
       WHERE sender_session_id = $1
         AND qualification_key = ANY($2::text[])
       GROUP BY qualification_key`,
      [senderSessionId, uniqueKeys]
    )

    const map = new Map<string, { hasScoreEvent: boolean; hasCommentEvent: boolean }>()
    for (const row of result.rows) {
      const qualificationKey = typeof row.qualification_key === 'string' ? row.qualification_key.trim() : ''
      if (!qualificationKey) {
        continue
      }
      map.set(qualificationKey, {
        hasScoreEvent: Boolean(row.has_score_event),
        hasCommentEvent: Boolean(row.has_comment_event)
      })
    }
    return map
  }

  async listQualifiedEventContexts(
    senderSessionId: string,
    options: { fromMs?: number; toMs?: number; limit?: number } = {}
  ): Promise<PostInteractionFeedbackQualifiedEventContext[]> {
    const table = this.quoteIdentifier(this.tableName)
    const clauses = [`sender_session_id = $1`, `event_name = 'qualified'`, `qualification_key IS NOT NULL`]
    const values: Array<string | number> = [senderSessionId]
    let index = values.length

    if (typeof options.fromMs === 'number' && Number.isFinite(options.fromMs)) {
      index += 1
      clauses.push(`occurred_at >= to_timestamp($${index} / 1000.0)`)
      values.push(Math.max(0, Math.floor(options.fromMs)))
    }
    if (typeof options.toMs === 'number' && Number.isFinite(options.toMs)) {
      index += 1
      clauses.push(`occurred_at <= to_timestamp($${index} / 1000.0)`)
      values.push(Math.max(0, Math.floor(options.toMs)))
    }

    const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 50_000), 100_000))
    index += 1
    values.push(limit)

    const result = await this.pool.query(
      `SELECT sender_session_id,
              chat_id,
              phone,
              source_session_id,
              source_company_name,
              source_system,
              qualification_key,
              payload,
              EXTRACT(EPOCH FROM occurred_at) * 1000 AS occurred_at_ms
       FROM ${table}
       WHERE ${clauses.join(' AND ')}
       ORDER BY occurred_at ASC, id ASC
       LIMIT $${index}`,
      values
    )

    return result.rows
      .map((row) => {
        const qualificationKey = typeof row.qualification_key === 'string' ? row.qualification_key.trim() : ''
        const phone = typeof row.phone === 'string' ? row.phone.trim() : ''
        const chatId = typeof row.chat_id === 'string' ? row.chat_id.trim() : ''
        const sourceSessionId = typeof row.source_session_id === 'string' ? row.source_session_id.trim() : ''
        const sourceCompanyName = typeof row.source_company_name === 'string' ? row.source_company_name.trim() : ''
        const sourceSystem = row.source_system === 'dancing' ? 'dancing' : row.source_system === 'autowhats' ? 'autowhats' : null
        const qualifiedAtMs = Number(row.occurred_at_ms)
        if (!qualificationKey || !phone || !chatId || !sourceSessionId || !sourceCompanyName || !sourceSystem || !Number.isFinite(qualifiedAtMs)) {
          return null
        }

        const payload =
          row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {}

        return {
          senderSessionId: String(row.sender_session_id ?? '').trim(),
          chatId,
          phone,
          sourceSessionId,
          sourceCompanyName,
          sourceSystem,
          qualificationKey,
          qualifiedAtMs,
          userMessageCount: toSafeInteger(payload.userMessageCount),
          aiReplyCount: toSafeInteger(payload.aiReplyCount),
          triggerOutboundId: toNullableInteger(payload.triggerOutboundId)
        } satisfies PostInteractionFeedbackQualifiedEventContext
      })
      .filter((row): row is PostInteractionFeedbackQualifiedEventContext => row !== null)
  }

  async getLatestQualifiedEventContextByPhone(
    senderSessionId: string,
    phone: string,
    options: { beforeMs?: number } = {}
  ): Promise<PostInteractionFeedbackQualifiedEventContext | null> {
    const table = this.quoteIdentifier(this.tableName)
    const normalizedPhone = phone.trim()
    const clauses = [
      `sender_session_id = $1`,
      `event_name = 'qualified'`,
      `phone = $2`,
      `qualification_key IS NOT NULL`
    ]
    const values: Array<string | number> = [senderSessionId, normalizedPhone]
    let index = values.length
    if (typeof options.beforeMs === 'number' && Number.isFinite(options.beforeMs)) {
      index += 1
      clauses.push(`occurred_at <= to_timestamp($${index} / 1000.0)`)
      values.push(Math.max(0, Math.floor(options.beforeMs)))
    }
    const result = await this.pool.query(
      `SELECT sender_session_id,
              chat_id,
              phone,
              source_session_id,
              source_company_name,
              source_system,
              qualification_key,
              payload,
              EXTRACT(EPOCH FROM occurred_at) * 1000 AS occurred_at_ms
       FROM ${table}
       WHERE ${clauses.join(' AND ')}
       ORDER BY occurred_at DESC, id DESC
       LIMIT 1`,
      values
    )
    if ((result.rowCount ?? 0) === 0) {
      return null
    }
    return this.mapQualifiedContextRow(result.rows[0]) ?? null
  }

  async getQualificationSnapshot(
    senderSessionId: string,
    qualificationKey: string
  ): Promise<{
    initialSentAtMs: number | null
    lastPromptAtMs: number | null
    scorePromptAttempts: number
    commentPromptAttempts: number
    score: number | null
    stage: 'awaiting_score' | 'awaiting_comment' | 'completed_positive' | 'completed_negative' | 'opted_out'
    completedAtMs: number | null
  }> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT
         EXTRACT(EPOCH FROM MAX(occurred_at) FILTER (WHERE event_name = 'initial_message_sent')) * 1000 AS initial_sent_at_ms,
         EXTRACT(EPOCH FROM MAX(occurred_at) FILTER (WHERE event_name IN ('initial_message_sent','score_reminder_sent','comment_request_sent','comment_reminder_sent'))) * 1000 AS last_prompt_at_ms,
         COUNT(*) FILTER (WHERE event_name = 'score_reminder_sent')::int AS score_reminders,
         COUNT(*) FILTER (WHERE event_name IN ('comment_request_sent','comment_reminder_sent'))::int AS comment_prompts,
         MAX(score) FILTER (WHERE event_name = 'score_received')::int AS score,
         BOOL_OR(event_name = 'comment_request_sent' OR event_name = 'comment_reminder_sent') AS awaiting_comment,
         BOOL_OR(event_name = 'offer_sent') AS completed_positive,
         BOOL_OR(event_name = 'closed_negative') AS completed_negative,
         BOOL_OR(event_name = 'opted_out') AS opted_out,
         EXTRACT(EPOCH FROM MAX(occurred_at) FILTER (WHERE event_name IN ('offer_sent','closed_negative','opted_out'))) * 1000 AS completed_at_ms
       FROM ${table}
       WHERE sender_session_id = $1
         AND qualification_key = $2`,
      [senderSessionId, qualificationKey]
    )

    const row = result.rows[0] ?? {}
    const scorePromptAttempts = 1 + toSafeInteger(row.score_reminders)
    const commentPromptAttempts = toSafeInteger(row.comment_prompts)
    const stage =
      row.opted_out
        ? 'opted_out'
        : row.completed_positive
          ? 'completed_positive'
          : row.completed_negative
            ? 'completed_negative'
            : row.awaiting_comment
              ? 'awaiting_comment'
              : 'awaiting_score'

    return {
      initialSentAtMs: toNullableInteger(row.initial_sent_at_ms),
      lastPromptAtMs: toNullableInteger(row.last_prompt_at_ms),
      scorePromptAttempts,
      commentPromptAttempts,
      score: toNullableInteger(row.score),
      stage,
      completedAtMs: toNullableInteger(row.completed_at_ms)
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }

  private async listFeedbackRows(
    senderSessionId: string,
    filters: NormalizedFeedbackDetailsFilters
  ): Promise<{
    rows: PostInteractionFeedbackDetailsRow[]
    nextCursor: string | null
    hasMore: boolean
  }> {
    const table = this.quoteIdentifier(this.tableName)
    const { clauses, values } = buildFeedbackWhereClause(senderSessionId, filters, { includeCursor: true })
    const rowLimit = filters.limit + 1
    const limitPlaceholder = `$${values.length + 1}`
    const result = await this.pool.query(
      `SELECT qualification_key,
              score,
              source_company_name,
              phone,
              source_system,
              chat_id,
              EXTRACT(EPOCH FROM occurred_at) * 1000 AS feedback_at_ms
       FROM ${table}
       WHERE ${clauses.join(' AND ')}
       ORDER BY occurred_at DESC, qualification_key DESC
       LIMIT ${limitPlaceholder}`,
      [...values, rowLimit]
    )

    const rows = result.rows
      .map((row) => mapFeedbackRow(row))
      .filter((row): row is PostInteractionFeedbackDetailsRow => row !== null)
    const hasMore = rows.length > filters.limit
    const visibleRows = hasMore ? rows.slice(0, filters.limit) : rows
    const nextCursor =
      hasMore && visibleRows.length > 0
        ? encodeFeedbackCursor(
            visibleRows[visibleRows.length - 1]!.feedbackAtMs,
            visibleRows[visibleRows.length - 1]!.qualificationKey
          )
        : null

    return {
      rows: visibleRows,
      nextCursor,
      hasMore
    }
  }

  private async getFeedbackStats(
    senderSessionId: string,
    filters: NormalizedFeedbackDetailsFilters
  ): Promise<PostInteractionFeedbackDetailsStats> {
    const table = this.quoteIdentifier(this.tableName)
    const where = buildFeedbackWhereClause(senderSessionId, filters, { includeCursor: false })

    const [summaryResult, byScoreResult, byCompanyResult, byDayResult] = await Promise.all([
      this.pool.query(
        `SELECT
           COUNT(*)::int AS feedbacks_received,
           COALESCE(AVG(score), 0)::float8 AS average_score
         FROM ${table}
         WHERE ${where.clauses.join(' AND ')}`,
        where.values
      ),
      this.pool.query(
        `SELECT score, COUNT(*)::int AS count
         FROM ${table}
         WHERE ${where.clauses.join(' AND ')}
         GROUP BY score
         ORDER BY score DESC`,
        where.values
      ),
      this.pool.query(
        `SELECT source_company_name, COUNT(*)::int AS count, COALESCE(AVG(score), 0)::float8 AS average_score
         FROM ${table}
         WHERE ${where.clauses.join(' AND ')}
         GROUP BY source_company_name
         ORDER BY count DESC, source_company_name ASC`,
        where.values
      ),
      this.pool.query(
        `SELECT to_char(date_trunc('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count,
                COALESCE(AVG(score), 0)::float8 AS average_score
         FROM ${table}
         WHERE ${where.clauses.join(' AND ')}
         GROUP BY 1
         ORDER BY day ASC`,
        where.values
      )
    ])

    const summaryRow = summaryResult.rows[0] ?? {}
    return {
      feedbacksReceived: Number(summaryRow.feedbacks_received ?? 0),
      averageScore: Number(summaryRow.average_score ?? 0),
      byScore: byScoreResult.rows.map((row) => ({
        score: Number(row.score ?? 0),
        count: Number(row.count ?? 0)
      })) satisfies PostInteractionFeedbackDetailsByScore[],
      byCompany: byCompanyResult.rows.map((row) => ({
        companyName: String(row.source_company_name ?? '').trim(),
        count: Number(row.count ?? 0),
        averageScore: Number(row.average_score ?? 0)
      })) satisfies PostInteractionFeedbackDetailsByCompany[],
      byDay: byDayResult.rows.map((row) => ({
        day: String(row.day ?? ''),
        count: Number(row.count ?? 0),
        averageScore: Number(row.average_score ?? 0)
      })) satisfies PostInteractionFeedbackDetailsByDay[]
    }
  }

  private mapQualifiedContextRow(row: Record<string, unknown>): PostInteractionFeedbackQualifiedEventContext | null {
    const qualificationKey = typeof row.qualification_key === 'string' ? row.qualification_key.trim() : ''
    const phone = typeof row.phone === 'string' ? row.phone.trim() : ''
    const chatId = typeof row.chat_id === 'string' ? row.chat_id.trim() : ''
    const sourceSessionId = typeof row.source_session_id === 'string' ? row.source_session_id.trim() : ''
    const sourceCompanyName = typeof row.source_company_name === 'string' ? row.source_company_name.trim() : ''
    const sourceSystem = row.source_system === 'dancing' ? 'dancing' : row.source_system === 'autowhats' ? 'autowhats' : null
    const qualifiedAtMs = Number(row.occurred_at_ms)
    if (!qualificationKey || !phone || !chatId || !sourceSessionId || !sourceCompanyName || !sourceSystem || !Number.isFinite(qualifiedAtMs)) {
      return null
    }

    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {}

    return {
      senderSessionId: String(row.sender_session_id ?? '').trim(),
      chatId,
      phone,
      sourceSessionId,
      sourceCompanyName,
      sourceSystem,
      qualificationKey,
      qualifiedAtMs,
      userMessageCount: toSafeInteger(payload.userMessageCount),
      aiReplyCount: toSafeInteger(payload.aiReplyCount),
      triggerOutboundId: toNullableInteger(payload.triggerOutboundId)
    }
  }
}

type NormalizedFeedbackCursor = {
  feedbackAtMs: number
  qualificationKey: string
}

type NormalizedFeedbackDetailsFilters = {
  fromMs: number
  toMs: number
  company: string | null
  scoreMin: number | null
  scoreMax: number | null
  cursor: NormalizedFeedbackCursor | null
  limit: number
}

function normalizeFeedbackDetailsFilters(filters: PostInteractionFeedbackDetailsFilters): NormalizedFeedbackDetailsFilters {
  const fromMs = Math.max(0, Math.floor(filters.fromMs))
  const toMs = Math.max(fromMs, Math.floor(filters.toMs))
  const company = typeof filters.company === 'string' && filters.company.trim() ? filters.company.trim() : null
  const scoreMin =
    typeof filters.scoreMin === 'number' && Number.isFinite(filters.scoreMin)
      ? clampScore(filters.scoreMin)
      : null
  const scoreMax =
    typeof filters.scoreMax === 'number' && Number.isFinite(filters.scoreMax)
      ? clampScore(filters.scoreMax)
      : null
  if (scoreMin !== null && scoreMax !== null && scoreMin > scoreMax) {
    throw new Error('invalid_score_range')
  }

  return {
    fromMs,
    toMs,
    company,
    scoreMin,
    scoreMax,
    cursor: decodeFeedbackCursor(filters.cursor),
    limit:
      typeof filters.limit === 'number' && Number.isFinite(filters.limit)
        ? Math.max(1, Math.min(Math.floor(filters.limit), 100))
        : 25
  }
}

function buildFeedbackWhereClause(
  senderSessionId: string,
  filters: NormalizedFeedbackDetailsFilters,
  options: { includeCursor: boolean }
) {
  const clauses = [
    `sender_session_id = $1`,
    `event_name = 'score_received'`,
    `qualification_key IS NOT NULL`,
    `occurred_at >= to_timestamp($2 / 1000.0)`,
    `occurred_at <= to_timestamp($3 / 1000.0)`
  ]
  const values: Array<string | number> = [senderSessionId, filters.fromMs, filters.toMs]
  let index = values.length

  if (filters.company) {
    index += 1
    clauses.push(`source_company_name = $${index}`)
    values.push(filters.company)
  }
  if (filters.scoreMin !== null) {
    index += 1
    clauses.push(`score >= $${index}`)
    values.push(filters.scoreMin)
  }
  if (filters.scoreMax !== null) {
    index += 1
    clauses.push(`score <= $${index}`)
    values.push(filters.scoreMax)
  }
  if (options.includeCursor && filters.cursor) {
    index += 1
    const cursorTimePlaceholder = `$${index}`
    values.push(filters.cursor.feedbackAtMs)
    index += 1
    const cursorKeyPlaceholder = `$${index}`
    values.push(filters.cursor.qualificationKey)
    clauses.push(
      `(occurred_at < to_timestamp(${cursorTimePlaceholder} / 1000.0) OR ` +
        `(occurred_at = to_timestamp(${cursorTimePlaceholder} / 1000.0) AND qualification_key < ${cursorKeyPlaceholder}))`
    )
  }

  return { clauses, values }
}

function mapFeedbackRow(row: Record<string, unknown>): PostInteractionFeedbackDetailsRow | null {
  const qualificationKey = typeof row.qualification_key === 'string' ? row.qualification_key.trim() : ''
  const companyName = typeof row.source_company_name === 'string' ? row.source_company_name.trim() : ''
  const phone = typeof row.phone === 'string' ? row.phone.trim() : ''
  const chatId = typeof row.chat_id === 'string' ? row.chat_id.trim() : ''
  const sourceSystem = row.source_system === 'dancing' ? 'dancing' : row.source_system === 'autowhats' ? 'autowhats' : null
  const feedbackAtMs = Number(row.feedback_at_ms)
  const score = Number(row.score)
  if (!qualificationKey || !companyName || !phone || !chatId || !sourceSystem || !Number.isFinite(feedbackAtMs) || !Number.isFinite(score)) {
    return null
  }

  return {
    qualificationKey,
    score: Math.round(score),
    companyName,
    phone,
    feedbackAtMs,
    sourceSystem,
    chatId
  }
}

function clampScore(value: number) {
  return Math.max(1, Math.min(10, Math.round(value)))
}

function encodeFeedbackCursor(feedbackAtMs: number, qualificationKey: string) {
  return Buffer.from(JSON.stringify({ feedbackAtMs, qualificationKey }), 'utf8').toString('base64url')
}

function decodeFeedbackCursor(value: string | null | undefined): NormalizedFeedbackCursor | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      feedbackAtMs?: unknown
      qualificationKey?: unknown
    }
    const feedbackAtMs = typeof parsed.feedbackAtMs === 'number' ? parsed.feedbackAtMs : Number(parsed.feedbackAtMs)
    const qualificationKey = typeof parsed.qualificationKey === 'string' ? parsed.qualificationKey.trim() : ''
    if (!Number.isFinite(feedbackAtMs) || feedbackAtMs < 0 || !qualificationKey) {
      throw new Error('invalid_cursor')
    }

    return {
      feedbackAtMs: Math.floor(feedbackAtMs),
      qualificationKey
    }
  } catch {
    throw new Error('invalid_cursor')
  }
}

function toSafeInteger(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

function toNullableInteger(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(numeric) ? Math.floor(numeric) : null
}
