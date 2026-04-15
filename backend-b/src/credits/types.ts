export type CreditBalance = {
  sessionId: string
  balanceBrl: number
  blockedAt: number | null
  blockedReason: string | null
  updatedAt: number
}

export type CreditUsageCostSummary = {
  costBrl: number
  events: number
}

export type CreditUsageSeriesEntry = {
  day: string
  costBrl: number
  events: number
}

export type CreditChangeSource =
  | 'admin_set'
  | 'admin_adjust'
  | 'ai_usage'
  | 'stripe_topup'
  | 'stripe_subscription'
  | 'signup_bonus'

export type CreditUpdateMode = 'set' | 'adjust'

export type CreditChangeMeta = {
  source: CreditChangeSource
  actorId?: string | null
  reason?: string | null
  referenceId?: string | null
}
