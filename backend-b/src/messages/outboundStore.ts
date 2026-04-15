import type { Pool } from 'pg'
import type {
  OutboundMessageInsert,
  OutboundMessagePayload,
  OutboundMessageRecord,
  OutboundMessageStatus
} from './outboundTypes'

type OutboundMessageStoreOptions = {
  pool: Pool
  tableName?: string
}

type OutboundMessageRow = {
  id: number
  session_id: string
  chat_id: string
  request_id: string | null
  payload_hash: string
  status: OutboundMessageStatus
  attempts: number
  message_id: string | null
  error: string | null
  payload: unknown
  created_at: Date | string
  updated_at: Date | string
}

export type DisconnectedOutboundRecoveryListOptions = {
  sessionId: string
  fromMs: number
  toMs: number
  error?: string | null
  errors?: string[] | null
}

export class OutboundMessageStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: OutboundMessageStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'outbound_messages'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        request_id TEXT,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        message_id TEXT,
        error TEXT,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_chat_idx`)}
       ON ${table} (session_id, chat_id, created_at)`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_request_id_idx`)}
       ON ${table} (session_id, request_id)
       WHERE request_id IS NOT NULL`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_message_id_idx`)}
       ON ${table} (session_id, message_id)
       WHERE message_id IS NOT NULL`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_payload_hash_idx`)}
       ON ${table} (session_id, payload_hash)`
    )
  }

  async insert(message: OutboundMessageInsert): Promise<OutboundMessageRecord> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        chat_id,
        request_id,
        payload_hash,
        status,
        attempts,
        message_id,
        error,
        payload,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0), to_timestamp($11 / 1000.0))
      RETURNING *`,
      [
        message.sessionId,
        message.chatId,
        message.requestId ?? null,
        message.payloadHash,
        message.status,
        message.attempts,
        message.messageId ?? null,
        message.error ?? null,
        message.payload,
        message.createdAtMs,
        message.updatedAtMs
      ]
    )

    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  async findByRequestId(sessionId: string, requestId: string): Promise<OutboundMessageRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT * FROM ${table} WHERE session_id = $1 AND request_id = $2`,
      [sessionId, requestId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  async getById(outboundId: number): Promise<OutboundMessageRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [outboundId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  async getByMessageId(sessionId: string, messageId: string): Promise<OutboundMessageRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT * FROM ${table} WHERE session_id = $1 AND message_id = $2`,
      [sessionId, messageId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  async listRecentByChat(
    sessionId: string,
    chatId: string,
    limit = 20,
    options: { beforeTimestampMs?: number } = {}
  ): Promise<OutboundMessageRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, limit)
    const beforeMs = options.beforeTimestampMs
    const params = [sessionId, chatId, safeLimit]
    let where = 'WHERE session_id = $1 AND chat_id = $2'
    if (typeof beforeMs === 'number' && Number.isFinite(beforeMs)) {
      params.push(beforeMs)
      where += ` AND created_at < to_timestamp($4 / 1000.0)`
    }

    const result = await this.pool.query(
      `SELECT * FROM ${table}
       ${where}
       ORDER BY created_at DESC
       LIMIT $3`,
      params
    )

    return result.rows.map((row) => this.mapRow(row as OutboundMessageRow)).reverse()
  }

  async getLatestByChat(sessionId: string, chatId: string): Promise<OutboundMessageRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT *
       FROM ${table}
       WHERE session_id = $1 AND chat_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [sessionId, chatId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  async countSentAiMessagesSince(sessionId: string, chatId: string, sinceMs: number): Promise<number> {
    const table = this.quoteIdentifier(this.tableName)
    const safeSinceMs = Math.max(0, Math.floor(sinceMs))
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = $2
         AND created_at >= to_timestamp($3 / 1000.0)
         AND status IN ('sent', 'delivered', 'read')
         AND payload->>'origin' = 'ai'
         AND payload->>'type' IN ('text', 'media', 'contact')`,
      [sessionId, chatId, safeSinceMs]
    )
    return Number(result.rows[0]?.count ?? 0)
  }

  async listSentAiMessagesSince(sinceMs: number, limit: number): Promise<OutboundMessageRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeSinceMs = Math.max(0, Math.floor(sinceMs))
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 10_000))
    const result = await this.pool.query(
      `SELECT *
       FROM ${table}
       WHERE created_at >= to_timestamp($1 / 1000.0)
         AND status IN ('sent', 'delivered', 'read')
         AND payload->>'origin' = 'ai'
         AND payload->>'type' IN ('text', 'media', 'contact')
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [safeSinceMs, safeLimit]
    )

    return result.rows.map((row) => this.mapRow(row as OutboundMessageRow))
  }

  async listMediaForStorageCleanup(options: {
    olderThanMs: number
    limit: number
  }): Promise<OutboundMessageRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const olderThanMs = Math.max(0, Math.floor(options.olderThanMs))
    const limit = Math.max(1, Math.floor(options.limit))
    const terminalStatuses: OutboundMessageStatus[] = ['sent', 'delivered', 'read', 'failed']

    const result = await this.pool.query(
      `SELECT * FROM ${table}
       WHERE status = ANY($1::text[])
         AND created_at < to_timestamp($2 / 1000.0)
         AND payload->>'type' = 'media'
         AND payload->>'storagePolicy' IN ('ttl_15d', 'ttl_30d')
         AND COALESCE(payload->>'url', '') <> ''
       ORDER BY created_at ASC
       LIMIT $3`,
      [terminalStatuses, olderThanMs, limit]
    )

    return result.rows.map((row) => this.mapRow(row as OutboundMessageRow))
  }

  async listDisconnectedRecoveryCandidates(
    options: DisconnectedOutboundRecoveryListOptions
  ): Promise<OutboundMessageRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const sessionId = options.sessionId.trim()
    const fromMs = Math.max(0, Math.floor(options.fromMs))
    const toMs = Math.max(fromMs, Math.floor(options.toMs))
    const errors = normalizeRecoveryErrors(options.errors, options.error)

    const result = await this.pool.query(
      `SELECT *
       FROM ${table}
       WHERE session_id = $1
         AND status = 'failed'
         AND message_id IS NULL
         AND created_at >= to_timestamp($2 / 1000.0)
         AND created_at <= to_timestamp($3 / 1000.0)
         AND (COALESCE(array_length($4::text[], 1), 0) = 0 OR error = ANY($4::text[]))
       ORDER BY created_at ASC, id ASC`,
      [sessionId, fromMs, toMs, errors]
    )

    return result.rows.map((row) => this.mapRow(row as OutboundMessageRow))
  }

  async markSending(outboundId: number): Promise<number | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `UPDATE ${table}
       SET status = 'sending',
           attempts = attempts + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING attempts`,
      [outboundId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return Number(result.rows[0]?.attempts)
  }

  async resetForReplay(outboundId: number): Promise<OutboundMessageRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `UPDATE ${table}
       SET status = 'queued',
           attempts = 0,
           error = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [outboundId]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  async markRetrying(outboundId: number, error: string | null): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET status = 'retrying',
           error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [outboundId, error]
    )
  }

  async markFailed(outboundId: number, error: string | null): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET status = 'failed',
           error = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [outboundId, error]
    )
  }

  async markSent(outboundId: number, messageId: string | null): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET status = 'sent',
           message_id = COALESCE($2, message_id),
           updated_at = NOW()
       WHERE id = $1`,
      [outboundId, messageId]
    )
  }

  async markMediaStorageDeleted(outboundId: number, deletedAtMs: number): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    const safeDeletedAtMs = Math.max(0, Math.floor(deletedAtMs))
    await this.pool.query(
      `UPDATE ${table}
       SET payload = jsonb_set(
         jsonb_set(payload, '{url}', to_jsonb(''::text), true),
         '{storageDeletedAtMs}',
         to_jsonb($2::bigint),
         true
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [outboundId, safeDeletedAtMs]
    )
  }

  async updateStatusByMessageId(
    sessionId: string,
    messageId: string,
    status: OutboundMessageStatus
  ): Promise<OutboundMessageRecord | null> {
    const current = await this.getByMessageId(sessionId, messageId)
    if (!current) {
      return null
    }

    if (!shouldAdvanceStatus(current.status, status)) {
      return current
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `UPDATE ${table}
       SET status = $3,
           updated_at = NOW()
       WHERE session_id = $1 AND message_id = $2
       RETURNING *`,
      [sessionId, messageId, status]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.mapRow(result.rows[0] as OutboundMessageRow)
  }

  private mapRow(row: OutboundMessageRow): OutboundMessageRecord {
    return {
      id: Number(row.id),
      sessionId: row.session_id,
      chatId: row.chat_id,
      requestId: row.request_id ?? undefined,
      payloadHash: row.payload_hash,
      status: row.status,
      attempts: Number(row.attempts),
      messageId: row.message_id,
      error: row.error,
      payload: row.payload as OutboundMessagePayload,
      createdAtMs: row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(row.created_at),
      updatedAtMs: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(row.updated_at)
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function shouldAdvanceStatus(current: OutboundMessageStatus, next: OutboundMessageStatus) {
  const rank: Record<OutboundMessageStatus, number> = {
    queued: 0,
    retrying: 1,
    sending: 2,
    sent: 3,
    delivered: 4,
    read: 5,
    failed: -1
  }

  if (current === 'failed') {
    return next === 'failed'
  }

  return rank[next] > rank[current]
}

function normalizeRecoveryErrors(errors: string[] | null | undefined, error: string | null | undefined): string[] {
  const normalizedErrors = Array.isArray(errors)
    ? errors
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    : []

  if (normalizedErrors.length > 0) {
    return [...new Set(normalizedErrors)]
  }

  const normalizedError = typeof error === 'string' ? error.trim() : ''
  return normalizedError ? [normalizedError] : []
}
