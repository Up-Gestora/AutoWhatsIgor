import assert from 'node:assert/strict'
import test from 'node:test'
import { AffiliateService } from '../src/affiliates'
import type {
  AffiliateAttribution,
  AffiliateClick,
  AffiliateClickSummaryRow,
  AffiliateFunnelRow,
  AffiliateFunnelSummary,
  AffiliateLink,
  AffiliateSignupFunnelRow
} from '../src/affiliates'

class FakeAffiliateStore {
  links = new Map<string, AffiliateLink>()
  clicks: AffiliateClick[] = []
  attributions = new Map<string, AffiliateAttribution>()

  async listLinks(): Promise<AffiliateLink[]> {
    return Array.from(this.links.values()).sort((a, b) => a.code.localeCompare(b.code))
  }

  async getLink(code: string): Promise<AffiliateLink | null> {
    return this.links.get(code) ?? null
  }

  async upsertLink(input: { code: string; name: string; status: 'active' | 'inactive' }): Promise<AffiliateLink> {
    const existing = this.links.get(input.code)
    const now = Date.now()
    const link: AffiliateLink = {
      code: input.code,
      name: input.name,
      status: input.status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    this.links.set(input.code, link)
    return link
  }

  async insertClick(input: {
    clickId: string
    affiliateCode: string
    visitorId: string
    attributionOutcome: AffiliateClick['attributionOutcome']
    userAgent?: string | null
    referer?: string | null
    landingPath?: string | null
    occurredAtMs: number
  }): Promise<AffiliateClick> {
    const click: AffiliateClick = {
      clickId: input.clickId,
      affiliateCode: input.affiliateCode,
      visitorId: input.visitorId,
      attributionOutcome: input.attributionOutcome,
      userAgent: input.userAgent ?? null,
      referer: input.referer ?? null,
      landingPath: input.landingPath ?? null,
      occurredAt: input.occurredAtMs,
      createdAt: input.occurredAtMs
    }
    this.clicks.push(click)
    return click
  }

  async getEarliestClickForVisitor(affiliateCode: string, visitorId: string): Promise<AffiliateClick | null> {
    return (
      this.clicks
        .filter((click) => click.affiliateCode === affiliateCode && click.visitorId === visitorId)
        .sort((a, b) => a.occurredAt - b.occurredAt)[0] ?? null
    )
  }

  async getAttribution(sessionId: string): Promise<AffiliateAttribution | null> {
    return this.attributions.get(sessionId) ?? null
  }

  async insertAttribution(input: {
    sessionId: string
    affiliateCode: string
    clickId: string
    visitorId: string
    attributionModel: 'first_click'
    signupAtMs: number
  }): Promise<AffiliateAttribution | null> {
    if (this.attributions.has(input.sessionId)) {
      return null
    }

    const attribution: AffiliateAttribution = {
      sessionId: input.sessionId,
      affiliateCode: input.affiliateCode,
      clickId: input.clickId,
      visitorId: input.visitorId,
      attributionModel: input.attributionModel,
      signupAt: input.signupAtMs,
      checkoutStartedAt: null,
      stripeCheckoutSessionId: null,
      subscriptionCreatedAt: null,
      stripeSubscriptionId: null,
      firstPaymentConfirmedAt: null,
      firstPaidInvoiceId: null,
      createdAt: input.signupAtMs,
      updatedAt: input.signupAtMs
    }
    this.attributions.set(input.sessionId, attribution)
    return attribution
  }

  async markCheckoutStarted(
    sessionId: string,
    input: { occurredAtMs: number; stripeCheckoutSessionId?: string | null }
  ): Promise<AffiliateAttribution | null> {
    const current = this.attributions.get(sessionId)
    if (!current) {
      return null
    }
    const next: AffiliateAttribution = {
      ...current,
      checkoutStartedAt: current.checkoutStartedAt ?? input.occurredAtMs,
      stripeCheckoutSessionId: current.stripeCheckoutSessionId ?? input.stripeCheckoutSessionId ?? null,
      updatedAt: input.occurredAtMs
    }
    this.attributions.set(sessionId, next)
    return next
  }

  async markSubscriptionCreated(
    sessionId: string,
    input: { occurredAtMs: number; stripeSubscriptionId?: string | null }
  ): Promise<AffiliateAttribution | null> {
    const current = this.attributions.get(sessionId)
    if (!current) {
      return null
    }
    const next: AffiliateAttribution = {
      ...current,
      subscriptionCreatedAt: current.subscriptionCreatedAt ?? input.occurredAtMs,
      stripeSubscriptionId: current.stripeSubscriptionId ?? input.stripeSubscriptionId ?? null,
      updatedAt: input.occurredAtMs
    }
    this.attributions.set(sessionId, next)
    return next
  }

  async markFirstPaymentConfirmed(
    sessionId: string,
    input: { occurredAtMs: number; invoiceId?: string | null }
  ): Promise<AffiliateAttribution | null> {
    const current = this.attributions.get(sessionId)
    if (!current) {
      return null
    }
    const next: AffiliateAttribution = {
      ...current,
      firstPaymentConfirmedAt: current.firstPaymentConfirmedAt ?? input.occurredAtMs,
      firstPaidInvoiceId: current.firstPaidInvoiceId ?? input.invoiceId ?? null,
      updatedAt: input.occurredAtMs
    }
    this.attributions.set(sessionId, next)
    return next
  }

  async getClickSummaryRows(fromMs: number, toMs: number): Promise<AffiliateClickSummaryRow[]> {
    const grouped = new Map<string, { clicks: number; visitors: Set<string> }>()
    for (const click of this.clicks) {
      if (click.occurredAt < fromMs || click.occurredAt > toMs) {
        continue
      }
      const entry = grouped.get(click.affiliateCode) ?? { clicks: 0, visitors: new Set<string>() }
      entry.clicks += 1
      entry.visitors.add(click.visitorId)
      grouped.set(click.affiliateCode, entry)
    }
    return Array.from(grouped.entries()).map(([affiliateCode, value]) => ({
      affiliateCode,
      clicks: value.clicks,
      uniqueVisitors: value.visitors.size
    }))
  }

  async getSignupFunnelRows(fromMs: number, toMs: number): Promise<AffiliateSignupFunnelRow[]> {
    const grouped = new Map<string, AffiliateSignupFunnelRow>()
    for (const attribution of this.attributions.values()) {
      if (attribution.signupAt < fromMs || attribution.signupAt > toMs) {
        continue
      }
      const entry =
        grouped.get(attribution.affiliateCode) ?? {
          affiliateCode: attribution.affiliateCode,
          signups: 0,
          checkoutStarted: 0,
          subscriptionsCreated: 0,
          firstPaymentsConfirmed: 0
        }
      entry.signups += 1
      if (attribution.checkoutStartedAt) {
        entry.checkoutStarted += 1
      }
      if (attribution.subscriptionCreatedAt) {
        entry.subscriptionsCreated += 1
      }
      if (attribution.firstPaymentConfirmedAt) {
        entry.firstPaymentsConfirmed += 1
      }
      grouped.set(attribution.affiliateCode, entry)
    }
    return Array.from(grouped.values())
  }
}

test('AffiliateService locks attribution to the first affiliate click', async () => {
  const store = new FakeAffiliateStore()
  const service = new AffiliateService({ store: store as any })

  await store.upsertLink({ code: 'alpha', name: 'Alpha', status: 'active' })
  await store.upsertLink({ code: 'beta', name: 'Beta', status: 'active' })

  const first = await service.registerClick({
    affiliateCode: 'alpha',
    visitorId: 'visitor-1'
  })

  const second = await service.registerClick({
    affiliateCode: 'beta',
    visitorId: 'visitor-1',
    lockedAffiliateCode: 'alpha',
    lockedClickId: first.click.clickId
  })

  assert.equal(first.click.attributionOutcome, 'locked_to_current')
  assert.equal(first.effectiveAffiliateCode, 'alpha')
  assert.equal(first.effectiveClickId, first.click.clickId)

  assert.equal(second.click.affiliateCode, 'beta')
  assert.equal(second.click.attributionOutcome, 'kept_existing_affiliate')
  assert.equal(second.effectiveAffiliateCode, 'alpha')
  assert.equal(second.effectiveClickId, first.click.clickId)
})

test('AffiliateService claims attribution with earliest click when clickId is absent', async () => {
  const store = new FakeAffiliateStore()
  const service = new AffiliateService({ store: store as any })

  await store.upsertLink({ code: 'alpha', name: 'Alpha', status: 'active' })

  const first = await service.registerClick({
    affiliateCode: 'alpha',
    visitorId: 'visitor-2'
  })

  await service.registerClick({
    affiliateCode: 'alpha',
    visitorId: 'visitor-2',
    lockedAffiliateCode: 'alpha'
  })

  const created = await service.claimAttribution({
    sessionId: 'session-1',
    affiliateCode: 'alpha',
    visitorId: 'visitor-2',
    signupAtMs: 1_760_000_000_000
  })

  assert.equal(created.claimed, true)
  assert.equal(created.attribution?.clickId, first.click.clickId)
  assert.equal(created.attribution?.affiliateCode, 'alpha')

  const repeated = await service.claimAttribution({
    sessionId: 'session-1',
    affiliateCode: 'alpha',
    visitorId: 'visitor-2',
    signupAtMs: 1_760_000_100_000
  })

  assert.equal(repeated.claimed, false)
  assert.equal(repeated.attribution?.clickId, first.click.clickId)
})

test('AffiliateService aggregates click and signup funnel metrics per affiliate', async () => {
  const store = new FakeAffiliateStore()
  const service = new AffiliateService({ store: store as any })

  await store.upsertLink({ code: 'alpha', name: 'Alpha', status: 'active' })
  await store.upsertLink({ code: 'beta', name: 'Beta', status: 'active' })

  const alphaClickOne = await service.registerClick({
    affiliateCode: 'alpha',
    visitorId: 'visitor-a'
  })
  await service.registerClick({
    affiliateCode: 'alpha',
    visitorId: 'visitor-b'
  })
  const betaClick = await service.registerClick({
    affiliateCode: 'beta',
    visitorId: 'visitor-c'
  })

  await service.claimAttribution({
    sessionId: 'session-alpha',
    affiliateCode: 'alpha',
    clickId: alphaClickOne.click.clickId,
    visitorId: 'visitor-a',
    signupAtMs: 1_760_000_000_000
  })
  await service.markCheckoutStarted('session-alpha', {
    occurredAtMs: 1_760_000_010_000,
    stripeCheckoutSessionId: 'cs_alpha'
  })
  await service.markSubscriptionCreated('session-alpha', {
    occurredAtMs: 1_760_000_020_000,
    stripeSubscriptionId: 'sub_alpha'
  })
  await service.markFirstPaymentConfirmed('session-alpha', {
    occurredAtMs: 1_760_000_030_000,
    invoiceId: 'in_alpha'
  })

  await service.claimAttribution({
    sessionId: 'session-beta',
    affiliateCode: 'beta',
    clickId: betaClick.click.clickId,
    visitorId: 'visitor-c',
    signupAtMs: 1_760_000_000_000
  })

  await store.upsertLink({ code: 'beta', name: 'Beta', status: 'inactive' })

  const report = await service.getFunnel(1_759_999_000_000, 1_760_001_000_000)
  const summary: AffiliateFunnelSummary = report.summary
  const alphaRow = report.rows.find((row) => row.affiliateCode === 'alpha') as AffiliateFunnelRow | undefined
  const betaRow = report.rows.find((row) => row.affiliateCode === 'beta') as AffiliateFunnelRow | undefined

  assert.deepEqual(summary, {
    clicks: 3,
    uniqueVisitors: 3,
    signups: 2,
    checkoutStarted: 1,
    subscriptionsCreated: 1,
    firstPaymentsConfirmed: 1
  })

  assert.deepEqual(alphaRow, {
    affiliateCode: 'alpha',
    affiliateName: 'Alpha',
    status: 'active',
    sharePath: '/a/alpha',
    clicks: 2,
    uniqueVisitors: 2,
    signups: 1,
    checkoutStarted: 1,
    subscriptionsCreated: 1,
    firstPaymentsConfirmed: 1
  })

  assert.deepEqual(betaRow, {
    affiliateCode: 'beta',
    affiliateName: 'Beta',
    status: 'inactive',
    sharePath: '/a/beta',
    clicks: 1,
    uniqueVisitors: 1,
    signups: 1,
    checkoutStarted: 0,
    subscriptionsCreated: 0,
    firstPaymentsConfirmed: 0
  })
})
