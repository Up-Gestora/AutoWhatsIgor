import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

test('chat delete route requires admin key', async () => {
  const app = buildServer(baseEnv, {
    chatDeleteService: {
      deleteChat: async () => ({
        success: true,
        sessionId: 's1',
        chatId: 'chat-1',
        postgres: { success: true, totalRowsDeleted: 0, byTable: {} },
        redis: { success: true, totalKeysDeleted: 0, totalSetMembersRemoved: 0, byPattern: {}, bySet: {} },
        storage: { scanned: 0, deleted: 0, skipped: 0, failed: 0, byReason: {} }
      })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: '/sessions/s1/chats/chat-1'
    })
    assert.equal(response.statusCode, 401)
    assert.equal((response.json() as any).error, 'Unauthorized')
  } finally {
    await app.close()
  }
})

test('chat delete route returns success with report', async () => {
  const app = buildServer(baseEnv, {
    chatDeleteService: {
      deleteChat: async (sessionId: string, chatId: string) => ({
        success: true,
        sessionId,
        chatId,
        postgres: {
          success: true,
          totalRowsDeleted: 8,
          byTable: {
            inbound_messages: 2,
            outbound_messages: 3
          }
        },
        redis: {
          success: false,
          totalKeysDeleted: 4,
          totalSetMembersRemoved: 3,
          byPattern: {},
          bySet: {},
          error: 'redis_cleanup_failed'
        },
        storage: {
          scanned: 2,
          deleted: 1,
          skipped: 1,
          failed: 0,
          byReason: {
            unsupported_url: 1
          }
        }
      })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: '/sessions/s1/chats/chat-1',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.chatId, 'chat-1')
    assert.equal(body.report.postgres.totalRowsDeleted, 8)
    assert.equal(body.report.redis.success, false)
  } finally {
    await app.close()
  }
})

test('chat delete route returns 500 when postgres cleanup fails', async () => {
  const app = buildServer(baseEnv, {
    chatDeleteService: {
      deleteChat: async () => ({
        success: false,
        sessionId: 's1',
        chatId: 'chat-1',
        postgres: {
          success: false,
          totalRowsDeleted: 0,
          byTable: {},
          error: 'chat_delete_postgres_failed'
        },
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
          byReason: {}
        }
      })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'DELETE',
      url: '/sessions/s1/chats/chat-1',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 500)
    const body = response.json() as any
    assert.equal(body.success, false)
    assert.equal(body.error, 'chat_delete_failed')
  } finally {
    await app.close()
  }
})
