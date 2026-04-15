import assert from 'node:assert/strict'
import test from 'node:test'
import { AiMessageService } from '../src/ai/service'
import type { AiConfig } from '../src/ai/types'
import type { InboundMessageRow } from '../src/messages/store'
import type { InboundQueueItem } from '../src/messages/types'
import { MetricsStore } from '../src/observability/metrics'

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

function buildInboundRow(id: number, text = 'Oi'): InboundMessageRow {
  return {
    id,
    sessionId: 's1',
    chatId: 'c1',
    messageId: `m${id}`,
    fromMe: false,
    messageType: 'text',
    text,
    messageTimestampMs: Date.now()
  }
}

function buildInboundItem(inboundId: number): InboundQueueItem {
  return {
    sessionId: 's1',
    chatId: 'c1',
    inboundId,
    messageId: `m${inboundId}`,
    enqueuedAtMs: Date.now()
  }
}

function extractJsonPayloadFromMessages(messages: Array<{ role: string; content: string }>) {
  const userMessage = messages.find((entry) => entry.role === 'user')?.content ?? ''
  const start = userMessage.indexOf('{')
  const end = userMessage.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  try {
    return JSON.parse(userMessage.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

test('AiMessageService skips when inbound is superseded before AI call', async () => {
  const inbound = buildInboundRow(1)
  const latest = buildInboundRow(2)
  let skippedReason: string | null = null
  let aiCalled = false
  const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => latest,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => {
        throw new Error('should not enqueue')
      }
    } as any,
    configStore: {
      get: async () => null
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(1))

  assert.equal(skippedReason, 'superseded-pre')
  assert.equal(aiCalled, false)
})

test('AiMessageService skips when global enabled flag is false', async () => {
  const inbound = buildInboundRow(3, 'Oi')
  let aiCalled = false
  let enqueued = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => {
        enqueued = true
        return { id: 1 }
      }
    } as any,
    configStore: {
      get: async () => ({ enabled: false })
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(3))

  assert.equal(aiCalled, false)
  assert.equal(enqueued, false)
})

test('AiMessageService skips when inbound is superseded after AI call', async () => {
  const inbound = buildInboundRow(10)
  const superseding = buildInboundRow(11)
  let callCount = 0
  let skippedReason: string | null = null
  let aiCalled = false
  let sent = false
  const usage = { promptTokens: 12, completionTokens: 4, totalTokens: 16 }

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => {
        callCount += 1
        return callCount === 1 ? inbound : superseding
      },
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => {
        sent = true
        return { id: 123 }
      }
    } as any,
    configStore: {
      get: async () => null
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(10))

  assert.equal(aiCalled, true)
  assert.equal(sent, false)
  assert.equal(skippedReason, 'superseded-post')
})

test('AiMessageService includes timestamp metadata in model context messages', async () => {
  const inbound: InboundMessageRow = {
    id: 12,
    sessionId: 's1',
    chatId: 'c1',
    messageId: 'm12',
    fromMe: false,
    messageType: 'text',
    text: 'Oi com horario',
    messageTimestampMs: Date.UTC(2026, 1, 15, 14, 5, 0)
  }
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 55 })
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return { content: 'resposta', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(12))

  const userContext = capturedMessages.find(
    (entry) => entry.role === 'user' && entry.content.includes('Oi com horario')
  )
  assert.ok(userContext)
  assert.match(userContext!.content, /^\[MSG_TIME\] timestampMs=\d+ \| iso=\d{4}-\d{2}-\d{2}T/)
  assert.match(userContext!.content, /\| local=/)
  assert.match(userContext!.content, /\| fromMe=false/)
  assert.match(userContext!.content, /\| origin=inbound/)
  assert.match(userContext!.content, /\| actor=contact/)
  assert.match(userContext!.content, /\| channel=whatsapp_inbound/)
})

test('AiMessageService uses human_external metadata for fromMe history when chatService is unavailable', async () => {
  const inbound: InboundMessageRow = {
    id: 121,
    sessionId: 's1',
    chatId: 'c1',
    messageId: 'm121',
    fromMe: false,
    messageType: 'text',
    text: 'Mensagem atual do cliente',
    messageTimestampMs: Date.UTC(2026, 1, 15, 14, 8, 0)
  }
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => [
        {
          id: 999,
          sessionId: 's1',
          chatId: 'c1',
          messageId: 'm999',
          fromMe: true,
          messageType: 'text',
          text: 'Mensagem enviada no celular',
          messageTimestampMs: Date.UTC(2026, 1, 15, 14, 7, 0)
        }
      ]
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 57 })
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(121))

  const assistantContext = capturedMessages.find(
    (entry) => entry.role === 'assistant' && entry.content.includes('Mensagem enviada no celular')
  )
  assert.ok(assistantContext)
  assert.match(assistantContext!.content, /\| fromMe=true/)
  assert.match(assistantContext!.content, /\| origin=human_external/)
  assert.match(assistantContext!.content, /\| actor=human/)
  assert.match(assistantContext!.content, /\| channel=whatsapp_external/)
})

test('AiMessageService includes outbound delivery status in assistant context messages', async () => {
  const inbound: InboundMessageRow = {
    id: 13,
    sessionId: 's1',
    chatId: 'c1',
    messageId: 'm13',
    fromMe: false,
    messageType: 'text',
    text: 'E chegou?',
    messageTimestampMs: Date.UTC(2026, 1, 15, 14, 6, 0)
  }
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 56 })
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return { content: 'Sim, foi entregue.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:99',
          chatId: 'c1',
          text: 'Acabei de enviar seu comprovante.',
          type: 'text',
          timestampMs: Date.UTC(2026, 1, 15, 14, 5, 0),
          fromMe: true,
          messageId: 'wamid-99',
          status: 'delivered',
          origin: 'human_dashboard'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(13))

  const assistantContext = capturedMessages.find(
    (entry) => entry.role === 'assistant' && entry.content.includes('Acabei de enviar seu comprovante.')
  )
  assert.ok(assistantContext)
  assert.match(assistantContext!.content, /\| fromMe=true/)
  assert.match(assistantContext!.content, /\| origin=human_dashboard/)
  assert.match(assistantContext!.content, /\| actor=human/)
  assert.match(assistantContext!.content, /\| channel=autowhats_dashboard/)
  assert.match(assistantContext!.content, /\| status=delivered/)
})

test('AiMessageService blocks inbound when last two outbound messages are undelivered by delivery guard', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(14, 'Vocês receberam minha resposta?')
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  let aiCalled = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 88 })
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarIASeUltimasDuasMensagensNaoRecebidas: true
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:1',
          chatId: inbound.chatId,
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
          chatId: inbound.chatId,
          text: 'Mensagem 2',
          type: 'text',
          timestampMs: now - 7 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-2',
          status: 'sent',
          origin: 'human_dashboard'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(14))

  assert.equal(aiCalled, false)
  assert.equal(skippedReason, 'delivery-guard')
  assert.equal(disabledReason, 'delivery_guard')
})

