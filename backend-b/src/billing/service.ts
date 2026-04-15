import Stripe from 'stripe'
import type { AppEnv } from '../config/env'
import type { CreditsService } from '../credits'
import type { AffiliateService } from '../affiliates'
import type { MetricsStore } from '../observability/metrics'
import type { BillingOverview, BillingPlanPricing, BillingPlansCatalog } from './types'
import { BillingStore } from './store'
import { handleStripeWebhookEvent } from './webhookHandler'

type LoggerLike = {
  info?: (msg: string, meta?: Record<string, unknown>) => void
  warn?: (msg: string, meta?: Record<string, unknown>) => void
  error?: (msg: string, meta?: Record<string, unknown>) => void
}

type BillingServiceOptions = {
  env: AppEnv
  store: BillingStore
  creditsService?: CreditsService
  affiliateService?: Pick<
    AffiliateService,
    'getAttributionBySessionId' | 'markCheckoutStarted' | 'markSubscriptionCreated' | 'markFirstPaymentConfirmed'
  >
  metrics?: MetricsStore
  logger?: LoggerLike
  stripe?: Stripe
}

export type SubscriptionPlan = 'pro_monthly' | 'pro_annual' | 'enterprise_annual'
export type CreditsPackageId = '20' | '50' | '100'

export class BillingService {
  private readonly env: AppEnv
  private readonly store: BillingStore
  private readonly creditsService?: CreditsService
  private readonly affiliateService?: Pick<
    AffiliateService,
    'getAttributionBySessionId' | 'markCheckoutStarted' | 'markSubscriptionCreated' | 'markFirstPaymentConfirmed'
  >
  private readonly metrics?: MetricsStore
  private readonly logger?: LoggerLike
  private readonly stripe: Stripe | null
  private plansCatalogCache: { value: BillingPlansCatalog; expiresAt: number } | null = null
  private plansCatalogPromise: Promise<BillingPlansCatalog> | null = null

  constructor(options: BillingServiceOptions) {
    this.env = options.env
    this.store = options.store
    this.creditsService = options.creditsService
    this.affiliateService = options.affiliateService
    this.metrics = options.metrics
    this.logger = options.logger

    const secretKey = this.env.STRIPE_SECRET_KEY?.trim()
    this.stripe = options.stripe ?? (secretKey ? new Stripe(secretKey) : null)
  }

  isConfigured(): boolean {
    const secretKey = this.env.STRIPE_SECRET_KEY?.trim() ?? ''
    const webhookSecret = this.env.STRIPE_WEBHOOK_SECRET?.trim() ?? ''
    const appUrl = this.env.APP_PUBLIC_URL?.trim() ?? ''
    const monthlyPrice = this.env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim() ?? ''
    return Boolean(this.stripe && secretKey && webhookSecret && appUrl && monthlyPrice)
  }

  async getOverview(sessionId: string): Promise<{ stripeConfigured: boolean; billing: BillingOverview; plans: BillingPlansCatalog }> {
    const [billing, plans] = await Promise.all([this.store.getOverview(sessionId), this.getPlansCatalog()])
    return {
      stripeConfigured: this.isConfigured(),
      billing,
      plans
    }
  }

  private async getPlansCatalog(): Promise<BillingPlansCatalog> {
    const now = Date.now()
    if (this.plansCatalogCache && this.plansCatalogCache.expiresAt > now) {
      return this.plansCatalogCache.value
    }
    if (this.plansCatalogPromise) {
      return this.plansCatalogPromise
    }

    const ttlMs = 10 * 60 * 1000

    this.plansCatalogPromise = (async () => {
      const monthlyPriceId = this.env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim() ?? ''
      const annualPriceId = this.env.STRIPE_PRICE_ID_PRO_ANNUAL?.trim() ?? ''
      const enterpriseAnnualPriceId = this.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?.trim() ?? ''

      const [monthly, annual, enterpriseAnnual] = await Promise.all([
        this.resolvePlanPricing(monthlyPriceId),
        this.resolvePlanPricing(annualPriceId),
        this.resolvePlanPricing(enterpriseAnnualPriceId)
      ])

      const value: BillingPlansCatalog = {
        pro_monthly: monthly,
        pro_annual: annual,
        enterprise_annual: enterpriseAnnual
      }

      this.plansCatalogCache = { value, expiresAt: Date.now() + ttlMs }
      return value
    })().finally(() => {
      this.plansCatalogPromise = null
    })

    return this.plansCatalogPromise
  }

