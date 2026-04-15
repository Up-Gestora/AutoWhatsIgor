import type Stripe from 'stripe'
import type { CreditsService } from '../credits'
import type { BillingStore } from './store'
import { upsertSubscriptionAndPaymentMethod, type StripeWebhookDeps } from './webhookHandler'
import {
  extractInvoiceSubscriptionId,
  extractStripeId,
  normalizeString,
  resolvePlanFromInvoiceLines,
  resolvePlanFromSubscription,
  type SubscriptionCreditsConfig
} from './stripeInvoice'

type LoggerLike = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export type ReconcileStripeBillingOptions = {
  fromUnixSec?: number | null
  toUnixSec?: number | null
  sessionId?: string | null
  apply?: boolean
}

export type ReconcileStripeBillingItem = {
  invoiceId: string | null
  customerId: string | null
  subscriptionId: string | null
  sessionId: string | null
  status: 'applied' | 'idempotent' | 'would_apply' | 'skipped' | 'error'
  reason: string
  planName: 'pro_monthly' | 'pro_annual' | 'enterprise_annual' | null
  creditsBrl: number | null
  error?: string
}

export type ReconcileStripeBillingResult = {
  apply: boolean
  fromUnixSec: number | null
  toUnixSec: number | null
  totals: {
    scanned: number
    candidates: number
    applied: number
    idempotent: number
    wouldApply: number
    skipped: number
    errors: number
  }
  items: ReconcileStripeBillingItem[]
}

type ReconcileStripeBillingDeps = {
  stripe: Stripe
  store: BillingStore
  creditsService: CreditsService
  subscriptionCredits: SubscriptionCreditsConfig
  logger?: LoggerLike
}

export async function reconcileStripeBilling(
  options: ReconcileStripeBillingOptions,
  deps: ReconcileStripeBillingDeps
): Promise<ReconcileStripeBillingResult> {
  const apply = Boolean(options.apply)
  const filterSessionId = normalizeString(options.sessionId) ?? null
  const fromUnixSec = asOptionalInt(options.fromUnixSec)
  const toUnixSec = asOptionalInt(options.toUnixSec)

  const totals = {
    scanned: 0,
    candidates: 0,
    applied: 0,
    idempotent: 0,
    wouldApply: 0,
    skipped: 0,
    errors: 0
  }
  const items: ReconcileStripeBillingItem[] = []

  const createdFilter: Stripe.RangeQueryParam | number | undefined =
    fromUnixSec || toUnixSec
      ? {
          ...(fromUnixSec ? { gte: fromUnixSec } : {}),
          ...(toUnixSec ? { lte: toUnixSec } : {})
        }
      : undefined

  let startingAfter: string | undefined

  while (true) {
    const page = await deps.stripe.invoices.list({
      limit: 100,
      ...(createdFilter ? { created: createdFilter } : {}),
      ...(startingAfter ? { starting_after: startingAfter } : {})
    })

    if (page.data.length === 0) {
      break
    }

    for (const invoice of page.data) {
      totals.scanned += 1

      const item = await reconcileInvoice(invoice, {
        apply,
        filterSessionId,
        deps
      })
      items.push(item)

      if (item.status === 'applied') {
        totals.applied += 1
      } else if (item.status === 'idempotent') {
        totals.idempotent += 1
      } else if (item.status === 'would_apply') {
        totals.wouldApply += 1
      } else if (item.status === 'error') {
        totals.errors += 1
      } else {
        totals.skipped += 1
      }

      if (
        item.reason.startsWith('candidate_') ||
        item.reason === 'applied' ||
        item.reason === 'idempotent' ||
        item.reason === 'would_apply'
      ) {
        totals.candidates += 1
      }
    }

    if (!page.has_more) {
      break
    }

    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) {
      break
    }
  }

  return {
    apply,
    fromUnixSec,
    toUnixSec,
    totals,
    items
  }
}