test('AiMessageService does not block delivery guard when latest outbound has delivered/read or recent sent', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(15, 'Olá')

  for (const status of ['delivered', 'read', 'sent'] as const) {
    let aiCalled = false
    let disabledReason: string | null = null

    const service = new AiMessageService({
      inboundStore: {
        getById: async () => inbound,
        getLatestUserTextByChat: async () => inbound,
        listRecentByChat: async () => []
      } as any,
      outboundService: {
        enqueue: async () => ({ id: 89 })
      } as any,
      configStore: {
        get: async () => ({
          training: {
            desligarIASeUltimasDuasMensagensNaoRecebidas: true
          }
        })
      } as any,
      chatConfigStore: {
        get: async () => null,
        disable: async (_sessionId: string, _chatId: string, reason?: string) => {
          disabledReason = reason ?? null
          return {} as any
        }
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
        createChatCompletion: async () => {
          aiCalled = true
          return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
        }
      } as any,
      chatService: {
        listMessages: async () => [
          {
            id: 'outbound:10',
            chatId: inbound.chatId,
            text: 'Mensagem antiga',
            type: 'text',
            timestampMs: now - 9 * 60 * 1000,
            fromMe: true,
            messageId: 'wamid-10',
            status: 'failed',
            origin: 'ai'
          },
          {
            id: `outbound:${status}`,
            chatId: inbound.chatId,
            text: 'Mensagem recente',
            type: 'text',
            timestampMs: status === 'sent' ? now - 2 * 60 * 1000 : now - 6 * 60 * 1000,
            fromMe: true,
            messageId: `wamid-${status}`,
            status,
            origin: 'human_dashboard'
          }
        ]
      } as any,
      defaultConfig: baseConfig
    })

    await service.handleInbound(buildInboundItem(15))
    assert.equal(aiCalled, true, `expected AI to run for status ${status}`)
    assert.equal(disabledReason, null)
  }
})

test('AiMessageService blocks inbound when recent human activity exists in latest messages', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(16, 'Ainda esta por aqui?')
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  let aiCalled = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 90 })
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteUsarDias: false,
          desligarIASeHumanoRecenteUsarMensagens: true,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 3
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:ai',
          chatId: inbound.chatId,
          text: 'Mensagem da IA',
          type: 'text',
          timestampMs: now - 30 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-ai',
          status: 'delivered',
          origin: 'ai'
        },
        {
          id: 'outbound:human',
          chatId: inbound.chatId,
          text: 'Mensagem do atendente',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human',
          status: 'delivered',
          origin: 'human_dashboard'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(16))

  assert.equal(aiCalled, false)
  assert.equal(skippedReason, 'recent-human-activity')
  assert.equal(disabledReason, 'recent_human_activity')
})

test('AiMessageService blocks inbound when recent human activity exists within configured days', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(17, 'Qual e o valor hoje?')
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  let aiCalled = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 91 })
    } as any,
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
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:human-old',
          chatId: inbound.chatId,
          text: 'Mensagem humana dentro da janela de dias',
          type: 'text',
          timestampMs: now - 24 * 60 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human-old',
          status: 'delivered',
          origin: 'human_external'
        },
        {
          id: 'outbound:ai-1',
          chatId: inbound.chatId,
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
          chatId: inbound.chatId,
          text: 'Mensagem da IA 2',
          type: 'text',
          timestampMs: now - 30 * 1000,
          fromMe: true,
          messageId: 'wamid-ai-2',
          status: 'delivered',
          origin: 'ai'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(17))

  assert.equal(aiCalled, false)
  assert.equal(skippedReason, 'recent-human-activity')
  assert.equal(disabledReason, 'recent_human_activity')
})

test('AiMessageService keeps recent human guard active for legacy configs without child toggles', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(171, 'Ainda posso ajudar?')
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  let aiCalled = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 171 })
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 3
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:ai',
          chatId: inbound.chatId,
          text: 'Mensagem da IA',
          type: 'text',
          timestampMs: now - 30 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-ai',
          status: 'delivered',
          origin: 'ai'
        },
        {
          id: 'outbound:human',
          chatId: inbound.chatId,
          text: 'Mensagem do atendente',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human',
          status: 'delivered',
          origin: 'human_dashboard'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(171))

  assert.equal(aiCalled, false)
  assert.equal(skippedReason, 'recent-human-activity')
  assert.equal(disabledReason, 'recent_human_activity')
})

test('AiMessageService does not block by recent human activity when only AI or automation messages exist', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(18, 'Pode continuar?')
  let disabledReason: string | null = null
  let aiCalled = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 92 })
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 5
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:ai',
          chatId: inbound.chatId,
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
          chatId: inbound.chatId,
          text: 'Mensagem de automacao',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-automation',
          status: 'delivered',
          origin: 'automation_api'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(18))

  assert.equal(aiCalled, true)
  assert.equal(disabledReason, null)
})

test('AiMessageService does not block by recent human activity when parent is on but both criteria are off', async () => {
  const now = Date.now()
  const inbound = buildInboundRow(181, 'Pode continuar?')
  let disabledReason: string | null = null
  let aiCalled = false

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 181 })
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarIASeHumanoRecente: true,
          desligarIASeHumanoRecenteUsarDias: false,
          desligarIASeHumanoRecenteUsarMensagens: false,
          desligarIASeHumanoRecenteDias: 7,
          desligarIASeHumanoRecenteMensagens: 5
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:human',
          chatId: inbound.chatId,
          text: 'Mensagem do atendente',
          type: 'text',
          timestampMs: now - 2 * 60 * 1000,
          fromMe: true,
          messageId: 'wamid-human',
          status: 'delivered',
          origin: 'human_dashboard'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(181))

  assert.equal(aiCalled, true)
  assert.equal(disabledReason, null)
})

test('AiMessageService sends fallback and disables when out of context with encaminhar + desligar', async () => {
  const inbound = buildInboundRow(20)
  let sentText: string | null = null
  let markedSent: string | null = null
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 }

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText = text
        return { id: 321 }
      }
    } as any,
    configStore: {
      get: async () => ({
        training: { desligarMensagemForaContexto: true, comportamentoNaoSabe: 'encaminhar' }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
      createChatCompletion: async () => ({ content: 'N/A', usage })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(20))

  const expectedFallback =
    'Desculpe, não tenho essa informação no momento. Vou encaminhar sua conversa para um atendente humano que poderá te ajudar melhor!'
  assert.equal(sentText, expectedFallback)
  assert.equal(markedSent, expectedFallback)
  assert.equal(skippedReason, null)
  assert.equal(disabledReason, 'context')
})

test('AiMessageService uses custom handoff text when out of context with encaminhar + desligar', async () => {
  const inbound = buildInboundRow(25)
  let sentText: string | null = null
  let markedSent: string | null = null
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 }

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText = text
        return { id: 654 }
      }
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarMensagemForaContexto: true,
          comportamentoNaoSabe: 'encaminhar',
          mensagemEncaminharHumano: 'Vou passar o seu atendimento para um humano.'
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
      createChatCompletion: async () => ({ content: 'N/A', usage })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(25))

  const expectedFallback = 'Vou passar o seu atendimento para um humano.'
  assert.equal(sentText, expectedFallback)
  assert.equal(markedSent, expectedFallback)
  assert.equal(skippedReason, null)
  assert.equal(disabledReason, 'context')
})

