import assert from 'node:assert/strict'
import test from 'node:test'
import { AiAutoFollowUpWorker } from '../src/ai/autoFollowUpWorker'
import { FollowUpBlockedError } from '../src/ai/service'

type LeadClaim = {
  sessionId: string
  leadId: string
  chatId: string
  status: 'novo' | 'inativo' | 'aguardando' | 'em_processo' | 'cliente'
  nextContactAt: number
  autoFollowUpStep: number
  campaignType?: 'onboarding_activation' | null
  campaignTargetSessionId?: string | null
  campaignAttempt?: number
}

type ClientClaim = {
  sessionId: string
  clientId: string
  chatId: string
  status: 'ativo' | 'inativo' | 'vip' | 'lead'
  nextContactAt: number
  autoFollowUpStep: number
}

function createWorker(overrides: Partial<Record<string, unknown>> = {}) {
  const calls = {
    leadComplete: [] as Array<{ sessionId: string; leadId: string; nextStep: number; nextContactAt: number | null }>,
    leadRelease: [] as Array<{ sessionId: string; leadId: string; nextContactAt?: number | null }>,
    clientComplete: [] as Array<{ sessionId: string; clientId: string; nextStep: number; nextContactAt: number | null }>,
    clientRelease: [] as Array<{ sessionId: string; clientId: string; nextContactAt?: number | null }>,
    leadUpdate: [] as Array<{ sessionId: string; leadId: string; update: Record<string, unknown> }>,
    createDraft: [] as Array<{
      sessionId: string
      chatId: string
      allowClients?: boolean
      ignoreGlobalAiToggle?: boolean
      ignoreChatAiToggle?: boolean
      objectivePrompt?: string
      extraFollowUpMeta?: Record<string, unknown>
    }>,
    sendFollowUp: [] as Array<{
      sessionId: string
      chatId: string
      allowClients?: boolean
      ignoreGlobalAiToggle?: boolean
      ignoreChatAiToggle?: boolean
    }>,
    suggestFieldUpdates: [] as Array<{ sessionId: string; chatId: string; replyText: string; allowClients?: boolean }>,
    claimClientsCalls: 0
  }

  const deps = {
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => []
    },
    aiService: {
      createFollowUpDraft: async (
        sessionId: string,
        chatId: string,
        options?: {
          allowClients?: boolean
          ignoreGlobalAiToggle?: boolean
          ignoreChatAiToggle?: boolean
          objectivePrompt?: string
          extraFollowUpMeta?: Record<string, unknown>
        }
      ) => {
        calls.createDraft.push({
          sessionId,
          chatId,
          allowClients: options?.allowClients,
          ignoreGlobalAiToggle: options?.ignoreGlobalAiToggle,
          ignoreChatAiToggle: options?.ignoreChatAiToggle,
          objectivePrompt: options?.objectivePrompt,
          extraFollowUpMeta: options?.extraFollowUpMeta
        })
        return { text: 'oi', meta: {} }
      },
      sendFollowUp: async (
        sessionId: string,
        chatId: string,
        _text: string,
        _idempotencyKey?: string,
        options?: { allowClients?: boolean; ignoreGlobalAiToggle?: boolean; ignoreChatAiToggle?: boolean }
      ) => {
        calls.sendFollowUp.push({
          sessionId,
          chatId,
          allowClients: options?.allowClients,
          ignoreGlobalAiToggle: options?.ignoreGlobalAiToggle,
          ignoreChatAiToggle: options?.ignoreChatAiToggle
        })
        return { id: 1 }
      },
      suggestFieldUpdatesAfterFollowUp: async (
        sessionId: string,
        chatId: string,
        replyText: string,
        options?: { allowClients?: boolean }
      ) => {
        calls.suggestFieldUpdates.push({
          sessionId,
          chatId,
          replyText,
          allowClients: options?.allowClients
        })
      }
    },
    leadStore: {
      claimDueForAutoFollowUp: async () => [] as LeadClaim[],
      get: async () => null,
      update: async (sessionId: string, leadId: string, update: Record<string, unknown>) => {
        calls.leadUpdate.push({ sessionId, leadId, update })
        return null
      },
      completeAutoFollowUpStep: async (
        sessionId: string,
        leadId: string,
        input: { nextStep: number; nextContactAt: number | null }
      ) => {
        calls.leadComplete.push({ sessionId, leadId, nextStep: input.nextStep, nextContactAt: input.nextContactAt })
      },
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    },
    clientStore: {
      claimDueForAutoFollowUp: async () => {
        calls.claimClientsCalls += 1
        return [] as ClientClaim[]
      },
      completeAutoFollowUpStep: async (
        sessionId: string,
        clientId: string,
        input: { nextStep: number; nextContactAt: number | null }
      ) => {
        calls.clientComplete.push({
          sessionId,
          clientId,
          nextStep: input.nextStep,
          nextContactAt: input.nextContactAt
        })
      },
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        clientId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.clientRelease.push({ sessionId, clientId, nextContactAt: options?.nextContactAt })
      }
    }
  }

  const merged = {
    ...deps,
    ...overrides
  }

  const worker = new AiAutoFollowUpWorker({
    configStore: merged.configStore as any,
    aiService: merged.aiService as any,
    leadStore: merged.leadStore as any,
    clientStore: merged.clientStore as any,
    pollIntervalMs: 1000,
    sessionLimit: 10,
    batchSize: 10,
    leaseMs: 60000,
    retryBaseMs: 1000,
    retryMaxMs: 10000,
    ...(merged.onboardingNurture ? { onboardingNurture: merged.onboardingNurture as any } : {})
  })

  return { worker, calls }
}

