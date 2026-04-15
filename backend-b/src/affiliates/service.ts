import crypto from 'crypto'
import { AffiliateStore } from './store'
import type {
  AffiliateAttribution,
  AffiliateCheckoutMarkInput,
  AffiliateFunnelRow,
  AffiliateFunnelSummary,
  AffiliateLink,
  AffiliatePaymentMarkInput,
  AffiliateSubscriptionMarkInput,
  ClaimAffiliateAttributionInput,
  ClaimAffiliateAttributionResult,
  RegisterAffiliateClickInput,
  RegisterAffiliateClickResult
} from './types'

type AffiliateServiceOptions = {
  store: AffiliateStore
}

const AFFILIATE_CODE_REGEX = /^[a-z0-9](?:[a-z0-9_-]{1,62})$/

export class AffiliateService {
  private readonly store: AffiliateStore

  constructor(options: AffiliateServiceOptions) {
    this.store = options.store
  }

  async listLinks(): Promise<AffiliateLink[]> {
    return this.store.listLinks()
  }

  async saveLink(input: { code: string; name: string; status?: string | null }): Promise<AffiliateLink> {
    const code = normalizeAffiliateCode(input.code)
    const name = normalizeAffiliateName(input.name)
    const status = input.status === 'inactive' ? 'inactive' : 'active'
    return this.store.upsertLink({ code, name, status })
  }

  async registerClick(input: RegisterAffiliateClickInput): Promise<RegisterAffiliateClickResult> {
    const affiliateCode = normalizeAffiliateCode(input.affiliateCode)
    const visitorId = normalizeVisitorId(input.visitorId)
    const lockedAffiliateCode = normalizeOptionalCode(input.lockedAffiliateCode)
    const lockedClickId = normalizeOptionalId(input.lockedClickId)
    const link = await this.store.getLink(affiliateCode)
    if (!link || link.status !== 'active') {
      throw new Error('affiliate_not_found')
    }

    const effectiveAffiliateCode = lockedAffiliateCode ?? affiliateCode
    const outcome =
      !lockedAffiliateCode
        ? 'locked_to_current'
        : lockedAffiliateCode === affiliateCode
          ? lockedClickId
            ? 'kept_existing_affiliate'
            : 'repaired_missing_click'
          : 'kept_existing_affiliate'

    const click = await this.store.insertClick({
      clickId: crypto.randomUUID(),
      affiliateCode,
      visitorId,
      attributionOutcome: outcome,
      userAgent: normalizeOptionalText(input.userAgent),
      referer: normalizeOptionalText(input.referer),
      landingPath: normalizeOptionalText(input.landingPath),
      occurredAtMs: Date.now()
    })

    return {
      click,
      effectiveAffiliateCode,
      effectiveClickId:
        lockedAffiliateCode && lockedAffiliateCode !== affiliateCode
          ? lockedClickId
          : lockedClickId ?? click.clickId
    }
  }

  async claimAttribution(input: ClaimAffiliateAttributionInput): Promise<ClaimAffiliateAttributionResult> {
    const sessionId = normalizeSessionId(input.sessionId)
    const affiliateCode = normalizeOptionalCode(input.affiliateCode)
    const visitorId = normalizeOptionalId(input.visitorId)
    const signupAtMs = normalizeTimestamp(input.signupAtMs) ?? Date.now()
    if (!affiliateCode || !visitorId) {
      return { claimed: false, attribution: null }
    }

    const existing = await this.store.getAttribution(sessionId)
    if (existing) {
      return { claimed: false, attribution: existing }
    }

    const clickId = await this.resolveClaimClickId(affiliateCode, visitorId, input.clickId)
    if (!clickId) {
      return { claimed: false, attribution: null }
    }

    const created = await this.store.insertAttribution({
      sessionId,
      affiliateCode,
      clickId,
      visitorId,
      attributionModel: 'first_click',
      signupAtMs
    })

    if (created) {
      return { claimed: true, attribution: created }
    }

    const loaded = await this.store.getAttribution(sessionId)
    return { claimed: false, attribution: loaded }
  }

  async getAttributionBySessionId(sessionId: string): Promise<AffiliateAttribution | null> {
    const safeSessionId = normalizeSessionId(sessionId)
    return this.store.getAttribution(safeSessionId)
  }

  async markCheckoutStarted(sessionId: string, input: AffiliateCheckoutMarkInput = {}): Promise<AffiliateAttribution | null> {
    const safeSessionId = normalizeSessionId(sessionId)
    return this.store.markCheckoutStarted(safeSessionId, {
      occurredAtMs: normalizeTimestamp(input.occurredAtMs) ?? Date.now(),
      stripeCheckoutSessionId: normalizeOptionalId(input.stripeCheckoutSessionId)
    })
  }

