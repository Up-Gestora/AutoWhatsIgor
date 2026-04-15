import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuthStateStore } from '../src/auth/types'
import type { SessionDriver, SessionDriverHandle, SessionDriverHooks } from '../src/sessions/types'
import { SessionManager } from '../src/sessions/sessionManager'
import { MetricsStore } from '../src/observability/metrics'

class FakeLock {
  released = false

  async renew() {
    return true
  }

  async release() {
    this.released = true
  }
}

class FakeLockManager {
  unavailable = new Set<string>()
  locks = new Map<string, FakeLock>()

  async acquire(sessionId: string) {
    if (this.unavailable.has(sessionId)) {
      return null
    }
    const lock = new FakeLock()
    this.locks.set(sessionId, lock)
    return lock
  }
}

type DriverMode = 'ready' | 'error'

class FakeDriver implements SessionDriver {
  mode: DriverMode
  lastHooks?: SessionDriverHooks

  constructor(mode: DriverMode) {
    this.mode = mode
  }

  async start(sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
    this.lastHooks = hooks
    if (this.mode === 'ready') {
      hooks.onReady?.()
    } else {
      hooks.onError?.(new Error('start-failed'))
    }

    return {
      stop: async () => {
        // SessionManager already updates status on explicit stop/purge.
      },
      sendText: async () => ({ messageId: `msg-${sessionId}` })
    }
  }
}

class FakeAuthStore implements AuthStateStore {
  deleted: string[] = []

  async get(_sessionId: string) {
    return null
  }

  async set(_sessionId: string, _state: Record<string, unknown>) {
    // no-op
  }

  async delete(sessionId: string) {
    this.deleted.push(sessionId)
  }
}

function createSessionManager(options: {
  mode: DriverMode
  maxSessions?: number
  shardCount?: number
  shardIndex?: number
  metrics?: MetricsStore
  authStore?: AuthStateStore
}) {
  const lockManager = new FakeLockManager()
  const driver = new FakeDriver(options.mode)
  const metrics = options.metrics ?? new MetricsStore()
  const manager = new SessionManager({
    driver,
    lockManager: lockManager as any,
    authStore: options.authStore,
    logger: {},
    metrics,
    maxSessions: options.maxSessions ?? 0,
    shardCount: options.shardCount ?? 0,
    shardIndex: options.shardIndex ?? 0,
    startTimeoutMs: 5000,
    startConcurrency: 1,
    lockTtlMs: 1000,
    lockRenewMs: 60000,
    backoffBaseMs: 60000,
    backoffMaxMs: 120000,
    backoffResetMs: 600000
  })

  return { manager, driver, lockManager, metrics }
}

test('SessionManager starts and stops sessions', async () => {
  const { manager } = createSessionManager({ mode: 'ready' })
  const start = await manager.startSession('s1')
  assert.equal(start.status, 'connected')

  const stop = await manager.stopSession('s1', 'manual')
  assert.equal(stop.status, 'stopped')
})

test('SessionManager enters backoff after start error', async () => {
  const { manager } = createSessionManager({ mode: 'error' })
  const start = await manager.startSession('s2')
  assert.equal(start.status, 'error')

  const retry = await manager.startSession('s2')
  assert.equal(retry.status, 'backoff')
})

test('SessionManager enforces max sessions', async () => {
  const { manager } = createSessionManager({ mode: 'ready', maxSessions: 1 })
  const first = await manager.startSession('s3')
  assert.equal(first.status, 'connected')

  const second = await manager.startSession('s4')
  assert.equal(second.status, 'error')
  assert.equal(second.reason, 'capacity-exceeded')

  await manager.stopSession('s3', 'cleanup')
})

test('SessionManager increments reconnect metrics', async () => {
  const metrics = new MetricsStore()
  const { manager } = createSessionManager({ mode: 'ready', metrics })

  await manager.startSession('s5')
  await manager.stopSession('s5')
  await manager.startSession('s5')

  const reconnects = metrics.getCounter('sessions.reconnects')
  assert.equal(reconnects, 1)

  await manager.stopSession('s5', 'cleanup')
})

test('SessionManager rejects sessions outside shard', () => {
  const { manager } = createSessionManager({ mode: 'ready', shardCount: 2, shardIndex: 0 })
  let mismatchId = ''

  for (let i = 0; i < 50; i += 1) {
    const candidate = `shard-${i}`
    const decision = manager.canHandleSession(candidate)
    if (!decision.ok && decision.reason === 'shard-mismatch') {
      mismatchId = candidate
      break
    }
  }

  assert.ok(mismatchId.length > 0)
  const decision = manager.canHandleSession(mismatchId)
  assert.equal(decision.ok, false)
  assert.equal(decision.reason, 'shard-mismatch')
})

test('SessionManager purges sessions with custom reason', async () => {
  const authStore = new FakeAuthStore()
  const { manager } = createSessionManager({ mode: 'ready', authStore })

  await manager.startSession('purge-1')
  const snapshot = await manager.purgeSession('purge-1', 'auto-purge:bad-decrypt')

  assert.equal(snapshot.status, 'stopped')
  assert.equal(snapshot.reason, 'auto-purge:bad-decrypt')
  assert.deepEqual(authStore.deleted, ['purge-1'])
  assert.equal(manager.getSessionStatus('purge-1'), null)
})

test('SessionManager checks WhatsApp numbers via session handle', async () => {
  class LookupDriver implements SessionDriver {
    async start(_sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
      hooks.onReady?.()
      return {
        stop: async () => {
          // no-op
        },
        checkWhatsappNumbers: async (phoneNumbers: string[]) =>
          phoneNumbers.map((phoneNumber) => ({
            phoneNumber,
            jid: `${phoneNumber}@s.whatsapp.net`,
            exists: phoneNumber.endsWith('11')
          }))
      }
    }
  }

  const manager = new SessionManager({
    driver: new LookupDriver(),
    lockManager: new FakeLockManager() as any,
    logger: {},
    metrics: new MetricsStore(),
    maxSessions: 0,
    startTimeoutMs: 5000,
    startConcurrency: 1,
    lockTtlMs: 1000,
    lockRenewMs: 60000,
    backoffBaseMs: 60000,
    backoffMaxMs: 120000,
    backoffResetMs: 600000
  })

  await manager.startSession('lookup-1')
  const result = await manager.checkWhatsappNumbers('lookup-1', ['55 11 99999-1111', '5511988882222'])

  assert.deepEqual(result, [
    { phoneNumber: '5511999991111', jid: '5511999991111@s.whatsapp.net', exists: true },
    { phoneNumber: '5511988882222', jid: '5511988882222@s.whatsapp.net', exists: false }
  ])

  await manager.stopSession('lookup-1', 'cleanup')
})
