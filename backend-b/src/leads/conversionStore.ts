import type { Pool } from 'pg'

export type LeadConversionSource = 'manual' | 'ai_auto' | 'unknown'

export type LeadConversionCohortSummary = {
  fromMs: number
  toMs: number
  leadsCreated: number
  convertedLeads: number
  aiAssistedConvertedLeads: number
  conversionRate: number
  aiAssistedRate: number
}

export type RecordLeadToClientConversionInput = {
  sessionId: string
  leadId: string
  clientId: string
  chatId?: string | null
  whatsapp?: string | null
  leadCreatedAtMs: number
  leadUpdatedAtMs: number
  convertedAtMs?: number
  conversionSource: LeadConversionSource
}

export function computeAiAssisted(source: LeadConversionSource, aiOutboundCount: number): boolean {
  if (source === 'ai_auto') {
    return true
  }
  return aiOutboundCount > 0
}

type LeadConversionStoreOptions = {
  pool: Pool
  tableName?: string
  leadsTableName?: string
  outboundMessagesTableName?: string
}

export class LeadConversionStore {
  private readonly pool: Pool
  private readonly tableName: string
  private readonly leadsTableName: string
  private readonly outboundMessagesTableName: string

  constructor(options: LeadConversionStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'lead_conversions'
    this.leadsTableName = options.leadsTableName ?? 'leads'
    this.outboundMessagesTableName = options.outboundMessagesTableName ?? 'outbound_messages'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        chat_id TEXT,
        whatsapp TEXT,
        lead_created_at TIMESTAMPTZ NOT NULL,
        lead_updated_at TIMESTAMPTZ NOT NULL,
        conversion_source TEXT NOT NULL,
        ai_outbound_count INT NOT NULL DEFAULT 0,
        first_ai_outbound_at TIMESTAMPTZ,
        last_ai_outbound_at TIMESTAMPTZ,
        ai_assisted BOOLEAN NOT NULL DEFAULT FALSE,
        converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_lead_updated_uidx`)}
       ON ${table} (session_id, lead_id, lead_updated_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_converted_idx`)}
       ON ${table} (session_id, converted_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_created_idx`)}
       ON ${table} (session_id, lead_created_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_ai_assisted_idx`)}
       ON ${table} (session_id, ai_assisted, converted_at DESC)`
    )
  }

  async recordLeadToClientConversion(input: RecordLeadToClientConversionInput): Promise<void> {
    const sessionId = input.sessionId.trim()
    const leadId = input.leadId.trim()
    const clientId = input.clientId.trim()
    const chatId = (input.chatId ?? leadId).trim()
    const whatsapp = input.whatsapp?.trim() ? input.whatsapp.trim() : null

    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!leadId) {
      throw new Error('leadId is required')
    }
    if (!clientId) {
      throw new Error('clientId is required')
    }
    if (!chatId) {
      throw new Error('chatId is required')
    }
    if (!Number.isFinite(input.leadCreatedAtMs)) {
      throw new Error('leadCreatedAtMs is required')
    }
    if (!Number.isFinite(input.leadUpdatedAtMs)) {
      throw new Error('leadUpdatedAtMs is required')
    }

    const now = Date.now()
    const convertedAtMs = Number.isFinite(input.convertedAtMs ?? NaN) ? Number(input.convertedAtMs) : now
    const fromMs = Math.min(input.leadCreatedAtMs, convertedAtMs)
    const toMs = Math.max(input.leadCreatedAtMs, convertedAtMs)

    const outboundTable = this.quoteIdentifier(this.outboundMessagesTableName)
    const outboundStats = await this.pool.query(
      `SELECT
         COUNT(*)::int AS count,
         MIN(created_at) AS first_at,
         MAX(created_at) AS last_at
       FROM ${outboundTable}
       WHERE session_id = $1
         AND chat_id = $2
         AND (payload->>'origin') = 'ai'
         AND created_at >= to_timestamp($3 / 1000.0)
         AND created_at <= to_timestamp($4 / 1000.0)`,
      [sessionId, chatId, fromMs, toMs]
    )

    const row = outboundStats.rows[0] ?? {}
    const aiOutboundCount = Number(row.count ?? 0)
    const firstAiOutboundAt = row.first_at instanceof Date ? row.first_at : row.first_at ? new Date(row.first_at) : null
    const lastAiOutboundAt = row.last_at instanceof Date ? row.last_at : row.last_at ? new Date(row.last_at) : null
    const aiAssisted = computeAiAssisted(input.conversionSource, aiOutboundCount)

    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        lead_id,
        client_id,
        chat_id,
        whatsapp,
        lead_created_at,
        lead_updated_at,
        conversion_source,
        ai_outbound_count,
        first_ai_outbound_at,
        last_ai_outbound_at,
        ai_assisted,
        converted_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        to_timestamp($6 / 1000.0),
        to_timestamp($7 / 1000.0),
        $8, $9, $10, $11, $12,
        to_timestamp($13 / 1000.0)
      )
      ON CONFLICT (session_id, lead_id, lead_updated_at) DO NOTHING`,
      [
        sessionId,
        leadId,
        clientId,
        chatId,
        whatsapp,
        input.leadCreatedAtMs,
        input.leadUpdatedAtMs,
        input.conversionSource,
        aiOutboundCount,
        firstAiOutboundAt,
        lastAiOutboundAt,
        aiAssisted,
        convertedAtMs
      ]
    )
  }

  async getCohortSummary(sessionId: string, fromMs: number, toMs: number): Promise<LeadConversionCohortSummary> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!Number.isFinite(fromMs)) {
      throw new Error('fromMs is required')
    }
    if (!Number.isFinite(toMs)) {
      throw new Error('toMs is required')
    }

    const from = Math.min(fromMs, toMs)
    const to = Math.max(fromMs, toMs)
    const conversionsTable = this.quoteIdentifier(this.tableName)
    const leadsTable = this.quoteIdentifier(this.leadsTableName)

    const [createdResult, convertedResult, aiAssistedResult] = await Promise.all([
      this.pool.query(
        `WITH created AS (
           SELECT lead_id
           FROM ${leadsTable}
           WHERE session_id = $1
             AND created_at >= to_timestamp($2 / 1000.0)
             AND created_at <= to_timestamp($3 / 1000.0)
           UNION
           SELECT lead_id
           FROM ${conversionsTable}
           WHERE session_id = $1
             AND lead_created_at >= to_timestamp($2 / 1000.0)
             AND lead_created_at <= to_timestamp($3 / 1000.0)
         )
         SELECT COUNT(*)::int AS count FROM created`,
        [safeSessionId, from, to]
      ),
      this.pool.query(
        `SELECT COUNT(DISTINCT lead_id)::int AS count
         FROM ${conversionsTable}
         WHERE session_id = $1
           AND lead_created_at >= to_timestamp($2 / 1000.0)
           AND lead_created_at <= to_timestamp($3 / 1000.0)
           AND converted_at <= to_timestamp($3 / 1000.0)`,
        [safeSessionId, from, to]
      ),
      this.pool.query(
        `SELECT COUNT(DISTINCT lead_id)::int AS count
         FROM ${conversionsTable}
         WHERE session_id = $1
           AND lead_created_at >= to_timestamp($2 / 1000.0)
           AND lead_created_at <= to_timestamp($3 / 1000.0)
           AND converted_at <= to_timestamp($3 / 1000.0)
           AND ai_assisted = TRUE`,
        [safeSessionId, from, to]
      )
    ])

    const leadsCreated = Number(createdResult.rows[0]?.count ?? 0)
    const convertedLeads = Number(convertedResult.rows[0]?.count ?? 0)
    const aiAssistedConvertedLeads = Number(aiAssistedResult.rows[0]?.count ?? 0)
    const conversionRate = leadsCreated > 0 ? convertedLeads / leadsCreated : 0
    const aiAssistedRate = convertedLeads > 0 ? aiAssistedConvertedLeads / convertedLeads : 0

    return {
      fromMs: from,
      toMs: to,
      leadsCreated,
      convertedLeads,
      aiAssistedConvertedLeads,
      conversionRate,
      aiAssistedRate
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