test('AiMessageService uses personalized handoff text when enabled', async () => {
  const inbound = buildInboundRow(26)
  let sentText: string | null = null
  let markedSent: string | null = null
  let disabledReason: string | null = null
  let chatCalls = 0
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 }
  const usageEntries: Array<{ operation: string; referenceId?: string | null }> = []
  const metrics = new MetricsStore()

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText = text
        return { id: 777 }
      }
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarMensagemForaContexto: true,
          comportamentoNaoSabe: 'encaminhar',
          permitirIATextoPersonalizadoAoEncaminharHumano: true,
          mensagemEncaminharHumano: 'Fallback fixo.'
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
      createChatCompletion: async () => {
        chatCalls += 1
        if (chatCalls === 1) {
          return { content: 'N/A', usage }
        }
        return { content: 'Vou encaminhar seu atendimento para um humano agora.' , usage }
      }
    } as any,
    usageStore: {
      record: async (entry: any) => {
        usageEntries.push({
          operation: entry.operation,
          referenceId: entry.referenceId ?? null
        })
      }
    } as any,
    metrics,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(26))

  assert.equal(chatCalls, 2)
  assert.equal(sentText, 'Vou encaminhar seu atendimento para um humano agora.')
  assert.equal(markedSent, 'Vou encaminhar seu atendimento para um humano agora.')
  assert.equal(disabledReason, 'context')
  assert.equal(
    usageEntries.filter((entry) => entry.operation === 'handoff').length,
    1
  )
  assert.equal(metrics.getCounter('ai.handoff.personalized.used'), 1)
  assert.equal(metrics.getCounter('ai.handoff.personalized.fallback'), 0)
  assert.equal(metrics.getCounter('ai.handoff.personalized.failed'), 0)
})

test('AiMessageService falls back to fixed handoff text when personalized handoff is invalid', async () => {
  const inbound = buildInboundRow(27)
  let sentText: string | null = null
  let chatCalls = 0
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 }
  const usageEntries: string[] = []
  const metrics = new MetricsStore()

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText = text
        return { id: 778 }
      }
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarMensagemForaContexto: true,
          comportamentoNaoSabe: 'encaminhar',
          permitirIATextoPersonalizadoAoEncaminharHumano: true,
          mensagemEncaminharHumano: 'Fallback fixo.'
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async () => ({} as any)
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
      createChatCompletion: async () => {
        chatCalls += 1
        if (chatCalls === 1) {
          return { content: 'N/A', usage }
        }
        return { content: '[SEPARAR] Vou encaminhar [SEPARAR] para um humano', usage }
      }
    } as any,
    usageStore: {
      record: async (entry: any) => {
        usageEntries.push(entry.operation)
      }
    } as any,
    metrics,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(27))

  assert.equal(chatCalls, 2)
  assert.equal(sentText, 'Fallback fixo.')
  assert.deepEqual(usageEntries, ['response', 'handoff'])
  assert.equal(metrics.getCounter('ai.handoff.personalized.used'), 0)
  assert.equal(metrics.getCounter('ai.handoff.personalized.fallback'), 1)
  assert.equal(metrics.getCounter('ai.handoff.personalized.failed'), 0)
})

test('AiMessageService falls back to fixed handoff text when personalized handoff generation fails', async () => {
  const inbound = buildInboundRow(28)
  let sentText: string | null = null
  let chatCalls = 0
  const usage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 }
  const usageEntries: string[] = []
  const metrics = new MetricsStore()

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText = text
        return { id: 779 }
      }
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarMensagemForaContexto: true,
          comportamentoNaoSabe: 'encaminhar',
          permitirIATextoPersonalizadoAoEncaminharHumano: true,
          mensagemEncaminharHumano: 'Fallback fixo.'
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async () => ({} as any)
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
      createChatCompletion: async () => {
        chatCalls += 1
        if (chatCalls === 1) {
          return { content: 'N/A', usage }
        }
        throw new Error('handoff_down')
      }
    } as any,
    usageStore: {
      record: async (entry: any) => {
        usageEntries.push(entry.operation)
      }
    } as any,
    metrics,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(28))

  assert.equal(chatCalls, 2)
  assert.equal(sentText, 'Fallback fixo.')
  assert.deepEqual(usageEntries, ['response'])
  assert.equal(metrics.getCounter('ai.handoff.personalized.used'), 0)
  assert.equal(metrics.getCounter('ai.handoff.personalized.fallback'), 0)
  assert.equal(metrics.getCounter('ai.handoff.personalized.failed'), 1)
})

test('AiMessageService stays silent and disables when out of context with silencio + desligar', async () => {
  const inbound = buildInboundRow(30)
  let sent = false
  let markedSent = false
  let skippedReason: string | null = null
  let disabledReason: string | null = null
  let chatCalls = 0
  const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 }

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => {
        sent = true
        return { id: 456 }
      }
    } as any,
    configStore: {
      get: async () => ({
        training: {
          desligarMensagemForaContexto: true,
          comportamentoNaoSabe: 'silencio',
          permitirIATextoPersonalizadoAoEncaminharHumano: true
        }
      })
    } as any,
    chatConfigStore: {
      get: async () => null,
      disable: async (_sessionId: string, _chatId: string, reason?: string) => {
        disabledReason = reason ?? null
        return {} as any
      }
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
      markFailed: async () => {},
      markSent: async () => {
        markedSent = true
      }
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
      createChatCompletion: async () => {
        chatCalls += 1
        return { content: 'N/A', usage }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(30))

  assert.equal(sent, false)
  assert.equal(markedSent, false)
  assert.equal(skippedReason, 'out-of-context')
  assert.equal(disabledReason, 'context')
  assert.equal(chatCalls, 1)
})

test('AiMessageService skips when credits are insufficient', async () => {
  const inbound = buildInboundRow(40)
  let skippedReason: string | null = null
  let aiCalled = false
  const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 }

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
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
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      },
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
      createChatCompletion: async () => {
        aiCalled = true
        return { content: 'ok', usage }
      }
    } as any,
    creditsService: {
      canUse: async () => false
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(40))

  assert.equal(skippedReason, 'insufficient_credits')
  assert.equal(aiCalled, false)
})

