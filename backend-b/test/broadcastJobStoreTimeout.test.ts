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
  const now = new Date('2026-02-12T12:00:00.000Z')
  return {
    session_id: 'session-1',
    job_id: 'job-1',
    list_id: 'list-1',
    status: 'cancelled',
    pause_reason: 'timeout_no_success',
    payload: { type: 'text', text: 'oi' },
    total_count: 10,
    sent_count: 1,
    failed_count: 1,
    charged_blocks: 0,
    created_at: now,
    updated_at: now,
    started_at: now,
    completed_at: now,
    next_send_at: null,
    success_timeout_anchor_at: now,
    ...overrides
  }
}

test('BroadcastJobStore init includes success timeout anchor migration and index', async () => {
  const pool = new CapturingPool()
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  await store.init()

  const sqlJoined = pool.queries.map((entry) => entry.sql).join('\n')
  assert.match(sqlJoined, /ADD COLUMN IF NOT EXISTS success_timeout_anchor_at TIMESTAMPTZ/i)
  assert.match(sqlJoined, /ALTER COLUMN success_timeout_anchor_at SET DEFAULT NOW\(\)/i)
  assert.match(sqlJoined, /SET success_timeout_anchor_at = COALESCE\(success_timeout_anchor_at, started_at, created_at, updated_at, NOW\(\)\)/i)
  assert.match(sqlJoined, /_active_timeout_idx/i)
})

test('BroadcastJobStore createJobFromList persists success timeout anchor', async () => {
  const pool = new CapturingPool([
    { rowCount: 0, rows: [] }, // BEGIN
    { rowCount: 0, rows: [] }, // active job check
    {
      rowCount: 1,
      rows: [{ name: 'Contato', whatsapp: '5511999999999' }]
    },
    {
      rowCount: 1,
      rows: [buildJobRow({ status: 'running', pause_reason: null, completed_at: null })]
    },
    { rowCount: 1, rows: [] }, // insert items
    { rowCount: 0, rows: [] } // COMMIT
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const created = await store.createJobFromList({
    sessionId: 'session-1',
    jobId: 'job-1',
    listId: 'list-1',
    payload: { type: 'text', text: 'Olá' }
  })

  assert.equal(created.id, 'job-1')
  const insertSql = pool.queries.find((entry) => entry.sql.includes('INSERT INTO "broadcast_jobs"'))
  assert.ok(insertSql)
  assert.match(insertSql!.sql, /success_timeout_anchor_at/i)
})

test('BroadcastJobStore resumeJob resets success timeout anchor', async () => {
  const pool = new CapturingPool([
    {
      rowCount: 1,
      rows: [buildJobRow({ status: 'running', pause_reason: null, completed_at: null })]
    }
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const resumed = await store.resumeJob('session-1', 'job-1')
  assert.ok(resumed)
  assert.match(pool.queries[0].sql, /success_timeout_anchor_at = NOW\(\)/i)
})

test('BroadcastJobStore cancelJobsBySuccessTimeout cancels pending items and returns cancelled jobs', async () => {
  const pool = new CapturingPool([
    { rowCount: 0, rows: [] }, // BEGIN
    { rowCount: 1, rows: [buildJobRow()] }, // CTE query
    { rowCount: 0, rows: [] } // COMMIT
  ])
  const store = new BroadcastJobStore({
    pool: pool as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  const cancelled = await store.cancelJobsBySuccessTimeout(120000, 'timeout_no_success', 10)
  assert.equal(cancelled.length, 1)
  assert.equal(cancelled[0].status, 'cancelled')
  assert.equal(cancelled[0].pauseReason, 'timeout_no_success')

  const cteQuery = pool.queries[1]
  assert.match(cteQuery.sql, /status = 'running'/i)
  assert.match(cteQuery.sql, /UPDATE "broadcast_items" item/i)
  assert.match(cteQuery.sql, /item\.status = 'pending'/i)
  assert.deepEqual(cteQuery.params, [120000, 10, 'timeout_no_success'])
})

test('BroadcastJobStore incrementJobCounts query keeps timeout anchor tied to sent successes', async () => {
  let capturedSql = ''
  const client = {
    query: async (sql: string) => {
      capturedSql = sql
      return { rowCount: 1, rows: [] }
    }
  }
  const store = new BroadcastJobStore({
    pool: new CapturingPool() as any,
    contactsTableName: 'broadcast_list_contacts',
    maxContactsPerJob: 3000
  })

  await store.incrementJobCounts(client as any, {
    sessionId: 'session-1',
    jobId: 'job-1',
    sentInc: 1,
    failedInc: 0,
    nextSendAtMs: Date.now()
  })

  assert.match(capturedSql, /success_timeout_anchor_at = CASE/i)
  assert.match(capturedSql, /WHEN \$3 > 0 THEN NOW\(\)/i)
})
