import type { Pool } from 'pg'
import type Redis from 'ioredis'
import type { SessionStatusSnapshot } from './types'

type SessionStatusStoreOptions = {
  redis: Redis
  pool: Pool
  cachePrefix?: string
  cacheTtlMs?: number
  historyTable?: string
}

export class SessionStatusStore {
  private readonly redis: Redis
  private readonly pool: Pool
  private readonly cachePrefix: string
  private readonly cacheTtlMs: number
  private readonly historyTable: string

  constructor(options: SessionStatusStoreOptions) {
    this.redis = options.redis
    this.pool = options.pool
    this.cachePrefix = options.cachePrefix ?? 'session-status'
    this.cacheTtlMs = options.cacheTtlMs ?? 0
    this.historyTable = options.historyTable ?? 'session_status_events'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.historyTable)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
  }

  async setStatus(snapshot: SessionStatusSnapshot): Promise<void> {
    const cacheKey = this.getCacheKey(snapshot.sessionId)
    const payload = JSON.stringify(snapshot)
    if (this.cacheTtlMs > 0) {
      await this.redis.set(cacheKey, payload, 'PX', this.cacheTtlMs)
    } else {
      await this.redis.set(cacheKey, payload)
    }

    const table = this.quoteIdentifier(this.historyTable)
    await this.pool.query(
      `INSERT INTO ${table} (session_id, status, reason, created_at)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
      [snapshot.sessionId, snapshot.status, snapshot.reason ?? null, snapshot.updatedAt]
    )
  }

  async getStatus(sessionId: string): Promise<SessionStatusSnapshot | null> {
    const cached = await this.redis.get(this.getCacheKey(sessionId))
    if (cached) {
      return JSON.parse(cached) as SessionStatusSnapshot
    }

    const table = this.quoteIdentifier(this.historyTable)
    const result = await this.pool.query(
      `SELECT status, reason, created_at FROM ${table}
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [sessionId]
    )
    if (result.rowCount === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      sessionId,
      status: row.status,
      reason: row.reason ?? undefined,
      updatedAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(row.created_at)
    }
  }

  async listHistory(sessionId: string, limit = 50): Promise<SessionStatusSnapshot[]> {
    const table = this.quoteIdentifier(this.historyTable)
    const result = await this.pool.query(
      `SELECT status, reason, created_at FROM ${table}
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [sessionId, limit]
    )

    return result.rows.map((row) => ({
      sessionId,
      status: row.status,
      reason: row.reason ?? undefined,
      updatedAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.parse(row.created_at)
    }))
  }

  private getCacheKey(sessionId: string) {
    return `${this.cachePrefix}:${sessionId}`
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
