import type { Pool } from 'pg'

export type AiFieldSuggestionTargetType = 'lead' | 'client'

export type AiFieldSuggestionStatus = 'pending' | 'accepted' | 'rejected'

export type AiSuggestionDecisionSource = 'manual' | 'automatic'

export type AiSuggestionDecisionActorRole = 'admin' | 'user' | 'system'

export type AiFieldSuggestionBase = {
  name?: string | null
  whatsapp?: string | null
  status?: string | null
  observations?: string | null
  nextContactAt?: number | null
  updatedAt?: number | null
}

export type AiFieldSuggestionPatch = {
  status?: string
  observations?: string | null
  nextContactAt?: number | null
}

export type AiFieldSuggestionDecision = {
  source?: AiSuggestionDecisionSource | null
  actorRole?: AiSuggestionDecisionActorRole | null
  actorUid?: string | null
}

export type AiFieldSuggestionRecord = {
  id: number
  sessionId: string
  chatId: string
  targetType: AiFieldSuggestionTargetType
  targetId: string
  inboundId: number | null
  provider: string
  model: string
  status: AiFieldSuggestionStatus
  base: AiFieldSuggestionBase
  patch: AiFieldSuggestionPatch
  reason: string | null
  appliedPatch: AiFieldSuggestionPatch | null
  createdAt: number | null
  updatedAt: number | null
  decidedAt: number | null
  appliedAt: number | null
  decisionSource: AiSuggestionDecisionSource | null
  decisionActorRole: AiSuggestionDecisionActorRole | null
  decisionActorUid: string | null
}

type SuggestionRow = {
  id: number | string
  session_id: string
  chat_id: string
  target_type: string
  target_id: string
  inbound_id: number | string | null
  provider: string
  model: string
  status: string
  base: unknown
  patch: unknown
  reason: string | null
  applied_patch: unknown | null
  created_at: Date | string | null
  updated_at: Date | string | null
  decided_at: Date | string | null
  applied_at: Date | string | null
  decision_source: string | null
  decision_actor_role: string | null
  decision_actor_uid: string | null
}

type AiFieldSuggestionStoreOptions = {
  pool: Pool
  tableName?: string
}

