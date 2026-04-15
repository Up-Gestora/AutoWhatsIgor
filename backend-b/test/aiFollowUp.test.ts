import assert from 'node:assert/strict'
import test from 'node:test'
import { AiMessageService, FollowUpBlockedError } from '../src/ai/service'
import { buildFollowUpPrompt } from '../src/ai/promptBuilder'
import type { AiConfig } from '../src/ai/types'

const baseConfig: AiConfig = {
  enabled: true,
  respondInGroups: false,
  provider: 'openai',
  model: 'gpt-test',
  temperature: 0.1,
  maxTokens: 500,
  systemPrompt: '',
  fallbackMode: 'silence',
  fallbackText: '',
  optOutKeywords: [],
  optInKeywords: [],
  contextMaxMessages: 10,
  contextTtlSec: 600,
  processingTimeoutMs: 60000,
  businessHours: undefined,
  training: undefined
}

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  return new AiMessageService({
    inboundStore: {
      getById: async () => null,
      getLatestUserTextByChat: async () => null,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 1 })
    } as any,
    configStore: {
      get: async () => null
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async () => {}
    } as any,
    contextCache: {
      appendMessage: async () => {}
    } as any,
    optOutStore: {
      clearOptOut: async () => {},
      setOptOut: async () => {},
      isOptedOut: async () => false
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: 'ok',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      })
    } as any,
    defaultConfig: baseConfig,
    ...(overrides as any)
  })
}

test('Follow-up blocks for clients when responderClientes is disabled', async () => {
  const service = createService({
    configStore: {
      get: async () => ({ training: { responderClientes: false } })
    },
    clientStore: {
      findByChatOrWhatsapp: async () => ({ id: 'client-1' })
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'clients_disabled')
      return true
    }
  )
})

test('Follow-up allows clients when allowClients option is enabled', async () => {
  const service = createService({
    configStore: {
      get: async () => ({ training: { responderClientes: false } })
    },
    clientStore: {
      findByChatOrWhatsapp: async () => ({ id: 'client-1' })
    }
  })

  const draft = await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net', {
    allowClients: true
  })
  assert.equal(draft.text, 'ok')
})

test('Follow-up blocks when opted out', async () => {
  const service = createService({
    optOutStore: {
      clearOptOut: async () => {},
      setOptOut: async () => {},
      isOptedOut: async () => true
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'opted_out')
      return true
    }
  )
})

test('Follow-up blocks when IA global is disabled', async () => {
  const service = createService({
    configStore: {
      get: async () => ({ enabled: false })
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'ai_disabled')
      return true
    }
  )
})

test('Follow-up blocks when IA is disabled for the chat', async () => {
  const service = createService({
    chatConfigStore: {
      get: async () => ({ aiEnabled: false, disabledReason: 'manual', disabledAt: Date.now() })
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'chat_disabled')
      return true
    }
  )
})

test('Follow-up blocks with delivery_guard when last two outbound messages are undelivered', async () => {
  const now = Date.now()
  let disabledReason: string | null = null
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          desligarIASeUltimasDuasMensagensNaoRecebidas: true
        }
      })
    },
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    },
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:1',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem 1',
          type: 'text',
          timestampMs: now - 8 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-1',
          status: 'failed',
          origin: 'ai'
        },
        {
          id: 'outbound:2',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem 2',
          type: 'text',
          timestampMs: now - 7 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-2',
          status: 'sent',
          origin: 'human_dashboard'
        }
      ]
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'delivery_guard')
      return true
    }
  )
  assert.equal(disabledReason, 'delivery_guard')
})

test('Follow-up does not apply delivery_guard when toggle is disabled', async () => {
  const now = Date.now()
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          desligarIASeUltimasDuasMensagensNaoRecebidas: false
        }
      })
    },
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:1',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem 1',
          type: 'text',
          timestampMs: now - 8 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-1',
          status: 'failed',
          origin: 'ai'
        },
        {
          id: 'outbound:2',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem 2',
          type: 'text',
          timestampMs: now - 7 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-2',
          status: 'sent',
          origin: 'human_dashboard'
        }
      ]
    }
  })

  const draft = await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')
  assert.equal(draft.text, 'ok')
})

test('Follow-up blocks with recent_human_activity when a human message exists in the latest window', async () => {
  const now = Date.now()
  let disabledReason: string | null = null
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteUsarDias: false,
          desligarIASeHumanoRecenteUsarMensagens: true,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 4
        }
      })
    },
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    },
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:ai',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem da IA',
          type: 'text',
          timestampMs: now - 15 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-ai',
          status: 'delivered',
          origin: 'ai'
        },
        {
          id: 'outbound:human',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem enviada no painel',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human',
          status: 'delivered',
          origin: 'human_dashboard'
        }
      ]
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'recent_human_activity')
      return true
    }
  )
  assert.equal(disabledReason, 'recent_human_activity')
})

