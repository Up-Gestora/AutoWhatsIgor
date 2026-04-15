import type { Pool, PoolClient } from 'pg'
import type Redis from 'ioredis'
import { deleteFirebaseStorageObjectFromUrl, type DeleteFirebaseStorageResult } from '../firebase/storage'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type QueueCleanupConfig = {
  queuePrefix: string
  chatSetKey: string
}

type ChatDeleteServiceOptions = {
  pool: Pool
  redis: Redis
  inboundMessagesTableName?: string
  outboundMessagesTableName?: string
  chatStateTableName?: string
  chatAiConfigTableName?: string
  chatLabelAssignmentsTableName?: string
  aiResponsesTableName?: string
  aiAudioTranscriptionsTableName?: string
  aiMediaTableName?: string
  inboundQueuePrefix?: string
  inboundChatSetKey?: string
  aiAudioQueuePrefix?: string
  aiAudioChatSetKey?: string
  aiMediaQueuePrefix?: string
  aiMediaChatSetKey?: string
  outboundQueuePrefix?: string
  outboundChatSetKey?: string
  aiContextPrefix?: string
  aiDebouncePrefix?: string
  aiOptOutPrefix?: string
  aiPresentationPrefix?: string
  outboundRateLimitPrefix?: string
  logger?: Logger
  deleteByUrl?: (
    url: string,
    options: { expectedObjectPrefix?: string }
  ) => Promise<DeleteFirebaseStorageResult>
}

type ChatDeletePostgresReport = {
  success: boolean
  totalRowsDeleted: number
  byTable: Record<string, number>
  error?: string
}

type ChatDeleteRedisReport = {
  success: boolean
  totalKeysDeleted: number
  totalSetMembersRemoved: number
  byPattern: Record<string, number>
  bySet: Record<string, number>
  error?: string
}

type ChatDeleteStorageReport = {
  scanned: number
  deleted: number
  skipped: number
  failed: number
  byReason: Record<string, number>
}

export type ChatDeleteReport = {
  success: boolean
  sessionId: string
  chatId: string
  postgres: ChatDeletePostgresReport
  redis: ChatDeleteRedisReport
  storage: ChatDeleteStorageReport
}

export class ChatDeleteService {
  private readonly pool: Pool
  private readonly redis: Redis
  private readonly inboundMessagesTableName: string
  private readonly outboundMessagesTableName: string
  private readonly chatStateTableName: string
  private readonly chatAiConfigTableName: string
  private readonly chatLabelAssignmentsTableName: string
  private readonly aiResponsesTableName: string
  private readonly aiAudioTranscriptionsTableName: string
  private readonly aiMediaTableName: string
  private readonly queueConfigs: QueueCleanupConfig[]
  private readonly outboundChatSetKey: string
  private readonly aiContextPrefix: string
  private readonly aiDebouncePrefix: string
  private readonly aiOptOutPrefix: string
  private readonly aiPresentationPrefix: string
  private readonly outboundRateLimitPrefix: string
  private readonly logger: Logger
  private readonly deleteByUrl: (
    url: string,
    options: { expectedObjectPrefix?: string }
  ) => Promise<DeleteFirebaseStorageResult>

  constructor(options: ChatDeleteServiceOptions) {
    this.pool = options.pool
    this.redis = options.redis
    this.inboundMessagesTableName = options.inboundMessagesTableName ?? 'inbound_messages'
    this.outboundMessagesTableName = options.outboundMessagesTableName ?? 'outbound_messages'
    this.chatStateTableName = options.chatStateTableName ?? 'chat_state'
    this.chatAiConfigTableName = options.chatAiConfigTableName ?? 'chat_ai_configs'
    this.chatLabelAssignmentsTableName = options.chatLabelAssignmentsTableName ?? 'chat_label_assignments'
    this.aiResponsesTableName = options.aiResponsesTableName ?? 'ai_responses'
    this.aiAudioTranscriptionsTableName = options.aiAudioTranscriptionsTableName ?? 'ai_audio_transcriptions'
    this.aiMediaTableName = options.aiMediaTableName ?? 'ai_media_understandings'
    this.queueConfigs = [
      {
        queuePrefix: options.inboundQueuePrefix ?? 'inbound-queue',
        chatSetKey: options.inboundChatSetKey ?? 'inbound-queue-chats'
      },
      {
        queuePrefix: options.aiAudioQueuePrefix ?? 'audio-queue',
        chatSetKey: options.aiAudioChatSetKey ?? 'audio-queue-chats'
      },
      {
        queuePrefix: options.aiMediaQueuePrefix ?? 'media-queue',
        chatSetKey: options.aiMediaChatSetKey ?? 'media-queue-chats'
      },
      {
        queuePrefix: options.outboundQueuePrefix ?? 'outbound-queue',
        chatSetKey: options.outboundChatSetKey ?? 'outbound-queue-chats'
      }
    ]
    this.outboundChatSetKey = options.outboundChatSetKey ?? 'outbound-queue-chats'
    this.aiContextPrefix = options.aiContextPrefix ?? 'ai-context'
    this.aiDebouncePrefix = options.aiDebouncePrefix ?? 'ai-debounce'
    this.aiOptOutPrefix = options.aiOptOutPrefix ?? 'ai-optout'
    this.aiPresentationPrefix = options.aiPresentationPrefix ?? 'ai-presentation'
    this.outboundRateLimitPrefix = options.outboundRateLimitPrefix ?? 'outbound-rate'
    this.logger = options.logger ?? {}
    this.deleteByUrl = options.deleteByUrl ?? deleteFirebaseStorageObjectFromUrl
  }

