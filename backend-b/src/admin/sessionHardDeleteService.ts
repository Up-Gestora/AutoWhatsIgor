import type { Pool, PoolClient } from 'pg'
import type Redis from 'ioredis'
import type { AppEnv } from '../config/env'

type SessionHardDeleteServiceOptions = {
  pool: Pool
  redis: Redis
  env: AppEnv
}

type SessionHardDeletePostgresReport = {
  success: boolean
  tablesFound: number
  totalRowsDeleted: number
  byTable: Record<string, number>
  error?: string
}

type SessionHardDeleteRedisReport = {
  success: boolean
  totalKeysDeleted: number
  totalSetMembersRemoved: number
  byPattern: Record<string, number>
  bySet: Record<string, number>
  error?: string
}

export type SessionHardDeleteReport = {
  success: boolean
  sessionId: string
  postgres: SessionHardDeletePostgresReport
  redis: SessionHardDeleteRedisReport
}

type RedisQueueCleanupConfig = {
  queuePrefix: string
  chatSetKey: string
}

export class SessionHardDeleteService {
  private readonly pool: Pool
  private readonly redis: Redis
  private readonly env: AppEnv

  constructor(options: SessionHardDeleteServiceOptions) {
    this.pool = options.pool
    this.redis = options.redis
    this.env = options.env
  }

