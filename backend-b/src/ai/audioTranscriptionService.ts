import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import type { Readable } from 'stream'
import ffmpegPath from 'ffmpeg-static'
import type { InboundMessageQueue } from '../messages/queue'
import type { InboundQueueItem } from '../messages/types'
import type { InboundMessageStore } from '../messages/store'
import type { OutboundMessageService } from '../messages/outboundService'
import { loadBaileys } from '../sessions/baileysModule'
import type { MetricsStore } from '../observability/metrics'
import type { CreditsService } from '../credits/service'
import type { ChatStateStore } from '../chats/store'
import type { SystemSettingsService } from '../systemSettings/service'
import type { AiUsageStore } from './usageStore'
import type { AiConfigStore } from './configStore'
import type { ChatAiConfigStore } from './chatConfigStore'
import type { AiConfig } from './types'
import { mergeAiConfig } from './config'
import { isWithinBusinessHours } from './policy'
import type { OpenAiClient } from './openaiClient'
import { AudioTranscriptionStore } from './audioTranscriptionStore'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type AudioTranscriptionServiceOptions = {
  enabled: boolean
  maxSeconds: number
  maxBytes: number
  fallbackMode: 'reply' | 'silence'
  fallbackText: string
  transcribeModel: string
  language: string
  aiQueue: InboundMessageQueue
  inboundStore: InboundMessageStore
  configStore: AiConfigStore
  chatConfigStore?: ChatAiConfigStore
  transcriptionStore: AudioTranscriptionStore
  openAiClient: OpenAiClient
  systemSettings?: SystemSettingsService
  usageStore?: AiUsageStore
  creditsService?: CreditsService
  outboundService?: OutboundMessageService
  chatStateStore?: ChatStateStore
  defaultConfig: AiConfig
  logger?: Logger
  metrics?: MetricsStore
}

type ExtractedAudioMeta = {
  mediaKey: Buffer
  directPath: string
  url?: string
  seconds: number
  mimeType: string
}

export class AudioTranscriptionService {
  private readonly enabled: boolean
  private readonly maxSeconds: number
  private readonly maxBytes: number
  private readonly fallbackMode: 'reply' | 'silence'
  private readonly fallbackText: string
  private readonly transcribeModel: string
  private readonly language: string
  private readonly aiQueue: InboundMessageQueue
  private readonly inboundStore: InboundMessageStore
  private readonly configStore: AiConfigStore
  private readonly chatConfigStore?: ChatAiConfigStore
  private readonly transcriptionStore: AudioTranscriptionStore
  private readonly openAiClient: OpenAiClient
  private readonly systemSettings?: SystemSettingsService
  private readonly usageStore?: AiUsageStore
  private readonly creditsService?: CreditsService
  private readonly outboundService?: OutboundMessageService
  private readonly chatStateStore?: ChatStateStore
  private readonly defaultConfig: AiConfig
  private readonly logger: Logger
  private readonly metrics?: MetricsStore

  constructor(options: AudioTranscriptionServiceOptions) {
    this.enabled = options.enabled
    this.maxSeconds = Math.max(1, Math.floor(options.maxSeconds))
    this.maxBytes = Math.max(1024, Math.floor(options.maxBytes))
    this.fallbackMode = options.fallbackMode
    this.fallbackText = options.fallbackText
    this.transcribeModel = options.transcribeModel
    this.language = options.language
    this.aiQueue = options.aiQueue
    this.inboundStore = options.inboundStore
    this.configStore = options.configStore
    this.chatConfigStore = options.chatConfigStore
    this.transcriptionStore = options.transcriptionStore
    this.openAiClient = options.openAiClient
    this.systemSettings = options.systemSettings
    this.usageStore = options.usageStore
    this.creditsService = options.creditsService
    this.outboundService = options.outboundService
    this.chatStateStore = options.chatStateStore
    this.defaultConfig = options.defaultConfig
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
  }

