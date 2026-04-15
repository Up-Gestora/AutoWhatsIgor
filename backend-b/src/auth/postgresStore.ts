import type { Pool } from 'pg'
import type { AuthStatePayload, AuthStateStore } from './types'
import type { AuthStateCrypto, EncryptedPayload } from './crypto'

type PostgresAuthStateStoreOptions = {
  pool: Pool
  crypto: AuthStateCrypto
  tableName?: string
}

export type EncryptedAuthStateRow = {
  sessionId: string
  payload: EncryptedPayload
  updatedAt: string
}

export class PostgresAuthStateStore implements AuthStateStore {
  private readonly pool: Pool
  private readonly crypto: AuthStateCrypto
  private readonly tableName: string

  constructor(options: PostgresAuthStateStoreOptions) {
    this.pool = options.pool
    this.crypto = options.crypto
    this.tableName = options.tableName ?? 'auth_states'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
  }

  async get(sessionId: string): Promise<AuthStatePayload | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT payload FROM ${table} WHERE session_id = $1`,
      [sessionId]
    )

    if (result.rowCount === 0) {
      return null
    }

    const raw = result.rows[0]?.payload
    if (!raw) {
      return null
    }

    const envelope = this.crypto.parse(raw)
    const decrypted = this.crypto.decrypt(envelope)
    return JSON.parse(decrypted) as AuthStatePayload
  }

  async set(sessionId: string, state: AuthStatePayload): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    const plaintext = JSON.stringify(state)
    const envelope = this.crypto.encrypt(plaintext)
    const payload = this.crypto.serialize(envelope)

    await this.pool.query(
      `INSERT INTO ${table} (session_id, payload, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [sessionId, payload]
    )
  }

  async delete(sessionId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(`DELETE FROM ${table} WHERE session_id = $1`, [sessionId])
  }

  async listSessionIds(limit = 50): Promise<string[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, limit)
    const result = await this.pool.query(
      `SELECT session_id FROM ${table} ORDER BY updated_at DESC LIMIT $1`,
      [safeLimit]
    )

    return result.rows.map((row) => row.session_id as string)
  }

  async exportEncrypted(limit?: number): Promise<EncryptedAuthStateRow[]> {
    const table = this.quoteIdentifier(this.tableName)
    const values: unknown[] = []
    const limitClause = typeof limit === 'number' ? ' LIMIT $1' : ''
    if (typeof limit === 'number') {
      values.push(limit)
    }

    const result = await this.pool.query(
      `SELECT session_id, payload, updated_at FROM ${table} ORDER BY session_id${limitClause}`,
      values
    )

    return result.rows.map((row) => ({
      sessionId: row.session_id,
      payload: this.crypto.parse(row.payload),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
    }))
  }

  async importEncrypted(rows: EncryptedAuthStateRow[]): Promise<void> {
    if (rows.length === 0) {
      return
    }

    const table = this.quoteIdentifier(this.tableName)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const row of rows) {
        const payload = this.crypto.serialize(row.payload)
        await client.query(
          `INSERT INTO ${table} (session_id, payload, updated_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (session_id)
           DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
          [row.sessionId, payload, row.updatedAt]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
