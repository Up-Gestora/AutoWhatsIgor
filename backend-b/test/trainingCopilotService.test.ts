import assert from 'node:assert/strict'
import test from 'node:test'
import { TrainingCopilotService } from '../src/ai/trainingCopilotService'
import type { TrainingCopilotSessionState } from '../src/ai/trainingCopilotSchema'

class MemoryStore {
  private stateBySessionId = new Map<string, TrainingCopilotSessionState>()

  async init() {}

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

test('TrainingCopilotService sends assistant message without proposal', async () => {
  const store = new MemoryStore()
  const service = new TrainingCopilotService({
    store: store as any,
    geminiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({
          assistantMessage: 'Perfeito, me conte sobre seu publico.',
          proposal: null
        }),
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      })
    } as any
  })

  const result = await service.sendMessage('session-1', {
    message: 'Quero melhorar atendimento',
    currentTraining: {
      instructions: {}
    }
  })

  assert.equal(result.assistantMessage, 'Perfeito, me conte sobre seu publico.')
  assert.equal(result.pendingProposal, null)
  assert.equal(result.session.messages.length, 2)
})

test('TrainingCopilotService supersedes pending proposal when a new one is generated', async () => {
  const store = new MemoryStore()
  const modelResponses = [
    JSON.stringify({
      assistantMessage: 'Sugiro ativar responder clientes.',
      proposal: {
        summary: 'Ativar resposta para clientes',
        patch: {
          responderClientes: true
        }
      }
    }),
    JSON.stringify({
      assistantMessage: 'Tambem vamos ativar emojis.',
      proposal: {
        summary: 'Ajuste de linguagem',
        patch: {
          usarAgendaAutomatica: true
        }
      }
    })
  ]

  const service = new TrainingCopilotService({
    store: store as any,
    geminiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: String(modelResponses.shift()),
        usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 }
      })
    } as any
  })

  const first = await service.sendMessage('session-1', {
    message: 'A IA deve responder clientes',
    currentTraining: {
      instructions: {}
    }
  })
  assert.ok(first.pendingProposal)
  const firstProposalId = first.pendingProposal?.id ?? ''
  assert.ok(firstProposalId)

  const second = await service.sendMessage('session-1', {
    message: 'Tambem quero linguagem mais amigavel',
    currentTraining: {
      instructions: {}
    }
  })
  assert.ok(second.pendingProposal)
  assert.notEqual(second.pendingProposal?.id, firstProposalId)
  assert.equal(second.session.decisions.length, 1)
  assert.equal(second.session.decisions[0]?.status, 'superseded')
  assert.equal(second.session.decisions[0]?.proposalId, firstProposalId)
})
