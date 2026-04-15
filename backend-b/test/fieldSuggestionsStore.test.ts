import assert from 'node:assert/strict'
import test from 'node:test'
import { AiFieldSuggestionStore } from '../src/ai/fieldSuggestionsStore'

type QueryResult = { rowCount: number; rows: Array<Record<string, unknown>> }

class FakePool {
  readonly queries: string[] = []

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.queries.push(sql)
    const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase()

    if (
      normalized.startsWith('CREATE TABLE') ||
      normalized.startsWith('ALTER TABLE') ||
      normalized.startsWith('CREATE INDEX') ||
      normalized.startsWith('CREATE UNIQUE INDEX')
    ) {
      return { rowCount: 0, rows: [] }
    }

    if (normalized.startsWith('INSERT INTO')) {
      return {
        rowCount: 1,
        rows: [
          buildRow({
            id: 100,
            sessionId: String(params[0]),
            chatId: String(params[1]),
            targetType: String(params[2]),
            targetId: String(params[3]),
            inboundId: params[4] as number | null,
            provider: String(params[5]),
            model: String(params[6]),
            status: 'pending',
            base: params[7],
            patch: params[8],
            reason: (params[9] as string | null) ?? null,
            appliedPatch: null,
            decisionSource: null,
            decisionActorRole: null,
            decisionActorUid: null
          })
        ]
      }
    }

    if (normalized.includes("SET STATUS = 'ACCEPTED'")) {
      return {
        rowCount: 1,
        rows: [
          buildRow({
            id: Number(params[1]),
            sessionId: String(params[0]),
            chatId: 'chat-1',
            targetType: 'lead',
            targetId: 'target-1',
            inboundId: null,
            provider: 'openai',
            model: 'gpt-test',
            status: 'accepted',
            base: {},
            patch: {},
            reason: null,
            appliedPatch: params[2],
            decisionSource: (params[3] as string | null) ?? null,
            decisionActorRole: (params[4] as string | null) ?? null,
            decisionActorUid: (params[5] as string | null) ?? null
          })
        ]
      }
    }

    if (normalized.includes("SET STATUS = 'REJECTED'")) {
      return {
        rowCount: 1,
        rows: [
          buildRow({
            id: Number(params[1]),
            sessionId: String(params[0]),
            chatId: 'chat-1',
            targetType: 'client',
            targetId: 'target-2',
            inboundId: null,
            provider: 'openai',
            model: 'gpt-test',
            status: 'rejected',
            base: {},
            patch: {},
            reason: null,
            appliedPatch: null,
            decisionSource: (params[2] as string | null) ?? null,
            decisionActorRole: (params[3] as string | null) ?? null,
            decisionActorUid: (params[4] as string | null) ?? null
          })
        ]
      }
    }

    throw new Error(`Unsupported query: ${sql}`)
  }
}

function buildRow(input: {
  id: number
  sessionId: string
  chatId: string
  targetType: string
  targetId: string
  inboundId: number | null
  provider: string
  model: string
  status: string
  base: unknown
  patch: unknown
  reason: string | null
  appliedPatch: unknown
  decisionSource: string | null
  decisionActorRole: string | null
  decisionActorUid: string | null
}) {
  return {
    id: input.id,
    session_id: input.sessionId,
    chat_id: input.chatId,
    target_type: input.targetType,
    target_id: input.targetId,
    inbound_id: input.inboundId,
    provider: input.provider,
    model: input.model,
    status: input.status,
    base: input.base,
    patch: input.patch,
    reason: input.reason,
    applied_patch: input.appliedPatch,
    created_at: new Date(0),
    updated_at: new Date(0),
    decided_at: new Date(0),
    applied_at: new Date(0),
    decision_source: input.decisionSource,
    decision_actor_role: input.decisionActorRole,
    decision_actor_uid: input.decisionActorUid
  }
}

test('AiFieldSuggestionStore init adds decision columns without migration', async () => {
  const pool = new FakePool()
  const store = new AiFieldSuggestionStore({ pool: pool as any })

  await store.init()

  const allSql = pool.queries.join('\n')
  assert.match(allSql, /ADD COLUMN IF NOT EXISTS decision_source/i)
  assert.match(allSql, /ADD COLUMN IF NOT EXISTS decision_actor_role/i)
  assert.match(allSql, /ADD COLUMN IF NOT EXISTS decision_actor_uid/i)
})

test('AiFieldSuggestionStore upsertPending clears decision metadata', async () => {
  const pool = new FakePool()
  const store = new AiFieldSuggestionStore({ pool: pool as any })

  const row = await store.upsertPending({
    sessionId: 's1',
    chatId: 'c1',
    targetType: 'lead',
    targetId: 't1',
    inboundId: 99,
    provider: 'openai',
    model: 'gpt-test',
    base: { status: 'novo' },
    patch: { status: 'em_processo' },
    reason: 'Teste'
  })

  assert.equal(row.status, 'pending')
  assert.equal(row.decisionSource, null)
  assert.equal(row.decisionActorRole, null)
  assert.equal(row.decisionActorUid, null)

  const upsertSql = pool.queries.find((entry) => entry.includes('ON CONFLICT'))
  assert.ok(upsertSql)
  assert.match(upsertSql!, /decision_source = NULL/i)
  assert.match(upsertSql!, /decision_actor_role = NULL/i)
  assert.match(upsertSql!, /decision_actor_uid = NULL/i)
})

test('AiFieldSuggestionStore markAccepted and markRejected store decision metadata', async () => {
  const pool = new FakePool()
  const store = new AiFieldSuggestionStore({ pool: pool as any })

  const accepted = await store.markAccepted('s1', 7, { status: 'vip' }, {
    source: 'manual',
    actorRole: 'admin',
    actorUid: 'uid-admin-1'
  })
  assert.ok(accepted)
  assert.equal(accepted?.status, 'accepted')
  assert.equal(accepted?.decisionSource, 'manual')
  assert.equal(accepted?.decisionActorRole, 'admin')
  assert.equal(accepted?.decisionActorUid, 'uid-admin-1')

  const rejected = await store.markRejected('s1', 8, {
    source: 'automatic',
    actorRole: 'system',
    actorUid: null
  })
  assert.ok(rejected)
  assert.equal(rejected?.status, 'rejected')
  assert.equal(rejected?.decisionSource, 'automatic')
  assert.equal(rejected?.decisionActorRole, 'system')
  assert.equal(rejected?.decisionActorUid, null)
})
