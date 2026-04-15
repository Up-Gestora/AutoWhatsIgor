import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { reconcileStripeBilling } from '../src/billing/reconcile'

class FakeBillingStore {
  customers: Array<{ sessionId: string; customerId: string; email?: string | null }> = []
  subscriptions: Array<Record<string, unknown>> = []
  paymentMethods: Array<Record<string, unknown>> = []
  sessionByCustomer = new Map<string, string>()

  async getSessionIdByCustomerId(customerId: string) {
    return this.sessionByCustomer.get(customerId) ?? null
  }

  async upsertCustomer(sessionId: string, customerId: string, email?: string | null) {
    this.customers.push({ sessionId, customerId, email })
    this.sessionByCustomer.set(customerId, sessionId)
    return {
      sessionId,
      stripeCustomerId: customerId,
      email: email ?? null,
      updatedAt: Date.now()
    }
  }

  async upsertSubscription(input: Record<string, unknown>) {
    this.subscriptions.push(input)
    return input as any
  }

  async upsertPaymentMethod(input: Record<string, unknown>) {
    this.paymentMethods.push(input)
    return input as any
  }
}

class FakeCreditsService {
  calls: Array<{ sessionId: string; amountBrl: number; referenceId?: string | null }> = []
  private readonly seenReferences = new Set<string>()

  async grantSubscriptionCredits(
    sessionId: string,
    amountBrl: number,
    meta: { referenceId?: string | null; reason?: string | null; actorId?: string | null }
  ) {
    const referenceId = meta.referenceId ?? ''
    const granted = !this.seenReferences.has(referenceId)
    this.seenReferences.add(referenceId)
    this.calls.push({ sessionId, amountBrl, referenceId: meta.referenceId })
    return {
      granted,
      credits: {
        sessionId,
        balanceBrl: amountBrl,
        blockedAt: null,
        blockedReason: null,
        updatedAt: Date.now()
      }
    }
  }
}

function makeFakeStripe(invoice: Record<string, unknown>) {
  return {
    invoices: {
      list: async () => ({
        data: [invoice],
        has_more: false
      })
    },
    customers: {
      retrieve: async () => ({
        deleted: false,
        email: 'customer@example.com',
        metadata: { sessionId: 'sess_1' },
        invoice_settings: {}
      })
    },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { sessionId: 'sess_1' },
        items: {
          data: [
            {
              current_period_end: Math.floor(Date.now() / 1000) + 86400,
              price: { id: 'price_monthly' }
            }
          ]
        }
      })
    },
    paymentMethods: {
      retrieve: async () => null
    }
  } as any as Stripe
}

test('reconcileStripeBilling dry-run reports would_apply and does not mutate credits', async () => {
  const store = new FakeBillingStore()
  const creditsService = new FakeCreditsService()
  const invoice = {
    id: 'in_reconcile_1',
    customer: 'cus_1',
    amount_paid: 10000,
    billing_reason: 'subscription_create',
    lines: {
      data: [
        {
          proration: false,
          pricing: {
            price_details: { price: 'price_monthly' }
          },
          parent: {
            subscription_item_details: { subscription: 'sub_1' }
          }
        }
      ]
    }
  }
  const stripe = makeFakeStripe(invoice)

  const result = await reconcileStripeBilling(
    {
      apply: false
    },
    {
      stripe,
      store: store as any,
      creditsService: creditsService as any,
      subscriptionCredits: {
        monthlyPriceId: 'price_monthly',
        annualPriceId: 'price_annual',
        monthlyCreditsBrl: 20,
        annualCreditsBrl: 300,
        enterpriseAnnualCreditsBrl: 360
      }
    }
  )

  assert.equal(result.totals.scanned, 1)
  assert.equal(result.totals.wouldApply, 1)
  assert.equal(result.totals.applied, 0)
  assert.equal(result.totals.idempotent, 0)
  assert.equal(result.items[0]?.status, 'would_apply')
  assert.equal(creditsService.calls.length, 0)
})

test('reconcileStripeBilling apply handles enterprise annual invoices', async () => {
  const store = new FakeBillingStore()
  const creditsService = new FakeCreditsService()
  const invoice = {
    id: 'in_reconcile_enterprise_1',
    customer: 'cus_1',
    amount_paid: 120000,
    billing_reason: 'subscription_cycle',
    lines: {
      data: [{ type: 'subscription', proration: false, price: { id: 'price_enterprise_annual' } }]
    }
  }
  const stripe = makeFakeStripe(invoice)

  const result = await reconcileStripeBilling(
    {
      apply: true
    },
    {
      stripe,
      store: store as any,
      creditsService: creditsService as any,
      subscriptionCredits: {
        monthlyPriceId: 'price_monthly',
        annualPriceId: 'price_annual',
        enterpriseAnnualPriceId: 'price_enterprise_annual',
        monthlyCreditsBrl: 20,
        annualCreditsBrl: 300,
        enterpriseAnnualCreditsBrl: 360
      }
    }
  )

  assert.equal(result.totals.applied, 1)
  assert.equal(result.items[0]?.planName, 'enterprise_annual')
  assert.equal(result.items[0]?.creditsBrl, 360)
  assert.equal(creditsService.calls[0]?.amountBrl, 360)
})

test('reconcileStripeBilling apply is idempotent by invoice.id across repeated runs', async () => {
  const store = new FakeBillingStore()
  const creditsService = new FakeCreditsService()
  const invoice = {
    id: 'in_reconcile_2',
    customer: 'cus_1',
    amount_paid: 10000,
    billing_reason: 'subscription_cycle',
    lines: {
      data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }]
    }
  }
  const stripe = makeFakeStripe(invoice)

  const first = await reconcileStripeBilling(
    { apply: true },
    {
      stripe,
      store: store as any,
      creditsService: creditsService as any,
      subscriptionCredits: {
        monthlyPriceId: 'price_monthly',
        annualPriceId: 'price_annual',
        monthlyCreditsBrl: 20,
        annualCreditsBrl: 300,
        enterpriseAnnualCreditsBrl: 360
      }
    }
  )
  const second = await reconcileStripeBilling(
    { apply: true },
    {
      stripe,
      store: store as any,
      creditsService: creditsService as any,
      subscriptionCredits: {
        monthlyPriceId: 'price_monthly',
        annualPriceId: 'price_annual',
        monthlyCreditsBrl: 20,
        annualCreditsBrl: 300,
        enterpriseAnnualCreditsBrl: 360
      }
    }
  )

  assert.equal(first.totals.applied, 1)
  assert.equal(second.totals.idempotent, 1)
  assert.equal(creditsService.calls.length, 2)
})