test('AiMessageService persists field suggestion for lead when enabled', async () => {
  const inbound = buildInboundRow(50, 'Oi')
  let persisted: any = null
  let suggestionRequestPayload: Record<string, unknown> | null = null
  let leadUpdateCalls = 0
  let markAcceptedCalls = 0
  const usage = { promptTokens: 3, completionTokens: 2, totalTokens: 5 }

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        suggestionRequestPayload = extractJsonPayloadFromMessages(messages)
        return {
           content: JSON.stringify({
          patch: { status: 'em_processo', observations: 'Parece interessado em agendar' },
          reason: 'Demonstrou interesse e pediu detalhes.'
        }),
        usage
        }
      }
    } as any,
    suggestionStore: {
      upsertPending: async (input: any) => {
        persisted = input
        return {} as any
      },
      markAccepted: async () => {
        markAcceptedCalls += 1
        return {} as any
      }
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Ana',
        whatsapp: '5511999999999',
        chatId: inbound.chatId,
        status: 'novo',
        lastContact: null,
        nextContact: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        updatedAt: 123
      }),
      update: async () => {
        leadUpdateCalls += 1
        return {} as any
      }
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => null
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: {
      permitirSugestoesCamposLeadsClientes: true,
      aprovarAutomaticamenteSugestoesLeadsClientes: false,
      nomeEmpresa: 'Clinica Aurora',
      empresa: 'Clinica de estetica e bem-estar.',
      descricaoServicosProdutosVendidos:
        'Serviços/produtos:\nLimpeza de pele, botox e preenchimento.\n\nValores e preços:\nConsultas a partir de R$ 250.',
      orientacoesGerais: 'Priorize agendamento consultivo e linguagem humanizada.'
    }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Oi', timestampMs: Date.now() }],
    replyText: 'Claro! Qual horário você prefere?'
  })

  assert.ok(persisted)
  assert.equal(persisted.sessionId, inbound.sessionId)
  assert.equal(persisted.chatId, inbound.chatId)
  assert.equal(persisted.targetType, 'lead')
  assert.equal(persisted.targetId, inbound.chatId)
  assert.deepEqual(persisted.patch, {
    status: 'em_processo',
    observations: 'Parece interessado em agendar'
  })
  assert.ok(suggestionRequestPayload)
  const trainingContext = suggestionRequestPayload!.trainingContext as Record<string, unknown> | undefined
  assert.ok(trainingContext)
  assert.equal(trainingContext!.nomeEmpresa, 'Clinica Aurora')
  assert.equal(trainingContext!.empresa, 'Clinica de estetica e bem-estar.')
  assert.equal(
    trainingContext!.descricaoServicosProdutosVendidos,
    'Serviços/produtos:\nLimpeza de pele, botox e preenchimento.\n\nValores e preços:\nConsultas a partir de R$ 250.'
  )
  assert.equal(
    trainingContext!.orientacoesGerais,
    'Priorize agendamento consultivo e linguagem humanizada.'
  )
  const recentMessages = suggestionRequestPayload!.recentMessages as Array<Record<string, unknown>>
  assert.ok(Array.isArray(recentMessages))
  assert.equal(recentMessages[0]?.fromMe, false)
  assert.equal(recentMessages[0]?.origin, 'inbound')
  assert.equal(recentMessages[0]?.actor, 'contact')
  assert.equal(recentMessages[0]?.channel, 'whatsapp_inbound')
  assert.equal(leadUpdateCalls, 0)
  assert.equal(markAcceptedCalls, 0)
})

test('AiMessageService prefers client suggestion target over lead', async () => {
  const inbound = buildInboundRow(60, 'Oi')
  let persisted: any = null
  const usage = { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
  let leadLookup = 0

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({
          patch: { status: 'vip' },
          reason: 'Cliente com alto engajamento.'
        }),
        usage
      })
    } as any,
    suggestionStore: {
      upsertPending: async (input: any) => {
        persisted = input
        return {} as any
      }
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Carlos',
        whatsapp: '5511888888888',
        chatId: inbound.chatId,
        status: 'ativo',
        lastContactAt: null,
        nextContactAt: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        totalValue: null,
        lastPurchaseAt: null,
        updatedAt: 456
      })
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => {
        leadLookup += 1
        return null
      }
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: { permitirSugestoesCamposLeadsClientes: true }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Ok', timestampMs: Date.now() }],
    replyText: 'Perfeito!'
  })

  assert.ok(persisted)
  assert.equal(persisted.targetType, 'client')
  assert.equal(leadLookup, 0)
})

test('AiMessageService auto-approves lead suggestion when enabled', async () => {
  const inbound = buildInboundRow(61, 'Oi')
  const nextContactAt = Date.now() + 60_000
  let persisted: any = null
  let leadUpdate: any = null
  let accepted: any = null

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({
          patch: {
            status: 'em_processo',
            observations: 'Solicitou retorno',
            nextContactAt
          },
          reason: 'Solicitou acompanhamento.'
        }),
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
      })
    } as any,
    suggestionStore: {
      upsertPending: async (input: any) => {
        persisted = input
        return { id: 700 } as any
      },
      markAccepted: async (_sessionId: string, suggestionId: number, patch: any, decision: any) => {
        accepted = { suggestionId, patch, decision }
        return { id: suggestionId, status: 'accepted' } as any
      }
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Ana',
        whatsapp: '5511999999999',
        chatId: inbound.chatId,
        status: 'novo',
        lastContact: null,
        nextContact: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        updatedAt: 123
      }),
      update: async (_sessionId: string, _leadId: string, update: any) => {
        leadUpdate = update
        return { id: inbound.chatId } as any
      }
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => null
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: {
      permitirSugestoesCamposLeadsClientes: true,
      aprovarAutomaticamenteSugestoesLeadsClientes: true
    }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Oi', timestampMs: Date.now() }],
    replyText: 'Posso te ajudar com isso agora.'
  })

  assert.ok(persisted)
  assert.deepEqual(persisted.patch, {
    status: 'em_processo',
    observations: 'Solicitou retorno',
    nextContactAt
  })
  assert.deepEqual(leadUpdate, {
    status: 'em_processo',
    nextContact: nextContactAt,
    observations: 'Solicitou retorno'
  })
  assert.deepEqual(accepted, {
    suggestionId: 700,
    patch: {
      status: 'em_processo',
      observations: 'Solicitou retorno',
      nextContactAt
    },
    decision: {
      source: 'automatic',
      actorRole: 'system',
      actorUid: null
    }
  })
})

test('AiMessageService auto-approves client suggestion when enabled', async () => {
  const inbound = buildInboundRow(62, 'Oi')
  const nextContactAt = Date.now() + 120_000
  let clientUpdate: any = null
  let accepted: any = null

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({
          patch: {
            status: 'vip',
            observations: 'Cliente recorrente',
            nextContactAt
          },
          reason: 'Tem alta intenção de compra.'
        }),
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
      })
    } as any,
    suggestionStore: {
      upsertPending: async () => ({ id: 701 } as any),
      markAccepted: async (_sessionId: string, suggestionId: number, patch: any, decision: any) => {
        accepted = { suggestionId, patch, decision }
        return { id: suggestionId, status: 'accepted' } as any
      }
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Carlos',
        whatsapp: '5511888888888',
        chatId: inbound.chatId,
        status: 'ativo',
        lastContactAt: null,
        nextContactAt: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        totalValue: null,
        lastPurchaseAt: null,
        updatedAt: 456
      }),
      update: async (_sessionId: string, _clientId: string, update: any) => {
        clientUpdate = update
        return { id: inbound.chatId } as any
      }
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => null
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: {
      permitirSugestoesCamposLeadsClientes: true,
      aprovarAutomaticamenteSugestoesLeadsClientes: true
    }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Oi', timestampMs: Date.now() }],
    replyText: 'Perfeito, vou te passar os próximos passos.'
  })

  assert.deepEqual(clientUpdate, {
    status: 'vip',
    nextContactAt,
    observations: 'Cliente recorrente'
  })
  assert.deepEqual(accepted, {
    suggestionId: 701,
    patch: {
      status: 'vip',
      observations: 'Cliente recorrente',
      nextContactAt
    },
    decision: {
      source: 'automatic',
      actorRole: 'system',
      actorUid: null
    }
  })
})

