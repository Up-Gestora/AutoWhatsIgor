import type Stripe from 'stripe'

export type SubscriptionCreditsConfig = {
  monthlyPriceId: string
  annualPriceId?: string | null
  enterpriseAnnualPriceId?: string | null
  monthlyCreditsBrl: number
  annualCreditsBrl: number
  enterpriseAnnualCreditsBrl: number
}

export type ResolvedPlanCredits = {
  planName: 'pro_monthly' | 'pro_annual' | 'enterprise_annual'
  creditsBrl: number
  priceId: string
}

export function extractStripeId(value: unknown): string | null {
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    return normalizeString(value)
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return normalizeString((value as any).id)
  }
  return null
}

export function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function listInvoiceLines(invoice: Stripe.Invoice): any[] {
  return (((invoice as any).lines?.data as any[] | undefined) ?? []).filter(Boolean)
}

export function extractInvoiceLinePriceId(line: unknown): string | null {
  const directPriceId = extractStripeId((line as any)?.price)
  if (directPriceId) {
    return directPriceId
  }

  const legacyPlanId = extractStripeId((line as any)?.plan)
  if (legacyPlanId) {
    return legacyPlanId
  }

  // API versions like 2026-01-28.clover may expose line pricing under pricing.price_details.price.
  return extractStripeId((line as any)?.pricing?.price_details?.price)
}

export function extractInvoiceLineSubscriptionId(line: unknown): string | null {
  const directSubscriptionId = extractStripeId((line as any)?.subscription)
  if (directSubscriptionId) {
    return directSubscriptionId
  }

  return extractStripeId((line as any)?.parent?.subscription_item_details?.subscription)
}

export function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const invoiceSubscriptionId = extractStripeId((invoice as any).subscription)
  if (invoiceSubscriptionId) {
    return invoiceSubscriptionId
  }

  for (const line of listInvoiceLines(invoice)) {
    const lineSubscriptionId = extractInvoiceLineSubscriptionId(line)
    if (lineSubscriptionId) {
      return lineSubscriptionId
    }
  }

  return null
}

export function resolvePlanFromPriceId(
  priceId: string | null,
  config: SubscriptionCreditsConfig
): ResolvedPlanCredits | null {
  if (!priceId) {
    return null
  }

  const monthlyPriceId = config.monthlyPriceId.trim()
  const annualPriceId = config.annualPriceId?.trim() ?? ''
  const enterpriseAnnualPriceId = config.enterpriseAnnualPriceId?.trim() ?? ''

  if (monthlyPriceId && priceId === monthlyPriceId) {
    return {
      planName: 'pro_monthly',
      creditsBrl: config.monthlyCreditsBrl,
      priceId
    }
  }

  if (annualPriceId && priceId === annualPriceId) {
    return {
      planName: 'pro_annual',
      creditsBrl: config.annualCreditsBrl,
      priceId
    }
  }

  if (enterpriseAnnualPriceId && priceId === enterpriseAnnualPriceId) {
    return {
      planName: 'enterprise_annual',
      creditsBrl: config.enterpriseAnnualCreditsBrl,
      priceId
    }
  }

  return null
}

export function resolvePlanFromInvoiceLines(
  invoice: Stripe.Invoice,
  config: SubscriptionCreditsConfig
): ResolvedPlanCredits | null {
  const lines = listInvoiceLines(invoice)
  for (const line of lines) {
    if (Boolean((line as any)?.proration)) {
      continue
    }

    const lineType = normalizeString((line as any)?.type)
    if (lineType && lineType !== 'subscription') {
      continue
    }

    const priceId = extractInvoiceLinePriceId(line)
    const resolved = resolvePlanFromPriceId(priceId, config)
    if (resolved) {
      return resolved
    }
  }

  return null
}

export function listSubscriptionPriceIds(subscription: Stripe.Subscription): string[] {
  const items = subscription.items?.data ?? []
  const ids: string[] = []
  for (const item of items) {
    const priceId = extractStripeId((item as any).price)
    if (priceId) {
      ids.push(priceId)
    }
  }
  return ids
}

export function resolvePlanFromSubscription(
  subscription: Stripe.Subscription,
  config: SubscriptionCreditsConfig
): ResolvedPlanCredits | null {
  for (const priceId of listSubscriptionPriceIds(subscription)) {
    const resolved = resolvePlanFromPriceId(priceId, config)
    if (resolved) {
      return resolved
    }
  }
  return null
}
