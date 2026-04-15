import type Stripe from 'stripe'
import type { CreditsService } from '../credits'
import type { AffiliateService } from '../affiliates'
import type { BillingStore } from './store'
import {
  extractInvoiceSubscriptionId,
  extractStripeId,
  listSubscriptionPriceIds,
  normalizeString,
  parseNumber,
  resolvePlanFromInvoiceLines,
  resolvePlanFromSubscription,
  type SubscriptionCreditsConfig
} from './stripeInvoice'

type LoggerLike = {
  info?: (obj: Record<string, unknown>, msg?: string) => void
  warn?: (obj: Record<string, unknown>, msg?: string) => void
  error?: (obj: Record<string, unknown>, msg?: string) => void
}

export type StripeWebhookDeps = {
  store: BillingStore
  stripe: Stripe
  creditsService?: CreditsService
  affiliateService?: Pick<AffiliateService, 'markSubscriptionCreated' | 'markFirstPaymentConfirmed'>
  subscriptionCredits?: SubscriptionCreditsConfig
  logger?: LoggerLike
}

export type StripeWebhookOutcome = {
  status: 'processed' | 'skipped'
  reason: string
  eventId: string
  eventType: string
}

function outcome(event: Stripe.Event, status: StripeWebhookOutcome['status'], reason: string): StripeWebhookOutcome {
  return {
    status,
    reason,
    eventId: event.id,
    eventType: event.type
  }
}

