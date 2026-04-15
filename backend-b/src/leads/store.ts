import type { Pool } from 'pg'
import type {
  LeadAutoFollowUpClaim,
  LeadCampaignMeta,
  LeadCampaignType,
  LeadInboundUpsert,
  LeadManualUpsert,
  LeadRecord,
  PostInteractionFeedbackCampaignMeta,
  LeadStatus,
  LeadUpdate
} from './types'

type LeadRow = {
  session_id: string
  lead_id: string
  name: string | null
  whatsapp: string | null
  chat_id: string | null
  ai_tag: string | null
  status: string
  last_contact_at: Date | string | null
  next_contact_at: Date | string | null
  observations: string | null
  created_at: Date | string | null
  last_message: string | null
  source: string | null
  updated_at: Date | string | null
  auto_followup_step: number | string | null
  auto_followup_claim_until: Date | string | null
  campaign_type: string | null
  campaign_target_session_id: string | null
  campaign_attempt: number | string | null
  campaign_meta: unknown
}

type LeadStoreOptions = {
  pool: Pool
  tableName?: string
}

export class LeadStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: LeadStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'leads'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        name TEXT,
        whatsapp TEXT,
        chat_id TEXT,
        ai_tag TEXT,
        status TEXT NOT NULL DEFAULT 'novo',
        last_contact_at TIMESTAMPTZ,
        next_contact_at TIMESTAMPTZ,
        observations TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_message TEXT,
        source TEXT,
        auto_followup_step INTEGER NOT NULL DEFAULT 0,
        auto_followup_claim_until TIMESTAMPTZ,
        campaign_type TEXT,
        campaign_target_session_id TEXT,
        campaign_attempt INTEGER NOT NULL DEFAULT 0,
        campaign_meta JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, lead_id)
      )`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS auto_followup_step INTEGER NOT NULL DEFAULT 0`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS auto_followup_claim_until TIMESTAMPTZ`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS campaign_type TEXT`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS campaign_target_session_id TEXT`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS campaign_attempt INTEGER NOT NULL DEFAULT 0`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS campaign_meta JSONB`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS ai_tag TEXT`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_last_contact_idx`)}
       ON ${table} (session_id, last_contact_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_status_idx`)}
       ON ${table} (session_id, status)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_next_contact_idx`)}
       ON ${table} (session_id, next_contact_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_chat_idx`)}
       ON ${table} (session_id, chat_id)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_whatsapp_idx`)}
       ON ${table} (session_id, whatsapp)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_next_contact_claim_idx`)}
       ON ${table} (session_id, next_contact_at, auto_followup_claim_until)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_campaign_due_idx`)}
       ON ${table} (session_id, campaign_type, next_contact_at)`
    )
  }

  async get(sessionId: string, leadId: string): Promise<LeadRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, updated_at,
              campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta
       FROM ${table}
       WHERE session_id = $1 AND lead_id = $2`,
      [sessionId, leadId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toLead(result.rows[0] as LeadRow)
  }

  async listBySession(sessionId: string, limit = 500): Promise<LeadRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(limit, 2000))
    const result = await this.pool.query(
      `SELECT session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, updated_at,
              campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta
       FROM ${table}
       WHERE session_id = $1
       ORDER BY COALESCE(last_contact_at, created_at) DESC, updated_at DESC
       LIMIT $2`,
      [sessionId, safeLimit]
    )
    return result.rows.map((row) => this.toLead(row as LeadRow))
  }

  async countBySession(sessionId: string): Promise<number> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM ${table}
       WHERE session_id = $1`,
      [sessionId]
    )
    return Number(result.rows[0]?.count ?? 0)
  }

  async searchBySession(sessionId: string, search: string, limit = 50): Promise<LeadRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(limit, 50))
    const { whereClause, values } = this.buildSearchWhereClause(sessionId, search)
    const limitPlaceholder = `$${values.length + 1}`
    const result = await this.pool.query(
      `SELECT session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, updated_at,
              campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta
       FROM ${table}
       ${whereClause}
       ORDER BY COALESCE(last_contact_at, created_at) DESC, updated_at DESC
       LIMIT ${limitPlaceholder}`,
      [...values, safeLimit]
    )
    return result.rows.map((row) => this.toLead(row as LeadRow))
  }

  async countSearchBySession(sessionId: string, search: string): Promise<number> {
    const table = this.quoteIdentifier(this.tableName)
    const { whereClause, values } = this.buildSearchWhereClause(sessionId, search)
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM ${table}
       ${whereClause}`,
      values
    )
    return Number(result.rows[0]?.count ?? 0)
  }

  async listByCampaignType(sessionId: string, campaignType: LeadCampaignType, limit = 10_000): Promise<LeadRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const normalizedCampaignType = normalizeLeadCampaignType(campaignType)
    if (!normalizedCampaignType) {
      return []
    }
    const safeLimit = Math.max(1, Math.min(limit, 50_000))
    const result = await this.pool.query(
      `SELECT session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, updated_at,
              campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta
       FROM ${table}
       WHERE session_id = $1
         AND campaign_type = $2
       ORDER BY COALESCE(updated_at, created_at) DESC, lead_id ASC
       LIMIT $3`,
      [sessionId, normalizedCampaignType, safeLimit]
    )
    return result.rows.map((row) => this.toLead(row as LeadRow))
  }

  async findByChatOrWhatsapp(
    sessionId: string,
    chatId: string | null,
    whatsapp: string | null
  ): Promise<LeadRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, updated_at,
              campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta
       FROM ${table}
       WHERE session_id = $1 AND (chat_id = $2 OR whatsapp = $3)
       LIMIT 1`,
      [sessionId, chatId, whatsapp]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toLead(result.rows[0] as LeadRow)
  }

  async upsertFromInbound(input: LeadInboundUpsert): Promise<LeadRecord> {
    const table = this.quoteIdentifier(this.tableName)
    const now = new Date(input.lastContactAtMs)
    const createdAt = new Date(input.createdAtMs)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, created_at,
        last_message, source, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'P. Passiva', 'novo', $6, $7, $8, $9, NOW())
      ON CONFLICT (session_id, lead_id)
      DO UPDATE SET last_contact_at = EXCLUDED.last_contact_at,
                    last_message = EXCLUDED.last_message,
                    updated_at = NOW(),
                    name = COALESCE(${table}.name, EXCLUDED.name),
                    whatsapp = COALESCE(EXCLUDED.whatsapp, ${table}.whatsapp),
                    chat_id = COALESCE(${table}.chat_id, EXCLUDED.chat_id),
                    ai_tag = COALESCE(${table}.ai_tag, EXCLUDED.ai_tag),
                    source = COALESCE(${table}.source, EXCLUDED.source)
      RETURNING session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
                observations, created_at, last_message, source, updated_at,
                campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta`,
      [
        input.sessionId,
        input.leadId,
        input.name,
        input.whatsapp,
        input.chatId,
        now,
        createdAt,
        input.lastMessage,
        input.source
      ]
    )
    return this.toLead(result.rows[0] as LeadRow)
  }

  async upsertFromClient(input: LeadManualUpsert): Promise<LeadRecord> {
    const table = this.quoteIdentifier(this.tableName)
    const status = input.status ?? 'novo'
    const lastContact = input.lastContactAtMs ? new Date(input.lastContactAtMs) : null
    const nextContact = input.nextContactAtMs ? new Date(input.nextContactAtMs) : null
    const createdAt = input.createdAtMs ? new Date(input.createdAtMs) : new Date()
    const aiTag =
      sanitizeLeadTag(input.aiTag) ?? (input.source === 'manual' || input.source === 'import' ? 'P. Ativa' : 'P. Passiva')
    const campaignType = normalizeLeadCampaignType(input.campaignType)
    const campaignTargetSessionId = sanitizeOptionalText(input.campaignTargetSessionId)
    const campaignAttempt = toSafeInteger(input.campaignAttempt)
    const campaignMeta = sanitizeLeadCampaignMeta(input.campaignMeta, campaignType)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        session_id, lead_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
        observations, created_at, last_message, source, ai_tag, campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      ON CONFLICT (session_id, lead_id)
      DO UPDATE SET last_contact_at = COALESCE(EXCLUDED.last_contact_at, ${table}.last_contact_at),
                    next_contact_at = COALESCE(${table}.next_contact_at, EXCLUDED.next_contact_at),
                    observations = COALESCE(${table}.observations, EXCLUDED.observations),
                    last_message = COALESCE(EXCLUDED.last_message, ${table}.last_message),
                    ai_tag = COALESCE(EXCLUDED.ai_tag, ${table}.ai_tag),
                    campaign_type = COALESCE(EXCLUDED.campaign_type, ${table}.campaign_type),
                    campaign_target_session_id = COALESCE(
                      EXCLUDED.campaign_target_session_id,
                      ${table}.campaign_target_session_id
                    ),
                    campaign_meta = COALESCE(EXCLUDED.campaign_meta, ${table}.campaign_meta),
                    campaign_attempt = CASE
                      WHEN ${table}.campaign_type IS NULL AND EXCLUDED.campaign_type IS NOT NULL
                        THEN EXCLUDED.campaign_attempt
                      WHEN ${table}.campaign_type = EXCLUDED.campaign_type
                        THEN GREATEST(${table}.campaign_attempt, EXCLUDED.campaign_attempt)
                      ELSE ${table}.campaign_attempt
                    END,
                    updated_at = NOW(),
                    name = COALESCE(${table}.name, EXCLUDED.name),
                    whatsapp = COALESCE(${table}.whatsapp, EXCLUDED.whatsapp),
                    chat_id = COALESCE(${table}.chat_id, EXCLUDED.chat_id),
                    source = COALESCE(${table}.source, EXCLUDED.source)
      RETURNING session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
                observations, created_at, last_message, source, updated_at,
                campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta`,
      [
        input.sessionId,
        input.leadId,
        input.name ?? null,
        input.whatsapp ?? null,
        input.chatId ?? null,
        status,
        lastContact,
        nextContact,
        input.observations ?? null,
        createdAt,
        input.lastMessage ?? null,
        input.source ?? null,
        aiTag,
        campaignType,
        campaignTargetSessionId,
        campaignAttempt,
        campaignMeta
      ]
    )
    return this.toLead(result.rows[0] as LeadRow)
  }

  async update(sessionId: string, leadId: string, update: LeadUpdate): Promise<LeadRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const fields: string[] = []
    const values: unknown[] = [sessionId, leadId]
    let index = 3

    if (Object.prototype.hasOwnProperty.call(update, 'name')) {
      fields.push(`name = $${index}`)
      values.push(update.name ?? null)
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'whatsapp')) {
      fields.push(`whatsapp = $${index}`)
      values.push(update.whatsapp ?? null)
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'chatId')) {
      fields.push(`chat_id = $${index}`)
      values.push(update.chatId ?? null)
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'aiTag')) {
      fields.push(`ai_tag = $${index}`)
      values.push(sanitizeLeadTag(update.aiTag))
      index += 1
    }

    if (update.status) {
      fields.push(`status = $${index}`)
      values.push(update.status)
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'nextContact')) {
      fields.push(`next_contact_at = $${index}`)
      values.push(update.nextContact ? new Date(update.nextContact) : null)
      index += 1
      fields.push('auto_followup_step = 0')
      fields.push('auto_followup_claim_until = NULL')
    }

    if (Object.prototype.hasOwnProperty.call(update, 'observations')) {
      fields.push(`observations = $${index}`)
      values.push(update.observations ?? null)
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'campaignType')) {
      fields.push(`campaign_type = $${index}`)
      values.push(normalizeLeadCampaignType(update.campaignType))
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'campaignTargetSessionId')) {
      fields.push(`campaign_target_session_id = $${index}`)
      values.push(sanitizeOptionalText(update.campaignTargetSessionId))
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'campaignAttempt')) {
      fields.push(`campaign_attempt = $${index}`)
      values.push(toSafeInteger(update.campaignAttempt))
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'campaignMeta')) {
      const campaignType = Object.prototype.hasOwnProperty.call(update, 'campaignType')
        ? normalizeLeadCampaignType(update.campaignType)
        : undefined
      fields.push(`campaign_meta = $${index}`)
      values.push(sanitizeLeadCampaignMeta(update.campaignMeta, campaignType))
      index += 1
    }

    if (fields.length === 0) {
      return this.get(sessionId, leadId)
    }

    const result = await this.pool.query(
      `UPDATE ${table}
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE session_id = $1 AND lead_id = $2
       RETURNING session_id, lead_id, name, whatsapp, chat_id, ai_tag, status, last_contact_at, next_contact_at,
                 observations, created_at, last_message, source, updated_at,
                 campaign_type, campaign_target_session_id, campaign_attempt, campaign_meta`,
      values
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toLead(result.rows[0] as LeadRow)
  }

  async claimDueForAutoFollowUp(
    sessionId: string,
    options: { dueBeforeMs: number; limit: number; leaseMs: number }
  ): Promise<LeadAutoFollowUpClaim[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(options.limit, 500))
    const safeLeaseMs = Math.max(5_000, Math.min(options.leaseMs, 30 * 60_000))
    const dueBeforeMs = Math.max(0, Math.floor(options.dueBeforeMs))

    const result = await this.pool.query(
      `WITH due AS (
         SELECT lead_id
         FROM ${table}
         WHERE session_id = $1
           AND next_contact_at IS NOT NULL
           AND next_contact_at <= to_timestamp($2 / 1000.0)
           AND status <> 'inativo'
           AND chat_id IS NOT NULL
           AND btrim(chat_id) <> ''
           AND (campaign_type IS NULL OR campaign_type = 'onboarding_activation')
           AND (
             auto_followup_claim_until IS NULL
             OR auto_followup_claim_until <= NOW()
           )
         ORDER BY next_contact_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE ${table} AS leads
       SET auto_followup_claim_until = NOW() + ($4::bigint * INTERVAL '1 millisecond'),
           updated_at = NOW()
       FROM due
       WHERE leads.session_id = $1
         AND leads.lead_id = due.lead_id
       RETURNING leads.session_id,
                 leads.lead_id,
                 leads.chat_id,
                 leads.status,
                 leads.next_contact_at,
                 leads.auto_followup_step,
                 leads.campaign_type,
                 leads.campaign_target_session_id,
                 leads.campaign_attempt,
                 leads.campaign_meta`,
      [sessionId, dueBeforeMs, safeLimit, safeLeaseMs]
    )

    return result.rows
      .map((row) => {
        const nextContactAt = toMs(row.next_contact_at)
        const chatId = typeof row.chat_id === 'string' ? row.chat_id.trim() : ''
        if (!nextContactAt || !chatId) {
          return null
        }
        return {
          sessionId: row.session_id,
          leadId: row.lead_id,
          chatId,
          status: normalizeLeadStatus(row.status),
          nextContactAt,
          autoFollowUpStep: toSafeInteger(row.auto_followup_step),
          campaignType: normalizeLeadCampaignType(row.campaign_type),
          campaignTargetSessionId: sanitizeOptionalText(row.campaign_target_session_id),
          campaignAttempt: toSafeInteger(row.campaign_attempt),
          campaignMeta: sanitizeLeadCampaignMeta(row.campaign_meta, normalizeLeadCampaignType(row.campaign_type))
        } satisfies LeadAutoFollowUpClaim
      })
      .filter((entry): entry is LeadAutoFollowUpClaim => entry !== null)
  }

  async claimDueByCampaignType(
    sessionId: string,
    campaignType: LeadCampaignType,
    options: { dueBeforeMs: number; limit: number; leaseMs: number }
  ): Promise<LeadAutoFollowUpClaim[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(options.limit, 500))
    const safeLeaseMs = Math.max(5_000, Math.min(options.leaseMs, 30 * 60_000))
    const dueBeforeMs = Math.max(0, Math.floor(options.dueBeforeMs))
    const normalizedCampaignType = normalizeLeadCampaignType(campaignType)
    if (!normalizedCampaignType) {
      return []
    }

    const result = await this.pool.query(
      `WITH due AS (
         SELECT lead_id
         FROM ${table}
         WHERE session_id = $1
           AND campaign_type = $2
           AND next_contact_at IS NOT NULL
           AND next_contact_at <= to_timestamp($3 / 1000.0)
           AND chat_id IS NOT NULL
           AND btrim(chat_id) <> ''
           AND (
             auto_followup_claim_until IS NULL
             OR auto_followup_claim_until <= NOW()
           )
         ORDER BY next_contact_at ASC
         LIMIT $4
         FOR UPDATE SKIP LOCKED
       )
       UPDATE ${table} AS leads
       SET auto_followup_claim_until = NOW() + ($5::bigint * INTERVAL '1 millisecond'),
           updated_at = NOW()
       FROM due
       WHERE leads.session_id = $1
         AND leads.lead_id = due.lead_id
       RETURNING leads.session_id,
                 leads.lead_id,
                 leads.chat_id,
                 leads.status,
                 leads.next_contact_at,
                 leads.auto_followup_step,
                 leads.campaign_type,
                 leads.campaign_target_session_id,
                 leads.campaign_attempt,
                 leads.campaign_meta`,
      [sessionId, normalizedCampaignType, dueBeforeMs, safeLimit, safeLeaseMs]
    )

    return result.rows
      .map((row) => {
        const nextContactAt = toMs(row.next_contact_at)
        const chatId = typeof row.chat_id === 'string' ? row.chat_id.trim() : ''
        if (!nextContactAt || !chatId) {
          return null
        }
        return {
          sessionId: row.session_id,
          leadId: row.lead_id,
          chatId,
          status: normalizeLeadStatus(row.status),
          nextContactAt,
          autoFollowUpStep: toSafeInteger(row.auto_followup_step),
          campaignType: normalizeLeadCampaignType(row.campaign_type),
          campaignTargetSessionId: sanitizeOptionalText(row.campaign_target_session_id),
          campaignAttempt: toSafeInteger(row.campaign_attempt),
          campaignMeta: sanitizeLeadCampaignMeta(row.campaign_meta, normalizeLeadCampaignType(row.campaign_type))
        } satisfies LeadAutoFollowUpClaim
      })
      .filter((entry): entry is LeadAutoFollowUpClaim => entry !== null)
  }

  async completeAutoFollowUpStep(
    sessionId: string,
    leadId: string,
    input: { nextStep: number; nextContactAt: number | null }
  ): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    const nextStep = Math.max(0, Math.floor(input.nextStep))
    await this.pool.query(
      `UPDATE ${table}
       SET auto_followup_step = $3,
           next_contact_at = $4,
           auto_followup_claim_until = NULL,
           updated_at = NOW()
       WHERE session_id = $1 AND lead_id = $2`,
      [sessionId, leadId, nextStep, input.nextContactAt ? new Date(input.nextContactAt) : null]
    )
  }

  async releaseAutoFollowUpClaim(
    sessionId: string,
    leadId: string,
    options?: { nextContactAt?: number | null }
  ): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    const hasNextContact = options && Object.prototype.hasOwnProperty.call(options, 'nextContactAt')

    if (hasNextContact) {
      await this.pool.query(
        `UPDATE ${table}
         SET next_contact_at = $3,
             auto_followup_claim_until = NULL,
             updated_at = NOW()
         WHERE session_id = $1 AND lead_id = $2`,
        [sessionId, leadId, options?.nextContactAt ? new Date(options.nextContactAt) : null]
      )
      return
    }

    await this.pool.query(
      `UPDATE ${table}
       SET auto_followup_claim_until = NULL,
           updated_at = NOW()
       WHERE session_id = $1 AND lead_id = $2`,
      [sessionId, leadId]
    )
  }

  async delete(sessionId: string, leadId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(`DELETE FROM ${table} WHERE session_id = $1 AND lead_id = $2`, [sessionId, leadId])
  }

  private buildSearchWhereClause(sessionId: string, search: string): {
    whereClause: string
    values: Array<string | number>
  } {
    const normalizedSearch = search.trim().toLowerCase()
    const digitsSearch = search.replace(/\D/g, '')
    const values: Array<string | number> = [sessionId]
    const conditions: string[] = []
    let parameterIndex = 2

    if (normalizedSearch) {
      conditions.push(`LOWER(COALESCE(name, '')) LIKE $${parameterIndex}`)
      values.push(`%${normalizedSearch}%`)
      parameterIndex += 1
    }

    if (digitsSearch) {
      conditions.push(`regexp_replace(COALESCE(whatsapp, ''), '\\D', '', 'g') LIKE $${parameterIndex}`)
      values.push(`%${digitsSearch}%`)
      parameterIndex += 1
    }

    if (conditions.length === 0) {
      return {
        whereClause: 'WHERE session_id = $1 AND FALSE',
        values
      }
    }

    return {
      whereClause: `WHERE session_id = $1 AND (${conditions.join(' OR ')})`,
      values
    }
  }

  private toLead(row: LeadRow): LeadRecord {
    return {
      id: row.lead_id,
      sessionId: row.session_id,
      name: row.name ?? null,
      whatsapp: row.whatsapp ?? null,
      chatId: row.chat_id ?? null,
      aiTag: sanitizeLeadTag(row.ai_tag) ?? 'P. Passiva',
      status: normalizeLeadStatus(row.status),
      lastContact: toMs(row.last_contact_at),
      nextContact: toMs(row.next_contact_at),
      observations: row.observations ?? null,
      createdAt: toMs(row.created_at),
      lastMessage: row.last_message ?? null,
      source: row.source ?? null,
      updatedAt: toMs(row.updated_at),
      campaign: toLeadCampaignState(row)
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeLeadStatus(value: unknown): LeadStatus {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  // Backwards-compatible aliases.
  if (normalized === 'em_atendimento') return 'em_processo'
  if (normalized === 'finalizado') return 'inativo'

  if (normalized === 'novo') return 'novo'
  if (normalized === 'inativo') return 'inativo'
  if (normalized === 'aguardando') return 'aguardando'
  if (normalized === 'em_processo') return 'em_processo'
  if (normalized === 'cliente') return 'cliente'

  return 'novo'
}

function toSafeInteger(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    return 0
  }
  return num
}

function normalizeLeadCampaignType(value: unknown): LeadCampaignType | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return null
  }
  if (normalized === 'onboarding_activation') {
    return 'onboarding_activation'
  }
  if (normalized === 'post_interaction_feedback') {
    return 'post_interaction_feedback'
  }
  return null
}

function sanitizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function sanitizeLeadTag(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const canonical = normalizeLeadTag(trimmed)
  return canonical ?? null
}

function normalizeLeadTag(value: string): 'P. Ativa' | 'P. Passiva' | null {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (
    normalized === 'p passiva' ||
    normalized.includes('passiva')
  ) {
    return 'P. Passiva'
  }

  if (
    normalized === 'p ativa' ||
    normalized.includes('ativa')
  ) {
    return 'P. Ativa'
  }

  return null
}

function toLeadCampaignState(row: LeadRow): LeadRecord['campaign'] {
  const type = normalizeLeadCampaignType(row.campaign_type)
  const targetSessionId = sanitizeOptionalText(row.campaign_target_session_id)
  if (!type) {
    return null
  }
  const meta = sanitizeLeadCampaignMeta(row.campaign_meta, type)
  if (!targetSessionId && type !== 'post_interaction_feedback') {
    return null
  }
  return {
    type,
    targetSessionId: targetSessionId ?? '',
    attempt: toSafeInteger(row.campaign_attempt),
    ...(meta ? { meta } : {})
  }
}

function sanitizeLeadCampaignMeta(value: unknown, campaignType?: LeadCampaignType | null): LeadCampaignMeta {
  const type = campaignType ?? normalizeLeadCampaignType((value as { type?: unknown } | null | undefined)?.type)
  if (!type || !value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  if (type !== 'post_interaction_feedback') {
    return null
  }

  const source = value as Record<string, unknown>
  const sourceSessionId = sanitizeOptionalText(source.sourceSessionId)
  const sourceChatId = sanitizeOptionalText(source.sourceChatId)
  const sourceCompanyName = sanitizeOptionalText(source.sourceCompanyName)
  const sourceSystem = sanitizeFeedbackSourceSystem(source.sourceSystem)
  const qualificationKey = sanitizeOptionalText(source.qualificationKey)
  const stage = sanitizeFeedbackStage(source.stage)
  if (!sourceSessionId || !sourceChatId || !sourceCompanyName || !sourceSystem || !qualificationKey || !stage) {
    return null
  }

  return {
    sourceSessionId,
    sourceChatId,
    sourceCompanyName,
    sourceSystem,
    qualificationKey,
    whatsapp: sanitizeOptionalText(source.whatsapp),
    qualifiedAtMs: toSafeNullableTimestamp(source.qualifiedAtMs) ?? 0,
    userMessageCount: toSafeInteger(source.userMessageCount),
    aiReplyCount: toSafeInteger(source.aiReplyCount),
    stage,
    score: toSafeNullableScore(source.score),
    comment: sanitizeOptionalText(source.comment),
    scorePromptAttempts: toSafeInteger(source.scorePromptAttempts),
    commentPromptAttempts: toSafeInteger(source.commentPromptAttempts),
    lastPromptAtMs: toSafeNullableTimestamp(source.lastPromptAtMs),
    initialSentAtMs: toSafeNullableTimestamp(source.initialSentAtMs),
    completedAtMs: toSafeNullableTimestamp(source.completedAtMs)
  } satisfies PostInteractionFeedbackCampaignMeta
}

function sanitizeFeedbackSourceSystem(value: unknown): PostInteractionFeedbackCampaignMeta['sourceSystem'] | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'autowhats' || normalized === 'dancing') {
    return normalized
  }
  return null
}

function sanitizeFeedbackStage(value: unknown): PostInteractionFeedbackCampaignMeta['stage'] | null {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'awaiting_score' ||
    normalized === 'awaiting_comment' ||
    normalized === 'completed_positive' ||
    normalized === 'completed_negative' ||
    normalized === 'opted_out'
  ) {
    return normalized
  }
  return null
}

function toSafeNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return Math.floor(parsed)
}

function toSafeNullableScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) {
    return null
  }
  const rounded = Math.round(parsed)
  if (rounded < 1 || rounded > 10) {
    return null
  }
  return rounded
}
