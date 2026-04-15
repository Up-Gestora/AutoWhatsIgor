export type BillingCustomer = {
  sessionId: string
  stripeCustomerId: string
  email: string | null
  updatedAt: number
}

export type BillingSubscription = {
  sessionId: string
  stripeSubscriptionId: string | null
  status: string
  priceId: string | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  updatedAt: number
}

export type BillingPaymentMethod = {
  sessionId: string
  stripePaymentMethodId: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  updatedAt: number
}

export type BillingOverview = {
  customer: Pick<BillingCustomer, 'stripeCustomerId' | 'email' | 'updatedAt'> | null
  subscription: Pick<
    BillingSubscription,
    'stripeSubscriptionId' | 'status' | 'priceId' | 'currentPeriodEnd' | 'cancelAtPeriodEnd' | 'updatedAt'
  > | null
  paymentMethod: Pick<
    BillingPaymentMethod,
    'stripePaymentMethodId' | 'brand' | 'last4' | 'expMonth' | 'expYear' | 'updatedAt'
  > | null
}

export type BillingPlanPricing = {
  enabled: boolean
  priceActive: boolean | null
  unitAmountCents: number | null
  currency: string | null
  interval: 'month' | 'year' | null
}

export type BillingPlansCatalog = {
  pro_monthly: BillingPlanPricing
  pro_annual: BillingPlanPricing
  enterprise_annual: BillingPlanPricing
}

