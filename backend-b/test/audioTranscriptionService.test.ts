import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioTranscriptionService } from '../src/ai/audioTranscriptionService'
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
  overrides: Partial<InboundMessageRow> = {}
): InboundMessageRow {
  return {
    id,
    sessionId: 's1',
    chatId: '5511999999999@s.whatsapp.net',
    messageId: `m${id}`,
    fromMe: false,
    messageType: 'audioMessage',
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

function buildRawPayload(seconds: number) {
  return {
    message: {
      audioMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        seconds,
        mimetype: 'audio/ogg; codecs=opus'
      }
    }
  }
}

test('AudioTranscriptionService skips when training toggle is off', async () => {
  const inbound = buildInboundRow(1)
  let skippedReason: string | null = null
  let openAiCalled = false

  const service = new AudioTranscriptionService({
    enabled: true,
    maxSeconds: 90,
    maxBytes: 10_000_000,
    fallbackMode: 'reply',
    fallbackText: 'fallback',
    transcribeModel: 'whisper-1',
    language: 'pt',
    aiQueue: { enqueue: async () => {} } as any,
    inboundStore: {
      getById: async () => inbound
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAOuvirAudios: false } })
    } as any,
    transcriptionStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      }
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createTranscription: async () => {
        openAiCalled = true
        return { text: 'ok' }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildItem(1))

  assert.equal(skippedReason, 'training_disabled')
  assert.equal(openAiCalled, false)
})

test('AudioTranscriptionService transcribes, bills, and enqueues for AI', async () => {
  const inbound = buildInboundRow(10)
  const rawPayload = buildRawPayload(70)

  let updatedText: string | null = null
  let enqueued: any = null
  let usageRecorded: any = null
  let consumed: { amountBrl: number; meta: any } | null = null
  let markedDone = false
  let openAiParams: any = null

  const service = new AudioTranscriptionService({
    enabled: true,
    maxSeconds: 90,
    maxBytes: 10_000_000,
    fallbackMode: 'reply',
    fallbackText: 'fallback',
    transcribeModel: 'whisper-1',
    language: 'pt',
    aiQueue: {
      enqueue: async (item: any) => {
        enqueued = item
      }
    } as any,
    inboundStore: {
      getById: async () => inbound,
      getRawPayloadById: async () => rawPayload,
      updateTextById: async (_id: number, text: string) => {
        updatedText = text
      },
      getLatestUserAudioByChat: async () => ({ id: inbound.id })
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAOuvirAudios: true } })
    } as any,
    transcriptionStore: {
      tryStart: async () => true,
      markDone: async () => {
        markedDone = true
      },
      markSkipped: async () => {},
      markFailed: async () => {}
    } as any,
    openAiClient: {
      isConfigured: () => true,
      createTranscription: async (params: any) => {
        openAiParams = params
        return { text: 'Ola tudo bem?' }
      }
    } as any,
    systemSettings: {
      getAiAudioTranscriptionUsdPerMin: () => 0.006,
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

  ;(service as any).downloadConvertToWav = async () => Buffer.from('RIFF0000WAVE', 'utf8')

  await service.handleInbound(buildItem(10))

  assert.ok(openAiParams)
  assert.equal(openAiParams.model, 'whisper-1')
  assert.equal(openAiParams.mimeType, 'audio/wav')
  assert.equal(openAiParams.language, 'pt')

  assert.equal(updatedText, 'Ola tudo bem?')
  assert.ok(enqueued)
  assert.equal(enqueued.inboundId, 10)

  assert.ok(usageRecorded)
  assert.equal(usageRecorded.operation, 'transcribe')
  assert.equal(usageRecorded.promptTokens, 0)
  assert.equal(usageRecorded.totalTokens, 0)
  assert.equal(usageRecorded.costUsd, 0.007)
  assert.equal(usageRecorded.costBrl, 0.035)

  assert.ok(consumed)
  assert.ok(Math.abs(consumed!.amountBrl - 0.035) < 1e-9)
  assert.equal(consumed!.meta.referenceId, 'audio:transcribe:10')
  assert.equal(consumed!.meta.reason, 'audio_transcription')

  assert.equal(markedDone, true)
})

