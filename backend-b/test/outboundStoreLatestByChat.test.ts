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
    id: 7,
    session_id: 'session-1',
    chat_id: '5511999999999@s.whatsapp.net',
    request_id: null,
    payload_hash: 'hash-1',
    status: 'sent',
    attempts: 1,
    message_id: 'msg-1',
    error: null,
    payload: { type: 'text', text: 'Oi' },
    created_at: new Date('2026-02-27T10:00:00.000Z'),
    updated_at: new Date('2026-02-27T10:00:10.000Z'),
    ...overrides
  }
}

test('OutboundMessageStore.getLatestByChat returns latest outbound message', async () => {
  const pool = new CapturingPool([{ rowCount: 1, rows: [buildRow()] }])
  const store = new OutboundMessageStore({ pool: pool as any })

  const record = await store.getLatestByChat('session-1', '5511999999999@s.whatsapp.net')

  assert.ok(record)
  assert.equal(record.id, 7)
  assert.equal(record.status, 'sent')
  assert.equal(record.chatId, '5511999999999@s.whatsapp.net')

  const query = pool.queries[0]
  assert.match(query.sql, /ORDER BY created_at DESC/i)
  assert.match(query.sql, /LIMIT 1/i)
  assert.deepEqual(query.params, ['session-1', '5511999999999@s.whatsapp.net'])
})

test('OutboundMessageStore.getLatestByChat returns null when chat has no outbound', async () => {
  const pool = new CapturingPool([{ rowCount: 0, rows: [] }])
  const store = new OutboundMessageStore({ pool: pool as any })

  const record = await store.getLatestByChat('session-1', '5511999999999@s.whatsapp.net')
  assert.equal(record, null)
})