import assert from 'node:assert/strict'
import test from 'node:test'
import { autoRestoreSessions } from '../src/sessions/autoRestore'

type LoggerEntry = {
  message: string
  meta?: Record<string, unknown>
}

function buildSessionIds(count: number) {
  return Array.from({ length: count }, (_value, index) => `sess_${String(index + 1).padStart(2, '0')}`)
}

test('autoRestoreSessions keeps legacy behavior when batchSize=0', async () => {
  const sessionIds = buildSessionIds(5)
  const started: string[] = []
  const infoLogs: LoggerEntry[] = []

  await autoRestoreSessions({
    enabled: true,
    authStore: {
      async listSessionIds(limit: number) {
        return sessionIds.slice(0, limit)
      }
    } as any,
    sessionManager: {
      canHandleSession: () => ({ ok: true }),
      async startSession(sessionId: string) {
        started.push(sessionId)
        return {
          sessionId,
          status: 'connected',
          updatedAt: Date.now()
        }
      }
    } as any,
    maxSessions: 5,
    parallel: 2,
    batchSize: 0,
    batchDelayMs: 50,
    statusAllowlist: [],
    logger: {
      info: (message, meta) => infoLogs.push({ message, meta })
    }
  })

  assert.equal(started.length, 5)
  assert.equal(
    infoLogs.filter((entry) => entry.message === 'Auto-restore batch delay').length,
    0
  )
})

test('autoRestoreSessions processes 45 sessions in 3 batches when batchSize=20', async () => {
  const sessionIds = buildSessionIds(45)
  const started: string[] = []
  const infoLogs: LoggerEntry[] = []

  await autoRestoreSessions({
    enabled: true,
    authStore: {
      async listSessionIds(limit: number) {
        return sessionIds.slice(0, limit)
      }
    } as any,
    sessionManager: {
      canHandleSession: () => ({ ok: true }),
      async startSession(sessionId: string) {
        started.push(sessionId)
        return {
          sessionId,
          status: 'connected',
          updatedAt: Date.now()
        }
      }
    } as any,
    maxSessions: 45,
    parallel: 3,
    batchSize: 20,
    batchDelayMs: 1,
    statusAllowlist: [],
    logger: {
      info: (message, meta) => infoLogs.push({ message, meta })
    }
  })

  assert.equal(started.length, 45)
  assert.equal(new Set(started).size, 45)
  assert.equal(
    infoLogs.filter((entry) => entry.message === 'Auto-restore batch delay').length,
    2
  )
})

test('autoRestoreSessions respects delay between batches', async () => {
  const sessionIds = buildSessionIds(25)
  const startedAtBySession = new Map<string, number>()
  const batchDelayMs = 30

  await autoRestoreSessions({
    enabled: true,
    authStore: {
      async listSessionIds(limit: number) {
        return sessionIds.slice(0, limit)
      }
    } as any,
    sessionManager: {
      canHandleSession: () => ({ ok: true }),
      async startSession(sessionId: string) {
        startedAtBySession.set(sessionId, Date.now())
        return {
          sessionId,
          status: 'connected',
          updatedAt: Date.now()
        }
      }
    } as any,
    maxSessions: 25,
    parallel: 1,
    batchSize: 10,
    batchDelayMs,
    statusAllowlist: []
  })

  const firstBatchAt = startedAtBySession.get('sess_01')
  const secondBatchAt = startedAtBySession.get('sess_11')
  const thirdBatchAt = startedAtBySession.get('sess_21')
  assert.ok(typeof firstBatchAt === 'number')
  assert.ok(typeof secondBatchAt === 'number')
  assert.ok(typeof thirdBatchAt === 'number')
  assert.ok((secondBatchAt as number) - (firstBatchAt as number) >= 20)
  assert.ok((thirdBatchAt as number) - (secondBatchAt as number) >= 20)
})

test('autoRestoreSessions retries lock-unavailable sessions', async () => {
  const sessionIds = ['sess_01', 'sess_02']
  const callsBySession = new Map<string, number>()
  const warnLogs: LoggerEntry[] = []

  await autoRestoreSessions({
    enabled: true,
    authStore: {
      async listSessionIds(limit: number) {
        return sessionIds.slice(0, limit)
      }
    } as any,
    sessionManager: {
      canHandleSession: () => ({ ok: true }),
      async startSession(sessionId: string) {
        const nextCalls = (callsBySession.get(sessionId) ?? 0) + 1
        callsBySession.set(sessionId, nextCalls)
        if (sessionId === 'sess_01' && nextCalls === 1) {
          return {
            sessionId,
            status: 'error',
            updatedAt: Date.now(),
            reason: 'lock-unavailable'
          }
        }
        return {
          sessionId,
          status: 'connected',
          updatedAt: Date.now()
        }
      }
    } as any,
    maxSessions: 2,
    parallel: 1,
    batchSize: 0,
    batchDelayMs: 0,
    statusAllowlist: [],
    lockRetryDelayMs: 1000,
    lockRetryAttempts: 1,
    logger: {
      warn: (message, meta) => warnLogs.push({ message, meta })
    }
  })

  assert.equal(callsBySession.get('sess_01'), 2)
  assert.equal(callsBySession.get('sess_02'), 1)
  assert.equal(
    warnLogs.filter((entry) => entry.message === 'Auto-restore lock retry scheduled').length,
    1
  )
})

test('autoRestoreSessions skips sessions when capacity is exceeded', async () => {
  const sessionIds = ['sess_01', 'sess_02', 'sess_03']
  const started: string[] = []
  const infoLogs: LoggerEntry[] = []

  await autoRestoreSessions({
    enabled: true,
    authStore: {
      async listSessionIds(limit: number) {
        return sessionIds.slice(0, limit)
      }
    } as any,
    sessionManager: {
      canHandleSession: (sessionId: string) => {
        if (sessionId === 'sess_03') {
          return { ok: false, reason: 'capacity-exceeded' }
        }
        return { ok: true }
      },
      async startSession(sessionId: string) {
        started.push(sessionId)
        return {
          sessionId,
          status: 'connected',
          updatedAt: Date.now()
        }
      }
    } as any,
    maxSessions: 3,
    parallel: 1,
    batchSize: 0,
    batchDelayMs: 0,
    statusAllowlist: [],
    logger: {
      info: (message, meta) => infoLogs.push({ message, meta })
    }
  })

  assert.deepEqual(started.sort(), ['sess_01', 'sess_02'])
  const skipped = infoLogs.find((entry) => entry.message === 'Auto-restore skipped session')
  assert.equal(skipped?.meta?.reason, 'capacity-exceeded')
})