async function reconcileInvoice(
  invoice: Stripe.Invoice,
  input: {
    apply: boolean
    filterSessionId: string | null
    deps: ReconcileStripeBillingDeps
  }
): Promise<ReconcileStripeBillingItem> {
  const invoiceId = normalizeString((invoice as any).id)
  const customerId = extractStripeId((invoice as any).customer)
  const billingReason = normalizeString((invoice as any).billing_reason)
  const amountPaid = typeof (invoice as any).amount_paid === 'number' ? (invoice as any).amount_paid : null

  const baseItem = (patch: Partial<ReconcileStripeBillingItem>): ReconcileStripeBillingItem => ({
    invoiceId,
    customerId,
    subscriptionId: extractInvoiceSubscriptionId(invoice),
    sessionId: null,
    status: 'skipped',
    reason: 'unknown',
    planName: null,
    creditsBrl: null,
    ...patch
  })

  if (!invoiceId || !customerId) {
    return baseItem({ status: 'skipped', reason: 'skip_missing_identifiers' })
  }

  if (!amountPaid || amountPaid <= 0) {
    return baseItem({ status: 'skipped', reason: 'skip_amount_paid_non_positive' })
  }

  if (billingReason !== 'subscription_create' && billingReason !== 'subscription_cycle') {
    return baseItem({ status: 'skipped', reason: 'skip_billing_reason_not_subscription' })
  }

  let subscriptionId = extractInvoiceSubscriptionId(invoice)
  let subscription: Stripe.Subscription | null = null
  let resolvedPlan = resolvePlanFromInvoiceLines(invoice, input.deps.subscriptionCredits)

  if (!resolvedPlan) {
    if (!subscriptionId) {
      return baseItem({ status: 'skipped', reason: 'skip_missing_subscription_id' })
    }

    try {
      subscription = await input.deps.stripe.subscriptions.retrieve(subscriptionId)
      resolvedPlan = resolvePlanFromSubscription(subscription, input.deps.subscriptionCredits)
    } catch (error) {
      return baseItem({
        status: 'error',
        reason: 'subscription_fetch_failed',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (!resolvedPlan) {
    return baseItem({ status: 'skipped', reason: 'skip_missing_price_id' })
  }

  let sessionId = await input.deps.store.getSessionIdByCustomerId(customerId)
  if (!sessionId) {
    sessionId = normalizeString((invoice as any).metadata?.sessionId)
  }

  let customer: Stripe.Customer | null = null
  if (!sessionId) {
    try {
      const retrievedCustomer = await input.deps.stripe.customers.retrieve(customerId)
      if (!(retrievedCustomer as any).deleted) {
        customer = retrievedCustomer as Stripe.Customer
        sessionId = normalizeString((customer as any).metadata?.sessionId)
      }
    } catch {
      // Ignore lookup failures.
    }
  }

  if (!sessionId && subscriptionId) {
    try {
      if (!subscription) {
        subscription = await input.deps.stripe.subscriptions.retrieve(subscriptionId)
      }
      sessionId = normalizeString((subscription as any).metadata?.sessionId)
    } catch {
      // Ignore lookup failures.
    }
  }

  if (!sessionId) {
    return baseItem({
      status: 'skipped',
      reason: 'skip_session_mapping_missing',
      subscriptionId
    })
  }

  if (input.filterSessionId && sessionId !== input.filterSessionId) {
    return baseItem({
      sessionId,
      subscriptionId,
      status: 'skipped',
      reason: 'skip_session_filter_mismatch',
      planName: resolvedPlan.planName,
      creditsBrl: resolvedPlan.creditsBrl
    })
  }

  if (!input.apply) {
    return baseItem({
      sessionId,
      subscriptionId,
      status: 'would_apply',
      reason: 'would_apply',
      planName: resolvedPlan.planName,
      creditsBrl: resolvedPlan.creditsBrl
    })
  }

  try {
    const email = customer ? normalizeString((customer as any).email) : null
    await input.deps.store.upsertCustomer(sessionId, customerId, email)

    if (subscriptionId) {
      if (!subscription) {
        subscription = await input.deps.stripe.subscriptions.retrieve(subscriptionId)
      }
      const webhookDeps: StripeWebhookDeps = {
        store: input.deps.store,
        stripe: input.deps.stripe,
        logger: {
          info: (obj, msg) => input.deps.logger?.info?.(msg ?? 'billing.reconcile', obj),
          warn: (obj, msg) => input.deps.logger?.warn?.(msg ?? 'billing.reconcile', obj),
          error: (obj, msg) => input.deps.logger?.error?.(msg ?? 'billing.reconcile', obj)
        }
      }
      await upsertSubscriptionAndPaymentMethod(sessionId, customerId, subscription, webhookDeps)
    }

    const creditResult = await input.deps.creditsService.grantSubscriptionCredits(sessionId, resolvedPlan.creditsBrl, {
      referenceId: invoiceId,
      reason: resolvedPlan.planName,
      actorId: 'stripe'
    })

    return baseItem({
      sessionId,
      subscriptionId,
      status: creditResult.granted ? 'applied' : 'idempotent',
      reason: creditResult.granted ? 'applied' : 'idempotent',
      planName: resolvedPlan.planName,
      creditsBrl: resolvedPlan.creditsBrl
    })
  } catch (error) {
    return baseItem({
      sessionId,
      subscriptionId,
      status: 'error',
      reason: 'apply_failed',
      planName: resolvedPlan.planName,
      creditsBrl: resolvedPlan.creditsBrl,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

function asOptionalInt(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return Math.floor(value)
}
