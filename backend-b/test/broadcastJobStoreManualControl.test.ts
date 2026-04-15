import assert from 'node:assert/strict'
import test from 'node:test'
import { BroadcastJobStore } from '../src/broadcasts/jobStore'

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
  const now = new Date('2026-02-13T12:00:00.000Z')
  return {
    session_id: 'session-1',
    job_id: 'job-1',
    list_id: 'list-1',
    status: 'running',
    pause_reason: null,
    payload: { type: 'text', text: 'oi' },
    total_count: 10,
    sent_count: 2,
    failed_count: 1,
    charged_blocks: 0,
    created_at: now,
    updated_at: now,
    started_at: now,
    completed_at: null,
    next_send_at: now,
    success_timeout_anchor_at: now,
    ...overrides
  }
}

test('BroadcastJobStore.pauseJobById pauses only running jobs', async () => {
  const pool = new CapturingPool([
    {
      rowCount: 1,
      rows: [buildJobRow({ status: 'paused', pause_reason: 'manual_pause', next_send_at: null })]
    }
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const paused = await store.pauseJobById('session-1', 'job-1', 'manual_pause')
  assert.ok(paused)
  assert.equal(paused.status, 'paused')
  assert.equal(paused.pauseReason, 'manual_pause')

  const query = pool.queries[0]
  assert.match(query.sql, /WHERE session_id = \$1 AND job_id = \$2 AND status = 'running'/i)
  assert.deepEqual(query.params, ['session-1', 'job-1', 'manual_pause'])
})

test('BroadcastJobStore.pauseJobById returns null when job is not running', async () => {
  const pool = new CapturingPool([{ rowCount: 0, rows: [] }])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const paused = await store.pauseJobById('session-1', 'job-1', 'manual_pause')
  assert.equal(paused, null)
})

test('BroadcastJobStore.resumeCancelledJobFromCancelledItems reactivates only cancelled items', async () => {
  const pool = new CapturingPool([
    { rowCount: 0, rows: [] }, // BEGIN
    { rowCount: 1, rows: [{ session_id: 'session-1' }] }, // lock cancelled job
    { rowCount: 0, rows: [] }, // active check
    { rowCount: 3, rows: [] }, // reactivated cancelled items
    { rowCount: 1, rows: [{ total_count: 10, sent_count: 4, failed_count: 2 }] }, // item counts
    {
      rowCount: 1,
      rows: [
        buildJobRow({
          status: 'running',
          pause_reason: null,
          total_count: 10,
          sent_count: 4,
          failed_count: 2,
          completed_at: null
        })
      ]
    }, // job update
    { rowCount: 0, rows: [] } // COMMIT
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const resumed = await store.resumeCancelledJobFromCancelledItems('session-1', 'job-1')
  assert.ok(resumed)
  assert.equal(resumed.status, 'running')
  assert.equal(resumed.sentCount, 4)
  assert.equal(resumed.failedCount, 2)
  assert.equal(resumed.pauseReason, null)

  const reactivateQuery = pool.queries.find((entry) => entry.sql.includes('UPDATE "broadcast_items"'))
  assert.ok(reactivateQuery)
  assert.match(reactivateQuery!.sql, /status = 'cancelled'/i)
  assert.deepEqual(reactivateQuery!.params, ['session-1', 'job-1'])
})

test('BroadcastJobStore.resumeCancelledJobFromCancelledItems returns null without cancelled items', async () => {
  const pool = new CapturingPool([
    { rowCount: 0, rows: [] }, // BEGIN
    { rowCount: 1, rows: [{ session_id: 'session-1' }] }, // lock cancelled job
    { rowCount: 0, rows: [] }, // active check
    { rowCount: 0, rows: [] }, // no cancelled items to reactivate
    { rowCount: 0, rows: [] } // COMMIT
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const resumed = await store.resumeCancelledJobFromCancelledItems('session-1', 'job-1')
  assert.equal(resumed, null)
})

test('BroadcastJobStore.resumeCancelledJobFromCancelledItems blocks when another job is active', async () => {
  const pool = new CapturingPool([
    { rowCount: 0, rows: [] }, // BEGIN
    { rowCount: 1, rows: [{ session_id: 'session-1' }] }, // lock cancelled job
    { rowCount: 1, rows: [{ job_id: 'job-2' }] }, // active check
    { rowCount: 0, rows: [] } // ROLLBACK
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  await assert.rejects(() => store.resumeCancelledJobFromCancelledItems('session-1', 'job-1'), /broadcast_job_active_exists/)
  const rollbackQuery = pool.queries.at(-1)
  assert.ok(rollbackQuery)
  assert.equal(rollbackQuery!.sql, 'ROLLBACK')
})