test('auto follow-up sends due lead and completes current cycle', async () => {
  const now = Date.now()
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                allowClients: false
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: now - 1000,
            autoFollowUpStep: 0
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async (
        sessionId: string,
        leadId: string,
        input: { nextStep: number; nextContactAt: number | null }
      ) => {
        calls.leadComplete.push({ sessionId, leadId, nextStep: input.nextStep, nextContactAt: input.nextContactAt })
      },
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.createDraft.length, 1)
  assert.equal(calls.sendFollowUp.length, 1)
  assert.equal(calls.leadComplete.length, 1)
  assert.equal(calls.leadComplete[0].nextStep, 0)
  assert.equal(calls.leadComplete[0].nextContactAt, null)
  assert.equal(calls.suggestFieldUpdates.length, 1)
  assert.equal(calls.leadRelease.length, 0)
})

test('auto follow-up ignores legacy mode only_if_no_reply and still sends', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                mode: 'only_if_no_reply'
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 1
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async (
        sessionId: string,
        leadId: string,
        input: { nextStep: number; nextContactAt: number | null }
      ) => {
        calls.leadComplete.push({ sessionId, leadId, nextStep: input.nextStep, nextContactAt: input.nextContactAt })
      },
      releaseAutoFollowUpClaim: async () => {}
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.createDraft.length, 1)
  assert.equal(calls.sendFollowUp.length, 1)
  assert.equal(calls.leadComplete.length, 1)
  assert.equal(calls.leadComplete[0].nextStep, 0)
  assert.equal(calls.leadComplete[0].nextContactAt, null)
})

