import assert from 'node:assert/strict'
import test from 'node:test'
import { BroadcastWorker } from '../src/broadcasts/worker'

function buildJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-1',
    sessionId: 'session-1',
    listId: 'list-1',
    status: 'running',
    pauseReason: null,
    payload: { type: 'text', text: 'hello' },
    totalCount: 10,
    sentCount: 0,
    failedCount: 0,
    chargedBlocks: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    nextSendAt: Date.now(),
    ...overrides
  } as any
}

test('BroadcastWorker cancels timed-out jobs even with no connected sessions', async () => {
  const cancelCalls: Array<[number, string, number]> = []
  const metricCalls: string[] = []
  const logs: Array<{ message: string; meta?: Record<string, unknown> }> = []

  const worker = new BroadcastWorker({
    pool: {} as any,
    jobStore: {
      cancelJobsBySuccessTimeout: async (timeoutMs: number, reason: string, limit: number) => {
        cancelCalls.push([timeoutMs, reason, limit])
        return [
          buildJob({
            id: 'job-timeout',
            status: 'paused',
            pauseReason: 'session_not_connected'
          })
        ]
      }
    } as any,
    sessionManager: {
      getDiagnostics: () => ({ statuses: [] })
    } as any,
    outboundQueue: {} as any,
    trafficStore: {} as any,
    defaultCountryCode: '55',
    pollIntervalMs: 1000,
    maxInFlight: 1,
    delayMinMs: 1000,
    delayMaxMs: 1000,
    yieldOutboundMs: 1000,
    successTimeoutMs: 120000,
    sendTimeoutMs: 30000,
    logger: {
      info: (message: string, meta?: Record<string, unknown>) => {
        logs.push({ message, ...(meta ? { meta } : {}) })
      }
    },
    metrics: {
      increment: (name: string) => {
        metricCalls.push(name)
      }
    } as any
  })

  ;(worker as any).running = true
  ;(worker as any).scheduleTick = () => undefined
  await (worker as any).tick()

  assert.equal(cancelCalls.length, 1)
  assert.deepEqual(cancelCalls[0], [120000, 'timeout_no_success', 100])
  assert.equal(logs.length, 1)
  assert.equal(metricCalls.filter((name) => name === 'broadcast.jobs.cancelled.timeout').length, 1)
})

test('BroadcastWorker treats send-timeout as item failure instead of fatal job failure', async () => {
  let failJobCalls = 0
  const failedItems: string[] = []
  const countUpdates: Array<{ sentInc?: number; failedInc?: number }> = []

  const pool = {
    connect: async () => ({
      query: async () => ({ rowCount: 0, rows: [] }),
      release: () => undefined
    })
  }

  const worker = new BroadcastWorker({
    pool: pool as any,
    jobStore: {
      lockNextRunnableJob: async () => buildJob(),
      lockNextPendingItem: async () => ({
        id: 123,
        chat_id: '5511999999999@s.whatsapp.net',
        contact_name: 'Contato',
        contact_whatsapp: '5511999999999'
      }),
      scheduleNextSendAt: async () => undefined,
      pauseJob: async () => undefined,
      failJob: async () => {
        failJobCalls += 1
      },
      markItemFailed: async (_client: any, _itemId: number, error: string) => {
        failedItems.push(error)
      },
      incrementJobCounts: async (_client: any, options: { sentInc?: number; failedInc?: number }) => {
        countUpdates.push(options)
      },
      markItemSent: async () => {
        throw new Error('should-not-mark-sent')
      },
      completeJob: async () => {
        throw new Error('should-not-complete-job')
      }
    } as any,
    sessionManager: {
      getSessionStatus: () => ({ status: 'connected' }),
      sendText: async () => new Promise(() => {})
    } as any,
    outboundQueue: {
      hasPendingForSession: async () => false
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
    sendTimeoutMs: 20
  })

  await (worker as any).processOne(['session-1'])

  assert.equal(failJobCalls, 0)
  assert.deepEqual(failedItems, ['send-timeout'])
  assert.equal(countUpdates.length, 1)
  assert.equal(countUpdates[0].sentInc, 0)
  assert.equal(countUpdates[0].failedInc, 1)
})
