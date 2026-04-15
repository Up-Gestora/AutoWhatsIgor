import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionDriver, SessionDriverHandle, SessionDriverHooks } from '../src/sessions/types'
import { SessionManager } from '../src/sessions/sessionManager'

class FakeLock {
  async renew() {
    return true
  }

  async release() {
    // no-op
  }
}

class FakeLockManager {
  async acquire() {
    return new FakeLock()
  }
}

class FakeDriver implements SessionDriver {
  sent: string[] = []

  async start(_sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
    hooks.onReady?.()
    return {
      stop: async () => {},
      sendText: async (_chatId: string, text: string) => {
        // Make ordering visible even when callers enqueue quickly.
        await new Promise((resolve) => setTimeout(resolve, 5))
        this.sent.push(text)
        return { messageId: `m-${this.sent.length}` }
      }
    }
  }
}

test('SessionManager prioritizes high-priority sends over low-priority sends', async () => {
  const driver = new FakeDriver()
  const manager = new SessionManager({
    driver,
    lockManager: new FakeLockManager() as any,
    logger: {},
    maxSessions: 0,
    shardCount: 0,
    shardIndex: 0,
    startTimeoutMs: 5000,
    startConcurrency: 1,
    lockTtlMs: 1000,
    lockRenewMs: 1000,
    backoffBaseMs: 1000,
    backoffMaxMs: 1000,
    backoffResetMs: 1000
  })

  const start = await manager.startSession('s1')
  assert.equal(start.status, 'connected')

  try {
    const low = manager.sendText('s1', 'c1', 'low', { priority: 'low' })
    const high = manager.sendText('s1', 'c1', 'high', { priority: 'high' })
    await Promise.all([low, high])

    assert.deepEqual(driver.sent, ['high', 'low'])
  } finally {
    await manager.stopSession('s1', 'test-complete')
  }
})
