import type { Pool } from 'pg'

export type ChatAiConfig = {
  sessionId: string
  chatId: string
  aiEnabled: boolean
  disabledReason?: string | null
  disabledAt?: number | null
  updatedAt?: number | null
}

type ChatAiConfigRow = {
  session_id: string
  chat_id: string
  ai_enabled: boolean
  disabled_reason: string | null
  disabled_at: Date | null
  updated_at: Date
}

type ChatAiConfigStoreOptions = {
  pool: Pool
  tableName?: string
  chatStateTableName?: string
}

export class ChatAiConfigStore {
  private readonly pool: Pool
  private readonly tableName: string
  private readonly chatStateTableName: string

  constructor(options: ChatAiConfigStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'chat_ai_configs'
    this.chatStateTableName = options.chatStateTableName ?? 'chat_state'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        disabled_reason TEXT,
        disabled_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, chat_id)
      )`
    )
  }

  async get(sessionId: string, chatId: string): Promise<ChatAiConfig | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT session_id, chat_id, ai_enabled, disabled_reason, disabled_at, updated_at
       FROM ${table}
       WHERE session_id = $1 AND chat_id = $2`,
      [sessionId, chatId]
    )
    if (result.rowCount === 0) {
      return null
    }
    return this.toConfig(result.rows[0] as ChatAiConfigRow)
  }

  async listBySession(sessionId: string, limit = 500): Promise<ChatAiConfig[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, Math.min(limit, 2000))
    const result = await this.pool.query(
      `SELECT session_id, chat_id, ai_enabled, disabled_reason, disabled_at, updated_at
       FROM ${table}
       WHERE session_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [sessionId, safeLimit]
    )
    return result.rows.map((row) => this.toConfig(row as ChatAiConfigRow))
  }

  async setEnabled(sessionId: string, chatId: string, enabled: boolean, reason?: string | null): Promise<ChatAiConfig> {
    const table = this.quoteIdentifier(this.tableName)
    const disabledReason = enabled ? null : reason ?? 'manual'
    const disabledAt = enabled ? null : new Date()
    const result = await this.pool.query(
      `INSERT INTO ${table} (session_id, chat_id, ai_enabled, disabled_reason, disabled_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (session_id, chat_id)
       DO UPDATE SET ai_enabled = EXCLUDED.ai_enabled,
                     disabled_reason = EXCLUDED.disabled_reason,
                     disabled_at = EXCLUDED.disabled_at,
                     updated_at = NOW()
       RETURNING session_id, chat_id, ai_enabled, disabled_reason, disabled_at, updated_at`,
      [sessionId, chatId, enabled, disabledReason, disabledAt]
    )
    return this.toConfig(result.rows[0] as ChatAiConfigRow)
  }

  async disable(sessionId: string, chatId: string, reason = 'context'): Promise<ChatAiConfig> {
    return this.setEnabled(sessionId, chatId, false, reason)
  }

  async setAllEnabledFromChatState(
    sessionId: string,
    enabled: boolean,
    reason = 'manual_bulk'
  ): Promise<{ totalChats: number; updated: number }> {
    const table = this.quoteIdentifier(this.tableName)
    const chatStateTable = this.quoteIdentifier(this.chatStateTableName)
    const disabledReason = enabled ? null : reason
    const disabledAt = enabled ? null : new Date()

    const result = await this.pool.query(
      `WITH target_chats AS (
         SELECT chat_id
         FROM ${chatStateTable}
         WHERE session_id = $1
       ),
       upsert AS (
         INSERT INTO ${table} (session_id, chat_id, ai_enabled, disabled_reason, disabled_at, updated_at)
         SELECT $1, chat_id, $2, $3, $4, NOW()
         FROM target_chats
         ON CONFLICT (session_id, chat_id)
         DO UPDATE SET ai_enabled = EXCLUDED.ai_enabled,
                       disabled_reason = CASE
                         WHEN EXCLUDED.ai_enabled THEN NULL
                         WHEN ${table}.ai_enabled = FALSE THEN ${table}.disabled_reason
                         ELSE EXCLUDED.disabled_reason
                       END,
                       disabled_at = CASE
                         WHEN EXCLUDED.ai_enabled THEN NULL
                         WHEN ${table}.ai_enabled = FALSE THEN ${table}.disabled_at
                         ELSE EXCLUDED.disabled_at
                       END,
                       updated_at = NOW()
         RETURNING 1
       )
       SELECT (SELECT COUNT(*) FROM target_chats) AS total_chats,
              (SELECT COUNT(*) FROM upsert) AS updated`,
      [sessionId, enabled, disabledReason, disabledAt]
    )

    const row = result.rows[0] as { total_chats?: string | number | null; updated?: string | number | null } | undefined
    const totalChats = row?.total_chats ? Number(row.total_chats) : 0
    const updated = row?.updated ? Number(row.updated) : 0
    return { totalChats, updated }
  }

  private toConfig(row: ChatAiConfigRow): ChatAiConfig {
    return {
      sessionId: row.session_id,
      chatId: row.chat_id,
      aiEnabled: row.ai_enabled,
      disabledReason: row.disabled_reason,
      disabledAt: row.disabled_at ? row.disabled_at.getTime() : null,
      updatedAt: row.updated_at ? row.updated_at.getTime() : null
    }
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