  async deleteChat(sessionIdRaw: string, chatIdRaw: string): Promise<ChatDeleteReport> {
    const sessionId = sessionIdRaw.trim()
    const chatId = chatIdRaw.trim()
    if (!sessionId) {
      throw new Error('session_id_required')
    }
    if (!chatId) {
      throw new Error('chat_id_required')
    }

    const mediaUrls = await this.listOutboundMediaUrls(sessionId, chatId)
    const postgres = await this.deletePostgresChatData(sessionId, chatId)
    if (!postgres.success) {
      return {
        success: false,
        sessionId,
        chatId,
        postgres,
        redis: {
          success: false,
          totalKeysDeleted: 0,
          totalSetMembersRemoved: 0,
          byPattern: {},
          bySet: {},
          error: 'skipped_due_to_postgres_error'
        },
        storage: {
          scanned: 0,
          deleted: 0,
          skipped: 0,
          failed: 0,
          byReason: {
            skipped_due_to_postgres_error: mediaUrls.length
          }
        }
      }
    }

    const redis = await this.deleteRedisChatData(sessionId, chatId)
    const storage = await this.deleteStorageObjects(sessionId, chatId, mediaUrls)

    return {
      success: true,
      sessionId,
      chatId,
      postgres,
      redis,
      storage
    }
  }

  private async listOutboundMediaUrls(sessionId: string, chatId: string): Promise<string[]> {
    const table = this.quoteIdentifier(this.outboundMessagesTableName)
    const result = await this.pool.query(
      `SELECT id, payload
       FROM ${table}
       WHERE session_id = $1
         AND chat_id = $2
         AND payload->>'type' = 'media'
         AND COALESCE(payload->>'url', '') <> ''
       ORDER BY id ASC`,
      [sessionId, chatId]
    )

    const urls = result.rows
      .map((row) => {
        const payload =
          row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : null
        const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
        return url
      })
      .filter(Boolean)

    return [...new Set(urls)]
  }