test('auto follow-up triggers post-send field suggestions', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                mode: 'reschedule_if_replied'
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 1
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async (
        sessionId: string,
        leadId: string,
        input: { nextStep: number; nextContactAt: number | null }
      ) => {
        calls.leadComplete.push({ sessionId, leadId, nextStep: input.nextStep, nextContactAt: input.nextContactAt })
      },
      releaseAutoFollowUpClaim: async () => {}
    },
    aiService: {
      createFollowUpDraft: async (sessionId: string, chatId: string, options?: { allowClients?: boolean }) => {
        calls.createDraft.push({ sessionId, chatId, allowClients: options?.allowClients })
        return { text: 'oi', meta: {} }
      },
      sendFollowUp: async (
        sessionId: string,
        chatId: string,
        _text: string,
        _idempotencyKey?: string,
        options?: { allowClients?: boolean }
      ) => {
        calls.sendFollowUp.push({ sessionId, chatId, allowClients: options?.allowClients })
        return { id: 1 }
      },
      suggestFieldUpdatesAfterFollowUp: async (
        sessionId: string,
        chatId: string,
        replyText: string,
        options?: { allowClients?: boolean }
      ) => {
        calls.suggestFieldUpdates.push({ sessionId, chatId, replyText, allowClients: options?.allowClients })
      }
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.suggestFieldUpdates.length, 1)
  assert.equal(calls.suggestFieldUpdates[0].replyText, 'oi')
  assert.equal(calls.createDraft.length, 1)
  assert.equal(calls.sendFollowUp.length, 1)
  assert.equal(calls.leadComplete.length, 1)
  assert.equal(calls.leadComplete[0].nextStep, 0)
  assert.equal(calls.leadComplete[0].nextContactAt, null)
})

test('auto follow-up does not process clients when allowClients is disabled', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                allowClients: false,
                mode: 'always'
              }
            }
          }
        }
      ]
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.claimClientsCalls, 0)
})

test('auto follow-up applies retry backoff when send fails', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                mode: 'always'
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 0
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async () => {},
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    },
    aiService: {
      createFollowUpDraft: async () => {
        throw new Error('draft_failed')
      },
      sendFollowUp: async () => ({ id: 1 }),
      suggestFieldUpdatesAfterFollowUp: async () => {}
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.leadRelease.length, 1)
  assert.ok((calls.leadRelease[0].nextContactAt ?? 0) > Date.now())
})

test('auto follow-up applies retry backoff when IA global is disabled', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                mode: 'always'
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 0
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async () => {},
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    },
    aiService: {
      createFollowUpDraft: async () => {
        throw new FollowUpBlockedError('ai_disabled', 'IA global desativada')
      },
      sendFollowUp: async () => ({ id: 1 }),
      suggestFieldUpdatesAfterFollowUp: async () => {}
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.leadRelease.length, 1)
  assert.equal(calls.leadComplete.length, 0)
  assert.ok((calls.leadRelease[0].nextContactAt ?? 0) > Date.now())
})

test('auto follow-up applies retry backoff when chat IA is disabled', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                mode: 'always'
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 0
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async () => {},
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    },
    aiService: {
      createFollowUpDraft: async () => {
        throw new FollowUpBlockedError('chat_disabled', 'IA desativada para esta conversa')
      },
      sendFollowUp: async () => ({ id: 1 }),
      suggestFieldUpdatesAfterFollowUp: async () => {}
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.leadRelease.length, 1)
  assert.equal(calls.leadComplete.length, 0)
  assert.ok((calls.leadRelease[0].nextContactAt ?? 0) > Date.now())
})

test('auto follow-up does not retry when blocked by delivery_guard', async () => {
  const { worker, calls } = createWorker({
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 's1',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                mode: 'always'
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 's1',
            leadId: 'l1',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'novo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 0
          }
        ] satisfies LeadClaim[],
      completeAutoFollowUpStep: async (
        sessionId: string,
        leadId: string,
        input: { nextStep: number; nextContactAt: number | null }
      ) => {
        calls.leadComplete.push({ sessionId, leadId, nextStep: input.nextStep, nextContactAt: input.nextContactAt })
      },
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    },
    aiService: {
      createFollowUpDraft: async () => {
        throw new FollowUpBlockedError('delivery_guard', 'IA desligada por seguranca de entregabilidade')
      },
      sendFollowUp: async () => ({ id: 1 }),
      suggestFieldUpdatesAfterFollowUp: async () => {}
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.leadRelease.length, 0)
  assert.equal(calls.leadComplete.length, 1)
  assert.equal(calls.leadComplete[0].nextStep, 0)
  assert.equal(calls.leadComplete[0].nextContactAt, null)
})

