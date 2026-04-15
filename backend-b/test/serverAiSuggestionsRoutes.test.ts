import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    sessionId: 'session-1',
    chatId: 'chat-1',
    targetType: 'lead',
    targetId: 'target-1',
    inboundId: null,
    provider: 'openai',
    model: 'gpt-test',
    status: 'pending',
    base: {
      name: 'Ana',
      whatsapp: '5511999999999',
      status: 'novo',
      observations: null,
      nextContactAt: null
    },
    patch: {
      status: 'em_processo'
    },
    reason: 'Fez pergunta sobre valor',
    appliedPatch: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    decidedAt: null,
    appliedAt: null,
    decisionSource: null,
    decisionActorRole: null,
    decisionActorUid: null,
    ...overrides
  }
}

test('ai suggestions GET supports status=all and keeps default pending when omitted', async () => {
  let filtersFromAll: any = null
  let filtersFromDefault: any = null
  let calls = 0

  const app = buildServer(baseEnv, {
    suggestionStore: {
      listBySession: async (_sessionId: string, filters: any) => {
        calls += 1
        if (calls === 1) {
          filtersFromAll = filters
          return [
            buildSuggestion({ id: 1, status: 'pending' }),
            buildSuggestion({ id: 2, status: 'accepted' }),
            buildSuggestion({ id: 3, status: 'rejected' })
          ]
        }
        filtersFromDefault = filters
        return [buildSuggestion({ id: 4, status: 'pending' })]
      }
    } as any
  })

  try {
    const allResponse = await app.inject({
      method: 'GET',
      url: '/sessions/session-1/ai-suggestions?status=all',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(allResponse.statusCode, 200)
    const allBody = allResponse.json() as any
    assert.equal(allBody.success, true)
    assert.equal(allBody.suggestions.length, 3)
    assert.equal(filtersFromAll.status, undefined)

    const defaultResponse = await app.inject({
      method: 'GET',
      url: '/sessions/session-1/ai-suggestions',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(defaultResponse.statusCode, 200)
    const defaultBody = defaultResponse.json() as any
    assert.equal(defaultBody.success, true)
    assert.equal(defaultBody.suggestions.length, 1)
    assert.equal(filtersFromDefault.status, 'pending')
  } finally {
    await app.close()
  }
})

test('ai suggestions GET rejects invalid status', async () => {
  const app = buildServer(baseEnv, {
    suggestionStore: {
      listBySession: async () => []
    } as any
  })

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/session-1/ai-suggestions?status=invalid',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 400)
    const body = response.json() as any
    assert.equal(body.error, 'invalid_status')
  } finally {
    await app.close()
  }
})

test('ai suggestions accept persists manual decision metadata', async () => {
  let acceptedDecision: any = null
  let acceptedPatch: any = null

  const app = buildServer(baseEnv, {
    suggestionStore: {
      get: async () => buildSuggestion({ id: 42, status: 'pending', targetType: 'lead' }),
      markAccepted: async (_sessionId: string, _id: number, patch: any, decision: any) => {
        acceptedPatch = patch
        acceptedDecision = decision
        return buildSuggestion({ id: 42, status: 'accepted', appliedPatch: patch, decisionSource: decision?.source })
      }
    } as any,
    leadStore: {
      update: async () => ({ id: 'target-1' })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-suggestions/42/accept',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        decisionSource: 'manual',
        decisionActorRole: 'admin',
        decisionActorUid: 'uid-admin-1'
      }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(acceptedPatch, { status: 'em_processo' })
    assert.deepEqual(acceptedDecision, {
      source: 'manual',
      actorRole: 'admin',
      actorUid: 'uid-admin-1'
    })
  } finally {
    await app.close()
  }
})

test('ai suggestions reject persists manual decision metadata', async () => {
  let rejectedDecision: any = null

  const app = buildServer(baseEnv, {
    suggestionStore: {
      get: async () => buildSuggestion({ id: 51, status: 'pending', targetType: 'client' }),
      markRejected: async (_sessionId: string, _id: number, decision: any) => {
        rejectedDecision = decision
        return buildSuggestion({ id: 51, status: 'rejected', decisionSource: decision?.source })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-suggestions/51/reject',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        decisionSource: 'manual',
        decisionActorRole: 'user',
        decisionActorUid: 'uid-user-1'
      }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(rejectedDecision, {
      source: 'manual',
      actorRole: 'user',
      actorUid: 'uid-user-1'
    })
  } finally {
    await app.close()
  }
})
