import assert from 'node:assert/strict'
import test from 'node:test'
import { BroadcastJobStore } from '../src/broadcasts/jobStore'
import { BroadcastWorker } from '../src/broadcasts/worker'

function withMockedNow<T>(startMs: number, fn: (advanceTo: (nextMs: number) => void) => Promise<T> | T): Promise<T> | T {
  const originalNow = Date.now
  let nowMs = startMs
  Date.now = () => nowMs
  const advanceTo = (nextMs: number) => {
    nowMs = nextMs
  }
  const restore = () => {
    Date.now = originalNow
  }

  try {
    const result = fn(advanceTo)
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

function buildPausedJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-1',
    sessionId: 'session-1',
    listId: 'list-1',
    status: 'paused',
    pauseReason: 'session_not_connected',
    payload: { type: 'text', text: 'hello' },
    totalCount: 10,
    sentCount: 0,
    failedCount: 0,
    chargedBlocks: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    nextSendAt: null,
    ...overrides
  } as any
}

function buildWorkerHarness() {
  const pauseCalls: Array<{ sessionIds: string[]; reason: string; limit: number }> = []
  const metricCalls: string[] = []
  const logs: Array<{ message: string; meta?: Record<string, unknown> }> = []
  let statuses: Array<{ sessionId: string; status: string }> = []
  let connectCalls = 0

  const worker = new BroadcastWorker({
    pool: {
      connect: async () => {
        connectCalls += 1
        return {
          query: async () => ({ rowCount: 0, rows: [] }),
          release: () => undefined
        }
      }
    } as any,
    jobStore: {
      cancelJobsBySuccessTimeout: async () => [],
      pauseRunningJobsBySessionIds: async (sessionIds: string[], reason: string, limit: number) => {
        pauseCalls.push({ sessionIds, reason, limit })
        return [buildPausedJob()]
      }
    } as any,
    sessionManager: {
      getDiagnostics: () => ({ statuses })
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
    disconnectPauseGraceMs: 45000,
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

  return {
    worker,
    setStatuses: (next: Array<{ sessionId: string; status: string }>) => {
      statuses = next
    },
    pauseCalls,
    metricCalls,
    logs,
    getConnectCalls: () => connectCalls
  }
}

test('BroadcastWorker does not pause running jobs before disconnect grace threshold', async () => {
  await withMockedNow(1000, async (advanceTo) => {
    const harness = buildWorkerHarness()
    harness.setStatuses([{ sessionId: 'session-1', status: 'error' }])

    await (harness.worker as any).tick()
    advanceTo(40000)
    await (harness.worker as any).tick()

    assert.equal(harness.pauseCalls.length, 0)
  })
})

test('BroadcastWorker pauses running jobs after disconnect grace threshold', async () => {
  await withMockedNow(1000, async (advanceTo) => {
    const harness = buildWorkerHarness()
    harness.setStatuses([{ sessionId: 'session-1', status: 'error' }])

    await (harness.worker as any).tick()
    advanceTo(47000)
    await (harness.worker as any).tick()

    assert.equal(harness.pauseCalls.length, 1)
    assert.deepEqual(harness.pauseCalls[0], {
      sessionIds: ['session-1'],
      reason: 'session_not_connected',
      limit: 100
    })
    assert.equal(harness.metricCalls.filter((name) => name === 'broadcast.jobs.paused.disconnect_grace').length, 1)
    assert.equal(harness.logs.length, 1)
    assert.equal(harness.logs[0].message, 'Broadcast job auto-paused by disconnect grace')
  })
})

test('BroadcastWorker clears disconnect timer when session reconnects before grace', async () => {
  await withMockedNow(1000, async (advanceTo) => {
    const harness = buildWorkerHarness()

    harness.setStatuses([{ sessionId: 'session-1', status: 'error' }])
    await (harness.worker as any).tick()

    advanceTo(25000)
    harness.setStatuses([{ sessionId: 'session-1', status: 'connected' }])
    await (harness.worker as any).tick()

    advanceTo(50000)
    harness.setStatuses([{ sessionId: 'session-1', status: 'error' }])
    await (harness.worker as any).tick()

    advanceTo(89000)
    await (harness.worker as any).tick()

    assert.equal(harness.pauseCalls.length, 0)
  })
})

test('BroadcastWorker still reconciles disconnect pauses when no sessions are connected', async () => {
  await withMockedNow(1000, async (advanceTo) => {
    const harness = buildWorkerHarness()
    harness.setStatuses([{ sessionId: 'session-1', status: 'backoff' }])

    await (harness.worker as any).tick()
    advanceTo(47000)
    await (harness.worker as any).tick()

    assert.equal(harness.pauseCalls.length, 1)
    assert.equal(harness.getConnectCalls(), 0)
  })
})

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class CapturingPool {
  readonly queries: Array<{ sql: string; params: unknown[] }> = []
  private readonly results: QueryResult[]

  constructor(results: QueryResult[] = []) {
    this.results = [...results]
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.queries.push({ sql, params })
    if (this.results.length > 0) {
      return this.results.shift()!
    }
    return { rowCount: 0, rows: [] }
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => undefined
    }
  }
}

function buildJobRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-02-12T12:00:00.000Z')
  return {
    session_id: 'session-1',
    job_id: 'job-1',
    list_id: 'list-1',
    status: 'paused',
    pause_reason: 'session_not_connected',
    payload: { type: 'text', text: 'oi' },
    total_count: 10,
    sent_count: 1,
    failed_count: 1,
    charged_blocks: 0,
    created_at: now,
    updated_at: now,
    started_at: now,
    completed_at: null,
    next_send_at: null,
    success_timeout_anchor_at: now,
    ...overrides
  }
}

test('BroadcastJobStore.pauseRunningJobsBySessionIds pauses only running jobs with limit', async () => {
  const pool = new CapturingPool([
    { rowCount: 0, rows: [] }, // BEGIN
    { rowCount: 1, rows: [buildJobRow()] }, // CTE update
    { rowCount: 0, rows: [] } // COMMIT
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const paused = await store.pauseRunningJobsBySessionIds([' session-1 ', '', 'session-1'], 'session_not_connected', 5)
  assert.equal(paused.length, 1)
  assert.equal(paused[0].status, 'paused')
  assert.equal(paused[0].pauseReason, 'session_not_connected')

  const updateQuery = pool.queries[1]
  assert.match(updateQuery.sql, /WHERE status = 'running'/i)
  assert.match(updateQuery.sql, /session_id = ANY\(\$1::text\[\]\)/i)
  assert.match(updateQuery.sql, /LIMIT \$2/i)
  assert.deepEqual(updateQuery.params, [['session-1'], 5, 'session_not_connected'])
})

