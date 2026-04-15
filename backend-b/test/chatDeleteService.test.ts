import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatDeleteService } from '../src/chats'

type FakeRow = Record<string, unknown>

class FakePool {
  tables: Record<string, FakeRow[]>
  private transactionSnapshot: Record<string, FakeRow[]> | null = null

  constructor(tables: Record<string, FakeRow[]>) {
    this.tables = cloneTables(tables)
  }

  async query(text: string, params: unknown[] = []) {
    return this.execute(text, params)
  }

  async connect() {
    return {
      query: (text: string, params?: unknown[]) => this.execute(text, params ?? []),
      release: () => undefined
    }
  }

  private async execute(text: string, params: unknown[]) {
    const sql = text.trim()
    if (sql === 'BEGIN') {
      this.transactionSnapshot = cloneTables(this.tables)
      return { rowCount: null, rows: [] }
    }

    if (sql === 'COMMIT') {
      this.transactionSnapshot = null
      return { rowCount: null, rows: [] }
    }

    if (sql === 'ROLLBACK') {
      if (this.transactionSnapshot) {
        this.tables = cloneTables(this.transactionSnapshot)
      }
      this.transactionSnapshot = null
      return { rowCount: null, rows: [] }
    }

    if (/^SELECT id, payload\s+FROM "outbound_messages"/i.test(sql)) {
      const [sessionId, chatId] = params as [string, string]
      const rows = (this.tables.outbound_messages ?? [])
        .filter((row) => row.session_id === sessionId && row.chat_id === chatId)
        .filter((row) => {
          const payload =
            row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
              ? (row.payload as Record<string, unknown>)
              : null
          return payload?.type === 'media' && typeof payload.url === 'string' && payload.url.trim().length > 0
        })
        .map((row) => ({ id: row.id, payload: row.payload }))
      return { rowCount: rows.length, rows }
    }

    const deleteMatch = sql.match(/^DELETE FROM "([^"]+)"\s+WHERE session_id = \$1\s+AND chat_id = \$2$/i)
    if (deleteMatch) {
      const tableName = deleteMatch[1] as string
      const [sessionId, chatId] = params as [string, string]
      const current = this.tables[tableName] ?? []
      const remaining = current.filter((row) => !(row.session_id === sessionId && row.chat_id === chatId))
      const deleted = current.length - remaining.length
      this.tables[tableName] = remaining
      return { rowCount: deleted, rows: [] }
    }

    throw new Error(`Unhandled SQL in test pool: ${sql}`)
  }
}

class FakeRedis {
  keys = new Set<string>()
  sets = new Map<string, Set<string>>()

  addKey(key: string) {
    this.keys.add(key)
  }

  addSet(key: string, members: string[]) {
    this.sets.set(key, new Set(members))
  }

  async del(...keys: string[]) {
    let deleted = 0
    for (const key of keys) {
      if (this.keys.delete(key)) {
        deleted += 1
        continue
      }
      if (this.sets.delete(key)) {
        deleted += 1
      }
    }
    return deleted
  }

  async srem(key: string, ...members: string[]) {
    const set = this.sets.get(key)
    if (!set) {
      return 0
    }

    let removed = 0
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1
      }
    }
    return removed
  }

  async scard(key: string) {
    return this.sets.get(key)?.size ?? 0
  }
}