test('Follow-up blocks with recent_human_activity when a human message exists within the day window only', async () => {
  const now = Date.now()
  let disabledReason: string | null = null
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteUsarDias: true,
          desligarIASeHumanoRecenteUsarMensagens: false,
          desligarIASeHumanoRecenteDias: 3,
          desligarIASeHumanoRecenteMensagens: 2
        }
      })
    },
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    },
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:human-old',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem enviada no painel ontem',
          type: 'text',
          timestampMs: now - 24 * 60 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human-old',
          status: 'delivered',
          origin: 'human_dashboard'
        },
        {
          id: 'outbound:ai-1',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem da IA 1',
          type: 'text',
          timestampMs: now - 60 * 1000,
          fromMe: true,
          messageId: 'wamid-ai-1',
          status: 'delivered',
          origin: 'ai'
        },
        {
          id: 'outbound:ai-2',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem da IA 2',
          type: 'text',
          timestampMs: now - 30 * 1000,
          fromMe: true,
          messageId: 'wamid-ai-2',
          status: 'delivered',
          origin: 'ai'
        }
      ]
    }
  })

  await assert.rejects(
    () => service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net'),
    (error: any) => {
      assert.ok(error instanceof FollowUpBlockedError)
      assert.equal(error.reason, 'recent_human_activity')
      return true
    }
  )
  assert.equal(disabledReason, 'recent_human_activity')
})

test('Follow-up does not block by recent_human_activity when latest fromMe messages are AI/automation', async () => {
  const now = Date.now()
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteUsarDias: true,
          desligarIASeHumanoRecenteUsarMensagens: true,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 4
        }
      })
    },
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:ai',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem da IA',
          type: 'text',
          timestampMs: now - 5 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-ai',
          status: 'delivered',
          origin: 'ai'
        },
        {
          id: 'outbound:automation',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem de automacao',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-automation',
          status: 'delivered',
          origin: 'automation_api'
        }
      ]
    }
  })

  const draft = await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')
  assert.equal(draft.text, 'ok')
})

test('Follow-up does not block by recent_human_activity when both criteria are disabled', async () => {
  const now = Date.now()
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteUsarDias: false,
          desligarIASeHumanoRecenteUsarMensagens: false,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 4
        }
      })
    },
    chatConfigStore: {
      get: async () => null,
      disable: async () => {
        throw new Error('should_not_disable')
      }
    },
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:human',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem enviada no painel',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human',
          status: 'delivered',
          origin: 'human_dashboard'
        }
      ]
    }
  })

  const draft = await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')
  assert.equal(draft.text, 'ok')
})

test('buildFollowUpPrompt appends follow-up instructions and meta only when provided', () => {
  const promptWithMeta = buildFollowUpPrompt({
    training: {
      nomeIA: 'Teste',
      nomeEmpresa: 'Empresa',
      seApresentarComoIA: false,
      orientacoesFollowUp: '   '
    } as any,
    followUpMeta: { lastUserMessageAt: '2026-02-05T10:00:00.000Z' }
  })

  assert.ok(!promptWithMeta.includes('Orientacoes adicionais para follow-up:'))
  assert.ok(promptWithMeta.includes('Dados adicionais (JSON):'))
  assert.ok(promptWithMeta.includes('"lastUserMessageAt"'))

  const promptWithInstructions = buildFollowUpPrompt({
    training: {
      nomeIA: 'Teste',
      nomeEmpresa: 'Empresa',
      seApresentarComoIA: false,
      orientacoesFollowUp: 'Retomar com CTA de agendamento.'
    } as any,
    followUpMeta: {}
  })

  assert.ok(promptWithInstructions.includes('Orientacoes adicionais para follow-up:'))
  assert.ok(promptWithInstructions.includes('Retomar com CTA de agendamento.'))
  assert.ok(!promptWithInstructions.includes('Dados adicionais (JSON):'))
})

test('buildFollowUpPrompt appends objective prompt when provided', () => {
  const prompt = buildFollowUpPrompt({
    training: {
      nomeIA: 'Teste',
      nomeEmpresa: 'Empresa',
      seApresentarComoIA: false
    } as any,
    objectivePrompt: 'Explique a etapa atual e peça confirmação para a próxima ação.',
    followUpMeta: {
      attempt: 2
    }
  })

  assert.ok(prompt.includes('Objetivo especifico deste follow-up:'))
  assert.ok(prompt.includes('Explique a etapa atual e peça confirmação para a próxima ação.'))
  assert.ok(prompt.includes('"attempt": 2'))
})

