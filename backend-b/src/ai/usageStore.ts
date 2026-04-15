import type { Pool } from 'pg'

export type AiUsageOperation =
  | 'response'
  | 'handoff'
  | 'classify'
  | 'suggest'
  | 'transcribe'
  | 'understand_media'
  | 'training_copilot'

export type AiUsageRecord = {
  sessionId: string
  chatId: string
  inboundId?: number | null
  provider: string
  model: string
  operation: AiUsageOperation
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  usdBrlRate: number
  costBrl: number
  pricingMissing: boolean
}

export type AiUsageTotals = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  costBrl: number
  records: number
}

export type AiUsageSummary = {
  totals: AiUsageTotals
  responses: {
    count: number
    totalTokens: number
    costUsd: number
    costBrl: number
  }
  pricingMissingCount: number
}

export type AiUsageSeriesEntry = {
  day: string
  costUsd: number
  costBrl: number
  totalTokens: number
  responses: number
}

export type AiUsageModelBreakdown = {
  provider: string
  model: string
  category?: 'ai' | 'broadcast'
  costUsd: number
  costBrl: number
  totalTokens: number
  responses: number
}

type AiUsageStoreOptions = {
  pool: Pool
  tableName?: string
}

export class AiUsageStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: AiUsageStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'ai_usage'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        inbound_id BIGINT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd NUMERIC(14, 6) NOT NULL,
        usd_brl_rate NUMERIC(14, 6) NOT NULL,
        cost_brl NUMERIC(14, 6) NOT NULL,
        pricing_missing BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_created_idx`)}
       ON ${table} (session_id, created_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_operation_idx`)}
       ON ${table} (session_id, operation)`
    )
  }

  async record(entry: AiUsageRecord): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        chat_id,
        inbound_id,
        provider,
        model,
        operation,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cost_usd,
        usd_brl_rate,
        cost_brl,
        pricing_missing,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13,
        NOW()
      )`,
      [
        entry.sessionId,
        entry.chatId,
        entry.inboundId ?? null,
        entry.provider,
        entry.model,
        entry.operation,
        entry.promptTokens,
        entry.completionTokens,
        entry.totalTokens,
        entry.costUsd,
        entry.usdBrlRate,
        entry.costBrl,
        entry.pricingMissing
      ]
    )
  }

  async getSummary(sessionId: string, fromMs: number, toMs: number): Promise<AiUsageSummary> {
    const table = this.quoteIdentifier(this.tableName)
    const [totalsResult, responsesResult] = await Promise.all([
      this.pool.query(
        `SELECT
           COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
           COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
           COALESCE(SUM(cost_usd), 0)::float AS cost_usd,
           COALESCE(SUM(cost_brl), 0)::float AS cost_brl,
           COUNT(*)::int AS records,
           COALESCE(SUM(CASE WHEN pricing_missing THEN 1 ELSE 0 END), 0)::int AS pricing_missing
         FROM ${table}
         WHERE session_id = $1
           AND created_at >= to_timestamp($2 / 1000.0)
           AND created_at <= to_timestamp($3 / 1000.0)`,
        [sessionId, fromMs, toMs]
      ),
      this.pool.query(
        `SELECT
           COUNT(*)::int AS count,
           COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
           COALESCE(SUM(cost_usd), 0)::float AS cost_usd,
           COALESCE(SUM(cost_brl), 0)::float AS cost_brl
         FROM ${table}
         WHERE session_id = $1
           AND operation = 'response'
           AND created_at >= to_timestamp($2 / 1000.0)
           AND created_at <= to_timestamp($3 / 1000.0)`,
        [sessionId, fromMs, toMs]
      )
    ])

    const totalsRow = totalsResult.rows[0] ?? {}
    const responsesRow = responsesResult.rows[0] ?? {}

    return {
      totals: {
        promptTokens: Number(totalsRow.prompt_tokens ?? 0),
        completionTokens: Number(totalsRow.completion_tokens ?? 0),
        totalTokens: Number(totalsRow.total_tokens ?? 0),
        costUsd: Number(totalsRow.cost_usd ?? 0),
        costBrl: Number(totalsRow.cost_brl ?? 0),
        records: Number(totalsRow.records ?? 0)
      },
      responses: {
        count: Number(responsesRow.count ?? 0),
        totalTokens: Number(responsesRow.total_tokens ?? 0),
        costUsd: Number(responsesRow.cost_usd ?? 0),
        costBrl: Number(responsesRow.cost_brl ?? 0)
      },
      pricingMissingCount: Number(totalsRow.pricing_missing ?? 0)
    }
  }

  async getDailySeries(
    sessionId: string,
    fromMs: number,
    toMs: number,
    timezone = 'America/Sao_Paulo'
  ): Promise<AiUsageSeriesEntry[]> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT
         date_trunc('day', created_at AT TIME ZONE $4) AS day_local,
         COALESCE(SUM(cost_usd), 0)::float AS cost_usd,
         COALESCE(SUM(cost_brl), 0)::float AS cost_brl,
         COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
         COALESCE(SUM(CASE WHEN operation = 'response' THEN 1 ELSE 0 END), 0)::int AS responses
       FROM ${table}
       WHERE session_id = $1
         AND created_at >= to_timestamp($2 / 1000.0)
         AND created_at <= to_timestamp($3 / 1000.0)
       GROUP BY day_local
       ORDER BY day_local ASC`,
      [sessionId, fromMs, toMs, timezone]
    )

    return result.rows.map((row) => ({
      day: row.day_local instanceof Date ? row.day_local.toISOString().slice(0, 10) : String(row.day_local).slice(0, 10),
      costUsd: Number(row.cost_usd ?? 0),
      costBrl: Number(row.cost_brl ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      responses: Number(row.responses ?? 0)
    }))
  }

  async getModelBreakdown(sessionId: string, fromMs: number, toMs: number): Promise<AiUsageModelBreakdown[]> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT
         provider,
         model,
         COALESCE(SUM(cost_usd), 0)::float AS cost_usd,
         COALESCE(SUM(cost_brl), 0)::float AS cost_brl,
         COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
         COALESCE(SUM(CASE WHEN operation = 'response' THEN 1 ELSE 0 END), 0)::int AS responses
       FROM ${table}
       WHERE session_id = $1
         AND created_at >= to_timestamp($2 / 1000.0)
         AND created_at <= to_timestamp($3 / 1000.0)
       GROUP BY provider, model
       ORDER BY cost_brl DESC, total_tokens DESC`,
      [sessionId, fromMs, toMs]
    )

    return result.rows.map((row) => ({
      provider: String(row.provider ?? ''),
      model: String(row.model ?? ''),
      category: 'ai' as const,
      costUsd: Number(row.cost_usd ?? 0),
      costBrl: Number(row.cost_brl ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      responses: Number(row.responses ?? 0)
    }))
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