export async function handleStripeWebhookEvent(event: Stripe.Event, deps: StripeWebhookDeps): Promise<StripeWebhookOutcome> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const metadata = session.metadata ?? {}
    const sessionId = normalizeString(metadata.sessionId) ?? normalizeString(session.client_reference_id)
    const customerId = normalizeString(session.customer)

    if (sessionId && customerId) {
      await deps.store.upsertCustomer(sessionId, customerId, normalizeString(session.customer_details?.email))
    }

    let kind = normalizeString(metadata.kind)
    if (!kind) {
      const mode = normalizeString((session as any).mode)
      if (mode === 'subscription') {
        kind = 'subscription'
      }
    }

    if (!kind) {
      return outcome(event, 'skipped', 'checkout_kind_missing')
    }

    if (kind === 'credits_topup') {
      if (!sessionId) {
        deps.logger?.warn?.({ eventId: event.id }, 'Stripe top-up webhook missing sessionId')
        return outcome(event, 'skipped', 'topup_missing_session_id')
      }
      if (!deps.creditsService) {
        deps.logger?.warn?.({ eventId: event.id, sessionId }, 'Stripe top-up received but creditsService is missing')
        return outcome(event, 'skipped', 'topup_credits_service_missing')
      }

      const paymentIntentId = extractStripeId(session.payment_intent)
      const amountCents = typeof session.amount_total === 'number' ? session.amount_total : null
      const amountBrl = amountCents !== null ? amountCents / 100 : parseNumber(metadata.amountBrl)

      if (!paymentIntentId) {
        deps.logger?.warn?.({ eventId: event.id, sessionId }, 'Stripe top-up webhook missing payment_intent')
        return outcome(event, 'skipped', 'topup_missing_payment_intent')
      }
      if (!amountBrl || !Number.isFinite(amountBrl) || amountBrl <= 0) {
        deps.logger?.warn?.({ eventId: event.id, sessionId }, 'Stripe top-up webhook missing/invalid amount')
        return outcome(event, 'skipped', 'topup_amount_invalid')
      }

      try {
        await deps.creditsService.topUp(sessionId, amountBrl, {
          referenceId: paymentIntentId,
          reason: 'stripe_topup'
        })
      } catch (error) {
        if (isPgUniqueViolation(error)) {
          deps.logger?.info?.({ eventId: event.id, sessionId, paymentIntentId }, 'Stripe top-up already applied')
          return outcome(event, 'processed', 'topup_idempotent')
        }
        throw error
      }

      deps.logger?.info?.({ eventId: event.id, sessionId, paymentIntentId, amountBrl }, 'Stripe top-up applied')
      return outcome(event, 'processed', 'topup_applied')
    }

    if (kind === 'subscription') {
      const subscriptionId = extractStripeId(session.subscription)
      if (!sessionId || !customerId || !subscriptionId) {
        deps.logger?.warn?.(
          { eventId: event.id, sessionId: sessionId ?? null, customerId: customerId ?? null },
          'Stripe subscription webhook missing identifiers'
        )
        return outcome(event, 'skipped', 'subscription_checkout_missing_identifiers')
      }

      const subscription = await deps.stripe.subscriptions.retrieve(subscriptionId)
      await upsertSubscriptionAndPaymentMethod(sessionId, customerId, subscription, deps)
      await deps.affiliateService?.markSubscriptionCreated(sessionId, {
        occurredAtMs: resolveStripeOccurredAtMs(event),
        stripeSubscriptionId: subscriptionId
      })
      deps.logger?.info?.({ eventId: event.id, sessionId, subscriptionId }, 'Stripe subscription stored')
      return outcome(event, 'processed', 'subscription_checkout_synced')
    }

    return outcome(event, 'skipped', 'checkout_kind_unsupported')
  }

  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
    if (!deps.creditsService || !deps.subscriptionCredits) {
      return outcome(event, 'skipped', 'invoice_credits_not_configured')
    }

    const invoice = event.data.object as Stripe.Invoice
    const amountPaid = typeof (invoice as any).amount_paid === 'number' ? (invoice as any).amount_paid : null
    if (!amountPaid || amountPaid <= 0) {
      return outcome(event, 'skipped', 'invoice_amount_paid_non_positive')
    }

    const billingReason = normalizeString((invoice as any).billing_reason)
    if (billingReason !== 'subscription_create' && billingReason !== 'subscription_cycle') {
      return outcome(event, 'skipped', 'invoice_billing_reason_not_subscription')
    }

    const invoiceId = normalizeString((invoice as any).id)
    const customerId = extractStripeId((invoice as any).customer)
    const subscriptionId = extractInvoiceSubscriptionId(invoice)
    if (!invoiceId || !customerId) {
      deps.logger?.warn?.(
        { eventId: event.id, invoiceId: invoiceId ?? null, customerId: customerId ?? null, reason: 'missing_identifiers' },
        'Stripe invoice skipped'
      )
      return outcome(event, 'skipped', 'invoice_missing_identifiers')
    }

    const logInvoiceSkip = (reason: string, extra: Record<string, unknown> = {}) => {
      deps.logger?.info?.({ eventId: event.id, invoiceId, customerId, reason, ...extra }, 'Stripe invoice skipped')
    }

    let resolvedPlan = resolvePlanFromInvoiceLines(invoice, deps.subscriptionCredits)
    let subscription: Stripe.Subscription | null = null

    if (!resolvedPlan) {
      if (!subscriptionId) {
        logInvoiceSkip('missing_subscription_id')
        return outcome(event, 'skipped', 'invoice_missing_subscription_id')
      }

      try {
        subscription = await deps.stripe.subscriptions.retrieve(subscriptionId)
      } catch (error) {
        logInvoiceSkip('subscription_fetch_failed', {
          subscriptionId,
          error: error instanceof Error ? error.message : String(error)
        })
        return outcome(event, 'skipped', 'invoice_subscription_fetch_failed')
      }

      resolvedPlan = resolvePlanFromSubscription(subscription, deps.subscriptionCredits)
    }

    if (!resolvedPlan) {
      logInvoiceSkip('missing_price_id', {
        subscriptionId: subscriptionId ?? null
      })
      return outcome(event, 'skipped', 'invoice_missing_price_id')
    }

    let sessionId = await deps.store.getSessionIdByCustomerId(customerId)
    if (!sessionId) {
      sessionId = normalizeString((invoice as any).metadata?.sessionId)
    }

    if (!sessionId) {
      try {
        const customer = await deps.stripe.customers.retrieve(customerId)
        if (!(customer as any).deleted) {
          sessionId = normalizeString((customer as any).metadata?.sessionId)
        }
      } catch {
        // Ignore fetch errors; we'll try other fallbacks.
      }
    }

    if (!sessionId && subscriptionId) {
      try {
        if (!subscription) {
          subscription = await deps.stripe.subscriptions.retrieve(subscriptionId)
        }
        sessionId = normalizeString((subscription as any)?.metadata?.sessionId)
      } catch {
        // Ignore fetch errors.
      }
    }

    if (!sessionId) {
      logInvoiceSkip('session_mapping_missing', {
        subscriptionId: subscriptionId ?? null
      })
      return outcome(event, 'skipped', 'invoice_session_mapping_missing')
    }

    await deps.store.upsertCustomer(sessionId, customerId)

    if (subscriptionId) {
      try {
        if (!subscription) {
          subscription = await deps.stripe.subscriptions.retrieve(subscriptionId)
        }
        await upsertSubscriptionAndPaymentMethod(sessionId, customerId, subscription, deps)
        await deps.affiliateService?.markSubscriptionCreated(sessionId, {
          occurredAtMs: resolveStripeOccurredAtMs(event),
          stripeSubscriptionId: subscriptionId
        })
      } catch (error) {
        deps.logger?.warn?.(
          {
            eventId: event.id,
            invoiceId,
            customerId,
            sessionId,
            subscriptionId,
            error: error instanceof Error ? error.message : String(error)
          },
          'Stripe invoice sync subscription failed (continuing credit grant)'
        )
      }
    }

    await deps.affiliateService?.markFirstPaymentConfirmed(sessionId, {
      occurredAtMs: resolveStripeOccurredAtMs(event),
      invoiceId
    })

    const result = await deps.creditsService.grantSubscriptionCredits(sessionId, resolvedPlan.creditsBrl, {
      referenceId: invoiceId,
      reason: resolvedPlan.planName,
      actorId: 'stripe'
    })

    deps.logger?.info?.(
      {
        eventId: event.id,
        eventType: event.type,
        invoiceId,
        sessionId,
        planName: resolvedPlan.planName,
        priceId: resolvedPlan.priceId,
        creditsBrl: resolvedPlan.creditsBrl,
        granted: result.granted
      },
      'Stripe subscription credits processed'
    )

    return outcome(event, 'processed', result.granted ? 'invoice_credits_granted' : 'invoice_credits_idempotent')
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = normalizeString(subscription.customer)
    const sessionIdFromMeta = normalizeString(subscription.metadata?.sessionId)
    const sessionId = customerId ? (await deps.store.getSessionIdByCustomerId(customerId)) ?? sessionIdFromMeta : sessionIdFromMeta

    if (!sessionId || !customerId) {
      deps.logger?.warn?.({ eventId: event.id }, 'Stripe subscription event missing session mapping')
      return outcome(event, 'skipped', 'subscription_event_session_mapping_missing')
    }

    await deps.store.upsertCustomer(sessionId, customerId)
    await upsertSubscriptionAndPaymentMethod(sessionId, customerId, subscription, deps)
    await deps.affiliateService?.markSubscriptionCreated(sessionId, {
      occurredAtMs: resolveStripeOccurredAtMs(event),
      stripeSubscriptionId: normalizeString(subscription.id) ?? null
    })
    deps.logger?.info?.(
      { eventId: event.id, eventType: event.type, sessionId, subscriptionId: subscription.id },
      'Stripe subscription updated'
    )
    return outcome(event, 'processed', 'subscription_event_synced')
  }

  return outcome(event, 'skipped', 'event_type_ignored')
}

