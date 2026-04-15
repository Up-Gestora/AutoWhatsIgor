import assert from 'node:assert/strict'
import test from 'node:test'
import { CreditsService } from '../src/credits'
import type { CreditBalance, CreditChangeMeta } from '../src/credits/types'

class FakeCreditsStore {
  balanceBrl = 0
  adjustCalls: Array<{ sessionId: string; amountBrl: number; meta: CreditChangeMeta }> = []
  failWithDuplicate = false

  async ensure(_sessionId: string): Promise<void> {}

  async get(sessionId: string): Promise<CreditBalance | null> {
    return {
      sessionId,
      balanceBrl: this.balanceBrl,
      blockedAt: null,
      blockedReason: null,
      updatedAt: Date.now()
    }
  }

  async adjustBalance(sessionId: string, amountBrl: number, meta: CreditChangeMeta): Promise<CreditBalance> {
    this.adjustCalls.push({ sessionId, amountBrl, meta })

    if (this.failWithDuplicate) {
      const err: any = new Error('duplicate key')
      err.code = '23505'
      throw err
    }

    this.balanceBrl += amountBrl
    return {
      sessionId,
      balanceBrl: this.balanceBrl,
      blockedAt: null,
      blockedReason: null,
      updatedAt: Date.now()
    }
  }
}

test('CreditsService.grantSignupBonus grants when amountBrl > 0', async () => {
  const store = new FakeCreditsStore()
  const service = new CreditsService({ store: store as any })

  const result = await service.grantSignupBonus('sess_1', 10)

  assert.equal(result.granted, true)
  assert.equal(result.credits.balanceBrl, 10)
  assert.equal(store.adjustCalls.length, 1)
  assert.equal(store.adjustCalls[0]?.meta.source, 'signup_bonus')
  assert.equal(store.adjustCalls[0]?.meta.reason, 'new_account_credits')
  assert.equal(store.adjustCalls[0]?.meta.actorId, 'system')
})

test('CreditsService.grantSignupBonus is idempotent on unique violation', async () => {
  const store = new FakeCreditsStore()
  store.failWithDuplicate = true
  const service = new CreditsService({ store: store as any })

  const result = await service.grantSignupBonus('sess_1', 10)

  assert.equal(result.granted, false)
  assert.equal(result.credits.balanceBrl, 0)
  assert.equal(store.adjustCalls.length, 1)
})

test('CreditsService.grantSignupBonus skips when amountBrl <= 0', async () => {
  const store = new FakeCreditsStore()
  const service = new CreditsService({ store: store as any })

  const result = await service.grantSignupBonus('sess_1', 0)

  assert.equal(result.granted, false)
  assert.equal(result.credits.balanceBrl, 0)
  assert.equal(store.adjustCalls.length, 0)
})

