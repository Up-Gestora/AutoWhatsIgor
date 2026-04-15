import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { handleStripeWebhookEvent } from '../src/billing'

class FakeBillingStore {
  customers: Array<{ sessionId: string; customerId: string; email?: string | null }> = []
  subscriptions: Array<Record<string, unknown>> = []
  paymentMethods: Array<Record<string, unknown>> = []
  sessionByCustomer = new Map<string, string>()

  async upsertCustomer(sessionId: string, stripeCustomerId: string, email?: string | null) {
    this.customers.push({ sessionId, customerId: stripeCustomerId, email })
    this.sessionByCustomer.set(stripeCustomerId, sessionId)
    return {
      sessionId,
      stripeCustomerId,
      email: email ?? null,
      updatedAt: Date.now()
    }
  }

  async getSessionIdByCustomerId(stripeCustomerId: string) {
    return this.sessionByCustomer.get(stripeCustomerId) ?? null
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

test('Stripe webhook credits_topup calls CreditsService.topUp (idempotent on unique violation)', async () => {
  const store = new FakeBillingStore()
  const calls: Array<{ sessionId: string; amountBrl: number; referenceId?: string | null }> = []

  const creditsService = {
    topUp: async (sessionId: string, amountBrl: number, meta: { referenceId?: string | null }) => {
      calls.push({ sessionId, amountBrl, referenceId: meta.referenceId })
      const err: any = new Error('duplicate key')
      err.code = '23505'
      throw err
    }
  }

  const fakeStripe = {
    paymentMethods: {
      retrieve: async () => null
    },
    customers: {
      retrieve: async () => ({ deleted: false, invoice_settings: {} })
    },
    subscriptions: {
      retrieve: async () => null
    }
  } as any as Stripe

  const event = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { kind: 'credits_topup', sessionId: 'sess_1', amountBrl: '20' },
        client_reference_id: 'sess_1',
        customer: 'cus_1',
        payment_intent: 'pi_1',
        amount_total: 2000
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 20, referenceId: 'pi_1' })
})

test('Stripe webhook invoice.paid credits Pro monthly subscription (idempotent by invoice.id)', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{
    sessionId: string
    amountBrl: number
    referenceId?: string | null
    reason?: string | null
    actorId?: string | null
  }> = []

  const creditsService = {
    grantSubscriptionCredits: async (
      sessionId: string,
      amountBrl: number,
      meta: { referenceId?: string | null; reason?: string | null; actorId?: string | null }
    ) => {
      calls.push({ sessionId, amountBrl, referenceId: meta.referenceId, reason: meta.reason, actorId: meta.actorId })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_1',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_1',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 2000,
        billing_reason: 'subscription_cycle',
        lines: {
          data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    sessionId: 'sess_1',
    amountBrl: 20,
    referenceId: 'in_1',
    reason: 'pro_monthly',
    actorId: 'stripe'
  })
})

test('Stripe webhook invoice.paid credits Pro annual subscription', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{ sessionId: string; amountBrl: number }> = []

  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number) => {
      calls.push({ sessionId, amountBrl })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_2',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_2',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 30000,
        billing_reason: 'subscription_create',
        lines: {
          data: [{ type: 'subscription', proration: false, price: { id: 'price_annual' } }]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 300 })
})

test('Stripe webhook invoice.paid credits Enterprise annual subscription', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{ sessionId: string; amountBrl: number }> = []

  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number) => {
      calls.push({ sessionId, amountBrl })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_enterprise_1',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_enterprise_1',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 120000,
        billing_reason: 'subscription_create',
        lines: {
          data: [{ type: 'subscription', proration: false, price: { id: 'price_enterprise_annual' } }]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      enterpriseAnnualPriceId: 'price_enterprise_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 360 })
})

