import type { CreditBalance, CreditChangeMeta, CreditUsageCostSummary, CreditUsageSeriesEntry } from './types'
import { CreditsStore } from './store'

type CreditsServiceOptions = {
  store: CreditsStore
}

type CreditUpdateMeta = Omit<CreditChangeMeta, 'source'>

export class CreditsService {
  private readonly store: CreditsStore

  constructor(options: CreditsServiceOptions) {
    this.store = options.store
  }

  async ensure(sessionId: string): Promise<void> {
    await this.store.ensure(sessionId)
  }

  async get(sessionId: string): Promise<CreditBalance> {
    await this.store.ensure(sessionId)
    const current = await this.store.get(sessionId)
    return (
      current ?? {
        sessionId,
        balanceBrl: 0,
        blockedAt: null,
        blockedReason: null,
        updatedAt: Date.now()
      }
    )
  }

  async getBatch(sessionIds: string[]): Promise<Record<string, CreditBalance>> {
    const trimmed = sessionIds.map((id) => id.trim()).filter(Boolean)
    const entries = await this.store.getBatch(trimmed)
    const result: Record<string, CreditBalance> = {}
    for (const sessionId of trimmed) {
      result[sessionId] =
        entries[sessionId] ?? {
          sessionId,
          balanceBrl: 0,
          blockedAt: null,
          blockedReason: null,
          updatedAt: 0
        }
    }
    return result
  }

  async getUsageCostByReason(
    sessionId: string,
    fromMs: number,
    toMs: number,
    reason: string
  ): Promise<CreditUsageCostSummary> {
    return this.store.getUsageCostByReason(sessionId, fromMs, toMs, reason)
  }

  async getUsageDailySeriesByReason(
    sessionId: string,
    fromMs: number,
    toMs: number,
    reason: string,
    timezone = 'America/Sao_Paulo'
  ): Promise<CreditUsageSeriesEntry[]> {
    return this.store.getUsageDailySeriesByReason(sessionId, fromMs, toMs, reason, timezone)
  }

  async canUse(sessionId: string): Promise<boolean> {
    await this.store.ensure(sessionId)
    const current = await this.store.get(sessionId)
    const balance = current?.balanceBrl ?? 0
    if (balance <= 0) {
      await this.store.markBlocked(sessionId, 'no_credits')
      return false
    }
    return true
  }

  async setBalance(sessionId: string, amountBrl: number, meta: CreditUpdateMeta = {}): Promise<CreditBalance> {
    return this.store.setBalance(sessionId, amountBrl, { source: 'admin_set', ...meta })
  }

  async adjustBalance(sessionId: string, amountBrl: number, meta: CreditUpdateMeta = {}): Promise<CreditBalance> {
    return this.store.adjustBalance(sessionId, amountBrl, { source: 'admin_adjust', ...meta })
  }

  async consume(sessionId: string, amountBrl: number, meta: CreditUpdateMeta = {}): Promise<CreditBalance> {
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      return this.get(sessionId)
    }
    return this.store.consumeCost(sessionId, amountBrl, { source: 'ai_usage', ...meta })
  }

  async topUp(sessionId: string, amountBrl: number, meta: CreditUpdateMeta = {}): Promise<CreditBalance> {
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      return this.get(sessionId)
    }

    return this.store.adjustBalance(sessionId, amountBrl, { source: 'stripe_topup', ...meta })
  }

  async grantSubscriptionCredits(
    sessionId: string,
    amountBrl: number,
    meta: CreditUpdateMeta = {}
  ): Promise<{ granted: boolean; credits: CreditBalance }> {
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      return { granted: false, credits: await this.get(sessionId) }
    }

    try {
      const credits = await this.store.adjustBalance(sessionId, amountBrl, {
        source: 'stripe_subscription',
        actorId: meta.actorId ?? 'stripe',
        reason: meta.reason ?? 'subscription_credits',
        referenceId: meta.referenceId ?? null
      })
      return { granted: true, credits }
    } catch (error: any) {
      const code = error?.code ?? error?.cause?.code
      if (code === '23505') {
        // Unique index indicates the subscription credits were already granted (idempotency).
        return { granted: false, credits: await this.get(sessionId) }
      }
      throw error
    }
  }

  async grantSignupBonus(
    sessionId: string,
    amountBrl: number,
    meta: CreditUpdateMeta = {}
  ): Promise<{ granted: boolean; credits: CreditBalance }> {
    if (!Number.isFinite(amountBrl) || amountBrl <= 0) {
      return { granted: false, credits: await this.get(sessionId) }
    }

    try {
      const credits = await this.store.adjustBalance(sessionId, amountBrl, {
        source: 'signup_bonus',
        actorId: meta.actorId ?? 'system',
        reason: meta.reason ?? 'new_account_credits',
        referenceId: meta.referenceId ?? null
      })
      return { granted: true, credits }
    } catch (error: any) {
      const code = error?.code ?? error?.cause?.code
      if (code === '23505') {
        // Unique index indicates the signup bonus was already granted.
        return { granted: false, credits: await this.get(sessionId) }
      }
      throw error
    }
  }

  async markBlocked(sessionId: string, reason = 'no_credits'): Promise<CreditBalance> {
    return this.store.markBlocked(sessionId, reason)
  }
}
