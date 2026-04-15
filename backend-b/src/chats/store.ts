import type { Pool } from 'pg'
import type { ChatMetadataUpsert, ChatStateRow, ChatStateUpsert } from './types'

type ChatStateStoreOptions = {
  pool: Pool
  tableName?: string
}

type UpsertOptions = {
  incrementUnread?: boolean
}

export class ChatStateStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: ChatStateStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'chat_state'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        chat_name TEXT,
        is_group BOOLEAN NOT NULL DEFAULT FALSE,
        last_message_id TEXT,
        last_message_text TEXT,
        last_message_type TEXT,
        last_message_from_me BOOLEAN,
        last_message_ts TIMESTAMPTZ,
        last_inbound_ts TIMESTAMPTZ,
        last_outbound_ts TIMESTAMPTZ,
        unread_count INT NOT NULL DEFAULT 0,
        manual_unread BOOLEAN NOT NULL DEFAULT FALSE,
        last_read_ts TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (session_id, chat_id)
      )`
    )
    await this.pool.query(
      `ALTER TABLE ${table}
       ADD COLUMN IF NOT EXISTS manual_unread BOOLEAN NOT NULL DEFAULT FALSE`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_last_idx`)}
       ON ${table} (session_id, last_message_ts DESC)`
    )
  }

  async upsertFromMessage(update: ChatStateUpsert, options: UpsertOptions = {}): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    const incrementUnread = options.incrementUnread !== false
    const unreadInsert = incrementUnread && !update.fromMe ? 1 : 0
    const messageTs = new Date(update.timestampMs)
    const inboundTs = update.fromMe ? null : messageTs
    const outboundTs = update.fromMe ? messageTs : null

    await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        chat_id,
        chat_name,
        is_group,
        last_message_id,
        last_message_text,
        last_message_type,
        last_message_from_me,
        last_message_ts,
        last_inbound_ts,
        last_outbound_ts,
        unread_count,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0), $10, $11, $12, NOW())
      ON CONFLICT (session_id, chat_id) DO UPDATE SET
        chat_name = COALESCE(EXCLUDED.chat_name, ${table}.chat_name),
        is_group = EXCLUDED.is_group,
        last_message_id = CASE
          WHEN ${table}.last_message_ts IS NULL OR EXCLUDED.last_message_ts >= ${table}.last_message_ts THEN EXCLUDED.last_message_id
          ELSE ${table}.last_message_id
        END,
        last_message_text = CASE
          WHEN ${table}.last_message_ts IS NULL OR EXCLUDED.last_message_ts >= ${table}.last_message_ts THEN EXCLUDED.last_message_text
          ELSE ${table}.last_message_text
        END,
        last_message_type = CASE
          WHEN ${table}.last_message_ts IS NULL OR EXCLUDED.last_message_ts >= ${table}.last_message_ts THEN EXCLUDED.last_message_type
          ELSE ${table}.last_message_type
        END,
        last_message_from_me = CASE
          WHEN ${table}.last_message_ts IS NULL OR EXCLUDED.last_message_ts >= ${table}.last_message_ts THEN EXCLUDED.last_message_from_me
          ELSE ${table}.last_message_from_me
        END,
        last_message_ts = CASE
          WHEN ${table}.last_message_ts IS NULL OR EXCLUDED.last_message_ts >= ${table}.last_message_ts THEN EXCLUDED.last_message_ts
          ELSE ${table}.last_message_ts
        END,
        last_inbound_ts = CASE
          WHEN EXCLUDED.last_inbound_ts IS NULL THEN ${table}.last_inbound_ts
          WHEN ${table}.last_inbound_ts IS NULL THEN EXCLUDED.last_inbound_ts
          ELSE GREATEST(${table}.last_inbound_ts, EXCLUDED.last_inbound_ts)
        END,
        last_outbound_ts = CASE
          WHEN EXCLUDED.last_outbound_ts IS NULL THEN ${table}.last_outbound_ts
          WHEN ${table}.last_outbound_ts IS NULL THEN EXCLUDED.last_outbound_ts
          ELSE GREATEST(${table}.last_outbound_ts, EXCLUDED.last_outbound_ts)
        END,
        unread_count = CASE
          WHEN $13 = FALSE THEN ${table}.unread_count
          WHEN EXCLUDED.last_message_from_me THEN ${table}.unread_count
          WHEN ${table}.last_read_ts IS NULL OR EXCLUDED.last_message_ts > ${table}.last_read_ts THEN ${table}.unread_count + 1
          ELSE ${table}.unread_count
        END,
        updated_at = NOW()`,
      [
        update.sessionId,
        update.chatId,
        update.chatName ?? null,
        update.isGroup,
        update.messageId ?? null,
        update.text ?? null,
        update.messageType ?? null,
        update.fromMe,
        update.timestampMs,
        inboundTs ? inboundTs.toISOString() : null,
        outboundTs ? outboundTs.toISOString() : null,
        unreadInsert,
        incrementUnread
      ]
    )
  }

  async upsertMetadata(update: ChatMetadataUpsert): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    const safeName = typeof update.chatName === 'string' ? update.chatName.trim() : ''
    const chatName = safeName || null

    await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        chat_id,
        chat_name,
        is_group,
        updated_at
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (session_id, chat_id) DO UPDATE SET
        chat_name = COALESCE(EXCLUDED.chat_name, ${table}.chat_name),
        is_group = EXCLUDED.is_group,
        updated_at = NOW()`,
      [update.sessionId, update.chatId, chatName, update.isGroup]
    )
  }

  async listBySession(sessionId: string, limit = 50): Promise<ChatStateRow[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, limit)
    const result = await this.pool.query(
      `SELECT session_id, chat_id, chat_name, is_group, unread_count,
              manual_unread,
              last_message_id, last_message_text, last_message_type, last_message_from_me,
              EXTRACT(EPOCH FROM last_message_ts) * 1000 AS last_message_ts_ms,
              EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at_ms
       FROM ${table}
       WHERE session_id = $1
       ORDER BY last_message_ts DESC NULLS LAST, updated_at DESC
       LIMIT $2`,
      [sessionId, safeLimit]
    )

    return result.rows.map((row) => ({
      sessionId: row.session_id,
      chatId: row.chat_id,
      chatName: row.chat_name ?? null,
      isGroup: Boolean(row.is_group),
      unreadCount: Number(row.unread_count ?? 0),
      manualUnread: Boolean(row.manual_unread),
      lastMessageId: row.last_message_id ?? null,
      lastMessageText: row.last_message_text ?? null,
      lastMessageType: row.last_message_type ?? null,
      lastMessageFromMe: row.last_message_from_me === null ? null : Boolean(row.last_message_from_me),
      lastMessageTsMs: row.last_message_ts_ms ? Number(row.last_message_ts_ms) : null,
      updatedAtMs: row.updated_at_ms ? Number(row.updated_at_ms) : null
    }))
  }

  async markRead(sessionId: string, chatId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET unread_count = 0,
           manual_unread = FALSE,
           last_read_ts = NOW(),
           updated_at = NOW()
       WHERE session_id = $1 AND chat_id = $2`,
      [sessionId, chatId]
    )
  }

  async markUnread(sessionId: string, chatId: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET manual_unread = TRUE,
           updated_at = NOW()
       WHERE session_id = $1 AND chat_id = $2`,
      [sessionId, chatId]
    )
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