test('Stripe webhook invoice.paid credits Pro monthly subscription on Clover payload shape', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{ sessionId: string; amountBrl: number; referenceId?: string | null }> = []
  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number, meta: { referenceId?: string | null }) => {
      calls.push({ sessionId, amountBrl, referenceId: meta.referenceId })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_monthly' } }] }
      })
    },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_clover_monthly',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_clover_1',
        customer: 'cus_1',
        amount_paid: 10000,
        billing_reason: 'subscription_create',
        lines: {
          data: [
            {
              proration: false,
              pricing: {
                price_details: {
                  price: 'price_monthly'
                }
              },
              parent: {
                subscription_item_details: {
                  subscription: 'sub_1'
                }
              }
            }
          ]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 20, referenceId: 'in_clover_1' })
})

test('Stripe webhook invoice.paid credits Pro annual subscription on Clover payload shape', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{ sessionId: string; amountBrl: number; referenceId?: string | null }> = []
  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number, meta: { referenceId?: string | null }) => {
      calls.push({ sessionId, amountBrl, referenceId: meta.referenceId })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_annual' } }] }
      })
    },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_clover_annual',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_clover_2',
        customer: 'cus_1',
        amount_paid: 30000,
        billing_reason: 'subscription_cycle',
        lines: {
          data: [
            {
              proration: false,
              pricing: {
                price_details: {
                  price: 'price_annual'
                }
              },
              parent: {
                subscription_item_details: {
                  subscription: 'sub_1'
                }
              }
            }
          ]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 300, referenceId: 'in_clover_2' })
})

test('Stripe webhook invoice.payment_succeeded uses the same subscription crediting logic', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{ sessionId: string; amountBrl: number; referenceId?: string | null }> = []
  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number, meta: { referenceId?: string | null }) => {
      calls.push({ sessionId, amountBrl, referenceId: meta.referenceId })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_succeeded_1',
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_succeeded_1',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 2000,
        billing_reason: 'subscription_create',
        lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }] }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 20, referenceId: 'in_succeeded_1' })
})

test('Stripe webhook invoice.paid infers plan from subscription items when invoice lines omit price id', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const calls: Array<{ sessionId: string; amountBrl: number; referenceId?: string | null }> = []
  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number, meta: { referenceId?: string | null }) => {
      calls.push({ sessionId, amountBrl, referenceId: meta.referenceId })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_price_fallback',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_monthly' } }] }
      })
    },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_invoice_price_fallback',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_price_fallback',
        customer: 'cus_1',
        amount_paid: 2000,
        billing_reason: 'subscription_cycle',
        lines: {
          data: [
            {
              proration: false,
              parent: {
                subscription_item_details: {
                  subscription: 'sub_price_fallback'
                }
              }
            }
          ]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_1', amountBrl: 20, referenceId: 'in_price_fallback' })
})

test('Stripe webhook does not duplicate credits when invoice.paid and invoice.payment_succeeded are both received', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  const seen = new Set<string>()
  let appliedCount = 0
  const creditsService = {
    grantSubscriptionCredits: async (_sessionId: string, _amountBrl: number, meta: { referenceId?: string | null }) => {
      const referenceId = meta.referenceId ?? ''
      const granted = !seen.has(referenceId)
      seen.add(referenceId)
      if (granted) {
        appliedCount += 1
      }
      return {
        granted,
        credits: { sessionId: 'sess_1', balanceBrl: 20, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const invoiceObject = {
    id: 'in_dup_1',
    customer: 'cus_1',
    subscription: 'sub_1',
    amount_paid: 2000,
    billing_reason: 'subscription_cycle',
    lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }] }
  }

  const eventPaid = {
    id: 'evt_paid_dup',
    type: 'invoice.paid',
    data: { object: invoiceObject }
  } as any as Stripe.Event

  const eventSucceeded = {
    id: 'evt_succeeded_dup',
    type: 'invoice.payment_succeeded',
    data: { object: invoiceObject }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(eventPaid, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })
  await handleStripeWebhookEvent(eventSucceeded, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(appliedCount, 1)
})

test('Stripe webhook invoice.paid skips when amount_paid = 0', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  let called = false
  const creditsService = {
    grantSubscriptionCredits: async () => {
      called = true
      return { granted: true, credits: { sessionId: 'sess_1', balanceBrl: 0 } as any }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_3',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_3',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 0,
        billing_reason: 'subscription_cycle',
        lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }] }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(called, false)
})

