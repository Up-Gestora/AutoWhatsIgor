import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin',
  DANCING_POST_INTERACTION_ENABLED: true,
  DANCING_POST_INTERACTION_SECRET: 'secretsecretsecretsecret'
} as any

test('dancing integration route returns 404 when disabled', async () => {
  const app = buildServer(
    {
      ...baseEnv,
      DANCING_POST_INTERACTION_ENABLED: false
    },
    {
      postInteractionFeedbackService: {
        getSummary: async () => ({
          qualified: 0,
          approachesSent: 0,
          feedbacksReceived: 0,
          averageScore: 0,
          offersSent: 0,
          timeoutsNoScore: 0,
          optOuts: 0
        }),
        enrollQualifiedInteraction: async () => ({ status: 'enrolled', senderSessionId: 'sender-session', leadId: 'lead-1' })
      } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/dancing/post-interaction-feedback/qualified',
      payload: {}
    })

    assert.equal(response.statusCode, 404)
  } finally {
    await app.close()
  }
})

test('dancing integration route returns 401 when bearer token is invalid', async () => {
  const app = buildServer(baseEnv, {
    postInteractionFeedbackService: {
      getSummary: async () => ({
        qualified: 0,
        approachesSent: 0,
        feedbacksReceived: 0,
        averageScore: 0,
        offersSent: 0,
        timeoutsNoScore: 0,
        optOuts: 0
      }),
      enrollQualifiedInteraction: async () => ({ status: 'enrolled', senderSessionId: 'sender-session', leadId: 'lead-1' })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/dancing/post-interaction-feedback/qualified',
      headers: { authorization: 'Bearer wrong' },
      payload: {}
    })

    assert.equal(response.statusCode, 401)
  } finally {
    await app.close()
  }
})

test('dancing integration route validates required payload and idempotency key', async () => {
  const app = buildServer(baseEnv, {
    postInteractionFeedbackService: {
      getSummary: async () => ({
        qualified: 0,
        approachesSent: 0,
        feedbacksReceived: 0,
        averageScore: 0,
        offersSent: 0,
        timeoutsNoScore: 0,
        optOuts: 0
      }),
      enrollQualifiedInteraction: async () => ({ status: 'enrolled', senderSessionId: 'sender-session', leadId: 'lead-1' })
    } as any
  })

  try {
    const missingIdempotency = await app.inject({
      method: 'POST',
      url: '/integrations/dancing/post-interaction-feedback/qualified',
      headers: { authorization: 'Bearer secretsecretsecretsecret' },
      payload: {
        sourceSessionId: 'dancing-session',
        sourceChatId: '551188887777@s.whatsapp.net',
        whatsapp: '551188887777',
        qualifiedAtMs: 1700000000000,
        userMessageCount: 2,
        aiReplyCount: 2,
        triggerOutboundId: 42
      }
    })

    assert.equal(missingIdempotency.statusCode, 400)
    assert.equal(missingIdempotency.json().error, 'idempotency_key_required')

    const wrongKey = await app.inject({
      method: 'POST',
      url: '/integrations/dancing/post-interaction-feedback/qualified',
      headers: {
        authorization: 'Bearer secretsecretsecretsecret',
        'x-idempotency-key': 'wrong-key'
      },
      payload: {
        sourceSessionId: 'dancing-session',
        sourceChatId: '551188887777@s.whatsapp.net',
        whatsapp: '551188887777',
        qualifiedAtMs: 1700000000000,
        userMessageCount: 2,
        aiReplyCount: 2,
        triggerOutboundId: 42
      }
    })

    assert.equal(wrongKey.statusCode, 400)
    assert.equal(wrongKey.json().error, 'invalid_idempotency_key')
  } finally {
    await app.close()
  }
})

test('dancing integration route forwards a valid qualified interaction to the service', async () => {
  let capturedInput: any = null
  const app = buildServer(baseEnv, {
    postInteractionFeedbackService: {
      getSummary: async () => ({
        qualified: 0,
        approachesSent: 0,
        feedbacksReceived: 0,
        averageScore: 0,
        offersSent: 0,
        timeoutsNoScore: 0,
        optOuts: 0
      }),
      enrollQualifiedInteraction: async (input: any) => {
        capturedInput = input
        return { status: 'duplicate', senderSessionId: 'sender-session', leadId: 'lead-1' }
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/dancing/post-interaction-feedback/qualified',
      headers: {
        authorization: 'Bearer secretsecretsecretsecret',
        'x-idempotency-key': 'dancing:dancing-session:551188887777@s.whatsapp.net:42'
      },
      payload: {
        sourceSessionId: 'dancing-session',
        sourceChatId: '551188887777@s.whatsapp.net',
        whatsapp: '551188887777',
        contactName: 'Joana',
        sourceCompanyName: 'Dancing Patinação',
        qualifiedAtMs: 1700000000000,
        userMessageCount: 2,
        aiReplyCount: 2,
        triggerOutboundId: 42
      }
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(capturedInput, {
      sourceSystem: 'dancing',
      sourceSessionId: 'dancing-session',
      sourceChatId: '551188887777@s.whatsapp.net',
      whatsapp: '551188887777',
      contactName: 'Joana',
      sourceCompanyName: 'Dancing Patinação',
      qualifiedAtMs: 1700000000000,
      userMessageCount: 2,
      aiReplyCount: 2,
      qualificationKey: 'dancing:dancing-session:551188887777@s.whatsapp.net:42',
      triggerOutboundId: 42
    })

    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.status, 'duplicate')
    assert.equal(body.senderSessionId, 'sender-session')
    assert.equal(body.leadId, 'lead-1')
  } finally {
    await app.close()
  }
})
