import assert from 'node:assert/strict'
import test from 'node:test'
import { OutboundMessageStore } from '../src/messages/outboundStore'

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class CapturingPool {
  readonly queries: Array<{ sql: string; params: unknown[] }> = []
  private readonly results: QueryResult[]

  constructor(results: QueryResult[]) {
    this.results = [...results]
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.queries.push({ sql, params })
    if (this.results.length > 0) {
      return this.results.shift()!
    }
    return { rowCount: 0, rows: [] }
  }
}

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    session_id: 'session-1',
    chat_id: '5511999999999@s.whatsapp.net',
    request_id: 'ai:175033:0',
    payload_hash: 'hash-1',
    status: 'failed',
    attempts: 4,
    message_id: null,
    error: 'session-not-connected',
    payload: { type: 'text', text: 'Mensagem', origin: 'ai' },
    created_at: new Date('2026-03-12T14:29:51.000Z'),
    updated_at: new Date('2026-03-12T14:30:01.000Z'),
    ...overrides
  }
}

test('OutboundMessageStore.listDisconnectedRecoveryCandidates filters disconnected failed rows by window', async () => {
  const pool = new CapturingPool([{ rowCount: 1, rows: [buildRow()] }])
  const store = new OutboundMessageStore({ pool: pool as any })

  const rows = await store.listDisconnectedRecoveryCandidates({
    sessionId: 'session-1',
    fromMs: Date.parse('2026-03-12T14:29:44.000Z'),
    toMs: Date.parse('2026-03-13T15:27:31.000Z'),
    error: 'session-not-connected'
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.id, 42)
  assert.equal(rows[0]?.status, 'failed')

  const query = pool.queries[0]
  assert.match(query.sql, /status = 'failed'/i)
  assert.match(query.sql, /message_id IS NULL/i)
  assert.match(query.sql, /created_at >= to_timestamp/i)
  assert.match(query.sql, /created_at <= to_timestamp/i)
  assert.deepEqual(query.params, [
    'session-1',
    Date.parse('2026-03-12T14:29:44.000Z'),
    Date.parse('2026-03-13T15:27:31.000Z'),
    ['session-not-connected']
  ])
})

test('OutboundMessageStore.listDisconnectedRecoveryCandidates accepts multiple disconnection errors', async () => {
  const pool = new CapturingPool([{ rowCount: 1, rows: [buildRow({ error: 'session-not-ready' })] }])
  const store = new OutboundMessageStore({ pool: pool as any })

  const rows = await store.listDisconnectedRecoveryCandidates({
    sessionId: 'session-1',
    fromMs: Date.parse('2026-03-12T14:29:44.000Z'),
    toMs: Date.parse('2026-03-13T15:27:31.000Z'),
    errors: ['session-not-connected', 'session-not-ready']
  })

  assert.equal(rows.length, 1)

  const query = pool.queries[0]
  assert.match(query.sql, /error = ANY\(\$4::text\[\]\)/i)
  assert.deepEqual(query.params, [
    'session-1',
    Date.parse('2026-03-12T14:29:44.000Z'),
    Date.parse('2026-03-13T15:27:31.000Z'),
    ['session-not-connected', 'session-not-ready']
  ])
})

test('OutboundMessageStore.resetForReplay clears attempts and error before requeue', async () => {
  const pool = new CapturingPool([
    {
      rowCount: 1,
      rows: [
        buildRow({
          status: 'queued',
          attempts: 0,
          error: null
        })
      ]
    }
  ])
  const store = new OutboundMessageStore({ pool: pool as any })

  const row = await store.resetForReplay(42)

  assert.ok(row)
  assert.equal(row?.status, 'queued')
  assert.equal(row?.attempts, 0)
  assert.equal(row?.error, null)

  const query = pool.queries[0]
  assert.match(query.sql, /SET status = 'queued'/i)
  assert.match(query.sql, /attempts = 0/i)
  assert.match(query.sql, /error = NULL/i)
  assert.deepEqual(query.params, [42])
})
