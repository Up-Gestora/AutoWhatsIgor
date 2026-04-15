import type { Pool } from 'pg'

export type AdminAuditRecord = {
  action: string
  sessionId?: string
  requestId?: string
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

type AdminAuditStoreOptions = {
  pool: Pool
  tableName?: string
}

export class AdminAuditStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: AdminAuditStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'admin_audit'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        session_id TEXT,
        request_id TEXT,
        ip TEXT,
        user_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
  }

  async record(entry: AdminAuditRecord): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (
        action,
        session_id,
        request_id,
        ip,
        user_agent,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.action,
        entry.sessionId ?? null,
        entry.requestId ?? null,
        entry.ip ?? null,
        entry.userAgent ?? null,
        entry.metadata ?? null
      ]
    )
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
