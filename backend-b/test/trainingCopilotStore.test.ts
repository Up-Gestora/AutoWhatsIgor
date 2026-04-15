import assert from 'node:assert/strict'
import test from 'node:test'
import { TrainingCopilotStore } from '../src/ai/trainingCopilotStore'

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class FakePool {
  row: Record<string, unknown> | null = null
  readonly queries: string[] = []

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.queries.push(sql)
    const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase()

    if (normalized.startsWith('CREATE TABLE')) {
      return { rowCount: 0, rows: [] }
    }

    if (normalized.startsWith('SELECT SESSION_ID')) {
      const sessionId = String(params[0] ?? '')
      if (!this.row || this.row.session_id !== sessionId) {
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 1, rows: [this.row] }
    }

    if (normalized.startsWith('INSERT INTO')) {
      const now = new Date()
      this.row = {
        session_id: String(params[0] ?? ''),
        messages: params[1] ?? [],
        pending_proposal: params[2] ?? null,
        decisions: params[3] ?? [],
        proposal_seq: Number(params[4] ?? 0),
        created_at: this.row?.created_at ?? now,
        updated_at: now
      }
      return { rowCount: 1, rows: [this.row] }
    }

    if (normalized.startsWith('DELETE FROM')) {
      this.row = null
      return { rowCount: 0, rows: [] }
    }

    throw new Error(`Unsupported query: ${sql}`)
  }
}

test('TrainingCopilotStore init creates table', async () => {
  const pool = new FakePool()
  const store = new TrainingCopilotStore({ pool: pool as any })
  await store.init()
  assert.ok(pool.queries.some((entry) => /CREATE TABLE/i.test(entry)))
})

test('TrainingCopilotStore upsert/get/reset works', async () => {
  const pool = new FakePool()
  const store = new TrainingCopilotStore({ pool: pool as any })

  const saved = await store.upsert('session-1', {
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Oi',
        createdAtMs: Date.now()
      }
    ],
    pendingProposal: {
      id: 'p1',
      seq: 1,
      status: 'pending',
      summary: 'Resumo',
      rationale: null,
      patch: { nomeEmpresa: 'AutoWhats' },
      createdAtMs: Date.now()
    },
    decisions: [],
    proposalSeq: 1
  })

  assert.equal(saved.sessionId, 'session-1')
  assert.equal(saved.messages.length, 1)
  assert.equal(saved.pendingProposal?.id, 'p1')

  const fetched = await store.get('session-1')
  assert.ok(fetched)
  assert.equal(fetched?.pendingProposal?.id, 'p1')

  const reset = await store.reset('session-1')
  assert.equal(reset.pendingProposal, null)
  assert.equal(reset.messages.length, 0)
  assert.equal(reset.decisions.length, 0)
  assert.equal(reset.proposalSeq, 0)
})