test('chat delete service removes targeted chat data, redis state and preserves non-target tables', async () => {
  const pool = new FakePool({
    inbound_messages: [
      { id: 1, session_id: 's1', chat_id: 'chat-1' },
      { id: 2, session_id: 's1', chat_id: 'chat-2' }
    ],
    outbound_messages: [
      {
        id: 1,
        session_id: 's1',
        chat_id: 'chat-1',
        payload: {
          type: 'media',
          url: 'https://firebasestorage.googleapis.com/v0/b/app/o/users%2Fs1%2Fconversas%2Fmedia-1.jpg?alt=media'
        }
      },
      {
        id: 2,
        session_id: 's1',
        chat_id: 'chat-1',
        payload: {
          type: 'media',
          url: 'https://example.com/not-managed.jpg'
        }
      },
      {
        id: 3,
        session_id: 's1',
        chat_id: 'chat-1',
        payload: {
          type: 'text',
          text: 'Oi'
        }
      },
      {
        id: 4,
        session_id: 's1',
        chat_id: 'chat-2',
        payload: {
          type: 'media',
          url: 'https://firebasestorage.googleapis.com/v0/b/app/o/users%2Fs1%2Fconversas%2Fmedia-2.jpg?alt=media'
        }
      }
    ],
    chat_state: [
      { session_id: 's1', chat_id: 'chat-1' },
      { session_id: 's1', chat_id: 'chat-2' }
    ],
    chat_ai_configs: [
      { session_id: 's1', chat_id: 'chat-1' }
    ],
    chat_label_assignments: [
      { session_id: 's1', chat_id: 'chat-1', label_id: 'a' },
      { session_id: 's1', chat_id: 'chat-2', label_id: 'b' }
    ],
    ai_responses: [
      { inbound_id: 10, session_id: 's1', chat_id: 'chat-1' }
    ],
    ai_audio_transcriptions: [
      { inbound_id: 11, session_id: 's1', chat_id: 'chat-1' }
    ],
    ai_media_understandings: [
      { inbound_id: 12, session_id: 's1', chat_id: 'chat-1' }
    ],
    leads: [
      { session_id: 's1', chat_id: 'chat-1', lead_id: 'lead-1' }
    ],
    ai_usage: [
      { session_id: 's1', chat_id: 'chat-1', id: 99 }
    ]
  })
  const redis = new FakeRedis()
  const encodedChat1 = encodeURIComponent('chat-1')
  const encodedChat2 = encodeURIComponent('chat-2')
  redis.addKey(`inbound-queue:s1:${encodedChat1}`)
  redis.addKey(`audio-queue:s1:${encodedChat1}`)
  redis.addKey(`media-queue:s1:${encodedChat1}`)
  redis.addKey(`outbound-queue:s1:${encodedChat1}`)
  redis.addKey(`ai-context:s1:${encodedChat1}`)
  redis.addKey(`ai-debounce:s1:${encodedChat1}`)
  redis.addKey('ai-presentation:s1:chat-1')
  redis.addKey(`outbound-rate:chat:s1:${encodedChat1}`)
  redis.addKey(`ai-context:s1:${encodedChat2}`)
  redis.addSet('inbound-queue-chats', [`s1:${encodedChat1}`, `s1:${encodedChat2}`])
  redis.addSet('audio-queue-chats', [`s1:${encodedChat1}`, `s1:${encodedChat2}`])
  redis.addSet('media-queue-chats', [`s1:${encodedChat1}`, `s1:${encodedChat2}`])
  redis.addSet('outbound-queue-chats', [`s1:${encodedChat1}`, `s1:${encodedChat2}`])
  redis.addSet('outbound-queue-chats:session:s1', [encodedChat1, encodedChat2])
  redis.addSet('ai-optout:s1', ['chat-1', 'chat-2'])

  const deleteCalls: Array<{ url: string; expectedObjectPrefix?: string }> = []
  const service = new ChatDeleteService({
    pool: pool as any,
    redis: redis as any,
    deleteByUrl: async (url, options) => {
      deleteCalls.push({ url, expectedObjectPrefix: options.expectedObjectPrefix })
      if (url.includes('example.com')) {
        return { deleted: false, reason: 'unsupported_url' }
      }
      return {
        deleted: true,
        bucket: 'app',
        objectPath: 'users/s1/conversas/media-1.jpg'
      }
    }
  })

  const report = await service.deleteChat('s1', 'chat-1')

  assert.equal(report.success, true)
  assert.equal(report.postgres.byTable.inbound_messages, 1)
  assert.equal(report.postgres.byTable.outbound_messages, 3)
  assert.equal(report.postgres.byTable.chat_state, 1)
  assert.equal(report.postgres.byTable.chat_ai_configs, 1)
  assert.equal(report.postgres.byTable.chat_label_assignments, 1)
  assert.equal(report.postgres.byTable.ai_responses, 1)
  assert.equal(report.postgres.byTable.ai_audio_transcriptions, 1)
  assert.equal(report.postgres.byTable.ai_media_understandings, 1)
  assert.equal(report.storage.scanned, 2)
  assert.equal(report.storage.deleted, 1)
  assert.equal(report.storage.skipped, 1)
  assert.equal(report.storage.failed, 0)
  assert.equal(deleteCalls.length, 2)
  assert.deepEqual(
    deleteCalls.map((entry) => entry.expectedObjectPrefix),
    ['users/s1/conversas/', 'users/s1/conversas/']
  )

  assert.equal((pool.tables.inbound_messages ?? []).length, 1)
  assert.equal((pool.tables.outbound_messages ?? []).length, 1)
  assert.equal((pool.tables.chat_state ?? []).length, 1)
  assert.equal((pool.tables.chat_label_assignments ?? []).length, 1)
  assert.equal((pool.tables.ai_responses ?? []).length, 0)
  assert.equal((pool.tables.leads ?? []).length, 1)
  assert.equal((pool.tables.ai_usage ?? []).length, 1)

  assert.equal(redis.keys.has(`ai-context:s1:${encodedChat1}`), false)
  assert.equal(redis.keys.has(`ai-context:s1:${encodedChat2}`), true)
  assert.deepEqual(Array.from(redis.sets.get('inbound-queue-chats') ?? []), [`s1:${encodedChat2}`])
  assert.deepEqual(Array.from(redis.sets.get('ai-optout:s1') ?? []), ['chat-2'])
  assert.deepEqual(Array.from(redis.sets.get('outbound-queue-chats:session:s1') ?? []), [encodedChat2])

  const secondReport = await service.deleteChat('s1', 'chat-1')
  assert.equal(secondReport.success, true)
  assert.equal(secondReport.postgres.totalRowsDeleted, 0)
  assert.equal(secondReport.storage.scanned, 0)
  assert.equal(secondReport.redis.totalKeysDeleted, 0)
  assert.equal(secondReport.redis.totalSetMembersRemoved, 0)
})

function cloneTables(input: Record<string, FakeRow[]>) {
  return Object.fromEntries(
    Object.entries(input).map(([key, rows]) => [
      key,
      rows.map((row) => structuredClone(row))
    ])
  )
}
