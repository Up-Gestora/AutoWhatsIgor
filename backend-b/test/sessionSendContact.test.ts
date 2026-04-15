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

class ContactDriver implements SessionDriver {
  lastInput?: any

  async start(_sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
    hooks.onReady?.()
    return {
      stop: async () => {},
      sendContact: async (_chatId: string, input: any) => {
        this.lastInput = input
        return { messageId: 'contact-1' }
      }
    }
  }
}

class TextOnlyDriver implements SessionDriver {
  async start(_sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
    hooks.onReady?.()
    return {
      stop: async () => {},
      sendText: async () => ({ messageId: 'text-1' })
    }
  }
}

function createManager(driver: SessionDriver) {
  return new SessionManager({
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
}

test('SessionManager sendContact normalizes whatsapp digits and forwards to driver', async () => {
  const driver = new ContactDriver()
  const manager = createManager(driver)
  const start = await manager.startSession('s1')
  assert.equal(start.status, 'connected')

  try {
    const result = await manager.sendContact('s1', 'c1', {
      contacts: [{ name: 'Comercial', whatsapp: '+55 (11) 98888-7777' }]
    })
    assert.equal(result.messageId, 'contact-1')
    assert.deepEqual(driver.lastInput?.contacts, [{ name: 'Comercial', whatsapp: '5511988887777' }])
  } finally {
    await manager.stopSession('s1', 'test-complete')
  }
})

test('SessionManager sendContact fails when driver does not support contact send', async () => {
  const manager = createManager(new TextOnlyDriver())
  const start = await manager.startSession('s2')
  assert.equal(start.status, 'connected')

  try {
    await assert.rejects(
      manager.sendContact('s2', 'c1', {
        contacts: [{ name: 'Comercial', whatsapp: '5511988887777' }]
      }),
      /session-send-not-supported/
    )
  } finally {
    await manager.stopSession('s2', 'test-complete')
  }
})

test('SessionManager sendContact validates invalid whatsapp', async () => {
  const manager = createManager(new ContactDriver())
  const start = await manager.startSession('s3')
  assert.equal(start.status, 'connected')

  try {
    await assert.rejects(
      manager.sendContact('s3', 'c1', {
        contacts: [{ name: 'Comercial', whatsapp: '123' }]
      }),
      /invalid_whatsapp/
    )
  } finally {
    await manager.stopSession('s3', 'test-complete')
  }
})
