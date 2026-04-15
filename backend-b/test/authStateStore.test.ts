import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthStateCrypto } from '../src/auth/crypto'
import { PostgresAuthStateStore } from '../src/auth/postgresStore'

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class FakePool {
  private readonly rows = new Map<string, { payload: string; updatedAt: Date }>()

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalized = sql.trim().toUpperCase()

    if (normalized.startsWith('CREATE TABLE')) {
      return { rowCount: 0, rows: [] }
    }

    if (normalized.includes('SELECT PAYLOAD FROM')) {
      const sessionId = String(params[0])
      const row = this.rows.get(sessionId)
      if (!row) {
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 1, rows: [{ payload: row.payload }] }
    }

    if (normalized.includes('SELECT SESSION_ID, PAYLOAD, UPDATED_AT FROM')) {
      const limit = typeof params[0] === 'number' ? params[0] : undefined
      const entries = Array.from(this.rows.entries()).sort(([a], [b]) => a.localeCompare(b))
      const sliced = limit ? entries.slice(0, limit) : entries
      return {
        rowCount: sliced.length,
        rows: sliced.map(([sessionId, row]) => ({
          session_id: sessionId,
          payload: row.payload,
          updated_at: row.updatedAt
        }))
      }
    }

    if (normalized.includes('SELECT SESSION_ID FROM')) {
      const limit = typeof params[0] === 'number' ? params[0] : undefined
      const entries = Array.from(this.rows.entries()).sort(([, a], [, b]) => b.updatedAt.getTime() - a.updatedAt.getTime())
      const sliced = limit ? entries.slice(0, limit) : entries
      return {
        rowCount: sliced.length,
        rows: sliced.map(([sessionId]) => ({ session_id: sessionId }))
      }
    }

    if (normalized.includes('INSERT INTO')) {
      const sessionId = String(params[0])
      const payload = String(params[1])
      const updatedAt = params.length >= 3 ? new Date(String(params[2])) : new Date()
      this.rows.set(sessionId, { payload, updatedAt })
      return { rowCount: 1, rows: [] }
    }

    if (normalized.includes('DELETE FROM')) {
      const sessionId = String(params[0])
      this.rows.delete(sessionId)
      return { rowCount: 1, rows: [] }
    }

    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      return { rowCount: 0, rows: [] }
    }

    throw new Error(`Unsupported query: ${sql}`)
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => undefined
    }
  }
}

test('PostgresAuthStateStore stores, reads, and deletes payloads', async () => {
  const pool = new FakePool()
  const crypto = AuthStateCrypto.fromSecret('a'.repeat(32))
  const store = new PostgresAuthStateStore({ pool: pool as any, crypto })
  await store.init()

  const payload = { hello: 'world' }
  await store.set('session-1', payload)

  const read = await store.get('session-1')
  assert.deepEqual(read, payload)

  await store.delete('session-1')
  const missing = await store.get('session-1')
  assert.equal(missing, null)
})

test('PostgresAuthStateStore lists sessions by updated time', async () => {
  const pool = new FakePool()
  const crypto = AuthStateCrypto.fromSecret('b'.repeat(32))
  const store = new PostgresAuthStateStore({ pool: pool as any, crypto })
  await store.init()

  await store.set('first', { ok: true })
  await store.set('second', { ok: true })
  await store.set('first', { ok: false })

  const list = await store.listSessionIds(2)
  assert.deepEqual(list, ['first', 'second'])
})

test('PostgresAuthStateStore exports and imports encrypted rows', async () => {
  const pool = new FakePool()
  const crypto = AuthStateCrypto.fromSecret('c'.repeat(32))
  const store = new PostgresAuthStateStore({ pool: pool as any, crypto })
  await store.init()

  await store.set('alpha', { value: 1 })
  await store.set('beta', { value: 2 })

  const rows = await store.exportEncrypted()
  assert.equal(rows.length, 2)

  const targetPool = new FakePool()
  const targetStore = new PostgresAuthStateStore({ pool: targetPool as any, crypto })
  await targetStore.init()
  await targetStore.importEncrypted(rows)

  const alpha = await targetStore.get('alpha')
  const beta = await targetStore.get('beta')
  assert.deepEqual(alpha, { value: 1 })
  assert.deepEqual(beta, { value: 2 })
})
