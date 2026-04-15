import type { Pool } from 'pg'
import type { BillingCustomer, BillingOverview, BillingPaymentMethod, BillingSubscription } from './types'

type BillingStoreOptions = {
  pool: Pool
  customersTable?: string
  subscriptionsTable?: string
  paymentMethodsTable?: string
}

export class BillingStore {
  private readonly pool: Pool
  private readonly customersTable: string
  private readonly subscriptionsTable: string
  private readonly paymentMethodsTable: string

  constructor(options: BillingStoreOptions) {
    this.pool = options.pool
    this.customersTable = options.customersTable ?? 'billing_customers'
    this.subscriptionsTable = options.subscriptionsTable ?? 'billing_subscriptions'
    this.paymentMethodsTable = options.paymentMethodsTable ?? 'billing_payment_methods'
  }

  async init(): Promise<void> {
    const customersTable = this.quoteIdentifier(this.customersTable)
    const subscriptionsTable = this.quoteIdentifier(this.subscriptionsTable)
    const paymentMethodsTable = this.quoteIdentifier(this.paymentMethodsTable)

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${customersTable} (
        session_id TEXT PRIMARY KEY,
        stripe_customer_id TEXT NOT NULL UNIQUE,
        email TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${subscriptionsTable} (
        session_id TEXT PRIMARY KEY,
        stripe_subscription_id TEXT NULL UNIQUE,
        status TEXT NOT NULL,
        price_id TEXT NULL,
        current_period_end TIMESTAMPTZ NULL,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${paymentMethodsTable} (
        session_id TEXT PRIMARY KEY,
        stripe_payment_method_id TEXT NOT NULL UNIQUE,
        brand TEXT NULL,
        last4 TEXT NULL,
        exp_month INT NULL,
        exp_year INT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    )

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.customersTable}_updated_idx`)}
       ON ${customersTable} (updated_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.subscriptionsTable}_updated_idx`)}
       ON ${subscriptionsTable} (updated_at)`
    )
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.quoteIdentifier(`${this.paymentMethodsTable}_updated_idx`)}
       ON ${paymentMethodsTable} (updated_at)`
    )
  }

  async getOverview(sessionId: string): Promise<BillingOverview> {
    const [customer, subscription, paymentMethod] = await Promise.all([
      this.getCustomer(sessionId),
      this.getSubscription(sessionId),
      this.getPaymentMethod(sessionId)
    ])

    return {
      customer: customer
        ? { stripeCustomerId: customer.stripeCustomerId, email: customer.email, updatedAt: customer.updatedAt }
        : null,
      subscription: subscription
        ? {
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            status: subscription.status,
            priceId: subscription.priceId,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            updatedAt: subscription.updatedAt
          }
        : null,
      paymentMethod: paymentMethod
        ? {
            stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
            brand: paymentMethod.brand,
            last4: paymentMethod.last4,
            expMonth: paymentMethod.expMonth,
            expYear: paymentMethod.expYear,
            updatedAt: paymentMethod.updatedAt
          }
        : null
    }
  }

  async getCustomer(sessionId: string): Promise<BillingCustomer | null> {
    const customersTable = this.quoteIdentifier(this.customersTable)
    const result = await this.pool.query(
      `SELECT session_id, stripe_customer_id, email, updated_at
       FROM ${customersTable}
       WHERE session_id = $1`,
      [sessionId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      sessionId: String(row.session_id ?? ''),
      stripeCustomerId: String(row.stripe_customer_id ?? ''),
      email: row.email ? String(row.email) : null,
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  async getSessionIdByCustomerId(stripeCustomerId: string): Promise<string | null> {
    const customersTable = this.quoteIdentifier(this.customersTable)
    const result = await this.pool.query(
      `SELECT session_id
       FROM ${customersTable}
       WHERE stripe_customer_id = $1`,
      [stripeCustomerId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    return String(result.rows[0]?.session_id ?? '') || null
  }

  async upsertCustomer(sessionId: string, stripeCustomerId: string, email?: string | null): Promise<BillingCustomer> {
    const customersTable = this.quoteIdentifier(this.customersTable)
    const result = await this.pool.query(
      `INSERT INTO ${customersTable} (session_id, stripe_customer_id, email, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (session_id) DO UPDATE
       SET stripe_customer_id = EXCLUDED.stripe_customer_id,
           email = COALESCE(EXCLUDED.email, ${customersTable}.email),
           updated_at = NOW()
       RETURNING session_id, stripe_customer_id, email, updated_at`,
      [sessionId, stripeCustomerId, email ?? null]
    )

    const row = result.rows[0]
    return {
      sessionId: String(row.session_id ?? ''),
      stripeCustomerId: String(row.stripe_customer_id ?? ''),
      email: row.email ? String(row.email) : null,
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  async getSubscription(sessionId: string): Promise<BillingSubscription | null> {
    const subscriptionsTable = this.quoteIdentifier(this.subscriptionsTable)
    const result = await this.pool.query(
      `SELECT session_id, stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end, updated_at
       FROM ${subscriptionsTable}
       WHERE session_id = $1`,
      [sessionId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      sessionId: String(row.session_id ?? ''),
      stripeSubscriptionId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
      status: String(row.status ?? ''),
      priceId: row.price_id ? String(row.price_id) : null,
      currentPeriodEnd: this.parseTimestamp(row.current_period_end),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  async upsertSubscription(input: {
    sessionId: string
    stripeSubscriptionId: string | null
    status: string
    priceId: string | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
  }): Promise<BillingSubscription> {
    const subscriptionsTable = this.quoteIdentifier(this.subscriptionsTable)
    const result = await this.pool.query(
      `INSERT INTO ${subscriptionsTable} (
        session_id,
        stripe_subscription_id,
        status,
        price_id,
        current_period_end,
        cancel_at_period_end,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (session_id) DO UPDATE
       SET stripe_subscription_id = EXCLUDED.stripe_subscription_id,
           status = EXCLUDED.status,
           price_id = EXCLUDED.price_id,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           updated_at = NOW()
       RETURNING session_id, stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end, updated_at`,
      [
        input.sessionId,
        input.stripeSubscriptionId,
        input.status,
        input.priceId,
        input.currentPeriodEnd,
        input.cancelAtPeriodEnd
      ]
    )

    const row = result.rows[0]
    return {
      sessionId: String(row.session_id ?? ''),
      stripeSubscriptionId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
      status: String(row.status ?? ''),
      priceId: row.price_id ? String(row.price_id) : null,
      currentPeriodEnd: this.parseTimestamp(row.current_period_end),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  async deleteSubscription(sessionId: string): Promise<void> {
    const subscriptionsTable = this.quoteIdentifier(this.subscriptionsTable)
    await this.pool.query(`DELETE FROM ${subscriptionsTable} WHERE session_id = $1`, [sessionId])
  }

  async getPaymentMethod(sessionId: string): Promise<BillingPaymentMethod | null> {
    const paymentMethodsTable = this.quoteIdentifier(this.paymentMethodsTable)
    const result = await this.pool.query(
      `SELECT session_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, updated_at
       FROM ${paymentMethodsTable}
       WHERE session_id = $1`,
      [sessionId]
    )

    if ((result.rowCount ?? 0) === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      sessionId: String(row.session_id ?? ''),
      stripePaymentMethodId: String(row.stripe_payment_method_id ?? ''),
      brand: row.brand ? String(row.brand) : null,
      last4: row.last4 ? String(row.last4) : null,
      expMonth: typeof row.exp_month === 'number' ? row.exp_month : row.exp_month ? Number(row.exp_month) : null,
      expYear: typeof row.exp_year === 'number' ? row.exp_year : row.exp_year ? Number(row.exp_year) : null,
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  async upsertPaymentMethod(input: {
    sessionId: string
    stripePaymentMethodId: string
    brand: string | null
    last4: string | null
    expMonth: number | null
    expYear: number | null
  }): Promise<BillingPaymentMethod> {
    const paymentMethodsTable = this.quoteIdentifier(this.paymentMethodsTable)
    const result = await this.pool.query(
      `INSERT INTO ${paymentMethodsTable} (
        session_id,
        stripe_payment_method_id,
        brand,
        last4,
        exp_month,
        exp_year,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (session_id) DO UPDATE
       SET stripe_payment_method_id = EXCLUDED.stripe_payment_method_id,
           brand = EXCLUDED.brand,
           last4 = EXCLUDED.last4,
           exp_month = EXCLUDED.exp_month,
           exp_year = EXCLUDED.exp_year,
           updated_at = NOW()
       RETURNING session_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, updated_at`,
      [input.sessionId, input.stripePaymentMethodId, input.brand, input.last4, input.expMonth, input.expYear]
    )

    const row = result.rows[0]
    return {
      sessionId: String(row.session_id ?? ''),
      stripePaymentMethodId: String(row.stripe_payment_method_id ?? ''),
      brand: row.brand ? String(row.brand) : null,
      last4: row.last4 ? String(row.last4) : null,
      expMonth: typeof row.exp_month === 'number' ? row.exp_month : row.exp_month ? Number(row.exp_month) : null,
      expYear: typeof row.exp_year === 'number' ? row.exp_year : row.exp_year ? Number(row.exp_year) : null,
      updatedAt: this.parseTimestamp(row.updated_at) ?? Date.now()
    }
  }

  async deletePaymentMethod(sessionId: string): Promise<void> {
    const paymentMethodsTable = this.quoteIdentifier(this.paymentMethodsTable)
    await this.pool.query(`DELETE FROM ${paymentMethodsTable} WHERE session_id = $1`, [sessionId])
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

