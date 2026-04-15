import type { Pool } from 'pg'

type SystemSettingsStoreOptions = {
  pool: Pool
  tableName?: string
}

export class SystemSettingsStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: SystemSettingsStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'system_settings'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(`SELECT value FROM ${table} WHERE key = $1`, [key])
    if (result.rowCount === 0) {
      return null
    }
    return result.rows[0]?.value as T
  }

  async set(key: string, value: unknown): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    )
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
