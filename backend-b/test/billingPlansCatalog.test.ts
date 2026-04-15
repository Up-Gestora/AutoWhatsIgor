import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { BillingService } from '../src/billing/service'

class FakeBillingStore {
  async getOverview() {
    return {
      customer: null,
      subscription: null,
      paymentMethod: null
    } as any
  }
}

test('BillingService.getOverview returns plans catalog with Stripe pricing (cached)', async () => {
  const store = new FakeBillingStore()
  const retrieveCalls: string[] = []

  const stripe = {
    prices: {
      retrieve: async (priceId: string) => {
        retrieveCalls.push(priceId)
        if (priceId === 'price_monthly') {
          return {
            id: priceId,
            active: true,
            unit_amount: 10000,
            currency: 'brl',
            recurring: { interval: 'month' }
          } as any
        }
        if (priceId === 'price_annual') {
          return {
            id: priceId,
            active: true,
            unit_amount: 60000,
            currency: 'brl',
            recurring: { interval: 'year' }
          } as any
        }
        if (priceId === 'price_enterprise') {
          return {
            id: priceId,
            active: true,
            unit_amount: 120000,
            currency: 'brl',
            recurring: { interval: 'year' }
          } as any
        }
        throw new Error('unknown_price')
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_monthly',
      STRIPE_PRICE_ID_PRO_ANNUAL: 'price_annual',
      STRIPE_PRICE_ID_ENTERPRISE_ANNUAL: 'price_enterprise'
    } as any,
    store: store as any,
    stripe
  })

  const overview1 = await service.getOverview('sess_1')
  assert.equal(overview1.plans.pro_monthly.enabled, true)
  assert.equal(overview1.plans.pro_monthly.unitAmountCents, 10000)
  assert.equal(overview1.plans.pro_monthly.currency, 'brl')
  assert.equal(overview1.plans.pro_monthly.interval, 'month')

  assert.equal(overview1.plans.pro_annual.enabled, true)
  assert.equal(overview1.plans.pro_annual.unitAmountCents, 60000)
  assert.equal(overview1.plans.pro_annual.currency, 'brl')
  assert.equal(overview1.plans.pro_annual.interval, 'year')

  assert.equal(overview1.plans.enterprise_annual.enabled, true)
  assert.equal(overview1.plans.enterprise_annual.unitAmountCents, 120000)
  assert.equal(overview1.plans.enterprise_annual.currency, 'brl')
  assert.equal(overview1.plans.enterprise_annual.interval, 'year')

  // Second call should hit cache (no additional Stripe calls).
  const overview2 = await service.getOverview('sess_2')
  assert.equal(overview2.plans.pro_monthly.unitAmountCents, 10000)
  assert.equal(overview2.plans.pro_annual.unitAmountCents, 60000)
  assert.equal(overview2.plans.enterprise_annual.unitAmountCents, 120000)
  assert.equal(retrieveCalls.length, 3)
})

test('BillingService.getOverview marks optional annual plans disabled when env vars are missing', async () => {
  const store = new FakeBillingStore()
  const retrieveCalls: string[] = []

  const stripe = {
    prices: {
      retrieve: async (priceId: string) => {
        retrieveCalls.push(priceId)
        return {
          id: priceId,
          active: true,
          unit_amount: 10000,
          currency: 'brl',
          recurring: { interval: 'month' }
        } as any
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_monthly'
    } as any,
    store: store as any,
    stripe
  })

  const overview = await service.getOverview('sess_1')
  assert.equal(overview.plans.pro_annual.enabled, false)
  assert.equal(overview.plans.enterprise_annual.enabled, false)
  assert.equal(retrieveCalls.includes(''), false)
})

test('BillingService.getOverview tolerates Stripe price lookup failures', async () => {
  const store = new FakeBillingStore()
  const stripe = {
    prices: {
      retrieve: async () => {
        throw new Error('stripe_down')
      }
    }
  } as any as Stripe

  const service = new BillingService({
    env: {
      APP_PUBLIC_URL: 'http://localhost:3000',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_monthly',
      STRIPE_PRICE_ID_PRO_ANNUAL: 'price_annual',
      STRIPE_PRICE_ID_ENTERPRISE_ANNUAL: 'price_enterprise'
    } as any,
    store: store as any,
    stripe
  })

  const overview = await service.getOverview('sess_1')
  assert.equal(overview.plans.pro_monthly.enabled, true)
  assert.equal(overview.plans.pro_monthly.unitAmountCents, null)
  assert.equal(overview.plans.pro_annual.enabled, true)
  assert.equal(overview.plans.pro_annual.unitAmountCents, null)
  assert.equal(overview.plans.enterprise_annual.enabled, true)
  assert.equal(overview.plans.enterprise_annual.unitAmountCents, null)
})
