import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

test('server affiliate routes list, save, register click, claim and report funnel', async () => {
  const calls: Record<string, unknown[]> = {
    saveLink: [],
    registerClick: [],
    claimAttribution: [],
    getFunnel: []
  }

  const app = buildServer(baseEnv, {
    affiliateService: {
      listLinks: async () => [
        {
          code: 'alpha',
          name: 'Alpha',
          status: 'active',
          createdAt: 1_760_000_000_000,
          updatedAt: 1_760_000_000_000
        }
      ],
      saveLink: async (input: unknown) => {
        calls.saveLink.push(input)
        return {
          code: 'beta',
          name: 'Beta',
          status: 'inactive',
          createdAt: 1_760_000_000_000,
          updatedAt: 1_760_000_100_000
        }
      },
      registerClick: async (input: unknown) => {
        calls.registerClick.push(input)
        return {
          click: {
            clickId: 'click_1',
            affiliateCode: 'alpha',
            visitorId: 'visitor_1',
            attributionOutcome: 'locked_to_current',
            userAgent: 'ua',
            referer: 'https://example.com',
            landingPath: '/signup',
            occurredAt: 1_760_000_000_000,
            createdAt: 1_760_000_000_000
          },
          effectiveAffiliateCode: 'alpha',
          effectiveClickId: 'click_1'
        }
      },
      claimAttribution: async (input: unknown) => {
        calls.claimAttribution.push(input)
        return {
          claimed: true,
          attribution: {
            sessionId: 'session_1',
            affiliateCode: 'alpha',
            clickId: 'click_1',
            visitorId: 'visitor_1',
            attributionModel: 'first_click',
            signupAt: 1_760_000_000_000,
            checkoutStartedAt: null,
            stripeCheckoutSessionId: null,
            subscriptionCreatedAt: null,
            stripeSubscriptionId: null,
            firstPaymentConfirmedAt: null,
            firstPaidInvoiceId: null,
            createdAt: 1_760_000_000_000,
            updatedAt: 1_760_000_000_000
          }
        }
      },
      getFunnel: async (fromMs: number, toMs: number) => {
        calls.getFunnel.push({ fromMs, toMs })
        return {
          summary: {
            clicks: 4,
            uniqueVisitors: 3,
            signups: 2,
            checkoutStarted: 1,
            subscriptionsCreated: 1,
            firstPaymentsConfirmed: 1
          },
          rows: [
            {
              affiliateCode: 'alpha',
              affiliateName: 'Alpha',
              status: 'active',
              sharePath: '/a/alpha',
              clicks: 4,
              uniqueVisitors: 3,
              signups: 2,
              checkoutStarted: 1,
              subscriptionsCreated: 1,
              firstPaymentsConfirmed: 1
            }
          ]
        }
      }
    } as any
  })

  try {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/admin/affiliates',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(listResponse.statusCode, 200)
    assert.equal((listResponse.json() as any).links[0]?.code, 'alpha')

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/admin/affiliates',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        code: 'beta',
        name: 'Beta',
        status: 'inactive'
      }
    })
    assert.equal(saveResponse.statusCode, 200)
    assert.deepEqual(calls.saveLink[0], {
      code: 'beta',
      name: 'Beta',
      status: 'inactive'
    })

    const clickResponse = await app.inject({
      method: 'POST',
      url: '/admin/affiliates/alpha/clicks',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        visitorId: 'visitor_1',
        lockedAffiliateCode: 'alpha',
        lockedClickId: 'click_0',
        userAgent: 'ua',
        referer: 'https://example.com',
        landingPath: '/signup'
      }
    })
    assert.equal(clickResponse.statusCode, 200)
    assert.deepEqual(calls.registerClick[0], {
      affiliateCode: 'alpha',
      visitorId: 'visitor_1',
      lockedAffiliateCode: 'alpha',
      lockedClickId: 'click_0',
      userAgent: 'ua',
      referer: 'https://example.com',
      landingPath: '/signup'
    })

    const claimResponse = await app.inject({
      method: 'POST',
      url: '/admin/affiliates/claim',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 'session_1',
        affiliateCode: 'alpha',
        clickId: 'click_1',
        visitorId: 'visitor_1',
        signupAtMs: 1_760_000_000_000
      }
    })
    assert.equal(claimResponse.statusCode, 200)
    assert.deepEqual(calls.claimAttribution[0], {
      sessionId: 'session_1',
      affiliateCode: 'alpha',
      clickId: 'click_1',
      visitorId: 'visitor_1',
      signupAtMs: 1_760_000_000_000
    })

    const funnelResponse = await app.inject({
      method: 'GET',
      url: '/admin/affiliates/funnel?fromMs=1760000000000&toMs=1761000000000',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(funnelResponse.statusCode, 200)
    const funnelBody = funnelResponse.json() as any
    assert.equal(funnelBody.summary.clicks, 4)
    assert.equal(funnelBody.rows[0]?.affiliateCode, 'alpha')
    assert.deepEqual(calls.getFunnel[0], {
      fromMs: 1_760_000_000_000,
      toMs: 1_761_000_000_000
    })
  } finally {
    await app.close()
  }
})
