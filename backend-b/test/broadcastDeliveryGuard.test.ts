import assert from 'node:assert/strict'
import test from 'node:test'
import { BroadcastWorker } from '../src/broadcasts/worker'
import type { OutboundMessageStatus } from '../src/messages/outboundTypes'

type LatestOutbound = {
  status: OutboundMessageStatus
  updatedAtMs: number
  createdAtMs: number
}

type HarnessOptions = {
  latestOutbound?: LatestOutbound | null
  lookupError?: boolean
  guardEnabled?: boolean
}

function withMockedNow<T>(startMs: number, fn: () => Promise<T> | T): Promise<T> | T {
  const originalNow = Date.now
  Date.now = () => startMs
  const restore = () => {
    Date.now = originalNow
  }

  try {
    const result = fn()
    if (result && typeof (result as Promise<T>).then === 'function') {
      return (result as Promise<T>).finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

function createHarness(options: HarnessOptions = {}) {
  const metricCalls: string[] = []
  const failedErrors: string[] = []
  const incrementCalls: Array<{ sentInc?: number; failedInc?: number; nextSendAtMs?: number | null }> = []
  const deleteCalls: Array<{ sessionId: string; listId: string; whatsapp: string }> = []
  let sendTextCalls = 0
  let markSentCalls = 0

  const jobPayload =
    options.guardEnabled === false
      ? { type: 'text' as const, text: 'hello', removeContactIfLastMessageUndelivered: false }
      : { type: 'text' as const, text: 'hello', removeContactIfLastMessageUndelivered: true }

  const job = {
    id: 'job-1',
    sessionId: 'session-1',
    listId: 'list-1',
    status: 'running',
    pauseReason: null,
    payload: jobPayload,
    totalCount: 1,
    sentCount: 0,
    failedCount: 0,
    chargedBlocks: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    nextSendAt: Date.now()
  }

  const item = {
    id: 101,
    chat_id: '5511999999999@s.whatsapp.net',
    contact_name: 'Contato',
    contact_whatsapp: '5511999999999'
  }

  const client = {
    query: async () => ({ rowCount: 0, rows: [] }),
    release: () => undefined
  }

  const worker = new BroadcastWorker({
    pool: {
      connect: async () => client
    } as any,
    jobStore: {
      lockNextRunnableJob: async () => job,
      lockNextPendingItem: async () => item,
      scheduleNextSendAt: async () => undefined,
      pauseJob: async () => undefined,
      completeJob: async () => undefined,
      incrementJobCounts: async (_client: any, opts: { sentInc?: number; failedInc?: number; nextSendAtMs?: number | null }) => {
        incrementCalls.push(opts)
      },
      markItemSent: async () => {
        markSentCalls += 1
      },
      markItemFailed: async (_client: any, _itemId: number, error: string) => {
        failedErrors.push(error)
      },
      deleteContactByWhatsapp: async (_client: any, sessionId: string, listId: string, whatsapp: string) => {
        deleteCalls.push({ sessionId, listId, whatsapp })
        return true
      },
      failJob: async () => undefined
    } as any,
    sessionManager: {
      getSessionStatus: () => ({ status: 'connected' }),
      sendText: async () => {
        sendTextCalls += 1
        return { messageId: 'msg-1' }
      }
    } as any,
    outboundQueue: {
      hasPendingForSession: async () => false
    } as any,
    outboundStore: {
      getLatestByChat: async () => {
        if (options.lookupError) {
          throw new Error('lookup-failed')
        }
        return options.latestOutbound ?? null
      }
    } as any,
    trafficStore: {
      hasRecentInbound: async () => false
    } as any,
    defaultCountryCode: '55',
    pollIntervalMs: 1000,
    maxInFlight: 1,
    delayMinMs: 1000,
    delayMaxMs: 1000,
    yieldOutboundMs: 1000,
    successTimeoutMs: 120000,
    sendTimeoutMs: 30000,
    metrics: {
      increment: (name: string) => {
        metricCalls.push(name)
      }
    } as any
  })

  return {
    run: async () => {
      await (worker as any).processOne(['session-1'])
    },
    metricCalls,
    failedErrors,
    incrementCalls,
    deleteCalls,
    getSendTextCalls: () => sendTextCalls,
    getMarkSentCalls: () => markSentCalls
  }
}

test('BroadcastWorker auto-removes contact when latest outbound failed', async () => {
  const harness = createHarness({
    latestOutbound: {
      status: 'failed',
      updatedAtMs: Date.now() - 60_000,
      createdAtMs: Date.now() - 120_000
    }
  })

  await harness.run()

  assert.equal(harness.getSendTextCalls(), 0)
  assert.equal(harness.getMarkSentCalls(), 0)
  assert.equal(harness.deleteCalls.length, 1)
  assert.equal(harness.failedErrors.length, 1)
  assert.match(harness.failedErrors[0], /^auto_removed_last_message_undelivered:status_failed:/)
  assert.ok(harness.metricCalls.includes('broadcast.items.auto_removed.last_undelivered'))
})

test('BroadcastWorker auto-removes contact when latest outbound is stale sent', async () => {
  await withMockedNow(10 * 60 * 1000, async () => {
    const now = Date.now()
    const harness = createHarness({
      latestOutbound: {
        status: 'sent',
        updatedAtMs: now - (5 * 60 * 1000 + 1_000),
        createdAtMs: now - (5 * 60 * 1000 + 2_000)
      }
    })

    await harness.run()

    assert.equal(harness.getSendTextCalls(), 0)
    assert.equal(harness.failedErrors.length, 1)
    assert.match(harness.failedErrors[0], /^auto_removed_last_message_undelivered:status_sent_timeout:/)
  })
})

test('BroadcastWorker does not block when latest outbound is deliverable or absent', async () => {
  await withMockedNow(10 * 60 * 1000, async () => {
    const now = Date.now()
    const scenarios: Array<{ name: string; latestOutbound: LatestOutbound | null }> = [
      { name: 'queued', latestOutbound: { status: 'queued', updatedAtMs: now - 10_000, createdAtMs: now - 20_000 } },
      { name: 'sending', latestOutbound: { status: 'sending', updatedAtMs: now - 10_000, createdAtMs: now - 20_000 } },
      { name: 'retrying', latestOutbound: { status: 'retrying', updatedAtMs: now - 10_000, createdAtMs: now - 20_000 } },
      { name: 'delivered', latestOutbound: { status: 'delivered', updatedAtMs: now - 10_000, createdAtMs: now - 20_000 } },
      { name: 'read', latestOutbound: { status: 'read', updatedAtMs: now - 10_000, createdAtMs: now - 20_000 } },
      { name: 'sent_recent', latestOutbound: { status: 'sent', updatedAtMs: now - 2 * 60 * 1000, createdAtMs: now - 2 * 60 * 1000 } },
      { name: 'no_latest', latestOutbound: null }
    ]

    for (const scenario of scenarios) {
      const harness = createHarness({ latestOutbound: scenario.latestOutbound })
      await harness.run()
      assert.equal(harness.getSendTextCalls(), 1, scenario.name)
      assert.equal(harness.getMarkSentCalls(), 1, scenario.name)
      assert.equal(harness.failedErrors.length, 0, scenario.name)
      assert.equal(harness.deleteCalls.length, 0, scenario.name)
    }
  })
})

test('BroadcastWorker fails open when latest outbound lookup errors', async () => {
  const harness = createHarness({ lookupError: true })

  await harness.run()

  assert.equal(harness.getSendTextCalls(), 1)
  assert.equal(harness.getMarkSentCalls(), 1)
  assert.ok(harness.metricCalls.includes('broadcast.guard.last_outbound.lookup_failed'))
})

test('BroadcastWorker ignores guard when removeContactIfLastMessageUndelivered=false', async () => {
  const harness = createHarness({
    guardEnabled: false,
    latestOutbound: {
      status: 'failed',
      updatedAtMs: Date.now() - 60_000,
      createdAtMs: Date.now() - 120_000
    }
  })

  await harness.run()

  assert.equal(harness.getSendTextCalls(), 1)
  assert.equal(harness.getMarkSentCalls(), 1)
  assert.equal(harness.failedErrors.length, 0)
  assert.equal(harness.deleteCalls.length, 0)
})