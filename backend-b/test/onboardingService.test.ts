import assert from 'node:assert/strict'
import test from 'node:test'
import { OnboardingService } from '../src/onboarding/service'
import type { OnboardingEventName } from '../src/onboarding/types'

test('OnboardingService computes fallback milestones and next action', async () => {
  const firstEvents: Partial<Record<OnboardingEventName, number>> = {
    signup_completed: 1_760_000_000_000,
    whatsapp_saved: 1_760_000_100_000
  }

  const service = new OnboardingService({
    store: {
      getFirstEventAtByNames: async () => firstEvents,
      getLatestTrainingScore: async () => null,
      hasEventForSession: async () => false,
      insertEvent: async () => ({ recorded: true, record: null }),
      getFunnelByCohort: async () => []
    } as any,
    statusStore: {
      getStatus: async () => ({
        sessionId: 'session-1',
        status: 'connected',
        updatedAt: 1_760_000_200_000
      })
    },
    aiConfigStore: {
      get: async () =>
        ({
          enabled: true,
          training: {
            nomeEmpresa: 'AutoWhats',
            nomeIA: 'Auto',
            tipoResposta: 'x'.repeat(60),
            empresa: 'x'.repeat(140),
            descricaoServicosProdutosVendidos: 'x'.repeat(220),
            horarios: 'x'.repeat(24),
            orientacoesGerais: 'x'.repeat(220),
            orientacoesFollowUp: 'x'.repeat(120),
            instrucoesSugestoesLeadsClientes: 'x'.repeat(160)
          }
        }) as any
    }
  })

  const state = await service.getState('session-1')
  assert.equal(state.sessionId, 'session-1')
  assert.equal(state.milestones.whatsapp_connected.reached, true)
  assert.equal(state.milestones.training_score_70_reached.reached, true)
  assert.equal(state.milestones.ai_enabled.reached, true)
  assert.equal(state.milestones.first_ai_response_sent.reached, false)
  assert.equal(state.nextAction?.id, 'send_first_ai_response')
  assert.equal(state.nextAction?.routeKey, 'onboarding_setup')
  assert.equal(state.progressPercent, 83.3)
  assert.ok(state.trainingScore >= 70)
})

test('OnboardingService recordSystemMilestoneOnce is idempotent', async () => {
  let insertCalls = 0
  const service = new OnboardingService({
    store: {
      hasEventForSession: async () => insertCalls > 0,
      insertEvent: async () => {
        insertCalls += 1
        return { recorded: true, record: null }
      },
      getFirstEventAtByNames: async () => ({}),
      getLatestTrainingScore: async () => 0,
      getFunnelByCohort: async () => []
    } as any
  })

  const first = await service.recordSystemMilestoneOnce('session-1', 'whatsapp_connected')
  const second = await service.recordSystemMilestoneOnce('session-1', 'whatsapp_connected')

  assert.equal(first.recorded, true)
  assert.equal(second.recorded, false)
  assert.equal(insertCalls, 1)
})

test('OnboardingService infers signup milestone from dashboard view fallback', async () => {
  const firstEvents: Partial<Record<OnboardingEventName, number>> = {
    dashboard_home_viewed: 1_760_010_000_000
  }

  const service = new OnboardingService({
    store: {
      getFirstEventAtByNames: async () => firstEvents,
      getLatestTrainingScore: async () => null,
      hasEventForSession: async () => false,
      insertEvent: async () => ({ recorded: true, record: null }),
      getFunnelByCohort: async () => []
    } as any
  })

  const state = await service.getState('session-2')
  assert.equal(state.milestones.signup_completed.reached, true)
  assert.equal(state.milestones.signup_completed.atMs, 1_760_010_000_000)
  assert.equal(state.nextAction?.id, 'save_whatsapp')
})

test('OnboardingService records account_activated_7d when activation happens within 7 days', async () => {
  const insertedEvents: string[] = []
  const signupAtMs = 1_760_000_000_000
  const firstAiResponseAtMs = signupAtMs + 2 * 24 * 60 * 60 * 1000

  const service = new OnboardingService({
    paidActivation7dEnabled: true,
    store: {
      hasEventForSession: async (_sessionId: string, eventName: OnboardingEventName) =>
        insertedEvents.includes(eventName),
      insertEvent: async (input: { eventName: OnboardingEventName }) => {
        insertedEvents.push(input.eventName)
        return { recorded: true, record: null }
      },
      getFirstEventAtByNames: async (_sessionId: string, names: readonly OnboardingEventName[]) => {
        if (names.includes('signup_completed')) {
          return { signup_completed: signupAtMs }
        }
        return {}
      },
      getLatestTrainingScore: async () => 0,
      getFunnelByCohort: async () => [],
      getAcquisitionFunnelByCohort: async () => []
    } as any
  })

  await service.recordEvent({
    sessionId: 'session-activated',
    eventId: 'evt-first-ai',
    eventName: 'first_ai_response_sent',
    eventSource: 'system',
    occurredAtMs: firstAiResponseAtMs
  })

  assert.equal(insertedEvents.includes('first_ai_response_sent'), true)
  assert.equal(insertedEvents.includes('account_activated_7d'), true)
})