test('auto follow-up onboarding campaign sends and reschedules with campaign cadence', async () => {
  const now = Date.now()
  const { worker, calls } = createWorker({
    onboardingNurture: {
      enabled: true,
      retryBaseMs: 1000,
      retryMaxMs: 10000,
      stateProvider: {
        getState: async () =>
          ({
            sessionId: 'target-session-1',
            activationDefinition: 'first_ai_response_sent',
            trainingScore: 62,
            progressPercent: 50,
            milestones: {
              signup_completed: { reached: true, atMs: 1 },
              whatsapp_saved: { reached: true, atMs: 2 },
              whatsapp_connected: { reached: true, atMs: 3 },
              training_score_70_reached: { reached: false, atMs: null },
              ai_enabled: { reached: false, atMs: null },
              first_ai_response_sent: { reached: false, atMs: null }
            },
            nextAction: {
              id: 'reach_training_score_70',
              title: 'Reforçar treinamento da IA',
              description: 'Treinamento abaixo do recomendado.',
              routeKey: 'onboarding_setup',
              ctaLabel: 'Validar etapa 3'
            }
          }) as any
      }
    },
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 'sender-igsartor',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                allowClients: false
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 'sender-igsartor',
            leadId: '5511999999999@s.whatsapp.net',
            chatId: '5511999999999@s.whatsapp.net',
            status: 'em_processo',
            nextContactAt: now - 1000,
            autoFollowUpStep: 0,
            campaignType: 'onboarding_activation',
            campaignTargetSessionId: 'target-session-1',
            campaignAttempt: 0
          }
        ] satisfies LeadClaim[],
      get: async () => null,
      update: async (sessionId: string, leadId: string, update: Record<string, unknown>) => {
        calls.leadUpdate.push({ sessionId, leadId, update })
        return null
      },
      completeAutoFollowUpStep: async () => {},
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.createDraft.length, 1)
  assert.equal(calls.createDraft[0].ignoreGlobalAiToggle, true)
  assert.equal(calls.createDraft[0].ignoreChatAiToggle, true)
  assert.ok(typeof calls.createDraft[0].objectivePrompt === 'string' && calls.createDraft[0].objectivePrompt.length > 0)
  assert.equal(calls.sendFollowUp.length, 1)
  assert.equal(calls.sendFollowUp[0].ignoreGlobalAiToggle, true)
  assert.equal(calls.sendFollowUp[0].ignoreChatAiToggle, true)
  assert.equal(calls.suggestFieldUpdates.length, 0)
  assert.equal(calls.leadUpdate.length, 1)
  assert.equal(calls.leadUpdate[0].update.campaignAttempt, 1)
  assert.equal(calls.leadUpdate[0].update.campaignType, 'onboarding_activation')
  assert.ok(typeof calls.leadUpdate[0].update.nextContact === 'number')
  assert.ok((calls.leadUpdate[0].update.nextContact as number) > Date.now())
})

test('auto follow-up onboarding campaign stops when target session is activated', async () => {
  const { worker, calls } = createWorker({
    onboardingNurture: {
      enabled: true,
      retryBaseMs: 1000,
      retryMaxMs: 10000,
      stateProvider: {
        getState: async () =>
          ({
            sessionId: 'target-session-2',
            activationDefinition: 'first_ai_response_sent',
            trainingScore: 80,
            progressPercent: 100,
            milestones: {
              signup_completed: { reached: true, atMs: 1 },
              whatsapp_saved: { reached: true, atMs: 2 },
              whatsapp_connected: { reached: true, atMs: 3 },
              training_score_70_reached: { reached: true, atMs: 4 },
              ai_enabled: { reached: true, atMs: 5 },
              first_ai_response_sent: { reached: true, atMs: 6 }
            },
            nextAction: null
          }) as any
      }
    },
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 'sender-igsartor',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                allowClients: false
              }
            }
          }
        }
      ]
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 'sender-igsartor',
            leadId: '5511888888888@s.whatsapp.net',
            chatId: '5511888888888@s.whatsapp.net',
            status: 'em_processo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 0,
            campaignType: 'onboarding_activation',
            campaignTargetSessionId: 'target-session-2',
            campaignAttempt: 2
          }
        ] satisfies LeadClaim[],
      get: async () =>
        ({
          observations: 'obs anterior'
        }) as any,
      update: async (sessionId: string, leadId: string, update: Record<string, unknown>) => {
        calls.leadUpdate.push({ sessionId, leadId, update })
        return null
      },
      completeAutoFollowUpStep: async () => {},
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.createDraft.length, 0)
  assert.equal(calls.sendFollowUp.length, 0)
  assert.equal(calls.leadRelease.length, 0)
  assert.equal(calls.leadUpdate.length, 1)
  assert.equal(calls.leadUpdate[0].update.status, 'inativo')
  assert.equal(calls.leadUpdate[0].update.nextContact, null)
  assert.equal(calls.leadUpdate[0].update.campaignType, null)
  assert.equal(calls.leadUpdate[0].update.campaignAttempt, 0)
})