  private buildEmptyPlanPricing(enabled: boolean): BillingPlanPricing {
    return {
      enabled,
      priceActive: null,
      unitAmountCents: null,
      currency: null,
      interval: null
    }
  }

  private async resolvePlanPricing(priceId: string): Promise<BillingPlanPricing> {
    const normalized = priceId.trim()
    if (!normalized) {
      return this.buildEmptyPlanPricing(false)
    }

    if (!this.stripe) {
      // Stripe not configured; keep plan enabled but without showing a stale/guessed price.
      return this.buildEmptyPlanPricing(true)
    }

    try {
      const price = await this.stripe.prices.retrieve(normalized)
      const interval = price.recurring?.interval
      const normalizedInterval: 'month' | 'year' | null = interval === 'month' || interval === 'year' ? interval : null

      return {
        enabled: true,
        priceActive: typeof price.active === 'boolean' ? price.active : null,
        unitAmountCents: typeof price.unit_amount === 'number' ? price.unit_amount : null,
        currency: typeof price.currency === 'string' ? price.currency : null,
        interval: normalizedInterval
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger?.warn?.('stripe.price.retrieve_failed', { priceId: normalized, error: message })
      return this.buildEmptyPlanPricing(true)
    }
  }

  async createSubscriptionCheckoutUrl(sessionId: string, input: { plan: SubscriptionPlan; email?: string | null }) {
    const stripe = this.requireStripe()
    const priceId = this.resolvePlanPriceId(input.plan)
    const appUrl = this.requireAppPublicUrl()
    const affiliateAttribution = (await this.affiliateService?.getAttributionBySessionId(sessionId)) ?? null
    const affiliateMetadata = buildAffiliateMetadata(affiliateAttribution)

    const customerId = await this.ensureCustomer(sessionId, input.email ?? undefined, affiliateMetadata)
    await this.assertNoActiveSubscription(customerId)

    const successUrl = buildDashboardReturnUrl(appUrl, { billing: 'success' })
    const cancelUrl = buildDashboardReturnUrl(appUrl, { billing: 'cancel' })

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: sessionId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        sessionId,
        kind: 'subscription',
        plan: input.plan,
        ...affiliateMetadata
      },
      subscription_data: {
        metadata: {
          sessionId,
          ...affiliateMetadata
        }
      }
    })

    if (!session.url) {
      throw new Error('stripe_checkout_url_missing')
    }

    await this.affiliateService?.markCheckoutStarted(sessionId, {
      occurredAtMs: Date.now(),
      stripeCheckoutSessionId: typeof session.id === 'string' ? session.id : null
    })

    return session.url
  }

  async createCreditsCheckoutUrl(sessionId: string, input: { packageId: CreditsPackageId; email?: string | null }) {
    const stripe = this.requireStripe()
    const appUrl = this.requireAppPublicUrl()
    const customerId = await this.ensureCustomer(sessionId, input.email ?? undefined)
    await this.assertHasActiveProSubscription(customerId)

    const amountBrl = resolveCreditsPackageAmount(input.packageId)
    const amountCents = Math.round(amountBrl * 100)

    const successUrl = buildDashboardReturnUrl(appUrl, { billing: 'success' })
    const cancelUrl = buildDashboardReturnUrl(appUrl, { billing: 'cancel' })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      client_reference_id: sessionId,
      line_items: [
        {
          price_data: {
            currency: 'brl',
            unit_amount: amountCents,
            product_data: {
              name: 'Creditos AutoWhats'
            }
          },
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        sessionId,
        kind: 'credits_topup',
        amountBrl: String(amountBrl)
      }
    })

    if (!session.url) {
      throw new Error('stripe_checkout_url_missing')
    }

    return session.url
  }

  async createPortalUrl(sessionId: string, input?: { email?: string | null }) {
    const stripe = this.requireStripe()
    const appUrl = this.requireAppPublicUrl()
    const customerId = await this.ensureCustomer(sessionId, input?.email ?? undefined)
    const returnUrl = buildDashboardReturnUrl(appUrl, {})

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    })

    if (!portal.url) {
      throw new Error('stripe_portal_url_missing')
    }

    return portal.url
  }

  async handleWebhook(rawBody: Buffer | string, signatureHeader: string | undefined): Promise<void> {
    const stripe = this.requireStripe()
    const webhookSecret = this.env.STRIPE_WEBHOOK_SECRET?.trim()
    if (!webhookSecret) {
      throw new Error('stripe_webhook_secret_missing')
    }
    if (!signatureHeader) {
      throw new Error('stripe_signature_missing')
    }

    let eventType = 'unknown'
    let eventId = 'unknown'

    try {
      const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret)
      eventType = event.type
      eventId = event.id

      const webhookResult = await handleStripeWebhookEvent(event, {
        store: this.store,
        stripe,
        creditsService: this.creditsService,
        affiliateService: this.affiliateService,
        subscriptionCredits: {
          monthlyPriceId: this.env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim() ?? '',
          annualPriceId: this.env.STRIPE_PRICE_ID_PRO_ANNUAL?.trim() || null,
          enterpriseAnnualPriceId: this.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?.trim() || null,
          monthlyCreditsBrl: 20,
          annualCreditsBrl: 300,
          enterpriseAnnualCreditsBrl: 360
        },
        logger: {
          info: (obj, msg) => this.logger?.info?.(msg ?? 'billing.webhook', obj),
          warn: (obj, msg) => this.logger?.warn?.(msg ?? 'billing.webhook', obj),
          error: (obj, msg) => this.logger?.error?.(msg ?? 'billing.webhook', obj)
        }
      })

      this.incrementWebhookMetric(webhookResult.status, eventType)
      this.logger?.info?.('stripe.webhook.result', {
        eventId,
        eventType,
        status: webhookResult.status,
        reason: webhookResult.reason
      })
    } catch (error) {
      this.incrementWebhookMetric('failed', eventType)
      this.logger?.error?.('stripe.webhook.failed', {
        eventId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new Error('stripe_not_configured')
    }
    return this.stripe
  }

  private requireAppPublicUrl(): string {
    const raw = this.env.APP_PUBLIC_URL?.trim() ?? ''
    if (!raw) {
      throw new Error('app_public_url_missing')
    }
    return raw.replace(/\/+$/, '')
  }

  private resolvePlanPriceId(plan: SubscriptionPlan): string {
    const monthlyPriceId = this.env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim() ?? ''
    const annualPriceId = this.env.STRIPE_PRICE_ID_PRO_ANNUAL?.trim() ?? ''
    const enterpriseAnnualPriceId = this.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?.trim() ?? ''

    if (plan === 'pro_monthly') {
      if (!monthlyPriceId) {
        throw new Error('stripe_price_monthly_missing')
      }
      return monthlyPriceId
    }

    if (plan === 'pro_annual') {
      if (!annualPriceId) {
        throw new Error('stripe_price_annual_missing')
      }
      return annualPriceId
    }

    if (!enterpriseAnnualPriceId) {
      throw new Error('stripe_price_enterprise_missing')
    }
    if (annualPriceId && enterpriseAnnualPriceId === annualPriceId) {
      throw new Error('stripe_price_enterprise_conflicts_annual')
    }
    if (monthlyPriceId && enterpriseAnnualPriceId === monthlyPriceId) {
      throw new Error('stripe_price_enterprise_conflicts_monthly')
    }
    return enterpriseAnnualPriceId
  }

  private async ensureCustomer(sessionId: string, email?: string, metadata?: Record<string, string>): Promise<string> {
    const stripe = this.requireStripe()
    const existing = await this.store.getCustomer(sessionId)
    if (existing?.stripeCustomerId) {
      if (metadata && Object.keys(metadata).length > 0 && typeof stripe.customers.update === 'function') {
        try {
          await stripe.customers.update(existing.stripeCustomerId, {
            metadata: {
              sessionId,
              ...metadata
            }
          })
        } catch (error) {
          this.logger?.warn?.('stripe.customer.update_metadata_failed', {
            sessionId,
            customerId: existing.stripeCustomerId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      return existing.stripeCustomerId
    }

    const customer = await stripe.customers.create({
      ...(email ? { email } : {}),
      metadata: {
        sessionId,
        ...(metadata ?? {})
      }
    })

    await this.store.upsertCustomer(sessionId, customer.id, email ?? null)
    this.logger?.info?.('stripe.customer.created', { sessionId, customerId: customer.id })

    return customer.id
  }

  private async assertNoActiveSubscription(customerId: string): Promise<void> {
    const stripe = this.requireStripe()
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })

    const hasExisting = subscriptions.data.some((sub) => {
      const status = sub.status
      return status !== 'canceled' && status !== 'incomplete_expired'
    })

    if (hasExisting) {
      throw new Error('already_subscribed')
    }
  }

  private async assertHasActiveProSubscription(customerId: string): Promise<void> {
    const stripe = this.requireStripe()

    const monthlyPriceId = this.env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim() ?? ''
    if (!monthlyPriceId) {
      throw new Error('stripe_price_monthly_missing')
    }

    const allowedPriceIds = new Set<string>([monthlyPriceId])
    const annualPriceId = this.env.STRIPE_PRICE_ID_PRO_ANNUAL?.trim() ?? ''
    if (annualPriceId) {
      allowedPriceIds.add(annualPriceId)
    }
    const enterpriseAnnualPriceId = this.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?.trim() ?? ''
    if (enterpriseAnnualPriceId) {
      allowedPriceIds.add(enterpriseAnnualPriceId)
    }

    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })

    const hasPro = subscriptions.data.some((sub) => {
      if (sub.status !== 'active' && sub.status !== 'trialing') {
        return false
      }

      const items = sub.items?.data ?? []
      return items.some((item) => {
        const price = (item as any).price as unknown
        const priceId =
          typeof price === 'string'
            ? price
            : price && typeof price === 'object' && 'id' in price
              ? String((price as any).id)
              : null

        return Boolean(priceId && allowedPriceIds.has(priceId))
      })
    })

    if (!hasPro) {
      throw new Error('pro_subscription_required')
    }
  }

  private incrementWebhookMetric(status: 'processed' | 'skipped' | 'failed', eventType: string) {
    const eventTypeMetric = sanitizeMetricKey(eventType)
    this.metrics?.increment(`billing.webhook.${status}`)
    this.metrics?.increment(`billing.webhook.${status}.${eventTypeMetric}`)
  }
}

function buildAffiliateMetadata(
  attribution: Awaited<ReturnType<NonNullable<BillingServiceOptions['affiliateService']>['getAttributionBySessionId']>> | null
): Record<string, string> {
  if (!attribution) {
    return {}
  }

  return {
    affiliateCode: attribution.affiliateCode,
    affiliateClickId: attribution.clickId,
    affiliateVisitorId: attribution.visitorId,
    affiliateAttributionModel: attribution.attributionModel
  }
}

function resolveCreditsPackageAmount(packageId: CreditsPackageId): number {
  if (packageId === '20') return 20
  if (packageId === '50') return 50
  return 100
}

function buildDashboardReturnUrl(appPublicUrl: string, query: { billing?: 'success' | 'cancel' } | Record<string, string>) {
  const base = `${appPublicUrl}/dashboard/configuracoes`
  const params = new URLSearchParams()
  params.set('tab', 'assinatura_creditos')
  if ('billing' in query && query.billing) {
    params.set('billing', query.billing)
  } else {
    for (const [key, value] of Object.entries(query)) {
      params.set(key, String(value))
    }
  }

  return `${base}?${params.toString()}`
}

function sanitizeMetricKey(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return 'unknown'
  }
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown'
}
