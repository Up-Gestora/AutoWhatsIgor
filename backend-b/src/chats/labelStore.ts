import type { Pool, PoolClient } from 'pg'

const DEFAULT_LABELS_TABLE_NAME = 'chat_labels'
const DEFAULT_ASSIGNMENTS_TABLE_NAME = 'chat_label_assignments'
const DEFAULT_MAX_LABELS_PER_SESSION = 20
const DEFAULT_MAX_LABELS_PER_CHAT = 20
const DEFAULT_MAX_LABEL_NAME_LENGTH = 32

export const CHAT_LABEL_COLOR_PALETTE = [
  '#7E49E7',
  '#2D8CFF',
  '#00BFA5',
  '#43A047',
  '#7CB342',
  '#C0CA33',
  '#F9A825',
  '#FB8C00',
  '#F4511E',
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#5E35B1',
  '#6D4C41',
  '#757575',
  '#546E7A',
  '#1E88E5',
  '#3949AB',
  '#00897B',
  '#6D4C41'
] as const

type ChatLabelStoreOptions = {
  pool: Pool
  labelsTableName?: string
  assignmentsTableName?: string
  maxPerSession?: number
  maxPerChat?: number
  allowedColors?: readonly string[]
}

type ChatLabelCreateInput = {
  sessionId: string
  id: string
  name: string
  colorHex: string
}

type ChatLabelUpdateInput = {
  sessionId: string
  id: string
  name: string
  colorHex: string
}

type ChatLabelRow = {
  session_id: string
  id: string
  name: string
  color_hex: string
  created_at: Date | string | null
  updated_at: Date | string | null
}

type ChatLabelByChatRow = ChatLabelRow & {
  chat_id: string
}

export type ChatLabel = {
  sessionId: string
  id: string
  name: string
  colorHex: string
  createdAt: number | null
  updatedAt: number | null
}

export class ChatLabelStoreError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export class ChatLabelStore {
  private readonly pool: Pool
  private readonly labelsTableName: string
  private readonly assignmentsTableName: string
  private readonly maxPerSession: number
  private readonly maxPerChat: number
  private readonly maxLabelNameLength: number
  private readonly allowedColorSet: Set<string>

