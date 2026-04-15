import assert from 'node:assert/strict'
import test from 'node:test'
import { AiResponseStore } from '../src/ai/responseStore'

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class CapturingPool {
  readonly queries: Array<{ sql: string; params: unknown[] }> = []

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.queries.push({ sql, params })
    return { rowCount: 1, rows: [] }
  }
}

test('AiResponseStore.resetForReplay deletes previous AI response state', async () => {
  const pool = new CapturingPool()
  const store = new AiResponseStore({
    pool: pool as any,
    processingTimeoutMs: 300000
  })

  await store.resetForReplay(123)

  const query = pool.queries[0]
  assert.match(query.sql, /DELETE FROM/i)
  assert.match(query.sql, /WHERE inbound_id = \$1/i)
  assert.deepEqual(query.params, [123])
})