test('sendFollowUp respects seApresentarComoIA=false (no presentation tracking)', async () => {
  let resetCalls = 0
  let incrementCalls = 0

  const service = createService({
    configStore: {
      get: async () => ({ training: { seApresentarComoIA: false } })
    },
    presentationStore: {
      getCounter: async () => 0,
      reset: async () => {
        resetCalls += 1
      },
      increment: async () => {
        incrementCalls += 1
      }
    }
  })

  await service.sendFollowUp('s1', '5511999999999@s.whatsapp.net', 'Oi!')

  assert.equal(resetCalls, 0)
  assert.equal(incrementCalls, 0)
})

test('sendFollowUp resets presentation counter when shouldIntroduce is true', async () => {
  let resetCalls = 0
  let incrementCalls = 0

  const service = createService({
    configStore: {
      get: async () => ({ training: { seApresentarComoIA: true } })
    },
    presentationStore: {
      getCounter: async () => 0,
      reset: async () => {
        resetCalls += 1
      },
      increment: async () => {
        incrementCalls += 1
      }
    }
  })

  await service.sendFollowUp('s1', '5511999999999@s.whatsapp.net', 'Oi!')

  assert.equal(resetCalls, 1)
  assert.equal(incrementCalls, 1)
})

test('sendFollowUp splits [SEPARAR] into multiple outbound messages', async () => {
  const enqueued: Array<{ text: string; idempotencyKey?: string }> = []

  const service = createService({
    configStore: {
      get: async () => ({ training: { seApresentarComoIA: false } })
    },
    outboundService: {
      enqueue: async (input: { text: string; idempotencyKey?: string }) => {
        enqueued.push({ text: input.text, idempotencyKey: input.idempotencyKey })
        return { id: 100 + enqueued.length }
      }
    }
  })

  const first = await service.sendFollowUp(
    's1',
    '5511999999999@s.whatsapp.net',
    'Oi[SEPARAR]\nTudo bem?',
    'key123'
  )

  assert.equal(enqueued.length, 2)
  assert.deepEqual(
    enqueued.map((entry) => entry.text),
    ['Oi', 'Tudo bem?']
  )
  assert.deepEqual(
    enqueued.map((entry) => entry.idempotencyKey),
    ['key123:0', 'key123:1']
  )
  assert.equal(first.id, 101)
})

test('sendFollowUp also splits [SEPARATE] into multiple outbound messages', async () => {
  const enqueued: Array<{ text: string; idempotencyKey?: string }> = []

  const service = createService({
    configStore: {
      get: async () => ({ training: { seApresentarComoIA: false } })
    },
    outboundService: {
      enqueue: async (input: { text: string; idempotencyKey?: string }) => {
        enqueued.push({ text: input.text, idempotencyKey: input.idempotencyKey })
        return { id: 200 + enqueued.length }
      }
    }
  })

  const first = await service.sendFollowUp(
    's1',
    '5511999999999@s.whatsapp.net',
    'Hello[SEPARATE]\nHow can I help?',
    'key456'
  )

  assert.equal(enqueued.length, 2)
  assert.deepEqual(
    enqueued.map((entry) => entry.text),
    ['Hello', 'How can I help?']
  )
  assert.deepEqual(
    enqueued.map((entry) => entry.idempotencyKey),
    ['key456:0', 'key456:1']
  )
  assert.equal(first.id, 201)
})

test('createFollowUpDraft uses media summary when outbound media has no caption', async () => {
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = createService({
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:1',
          chatId: '5511999999999@s.whatsapp.net',
          text: null,
          type: 'documentMessage',
          timestampMs: Date.now() - 5000,
          fromMe: true,
          messageId: 'wamid-1',
          origin: 'ai',
          media: {
            mediaType: 'documentMessage',
            fileName: 'Guia de Boas Vindas.pdf',
            mimeType: 'application/pdf'
          }
        }
      ]
    },
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return {
          content: 'Tudo certo.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      }
    }
  })

  await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')

  const assistantContext = capturedMessages.find((entry) => entry.role === 'assistant')
  assert.ok(assistantContext)
  assert.match(assistantContext!.content, /\[MIDIA_ENVIADA\]/)
  assert.match(assistantContext!.content, /tipo=document/)
  assert.match(assistantContext!.content, /nomeArquivo=Guia de Boas Vindas\.pdf/)
  assert.match(assistantContext!.content, /mime=application\/pdf/)
})