test('auto follow-up onboarding campaign stops on opt-out', async () => {
  const { worker, calls } = createWorker({
    onboardingNurture: {
      enabled: true,
      retryBaseMs: 1000,
      retryMaxMs: 10000,
      stateProvider: {
        getState: async () =>
          ({
            sessionId: 'target-session-3',
            activationDefinition: 'first_ai_response_sent',
            trainingScore: 40,
            progressPercent: 30,
            milestones: {
              signup_completed: { reached: true, atMs: 1 },
              whatsapp_saved: { reached: true, atMs: 2 },
              whatsapp_connected: { reached: false, atMs: null },
              training_score_70_reached: { reached: false, atMs: null },
              ai_enabled: { reached: false, atMs: null },
              first_ai_response_sent: { reached: false, atMs: null }
            },
            nextAction: {
              id: 'connect_whatsapp',
              title: 'Conectar WhatsApp',
              description: 'Sem conexão ativa.',
              routeKey: 'connections',
              ctaLabel: 'Conectar agora'
            }
          }) as any
      }
    },
    configStore: {
      listSessionsWithAutoFollowUpEnabled: async () => [
        {
          sessionId: 'sender-igsartor',
          config: {
            training: {
              followUpAutomatico: {
                enabled: true,
                allowClients: false
              }
            }
          }
        }
      ]
    },
    aiService: {
      createFollowUpDraft: async () => {
        throw new FollowUpBlockedError('opted_out', 'opt-out')
      },
      sendFollowUp: async () => ({ id: 1 }),
      suggestFieldUpdatesAfterFollowUp: async () => {}
    },
    leadStore: {
      claimDueForAutoFollowUp: async () =>
        [
          {
            sessionId: 'sender-igsartor',
            leadId: '5511777777777@s.whatsapp.net',
            chatId: '5511777777777@s.whatsapp.net',
            status: 'em_processo',
            nextContactAt: Date.now() - 1000,
            autoFollowUpStep: 0,
            campaignType: 'onboarding_activation',
            campaignTargetSessionId: 'target-session-3',
            campaignAttempt: 1
          }
        ] satisfies LeadClaim[],
      get: async () =>
        ({
          observations: null
        }) as any,
      update: async (sessionId: string, leadId: string, update: Record<string, unknown>) => {
        calls.leadUpdate.push({ sessionId, leadId, update })
        return null
      },
      completeAutoFollowUpStep: async () => {},
      releaseAutoFollowUpClaim: async (
        sessionId: string,
        leadId: string,
        options?: { nextContactAt?: number | null }
      ) => {
        calls.leadRelease.push({ sessionId, leadId, nextContactAt: options?.nextContactAt })
      }
    }
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(calls.sendFollowUp.length, 0)
  assert.equal(calls.leadRelease.length, 0)
  assert.equal(calls.leadUpdate.length, 1)
  assert.equal(calls.leadUpdate[0].update.status, 'inativo')
  assert.equal(calls.leadUpdate[0].update.nextContact, null)
})
