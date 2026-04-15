import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { BillingService } from '../src/billing/service'

class FakeBillingStore {
  async getCustomer(_sessionId: string) {
    return {
      stripeCustomerId: 'cus_1'
    } as any
  }

  async upsertCustomer() {
    return null as any
  }
}

test('BillingService.createCreditsCheckoutUrl blocks when Pro subscription is not active', async () => {
  const store = new FakeBillingStore()
  let checkoutCalled = false

  const stripe = {
    subscriptions: {
      list: async () => ({
        data: [
          {
            status: 'canceled',
            items: { data: [{ price: { id: 'price_pro_monthly' } }] }
          }
        ]
      })
    },
    checkout: {
      sessions: {
        create: async () => {
          checkoutCalled = true
          return { url: 'https://example.com/checkout' }
        }
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly',
      STRIPE_PRICE_ID_PRO_ANNUAL: 'price_pro_annual'
    } as any,
    store: store as any,
    stripe
  })

  await assert.rejects(
    () => service.createCreditsCheckoutUrl('sess_1', { packageId: '20', email: null }),
    (err: any) => err?.message === 'pro_subscription_required'
  )
  assert.equal(checkoutCalled, false)
})

test('BillingService.createCreditsCheckoutUrl allows when Pro subscription is active and matches allowed price', async () => {
  const store = new FakeBillingStore()
  const expectedUrl = 'https://example.com/checkout'

  const stripe = {
    subscriptions: {
      list: async () => ({
        data: [
          {
            status: 'active',
            items: { data: [{ price: { id: 'price_pro_monthly' } }] }
          }
        ]
      })
    },
    checkout: {
      sessions: {
        create: async () => ({ url: expectedUrl })
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly'
    } as any,
    store: store as any,
    stripe
  })

  const url = await service.createCreditsCheckoutUrl('sess_1', { packageId: '20', email: null })
  assert.equal(url, expectedUrl)
})

test('BillingService.createCreditsCheckoutUrl allows when Enterprise subscription is active', async () => {
  const store = new FakeBillingStore()
  const expectedUrl = 'https://example.com/checkout'

  const stripe = {
    subscriptions: {
      list: async () => ({
        data: [
          {
            status: 'active',
            items: { data: [{ price: { id: 'price_enterprise_annual' } }] }
          }
        ]
      })
    },
    checkout: {
      sessions: {
        create: async () => ({ url: expectedUrl })
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly',
      STRIPE_PRICE_ID_ENTERPRISE_ANNUAL: 'price_enterprise_annual'
    } as any,
    store: store as any,
    stripe
  })

  const url = await service.createCreditsCheckoutUrl('sess_1', { packageId: '20', email: null })
  assert.equal(url, expectedUrl)
})

test('BillingService.createSubscriptionCheckoutUrl supports enterprise_annual', async () => {
  const store = new FakeBillingStore()
  const expectedUrl = 'https://example.com/subscription-checkout'
  let sessionPayload: any = null

  const stripe = {
    subscriptions: {
      list: async () => ({
        data: []
      })
    },
    checkout: {
      sessions: {
        create: async (payload: unknown) => {
          sessionPayload = payload
          return { url: expectedUrl }
        }
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly',
      STRIPE_PRICE_ID_ENTERPRISE_ANNUAL: 'price_enterprise_annual'
    } as any,
    store: store as any,
    stripe
  })

  const url = await service.createSubscriptionCheckoutUrl('sess_1', { plan: 'enterprise_annual', email: null })
  assert.equal(url, expectedUrl)
  assert.equal(sessionPayload?.line_items?.[0]?.price, 'price_enterprise_annual')
})

test('BillingService.createSubscriptionCheckoutUrl propagates affiliate metadata and marks checkout started', async () => {
  const store = new FakeBillingStore()
  const expectedUrl = 'https://example.com/subscription-checkout'
  let sessionPayload: any = null
  let customerUpdatePayload: any = null
  const checkoutMarks: Array<{ sessionId: string; occurredAtMs?: number | null; stripeCheckoutSessionId?: string | null }> = []

  const stripe = {
    subscriptions: {
      list: async () => ({
        data: []
      })
    },
    customers: {
      update: async (customerId: string, payload: unknown) => {
        customerUpdatePayload = { customerId, payload }
        return { id: customerId }
      }
    },
    checkout: {
      sessions: {
        create: async (payload: unknown) => {
          sessionPayload = payload
          return { id: 'cs_affiliate_1', url: expectedUrl }
        }
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly'
    } as any,
    store: store as any,
    stripe,
    affiliateService: {
      getAttributionBySessionId: async () => ({
        sessionId: 'sess_1',
        affiliateCode: 'alpha',
        clickId: 'click_1',
        visitorId: 'visitor_1',
        attributionModel: 'first_click'
      }),
      markCheckoutStarted: async (sessionId: string, input: { occurredAtMs?: number | null; stripeCheckoutSessionId?: string | null }) => {
        checkoutMarks.push({ sessionId, ...input })
        return null as any
      }
    } as any
  })

  const url = await service.createSubscriptionCheckoutUrl('sess_1', { plan: 'pro_monthly', email: 'alpha@example.com' })

  assert.equal(url, expectedUrl)
  assert.equal(sessionPayload?.metadata?.affiliateCode, 'alpha')
  assert.equal(sessionPayload?.metadata?.affiliateClickId, 'click_1')
  assert.equal(sessionPayload?.subscription_data?.metadata?.affiliateVisitorId, 'visitor_1')
  assert.equal(sessionPayload?.subscription_data?.metadata?.affiliateAttributionModel, 'first_click')
  assert.equal(customerUpdatePayload?.customerId, 'cus_1')
  assert.equal(customerUpdatePayload?.payload?.metadata?.sessionId, 'sess_1')
  assert.equal(customerUpdatePayload?.payload?.metadata?.affiliateCode, 'alpha')
  assert.equal(checkoutMarks.length, 1)
  assert.equal(checkoutMarks[0]?.sessionId, 'sess_1')
  assert.equal(checkoutMarks[0]?.stripeCheckoutSessionId, 'cs_affiliate_1')
  assert.equal(typeof checkoutMarks[0]?.occurredAtMs, 'number')
})

test('BillingService.createSubscriptionCheckoutUrl fails when enterprise price is missing', async () => {
  const store = new FakeBillingStore()

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly'
    } as any,
    store: store as any,
    stripe: {} as any as Stripe
  })

  await assert.rejects(
    () => service.createSubscriptionCheckoutUrl('sess_1', { plan: 'enterprise_annual', email: null }),
    (err: any) => err?.message === 'stripe_price_enterprise_missing'
  )
})

test('BillingService.createSubscriptionCheckoutUrl fails when enterprise price conflicts with Pro annual', async () => {
  const store = new FakeBillingStore()
  let checkoutCalled = false

  const stripe = {
    subscriptions: {
      list: async () => ({
        data: []
      })
    },
    checkout: {
      sessions: {
        create: async () => {
          checkoutCalled = true
          return { url: 'https://example.com/checkout' }
        }
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_pro_monthly',
      STRIPE_PRICE_ID_PRO_ANNUAL: 'price_pro_annual',
      STRIPE_PRICE_ID_ENTERPRISE_ANNUAL: 'price_pro_annual'
    } as any,
    store: store as any,
    stripe
  })

  await assert.rejects(
    () => service.createSubscriptionCheckoutUrl('sess_1', { plan: 'enterprise_annual', email: null }),
    (err: any) => err?.message === 'stripe_price_enterprise_conflicts_annual'
  )
  assert.equal(checkoutCalled, false)
})