test('AiMessageService keeps suggestion pending when auto-approve target update fails', async () => {
  const inbound = buildInboundRow(63, 'Oi')
  let persisted = 0
  let markAccepted = 0

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({
          patch: { status: 'em_processo' },
          reason: 'Há interesse.'
        }),
        usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 }
      })
    } as any,
    suggestionStore: {
      upsertPending: async () => {
        persisted += 1
        return { id: 702 } as any
      },
      markAccepted: async () => {
        markAccepted += 1
        return { id: 702 } as any
      }
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Ana',
        whatsapp: '5511999999999',
        chatId: inbound.chatId,
        status: 'novo',
        lastContact: null,
        nextContact: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        updatedAt: 123
      }),
      update: async () => null
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => null
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: {
      permitirSugestoesCamposLeadsClientes: true,
      aprovarAutomaticamenteSugestoesLeadsClientes: true
    }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Oi', timestampMs: Date.now() }],
    replyText: 'Posso te enviar mais detalhes.'
  })

  assert.equal(persisted, 1)
  assert.equal(markAccepted, 0)
})

test('AiMessageService skips persisting suggestions when reply is not JSON', async () => {
  const inbound = buildInboundRow(70, 'Oi')
  let called = 0

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({ content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
    } as any,
    suggestionStore: {
      upsertPending: async () => {
        called += 1
        return {} as any
      }
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Sem nome',
        whatsapp: null,
        chatId: inbound.chatId,
        status: 'novo',
        lastContact: null,
        nextContact: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        updatedAt: 0
      })
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: { permitirSugestoesCamposLeadsClientes: true }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Oi', timestampMs: Date.now() }],
    replyText: 'Olá!'
  })

  assert.equal(called, 0)
})

test('AiMessageService ignores file directives when toggle is off', async () => {
  const inbound = buildInboundRow(100, 'Quero o catálogo')
  const sentText: string[] = []
  const sentMedia: any[] = []
  let markedSent: string | null = null

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText.push(text)
        return { id: 1 }
      },
      enqueueMedia: async (payload: any) => {
        sentMedia.push(payload)
        return { id: 2 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: false } })
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
        content:
          'Perfeito. Vou te mandar o catálogo.\n\n[ENVIAR_ARQUIVO:f1]\n[ENVIAR_ARQUIVO:f2]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(100))

  assert.deepEqual(sentText, ['Perfeito. Vou te mandar o catálogo.'])
  assert.equal(sentMedia.length, 0)
  assert.equal(markedSent, 'Perfeito. Vou te mandar o catálogo.')
})

test('AiMessageService enqueues multiple media when directives are present and toggle is on', async () => {
  const inbound = buildInboundRow(110, 'Me manda o catálogo e um áudio')
  const sent: Array<{ kind: 'text' | 'media'; value: any }> = []

  const files = [
    {
      id: 'f1',
      nome: 'Catalogo',
      descricao: 'Catalogo completo de servicos.',
      quandoUsar: 'catalogo',
      tipo: 'image',
      mimeType: 'image/png',
      sizeBytes: 123,
      downloadUrl: 'https://example.com/catalogo.png',
      storagePath: '',
      updatedAtMs: 1700000000000
    },
    {
      id: 'f2',
      nome: 'Audio',
      descricao: 'Audio institucional.',
      quandoUsar: 'audio',
      tipo: 'audio',
      mimeType: 'audio/mpeg',
      sizeBytes: 456,
      downloadUrl: 'https://example.com/audio.mp3',
      storagePath: '',
      updatedAtMs: 1700000001000
    }
  ]

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sent.push({ kind: 'text', value: text })
        return { id: 10 }
      },
      enqueueMedia: async (payload: any) => {
        sent.push({ kind: 'media', value: payload })
        return { id: 11 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
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
        content: 'Claro.\n\n[ENVIAR_ARQUIVO:f1]\n[ENVIAR_ARQUIVO:f2]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    fileLibrary: {
      list: async () => files,
      get: async (_sessionId: string, fileId: string) => files.find((f) => f.id === fileId) ?? null
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(110))

  assert.equal(sent.length, 3)
  assert.deepEqual(sent[0], { kind: 'text', value: 'Claro.' })
  assert.equal(sent[1].kind, 'media')
  assert.equal(sent[1].value.mediaType, 'imageMessage')
  assert.equal(sent[1].value.url, 'https://example.com/catalogo.png')
  assert.deepEqual(sent[1].value.aiFile, {
    id: 'f1',
    nome: 'Catalogo',
    tipo: 'image',
    mimeType: 'image/png',
    sizeBytes: 123,
    descricao: 'Catalogo completo de servicos.',
    quandoUsar: 'catalogo',
    updatedAtMs: 1700000000000
  })
  assert.equal(sent[2].kind, 'media')
  assert.equal(sent[2].value.mediaType, 'audioMessage')
  assert.equal(sent[2].value.url, 'https://example.com/audio.mp3')
  assert.deepEqual(sent[2].value.aiFile, {
    id: 'f2',
    nome: 'Audio',
    tipo: 'audio',
    mimeType: 'audio/mpeg',
    sizeBytes: 456,
    descricao: 'Audio institucional.',
    quandoUsar: 'audio',
    updatedAtMs: 1700000001000
  })
})

test('AiMessageService sends PDFs as documentMessage when file tipo is document', async () => {
  const inbound = buildInboundRow(115, 'Me manda o PDF')
  const sent: Array<{ kind: 'text' | 'media'; value: any }> = []

  const files = [
    {
      id: 'f1',
      nome: 'Tabela de Precos',
      descricao: 'Tabela atualizada dos valores.',
      quandoUsar: 'precos',
      tipo: 'document',
      mimeType: 'application/pdf',
      sizeBytes: 123,
      downloadUrl: 'https://example.com/tabela.pdf',
      storagePath: '',
      updatedAtMs: 1700000002000
    }
  ]

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sent.push({ kind: 'text', value: text })
        return { id: 10 }
      },
      enqueueMedia: async (payload: any) => {
        sent.push({ kind: 'media', value: payload })
        return { id: 11 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
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
        content: 'Segue.\n\n[ENVIAR_ARQUIVO:f1]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    fileLibrary: {
      list: async () => files,
      get: async (_sessionId: string, fileId: string) => files.find((f) => f.id === fileId) ?? null
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(115))

  assert.equal(sent.length, 2)
  assert.deepEqual(sent[0], { kind: 'text', value: 'Segue.' })
  assert.equal(sent[1].kind, 'media')
  assert.equal(sent[1].value.mediaType, 'documentMessage')
  assert.equal(sent[1].value.url, 'https://example.com/tabela.pdf')
  assert.equal(sent[1].value.mimeType, 'application/pdf')
  assert.equal(sent[1].value.fileName, 'Tabela de Precos.pdf')
  assert.deepEqual(sent[1].value.aiFile, {
    id: 'f1',
    nome: 'Tabela de Precos',
    tipo: 'document',
    mimeType: 'application/pdf',
    sizeBytes: 123,
    descricao: 'Tabela atualizada dos valores.',
    quandoUsar: 'precos',
    updatedAtMs: 1700000002000
  })
})

