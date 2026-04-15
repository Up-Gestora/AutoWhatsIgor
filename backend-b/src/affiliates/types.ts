export type AffiliateLinkStatus = 'active' | 'inactive'

export type AffiliateLink = {
  code: string
  name: string
  status: AffiliateLinkStatus
  createdAt: number
  updatedAt: number
}

export type AffiliateClickOutcome = 'locked_to_current' | 'kept_existing_affiliate' | 'repaired_missing_click'

export type AffiliateClick = {
  clickId: string
  affiliateCode: string
  visitorId: string
  attributionOutcome: AffiliateClickOutcome
  userAgent: string | null
  referer: string | null
  landingPath: string | null
  occurredAt: number
  createdAt: number
}

export type AffiliateAttributionModel = 'first_click'

export type AffiliateAttribution = {
  sessionId: string
  affiliateCode: string
  clickId: string
  visitorId: string
  attributionModel: AffiliateAttributionModel
  signupAt: number
  checkoutStartedAt: number | null
  stripeCheckoutSessionId: string | null
  subscriptionCreatedAt: number | null
  stripeSubscriptionId: string | null
  firstPaymentConfirmedAt: number | null
  firstPaidInvoiceId: string | null
  createdAt: number
  updatedAt: number
}

export type RegisterAffiliateClickInput = {
  affiliateCode: string
  visitorId: string
  lockedAffiliateCode?: string | null
  lockedClickId?: string | null
  userAgent?: string | null
  referer?: string | null
  landingPath?: string | null
}

export type RegisterAffiliateClickResult = {
  click: AffiliateClick
  effectiveAffiliateCode: string | null
  effectiveClickId: string | null
}

export type ClaimAffiliateAttributionInput = {
  sessionId: string
  affiliateCode?: string | null
  clickId?: string | null
  visitorId?: string | null
  signupAtMs?: number | null
}

export type ClaimAffiliateAttributionResult = {
  claimed: boolean
  attribution: AffiliateAttribution | null
}

export type AffiliateCheckoutMarkInput = {
  occurredAtMs?: number | null
  stripeCheckoutSessionId?: string | null
}

export type AffiliateSubscriptionMarkInput = {
  occurredAtMs?: number | null
  stripeSubscriptionId?: string | null
}

export type AffiliatePaymentMarkInput = {
  occurredAtMs?: number | null
  invoiceId?: string | null
}

export type AffiliateClickSummaryRow = {
  affiliateCode: string
  clicks: number
  uniqueVisitors: number
}

export type AffiliateSignupFunnelRow = {
  affiliateCode: string
  signups: number
  checkoutStarted: number
  subscriptionsCreated: number
  firstPaymentsConfirmed: number
}

export type AffiliateFunnelRow = {
  affiliateCode: string
  affiliateName: string
  status: AffiliateLinkStatus
  sharePath: string
  clicks: number
  uniqueVisitors: number
  signups: number
  checkoutStarted: number
  subscriptionsCreated: number
  firstPaymentsConfirmed: number
}

export type AffiliateFunnelSummary = {
  clicks: number
  uniqueVisitors: number
  signups: number
  checkoutStarted: number
  subscriptionsCreated: number
  firstPaymentsConfirmed: number
}