  async markSubscriptionCreated(
    sessionId: string,
    input: AffiliateSubscriptionMarkInput = {}
  ): Promise<AffiliateAttribution | null> {
    const safeSessionId = normalizeSessionId(sessionId)
    return this.store.markSubscriptionCreated(safeSessionId, {
      occurredAtMs: normalizeTimestamp(input.occurredAtMs) ?? Date.now(),
      stripeSubscriptionId: normalizeOptionalId(input.stripeSubscriptionId)
    })
  }

  async markFirstPaymentConfirmed(
    sessionId: string,
    input: AffiliatePaymentMarkInput = {}
  ): Promise<AffiliateAttribution | null> {
    const safeSessionId = normalizeSessionId(sessionId)
    return this.store.markFirstPaymentConfirmed(safeSessionId, {
      occurredAtMs: normalizeTimestamp(input.occurredAtMs) ?? Date.now(),
      invoiceId: normalizeOptionalId(input.invoiceId)
    })
  }

  async getFunnel(fromMs: number, toMs: number): Promise<{ summary: AffiliateFunnelSummary; rows: AffiliateFunnelRow[] }> {
    const startMs = Math.min(normalizeTimestamp(fromMs) ?? Date.now(), normalizeTimestamp(toMs) ?? Date.now())
    const endMs = Math.max(normalizeTimestamp(fromMs) ?? Date.now(), normalizeTimestamp(toMs) ?? Date.now())
    const [links, clickRows, funnelRows] = await Promise.all([
      this.store.listLinks(),
      this.store.getClickSummaryRows(startMs, endMs),
      this.store.getSignupFunnelRows(startMs, endMs)
    ])

    const clickMap = new Map(clickRows.map((row) => [row.affiliateCode, row]))
    const funnelMap = new Map(funnelRows.map((row) => [row.affiliateCode, row]))

    const rows = links.map((link) => {
      const clicks = clickMap.get(link.code)
      const funnel = funnelMap.get(link.code)
      return {
        affiliateCode: link.code,
        affiliateName: link.name,
        status: link.status,
        sharePath: `/a/${encodeURIComponent(link.code)}`,
        clicks: clicks?.clicks ?? 0,
        uniqueVisitors: clicks?.uniqueVisitors ?? 0,
        signups: funnel?.signups ?? 0,
        checkoutStarted: funnel?.checkoutStarted ?? 0,
        subscriptionsCreated: funnel?.subscriptionsCreated ?? 0,
        firstPaymentsConfirmed: funnel?.firstPaymentsConfirmed ?? 0
      } satisfies AffiliateFunnelRow
    })

    const summary = rows.reduce<AffiliateFunnelSummary>(
      (acc, row) => {
        acc.clicks += row.clicks
        acc.uniqueVisitors += row.uniqueVisitors
        acc.signups += row.signups
        acc.checkoutStarted += row.checkoutStarted
        acc.subscriptionsCreated += row.subscriptionsCreated
        acc.firstPaymentsConfirmed += row.firstPaymentsConfirmed
        return acc
      },
      {
        clicks: 0,
        uniqueVisitors: 0,
        signups: 0,
        checkoutStarted: 0,
        subscriptionsCreated: 0,
        firstPaymentsConfirmed: 0
      }
    )

    return { summary, rows }
  }

  private async resolveClaimClickId(
    affiliateCode: string,
    visitorId: string,
    clickId: string | null | undefined
  ): Promise<string | null> {
    const normalizedClickId = normalizeOptionalId(clickId)
    if (normalizedClickId) {
      return normalizedClickId
    }

    const earliestClick = await this.store.getEarliestClickForVisitor(affiliateCode, visitorId)
    return earliestClick?.clickId ?? null
  }
}

function normalizeAffiliateCode(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!AFFILIATE_CODE_REGEX.test(normalized)) {
    throw new Error('affiliate_code_invalid')
  }
  return normalized
}

function normalizeAffiliateName(value: string): string {
  const normalized = value.trim()
  if (normalized.length < 2 || normalized.length > 120) {
    throw new Error('affiliate_name_invalid')
  }
  return normalized
}

function normalizeSessionId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('sessionId_required')
  }
  return normalized
}

function normalizeVisitorId(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 120) {
    throw new Error('visitor_id_invalid')
  }
  return normalized
}

function normalizeOptionalCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return AFFILIATE_CODE_REGEX.test(normalized) ? normalized : null
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > 200) {
    return null
  }
  return normalized
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized ? normalized.slice(0, 1000) : null
}

function normalizeTimestamp(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}
