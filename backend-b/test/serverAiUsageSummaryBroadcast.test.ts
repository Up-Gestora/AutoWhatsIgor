import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

test('ai-usage summary combines AI and broadcast transmission costs', async () => {
  const app = buildServer(
    {
      LOG_LEVEL: 'fatal',
      ALLOWED_ORIGINS: '*',
      ADMIN_API_KEY: 'admin'
    } as any,
    {
      aiUsageStore: {
        getSummary: async () => ({
          totals: {
            promptTokens: 1000,
            completionTokens: 500,
            totalTokens: 1500,
            costUsd: 0.25,
            costBrl: 1.23,
            records: 3
          },
          responses: {
            count: 2,
            totalTokens: 1200,
            costUsd: 0.2,
            costBrl: 1
          },
          pricingMissingCount: 0
        }),
        getDailySeries: async () => [
          { day: '2026-02-10', costUsd: 0.1, costBrl: 0.5, totalTokens: 700, responses: 1 },
          { day: '2026-02-12', costUsd: 0.08, costBrl: 0.4, totalTokens: 500, responses: 1 }
        ],
        getModelBreakdown: async () => [
          {
            provider: 'openai',
            model: 'gpt-5.2',
            category: 'ai',
            costUsd: 0.25,
            costBrl: 1.23,
            totalTokens: 1500,
            responses: 2
          }
        ]
      } as any,
      creditsService: {
        get: async () => ({
          sessionId: 'session-1',
          balanceBrl: 10,
          blockedAt: null,
          blockedReason: null,
          updatedAt: Date.now()
        }),
        getUsageCostByReason: async () => ({
          costBrl: 0.02,
          events: 2
        }),
        getUsageDailySeriesByReason: async () => [
          { day: '2026-02-10', costBrl: 0.01, events: 1 },
          { day: '2026-02-11', costBrl: 0.01, events: 1 }
        ]
      } as any,
      broadcastJobStore: {
        getSentCountByPeriod: async () => 27
      } as any
    }
  )

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/session-1/ai-usage/summary?fromMs=1&toMs=2',
      headers: {
        'x-admin-key': 'admin'
      }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.summary.totals.costBrl, 1.23)
    assert.equal(body.summary.totalsCombined.costBrl, 1.25)
    assert.deepEqual(body.summary.broadcast, {
      sentMessages: 27,
      billedBlocks: 2,
      billedMessages: 20,
      costBrl: 0.02
    })

    const broadcastModel = (body.summary.models as any[]).find((entry) => entry.category === 'broadcast')
    assert.ok(broadcastModel)
    assert.equal(broadcastModel.provider, 'broadcast')
    assert.equal(broadcastModel.model, 'transmissao')
    assert.equal(broadcastModel.costBrl, 0.02)
    assert.equal(broadcastModel.totalTokens, 0)
    assert.equal(broadcastModel.responses, 27)

    assert.deepEqual(body.summary.series, [
      { day: '2026-02-10', costUsd: 0.1, costBrl: 0.51, totalTokens: 700, responses: 1 },
      { day: '2026-02-11', costUsd: 0, costBrl: 0.01, totalTokens: 0, responses: 0 },
      { day: '2026-02-12', costUsd: 0.08, costBrl: 0.4, totalTokens: 500, responses: 1 }
    ])
  } finally {
    await app.close()
  }
})
