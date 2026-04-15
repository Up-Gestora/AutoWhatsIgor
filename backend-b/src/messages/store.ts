import type { Pool } from 'pg'
import type { InboundMessageInsert, InboundMessageInsertResult } from './types'

export type InboundMessageRow = {
  id: number
  sessionId: string
  chatId: string
  messageId: string | null
  fromMe: boolean
  messageType: string
  text: string | null
  messageTimestampMs: number
  rawPayload?: Record<string, unknown> | null
}

type InboundMessageStoreOptions = {
  pool: Pool
  tableName?: string
}

export class InboundMessageStore {
  private readonly pool: Pool
  private readonly tableName: string

  constructor(options: InboundMessageStoreOptions) {
    this.pool = options.pool
    this.tableName = options.tableName ?? 'inbound_messages'
  }

  async init(): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        message_id TEXT,
        payload_hash TEXT NOT NULL,
        sender_id TEXT,
        from_me BOOLEAN NOT NULL DEFAULT FALSE,
        message_ts TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        message_type TEXT NOT NULL,
        text TEXT,
        raw_payload JSONB,
        normalized_payload JSONB NOT NULL
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_chat_idx`)}
       ON ${table} (session_id, chat_id, message_ts)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_session_from_me_ts_idx`)}
       ON ${table} (session_id, from_me, message_ts)`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_message_id_idx`)}
       ON ${table} (session_id, message_id)
       WHERE message_id IS NOT NULL`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.tableName}_hash_idx`)}
       ON ${table} (session_id, payload_hash)`
    )
  }

  async insert(message: InboundMessageInsert): Promise<InboundMessageInsertResult> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `INSERT INTO ${table} (
        session_id,
        chat_id,
        message_id,
        payload_hash,
        sender_id,
        from_me,
        message_ts,
        received_at,
        message_type,
        text,
        raw_payload,
        normalized_payload
      ) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0), $9, $10, $11, $12)
      ON CONFLICT DO NOTHING
      RETURNING id`,
      [
        message.sessionId,
        message.chatId,
        message.messageId,
        message.payloadHash,
        message.senderId,
        message.fromMe,
        message.messageTimestampMs,
        message.receivedAtMs,
        message.messageType,
        message.text,
        message.rawPayload,
        message.normalizedPayload
      ]
    )

    if (result.rowCount === 0) {
      return { inserted: false }
    }

    return {
      inserted: true,
      id: Number(result.rows[0]?.id)
    }
  }

  async getById(id: number): Promise<InboundMessageRow | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT id, session_id, chat_id, message_id, from_me, message_type, text,
              EXTRACT(EPOCH FROM message_ts) * 1000 AS message_ts_ms
       FROM ${table} WHERE id = $1`,
      [id]
    )
    if (result.rowCount === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      id: Number(row.id),
      sessionId: row.session_id,
      chatId: row.chat_id,
      messageId: row.message_id ?? null,
      fromMe: Boolean(row.from_me),
      messageType: row.message_type,
      text: row.text ?? null,
      messageTimestampMs: Number(row.message_ts_ms)
    }
  }

  async getRawPayloadById(id: number): Promise<Record<string, unknown> | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT raw_payload
       FROM ${table} WHERE id = $1`,
      [id]
    )
    if (result.rowCount === 0) {
      return null
    }

    const raw = result.rows[0]?.raw_payload
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null
    }

    return raw as Record<string, unknown>
  }

  async updateTextById(id: number, text: string): Promise<void> {
    const table = this.quoteIdentifier(this.tableName)
    await this.pool.query(
      `UPDATE ${table}
       SET text = $2
       WHERE id = $1`,
      [id, text]
    )
  }

  async getLatestUserTextByChat(sessionId: string, chatId: string): Promise<InboundMessageRow | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT id, session_id, chat_id, message_id, from_me, message_type, text,
              EXTRACT(EPOCH FROM message_ts) * 1000 AS message_ts_ms
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = $2
         AND from_me = FALSE
         AND text IS NOT NULL
         AND btrim(text) <> ''
       ORDER BY id DESC
       LIMIT 1`,
      [sessionId, chatId]
    )

    if (result.rowCount === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      id: Number(row.id),
      sessionId: row.session_id,
      chatId: row.chat_id,
      messageId: row.message_id ?? null,
      fromMe: Boolean(row.from_me),
      messageType: row.message_type,
      text: row.text ?? null,
      messageTimestampMs: Number(row.message_ts_ms)
    }
  }

  async getLatestUserAudioByChat(sessionId: string, chatId: string): Promise<{ id: number } | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT id
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = $2
         AND from_me = FALSE
         AND message_type = 'audioMessage'
       ORDER BY id DESC
       LIMIT 1`,
      [sessionId, chatId]
    )

    if (result.rowCount === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      id: Number(row.id)
    }
  }

  async getLatestUserImageOrPdfByChat(sessionId: string, chatId: string): Promise<{ id: number } | null> {
    const table = this.quoteIdentifier(this.tableName)
    const result = await this.pool.query(
      `SELECT id, message_type, raw_payload
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = $2
         AND from_me = FALSE
         AND message_type IN ('imageMessage', 'documentMessage')
       ORDER BY id DESC
       LIMIT 30`,
      [sessionId, chatId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    for (const row of result.rows) {
      const id = Number(row.id)
      const messageType = String(row.message_type ?? '')
      if (messageType === 'imageMessage') {
        return { id }
      }

      if (messageType === 'documentMessage' && isPdfDocumentPayload(row.raw_payload)) {
        return { id }
      }
    }

    return null
  }

  async listRecentByChat(
    sessionId: string,
    chatId: string,
    limit = 20,
    options: { beforeTimestampMs?: number } = {}
  ): Promise<InboundMessageRow[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, limit)
    const beforeMs = options.beforeTimestampMs
    const params = [sessionId, chatId, safeLimit]
    let where = 'WHERE session_id = $1 AND chat_id = $2'
    if (typeof beforeMs === 'number' && Number.isFinite(beforeMs)) {
      params.push(beforeMs)
      where += ` AND message_ts < to_timestamp($4 / 1000.0)`
    }

    const result = await this.pool.query(
      `SELECT id, session_id, chat_id, message_id, from_me, message_type, text, raw_payload,
              EXTRACT(EPOCH FROM message_ts) * 1000 AS message_ts_ms
       FROM ${table}
       ${where}
       ORDER BY message_ts DESC
       LIMIT $3`,
      params
    )

    return result.rows
      .map((row) => ({
        id: Number(row.id),
        sessionId: row.session_id,
        chatId: row.chat_id,
        messageId: row.message_id ?? null,
        fromMe: Boolean(row.from_me),
        messageType: row.message_type,
        text: row.text ?? null,
        messageTimestampMs: Number(row.message_ts_ms),
        rawPayload:
          row.raw_payload && typeof row.raw_payload === 'object' && !Array.isArray(row.raw_payload)
            ? (row.raw_payload as Record<string, unknown>)
            : null
      }))
      .reverse()
  }

  async listRecentChats(sessionId: string, limit = 50): Promise<InboundMessageRow[]> {
    const table = this.quoteIdentifier(this.tableName)
    const safeLimit = Math.max(1, limit)
    const result = await this.pool.query(
      `SELECT id, chat_id, message_id, from_me, message_type, text,
              EXTRACT(EPOCH FROM message_ts) * 1000 AS message_ts_ms
       FROM (
         SELECT DISTINCT ON (chat_id)
           id,
           chat_id,
           message_id,
           from_me,
           message_type,
           text,
           message_ts
         FROM ${table}
         WHERE session_id = $1
         ORDER BY chat_id, message_ts DESC
       ) AS latest
       ORDER BY message_ts DESC
       LIMIT $2`,
      [sessionId, safeLimit]
    )

    return result.rows.map((row) => ({
      id: Number(row.id),
      sessionId,
      chatId: row.chat_id,
      messageId: row.message_id ?? null,
      fromMe: Boolean(row.from_me),
      messageType: row.message_type,
      text: row.text ?? null,
      messageTimestampMs: Number(row.message_ts_ms)
    }))
  }

  async listUserTextsByChatIds(
    sessionId: string,
    chatIds: string[],
    options: { fromMs: number; toMs: number; limit?: number }
  ): Promise<InboundMessageRow[]> {
    const uniqueChatIds = Array.from(
      new Set(
        chatIds
          .map((chatId) => (typeof chatId === 'string' ? chatId.trim() : ''))
          .filter((chatId) => chatId.length > 0)
      )
    )
    if (uniqueChatIds.length === 0) {
      return []
    }

    const table = this.quoteIdentifier(this.tableName)
    const safeFromMs = Math.max(0, Math.floor(options.fromMs))
    const safeToMs = Math.max(safeFromMs, Math.floor(options.toMs))
    const safeLimit = Math.max(1, Math.min(Math.floor(options.limit ?? 50_000), 100_000))
    const result = await this.pool.query(
      `SELECT id, session_id, chat_id, message_id, from_me, message_type, text,
              EXTRACT(EPOCH FROM message_ts) * 1000 AS message_ts_ms
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = ANY($2::text[])
         AND from_me = FALSE
         AND text IS NOT NULL
         AND btrim(text) <> ''
         AND message_ts >= to_timestamp($3 / 1000.0)
         AND message_ts <= to_timestamp($4 / 1000.0)
       ORDER BY message_ts ASC, id ASC
       LIMIT $5`,
      [sessionId, uniqueChatIds, safeFromMs, safeToMs, safeLimit]
    )

    return result.rows.map((row) => ({
      id: Number(row.id),
      sessionId: row.session_id,
      chatId: row.chat_id,
      messageId: row.message_id ?? null,
      fromMe: Boolean(row.from_me),
      messageType: row.message_type,
      text: row.text ?? null,
      messageTimestampMs: Number(row.message_ts_ms)
    }))
  }

  async countUserMessagesSince(sessionId: string, chatId: string, sinceMs: number): Promise<number> {
    const table = this.quoteIdentifier(this.tableName)
    const safeSinceMs = Math.max(0, Math.floor(sinceMs))
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = $2
         AND from_me = FALSE
         AND message_ts >= to_timestamp($3 / 1000.0)`,
      [sessionId, chatId, safeSinceMs]
    )
    return Number(result.rows[0]?.count ?? 0)
  }

  async compactAndExpire(retentionDays: number, compactAfterDays: number): Promise<{ deleted: number; compacted: number }> {
    const table = this.quoteIdentifier(this.tableName)
    const deleteResult = await this.pool.query(
      `DELETE FROM ${table}
       WHERE received_at < NOW() - ($1 * INTERVAL '1 day')`,
      [retentionDays]
    )

    const compactResult = await this.pool.query(
      `UPDATE ${table}
       SET raw_payload = NULL
       WHERE raw_payload IS NOT NULL
       AND received_at < NOW() - ($1 * INTERVAL '1 day')`,
      [compactAfterDays]
    )

    return {
      deleted: deleteResult.rowCount ?? 0,
      compacted: compactResult.rowCount ?? 0
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

function unwrapMessage(message: Record<string, unknown> | null): Record<string, unknown> | null {
  let current = message
  for (let i = 0; i < 4; i += 1) {
    if (!current) {
      return null
    }

    const ephemeral = current.ephemeralMessage
    if (isRecord(ephemeral) && isRecord(ephemeral.message)) {
      current = ephemeral.message
      continue
    }

    const viewOnce = current.viewOnceMessage
    if (isRecord(viewOnce) && isRecord(viewOnce.message)) {
      current = viewOnce.message
      continue
    }

    const viewOnceV2 = current.viewOnceMessageV2
    if (isRecord(viewOnceV2) && isRecord(viewOnceV2.message)) {
      current = viewOnceV2.message
      continue
    }

    const viewOnceV2Extension = current.viewOnceMessageV2Extension
    if (isRecord(viewOnceV2Extension) && isRecord(viewOnceV2Extension.message)) {
      current = viewOnceV2Extension.message
      continue
    }

    const documentWithCaption = current.documentWithCaptionMessage
    if (isRecord(documentWithCaption) && isRecord(documentWithCaption.message)) {
      current = documentWithCaption.message
      continue
    }

    break
  }

  return current
}

function isPdfDocumentPayload(rawPayload: unknown) {
  if (!isRecord(rawPayload)) {
    return false
  }
  const messageContainer = isRecord(rawPayload.message) ? (rawPayload.message as Record<string, unknown>) : null
  const message = unwrapMessage(messageContainer)
  const documentMessage = message && isRecord(message.documentMessage) ? (message.documentMessage as Record<string, unknown>) : null
  if (!documentMessage) {
    return false
  }

  const mimeType = toString(documentMessage.mimetype).trim().toLowerCase()
  const fileName = toString(documentMessage.fileName).trim().toLowerCase()
  return mimeType === 'application/pdf' || fileName.endsWith('.pdf')
}

function toString(value: unknown) {
  return typeof value === 'string' ? value : ''
}
