import type { Pool } from 'pg'
import type {
  ClientAutoFollowUpClaim,
  ClientCreate,
  ClientRecord,
  ClientStatus,
  ClientUpdate
} from './types'

type ClientRow = {
  session_id: string
  client_id: string
  name: string | null
  whatsapp: string | null
  chat_id: string | null
  status: ClientStatus
  last_contact_at: Date | string | null
  next_contact_at: Date | string | null
  observations: string | null
  created_at: Date | string | null
  last_message: string | null
  source: string | null
  total_value: number | string | null
  last_purchase_at: Date | string | null
  updated_at: Date | string | null
  auto_followup_step: number | string | null
  auto_followup_claim_until: Date | string | null
}

type ClientStoreOptions = {
  pool: Pool
  tableName?: string
}

export class ClientStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: ClientStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'clients'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        name TEXT,
        whatsapp TEXT,
        chat_id TEXT,
        status TEXT NOT NULL DEFAULT 'ativo',
        last_contact_at TIMESTAMPTZ,
        next_contact_at TIMESTAMPTZ,
        observations TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_message TEXT,
        source TEXT,
        total_value NUMERIC,
        last_purchase_at TIMESTAMPTZ,
        auto_followup_step INTEGER NOT NULL DEFAULT 0,
        auto_followup_claim_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, client_id)
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
  }

  async findByChatOrWhatsapp(
    sessionId: string,
    chatId: string | null,
    whatsapp: string | null
  ): Promise<ClientRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, total_value, last_purchase_at, updated_at
       FROM ${table}
       WHERE session_id = $1 AND (chat_id = $2 OR whatsapp = $3)
       LIMIT 1`,
      [sessionId, chatId, whatsapp]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toClient(result.rows[0] as ClientRow)
  }

  async get(sessionId: string, clientId: string): Promise<ClientRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, total_value, last_purchase_at, updated_at
       FROM ${table}
       WHERE session_id = $1 AND client_id = $2`,
      [sessionId, clientId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toClient(result.rows[0] as ClientRow)
  }

  async listBySession(sessionId: string, limit = 500): Promise<ClientRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(limit, 2000))
    const result = await this.pool.query(
      `SELECT session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, total_value, last_purchase_at, updated_at
       FROM ${table}
       WHERE session_id = $1
       ORDER BY COALESCE(last_contact_at, created_at) DESC, updated_at DESC
       LIMIT $2`,
      [sessionId, safeLimit]
    )
    return result.rows.map((row) => this.toClient(row as ClientRow))
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

  async searchBySession(sessionId: string, search: string, limit = 50): Promise<ClientRecord[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(limit, 50))
    const { whereClause, values } = this.buildSearchWhereClause(sessionId, search)
    const limitPlaceholder = `$${values.length + 1}`
    const result = await this.pool.query(
      `SELECT session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
              observations, created_at, last_message, source, total_value, last_purchase_at, updated_at
       FROM ${table}
       ${whereClause}
       ORDER BY COALESCE(last_contact_at, created_at) DESC, updated_at DESC
       LIMIT ${limitPlaceholder}`,
      [...values, safeLimit]
    )
    return result.rows.map((row) => this.toClient(row as ClientRow))
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

  async create(input: ClientCreate): Promise<ClientRecord> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
        observations, created_at, last_message, source, total_value, last_purchase_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (session_id, client_id)
      DO UPDATE SET name = EXCLUDED.name,
                    whatsapp = EXCLUDED.whatsapp,
                    chat_id = EXCLUDED.chat_id,
                    status = EXCLUDED.status,
                    last_contact_at = EXCLUDED.last_contact_at,
                    next_contact_at = EXCLUDED.next_contact_at,
                    observations = EXCLUDED.observations,
                    created_at = COALESCE(${table}.created_at, EXCLUDED.created_at),
                    last_message = EXCLUDED.last_message,
                    source = EXCLUDED.source,
                    total_value = EXCLUDED.total_value,
                    last_purchase_at = EXCLUDED.last_purchase_at,
                    updated_at = NOW()
      RETURNING session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
                observations, created_at, last_message, source, total_value, last_purchase_at, updated_at`,
      [
        input.sessionId,
        input.id,
        input.name,
        input.whatsapp,
        input.chatId,
        input.status ?? 'ativo',
        input.lastContactAt ? new Date(input.lastContactAt) : null,
        input.nextContactAt ? new Date(input.nextContactAt) : null,
        input.observations ?? null,
        input.createdAt ? new Date(input.createdAt) : new Date(),
        input.lastMessage ?? null,
        input.source ?? null,
        input.totalValue ?? null,
        input.lastPurchaseAt ? new Date(input.lastPurchaseAt) : null
      ]
    )
    return this.toClient(result.rows[0] as ClientRow)
  }

  async update(sessionId: string, clientId: string, update: ClientUpdate): Promise<ClientRecord | null> {
    const table = this.quoteIdentifier(this.tableName)
    const fields: string[] = []
    const values: Array<string | number | Date | null> = [sessionId, clientId]
    let index = 3

    if (update.status) {
      fields.push(`status = $${index}`)
      values.push(update.status)
      index += 1
    }

    if (Object.prototype.hasOwnProperty.call(update, 'nextContactAt')) {
      fields.push(`next_contact_at = $${index}`)
      values.push(update.nextContactAt ? new Date(update.nextContactAt) : null)
      index += 1
      fields.push('auto_followup_step = 0')
      fields.push('auto_followup_claim_until = NULL')
    }

    if (Object.prototype.hasOwnProperty.call(update, 'observations')) {
      fields.push(`observations = $${index}`)
      values.push(update.observations ?? null)
      index += 1
    }

    if (fields.length === 0) {
      return this.get(sessionId, clientId)
    }

    const result = await this.pool.query(
      `UPDATE ${table}
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE session_id = $1 AND client_id = $2
       RETURNING session_id, client_id, name, whatsapp, chat_id, status, last_contact_at, next_contact_at,
                 observations, created_at, last_message, source, total_value, last_purchase_at, updated_at`,
      values
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toClient(result.rows[0] as ClientRow)
  }

  async claimDueForAutoFollowUp(
    sessionId: string,
    options: { dueBeforeMs: number; limit: number; leaseMs: number }
  ): Promise<ClientAutoFollowUpClaim[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(options.limit, 500))
    const safeLeaseMs = Math.max(5_000, Math.min(options.leaseMs, 30 * 60_000))
    const dueBeforeMs = Math.max(0, Math.floor(options.dueBeforeMs))

    const result = await this.pool.query(
      `WITH due AS (
         SELECT client_id
         FROM ${table}
         WHERE session_id = $1
           AND next_contact_at IS NOT NULL
           AND next_contact_at <= to_timestamp($2 / 1000.0)
           AND status <> 'inativo'
           AND chat_id IS NOT NULL
           AND btrim(chat_id) <> ''
           AND (
             auto_followup_claim_until IS NULL
             OR auto_followup_claim_until <= NOW()
           )
         ORDER BY next_contact_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       UPDATE ${table} AS clients
       SET auto_followup_claim_until = NOW() + ($4::bigint * INTERVAL '1 millisecond'),
           updated_at = NOW()
       FROM due
       WHERE clients.session_id = $1
         AND clients.client_id = due.client_id
       RETURNING clients.session_id,
                 clients.client_id,
                 clients.chat_id,
                 clients.status,
                 clients.next_contact_at,
                 clients.auto_followup_step`,
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
          clientId: row.client_id,
          chatId,
          status: normalizeClientStatus(row.status),
          nextContactAt,
          autoFollowUpStep: toSafeInteger(row.auto_followup_step)
        } satisfies ClientAutoFollowUpClaim
      })
      .filter((entry): entry is ClientAutoFollowUpClaim => entry !== null)
  }

  async completeAutoFollowUpStep(
    sessionId: string,
    clientId: string,
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
       WHERE session_id = $1 AND client_id = $2`,
      [sessionId, clientId, nextStep, input.nextContactAt ? new Date(input.nextContactAt) : null]
    )
  }

  async releaseAutoFollowUpClaim(
    sessionId: string,
    clientId: string,
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
         WHERE session_id = $1 AND client_id = $2`,
        [sessionId, clientId, options?.nextContactAt ? new Date(options.nextContactAt) : null]
      )
      return
    }

    await this.pool.query(
      `UPDATE ${table}
       SET auto_followup_claim_until = NULL,
           updated_at = NOW()
       WHERE session_id = $1 AND client_id = $2`,
      [sessionId, clientId]
    )
  }

  async delete(sessionId: string, clientId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(`DELETE FROM ${table} WHERE session_id = $1 AND client_id = $2`, [sessionId, clientId])
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

  private toClient(row: ClientRow): ClientRecord {
    return {
      id: row.client_id,
      sessionId: row.session_id,
      name: row.name ?? null,
      whatsapp: row.whatsapp ?? null,
      chatId: row.chat_id ?? null,
      status: normalizeClientStatus(row.status),
      lastContactAt: toMs(row.last_contact_at),
      nextContactAt: toMs(row.next_contact_at),
      observations: row.observations ?? null,
      createdAt: toMs(row.created_at),
      lastMessage: row.last_message ?? null,
      source: row.source ?? null,
      totalValue: toNumber(row.total_value),
      lastPurchaseAt: toMs(row.last_purchase_at),
      updatedAt: toMs(row.updated_at)
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

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toSafeInteger(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    return 0
  }
  return num
}

function normalizeClientStatus(value: unknown): ClientStatus {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'ativo') return 'ativo'
  if (normalized === 'inativo') return 'inativo'
  if (normalized === 'vip') return 'vip'
  if (normalized === 'lead') return 'lead'

  return 'ativo'
}