  async handleInbound(item: InboundQueueItem): Promise<void> {
    const inbound = await this.inboundStore.getById(item.inboundId)
    if (!inbound) {
      this.metrics?.increment('ai.audio.inbound_missing')
      return
    }

    if (inbound.fromMe) {
      this.metrics?.increment('ai.audio.skipped.from_me')
      return
    }

    if (inbound.messageType !== 'audioMessage') {
      this.metrics?.increment('ai.audio.skipped.not_audio')
      return
    }

    const started = await this.transcriptionStore.tryStart(item.inboundId, inbound.sessionId, inbound.chatId)
    if (!started) {
      this.metrics?.increment('ai.audio.skipped.locked')
      return
    }

    if (!this.enabled) {
      await this.transcriptionStore.markSkipped(inbound.id, 'disabled')
      this.metrics?.increment('ai.audio.skipped.disabled')
      return
    }

    const config = await this.resolveConfig(inbound.sessionId)

    if (!config.enabled) {
      await this.transcriptionStore.markSkipped(inbound.id, 'ai_disabled')
      this.metrics?.increment('ai.audio.skipped.ai_disabled')
      return
    }

    if (config.training?.permitirIAOuvirAudios !== true) {
      await this.transcriptionStore.markSkipped(inbound.id, 'training_disabled')
      this.metrics?.increment('ai.audio.skipped.training_disabled')
      return
    }

    if (!config.respondInGroups && isGroupChat(inbound.chatId)) {
      await this.transcriptionStore.markSkipped(inbound.id, 'group_chat')
      this.metrics?.increment('ai.audio.skipped.group')
      return
    }

    if (isBroadcastChat(inbound.chatId)) {
      await this.transcriptionStore.markSkipped(inbound.id, 'broadcast_chat')
      this.metrics?.increment('ai.audio.skipped.broadcast')
      return
    }

    const chatConfig = await this.chatConfigStore?.get(inbound.sessionId, inbound.chatId)
    if (chatConfig?.aiEnabled === false) {
      await this.transcriptionStore.markSkipped(inbound.id, 'chat_disabled')
      this.metrics?.increment('ai.audio.skipped.chat_disabled')
      return
    }

    if (!isWithinBusinessHours(inbound.messageTimestampMs, config.businessHours)) {
      await this.transcriptionStore.markSkipped(inbound.id, 'business_hours')
      this.metrics?.increment('ai.audio.skipped.business_hours')
      return
    }

    if (!this.openAiClient.isConfigured()) {
      await this.transcriptionStore.markSkipped(inbound.id, 'no_key')
      this.metrics?.increment('ai.audio.skipped.no_key')
      return
    }

    const usdPerMin = this.systemSettings?.getAiAudioTranscriptionUsdPerMin?.() ?? 0
    if (!(typeof usdPerMin === 'number' && usdPerMin > 0)) {
      await this.transcriptionStore.markSkipped(inbound.id, 'no_price')
      this.metrics?.increment('ai.audio.skipped.no_price')
      return
    }

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(inbound.sessionId)
      if (!canUse) {
        await this.transcriptionStore.markSkipped(inbound.id, 'no_credits')
        this.metrics?.increment('ai.audio.skipped.no_credits')
        return
      }
    }

    const latestAudio = await this.safeGetLatestAudio(inbound.sessionId, inbound.chatId)
    if (latestAudio && latestAudio.id !== inbound.id) {
      await this.transcriptionStore.markSkipped(inbound.id, 'superseded_audio')
      this.metrics?.increment('ai.audio.transcribe.skipped.superseded_audio')
      return
    }

    let transcript = inbound.text?.trim() ?? ''
    let seconds = 0

    try {
      const rawPayload = await this.inboundStore.getRawPayloadById(inbound.id)
      const extracted = rawPayload ? extractAudioMeta(rawPayload) : null
      seconds = extracted?.seconds ?? 0

      if (seconds > this.maxSeconds) {
        await this.transcriptionStore.markSkipped(inbound.id, 'too_long')
        this.metrics?.increment('ai.audio.skipped.too_long')
        await this.sendFallback(inbound.sessionId, inbound.chatId, inbound.id)
        return
      }

      if (!transcript) {
        if (!rawPayload) {
          throw new Error('raw_payload_missing')
        }

        if (!extracted) {
          throw new Error('audio_meta_missing')
        }

        this.metrics?.increment('ai.audio.transcribe.started')
        let wav: Buffer
        try {
          wav = await this.downloadConvertToWav(extracted)
        } catch (downloadError) {
          const downloadMessage = downloadError instanceof Error ? downloadError.message : 'download_failed'
          if (downloadMessage === 'too_large') {
            await this.transcriptionStore.markSkipped(inbound.id, 'too_large')
            this.metrics?.increment('ai.audio.skipped.too_large')
            await this.sendFallback(inbound.sessionId, inbound.chatId, inbound.id)
            return
          }
          throw downloadError
        }
        const result = await this.openAiClient.createTranscription({
          model: this.transcribeModel,
          file: wav,
          filename: 'audio.wav',
          mimeType: 'audio/wav',
          language: this.language
        })

        transcript = result.text.trim()
        if (!transcript) {
          await this.transcriptionStore.markSkipped(inbound.id, 'empty_transcript')
          this.metrics?.increment('ai.audio.skipped.empty_transcript')
          await this.sendFallback(inbound.sessionId, inbound.chatId, inbound.id)
          return
        }

        await this.inboundStore.updateTextById(inbound.id, transcript)
        await this.updateChatState(inbound.sessionId, inbound.chatId, inbound, transcript)
        this.metrics?.increment('ai.audio.transcribe.done')
      }

      await this.billTranscription(inbound.sessionId, inbound.chatId, inbound.id, seconds, usdPerMin)

      const latestAfter = await this.safeGetLatestAudio(inbound.sessionId, inbound.chatId)
      if (latestAfter && latestAfter.id !== inbound.id) {
        await this.transcriptionStore.markSkipped(inbound.id, 'superseded_audio')
        this.metrics?.increment('ai.audio.transcribe.skipped.superseded_audio')
        return
      }

      await this.aiQueue.enqueue({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        messageId: inbound.messageId,
        enqueuedAtMs: Date.now()
      })

      await this.transcriptionStore.markDone(inbound.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'transcription_failed'
      this.logger.warn?.('Audio transcription failed', {
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        error: message
      })
      this.metrics?.increment('ai.audio.transcribe.failed')
      await this.transcriptionStore.markFailed(inbound.id, message)
      await this.sendFallback(inbound.sessionId, inbound.chatId, inbound.id)
      throw error
    }
  }