export async function upsertSubscriptionAndPaymentMethod(
  sessionId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  deps: StripeWebhookDeps
) {
  const priceId = listSubscriptionPriceIds(subscription)[0] ?? null

  const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end
  const legacyPeriodEnd = (subscription as unknown as { current_period_end?: unknown }).current_period_end
  const periodEnd = typeof itemPeriodEnd === 'number' ? itemPeriodEnd : legacyPeriodEnd
  const currentPeriodEnd = typeof periodEnd === 'number' ? new Date(periodEnd * 1000) : null

  await deps.store.upsertSubscription({
    sessionId,
    stripeSubscriptionId: normalizeString(subscription.id) ?? null,
    status: normalizeString(subscription.status) ?? 'unknown',
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end)
  })

  const paymentMethodId =
    extractStripeId(subscription.default_payment_method) ?? (await resolveCustomerDefaultPaymentMethod(deps.stripe, customerId))

  if (!paymentMethodId) {
    return
  }

  const paymentMethod = await retrievePaymentMethodSafe(deps.stripe, paymentMethodId)
  const card = paymentMethod?.type === 'card' ? paymentMethod.card : null

  await deps.store.upsertPaymentMethod({
    sessionId,
    stripePaymentMethodId: paymentMethodId,
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null
  })
}

async function resolveCustomerDefaultPaymentMethod(stripe: Stripe, customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    if ((customer as any).deleted) {
      return null
    }

    const invoiceSettings = (customer as any).invoice_settings as { default_payment_method?: unknown } | undefined
    return extractStripeId(invoiceSettings?.default_payment_method)
  } catch {
    return null
  }
}

async function retrievePaymentMethodSafe(stripe: Stripe, paymentMethodId: string) {
  try {
    return await stripe.paymentMethods.retrieve(paymentMethodId)
  } catch {
    return null
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as any).code === '23505')
}

function resolveStripeOccurredAtMs(event: Stripe.Event): number {
  return typeof event.created === 'number' && Number.isFinite(event.created) ? event.created * 1000 : Date.now()
}
