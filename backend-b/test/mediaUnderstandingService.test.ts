import assert from 'node:assert/strict'
import test from 'node:test'
import { MediaUnderstandingService } from '../src/ai/mediaUnderstandingService'
import type { AiConfig } from '../src/ai/types'
import type { InboundMessageRow } from '../src/messages/store'
import type { InboundQueueItem } from '../src/messages/types'

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

function buildInboundRow(
  id: number,
  messageType: 'imageMessage' | 'documentMessage',
  overrides: Partial<InboundMessageRow> = {}
): InboundMessageRow {
  return {
    id,
    sessionId: 's1',
    chatId: '5511999999999@s.whatsapp.net',
    messageId: `m${id}`,
    fromMe: false,
    messageType,
    text: null,
    messageTimestampMs: Date.now(),
    ...overrides
  }
}

function buildItem(inboundId: number): InboundQueueItem {
  return {
    sessionId: 's1',
    chatId: '5511999999999@s.whatsapp.net',
    inboundId,
    messageId: `m${inboundId}`,
    enqueuedAtMs: Date.now()
  }
}

function buildImageRawPayload() {
  return {
    message: {
      imageMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        mimetype: 'image/jpeg'
      }
    }
  }
}

function buildDocumentRawPayload(mimeType: string, fileName: string) {
  return {
    message: {
      documentMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        mimetype: mimeType,
        fileName
      }
    }
  }
}

test('MediaUnderstandingService analyzes image, bills, and enqueues for AI', async () => {
  const inbound = buildInboundRow(10, 'imageMessage')
  const rawPayload = buildImageRawPayload()
  let updatedText: string | null = null
  let enqueued: any = null
  let usageRecorded: any = null
  let consumed: { amountBrl: number; meta: any } | null = null
  let markedDone = false

  const service = new MediaUnderstandingService({
    enabled: true,
    maxBytes: 20_000_000,
    maxPdfPages: 10,
    model: 'gpt-4o-mini',
    aiQueue: {
      enqueue: async (item: any) => {
        enqueued = item
      }
    } as any,
    inboundStore: {
      getById: async () => inbound,
      getRawPayloadById: async () => rawPayload,
      getLatestUserImageOrPdfByChat: async () => ({ id: inbound.id }),
      updateTextById: async (_id: number, text: string) => {
        updatedText = text
      }
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIALerImagensEPdfs: true } })
    } as any,
    understandingStore: {
      tryStart: async () => true,
      markDone: async () => {
        markedDone = true
      },
      markSkipped: async () => {},
      markFailed: async () => {}
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createMultimodalCompletion: async () => ({
        content: JSON.stringify({
          summary: 'Comprovante de pagamento identificado',
          highlights: ['Valor R$ 150,00'],
          entities: [{ name: 'valor', value: 'R$ 150,00' }]
        }),
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
      })
    } as any,
    systemSettings: {
      getAiPricing: () => ({
        models: {
          'gpt-4o-mini': { inputUsdPerM: 1, outputUsdPerM: 2 }
        }
      }),
      getUsdBrlRate: () => 5
    } as any,
    usageStore: {
      record: async (entry: any) => {
        usageRecorded = entry
      }
    } as any,
    creditsService: {
      canUse: async () => true,
      consume: async (_sessionId: string, amountBrl: number, meta: any) => {
        consumed = { amountBrl, meta }
        return {} as any
      }
    } as any,
    defaultConfig: baseConfig
  })

  ;(service as any).downloadMedia = async () => ({ buffer: Buffer.from('image-data') })

  await service.handleInbound(buildItem(10))

  assert.ok(updatedText)
  assert.match(updatedText!, /\[Imagem analisada\]/)
  assert.ok(enqueued)
  assert.equal(enqueued.inboundId, 10)
  assert.ok(usageRecorded)
  assert.equal(usageRecorded.operation, 'understand_media')
  assert.ok(consumed)
  assert.equal(consumed!.meta.referenceId, 'media:understand:10')
  assert.equal(consumed!.meta.reason, 'media_understanding')
  assert.equal(markedDone, true)
})

test('MediaUnderstandingService skips non-PDF document messages', async () => {
  const inbound = buildInboundRow(20, 'documentMessage')
  const rawPayload = buildDocumentRawPayload('application/msword', 'arquivo.docx')
  let skippedReason: string | null = null
  let openAiCalled = false

  const service = new MediaUnderstandingService({
    enabled: true,
    maxBytes: 20_000_000,
    maxPdfPages: 10,
    model: 'gpt-4o-mini',
    aiQueue: { enqueue: async () => {} } as any,
    inboundStore: {
      getById: async () => inbound,
      getRawPayloadById: async () => rawPayload,
      getLatestUserImageOrPdfByChat: async () => ({ id: inbound.id })
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIALerImagensEPdfs: true } })
    } as any,
    understandingStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      }
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createMultimodalCompletion: async () => {
        openAiCalled = true
        return { content: '{}' }
      }
    } as any,
    creditsService: {
      canUse: async () => true
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildItem(20))

  assert.equal(skippedReason, 'not_pdf')
  assert.equal(openAiCalled, false)
})

test('MediaUnderstandingService sends handoff fallback on analysis failure', async () => {
  const inbound = buildInboundRow(40, 'imageMessage')
  const rawPayload = buildImageRawPayload()
  let fallbackSent: any = null
  let failedMessage: string | null = null

  const service = new MediaUnderstandingService({
    enabled: true,
    maxBytes: 20_000_000,
    maxPdfPages: 10,
    model: 'gpt-4o-mini',
    aiQueue: { enqueue: async () => {} } as any,
    inboundStore: {
      getById: async () => inbound,
      getRawPayloadById: async () => rawPayload,
      getLatestUserImageOrPdfByChat: async () => ({ id: inbound.id })
    } as any,
    configStore: {
      get: async () => ({
        training: {
          permitirIALerImagensEPdfs: true,
          mensagemEncaminharHumano: 'Vou encaminhar para um humano.'
        }
      })
    } as any,
    understandingStore: {
      tryStart: async () => true,
      markFailed: async (_id: number, message: string) => {
        failedMessage = message
      },
      markSkipped: async () => {}
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createMultimodalCompletion: async () => {
        throw new Error('provider_down')
      }
    } as any,
    outboundService: {
      enqueueText: async (params: any) => {
        fallbackSent = params
        return { id: 1 }
      }
    } as any,
    creditsService: {
      canUse: async () => true
    } as any,
    defaultConfig: baseConfig
  })

  ;(service as any).downloadMedia = async () => ({ buffer: Buffer.from('image-data') })

  await assert.rejects(async () => {
    await service.handleInbound(buildItem(40))
  })

  assert.equal(failedMessage, 'provider_down')
  assert.ok(fallbackSent)
  assert.equal(fallbackSent.text, 'Vou encaminhar para um humano.')
  assert.equal(fallbackSent.idempotencyKey, 'ai:media:fallback:40')
})