test('Stripe webhook invoice.paid skips when billing_reason is subscription_update', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_1', 'sess_1')

  let called = false
  const creditsService = {
    grantSubscriptionCredits: async () => {
      called = true
      return { granted: true, credits: { sessionId: 'sess_1', balanceBrl: 0 } as any }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_4',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_4',
        customer: 'cus_1',
        subscription: 'sub_1',
        amount_paid: 2000,
        billing_reason: 'subscription_update',
        lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }] }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(called, false)
})

test('Stripe webhook invoice.paid resolves sessionId via customer metadata when store mapping is missing', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.clear()

  const calls: Array<{ sessionId: string; amountBrl: number }> = []

  const creditsService = {
    grantSubscriptionCredits: async (sessionId: string, amountBrl: number) => {
      calls.push({ sessionId, amountBrl })
      return {
        granted: true,
        credits: { sessionId, balanceBrl: amountBrl, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
      }
    }
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: { sessionId: 'sess_99' }, invoice_settings: {} }) },
    subscriptions: { retrieve: async () => ({ metadata: {} }) },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_inv_5',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_5',
        customer: 'cus_missing',
        subscription: 'sub_1',
        amount_paid: 2000,
        billing_reason: 'subscription_cycle',
        lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }] }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { sessionId: 'sess_99', amountBrl: 20 })
})

test('Stripe webhook subscription.updated uses metadata.sessionId when customer mapping is missing', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.clear()

  const fakeStripe = {
    paymentMethods: {
      retrieve: async () => ({
        id: 'pm_1',
        type: 'card',
        card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 }
      })
    },
    customers: {
      retrieve: async () => ({ deleted: false, invoice_settings: {} })
    },
    subscriptions: {
      retrieve: async () => null
    }
  } as any as Stripe

  const event = {
    id: 'evt_sub_1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_missing',
        status: 'active',
        cancel_at_period_end: false,
        default_payment_method: 'pm_1',
        metadata: { sessionId: 'sess_99' },
        items: {
          data: [
            {
              current_period_end: Math.floor(Date.now() / 1000) + 86400,
              price: { id: 'price_1' }
            }
          ]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe
  })

  assert.equal(store.customers[0]?.sessionId, 'sess_99')
  assert.equal(store.subscriptions.length, 1)
  assert.equal(store.paymentMethods.length, 1)
})

test('Stripe webhook subscription.created uses metadata.sessionId when customer mapping is missing', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.clear()

  const fakeStripe = {
    paymentMethods: { retrieve: async () => null },
    customers: { retrieve: async () => ({ deleted: false, invoice_settings: {} }) },
    subscriptions: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_sub_created_1',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_created_1',
        customer: 'cus_missing',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { sessionId: 'sess_created_1' },
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_1' } }] }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe
  })

  assert.equal(store.customers[0]?.sessionId, 'sess_created_1')
  assert.equal(store.subscriptions.length, 1)
})

test('Stripe webhook checkout.session.completed infers subscription kind from session.mode when metadata.kind is missing', async () => {
  const store = new FakeBillingStore()
  const fakeStripe = {
    paymentMethods: { retrieve: async () => null },
    customers: { retrieve: async () => ({ deleted: false, invoice_settings: {} }) },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_mode_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_1' } }] }
      })
    }
  } as any as Stripe

  const event = {
    id: 'evt_checkout_mode_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        mode: 'subscription',
        metadata: { sessionId: 'sess_mode_1' },
        client_reference_id: 'sess_mode_1',
        customer: 'cus_mode_1',
        customer_details: { email: 'mode@example.com' },
        subscription: 'sub_mode_1'
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe
  })

  assert.equal(store.customers[0]?.sessionId, 'sess_mode_1')
  assert.equal(store.subscriptions.length, 1)
})