  async hardDeleteSession(sessionId: string): Promise<SessionHardDeleteReport> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('session_id_required')
    }

    const postgres = await this.deletePostgresSessionData(safeSessionId)
    if (!postgres.success) {
      return {
        success: false,
        sessionId: safeSessionId,
        postgres,
        redis: {
          success: false,
          totalKeysDeleted: 0,
          totalSetMembersRemoved: 0,
          byPattern: {},
          bySet: {},
          error: 'skipped_due_to_postgres_error'
        }
      }
    }

    const redis = await this.deleteRedisSessionData(safeSessionId)
    return {
      success: postgres.success && redis.success,
      sessionId: safeSessionId,
      postgres,
      redis
    }
  }

  private async deletePostgresSessionData(sessionId: string): Promise<SessionHardDeletePostgresReport> {
    const byTable: Record<string, number> = {}
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const tables = await this.listTablesWithSessionId(client)
      for (const tableName of tables) {
        const safeTableName = this.quoteIdentifier(tableName)
        const result = await client.query(`DELETE FROM ${safeTableName} WHERE session_id = $1`, [sessionId])
        byTable[tableName] = Number(result.rowCount ?? 0)
      }
      await client.query('COMMIT')

      const totalRowsDeleted = Object.values(byTable).reduce((acc, value) => acc + value, 0)
      return {
        success: true,
        tablesFound: tables.length,
        totalRowsDeleted,
        byTable
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => null)
      return {
        success: false,
        tablesFound: Object.keys(byTable).length,
        totalRowsDeleted: Object.values(byTable).reduce((acc, value) => acc + value, 0),
        byTable,
        error: error instanceof Error ? error.message : 'postgres_hard_delete_failed'
      }
    } finally {
      client.release()
    }
  }

  private async listTablesWithSessionId(client: PoolClient): Promise<string[]> {
    const result = await client.query<{ table_name: string }>(
      `SELECT DISTINCT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'session_id'
       ORDER BY table_name ASC`
    )

    return result.rows
      .map((row) => String(row.table_name ?? '').trim())
      .filter(Boolean)
  }

  private async deleteRedisSessionData(sessionId: string): Promise<SessionHardDeleteRedisReport> {
    const byPattern: Record<string, number> = {}
    const bySet: Record<string, number> = {}

    try {
      const queueConfigs: RedisQueueCleanupConfig[] = [
        {
          queuePrefix: this.env.INBOUND_QUEUE_PREFIX,
          chatSetKey: this.env.INBOUND_QUEUE_CHAT_SET
        },
        {
          queuePrefix: this.env.AI_AUDIO_QUEUE_PREFIX,
          chatSetKey: this.env.AI_AUDIO_QUEUE_CHAT_SET
        },
        {
          queuePrefix: this.env.AI_MEDIA_QUEUE_PREFIX,
          chatSetKey: this.env.AI_MEDIA_QUEUE_CHAT_SET
        },
        {
          queuePrefix: this.env.OUTBOUND_QUEUE_PREFIX,
          chatSetKey: this.env.OUTBOUND_QUEUE_CHAT_SET
        }
      ]

      for (const queueConfig of queueConfigs) {
        const queuePattern = `${queueConfig.queuePrefix}:${sessionId}:*`
        const queueDeleted = await this.deleteKeysByPattern(queuePattern)
        byPattern[queuePattern] = queueDeleted.deleted

        const setMembersRemoved = await this.removeSetMembersByPrefix(queueConfig.chatSetKey, `${sessionId}:`)
        bySet[queueConfig.chatSetKey] = (bySet[queueConfig.chatSetKey] ?? 0) + setMembersRemoved
      }

      const outboundSessionSetKey = `${this.env.OUTBOUND_QUEUE_CHAT_SET}:session:${sessionId}`
      const outboundSessionSetDeleted = await this.deleteExactKey(outboundSessionSetKey)
      byPattern[outboundSessionSetKey] = outboundSessionSetDeleted

      const patterns = [
        `${this.env.AI_CONTEXT_PREFIX}:${sessionId}:*`,
        `${this.env.AI_OPTOUT_PREFIX}:${sessionId}`,
        `ai-presentation:${sessionId}:*`,
        `${this.env.AI_DEBOUNCE_PREFIX}:${sessionId}:*`,
        `${this.env.OUTBOUND_RATE_LIMIT_PREFIX}:session:${sessionId}`,
        `${this.env.OUTBOUND_RATE_LIMIT_PREFIX}:chat:${sessionId}:*`,
        `${this.env.BROADCAST_TRAFFIC_PREFIX}:inbound:${sessionId}`,
        `${this.env.STATUS_CACHE_PREFIX}:${sessionId}`,
        `${this.env.QR_THROTTLE_PREFIX}:${sessionId}`,
        `session-lock:${sessionId}`,
        `findmyangel:ctx:v1:${sessionId}:*`
      ]

      for (const pattern of patterns) {
        const deleted = await this.deleteKeysByPattern(pattern)
        byPattern[pattern] = (byPattern[pattern] ?? 0) + deleted.deleted
      }

      const totalKeysDeleted = Object.values(byPattern).reduce((acc, value) => acc + value, 0)
      const totalSetMembersRemoved = Object.values(bySet).reduce((acc, value) => acc + value, 0)
      return {
        success: true,
        totalKeysDeleted,
        totalSetMembersRemoved,
        byPattern,
        bySet
      }
    } catch (error) {
      return {
        success: false,
        totalKeysDeleted: Object.values(byPattern).reduce((acc, value) => acc + value, 0),
        totalSetMembersRemoved: Object.values(bySet).reduce((acc, value) => acc + value, 0),
        byPattern,
        bySet,
        error: error instanceof Error ? error.message : 'redis_hard_delete_failed'
      }
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

  private async deleteKeysByPattern(pattern: string): Promise<{ deleted: number }> {
    const safePattern = pattern.trim()
    if (!safePattern) {
      return { deleted: 0 }
    }

    let cursor = '0'
    let deletedTotal = 0
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', safePattern, 'COUNT', 500)
      cursor = nextCursor
      if (keys.length > 0) {
        deletedTotal += Number(await this.redis.del(...keys)) || 0
      }
    } while (cursor !== '0')

    return { deleted: deletedTotal }
  }

  private async removeSetMembersByPrefix(setKey: string, memberPrefix: string): Promise<number> {
    const safeSetKey = setKey.trim()
    const safePrefix = memberPrefix.trim()
    if (!safeSetKey || !safePrefix) {
      return 0
    }

    let cursor = '0'
    let removedTotal = 0
    do {
      const [nextCursor, members] = await this.redis.sscan(safeSetKey, cursor, 'MATCH', `${safePrefix}*`, 'COUNT', 500)
      cursor = nextCursor
      if (members.length > 0) {
        removedTotal += Number(await this.redis.srem(safeSetKey, ...members)) || 0
      }
    } while (cursor !== '0')

    return removedTotal
  }

  private quoteIdentifier(name: string) {
    return `"${name.replace(/"/g, '""')}"`
  }
}
