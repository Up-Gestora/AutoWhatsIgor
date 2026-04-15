import type { Pool } from 'pg'
import type { AiConfigOverride } from './types'

type AiConfigStoreOptions = {
  pool: Pool
  tableName?: string
}

export class AiConfigStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: AiConfigStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'ai_configs'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT PRIMARY KEY,
        config JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
  }

  async get(sessionId: string): Promise<AiConfigOverride | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT config FROM ${table} WHERE session_id = $1`,
      [sessionId]
    )
    if (result.rowCount === 0) {
      return null
    }

    const raw = result.rows[0]?.config
    if (!raw) {
      return null
    }

    return raw as AiConfigOverride
  }

  async upsert(sessionId: string, config: AiConfigOverride): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (session_id, config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET config = EXCLUDED.config, updated_at = NOW()`,
      [sessionId, config]
    )
  }

  async delete(sessionId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(`DELETE FROM ${table} WHERE session_id = $1`, [sessionId])
  }

  async listSessionsWithAutoFollowUpEnabled(limit = 200): Promise<Array<{ sessionId: string; config: AiConfigOverride }>> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(limit, 2000))
    const result = await this.pool.query(
      `SELECT session_id, config
       FROM ${table}
       WHERE LOWER(
         COALESCE(
           config #>> '{training,followUpAutomatico,enabled}',
           config #>> '{training,followUpAutomatic,enabled}',
           'false'
         )
       ) IN ('true', '1', 'yes', 'y')
       ORDER BY updated_at DESC
       LIMIT $1`,
      [safeLimit]
    )

    return result.rows
      .map((row) => {
        const sessionId = typeof row.session_id === 'string' ? row.session_id.trim() : ''
        if (!sessionId) {
          return null
        }
        return {
          sessionId,
          config:
            row.config && typeof row.config === 'object' && !Array.isArray(row.config)
              ? (row.config as AiConfigOverride)
              : ({} as AiConfigOverride)
        }
      })
      .filter((entry): entry is { sessionId: string; config: AiConfigOverride } => entry !== null)
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