test('createFollowUpDraft falls back to type summary when media metadata is missing', async () => {
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = createService({
    chatService: {
      listMessages: async () => [
        {
          id: 'legacy:1',
          chatId: '5511999999999@s.whatsapp.net',
          text: null,
          type: 'documentMessage',
          timestampMs: Date.now() - 5000,
          fromMe: true,
          messageId: 'wamid-legacy',
          origin: 'human_dashboard'
        },
        {
          id: 'inbound:1',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Pode me lembrar do material?',
          type: 'text',
          timestampMs: Date.now() - 3000,
          fromMe: false,
          messageId: 'm-inbound',
          origin: 'inbound'
        }
      ]
    },
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return {
          content: 'Claro, vou resumir.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      }
    }
  })

  await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')

  const assistantContext = capturedMessages.find((entry) => entry.role === 'assistant')
  assert.ok(assistantContext)
  assert.match(assistantContext!.content, /\[MIDIA_ENVIADA\]/)
  assert.match(assistantContext!.content, /tipo=document/)
})

test('createFollowUpDraft includes timestamp metadata in history context', async () => {
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = createService({
    chatService: {
      listMessages: async () => [
        {
          id: 'inbound:42',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem com horario',
          type: 'text',
          timestampMs: Date.UTC(2026, 1, 10, 19, 45, 0),
          fromMe: false,
          messageId: 'm42',
          origin: 'inbound'
        }
      ]
    },
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return {
          content: 'Perfeito.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      }
    }
  })

  await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')

  const userContext = capturedMessages.find(
    (entry) => entry.role === 'user' && entry.content.includes('Mensagem com horario')
  )
  assert.ok(userContext)
  assert.match(userContext!.content, /^\[MSG_TIME\] timestampMs=\d+ \| iso=\d{4}-\d{2}-\d{2}T/)
  assert.match(userContext!.content, /\| local=/)
  assert.match(userContext!.content, /\| fromMe=false/)
  assert.match(userContext!.content, /\| origin=inbound/)
  assert.match(userContext!.content, /\| actor=contact/)
  assert.match(userContext!.content, /\| channel=whatsapp_inbound/)
})

test('createFollowUpDraft falls back to legacy_manual metadata when origin is missing on fromMe history', async () => {
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = createService({
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:legacy',
          chatId: '5511999999999@s.whatsapp.net',
          text: 'Mensagem sem origem registrada',
          type: 'text',
          timestampMs: Date.UTC(2026, 1, 10, 19, 40, 0),
          fromMe: true,
          messageId: 'm-legacy'
        }
      ]
    },
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return {
          content: 'Perfeito.',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      }
    }
  })

  await service.createFollowUpDraft('s1', '5511999999999@s.whatsapp.net')

  const assistantContext = capturedMessages.find(
    (entry) => entry.role === 'assistant' && entry.content.includes('Mensagem sem origem registrada')
  )
  assert.ok(assistantContext)
  assert.match(assistantContext!.content, /\| fromMe=true/)
  assert.match(assistantContext!.content, /\| origin=legacy_manual/)
  assert.match(assistantContext!.content, /\| actor=human/)
  assert.match(assistantContext!.content, /\| channel=legacy_manual/)
})

test('suggestFieldUpdatesAfterFollowUp persists suggestion when enabled', async () => {
  let persisted = 0
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          permitirSugestoesCamposLeadsClientes: true
        }
      })
    },
    suggestionStore: {
      upsertPending: async () => {
        persisted += 1
        return { id: 1 } as any
      }
    },
    leadStore: {
      findByChatOrWhatsapp: async () => ({
        id: 'lead-1',
        sessionId: 's1',
        name: 'Ana',
        whatsapp: '5511999999999',
        chatId: '5511999999999@s.whatsapp.net',
        status: 'novo',
        lastContact: null,
        nextContact: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        updatedAt: Date.now()
      }),
      update: async () => ({}) as any
    },
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({
          patch: { status: 'em_processo' },
          reason: 'Demonstrou interesse.'
        }),
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    }
  })

  await service.suggestFieldUpdatesAfterFollowUp('s1', '5511999999999@s.whatsapp.net', 'Posso te ajudar com mais detalhes.')

  assert.equal(persisted, 1)
})

test('suggestFieldUpdatesAfterFollowUp skips when follow-up is blocked', async () => {
  let persisted = 0
  const service = createService({
    configStore: {
      get: async () => ({
        training: {
          permitirSugestoesCamposLeadsClientes: true
        }
      })
    },
    optOutStore: {
      clearOptOut: async () => {},
      setOptOut: async () => {},
      isOptedOut: async () => true
    },
    suggestionStore: {
      upsertPending: async () => {
        persisted += 1
        return { id: 1 } as any
      }
    }
  })

  await service.suggestFieldUpdatesAfterFollowUp('s1', '5511999999999@s.whatsapp.net', 'Vou te ajudar.')

  assert.equal(persisted, 0)
})

