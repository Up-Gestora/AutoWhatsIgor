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

test('server exposes post-interaction settings and prospecting summary routes', async () => {
  const snapshot = {
    debugAiPrompt: false,
    debugAiResponse: false,
    requestLogging: true,
    usdBrlRate: 5,
    aiPricing: { models: {} },
    aiAudioTranscriptionUsdPerMin: 0,
    newAccountCreditsBrl: 0,
    postInteractionProspecting: {
      enabled: false,
      senderEmail: 'igsartor@icloud.com',
      ctaBaseUrl: '/login?mode=signup'
    }
  }

  const app = buildServer(baseEnv, {
    systemSettings: {
      getSnapshot: () => snapshot,
      setDebugAiPrompt: async () => undefined,
      setDebugAiResponse: async () => undefined,
      setRequestLogging: async () => undefined,
      setUsdBrlRate: async () => undefined,
      setAiAudioTranscriptionUsdPerMin: async () => undefined,
      setNewAccountCreditsBrl: async () => undefined,
      setAiPricing: async () => undefined,
      setPostInteractionProspecting: async (value: any) => {
        snapshot.postInteractionProspecting = {
          ...snapshot.postInteractionProspecting,
          ...value
        }
      }
    } as any,
    postInteractionFeedbackService: {
      getSummary: async () => ({
        summary: {
          qualified: 12,
          approachesSent: 10,
          feedbacksReceived: 7,
          averageScore: 8.6,
          offersSent: 4,
          timeoutsNoScore: 2,
          optOuts: 1
        },
        diagnostics: {
          enabled: true,
          senderEmail: 'igsartor@icloud.com',
          senderSessionId: 'sender-session',
          lookupStatus: 'ok',
          failureReason: null,
          lastScoreAtMs: 1_760_100_000_000,
          rawScoreEvents: 7,
          scoreCandidatesDetected: 7,
          missingScoreEvents: 0,
          missingCommentEvents: 0
        }
      }),
      getFeedbackDetails: async () => ({
        rows: [
          {
            qualificationKey: 'autowhats:source-session:5511999999999@s.whatsapp.net:22',
            score: 8,
            companyName: 'Escola de Patinação',
            phone: '5511999999999',
            feedbackAtMs: 1_760_100_000_000,
            sourceSystem: 'autowhats',
            chatId: '163874527551579@lid'
          }
        ],
        stats: {
          feedbacksReceived: 1,
          averageScore: 8,
          byScore: [{ score: 8, count: 1 }],
          byCompany: [{ companyName: 'Escola de Patinação', count: 1, averageScore: 8 }],
          byDay: [{ day: '2025-10-10', count: 1, averageScore: 8 }]
        },
        pageInfo: {
          limit: 25,
          nextCursor: null,
          hasMore: false
        }
      })
    } as any
  })

  try {
    const getSettings = await app.inject({
      method: 'GET',
      url: '/admin/system-settings',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(getSettings.statusCode, 200)
    assert.equal((getSettings.json() as any).settings.postInteractionProspecting.enabled, false)

    const saveSettings = await app.inject({
      method: 'POST',
      url: '/admin/system-settings',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        postInteractionProspecting: {
          enabled: true,
          senderEmail: 'igsartor@icloud.com',
          ctaBaseUrl: 'https://app.autowhats.com/login?mode=signup'
        }
      }
    })
    assert.equal(saveSettings.statusCode, 200)
    assert.equal((saveSettings.json() as any).settings.postInteractionProspecting.enabled, true)
    assert.equal(snapshot.postInteractionProspecting.ctaBaseUrl, 'https://app.autowhats.com/login?mode=signup')

    const summaryResponse = await app.inject({
      method: 'GET',
      url: '/admin/prospecting/summary?fromMs=1760000000000&toMs=1761000000000',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(summaryResponse.statusCode, 200)
    const summaryBody = summaryResponse.json() as any
    assert.equal(summaryBody.success, true)
    assert.equal(summaryBody.summary.offersSent, 4)
    assert.equal(summaryBody.diagnostics.senderSessionId, 'sender-session')

    const feedbacksResponse = await app.inject({
      method: 'GET',
      url: '/admin/prospecting/feedbacks?fromMs=1760000000000&toMs=1761000000000&focus=feedbacksReceived&scoreMin=7',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(feedbacksResponse.statusCode, 200)
    const feedbacksBody = feedbacksResponse.json() as any
    assert.equal(feedbacksBody.success, true)
    assert.equal(feedbacksBody.rows[0].companyName, 'Escola de Patinação')
    assert.equal(feedbacksBody.stats.feedbacksReceived, 1)
    assert.equal(feedbacksBody.pageInfo.hasMore, false)
  } finally {
    await app.close()
  }
})