test('AiMessageService truncates media directives beyond MAX_FILES_PER_AI_REPLY', async () => {
  const inbound = buildInboundRow(120, 'Manda todos os arquivos')
  const mediaCalls: any[] = []

  const files = Array.from({ length: 5 }).map((_, idx) => ({
    id: `f${idx + 1}`,
    nome: `File ${idx + 1}`,
    descricao: '',
    quandoUsar: 'x',
    tipo: 'image',
    mimeType: 'image/png',
    sizeBytes: 100,
    downloadUrl: `https://example.com/${idx + 1}.png`,
    storagePath: '',
    updatedAtMs: null
  }))

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 1 }),
      enqueueMedia: async (payload: any) => {
        mediaCalls.push(payload)
        return { id: mediaCalls.length + 1 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
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
        content: 'Ok.\n' + files.map((f) => `[ENVIAR_ARQUIVO:${f.id}]`).join('\n') + '\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    fileLibrary: {
      list: async () => files,
      get: async (_sessionId: string, fileId: string) => files.find((f) => f.id === fileId) ?? null
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(120))

  assert.equal(mediaCalls.length, 3)
  assert.equal(mediaCalls[0].url, 'https://example.com/1.png')
  assert.equal(mediaCalls[1].url, 'https://example.com/2.png')
  assert.equal(mediaCalls[2].url, 'https://example.com/3.png')
})

test('AiMessageService preserves inline text and file order in automatic replies', async () => {
  const inbound = buildInboundRow(121, 'Me explique melhor')
  const sent: Array<{ kind: 'text' | 'media'; value: any }> = []
  const contextEntries: string[] = []
  let markedSent: string | null = null

  const files = [
    {
      id: 'audio-1',
      nome: 'Audio Explicativo',
      descricao: 'Audio com explicacao do servico.',
      quandoUsar: 'explicacao do servico',
      tipo: 'audio',
      mimeType: 'audio/mpeg',
      sizeBytes: 456,
      downloadUrl: 'https://example.com/audio.mp3',
      storagePath: '',
      updatedAtMs: 1700000001000
    },
    {
      id: 'image-1',
      nome: 'Antes e Depois',
      descricao: 'Foto de antes e depois.',
      quandoUsar: 'resultado visual',
      tipo: 'image',
      mimeType: 'image/jpeg',
      sizeBytes: 789,
      downloadUrl: 'https://example.com/antes-depois.jpg',
      storagePath: '',
      updatedAtMs: 1700000002000
    }
  ]

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sent.push({ kind: 'text', value: text })
        return { id: sent.length }
      },
      enqueueMedia: async (payload: any) => {
        sent.push({ kind: 'media', value: payload })
        return { id: sent.length }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
    } as any,
    contextCache: {
      appendMessage: async (_sessionId: string, _chatId: string, entry: { text: string }) => {
        contextEntries.push(entry.text)
      }
    } as any,
    optOutStore: {
      clearOptOut: async () => {},
      setOptOut: async () => {},
      isOptedOut: async () => false
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content:
          'Mensagem 1\n' +
          '[SEPARAR]\n' +
          'Mensagem 2\n' +
          '[ENVIAR_ARQUIVO:audio-1]\n' +
          'Mensagem 4\n' +
          '[ENVIAR_ARQUIVO:image-1]\n' +
          'Mensagem 6\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    fileLibrary: {
      list: async () => files,
      get: async (_sessionId: string, fileId: string) => files.find((file) => file.id === fileId) ?? null
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(121))

  assert.deepEqual(sent, [
    { kind: 'text', value: 'Mensagem 1' },
    { kind: 'text', value: 'Mensagem 2' },
    {
      kind: 'media',
      value: {
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        mediaType: 'audioMessage',
        url: 'https://example.com/audio.mp3',
        mimeType: 'audio/mpeg',
        fileName: undefined,
        aiFile: {
          id: 'audio-1',
          nome: 'Audio Explicativo',
          tipo: 'audio',
          mimeType: 'audio/mpeg',
          sizeBytes: 456,
          descricao: 'Audio com explicacao do servico.',
          quandoUsar: 'explicacao do servico',
          updatedAtMs: 1700000001000
        },
        idempotencyKey: 'ai:121:step:2',
        origin: 'ai'
      }
    },
    { kind: 'text', value: 'Mensagem 4' },
    {
      kind: 'media',
      value: {
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        mediaType: 'imageMessage',
        url: 'https://example.com/antes-depois.jpg',
        mimeType: 'image/jpeg',
        fileName: undefined,
        aiFile: {
          id: 'image-1',
          nome: 'Antes e Depois',
          tipo: 'image',
          mimeType: 'image/jpeg',
          sizeBytes: 789,
          descricao: 'Foto de antes e depois.',
          quandoUsar: 'resultado visual',
          updatedAtMs: 1700000002000
        },
        idempotencyKey: 'ai:121:step:4',
        origin: 'ai'
      }
    },
    { kind: 'text', value: 'Mensagem 6' }
  ])
  assert.deepEqual(contextEntries, [
    'Mensagem 1',
    'Mensagem 2',
    '[Arquivo enviado: Audio Explicativo]',
    'Mensagem 4',
    '[Arquivo enviado: Antes e Depois]',
    'Mensagem 6'
  ])
  assert.equal(
    markedSent,
    'Mensagem 1\n\nMensagem 2\n\n[Arquivo enviado: Audio Explicativo]\n\nMensagem 4\n\n[Arquivo enviado: Antes e Depois]\n\nMensagem 6'
  )
})

test('AiMessageService skips missing inline files without aborting the remaining reply', async () => {
  const inbound = buildInboundRow(122, 'Quero detalhes')
  const sentText: string[] = []
  const sentMedia: any[] = []
  let markedSent: string | null = null

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText.push(text)
        return { id: sentText.length }
      },
      enqueueMedia: async (payload: any) => {
        sentMedia.push(payload)
        return { id: sentText.length + sentMedia.length }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
        content: 'Texto antes\n[ENVIAR_ARQUIVO:file-inexistente]\nTexto depois\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    fileLibrary: {
      list: async () => [],
      get: async () => null
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(122))

  assert.deepEqual(sentText, ['Texto antes', 'Texto depois'])
  assert.equal(sentMedia.length, 0)
  assert.equal(markedSent, 'Texto antes\n\nTexto depois')
})

