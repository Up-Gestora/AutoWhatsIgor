import assert from 'node:assert/strict'
import test from 'node:test'
import { TrainingCopilotBlockedError, TrainingCopilotService } from '../src/ai/trainingCopilotService'
import type { TrainingCopilotSessionState } from '../src/ai/trainingCopilotSchema'

class MemoryStore {
  private stateBySessionId = new Map<string, TrainingCopilotSessionState>()

  async get(sessionId: string) {
    return this.stateBySessionId.get(sessionId) ?? null
  }

  async upsert(
    sessionId: string,
    input: {
      messages: TrainingCopilotSessionState['messages']
      pendingProposal: TrainingCopilotSessionState['pendingProposal']
      decisions: TrainingCopilotSessionState['decisions']
      proposalSeq: number
    }
  ) {
    const prev = this.stateBySessionId.get(sessionId)
    const now = Date.now()
    const next: TrainingCopilotSessionState = {
      sessionId,
      messages: input.messages,
      pendingProposal: input.pendingProposal,
      decisions: input.decisions,
      proposalSeq: input.proposalSeq,
      createdAtMs: prev?.createdAtMs ?? now,
      updatedAtMs: now
    }
    this.stateBySessionId.set(sessionId, next)
    return next
  }

  async reset(sessionId: string) {
    const now = Date.now()
    const next: TrainingCopilotSessionState = {
      sessionId,
      messages: [],
      pendingProposal: null,
      decisions: [],
      proposalSeq: 0,
      createdAtMs: now,
      updatedAtMs: now
    }
    this.stateBySessionId.set(sessionId, next)
    return next
  }

  async delete(sessionId: string) {
    this.stateBySessionId.delete(sessionId)
  }
}

test('TrainingCopilotService blocks when credits are insufficient', async () => {
  const service = new TrainingCopilotService({
    store: new MemoryStore() as any,
    geminiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({ assistantMessage: 'Oi', proposal: null }),
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    creditsService: {
      canUse: async () => false
    } as any
  })

  await assert.rejects(
    () =>
      service.sendMessage('session-1', {
        message: 'Teste',
        currentTraining: { instructions: {} }
      }),
    (error: any) => {
      assert.ok(error instanceof TrainingCopilotBlockedError)
      assert.equal(error.reason, 'no_credits')
      return true
    }
  )
})

test('TrainingCopilotService records usage and debits credits with reason training_copilot', async () => {
  const consumeCalls: Array<{ amountBrl: number; reason?: string | null }> = []
  let usageRecorded = 0

  const service = new TrainingCopilotService({
    store: new MemoryStore() as any,
    geminiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({ assistantMessage: 'Oi', proposal: null }),
        usage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 }
      })
    } as any,
    creditsService: {
      canUse: async () => true,
      consume: async (_sessionId: string, amountBrl: number, meta: { reason?: string | null }) => {
        consumeCalls.push({ amountBrl, reason: meta.reason ?? null })
        return {
          sessionId: 'session-1',
          balanceBrl: 10,
          blockedAt: null,
          blockedReason: null,
          updatedAt: Date.now()
        }
      }
    } as any,
    usageStore: {
      record: async () => {
        usageRecorded += 1
      }
    } as any,
    systemSettings: {
      getUsdBrlRate: () => 5,
      getAiPricing: () => ({
        models: {
          'gemini-3-flash-preview': {
            inputUsdPerM: 1,
            outputUsdPerM: 1
          }
        }
      })
    } as any
  })

  await service.sendMessage('session-1', {
    message: 'Teste',
    currentTraining: { instructions: {} }
  })

  assert.equal(usageRecorded, 1)
  assert.equal(consumeCalls.length, 1)
  assert.equal(consumeCalls[0]?.reason, 'training_copilot')
  assert.ok((consumeCalls[0]?.amountBrl ?? 0) > 0)
})
