import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildHardDeleteReport(success = true) {
  return {
    success,
    sessionId: 'session-1',
    postgres: {
      success,
      tablesFound: 3,
      totalRowsDeleted: success ? 12 : 0,
      byTable: { leads: success ? 4 : 0, clients: success ? 8 : 0 }
    },
    redis: {
      success,
      totalKeysDeleted: success ? 20 : 0,
      totalSetMembersRemoved: success ? 6 : 0,
      byPattern: {},
      bySet: {},
      ...(success ? {} : { error: 'redis_hard_delete_failed' })
    }
  }
}

test('session hard delete route requires admin key', async () => {
  const app = buildServer(baseEnv, {
    sessionHardDeleteService: {
      hardDeleteSession: async () => buildHardDeleteReport(true)
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/hard-delete'
    })
    assert.equal(response.statusCode, 401)
    assert.equal((response.json() as any).error, 'Unauthorized')
  } finally {
    await app.close()
  }
})

test('session hard delete route returns success with purge + report', async () => {
  const app = buildServer(baseEnv, {
    sessionManager: {
      purgeSession: async () => ({
        sessionId: 'session-1',
        status: 'stopped',
        updatedAt: Date.now(),
        reason: 'hard-delete'
      })
    } as any,
    sessionHardDeleteService: {
      hardDeleteSession: async () => buildHardDeleteReport(true)
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/hard-delete',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.sessionId, 'session-1')
    assert.equal(body.report?.purge?.success, true)
    assert.equal(body.report?.hardDelete?.postgres?.totalRowsDeleted, 12)
  } finally {
    await app.close()
  }
})

test('session hard delete route returns 500 when purge fails', async () => {
  let hardDeleteCalls = 0
  const app = buildServer(baseEnv, {
    sessionManager: {
      purgeSession: async () => {
        throw new Error('purge_failed')
      }
    } as any,
    sessionHardDeleteService: {
      hardDeleteSession: async () => {
        hardDeleteCalls += 1
        return buildHardDeleteReport(true)
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/hard-delete',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 500)
    const body = response.json() as any
    assert.equal(body.success, false)
    assert.equal(body.error, 'session_purge_failed')
    assert.equal(hardDeleteCalls, 0)
  } finally {
    await app.close()
  }
})

test('session hard delete route returns 500 when data cleanup fails', async () => {
  const app = buildServer(baseEnv, {
    sessionManager: {
      purgeSession: async () => ({
        sessionId: 'session-1',
        status: 'stopped',
        updatedAt: Date.now(),
        reason: 'hard-delete'
      })
    } as any,
    sessionHardDeleteService: {
      hardDeleteSession: async () => buildHardDeleteReport(false)
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/hard-delete',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 500)
    const body = response.json() as any
    assert.equal(body.success, false)
    assert.equal(body.error, 'session_hard_delete_failed')
    assert.equal(body.report?.hardDelete?.success, false)
  } finally {
    await app.close()
  }
})