test('AiMessageService ignores contact directives when toggle is off', async () => {
  const inbound = buildInboundRow(125, 'Me passa contato')
  const sentText: string[] = []
  const sentContacts: any[] = []
  let markedSent: string | null = null

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText.push(text)
        return { id: 1 }
      },
      enqueueContact: async (payload: any) => {
        sentContacts.push(payload)
        return { id: 2 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: false } })
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
        content: 'Segue o contato.\n\n[ENVIAR_CONTATO:Comercial|5511988887777]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(125))

  assert.deepEqual(sentText, ['Segue o contato.'])
  assert.equal(sentContacts.length, 0)
  assert.equal(markedSent, 'Segue o contato.')
})

test('AiMessageService enqueues contacts when directives are present and toggle is on', async () => {
  const inbound = buildInboundRow(126, 'Me passa os contatos')
  const sent: Array<{ kind: 'text' | 'contact'; value: any }> = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sent.push({ kind: 'text', value: text })
        return { id: 1 }
      },
      enqueueContact: async (payload: any) => {
        sent.push({ kind: 'contact', value: payload })
        return { id: sent.length + 1 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
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
        content:
          'Claro.\n\n[ENVIAR_CONTATO:Comercial|5511988887777]\n[ENVIAR_CONTATO:Suporte|+55 (11) 97777-6666]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(126))

  assert.equal(sent.length, 3)
  assert.deepEqual(sent[0], { kind: 'text', value: 'Claro.' })
  assert.equal(sent[1].kind, 'contact')
  assert.deepEqual(sent[1].value.contacts, [{ name: 'Comercial', whatsapp: '5511988887777' }])
  assert.equal(sent[2].kind, 'contact')
  assert.deepEqual(sent[2].value.contacts, [{ name: 'Suporte', whatsapp: '5511977776666' }])
})

test('AiMessageService stores synthetic response when only contacts are sent', async () => {
  const inbound = buildInboundRow(127, 'Contato')
  const contactCalls: any[] = []
  let markedSent: string | null = null

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 1 }),
      enqueueContact: async (payload: any) => {
        contactCalls.push(payload)
        return { id: contactCalls.length + 1 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
    } as any,
    responseStore: {
      tryStart: async () => true,
      markSkipped: async () => {},
      markFailed: async () => {},
      markSent: async (_id: number, response: string) => {
        markedSent = response
      }
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
        content: '[ENVIAR_CONTATO:Comercial|5511988887777]\n[ENVIAR_CONTATO:Suporte|5511977776666]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(127))

  assert.equal(contactCalls.length, 2)
  assert.equal(markedSent, '[Contatos enviados: 2]')
})

test('AiMessageService truncates contact directives beyond the limit', async () => {
  const inbound = buildInboundRow(128, 'Contatos')
  const contactCalls: any[] = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 1 }),
      enqueueContact: async (payload: any) => {
        contactCalls.push(payload)
        return { id: contactCalls.length + 1 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAEnviarArquivos: true } })
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
        content:
          'Ok.\n' +
          '[ENVIAR_CONTATO:A|5511000000001]\n' +
          '[ENVIAR_CONTATO:B|5511000000002]\n' +
          '[ENVIAR_CONTATO:C|5511000000003]\n' +
          '[ENVIAR_CONTATO:D|5511000000004]\n',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(128))

  assert.equal(contactCalls.length, 3)
  assert.deepEqual(
    contactCalls.map((call) => call.contacts[0].name),
    ['A', 'B', 'C']
  )
})

test('AiMessageService injects AI file metadata into context without exposing URL', async () => {
  const inbound = buildInboundRow(130, 'Que arquivo voce enviou?')
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return { content: 'Enviei o material agora.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'outbound:1',
          chatId: inbound.chatId,
          text: null,
          type: 'documentMessage',
          timestampMs: Date.now() - 1000,
          fromMe: true,
          messageId: 'wamid-1',
          origin: 'ai',
          media: {
            mediaType: 'documentMessage',
            fileName: 'Tabela de Precos.pdf',
            mimeType: 'application/pdf',
            aiFile: {
              id: 'file-1',
              nome: 'Tabela de Precos',
              tipo: 'document',
              mimeType: 'application/pdf',
              sizeBytes: 2048,
              descricao: 'Arquivo com todos os valores atualizados.',
              quandoUsar: 'Sempre que o usuario pedir preco.',
              updatedAtMs: 1700000003000
            },
            url: 'https://private.example.com/secret.pdf'
          }
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(130))

  const assistantHistory = capturedMessages.find(
    (entry) => entry.role === 'assistant' && entry.content.includes('[ARQUIVO_IA_ENVIADO]')
  )
  assert.ok(assistantHistory)
  assert.match(assistantHistory!.content, /id=file-1/)
  assert.match(assistantHistory!.content, /nome=Tabela de Precos/)
  assert.match(assistantHistory!.content, /tipo=document/)
  assert.match(assistantHistory!.content, /mime=application\/pdf/)
  assert.match(assistantHistory!.content, /tamanhoBytes=2048/)
  assert.match(assistantHistory!.content, /descricao=Arquivo com todos os valores atualizados\./)
  assert.match(assistantHistory!.content, /quandoUsar=Sempre que o usuario pedir preco\./)
  assert.match(assistantHistory!.content, /\| fromMe=true/)
  assert.match(assistantHistory!.content, /\| origin=ai/)
  assert.match(assistantHistory!.content, /\| actor=ai/)
  assert.match(assistantHistory!.content, /\| channel=autowhats_ai/)
  assert.ok(!assistantHistory!.content.includes('https://private.example.com/secret.pdf'))
})

