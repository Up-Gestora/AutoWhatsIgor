import type { Pool } from 'pg'
import type {
  AffiliateAttribution,
  AffiliateClick,
  AffiliateClickOutcome,
  AffiliateClickSummaryRow,
  AffiliateLink,
  AffiliateLinkStatus,
  AffiliateSignupFunnelRow
} from './types'

type AffiliateStoreOptions = {
  pool: Pool
  linksTable?: string
  clicksTable?: string
  attributionsTable?: string
}

export class AffiliateStore {
  private readonly pool: Pool
  private readonly linksTable: string
  private readonly clicksTable: string
  private readonly attributionsTable: string

  constructor(options: AffiliateStoreOptions) {
    this.pool = options.pool
    this.linksTable = options.linksTable ?? 'affiliate_links'
    this.clicksTable = options.clicksTable ?? 'affiliate_clicks'
    this.attributionsTable = options.attributionsTable ?? 'affiliate_attributions'
  }

  async init(): Promise<void> {
    const linksTable = this.quoteIdentifier(this.linksTable)
    const clicksTable = this.quoteIdentifier(this.clicksTable)
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${linksTable} (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${clicksTable} (
        click_id TEXT PRIMARY KEY,
        affiliate_code TEXT NOT NULL REFERENCES ${linksTable}(code),
        visitor_id TEXT NOT NULL,
        attribution_outcome TEXT NOT NULL,
        user_agent TEXT NULL,
        referer TEXT NULL,
        landing_path TEXT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${attributionsTable} (
        session_id TEXT PRIMARY KEY,
        affiliate_code TEXT NOT NULL REFERENCES ${linksTable}(code),
        click_id TEXT NOT NULL REFERENCES ${clicksTable}(click_id),
        visitor_id TEXT NOT NULL,
        attribution_model TEXT NOT NULL,
        signup_at TIMESTAMPTZ NOT NULL,
        checkout_started_at TIMESTAMPTZ NULL,
        stripe_checkout_session_id TEXT NULL,
        subscription_created_at TIMESTAMPTZ NULL,
        stripe_subscription_id TEXT NULL,
        first_payment_confirmed_at TIMESTAMPTZ NULL,
        first_paid_invoice_id TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.linksTable}_status_idx`)}
       ON ${linksTable} (status)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.clicksTable}_affiliate_occurred_idx`)}
       ON ${clicksTable} (affiliate_code, occurred_at DESC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.clicksTable}_visitor_affiliate_idx`)}
       ON ${clicksTable} (visitor_id, affiliate_code, occurred_at ASC)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.attributionsTable}_affiliate_signup_idx`)}
       ON ${attributionsTable} (affiliate_code, signup_at DESC)`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.attributionsTable}_checkout_uidx`)}
       ON ${attributionsTable} (stripe_checkout_session_id)
       WHERE stripe_checkout_session_id IS NOT NULL`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.attributionsTable}_subscription_uidx`)}
       ON ${attributionsTable} (stripe_subscription_id)
       WHERE stripe_subscription_id IS NOT NULL`
    )
    await this.pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.attributionsTable}_invoice_uidx`)}
       ON ${attributionsTable} (first_paid_invoice_id)
       WHERE first_paid_invoice_id IS NOT NULL`
    )
  }

  async listLinks(): Promise<AffiliateLink[]> {
    const linksTable = this.quoteIdentifier(this.linksTable)
    const result = await this.pool.query(
      `SELECT code, name, status, created_at, updated_at
       FROM ${linksTable}
       ORDER BY created_at DESC, code ASC`
    )
    return result.rows.map((row) => this.mapLink(row))
  }

  async getLink(code: string): Promise<AffiliateLink | null> {
    const linksTable = this.quoteIdentifier(this.linksTable)
    const result = await this.pool.query(
      `SELECT code, name, status, created_at, updated_at
       FROM ${linksTable}
       WHERE code = $1`,
      [code]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapLink(result.rows[0])
  }

  async upsertLink(input: { code: string; name: string; status: AffiliateLinkStatus }): Promise<AffiliateLink> {
    const linksTable = this.quoteIdentifier(this.linksTable)
    const result = await this.pool.query(
      `INSERT INTO ${linksTable} (code, name, status, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           status = EXCLUDED.status,
           updated_at = NOW()
       RETURNING code, name, status, created_at, updated_at`,
      [input.code, input.name, input.status]
    )
    return this.mapLink(result.rows[0])
  }

  async insertClick(input: {
    clickId: string
    affiliateCode: string
    visitorId: string
    attributionOutcome: AffiliateClickOutcome
    userAgent?: string | null
    referer?: string | null
    landingPath?: string | null
    occurredAtMs: number
  }): Promise<AffiliateClick> {
    const clicksTable = this.quoteIdentifier(this.clicksTable)
    const result = await this.pool.query(
      `INSERT INTO ${clicksTable} (
        click_id,
        affiliate_code,
        visitor_id,
        attribution_outcome,
        user_agent,
        referer,
        landing_path,
        occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
      RETURNING click_id, affiliate_code, visitor_id, attribution_outcome, user_agent, referer, landing_path, occurred_at, created_at`,
      [
        input.clickId,
        input.affiliateCode,
        input.visitorId,
        input.attributionOutcome,
        input.userAgent ?? null,
        input.referer ?? null,
        input.landingPath ?? null,
        input.occurredAtMs
      ]
    )
    return this.mapClick(result.rows[0])
  }

  async getEarliestClickForVisitor(affiliateCode: string, visitorId: string): Promise<AffiliateClick | null> {
    const clicksTable = this.quoteIdentifier(this.clicksTable)
    const result = await this.pool.query(
      `SELECT click_id, affiliate_code, visitor_id, attribution_outcome, user_agent, referer, landing_path, occurred_at, created_at
       FROM ${clicksTable}
       WHERE affiliate_code = $1
         AND visitor_id = $2
       ORDER BY occurred_at ASC, created_at ASC
       LIMIT 1`,
      [affiliateCode, visitorId]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapClick(result.rows[0])
  }

  async getAttribution(sessionId: string): Promise<AffiliateAttribution | null> {
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)
    const result = await this.pool.query(
      `SELECT
         session_id,
         affiliate_code,
         click_id,
         visitor_id,
         attribution_model,
         signup_at,
         checkout_started_at,
         stripe_checkout_session_id,
         subscription_created_at,
         stripe_subscription_id,
         first_payment_confirmed_at,
         first_paid_invoice_id,
         created_at,
         updated_at
       FROM ${attributionsTable}
       WHERE session_id = $1`,
      [sessionId]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapAttribution(result.rows[0])
  }

  async insertAttribution(input: {
    sessionId: string
    affiliateCode: string
    clickId: string
    visitorId: string
    attributionModel: 'first_click'
    signupAtMs: number
  }): Promise<AffiliateAttribution | null> {
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)
    const result = await this.pool.query(
      `INSERT INTO ${attributionsTable} (
        session_id,
        affiliate_code,
        click_id,
        visitor_id,
        attribution_model,
        signup_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), NOW(), NOW())
      ON CONFLICT (session_id) DO NOTHING
      RETURNING
        session_id,
        affiliate_code,
        click_id,
        visitor_id,
        attribution_model,
        signup_at,
        checkout_started_at,
        stripe_checkout_session_id,
        subscription_created_at,
        stripe_subscription_id,
        first_payment_confirmed_at,
        first_paid_invoice_id,
        created_at,
        updated_at`,
      [input.sessionId, input.affiliateCode, input.clickId, input.visitorId, input.attributionModel, input.signupAtMs]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapAttribution(result.rows[0])
  }

  async markCheckoutStarted(
    sessionId: string,
    input: { occurredAtMs: number; stripeCheckoutSessionId?: string | null }
  ): Promise<AffiliateAttribution | null> {
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)
    const result = await this.pool.query(
      `UPDATE ${attributionsTable}
       SET checkout_started_at = COALESCE(checkout_started_at, to_timestamp($2 / 1000.0)),
           stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $3),
           updated_at = NOW()
       WHERE session_id = $1
       RETURNING
         session_id,
         affiliate_code,
         click_id,
         visitor_id,
         attribution_model,
         signup_at,
         checkout_started_at,
         stripe_checkout_session_id,
         subscription_created_at,
         stripe_subscription_id,
         first_payment_confirmed_at,
         first_paid_invoice_id,
         created_at,
         updated_at`,
      [sessionId, input.occurredAtMs, input.stripeCheckoutSessionId ?? null]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapAttribution(result.rows[0])
  }

  async markSubscriptionCreated(
    sessionId: string,
    input: { occurredAtMs: number; stripeSubscriptionId?: string | null }
  ): Promise<AffiliateAttribution | null> {
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)
    const result = await this.pool.query(
      `UPDATE ${attributionsTable}
       SET subscription_created_at = COALESCE(subscription_created_at, to_timestamp($2 / 1000.0)),
           stripe_subscription_id = COALESCE(stripe_subscription_id, $3),
           updated_at = NOW()
       WHERE session_id = $1
       RETURNING
         session_id,
         affiliate_code,
         click_id,
         visitor_id,
         attribution_model,
         signup_at,
         checkout_started_at,
         stripe_checkout_session_id,
         subscription_created_at,
         stripe_subscription_id,
         first_payment_confirmed_at,
         first_paid_invoice_id,
         created_at,
         updated_at`,
      [sessionId, input.occurredAtMs, input.stripeSubscriptionId ?? null]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapAttribution(result.rows[0])
  }

  async markFirstPaymentConfirmed(
    sessionId: string,
    input: { occurredAtMs: number; invoiceId?: string | null }
  ): Promise<AffiliateAttribution | null> {
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)
    const result = await this.pool.query(
      `UPDATE ${attributionsTable}
       SET first_payment_confirmed_at = COALESCE(first_payment_confirmed_at, to_timestamp($2 / 1000.0)),
           first_paid_invoice_id = COALESCE(first_paid_invoice_id, $3),
           updated_at = NOW()
       WHERE session_id = $1
       RETURNING
         session_id,
         affiliate_code,
         click_id,
         visitor_id,
         attribution_model,
         signup_at,
         checkout_started_at,
         stripe_checkout_session_id,
         subscription_created_at,
         stripe_subscription_id,
         first_payment_confirmed_at,
         first_paid_invoice_id,
         created_at,
         updated_at`,
      [sessionId, input.occurredAtMs, input.invoiceId ?? null]
    )
    if ((result.rowCount ?? 0) <= 0) {
      return null
    }
    return this.mapAttribution(result.rows[0])
  }

  async getClickSummaryRows(fromMs: number, toMs: number): Promise<AffiliateClickSummaryRow[]> {
    const clicksTable = this.quoteIdentifier(this.clicksTable)
    const result = await this.pool.query(
      `SELECT affiliate_code, COUNT(*)::int AS clicks, COUNT(DISTINCT visitor_id)::int AS unique_visitors
       FROM ${clicksTable}
       WHERE occurred_at >= to_timestamp($1 / 1000.0)
         AND occurred_at <= to_timestamp($2 / 1000.0)
       GROUP BY affiliate_code`,
      [fromMs, toMs]
    )
    return result.rows.map((row) => ({
      affiliateCode: String(row.affiliate_code ?? ''),
      clicks: Number(row.clicks ?? 0),
      uniqueVisitors: Number(row.unique_visitors ?? 0)
    }))
  }

  async getSignupFunnelRows(fromMs: number, toMs: number): Promise<AffiliateSignupFunnelRow[]> {
    const attributionsTable = this.quoteIdentifier(this.attributionsTable)
    const result = await this.pool.query(
      `SELECT
         affiliate_code,
         COUNT(*)::int AS signups,
         COUNT(checkout_started_at)::int AS checkout_started,
         COUNT(subscription_created_at)::int AS subscriptions_created,
         COUNT(first_payment_confirmed_at)::int AS first_payments_confirmed
       FROM ${attributionsTable}
       WHERE signup_at >= to_timestamp($1 / 1000.0)
         AND signup_at <= to_timestamp($2 / 1000.0)
       GROUP BY affiliate_code`,
      [fromMs, toMs]
    )
    return result.rows.map((row) => ({
      affiliateCode: String(row.affiliate_code ?? ''),
      signups: Number(row.signups ?? 0),
      checkoutStarted: Number(row.checkout_started ?? 0),
      subscriptionsCreated: Number(row.subscriptions_created ?? 0),
      firstPaymentsConfirmed: Number(row.first_payments_confirmed ?? 0)
    }))
  }

  private mapLink(row: Record<string, unknown>): AffiliateLink {
    return {
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      status: (String(row.status ?? 'inactive') === 'active' ? 'active' : 'inactive') satisfies AffiliateLinkStatus,
      createdAt: this.parseTimestamp(row.created_at) ?? Date.now(),
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  private mapClick(row: Record<string, unknown>): AffiliateClick {
    return {
      clickId: String(row.click_id ?? ''),
      affiliateCode: String(row.affiliate_code ?? ''),
      visitorId: String(row.visitor_id ?? ''),
      attributionOutcome: this.parseClickOutcome(row.attribution_outcome),
      userAgent: row.user_agent ? String(row.user_agent) : null,
      referer: row.referer ? String(row.referer) : null,
      landingPath: row.landing_path ? String(row.landing_path) : null,
      occurredAt: this.parseTimestamp(row.occurred_at) ?? Date.now(),
      createdAt: this.parseTimestamp(row.created_at) ?? Date.now()
    }
  }

  private mapAttribution(row: Record<string, unknown>): AffiliateAttribution {
    return {
      sessionId: String(row.session_id ?? ''),
      affiliateCode: String(row.affiliate_code ?? ''),
      clickId: String(row.click_id ?? ''),
      visitorId: String(row.visitor_id ?? ''),
      attributionModel: String(row.attribution_model ?? 'first_click') === 'first_click' ? 'first_click' : 'first_click',
      signupAt: this.parseTimestamp(row.signup_at) ?? Date.now(),
      checkoutStartedAt: this.parseTimestamp(row.checkout_started_at),
      stripeCheckoutSessionId: row.stripe_checkout_session_id ? String(row.stripe_checkout_session_id) : null,
      subscriptionCreatedAt: this.parseTimestamp(row.subscription_created_at),
      stripeSubscriptionId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
      firstPaymentConfirmedAt: this.parseTimestamp(row.first_payment_confirmed_at),
      firstPaidInvoiceId: row.first_paid_invoice_id ? String(row.first_paid_invoice_id) : null,
      createdAt: this.parseTimestamp(row.created_at) ?? Date.now(),
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  private parseClickOutcome(value: unknown): AffiliateClickOutcome {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized === 'kept_existing_affiliate') {
      return 'kept_existing_affiliate'
    }
    if (normalized === 'repaired_missing_click') {
      return 'repaired_missing_click'
    }
    return 'locked_to_current'
  }

  private parseTimestamp(value: unknown): number | null {
    if (!value) {
      return null
    }
    if (value instanceof Date) {
      return value.getTime()
    }
    const parsed = Date.parse(String(value))
    return Number.isNaN(parsed) ? null : parsed
  }

  private quoteIdentifier(name: string) {
    const escaped = name.replace(/"/g, '""')
    return `"${escaped}"`
  }
}
