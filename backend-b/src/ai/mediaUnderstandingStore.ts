import type { Pool } from 'pg'

type MediaUnderstandingStoreOptions = {
  pool: Pool
  tableName?: string
  processingTimeoutMs: number
  maxAttempts: number
}

export class MediaUnderstandingStore {
  private readonly pool: Pool
  private readonly tableName: string
  private readonly processingTimeoutMs: number
  private readonly maxAttempts: number

  constructor(options: MediaUnderstandingStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'ai_media_understandings'
    this.processingTimeoutMs = Math.max(10_000, options.processingTimeoutMs)
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts))
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        inbound_id BIGINT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_chat_idx`)}
       ON ${table} (session_id, chat_id)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_status_updated_idx`)}
       ON ${table} (status, updated_at)`
    )
  }

  async tryStart(inboundId: number, sessionId: string, chatId: string): Promise<boolean> {
    const table = this.quoteIdentifier(this.tableName)
    const existing = await this.pool.query(
      `SELECT status, attempts, updated_at
       FROM ${table}
       WHERE inbound_id = $1`,
      [inboundId]
    )

    if ((existing.rowCount ?? 0) > 0) {
      const row = existing.rows[0] as {
        status?: unknown
        attempts?: unknown
        updated_at?: unknown
      }
      const status = String(row.status ?? '')
      const attempts = typeof row.attempts === 'number' ? row.attempts : Number(row.attempts ?? 0)

      if (status === 'done' || status === 'skipped') {
        return false
      }

      if (Number.isFinite(attempts) && attempts >= this.maxAttempts) {
        return false
      }

      if (status === 'processing') {
        const updatedAtMs =
          row.updated_at instanceof Date
            ? row.updated_at.getTime()
            : Date.parse(String(row.updated_at ?? ''))

        if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < this.processingTimeoutMs) {
          return false
        }
      }

      const nextAttempts = (Number.isFinite(attempts) ? attempts : 0) + 1
      await this.pool.query(
        `UPDATE ${table}
         SET status = 'processing',
             session_id = $2,
             chat_id = $3,
             attempts = $4,
             error = NULL,
             updated_at = NOW()
         WHERE inbound_id = $1`,
        [inboundId, sessionId, chatId, nextAttempts]
      )
      return true
    }

    const insert = await this.pool.query(
      `INSERT INTO ${table} (inbound_id, session_id, chat_id, status, attempts, updated_at)
       VALUES ($1, $2, $3, 'processing', 1, NOW())
       ON CONFLICT DO NOTHING`,
      [inboundId, sessionId, chatId]
    )
    return (insert.rowCount ?? 0) > 0
  }

  async markDone(inboundId: number): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET status = 'done', error = NULL, updated_at = NOW()
       WHERE inbound_id = $1`,
      [inboundId]
    )
  }

  async markSkipped(inboundId: number, reason: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET status = 'skipped', error = $2, updated_at = NOW()
       WHERE inbound_id = $1`,
      [inboundId, reason]
    )
  }

  async markFailed(inboundId: number, error: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET status = 'failed', error = $2, updated_at = NOW()
       WHERE inbound_id = $1`,
      [inboundId, error]
    )
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