  private async resolveConfig(sessionId: string): Promise<AiConfig> {
    const override = await this.configStore.get(sessionId)
    return mergeAiConfig(this.defaultConfig, override)
  }

  private async safeGetLatestAudio(sessionId: string, chatId: string): Promise<{ id: number } | null> {
    try {
      return await this.inboundStore.getLatestUserAudioByChat(sessionId, chatId)
    } catch (error) {
      this.logger.warn?.('Audio latest check failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
      return null
    }
  }

  private async downloadConvertToWav(meta: ExtractedAudioMeta): Promise<Buffer> {
    const baileys = await loadBaileys()
    const stream = (await baileys.downloadContentFromMessage(
      {
        mediaKey: meta.mediaKey,
        directPath: meta.directPath,
        url: meta.url
      },
      'audio'
    )) as unknown as Readable

    const audio = await readStreamToBuffer(stream, this.maxBytes)
    const ext = guessExtension(meta.mimeType)
    return convertToWav16kMono(audio, ext)
  }

  private async updateChatState(
    sessionId: string,
    chatId: string,
    inbound: { id: number; messageId: string | null; messageType: string; messageTimestampMs: number },
    transcript: string
  ) {
    if (!this.chatStateStore) {
      return
    }

    const messageId = inbound.messageId ?? `inbound:${inbound.id}`
    try {
      await this.chatStateStore.upsertFromMessage(
        {
          sessionId,
          chatId,
          chatName: null,
          isGroup: isGroupChat(chatId),
          messageId,
          messageType: inbound.messageType,
          text: transcript,
          timestampMs: inbound.messageTimestampMs,
          fromMe: false
        },
        { incrementUnread: false }
      )
    } catch (error) {
      this.logger.warn?.('Chat state update failed for audio transcript', {
        sessionId,
        chatId,
        inboundId: inbound.id,
        error: (error as Error).message
      })
    }
  }

  private async billTranscription(
    sessionId: string,
    chatId: string,
    inboundId: number,
    seconds: number,
    usdPerMin: number
  ) {
    const usdBrlRate = this.systemSettings?.getUsdBrlRate?.() ?? 0
    const billableSeconds = Math.max(1, Math.floor(Math.max(0, seconds)))
    const rawCostUsd = (billableSeconds / 60) * usdPerMin
    const rawCostBrl = (typeof usdBrlRate === 'number' && usdBrlRate > 0) ? rawCostUsd * usdBrlRate : 0
    const costUsd = round6(Math.max(0, rawCostUsd))
    const costBrl = round6(Math.max(0, rawCostBrl))

    if (this.usageStore) {
      try {
        await this.usageStore.record({
          sessionId,
          chatId,
          inboundId,
          provider: 'openai',
          model: this.transcribeModel,
          operation: 'transcribe',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd,
          usdBrlRate,
          costBrl,
          pricingMissing: false
        })
      } catch (error) {
        this.logger.warn?.('Audio usage record failed', {
          sessionId,
          chatId,
          inboundId,
          error: (error as Error).message
        })
      }
    }

    if (this.creditsService) {
      try {
        if (costBrl > 0) {
          await this.creditsService.consume(sessionId, costBrl, {
            referenceId: `audio:transcribe:${inboundId}`,
            reason: 'audio_transcription'
          })
          this.metrics?.increment('ai.audio.credits.debited')
        }
      } catch (error) {
        const code = (error as any)?.code
        if (code === '23505') {
          // Unique violation: already charged (idempotency guard).
          return
        }

        this.logger.warn?.('Audio credits debit failed', {
          sessionId,
          chatId,
          inboundId,
          error: (error as Error).message
        })
        this.metrics?.increment('ai.audio.credits.debit_failed')
      }
    }
  }

  private async sendFallback(sessionId: string, chatId: string, inboundId: number) {
    if (this.fallbackMode !== 'reply') {
      return
    }
    if (!this.outboundService) {
      return
    }
    const text = this.fallbackText.trim()
    if (!text) {
      return
    }

    try {
      await this.outboundService.enqueueText({
        sessionId,
        chatId,
        text,
        idempotencyKey: `ai:audio:fallback:${inboundId}`,
        origin: 'ai'
      })
    } catch (error) {
      this.logger.warn?.('Audio fallback send failed', {
        sessionId,
        chatId,
        inboundId,
        error: (error as Error).message
      })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unwrapMessage(message: Record<string, unknown> | null): Record<string, unknown> | null {
  let current = message
  for (let i = 0; i < 4; i += 1) {
    if (!current) {
      return null
    }

    const ephemeral = current.ephemeralMessage
    if (isRecord(ephemeral) && isRecord(ephemeral.message)) {
      current = ephemeral.message
      continue
    }

    const viewOnce = current.viewOnceMessage
    if (isRecord(viewOnce) && isRecord(viewOnce.message)) {
      current = viewOnce.message
      continue
    }

    const viewOnceV2 = current.viewOnceMessageV2
    if (isRecord(viewOnceV2) && isRecord(viewOnceV2.message)) {
      current = viewOnceV2.message
      continue
    }

    const viewOnceV2Extension = current.viewOnceMessageV2Extension
    if (isRecord(viewOnceV2Extension) && isRecord(viewOnceV2Extension.message)) {
      current = viewOnceV2Extension.message
      continue
    }

    const documentWithCaption = current.documentWithCaptionMessage
    if (isRecord(documentWithCaption) && isRecord(documentWithCaption.message)) {
      current = documentWithCaption.message
      continue
    }

    break
  }

  return current
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return null
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function decodeMediaKey(value: unknown): Buffer | null {
  if (!value) {
    return null
  }
  if (Buffer.isBuffer(value)) {
    return value
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return Buffer.from(value, 'base64')
    } catch {
      return null
    }
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
    return Buffer.from(value)
  }
  return null
}

function extractAudioMeta(raw: Record<string, unknown>): ExtractedAudioMeta | null {
  const messageContainer = isRecord(raw.message) ? (raw.message as Record<string, unknown>) : null
  const message = unwrapMessage(messageContainer)
  const audioMessage = message && isRecord(message.audioMessage) ? (message.audioMessage as Record<string, unknown>) : null
  if (!audioMessage) {
    return null
  }

  const mediaKey = decodeMediaKey(audioMessage.mediaKey)
  const directPath = toString(audioMessage.directPath).trim()
  const url = toString(audioMessage.url).trim()
  const seconds = toNumber(audioMessage.seconds) ?? 0
  const mimeType = toString(audioMessage.mimetype).trim()

  if (!mediaKey || !directPath) {
    return null
  }

  return {
    mediaKey,
    directPath,
    ...(url ? { url } : {}),
    seconds: Math.max(0, Math.floor(seconds)),
    mimeType
  }
}

async function readStreamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of stream as any) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) {
      throw new Error('too_large')
    }
    chunks.push(buf)
  }

