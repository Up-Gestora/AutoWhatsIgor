import type { Pool } from 'pg'

type AiResponseStoreOptions = {
  pool: Pool
  tableName?: string
  processingTimeoutMs: number
}

export class AiResponseStore {
  private readonly pool: Pool
  private readonly tableName: string
  private readonly processingTimeoutMs: number

  constructor(options: AiResponseStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'ai_responses'
    this.processingTimeoutMs = Math.max(60000, options.processingTimeoutMs)
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        inbound_id BIGINT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        status TEXT NOT NULL,
        response TEXT,
        error TEXT,
        outbound_id BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_chat_idx`)}
       ON ${table} (session_id, chat_id)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_status_updated_idx`)}
       ON ${table} (session_id, status, updated_at)`
    )
  }

  async tryStart(inboundId: number, sessionId: string, chatId: string): Promise<boolean> {
    const table = this.quoteIdentifier(this.tableName)
    const existing = await this.pool.query(
      `SELECT status, updated_at FROM ${table} WHERE inbound_id = $1`,
      [inboundId]
    )

    if ((existing.rowCount ?? 0) > 0) {
      const row = existing.rows[0]
      const status = String(row.status)
      const updatedAt = row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(row.updated_at)
      if (status !== 'processing') {
        return false
      }

      if (Date.now() - updatedAt < this.processingTimeoutMs) {
        return false
      }

      await this.pool.query(
        `UPDATE ${table} SET status = 'processing', updated_at = NOW(), error = $2 WHERE inbound_id = $1`,
        [inboundId, 'processing-timeout']
      )
      return true
    }

    const insert = await this.pool.query(
      `INSERT INTO ${table} (inbound_id, session_id, chat_id, status, updated_at)
       VALUES ($1, $2, $3, 'processing', NOW())
       ON CONFLICT DO NOTHING`,
      [inboundId, sessionId, chatId]
    )

    return (insert.rowCount ?? 0) > 0
  }

  async markSent(inboundId: number, response: string, outboundId?: number | null): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table} SET status = 'sent', response = $2, outbound_id = $3, updated_at = NOW(), error = NULL
       WHERE inbound_id = $1`,
      [inboundId, response, outboundId ?? null]
    )
  }

  async markSkipped(inboundId: number, reason: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table} SET status = 'skipped', error = $2, updated_at = NOW() WHERE inbound_id = $1`,
      [inboundId, reason]
    )
  }

  async markFailed(inboundId: number, error: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table} SET status = 'failed', error = $2, updated_at = NOW() WHERE inbound_id = $1`,
      [inboundId, error]
    )
  }

  async resetForReplay(inboundId: number): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `DELETE FROM ${table}
       WHERE inbound_id = $1`,
      [inboundId]
    )
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