test('OnboardingService stores guided test assistant parts as separate transcript entries', async () => {
  let storedDraftState: Record<string, unknown> = {
    sessionId: 'session-guided',
    currentStep: 3,
    selectedTemplateId: 'oficina_auto',
      draft: {
        version: 1,
        updatedAtMs: 1_760_000_000_000,
        training: {
          empresa: 'x'.repeat(140),
          descricaoServicosProdutosVendidos: 'x'.repeat(220),
          orientacoesGerais: 'x'.repeat(220)
        }
      },
    guidedTestSession: {
      id: 'guided-1',
      scenarioId: null,
      transcript: [],
      createdAtMs: 1_760_000_000_000,
      updatedAtMs: 1_760_000_000_000
    }
  }
  const insertedEvents: string[] = []

  const service = new OnboardingService({
    store: {
      hasEventForSession: async (_sessionId: string, eventName: OnboardingEventName) =>
        insertedEvents.includes(eventName),
      insertEvent: async (input: { eventName: OnboardingEventName }) => {
        insertedEvents.push(input.eventName)
        return { recorded: true, record: null }
      },
      getFirstEventAtByNames: async () => ({}),
      getLatestTrainingScore: async () => 0,
      getFunnelByCohort: async () => [],
      getAcquisitionFunnelByCohort: async () => []
    } as any,
    draftStore: {
      get: async () => storedDraftState,
      upsert: async (_sessionId: string, value: Record<string, unknown>) => {
        storedDraftState = value
      }
    } as any,
    aiService: {
      generateOnboardingGuidedReply: async () => ({
        assistantMessage:
          'Claro, posso ajudar.\n\n1) Qual é o modelo?\n\n2) Qual é o sintoma?\n\nSe quiser, já posso agendar.',
        assistantParts: [
          'Claro, posso ajudar.',
          '1) Qual é o modelo?',
          '2) Qual é o sintoma?',
          'Se quiser, já posso agendar.'
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          costUsd: 0.01,
          costBrl: 0.05,
          pricingMissing: false
        },
        remainingCredits: 12.34
      })
    } as any
  })

  const result = await service.sendGuidedTestMessage('session-guided', {
    testSessionId: 'guided-1',
    userMessage: 'Meu carro está fazendo barulho'
  })

  assert.deepEqual(result.assistantParts, [
    'Claro, posso ajudar.',
    '1) Qual é o modelo?',
    '2) Qual é o sintoma?',
    'Se quiser, já posso agendar.'
  ])
  assert.equal(insertedEvents.includes('guided_test_message_sent'), true)
  assert.equal(insertedEvents.includes('first_ai_response_sent'), false)

  const payload = await service.getDraft('session-guided')
  assert.deepEqual(payload.guidedTestSession?.transcript, [
    { role: 'user', text: 'Meu carro está fazendo barulho' },
    { role: 'assistant', text: 'Claro, posso ajudar.' },
    { role: 'assistant', text: '1) Qual é o modelo?' },
    { role: 'assistant', text: '2) Qual é o sintoma?' },
    { role: 'assistant', text: 'Se quiser, já posso agendar.' }
  ])
})

test('OnboardingService normalizes legacy guided test transcript on load', async () => {
  const service = new OnboardingService({
    store: {
      hasEventForSession: async () => false,
      insertEvent: async () => ({ recorded: true, record: null }),
      getFirstEventAtByNames: async () => ({}),
      getLatestTrainingScore: async () => 0,
      getFunnelByCohort: async () => [],
      getAcquisitionFunnelByCohort: async () => []
    } as any,
    draftStore: {
      get: async () => ({
        sessionId: 'legacy-session',
        currentStep: 3,
        selectedTemplateId: null,
        draft: {
          version: 1,
          updatedAtMs: 1_760_000_000_000,
          training: {
            empresa: 'x'.repeat(140),
            descricaoServicosProdutosVendidos: 'x'.repeat(220),
            orientacoesGerais: 'x'.repeat(220)
          }
        },
        guidedTestSession: {
          id: 'legacy-guided',
          scenarioId: null,
          transcript: [
            {
              role: 'assistant',
              text:
                'Oi! **Posso** ajudar. 1) Qual é o modelo do veículo? 2) Qual é o principal sintoma? Se quiser, já posso agendar.'
            }
          ],
          createdAtMs: 1_760_000_000_000,
          updatedAtMs: 1_760_000_000_000
        }
      }),
      upsert: async () => {}
    } as any
  })

  const payload = await service.getDraft('legacy-session')
  const transcript = payload.guidedTestSession?.transcript ?? []

  assert.equal(transcript.length, 3)
  assert.equal(transcript[0]?.text, 'Oi! *Posso* ajudar.\n1) Qual é o modelo do veículo?')
  assert.equal(transcript[1]?.text, '2) Qual é o principal sintoma?')
  assert.equal(transcript[2]?.text, 'Se quiser, já posso agendar.')
})