  return Buffer.concat(chunks)
}

function guessExtension(mimeType: string) {
  const normalized = (mimeType ?? '').trim().toLowerCase()
  if (normalized.includes('ogg')) return '.ogg'
  if (normalized.includes('opus')) return '.ogg'
  if (normalized.includes('mpeg')) return '.mp3'
  if (normalized.includes('mp4')) return '.mp4'
  if (normalized.includes('wav')) return '.wav'
  return '.bin'
}

async function convertToWav16kMono(input: Buffer, inputExt: string): Promise<Buffer> {
  const bin = (ffmpegPath as unknown as string | null) ?? ''
  const ffmpeg = typeof bin === 'string' && bin.trim() ? bin : ''
  if (!ffmpeg) {
    throw new Error('ffmpeg_not_available')
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'autowhats-audio-'))
  const inputPath = path.join(dir, `input${inputExt || '.bin'}`)
  const outputPath = path.join(dir, 'output.wav')

  try {
    await writeFile(inputPath, input)
    await runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      inputPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'wav',
      outputPath
    ])

    return await readFile(outputPath)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function runFfmpeg(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      if (stderr.length < 8000) {
        stderr += chunk.toString()
      }
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`ffmpeg_failed:${code}:${stderr.slice(0, 500)}`))
      }
    })
  })
}

function isGroupChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@g.us')
}

function isBroadcastChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@broadcast')
}

function round6(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * 1e6) / 1e6
}
