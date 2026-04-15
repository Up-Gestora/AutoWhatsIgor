import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin',
  ONBOARDING_V2_ENABLED: true,
  ONBOARDING_GUIDED_TEST_ENABLED: true,
  PAID_FUNNEL_ADMIN_ENABLED: true
} as any

test('server onboarding routes record events and return state', async () => {
  const app = buildServer(baseEnv, {
    onboardingService: {
      recordEvent: async () => ({ recorded: true }),
      getState: async () => ({
        sessionId: 'session-1',
        activationDefinition: 'first_ai_response_sent',
        trainingScore: 78,
        progressPercent: 66.7,
        milestones: {
          signup_completed: { reached: true, atMs: 1 },
          whatsapp_saved: { reached: true, atMs: 2 },
          whatsapp_connected: { reached: false, atMs: null },
          training_score_70_reached: { reached: true, atMs: 3 },
          ai_enabled: { reached: false, atMs: null },
          first_ai_response_sent: { reached: false, atMs: null }
        },
        nextAction: {
          id: 'connect_whatsapp',
          title: 'Conectar WhatsApp',
          description: 'Sem conexão ativa detectada.',
          routeKey: 'connections',
          ctaLabel: 'Conectar agora'
        }
      }),
      getFunnel: async () => [
        {
          cohortStartMs: 1_760_000_000_000,
          signups: 10,
          stageCounts: {
            whatsapp_saved: 8,
            whatsapp_connected: 7,
            training_score_70_reached: 6,
            ai_enabled: 4,
            first_ai_response_sent: 3
          },
          conversionToActivated: 0.3
        }
      ],
      getAcquisitionFunnel: async () => [
        {
          cohortStartMs: 1_760_000_000_000,
          campaignKey: 'search_brand',
          sourceKey: 'google',
          signups: 10,
          stageCounts: {
            whatsapp_connected: 7,
            training_score_70_reached: 6,
            first_ai_response_sent: 4,
            account_activated_7d: 3
          },
          rates: {
            signup_to_whatsapp_connected: 0.7,
            signup_to_training_score_70_reached: 0.6,
            signup_to_first_ai_response_sent: 0.4,
            activation_7d: 0.3
          }
        }
      ],
      recordSystemEvent: async () => ({ recorded: true }),
      getDraft: async () => ({
        draft: {
          version: 4,
          updatedAtMs: 1_760_000_000_000,
          training: {}
        },
        currentStep: 3,
        selectedTemplateId: null,
        guidedTestSession: null,
        guidedValidation: {
          status: 'passed',
          draftVersion: 4,
          lastRunAtMs: 1_760_000_000_000,
          checks: [
            { id: 'no_na', passed: true },
            { id: 'has_cta', passed: true },
            { id: 'short_message', passed: true },
            { id: 'service_reference', passed: true },
            { id: 'safe_behavior', passed: true }
          ]
        },
        readiness: {
          ready: true,
          score: 78,
          hints: []
        },
        credits: null
      }),
      runGuidedTest: async () => ({
        passed: true,
        checks: [
          { id: 'no_na', passed: true },
          { id: 'has_cta', passed: true },
          { id: 'short_message', passed: true },
          { id: 'service_reference', passed: true },
          { id: 'safe_behavior', passed: true }
        ],
        transcript: [
          { role: 'user', text: 'Oi' },
          { role: 'assistant', text: 'Vamos ativar seu teste?' }
        ]
      })
    } as any
  })

  try {
    const recordResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/onboarding/events',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        eventId: 'evt-1',
        eventName: 'training_score_updated',
        eventSource: 'frontend',
        occurredAtMs: 1_760_000_000_000,
        properties: {
          score: 78
        }
      }
    })
    assert.equal(recordResponse.statusCode, 200)
    assert.equal((recordResponse.json() as any).recorded, true)

    const stateResponse = await app.inject({
      method: 'GET',
      url: '/sessions/session-1/onboarding/state',
      headers: {
        'x-admin-key': 'admin'
      }
    })
    assert.equal(stateResponse.statusCode, 200)
    const stateBody = stateResponse.json() as any
    assert.equal(stateBody.success, true)
    assert.equal(stateBody.state.trainingScore, 78)

    const funnelResponse = await app.inject({
      method: 'GET',
      url: '/admin/onboarding/funnel?fromMs=1760000000000&toMs=1761000000000&cohort=week',
      headers: {
        'x-admin-key': 'admin'
      }
    })
    assert.equal(funnelResponse.statusCode, 200)
    const funnelBody = funnelResponse.json() as any
    assert.equal(funnelBody.success, true)
    assert.equal(funnelBody.cohort, 'week')
    assert.equal(funnelBody.cohorts.length, 1)

    const guidedResponse = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/onboarding/guided-test/run',
      headers: {
        'x-admin-key': 'admin'
      }
    })
    assert.equal(guidedResponse.statusCode, 200)
    const guidedBody = guidedResponse.json() as any
    assert.equal(guidedBody.success, true)
    assert.equal(guidedBody.result.passed, true)
    assert.equal(guidedBody.guidedValidation.status, 'passed')

    const acquisitionResponse = await app.inject({
      method: 'GET',
      url: '/admin/acquisition/funnel?fromMs=1760000000000&toMs=1761000000000&cohort=week&groupBy=campaign',
      headers: {
        'x-admin-key': 'admin'
      }
    })
    assert.equal(acquisitionResponse.statusCode, 200)
    const acquisitionBody = acquisitionResponse.json() as any
    assert.equal(acquisitionBody.success, true)
    assert.equal(acquisitionBody.groupBy, 'campaign')
    assert.equal(Array.isArray(acquisitionBody.rows), true)
    assert.equal(acquisitionBody.rows[0]?.campaignKey, 'search_brand')
  } finally {
    await app.close()
  }
})
