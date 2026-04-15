import type { Pool } from 'pg'

type OnboardingDraftStoreOptions = {
  pool: Pool
  tableName?: string
}

type DraftRow = {
  session_id: string
  state: unknown
}

export class OnboardingDraftStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: OnboardingDraftStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'onboarding_draft_states'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT PRIMARY KEY,
        state JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_updated_idx`)}
       ON ${table} (updated_at DESC)`
    )
  }

  async get(sessionId: string): Promise<Record<string, unknown> | null> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return null
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(`SELECT session_id, state FROM ${table} WHERE session_id = $1`, [
      safeSessionId
    ])

    if ((result.rowCount ?? 0) <= 0) {
      return null
    }

    return this.parseState((result.rows[0] as DraftRow).state)
  }

  async upsert(sessionId: string, state: Record<string, unknown>): Promise<void> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (session_id, state, created_at, updated_at)
       VALUES ($1, $2::jsonb, NOW(), NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [safeSessionId, JSON.stringify(state)]
    )
  }

  async delete(sessionId: string): Promise<void> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return
    }
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(`DELETE FROM ${table} WHERE session_id = $1`, [safeSessionId])
  }

  private parseState(raw: unknown): Record<string, unknown> | null {
    if (!raw) {
      return null
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      return null
    }
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }

  private quoteIdentifier(name: string): string {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