test('AudioTranscriptionService skips when a newer audio exists in the chat', async () => {
  const inbound = buildInboundRow(20)
  let skippedReason: string | null = null
  let enqueued = false

  const service = new AudioTranscriptionService({
    enabled: true,
    maxSeconds: 90,
    maxBytes: 10_000_000,
    fallbackMode: 'reply',
    fallbackText: 'fallback',
    transcribeModel: 'whisper-1',
    language: 'pt',
    aiQueue: {
      enqueue: async () => {
        enqueued = true
      }
    } as any,
    inboundStore: {
      getById: async () => inbound,
      getLatestUserAudioByChat: async () => ({ id: 21 })
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAOuvirAudios: true } })
    } as any,
    transcriptionStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      }
    } as any,
    openAiClient: {
      isConfigured: () => true
    } as any,
    systemSettings: {
      getAiAudioTranscriptionUsdPerMin: () => 0.006
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildItem(20))

  assert.equal(skippedReason, 'superseded_audio')
  assert.equal(enqueued, false)
})

test('AudioTranscriptionService sends fallback when audio is too long', async () => {
  const inbound = buildInboundRow(30)
  const rawPayload = buildRawPayload(120)
  let skippedReason: string | null = null
  let fallbackSent: any = null

  const service = new AudioTranscriptionService({
    enabled: true,
    maxSeconds: 90,
    maxBytes: 10_000_000,
    fallbackMode: 'reply',
    fallbackText: 'Pode enviar em texto?',
    transcribeModel: 'whisper-1',
    language: 'pt',
    aiQueue: { enqueue: async () => {} } as any,
    inboundStore: {
      getById: async () => inbound,
      getRawPayloadById: async () => rawPayload,
      getLatestUserAudioByChat: async () => ({ id: inbound.id })
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAOuvirAudios: true } })
    } as any,
    transcriptionStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      }
    } as any,
    openAiClient: {
      isConfigured: () => true
    } as any,
    systemSettings: {
      getAiAudioTranscriptionUsdPerMin: () => 0.006
    } as any,
    outboundService: {
      enqueueText: async (params: any) => {
        fallbackSent = params
        return { id: 1 }
      }
    } as any,
    defaultConfig: baseConfig
  })

  await service.handleInbound(buildItem(30))

  assert.equal(skippedReason, 'too_long')
  assert.ok(fallbackSent)
  assert.equal(fallbackSent.text, 'Pode enviar em texto?')
  assert.equal(fallbackSent.idempotencyKey, 'ai:audio:fallback:30')
})

test('AudioTranscriptionService sends fallback when audio exceeds max bytes', async () => {
  const inbound = buildInboundRow(40)
  const rawPayload = buildRawPayload(10)
  let skippedReason: string | null = null
  let fallbackSent: any = null

  const service = new AudioTranscriptionService({
    enabled: true,
    maxSeconds: 90,
    maxBytes: 10_000_000,
    fallbackMode: 'reply',
    fallbackText: 'Pode enviar em texto?',
    transcribeModel: 'whisper-1',
    language: 'pt',
    aiQueue: { enqueue: async () => {} } as any,
    inboundStore: {
      getById: async () => inbound,
      getRawPayloadById: async () => rawPayload,
      getLatestUserAudioByChat: async () => ({ id: inbound.id })
    } as any,
    configStore: {
      get: async () => ({ training: { permitirIAOuvirAudios: true } })
    } as any,
    transcriptionStore: {
      tryStart: async () => true,
      markSkipped: async (_id: number, reason: string) => {
        skippedReason = reason
      }
    } as any,
    openAiClient: {
      isConfigured: () => true
    } as any,
    systemSettings: {
      getAiAudioTranscriptionUsdPerMin: () => 0.006
    } as any,
    outboundService: {
      enqueueText: async (params: any) => {
        fallbackSent = params
        return { id: 1 }
      }
    } as any,
    defaultConfig: baseConfig
  })

  ;(service as any).downloadConvertToWav = async () => {
    throw new Error('too_large')
  }

  await service.handleInbound(buildItem(40))

  assert.equal(skippedReason, 'too_large')
  assert.ok(fallbackSent)
  assert.equal(fallbackSent.idempotencyKey, 'ai:audio:fallback:40')
})