  private async deletePostgresChatData(sessionId: string, chatId: string): Promise<ChatDeletePostgresReport> {
    const tables = [
      this.inboundMessagesTableName,
      this.outboundMessagesTableName,
      this.chatStateTableName,
      this.chatAiConfigTableName,
      this.chatLabelAssignmentsTableName,
      this.aiResponsesTableName,
      this.aiAudioTranscriptionsTableName,
      this.aiMediaTableName
    ]
    const byTable: Record<string, number> = {}
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')
      for (const tableName of tables) {
        const result = await client.query(
          `DELETE FROM ${this.quoteIdentifier(tableName)}
           WHERE session_id = $1
             AND chat_id = $2`,
          [sessionId, chatId]
        )
        byTable[tableName] = Number(result.rowCount ?? 0)
      }
      await client.query('COMMIT')

      return {
        success: true,
        totalRowsDeleted: Object.values(byTable).reduce((sum, value) => sum + value, 0),
        byTable
      }
    } catch (error) {
      await safeRollback(client)
      return {
        success: false,
        totalRowsDeleted: Object.values(byTable).reduce((sum, value) => sum + value, 0),
        byTable,
        error: error instanceof Error ? error.message : 'chat_delete_postgres_failed'
      }
    } finally {
      client.release()
    }
  }

  private async deleteRedisChatData(sessionId: string, chatId: string): Promise<ChatDeleteRedisReport> {
    const byPattern: Record<string, number> = {}
    const bySet: Record<string, number> = {}
    const encodedChatId = encodeURIComponent(chatId)

    try {
      for (const config of this.queueConfigs) {
        const queueKey = `${config.queuePrefix}:${sessionId}:${encodedChatId}`
        byPattern[queueKey] = await this.deleteExactKey(queueKey)

        const setResult = await this.removeSetMemberAndDeleteIfEmpty(
          config.chatSetKey,
          `${sessionId}:${encodedChatId}`
        )
        bySet[config.chatSetKey] = (bySet[config.chatSetKey] ?? 0) + setResult.removed
        if (setResult.deletedKey > 0) {
          byPattern[config.chatSetKey] = (byPattern[config.chatSetKey] ?? 0) + setResult.deletedKey
        }
      }

      const outboundSessionSetKey = `${this.outboundChatSetKey}:session:${sessionId}`
      const outboundSessionSet = await this.removeSetMemberAndDeleteIfEmpty(outboundSessionSetKey, encodedChatId)
      bySet[outboundSessionSetKey] = (bySet[outboundSessionSetKey] ?? 0) + outboundSessionSet.removed
      if (outboundSessionSet.deletedKey > 0) {
        byPattern[outboundSessionSetKey] = (byPattern[outboundSessionSetKey] ?? 0) + outboundSessionSet.deletedKey
      }

      const optOutSetKey = `${this.aiOptOutPrefix}:${sessionId}`
      const optOutSet = await this.removeSetMemberAndDeleteIfEmpty(optOutSetKey, chatId)
      bySet[optOutSetKey] = (bySet[optOutSetKey] ?? 0) + optOutSet.removed
      if (optOutSet.deletedKey > 0) {
        byPattern[optOutSetKey] = (byPattern[optOutSetKey] ?? 0) + optOutSet.deletedKey
      }

      const keys = [
        `${this.aiContextPrefix}:${sessionId}:${encodedChatId}`,
        `${this.aiDebouncePrefix}:${sessionId}:${encodedChatId}`,
        `${this.aiPresentationPrefix}:${sessionId}:${chatId}`,
        `${this.outboundRateLimitPrefix}:chat:${sessionId}:${encodedChatId}`
      ]

      for (const key of keys) {
        byPattern[key] = await this.deleteExactKey(key)
      }

      return {
        success: true,
        totalKeysDeleted: Object.values(byPattern).reduce((sum, value) => sum + value, 0),
        totalSetMembersRemoved: Object.values(bySet).reduce((sum, value) => sum + value, 0),
        byPattern,
        bySet
      }
    } catch (error) {
      return {
        success: false,
        totalKeysDeleted: Object.values(byPattern).reduce((sum, value) => sum + value, 0),
        totalSetMembersRemoved: Object.values(bySet).reduce((sum, value) => sum + value, 0),
        byPattern,
        bySet,
        error: error instanceof Error ? error.message : 'chat_delete_redis_failed'
      }
    }
  }

  private async deleteStorageObjects(
    sessionId: string,
    chatId: string,
    urls: string[]
  ): Promise<ChatDeleteStorageReport> {
    const byReason: Record<string, number> = {}
    let deleted = 0
    let skipped = 0
    let failed = 0
    const expectedObjectPrefix = `users/${sessionId}/conversas/`

    for (const url of urls) {
      try {
        const result = await this.deleteByUrl(url, { expectedObjectPrefix })
        if (result.deleted) {
          deleted += 1
          continue
        }

        const reason = result.reason ?? 'unknown'
        byReason[reason] = (byReason[reason] ?? 0) + 1
        if (reason === 'unsupported_url' || reason === 'prefix_mismatch') {
          skipped += 1
          continue
        }

        failed += 1
        this.logger.warn?.('Chat delete storage cleanup failed', {
          sessionId,
          chatId,
          reason,
          bucket: result.bucket ?? null,
          objectPath: result.objectPath ?? null,
          error: result.error ?? null
        })
      } catch (error) {
        failed += 1
        byReason.delete_failed = (byReason.delete_failed ?? 0) + 1
        this.logger.warn?.('Chat delete storage cleanup threw', {
          sessionId,
          chatId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return {
      scanned: urls.length,
      deleted,
      skipped,
      failed,
      byReason
    }
  }

  private async deleteExactKey(key: string): Promise<number> {
    const safeKey = key.trim()
    if (!safeKey) {
      return 0
    }

    const deleted = await this.redis.del(safeKey)
    return Number(deleted) || 0
  }

  private async removeSetMemberAndDeleteIfEmpty(
    setKey: string,
    member: string
  ): Promise<{ removed: number; deletedKey: number }> {
    const safeSetKey = setKey.trim()
    const safeMember = member.trim()
    if (!safeSetKey || !safeMember) {
      return { removed: 0, deletedKey: 0 }
    }

    const removed = Number(await this.redis.srem(safeSetKey, safeMember)) || 0
    if (removed === 0) {
      return { removed: 0, deletedKey: 0 }
    }

    const size = Number(await this.redis.scard(safeSetKey)) || 0
    if (size > 0) {
      return { removed, deletedKey: 0 }
    }

    const deletedKey = Number(await this.redis.del(safeSetKey)) || 0
    return { removed, deletedKey }
  }

  private quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`
  }
}

async function safeRollback(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Ignore rollback failures.
  }
}