  constructor(options: ChatLabelStoreOptions) {
    this.pool = options.pool
    this.labelsTableName = options.labelsTableName ?? DEFAULT_LABELS_TABLE_NAME
    this.assignmentsTableName = options.assignmentsTableName ?? DEFAULT_ASSIGNMENTS_TABLE_NAME
    this.maxPerSession = Math.max(1, Math.floor(options.maxPerSession ?? DEFAULT_MAX_LABELS_PER_SESSION))
    this.maxPerChat = Math.max(1, Math.floor(options.maxPerChat ?? DEFAULT_MAX_LABELS_PER_CHAT))
    this.maxLabelNameLength = DEFAULT_MAX_LABEL_NAME_LENGTH
    const colors = options.allowedColors ?? CHAT_LABEL_COLOR_PALETTE
    this.allowedColorSet = new Set(
      colors
        .map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''))
        .filter(Boolean)
    )
  }

  async init(): Promise<void> {
    const labelsTable = this.quoteIdentifier(this.labelsTableName)
    const assignmentsTable = this.quoteIdentifier(this.assignmentsTableName)

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${labelsTable} (
        session_id TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        color_hex TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, id)
      )`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.labelsTableName}_name_unique_idx`)}
       ON ${labelsTable} (session_id, LOWER(name))`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.labelsTableName}_session_updated_idx`)}
       ON ${labelsTable} (session_id, updated_at DESC)`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${assignmentsTable} (
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        label_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, chat_id, label_id),
        FOREIGN KEY (session_id, label_id)
          REFERENCES ${labelsTable} (session_id, id)
          ON DELETE CASCADE
      )`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.assignmentsTableName}_session_chat_idx`)}
       ON ${assignmentsTable} (session_id, chat_id)`
    )
  }

  async listBySession(sessionId: string, limit = 200): Promise<ChatLabel[]> {
    const safeSessionId = this.assertSessionId(sessionId)
    const safeLimit = clampLimit(limit, 1, 500)
    const table = this.quoteIdentifier(this.labelsTableName)

    const result = await this.pool.query(
      `SELECT session_id, id, name, color_hex, created_at, updated_at
       FROM ${table}
       WHERE session_id = $1
       ORDER BY updated_at DESC, name ASC
       LIMIT $2`,
      [safeSessionId, safeLimit]
    )

    return result.rows.map((row) => this.toChatLabel(row as ChatLabelRow))
  }

  async listByChatIds(sessionId: string, chatIds: string[]): Promise<Record<string, ChatLabel[]>> {
    const safeSessionId = this.assertSessionId(sessionId)
    const safeChatIds = uniqueTrimmed(chatIds)
    const output: Record<string, ChatLabel[]> = {}

    safeChatIds.forEach((chatId) => {
      output[chatId] = []
    })

    if (safeChatIds.length === 0) {
      return output
    }

    const labelsTable = this.quoteIdentifier(this.labelsTableName)
    const assignmentsTable = this.quoteIdentifier(this.assignmentsTableName)
    const result = await this.pool.query(
      `SELECT a.chat_id, l.session_id, l.id, l.name, l.color_hex, l.created_at, l.updated_at
       FROM ${assignmentsTable} a
       INNER JOIN ${labelsTable} l
         ON l.session_id = a.session_id
        AND l.id = a.label_id
       WHERE a.session_id = $1
         AND a.chat_id = ANY($2::text[])
       ORDER BY a.chat_id ASC, a.updated_at ASC, l.name ASC`,
      [safeSessionId, safeChatIds]
    )

    result.rows.forEach((row) => {
      const parsed = row as ChatLabelByChatRow
      if (!output[parsed.chat_id]) {
        output[parsed.chat_id] = []
      }
      output[parsed.chat_id].push(this.toChatLabel(parsed))
    })

    return output
  }

  async listChatLabels(sessionId: string, chatId: string): Promise<ChatLabel[]> {
    const safeChatId = this.assertChatId(chatId)
    const byChat = await this.listByChatIds(sessionId, [safeChatId])
    return byChat[safeChatId] ?? []
  }

  async create(input: ChatLabelCreateInput): Promise<ChatLabel> {
    const safeSessionId = this.assertSessionId(input.sessionId)
    const safeId = this.assertLabelId(input.id)
    const safeName = this.normalizeAndValidateName(input.name)
    const safeColor = this.normalizeAndValidateColor(input.colorHex)

    const labelsTable = this.quoteIdentifier(this.labelsTableName)
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::INT AS total
       FROM ${labelsTable}
       WHERE session_id = $1`,
      [safeSessionId]
    )
    const totalRaw = (countResult.rows?.[0] as { total?: string | number | null } | undefined)?.total
    const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw)
    if (Number.isFinite(total) && total >= this.maxPerSession) {
      throw new ChatLabelStoreError('labels_limit_reached')
    }

    try {
      const result = await this.pool.query(
        `INSERT INTO ${labelsTable} (session_id, id, name, color_hex, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING session_id, id, name, color_hex, created_at, updated_at`,
        [safeSessionId, safeId, safeName, safeColor]
      )
      return this.toChatLabel(result.rows[0] as ChatLabelRow)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ChatLabelStoreError('label_name_conflict')
      }
      throw error
    }
  }

  async update(input: ChatLabelUpdateInput): Promise<ChatLabel | null> {
    const safeSessionId = this.assertSessionId(input.sessionId)
    const safeId = this.assertLabelId(input.id)
    const safeName = this.normalizeAndValidateName(input.name)
    const safeColor = this.normalizeAndValidateColor(input.colorHex)
    const labelsTable = this.quoteIdentifier(this.labelsTableName)

    try {
      const result = await this.pool.query(
        `UPDATE ${labelsTable}
         SET name = $3,
             color_hex = $4,
             updated_at = NOW()
         WHERE session_id = $1
           AND id = $2
         RETURNING session_id, id, name, color_hex, created_at, updated_at`,
        [safeSessionId, safeId, safeName, safeColor]
      )
      if ((result.rowCount ?? 0) === 0) {
        return null
      }
      return this.toChatLabel(result.rows[0] as ChatLabelRow)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ChatLabelStoreError('label_name_conflict')
      }
      throw error
    }
  }

  async delete(sessionId: string, labelId: string): Promise<boolean> {
    const safeSessionId = this.assertSessionId(sessionId)
    const safeLabelId = this.assertLabelId(labelId)
    const labelsTable = this.quoteIdentifier(this.labelsTableName)
    const result = await this.pool.query(
      `DELETE FROM ${labelsTable}
       WHERE session_id = $1
         AND id = $2`,
      [safeSessionId, safeLabelId]
    )
    return (result.rowCount ?? 0) > 0
  }

  async setChatLabels(sessionId: string, chatId: string, labelIds: string[]): Promise<ChatLabel[]> {
    const safeSessionId = this.assertSessionId(sessionId)
    const safeChatId = this.assertChatId(chatId)
    const nextLabelIds = uniqueTrimmed(labelIds)

    if (nextLabelIds.length > this.maxPerChat) {
      throw new ChatLabelStoreError('chat_labels_limit_exceeded')
    }

    if (nextLabelIds.length > 0) {
      const labelsTable = this.quoteIdentifier(this.labelsTableName)
      const existingRows = await this.pool.query(
        `SELECT id
         FROM ${labelsTable}
         WHERE session_id = $1
           AND id = ANY($2::text[])`,
        [safeSessionId, nextLabelIds]
      )
      const existingIds = new Set(
        existingRows.rows
          .map((row) => (typeof row.id === 'string' ? row.id.trim() : ''))
          .filter(Boolean)
      )
      const invalidIds = nextLabelIds.filter((id) => !existingIds.has(id))
      if (invalidIds.length > 0) {
        throw new ChatLabelStoreError('chat_label_invalid_ids')
      }
    }

    const assignmentsTable = this.quoteIdentifier(this.assignmentsTableName)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `DELETE FROM ${assignmentsTable}
         WHERE session_id = $1
           AND chat_id = $2`,
        [safeSessionId, safeChatId]
      )
      if (nextLabelIds.length > 0) {
        await client.query(
          `INSERT INTO ${assignmentsTable} (session_id, chat_id, label_id, created_at, updated_at)
           SELECT $1, $2, label_id, NOW(), NOW()
           FROM UNNEST($3::text[]) AS t(label_id)`,
          [safeSessionId, safeChatId, nextLabelIds]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await safeRollback(client)
      throw error
    } finally {
      client.release()
    }

    return this.listChatLabels(safeSessionId, safeChatId)
  }

  private normalizeAndValidateName(raw: string): string {
    if (typeof raw !== 'string') {
      throw new ChatLabelStoreError('label_name_required')
    }
    const safeName = raw.trim()
    if (!safeName) {
      throw new ChatLabelStoreError('label_name_required')
    }
    if (safeName.length > this.maxLabelNameLength) {
      throw new ChatLabelStoreError('label_name_too_long')
    }
    return safeName
  }

  private normalizeAndValidateColor(raw: string): string {
    if (typeof raw !== 'string') {
      throw new ChatLabelStoreError('label_color_required')
    }
    const safe = raw.trim().toUpperCase()
    if (!safe) {
      throw new ChatLabelStoreError('label_color_required')
    }
    if (!/^#[0-9A-F]{6}$/.test(safe)) {
      throw new ChatLabelStoreError('label_color_invalid')
    }
    if (!this.allowedColorSet.has(safe)) {
      throw new ChatLabelStoreError('label_color_invalid')
    }
    return safe
  }

  private toChatLabel(row: ChatLabelRow): ChatLabel {
    return {
      sessionId: row.session_id,
      id: row.id,
      name: row.name,
      colorHex: row.color_hex,
      createdAt: toMs(row.created_at),
      updatedAt: toMs(row.updated_at)
    }
  }

  private assertSessionId(value: string): string {
    const safeValue = typeof value === 'string' ? value.trim() : ''
    if (!safeValue) {
      throw new Error('sessionId is required')
    }
    return safeValue
  }

  private assertChatId(value: string): string {
    const safeValue = typeof value === 'string' ? value.trim() : ''
    if (!safeValue) {
      throw new Error('chatId is required')
    }
    return safeValue
  }

  private assertLabelId(value: string): string {
    const safeValue = typeof value === 'string' ? value.trim() : ''
    if (!safeValue) {
      throw new ChatLabelStoreError('label_not_found')
    }
    return safeValue
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  values.forEach((entry) => {
    if (typeof entry !== 'string') {
      return
    }
    const safeEntry = entry.trim()
    if (!safeEntry || seen.has(safeEntry)) {
      return
    }
    seen.add(safeEntry)
    output.push(safeEntry)
  })
  return output
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}

async function safeRollback(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Ignore rollback failures.
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
