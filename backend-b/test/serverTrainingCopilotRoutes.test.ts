import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'
import { TrainingCopilotBlockedError } from '../src/ai/trainingCopilotService'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildSessionState(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    messages: [
      {
        id: 'm1',
        role: 'assistant',
        content: 'Oi, como posso ajudar no treinamento?',
        createdAtMs: 1
      }
    ],
    pendingProposal: {
      id: 'proposal-1',
      seq: 1,
      status: 'pending',
      summary: 'Ativar resposta para clientes',
      rationale: null,
      patch: {
        responderClientes: true
      },
      createdAtMs: 2
    },
    decisions: [],
    proposalSeq: 1,
    createdAtMs: 1,
    updatedAtMs: 2,
    ...overrides
  }
}

test('training copilot session routes return session state and support reset/delete', async () => {
  let resetCalls = 0
  let deleteCalls = 0

  const app = buildServer(baseEnv, {
    trainingCopilotService: {
      getSession: async () => buildSessionState(),
      resetSession: async () => {
        resetCalls += 1
        return buildSessionState({
          messages: [],
          pendingProposal: null,
          decisions: [],
          proposalSeq: 0
        })
      },
      deleteSession: async () => {
        deleteCalls += 1
      }
    } as any,
    creditsService: {
      get: async () => ({
        sessionId: 'session-1',
        balanceBrl: 12.34,
        blockedAt: null,
        blockedReason: null,
        updatedAt: Date.now()
      })
    } as any
  })

  try {
    const getResponse = await app.inject({
      method: 'GET',
      url: '/sessions/session-1/ai-training/session',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(getResponse.statusCode, 200)
    const getBody = getResponse.json() as any
    assert.equal(getBody.success, true)
    assert.equal(getBody.messages.length, 1)
    assert.equal(getBody.pendingProposal?.id, 'proposal-1')
    assert.equal(getBody.credits?.balanceBrl, 12.34)

    const postResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/session',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        reset: true
      }
    })
    assert.equal(postResponse.statusCode, 200)
    const postBody = postResponse.json() as any
    assert.equal(postBody.success, true)
    assert.equal(postBody.messages.length, 0)
    assert.equal(postBody.pendingProposal, null)
    assert.equal(resetCalls, 1)

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/sessions/session-1/ai-training/session',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(deleteResponse.statusCode, 200)
    const deleteBody = deleteResponse.json() as any
    assert.equal(deleteBody.success, true)
    assert.equal(deleteCalls, 1)
  } finally {
    await app.close()
  }
})

test('training copilot message route validates payload and maps blocked error', async () => {
  const app = buildServer(baseEnv, {
    trainingCopilotService: {
      sendMessage: async () => {
        throw new TrainingCopilotBlockedError('no_credits', 'Creditos insuficientes para usar a IA.')
      }
    } as any
  })

  try {
    const invalidMessageResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/message',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        message: '',
        currentTraining: { instructions: {} }
      }
    })
    assert.equal(invalidMessageResponse.statusCode, 400)
    assert.equal((invalidMessageResponse.json() as any).error, 'message_required')

    const invalidTrainingResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/message',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        message: 'Quero melhorar meu treinamento',
        currentTraining: {}
      }
    })
    assert.equal(invalidTrainingResponse.statusCode, 400)
    assert.equal((invalidTrainingResponse.json() as any).error, 'current_training_required')

    const blockedResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/message',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        message: 'Quero melhorar meu treinamento',
        currentTraining: {
          instructions: {}
        }
      }
    })
    assert.equal(blockedResponse.statusCode, 409)
    const blockedBody = blockedResponse.json() as any
    assert.equal(blockedBody.error, 'training_copilot_blocked')
    assert.equal(blockedBody.reason, 'no_credits')
  } finally {
    await app.close()
  }
})

test('training copilot accept/reject routes return 200 and 404 according to proposal state', async () => {
  let acceptDecision: any = null
  let rejectDecision: any = null

  const app = buildServer(baseEnv, {
    trainingCopilotService: {
      acceptProposal: async (_sessionId: string, proposalId: string, decision: any) => {
        if (proposalId === 'missing') {
          return null
        }
        acceptDecision = decision
        return buildSessionState({ pendingProposal: null })
      },
      rejectProposal: async (_sessionId: string, proposalId: string, decision: any) => {
        if (proposalId === 'missing') {
          return null
        }
        rejectDecision = decision
        return buildSessionState({ pendingProposal: null })
      }
    } as any
  })

  try {
    const acceptResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/proposals/proposal-1/accept',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        actorRole: 'admin',
        actorUid: 'uid-1'
      }
    })
    assert.equal(acceptResponse.statusCode, 200)
    const acceptBody = acceptResponse.json() as any
    assert.equal(acceptBody.success, true)
    assert.equal(acceptBody.pendingProposal, null)
    assert.deepEqual(acceptDecision, { actorRole: 'admin', actorUid: 'uid-1' })

    const rejectResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/proposals/proposal-1/reject',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        actorRole: 'user',
        actorUid: 'uid-2'
      }
    })
    assert.equal(rejectResponse.statusCode, 200)
    const rejectBody = rejectResponse.json() as any
    assert.equal(rejectBody.success, true)
    assert.equal(rejectBody.pendingProposal, null)
    assert.deepEqual(rejectDecision, { actorRole: 'user', actorUid: 'uid-2' })

    const missingAccept = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/proposals/missing/accept',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {}
    })
    assert.equal(missingAccept.statusCode, 404)
    assert.equal((missingAccept.json() as any).error, 'proposal_not_found')

    const missingReject = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/ai-training/proposals/missing/reject',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {}
    })
    assert.equal(missingReject.statusCode, 404)
    assert.equal((missingReject.json() as any).error, 'proposal_not_found')
  } finally {
    await app.close()
  }
})