test('Stripe webhook checkout.session.completed marks affiliate subscription creation', async () => {
  const store = new FakeBillingStore()
  const affiliateMarks: Array<{ sessionId: string; occurredAtMs?: number | null; stripeSubscriptionId?: string | null }> = []
  const fakeStripe = {
    paymentMethods: { retrieve: async () => null },
    customers: { retrieve: async () => ({ deleted: false, invoice_settings: {} }) },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_aff_checkout',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_1' } }] }
      })
    }
  } as any as Stripe

  const event = {
    id: 'evt_aff_checkout',
    type: 'checkout.session.completed',
    created: 1_760_000_000,
    data: {
      object: {
        mode: 'subscription',
        metadata: { kind: 'subscription', sessionId: 'sess_aff_checkout' },
        client_reference_id: 'sess_aff_checkout',
        customer: 'cus_aff_checkout',
        customer_details: { email: 'affiliate@example.com' },
        subscription: 'sub_aff_checkout'
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    affiliateService: {
      markSubscriptionCreated: async (
        sessionId: string,
        input: { occurredAtMs?: number | null; stripeSubscriptionId?: string | null }
      ) => {
        affiliateMarks.push({ sessionId, ...input })
        return null as any
      },
      markFirstPaymentConfirmed: async () => null as any
    } as any
  })

  assert.equal(affiliateMarks.length, 1)
  assert.deepEqual(affiliateMarks[0], {
    sessionId: 'sess_aff_checkout',
    occurredAtMs: 1_760_000_000_000,
    stripeSubscriptionId: 'sub_aff_checkout'
  })
})

test('Stripe webhook invoice.paid marks affiliate subscription and first payment', async () => {
  const store = new FakeBillingStore()
  store.sessionByCustomer.set('cus_aff_invoice', 'sess_aff_invoice')

  const subscriptionMarks: Array<{ sessionId: string; occurredAtMs?: number | null; stripeSubscriptionId?: string | null }> = []
  const paymentMarks: Array<{ sessionId: string; occurredAtMs?: number | null; invoiceId?: string | null }> = []

  const creditsService = {
    grantSubscriptionCredits: async () => ({
      granted: true,
      credits: { sessionId: 'sess_aff_invoice', balanceBrl: 20, blockedAt: null, blockedReason: null, updatedAt: Date.now() }
    })
  }

  const fakeStripe = {
    customers: { retrieve: async () => ({ deleted: false, metadata: {} }) },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_aff_invoice',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86400, price: { id: 'price_monthly' } }] }
      })
    },
    paymentMethods: { retrieve: async () => null }
  } as any as Stripe

  const event = {
    id: 'evt_aff_invoice',
    type: 'invoice.paid',
    created: 1_760_100_000,
    data: {
      object: {
        id: 'in_aff_invoice',
        customer: 'cus_aff_invoice',
        subscription: 'sub_aff_invoice',
        amount_paid: 2000,
        billing_reason: 'subscription_cycle',
        lines: {
          data: [{ type: 'subscription', proration: false, price: { id: 'price_monthly' } }]
        }
      }
    }
  } as any as Stripe.Event

  await handleStripeWebhookEvent(event, {
    store: store as any,
    stripe: fakeStripe,
    creditsService: creditsService as any,
    affiliateService: {
      markSubscriptionCreated: async (
        sessionId: string,
        input: { occurredAtMs?: number | null; stripeSubscriptionId?: string | null }
      ) => {
        subscriptionMarks.push({ sessionId, ...input })
        return null as any
      },
      markFirstPaymentConfirmed: async (
        sessionId: string,
        input: { occurredAtMs?: number | null; invoiceId?: string | null }
      ) => {
        paymentMarks.push({ sessionId, ...input })
        return null as any
      }
    } as any,
    subscriptionCredits: {
      monthlyPriceId: 'price_monthly',
      annualPriceId: 'price_annual',
      monthlyCreditsBrl: 20,
      annualCreditsBrl: 300,
      enterpriseAnnualCreditsBrl: 360
    }
  })

  assert.equal(subscriptionMarks.length, 1)
  assert.deepEqual(subscriptionMarks[0], {
    sessionId: 'sess_aff_invoice',
    occurredAtMs: 1_760_100_000_000,
    stripeSubscriptionId: 'sub_aff_invoice'
  })
  assert.equal(paymentMarks.length, 1)
  assert.deepEqual(paymentMarks[0], {
    sessionId: 'sess_aff_invoice',
    occurredAtMs: 1_760_100_000_000,
    invoiceId: 'in_aff_invoice'
  })
})

