import type { Pool } from 'pg'
import type { CreditBalance, CreditChangeMeta, CreditUsageCostSummary, CreditUsageSeriesEntry } from './types'

type CreditsStoreOptions = {
  pool: Pool
  creditsTable?: string
  eventsTable?: string
}

type UpdateMode = 'set' | 'adjust' | 'consume'

export class CreditsStore {
  private readonly pool: Pool
  private readonly creditsTable: string
  private readonly eventsTable: string

  constructor(options: CreditsStoreOptions) {
    this.pool = options.pool
    this.creditsTable = options.creditsTable ?? 'user_credits'
    this.eventsTable = options.eventsTable ?? 'credit_events'
  }

  async init(): Promise<void> {
    const creditsTable = this.quoteIdentifier(this.creditsTable)
    const eventsTable = this.quoteIdentifier(this.eventsTable)

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${creditsTable} (
        session_id TEXT PRIMARY KEY,
        balance_brl NUMERIC(14, 6) NOT NULL DEFAULT 0,
        blocked_at TIMESTAMPTZ NULL,
        blocked_reason TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${eventsTable} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        delta_brl NUMERIC(14, 6) NOT NULL,
        balance_before NUMERIC(14, 6) NOT NULL,
        balance_after NUMERIC(14, 6) NOT NULL,
        source TEXT NOT NULL,
        reference_id TEXT NULL,
        actor_id TEXT NULL,
        reason TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.creditsTable}_updated_idx`)}
       ON ${creditsTable} (updated_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_session_created_idx`)}
       ON ${eventsTable} (session_id, created_at)`
    )

    // Idempotency guard for Stripe top-ups: ensure the same payment_intent doesn't credit twice.
    // Uses a partial unique index so other sources can keep flexible reference_id semantics.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_stripe_topup_reference_uidx`)}
       ON ${eventsTable} (reference_id)
       WHERE source = 'stripe_topup' AND reference_id IS NOT NULL`
    )

    // Idempotency guard for Stripe subscription credits: ensure the same invoice doesn't credit twice.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_stripe_subscription_reference_uidx`)}
       ON ${eventsTable} (reference_id)
       WHERE source = 'stripe_subscription' AND reference_id IS NOT NULL`
    )

    // Idempotency guard for audio transcription charges: ensure the same inboundId doesn't debit twice.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_audio_transcription_reference_uidx`)}
       ON ${eventsTable} (reference_id)
       WHERE source = 'ai_usage' AND reason = 'audio_transcription' AND reference_id IS NOT NULL`
    )

    // Idempotency guard for media understanding charges: ensure the same inboundId doesn't debit twice.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_media_understanding_reference_uidx`)}
       ON ${eventsTable} (reference_id)
       WHERE source = 'ai_usage' AND reason = 'media_understanding' AND reference_id IS NOT NULL`
    )

    // Idempotency guard for broadcast transmission charges: ensure each billed block debits once.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_broadcast_transmission_reference_uidx`)}
       ON ${eventsTable} (reference_id)
       WHERE source = 'ai_usage' AND reason = 'broadcast_transmission' AND reference_id IS NOT NULL`
    )

    // Idempotency guard for signup bonuses: ensure a session gets the bonus only once.
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.eventsTable}_signup_bonus_session_uidx`)}
       ON ${eventsTable} (session_id)
       WHERE source = 'signup_bonus'`
    )
  }

  async ensure(sessionId: string): Promise<void> {
    const creditsTable = this.quoteIdentifier(this.creditsTable)
    await this.pool.query(
      `INSERT INTO ${creditsTable} (session_id, balance_brl, created_at, updated_at)
       VALUES ($1, 0, NOW(), NOW())
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId]
    )
  }

  async get(sessionId: string): Promise<CreditBalance | null> {
    const creditsTable = this.quoteIdentifier(this.creditsTable)
    const result = await this.pool.query(
      `SELECT session_id, balance_brl, blocked_at, blocked_reason, updated_at
       FROM ${creditsTable}
       WHERE session_id = $1`,
      [sessionId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    return this.toBalance(result.rows[0])
  }

  async getBatch(sessionIds: string[]): Promise<Record<string, CreditBalance>> {
    const response: Record<string, CreditBalance> = {}
    if (sessionIds.length === 0) {
      return response
    }

    const creditsTable = this.quoteIdentifier(this.creditsTable)
    const result = await this.pool.query(
      `SELECT session_id, balance_brl, blocked_at, blocked_reason, updated_at
       FROM ${creditsTable}
       WHERE session_id = ANY($1::text[])`,
      [sessionIds]
    )

    for (const row of result.rows) {
      const balance = this.toBalance(row)
      response[balance.sessionId] = balance
    }

    return response
  }

  async getUsageCostByReason(
    sessionId: string,
    fromMs: number,
    toMs: number,
    reason: string
  ): Promise<CreditUsageCostSummary> {
    const eventsTable = this.quoteIdentifier(this.eventsTable)
    const result = await this.pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN delta_brl < 0 THEN -delta_brl ELSE 0 END), 0)::float AS cost_brl,
         COALESCE(SUM(CASE WHEN delta_brl < 0 THEN 1 ELSE 0 END), 0)::int AS events
       FROM ${eventsTable}
       WHERE session_id = $1
         AND source = 'ai_usage'
         AND reason = $4
         AND created_at >= to_timestamp($2 / 1000.0)
         AND created_at <= to_timestamp($3 / 1000.0)`,
      [sessionId, fromMs, toMs, reason]
    )

    const row = result.rows[0] ?? {}
    return {
      costBrl: Number(row.cost_brl ?? 0),
      events: Number(row.events ?? 0)
    }
  }

  async getUsageDailySeriesByReason(
    sessionId: string,
    fromMs: number,
    toMs: number,
    reason: string,
    timezone = 'America/Sao_Paulo'
  ): Promise<CreditUsageSeriesEntry[]> {
    const eventsTable = this.quoteIdentifier(this.eventsTable)
    const result = await this.pool.query(
      `SELECT
         date_trunc('day', created_at AT TIME ZONE $5) AS day_local,
         COALESCE(SUM(CASE WHEN delta_brl < 0 THEN -delta_brl ELSE 0 END), 0)::float AS cost_brl,
         COALESCE(SUM(CASE WHEN delta_brl < 0 THEN 1 ELSE 0 END), 0)::int AS events
       FROM ${eventsTable}
       WHERE session_id = $1
         AND source = 'ai_usage'
         AND reason = $4
         AND created_at >= to_timestamp($2 / 1000.0)
         AND created_at <= to_timestamp($3 / 1000.0)
       GROUP BY day_local
       ORDER BY day_local ASC`,
      [sessionId, fromMs, toMs, reason, timezone]
    )

    return result.rows.map((row) => ({
      day: row.day_local instanceof Date ? row.day_local.toISOString().slice(0, 10) : String(row.day_local).slice(0, 10),
      costBrl: Number(row.cost_brl ?? 0),
      events: Number(row.events ?? 0)
    }))
  }

  async setBalance(sessionId: string, amountBrl: number, meta: CreditChangeMeta): Promise<CreditBalance> {
    return this.applyChange(sessionId, 'set', amountBrl, meta)
  }

  async adjustBalance(sessionId: string, amountBrl: number, meta: CreditChangeMeta): Promise<CreditBalance> {
    return this.applyChange(sessionId, 'adjust', amountBrl, meta)
  }

  async consumeCost(sessionId: string, amountBrl: number, meta: CreditChangeMeta): Promise<CreditBalance> {
    return this.applyChange(sessionId, 'consume', amountBrl, meta)
  }

  async markBlocked(sessionId: string, reason: string): Promise<CreditBalance> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const creditsTable = this.quoteIdentifier(this.creditsTable)
      await client.query(
        `INSERT INTO ${creditsTable} (session_id, balance_brl, created_at, updated_at)
         VALUES ($1, 0, NOW(), NOW())
         ON CONFLICT (session_id) DO NOTHING`,
        [sessionId]
      )

      const current = await client.query(
        `SELECT session_id, balance_brl, blocked_at, blocked_reason, updated_at
         FROM ${creditsTable}
         WHERE session_id = $1
         FOR UPDATE`,
        [sessionId]
      )
      const row = current.rows[0]
      if (!row) {
        await client.query('COMMIT')
        return {
          sessionId,
          balanceBrl: 0,
          blockedAt: null,
          blockedReason: null,
          updatedAt: Date.now()
        }
      }

      const balance = Number(row.balance_brl ?? 0)
      if (balance > 0) {
        await client.query('COMMIT')
        return this.toBalance(row)
      }

      const blockedAt = row.blocked_at ?? new Date()
      const blockedReason = reason || 'no_credits'
      const updated = await client.query(
        `UPDATE ${creditsTable}
         SET blocked_at = $2, blocked_reason = $3, updated_at = NOW()
         WHERE session_id = $1
         RETURNING session_id, balance_brl, blocked_at, blocked_reason, updated_at`,
        [sessionId, blockedAt, blockedReason]
      )

      await client.query('COMMIT')
      return this.toBalance(updated.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private async applyChange(
    sessionId: string,
    mode: UpdateMode,
    amountBrl: number,
    meta: CreditChangeMeta
  ): Promise<CreditBalance> {
    if (!Number.isFinite(amountBrl)) {
      throw new Error('amount_invalid')
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const creditsTable = this.quoteIdentifier(this.creditsTable)
      const eventsTable = this.quoteIdentifier(this.eventsTable)

      await client.query(
        `INSERT INTO ${creditsTable} (session_id, balance_brl, created_at, updated_at)
         VALUES ($1, 0, NOW(), NOW())
         ON CONFLICT (session_id) DO NOTHING`,
        [sessionId]
      )

      const current = await client.query(
        `SELECT session_id, balance_brl, blocked_at, blocked_reason, updated_at
         FROM ${creditsTable}
         WHERE session_id = $1
         FOR UPDATE`,
        [sessionId]
      )
      const row = current.rows[0]
      const currentBalance = Number(row?.balance_brl ?? 0)
      let nextBalance = currentBalance

      if (mode === 'set') {
        nextBalance = amountBrl
      } else if (mode === 'adjust') {
        nextBalance = currentBalance + amountBrl
      } else if (mode === 'consume') {
        nextBalance = currentBalance - amountBrl
      }

      if (!Number.isFinite(nextBalance)) {
        nextBalance = currentBalance
      }

      if (nextBalance < 0) {
        nextBalance = 0
      }

      const shouldBlock = nextBalance <= 0
      const blockedAt = shouldBlock ? row?.blocked_at ?? new Date() : null
      const blockedReason = shouldBlock ? 'no_credits' : null
      const delta = nextBalance - currentBalance

      const updated = await client.query(
        `UPDATE ${creditsTable}
         SET balance_brl = $2,
             blocked_at = $3,
             blocked_reason = $4,
             updated_at = NOW()
         WHERE session_id = $1
         RETURNING session_id, balance_brl, blocked_at, blocked_reason, updated_at`,
        [sessionId, nextBalance, blockedAt, blockedReason]
      )

      await client.query(
        `INSERT INTO ${eventsTable} (
          session_id,
          delta_brl,
          balance_before,
          balance_after,
          source,
          reference_id,
          actor_id,
          reason,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          sessionId,
          delta,
          currentBalance,
          nextBalance,
          meta.source,
          meta.referenceId ?? null,
          meta.actorId ?? null,
          meta.reason ?? null
        ]
      )

      await client.query('COMMIT')
      return this.toBalance(updated.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  private toBalance(row: Record<string, unknown>): CreditBalance {
    const blockedAt = this.parseTimestamp(row.blocked_at)
    const updatedAt = this.parseTimestamp(row.updated_at) ?? Date.now()
    return {
      sessionId: String(row.session_id ?? ''),
      balanceBrl: Number(row.balance_brl ?? 0),
      blockedAt,
      blockedReason: row.blocked_reason ? String(row.blocked_reason) : null,
      updatedAt
    }
  }

  private parseTimestamp(value: unknown): number | null {
    if (!value) {
      return null
    }
    if (value instanceof Date) {
      return value.getTime()
    }
    const parsed = Date.parse(String(value))
    return Number.isNaN(parsed) ? null : parsed
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