export class AiFieldSuggestionStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: AiFieldSuggestionStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'ai_field_suggestions'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        inbound_id BIGINT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        base JSONB NOT NULL,
        patch JSONB NOT NULL,
        reason TEXT,
        applied_patch JSONB,
        decided_at TIMESTAMPTZ,
        applied_at TIMESTAMPTZ,
        decision_source TEXT,
        decision_actor_role TEXT,
        decision_actor_uid TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )
    await this.pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS decision_source TEXT`)
    await this.pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS decision_actor_role TEXT`)
    await this.pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS decision_actor_uid TEXT`)

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_status_updated_idx`)}
       ON ${table} (session_id, status, updated_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_target_updated_idx`)}
       ON ${table} (session_id, target_type, updated_at DESC)`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_pending_unique_idx`)}
       ON ${table} (session_id, chat_id, target_type)
       WHERE status = 'pending'`
    )
  }

  async get(sessionId: string, suggestionId: number): Promise<AiFieldSuggestionRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT id, session_id, chat_id, target_type, target_id, inbound_id, provider, model, status,
              base, patch, reason, applied_patch, created_at, updated_at, decided_at, applied_at,
              decision_source, decision_actor_role, decision_actor_uid
       FROM ${table}
       WHERE session_id = $1 AND id = $2`,
      [sessionId, suggestionId]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.toSuggestion(result.rows[0] as SuggestionRow)
  }

  async listBySession(
    sessionId: string,
    filters: { targetType?: AiFieldSuggestionTargetType; status?: AiFieldSuggestionStatus; limit?: number } = {}
  ): Promise<AiFieldSuggestionRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(filters.limit ?? 100, 500))

    const conditions: string[] = ['session_id = $1']
    const values: unknown[] = [sessionId]
    let index = 2

    if (filters.targetType) {
      conditions.push(`target_type = $${index}`)
      values.push(filters.targetType)
      index += 1
    }

    if (filters.status) {
      conditions.push(`status = $${index}`)
      values.push(filters.status)
      index += 1
    }

    values.push(safeLimit)

    const result = await this.pool.query(
      `SELECT id, session_id, chat_id, target_type, target_id, inbound_id, provider, model, status,
              base, patch, reason, applied_patch, created_at, updated_at, decided_at, applied_at,
              decision_source, decision_actor_role, decision_actor_uid
       FROM ${table}
       WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT $${index}`,
      values
    )

    return result.rows.map((row) => this.toSuggestion(row as SuggestionRow))
  }

  async upsertPending(input: {
    sessionId: string
    chatId: string
    targetType: AiFieldSuggestionTargetType
    targetId: string
    inboundId?: number | null
    provider: string
    model: string
    base: AiFieldSuggestionBase
    patch: AiFieldSuggestionPatch
    reason?: string | null
  }): Promise<AiFieldSuggestionRecord> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
         session_id,
         chat_id,
         target_type,
         target_id,
         inbound_id,
         provider,
         model,
         status,
         base,
         patch,
         reason,
         applied_patch,
         decided_at,
         applied_at,
         decision_source,
         decision_actor_role,
         decision_actor_uid,
         created_at,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         'pending',
         $8, $9, $10,
         NULL,
         NULL,
         NULL,
         NULL,
         NULL,
         NULL,
         NOW(),
         NOW()
       )
       ON CONFLICT (session_id, chat_id, target_type) WHERE status = 'pending'
       DO UPDATE SET target_id = EXCLUDED.target_id,
                     inbound_id = EXCLUDED.inbound_id,
                     provider = EXCLUDED.provider,
                     model = EXCLUDED.model,
                     base = EXCLUDED.base,
                     patch = EXCLUDED.patch,
                     reason = EXCLUDED.reason,
                     status = 'pending',
                     applied_patch = NULL,
                     decided_at = NULL,
                     applied_at = NULL,
                     decision_source = NULL,
                     decision_actor_role = NULL,
                     decision_actor_uid = NULL,
                     created_at = NOW(),
                     updated_at = NOW()
       RETURNING id, session_id, chat_id, target_type, target_id, inbound_id, provider, model, status,
                 base, patch, reason, applied_patch, created_at, updated_at, decided_at, applied_at,
                 decision_source, decision_actor_role, decision_actor_uid`,
      [
        input.sessionId,
        input.chatId,
        input.targetType,
        input.targetId,
        input.inboundId ?? null,
        input.provider,
        input.model,
        input.base,
        input.patch,
        input.reason ?? null
      ]
    )

    return this.toSuggestion(result.rows[0] as SuggestionRow)
  }

  async markAccepted(
    sessionId: string,
    suggestionId: number,
    appliedPatch: AiFieldSuggestionPatch,
    decision: AiFieldSuggestionDecision = {}
  ): Promise<AiFieldSuggestionRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `UPDATE ${table}
       SET status = 'accepted',
           applied_patch = $3,
           decided_at = NOW(),
           applied_at = NOW(),
           decision_source = $4,
           decision_actor_role = $5,
           decision_actor_uid = $6,
           updated_at = NOW()
       WHERE session_id = $1 AND id = $2 AND status = 'pending'
       RETURNING id, session_id, chat_id, target_type, target_id, inbound_id, provider, model, status,
                 base, patch, reason, applied_patch, created_at, updated_at, decided_at, applied_at,
                 decision_source, decision_actor_role, decision_actor_uid`,
      [
        sessionId,
        suggestionId,
        appliedPatch,
        decision.source ?? null,
        decision.actorRole ?? null,
        decision.actorUid ?? null
      ]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.toSuggestion(result.rows[0] as SuggestionRow)
  }

  async markRejected(
    sessionId: string,
    suggestionId: number,
    decision: AiFieldSuggestionDecision = {}
  ): Promise<AiFieldSuggestionRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `UPDATE ${table}
       SET status = 'rejected',
           decided_at = NOW(),
           applied_at = NULL,
           applied_patch = NULL,
           decision_source = $3,
           decision_actor_role = $4,
           decision_actor_uid = $5,
           updated_at = NOW()
       WHERE session_id = $1 AND id = $2 AND status = 'pending'
       RETURNING id, session_id, chat_id, target_type, target_id, inbound_id, provider, model, status,
                 base, patch, reason, applied_patch, created_at, updated_at, decided_at, applied_at,
                 decision_source, decision_actor_role, decision_actor_uid`,
      [sessionId, suggestionId, decision.source ?? null, decision.actorRole ?? null, decision.actorUid ?? null]
    )

    if (result.rowCount === 0) {
      return null
    }

    return this.toSuggestion(result.rows[0] as SuggestionRow)
  }

  private toSuggestion(row: SuggestionRow): AiFieldSuggestionRecord {
    return {
      id: toNumber(row.id) ?? 0,
      sessionId: row.session_id,
      chatId: row.chat_id,
      targetType: row.target_type as AiFieldSuggestionTargetType,
      targetId: row.target_id,
      inboundId: row.inbound_id !== null ? toNumber(row.inbound_id) ?? null : null,
      provider: row.provider,
      model: row.model,
      status: row.status as AiFieldSuggestionStatus,
      base: (isRecord(row.base) ? (row.base as AiFieldSuggestionBase) : {}) as AiFieldSuggestionBase,
      patch: (isRecord(row.patch) ? (row.patch as AiFieldSuggestionPatch) : {}) as AiFieldSuggestionPatch,
      reason: row.reason ?? null,
      appliedPatch: isRecord(row.applied_patch) ? (row.applied_patch as AiFieldSuggestionPatch) : null,
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at),
      decidedAt: toMs(row.decided_at),
      appliedAt: toMs(row.applied_at),
      decisionSource: normalizeDecisionSource(row.decision_source),
      decisionActorRole: normalizeDecisionActorRole(row.decision_actor_role),
      decisionActorUid: row.decision_actor_uid ?? null
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function normalizeDecisionSource(value: unknown): AiSuggestionDecisionSource | null {
  if (value === 'manual' || value === 'automatic') {
    return value
  }
  return null
}

function normalizeDecisionActorRole(value: unknown): AiSuggestionDecisionActorRole | null {
  if (value === 'admin' || value === 'user' || value === 'system') {
    return value
  }
  return null
}