test('AiMessageService falls back to message type summary when assistant media metadata is missing', async () => {
  const inbound = buildInboundRow(131, 'Qual arquivo voce enviou?')
  let capturedMessages: Array<{ role: string; content: string }> = []

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedMessages = messages
        return { content: 'Ja te expliquei acima.', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    chatService: {
      listMessages: async () => [
        {
          id: 'inbound:1',
          chatId: inbound.chatId,
          text: null,
          type: 'documentMessage',
          timestampMs: Date.now() - 1000,
          fromMe: true,
          messageId: 'wamid-legacy',
          origin: 'human_dashboard'
        }
      ]
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(131))

  const assistantHistory = capturedMessages.find(
    (entry) => entry.role === 'assistant' && entry.content.includes('[MIDIA_ENVIADA]')
  )
  assert.ok(assistantHistory)
  assert.match(assistantHistory!.content, /tipo=document/)
  assert.ok(assistantHistory!.content.trim().length > 0)
})

test('AiMessageService skips persisting suggestions when patch is unchanged', async () => {
  const inbound = buildInboundRow(80, 'Oi')
  let called = 0
  const usage = { promptTokens: 2, completionTokens: 1, totalTokens: 3 }

  const service = new AiMessageService({
    inboundStore: {} as any,
    outboundService: {} as any,
    configStore: {} as any,
    responseStore: {} as any,
    contextCache: {} as any,
    optOutStore: {} as any,
    openAiClient: {
      isConfigured: () => true,
      createChatCompletion: async () => ({
        content: JSON.stringify({ patch: { status: 'novo' }, reason: 'Nada a atualizar.' }),
        usage
      })
    } as any,
    suggestionStore: {
      upsertPending: async () => {
        called += 1
        return {} as any
      }
    } as any,
    leadStore: {
      findByChatOrWhatsapp: async () => ({
        id: inbound.chatId,
        sessionId: inbound.sessionId,
        name: 'Sem nome',
        whatsapp: null,
        chatId: inbound.chatId,
        status: 'novo',
        lastContact: null,
        nextContact: null,
        observations: null,
        createdAt: null,
        lastMessage: null,
        source: 'whatsapp',
        updatedAt: 0
      })
    } as any,
    defaultConfig: baseConfig
  })

  const config: AiConfig = {
    ...baseConfig,
    training: { permitirSugestoesCamposLeadsClientes: true }
  }

  await (service as any).maybeSuggestFieldUpdates({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    config,
    context: [{ role: 'user', text: 'Oi', timestampMs: Date.now() }],
    replyText: 'Olá!'
  })

  assert.equal(called, 0)
})

test('AiMessageService uses agenda tools when usarAgendaAutomatica is enabled', async () => {
  const inbound = buildInboundRow(200, 'Quero agendar')
  let sentText: string | null = null
  let toolCallRequests = 0
  let listAgendasCalls = 0

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async ({ text }: { text: string }) => {
        sentText = text
        return { id: 999 }
      }
    } as any,
    configStore: {
      get: async () => ({ training: { usarAgendaAutomatica: true } })
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
      createChatCompletion: async () => {
        throw new Error('should not call createChatCompletion')
      },
      createChatCompletionWithTools: async () => {
        toolCallRequests += 1
        if (toolCallRequests === 1) {
          return {
            type: 'tool_calls',
            content: '',
            toolCalls: [{ id: 't1', name: 'list_agendas', argumentsJson: '{}' }]
          }
        }
        return { type: 'final', content: 'Agendado!' }
      }
    } as any,
    agendaStore: {
      listAgendas: async () => {
        listAgendasCalls += 1
        return [
          {
            id: 'ag1',
            name: 'Agenda 1',
            color: '#000',
            order: 0,
            createdAtMs: null,
            availableHours: {
              1: { enabled: true, timeSlots: [{ start: '09:00', end: '10:00' }] }
            }
          }
        ]
      },
      listAppointmentsByDay: async () => [],
      createAppointment: async () => ({ id: 'apt1' })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildInboundItem(200))

  assert.equal(sentText, 'Agendado!')
  assert.equal(toolCallRequests, 2)
  assert.equal(listAgendasCalls, 1)
})

test('AiMessageService injects FindmyAngel context into system prompt when enabled for target session', async () => {
  const inbound: InboundMessageRow = {
    id: 1000,
    sessionId: 'findmyangel-session',
    chatId: '5511999999999@s.whatsapp.net',
    messageId: 'm1000',
    fromMe: false,
    messageType: 'text',
    text: 'Quantos tokens eu tenho?',
    messageTimestampMs: Date.now()
  }

  let capturedSystemPrompt: string | null = null

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedSystemPrompt = messages.find((m) => m.role === 'system')?.content ?? null
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    findmyangelContextProvider: {
      isEnabledForSession: (sessionId: string) => sessionId === 'findmyangel-session',
      truncateForPrompt: (payload: any) => payload,
      getForChat: async () => ({
        success: true,
        version: 'v1',
        hasAccount: true,
        tokens: { balance: 123 },
        subscription: { status: 'active', planType: 'Premium' },
        profileFields: { filled: ['email'], missing: ['bio'] },
        fetchedAtMs: 1
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    messageId: inbound.messageId,
    enqueuedAtMs: Date.now()
  })

  assert.ok(capturedSystemPrompt)
  assert.match(capturedSystemPrompt!, /DADOS FINDMYANGEL \(JSON\):/i)
  assert.match(capturedSystemPrompt!, /"balance"\s*:\s*123/)
  assert.match(capturedSystemPrompt!, /"status"\s*:\s*"active"/)
})

test('AiMessageService injects hasAccount=false FindmyAngel context so AI can orient signup', async () => {
  const inbound: InboundMessageRow = {
    id: 1001,
    sessionId: 'findmyangel-session',
    chatId: '5511888888888@s.whatsapp.net',
    messageId: 'm1001',
    fromMe: false,
    messageType: 'text',
    text: 'Quero usar o app',
    messageTimestampMs: Date.now()
  }

  let capturedSystemPrompt: string | null = null

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 2 })
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
      createChatCompletion: async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
        capturedSystemPrompt = messages.find((m) => m.role === 'system')?.content ?? null
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    findmyangelContextProvider: {
      isEnabledForSession: (sessionId: string) => sessionId === 'findmyangel-session',
      truncateForPrompt: (payload: any) => payload,
      getForChat: async () => ({
        success: true,
        version: 'v1',
        hasAccount: false,
        fetchedAtMs: 1
      })
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    messageId: inbound.messageId,
    enqueuedAtMs: Date.now()
  })

  assert.ok(capturedSystemPrompt)
  assert.match(capturedSystemPrompt!, /"hasAccount"\s*:\s*false/)
})

test('AiMessageService does not call FindmyAngel context provider for group chats', async () => {
  const inbound: InboundMessageRow = {
    id: 1002,
    sessionId: 'findmyangel-session',
    chatId: '123@g.us',
    messageId: 'm1002',
    fromMe: false,
    messageType: 'text',
    text: 'Oi',
    messageTimestampMs: Date.now()
  }

  let contextCalls = 0
  let aiCalls = 0

  const service = new AiMessageService({
    inboundStore: {
      getById: async () => inbound,
      getLatestUserTextByChat: async () => inbound,
      listRecentByChat: async () => []
    } as any,
    outboundService: {
      enqueue: async () => ({ id: 3 })
    } as any,
    configStore: {
      get: async () => ({ respondInGroups: true })
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
      createChatCompletion: async () => {
        aiCalls += 1
        return { content: 'ok', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }
      }
    } as any,
    findmyangelContextProvider: {
      isEnabledForSession: () => true,
      truncateForPrompt: (payload: any) => payload,
      getForChat: async () => {
        contextCalls += 1
        return { success: true, version: 'v1', hasAccount: true, fetchedAtMs: 1 }
      }
    } as any,
    defaultConfig: { ...baseConfig, respondInGroups: true }
  })

  await service.handleInbound({
    sessionId: inbound.sessionId,
    chatId: inbound.chatId,
    inboundId: inbound.id,
    messageId: inbound.messageId,
    enqueuedAtMs: Date.now()
  })

  assert.equal(contextCalls, 0)
  assert.equal(aiCalls, 1)
})
