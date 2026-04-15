import type { Pool } from 'pg'

const SHORTCUT_REGEX = /^[a-z0-9_-]{1,32}$/
const DEFAULT_TABLE_NAME = 'quick_replies'
const DEFAULT_MAX_PER_SESSION = 50
const DEFAULT_MAX_CONTENT_LENGTH = 2000

export type QuickReply = {
  id: string
  sessionId: string
  shortcut: string
  content: string
  createdAt: number | null
  updatedAt: number | null
}

type QuickReplyRow = {
  id: string
  session_id: string
  shortcut: string
  content: string
  created_at: Date | string | null
  updated_at: Date | string | null
}

type QuickReplyStoreOptions = {
  pool: Pool
  tableName?: string
  maxPerSession?: number
}

type QuickReplyCreateInput = {
  sessionId: string
  id: string
  shortcut: string
  content: string
}

type QuickReplyUpdateInput = {
  sessionId: string
  id: string
  shortcut: string
  content: string
}

export class QuickReplyStoreError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export class QuickReplyStore {
  private readonly pool: Pool
  private readonly tableName: string
  private readonly maxPerSession: number
  private readonly maxContentLength: number

  constructor(options: QuickReplyStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? DEFAULT_TABLE_NAME
    this.maxPerSession = Math.max(1, Math.floor(options.maxPerSession ?? DEFAULT_MAX_PER_SESSION))
    this.maxContentLength = DEFAULT_MAX_CONTENT_LENGTH
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT NOT NULL,
        id TEXT NOT NULL,
        shortcut TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, id)
      )`
    )

    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_shortcut_unique_idx`)}
       ON ${table} (session_id, shortcut)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_updated_idx`)}
       ON ${table} (session_id, updated_at DESC)`
    )
  }

  async listBySession(sessionId: string, limit = 200): Promise<QuickReply[]> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = clampLimit(limit, 1, 500)
    const result = await this.pool.query(
      `SELECT id, session_id, shortcut, content, created_at, updated_at
       FROM ${table}
       WHERE session_id = $1
       ORDER BY updated_at DESC, shortcut ASC
       LIMIT $2`,
      [safeSessionId, safeLimit]
    )

    return result.rows.map((row) => this.toQuickReply(row as QuickReplyRow))
  }

  async create(input: QuickReplyCreateInput): Promise<QuickReply> {
    const safeSessionId = input.sessionId.trim()
    const safeId = input.id.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeId) {
      throw new Error('id is required')
    }

    const shortcut = this.normalizeAndValidateShortcut(input.shortcut)
    const content = this.validateContent(input.content)

    const table = this.quoteIdentifier(this.tableName)
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM ${table}
       WHERE session_id = $1`,
      [safeSessionId]
    )
    const totalRaw = (countResult.rows?.[0] as { total?: number | string | null } | undefined)?.total
    const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw)
    if (Number.isFinite(total) && total >= this.maxPerSession) {
      throw new QuickReplyStoreError('quick_replies_limit_reached')
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO ${table} (session_id, id, shortcut, content, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, session_id, shortcut, content, created_at, updated_at`,
        [safeSessionId, safeId, shortcut, content]
      )
      return this.toQuickReply(result.rows[0] as QuickReplyRow)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new QuickReplyStoreError('quick_reply_shortcut_conflict')
      }
      throw error
    }
  }

  async update(input: QuickReplyUpdateInput): Promise<QuickReply | null> {
    const safeSessionId = input.sessionId.trim()
    const safeId = input.id.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeId) {
      throw new Error('id is required')
    }

    const shortcut = this.normalizeAndValidateShortcut(input.shortcut)
    const content = this.validateContent(input.content)
    const table = this.quoteIdentifier(this.tableName)

    try {
      const result = await this.pool.query(
        `UPDATE ${table}
         SET shortcut = $3,
             content = $4,
             updated_at = NOW()
         WHERE session_id = $1 AND id = $2
         RETURNING id, session_id, shortcut, content, created_at, updated_at`,
        [safeSessionId, safeId, shortcut, content]
      )
      if (result.rowCount === 0) {
        return null
      }
      return this.toQuickReply(result.rows[0] as QuickReplyRow)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new QuickReplyStoreError('quick_reply_shortcut_conflict')
      }
      throw error
    }
  }

  async delete(sessionId: string, id: string): Promise<boolean> {
    const safeSessionId = sessionId.trim()
    const safeId = id.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeId) {
      throw new Error('id is required')
    }

    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `DELETE FROM ${table}
       WHERE session_id = $1 AND id = $2`,
      [safeSessionId, safeId]
    )
    return (result.rowCount ?? 0) > 0
  }

  private normalizeAndValidateShortcut(raw: string): string {
    if (typeof raw !== 'string') {
      throw new QuickReplyStoreError('shortcut_required')
    }

    const normalized = raw.trim().replace(/^\/+/, '').toLowerCase()
    if (!normalized) {
      throw new QuickReplyStoreError('shortcut_required')
    }
    if (!SHORTCUT_REGEX.test(normalized)) {
      throw new QuickReplyStoreError('shortcut_invalid_format')
    }

    return normalized
  }

  private validateContent(raw: string): string {
    if (typeof raw !== 'string') {
      throw new QuickReplyStoreError('content_required')
    }
    if (!raw.trim()) {
      throw new QuickReplyStoreError('content_required')
    }
    if (raw.length > this.maxContentLength) {
      throw new QuickReplyStoreError('content_too_long')
    }
    return raw
  }

  private toQuickReply(row: QuickReplyRow): QuickReply {
    return {
      id: row.id,
      sessionId: row.session_id,
      shortcut: row.shortcut,
      content: row.content,
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at)
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
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
