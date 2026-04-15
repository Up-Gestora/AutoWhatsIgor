import { PDFDocument } from 'pdf-lib'
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
import type { AiConfig, AiPricing, AiTokenUsage, AiTrainingData } from './types'
import { mergeAiConfig } from './config'
import { isWithinBusinessHours } from './policy'
import type { OpenAiClient, OpenAiUsage } from './openaiClient'
import { MediaUnderstandingStore } from './mediaUnderstandingStore'
import { calculateUsageCost } from './usagePricing'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type MediaUnderstandingServiceOptions = {
  enabled: boolean
  maxBytes: number
  maxPdfPages: number
  model: string
  aiQueue: InboundMessageQueue
  inboundStore: InboundMessageStore
  configStore: AiConfigStore
  chatConfigStore?: ChatAiConfigStore
  understandingStore: MediaUnderstandingStore
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

type ExtractedMediaMeta = {
  kind: 'image' | 'pdf'
  mediaKey: Buffer
  directPath: string
  url?: string
  mimeType: string
  fileName?: string
}
type AiLanguage = 'pt-BR' | 'en'

const DEFAULT_HANDOFF_TEXT_PT =
  'Desculpe, nao consegui analisar o arquivo enviado. Vou encaminhar sua conversa para um atendente humano.'

const DEFAULT_HANDOFF_TEXT_EN =
  "Sorry, I couldn't analyze the file you sent. I'll forward your conversation to a human agent."

const DEFAULT_MULTIMODAL_SYSTEM_PROMPT_PT =
  'Você é um assistente que extrai contexto útil de arquivos recebidos no WhatsApp. Responda SOMENTE JSON válido com as chaves: summary (string curta), highlights (array de strings curtas), entities (array de objetos {name,value}). Não invente informações.'

const DEFAULT_MULTIMODAL_SYSTEM_PROMPT_EN =
  'You are an assistant that extracts useful context from files received on WhatsApp. Reply with ONLY valid JSON with keys: summary (short string), highlights (array of short strings), entities (array of objects {name,value}). Do not invent information.'

export class MediaUnderstandingService {
  private readonly enabled: boolean
  private readonly maxBytes: number
  private readonly maxPdfPages: number
  private readonly model: string
  private readonly aiQueue: InboundMessageQueue
  private readonly inboundStore: InboundMessageStore
  private readonly configStore: AiConfigStore
  private readonly chatConfigStore?: ChatAiConfigStore
  private readonly understandingStore: MediaUnderstandingStore
  private readonly openAiClient: OpenAiClient
  private readonly systemSettings?: SystemSettingsService
  private readonly usageStore?: AiUsageStore
  private readonly creditsService?: CreditsService
  private readonly outboundService?: OutboundMessageService
  private readonly chatStateStore?: ChatStateStore
  private readonly defaultConfig: AiConfig
  private readonly logger: Logger
  private readonly metrics?: MetricsStore

  constructor(options: MediaUnderstandingServiceOptions) {
    this.enabled = options.enabled
    this.maxBytes = Math.max(1024, Math.floor(options.maxBytes))
    this.maxPdfPages = Math.max(1, Math.floor(options.maxPdfPages))
    this.model = options.model
    this.aiQueue = options.aiQueue
    this.inboundStore = options.inboundStore
    this.configStore = options.configStore
    this.chatConfigStore = options.chatConfigStore
    this.understandingStore = options.understandingStore
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
      this.metrics?.increment('ai.media.inbound_missing')
      return
    }

    if (inbound.fromMe) {
      this.metrics?.increment('ai.media.skipped.from_me')
      return
    }

    if (inbound.messageType !== 'imageMessage' && inbound.messageType !== 'documentMessage') {
      this.metrics?.increment('ai.media.skipped.not_media')
      return
    }

    const started = await this.understandingStore.tryStart(item.inboundId, inbound.sessionId, inbound.chatId)
    if (!started) {
      this.metrics?.increment('ai.media.skipped.locked')
      return
    }

    if (!this.enabled) {
      await this.understandingStore.markSkipped(inbound.id, 'disabled')
      this.metrics?.increment('ai.media.skipped.disabled')
      return
    }

    const config = await this.resolveConfig(inbound.sessionId)
    const language = resolveTrainingLanguage(config.training)
    let handoffText = resolveHandoffText(config.training)

    if (!config.enabled) {
      await this.understandingStore.markSkipped(inbound.id, 'ai_disabled')
      this.metrics?.increment('ai.media.skipped.ai_disabled')
      return
    }

    if (config.training?.permitirIALerImagensEPdfs !== true) {
      await this.understandingStore.markSkipped(inbound.id, 'training_disabled')
      this.metrics?.increment('ai.media.skipped.training_disabled')
      return
    }

    if (!config.respondInGroups && isGroupChat(inbound.chatId)) {
      await this.understandingStore.markSkipped(inbound.id, 'group_chat')
      this.metrics?.increment('ai.media.skipped.group')
      return
    }

    if (isBroadcastChat(inbound.chatId)) {
      await this.understandingStore.markSkipped(inbound.id, 'broadcast_chat')
      this.metrics?.increment('ai.media.skipped.broadcast')
      return
    }

    const chatConfig = await this.chatConfigStore?.get(inbound.sessionId, inbound.chatId)
    if (chatConfig?.aiEnabled === false) {
      await this.understandingStore.markSkipped(inbound.id, 'chat_disabled')
      this.metrics?.increment('ai.media.skipped.chat_disabled')
      return
    }

    if (!isWithinBusinessHours(inbound.messageTimestampMs, config.businessHours)) {
      await this.understandingStore.markSkipped(inbound.id, 'business_hours')
      this.metrics?.increment('ai.media.skipped.business_hours')
      return
    }

    if (!this.openAiClient.isConfigured()) {
      await this.understandingStore.markSkipped(inbound.id, 'no_key')
      this.metrics?.increment('ai.media.skipped.no_key')
      return
    }

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(inbound.sessionId)
      if (!canUse) {
        await this.understandingStore.markSkipped(inbound.id, 'no_credits')
        this.metrics?.increment('ai.media.skipped.no_credits')
        return
      }
    }

    const latestMedia = await this.safeGetLatestMedia(inbound.sessionId, inbound.chatId)
    if (latestMedia && latestMedia.id !== inbound.id) {
      await this.understandingStore.markSkipped(inbound.id, 'superseded_media')
      this.metrics?.increment('ai.media.analyze.skipped.superseded_media')
      return
    }

    try {
      const rawPayload = await this.inboundStore.getRawPayloadById(inbound.id)
      if (!rawPayload) {
        throw new Error('raw_payload_missing')
      }

      if (inbound.messageType === 'documentMessage' && !isPdfDocumentRaw(rawPayload)) {
        await this.understandingStore.markSkipped(inbound.id, 'not_pdf')
        this.metrics?.increment('ai.media.skipped.not_pdf')
        return
      }

      const extracted = extractMediaMeta(rawPayload)
      if (!extracted) {
        throw new Error('media_meta_missing')
      }

      this.metrics?.increment('ai.media.analyze.started')

      let media = await this.downloadMedia(extracted)
      if (extracted.kind === 'pdf') {
        media = await this.truncatePdf(media)
      }

      const analysis = await this.openAiClient.createMultimodalCompletion({
        model: this.model,
        systemPrompt:
          language === 'en' ? DEFAULT_MULTIMODAL_SYSTEM_PROMPT_EN : DEFAULT_MULTIMODAL_SYSTEM_PROMPT_PT,
        prompt: buildMultimodalPrompt(extracted.kind, language),
        input:
          extracted.kind === 'image'
            ? {
                type: 'image',
                file: media.buffer,
                mimeType: extracted.mimeType
              }
            : {
                type: 'pdf',
                file: media.buffer,
                fileName: extracted.fileName
              }
      })

      const summary = buildSummaryText({
        rawResponse: analysis.content,
        kind: extracted.kind,
        pages: media.pages,
        captionText: inbound.text ?? null,
        language
      })
      if (!summary) {
        throw new Error('empty_summary')
      }

      await this.inboundStore.updateTextById(inbound.id, summary)
      await this.updateChatState(inbound.sessionId, inbound.chatId, inbound, summary)
      this.metrics?.increment('ai.media.analyze.done')

      await this.billUnderstanding(inbound.sessionId, inbound.chatId, inbound.id, analysis.usage)

      const latestAfter = await this.safeGetLatestMedia(inbound.sessionId, inbound.chatId)
      if (latestAfter && latestAfter.id !== inbound.id) {
        await this.understandingStore.markSkipped(inbound.id, 'superseded_media')
        this.metrics?.increment('ai.media.analyze.skipped.superseded_media')
        return
      }

      await this.aiQueue.enqueue({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        messageId: inbound.messageId,
        enqueuedAtMs: Date.now()
      })

      await this.understandingStore.markDone(inbound.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'media_understanding_failed'
      if (message === 'too_large') {
        await this.understandingStore.markSkipped(inbound.id, 'too_large')
        this.metrics?.increment('ai.media.skipped.too_large')
        await this.sendFallback(inbound.sessionId, inbound.chatId, inbound.id, handoffText)
        return
      }

      this.logger.warn?.('Media understanding failed', {
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        error: message
      })
      this.metrics?.increment('ai.media.analyze.failed')
      await this.understandingStore.markFailed(inbound.id, message)
      await this.sendFallback(inbound.sessionId, inbound.chatId, inbound.id, handoffText)
      throw error
    }
  }

  private async resolveConfig(sessionId: string): Promise<AiConfig> {
    const override = await this.configStore.get(sessionId)
    return mergeAiConfig(this.defaultConfig, override)
  }

  private async safeGetLatestMedia(sessionId: string, chatId: string): Promise<{ id: number } | null> {
    try {
      return await this.inboundStore.getLatestUserImageOrPdfByChat(sessionId, chatId)
    } catch (error) {
      this.logger.warn?.('Media latest check failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
      return null
    }
  }

  private async downloadMedia(meta: ExtractedMediaMeta): Promise<{ buffer: Buffer; pages?: { original: number; kept: number } }> {
    const baileys = await loadBaileys()
    const stream = await baileys.downloadContentFromMessage(
      {
        mediaKey: meta.mediaKey,
        directPath: meta.directPath,
        url: meta.url
      },
      meta.kind === 'image' ? 'image' : 'document'
    )

    const media = await readStreamToBuffer(stream as any, this.maxBytes)
    return { buffer: media }
  }

  private async truncatePdf(input: { buffer: Buffer; pages?: { original: number; kept: number } }): Promise<{ buffer: Buffer; pages: { original: number; kept: number } }> {
    const source = await PDFDocument.load(input.buffer, { ignoreEncryption: true })
    const totalPages = source.getPageCount()
    if (totalPages <= this.maxPdfPages) {
      return {
        buffer: input.buffer,
        pages: {
          original: totalPages,
          kept: totalPages
        }
      }
    }

    const target = await PDFDocument.create()
    const pageIndexes = Array.from({ length: this.maxPdfPages }, (_value, index) => index)
    const copiedPages = await target.copyPages(source, pageIndexes)
    for (const page of copiedPages) {
      target.addPage(page)
    }
    const bytes = await target.save()
    return {
      buffer: Buffer.from(bytes),
      pages: {
        original: totalPages,
        kept: this.maxPdfPages
      }
    }
  }

  private async updateChatState(
    sessionId: string,
    chatId: string,
    inbound: { id: number; messageId: string | null; messageType: string; messageTimestampMs: number },
    text: string
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
          text,
          timestampMs: inbound.messageTimestampMs,
          fromMe: false
        },
        { incrementUnread: false }
      )
    } catch (error) {
      this.logger.warn?.('Chat state update failed for media summary', {
        sessionId,
        chatId,
        inboundId: inbound.id,
        error: (error as Error).message
      })
    }
  }

  private async billUnderstanding(
    sessionId: string,
    chatId: string,
    inboundId: number,
    usage: OpenAiUsage | undefined
  ) {
    if (!usage) {
      this.metrics?.increment('ai.media.usage.missing')
      return
    }

    const tokenUsage: AiTokenUsage = {
      promptTokens: Math.max(0, Math.round(usage.promptTokens)),
      completionTokens: Math.max(0, Math.round(usage.completionTokens)),
      totalTokens: Math.max(
        0,
        Math.round(Number.isFinite(usage.totalTokens) ? usage.totalTokens : usage.promptTokens + usage.completionTokens)
      )
    }

    const pricing: AiPricing = this.systemSettings?.getAiPricing?.() ?? { models: {} }
    const usdBrlRate = this.systemSettings?.getUsdBrlRate?.() ?? 0
    const cost = calculateUsageCost(tokenUsage, this.model, pricing, usdBrlRate)
    if (cost.pricingMissing) {
      this.metrics?.increment('ai.usage.pricing_missing')
    }

    if (this.usageStore) {
      try {
        await this.usageStore.record({
          sessionId,
          chatId,
          inboundId,
          provider: 'openai',
          model: this.model,
          operation: 'understand_media',
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
          costUsd: round6(cost.costUsd),
          usdBrlRate,
          costBrl: round6(cost.costBrl),
          pricingMissing: cost.pricingMissing
        })
      } catch (error) {
        this.logger.warn?.('Media usage record failed', {
          sessionId,
          chatId,
          inboundId,
          error: (error as Error).message
        })
      }
    }

    if (this.creditsService && cost.costBrl > 0) {
      try {
        await this.creditsService.consume(sessionId, round6(cost.costBrl), {
          referenceId: `media:understand:${inboundId}`,
          reason: 'media_understanding'
        })
        this.metrics?.increment('ai.media.credits.debited')
      } catch (error) {
        const code = (error as any)?.code
        if (code === '23505') {
          return
        }
        this.logger.warn?.('Media credits debit failed', {
          sessionId,
          chatId,
          inboundId,
          error: (error as Error).message
        })
        this.metrics?.increment('ai.media.credits.debit_failed')
      }
    }
  }

  private async sendFallback(sessionId: string, chatId: string, inboundId: number, handoffText: string) {
    if (!this.outboundService) {
      return
    }
    const text = handoffText.trim()
    if (!text) {
      return
    }

    try {
      await this.outboundService.enqueueText({
        sessionId,
        chatId,
        text,
        idempotencyKey: `ai:media:fallback:${inboundId}`,
        origin: 'ai'
      })
      this.metrics?.increment('ai.media.fallback.handoff')
    } catch (error) {
      this.logger.warn?.('Media fallback send failed', {
        sessionId,
        chatId,
        inboundId,
        error: (error as Error).message
      })
    }
  }
}

function buildSummaryText(input: {
  rawResponse: string
  kind: 'image' | 'pdf'
  pages?: { original: number; kept: number }
  captionText?: string | null
  language: AiLanguage
}) {
  const parsed = safeJsonParse(input.rawResponse)
  const summary = toString(parsed.summary).trim() || toString((parsed as any).resumo).trim()
  const highlights = asStringArray(parsed.highlights)
  const entities = asEntityArray(parsed.entities)

  const lines: string[] = [
    input.kind === 'image'
      ? input.language === 'en'
        ? '[Image analyzed]'
        : '[Imagem analisada]'
      : input.language === 'en'
        ? '[PDF analyzed]'
        : '[PDF analisado]'
  ]

  if (input.pages && input.kind === 'pdf') {
    lines.push(
      input.language === 'en'
        ? `Pages considered: ${input.pages.kept}/${input.pages.original}`
        : `Páginas consideradas: ${input.pages.kept}/${input.pages.original}`
    )
  }

  const captionText = typeof input.captionText === 'string' ? input.captionText.trim() : ''
  if (captionText) {
    lines.push(
      input.language === 'en'
        ? `User message: ${captionText}`
        : `Mensagem do usuário: ${captionText}`
    )
  }

  if (summary) {
    lines.push(`${input.language === 'en' ? 'Summary' : 'Resumo'}: ${summary}`)
  }

  if (highlights.length > 0) {
    lines.push(input.language === 'en' ? 'Main points:' : 'Pontos principais:')
    for (const entry of highlights.slice(0, 8)) {
      lines.push(`- ${entry}`)
    }
  }

  if (entities.length > 0) {
    lines.push(input.language === 'en' ? 'Extracted data:' : 'Dados extraídos:')
    for (const entity of entities.slice(0, 8)) {
      lines.push(`- ${entity.name}: ${entity.value}`)
    }
  }

  let text = lines.filter(Boolean).join('\n').trim()
  if (!summary && highlights.length === 0 && entities.length === 0) {
    const fallback = input.rawResponse.trim()
    text = fallback ? `${lines[0]}\n${input.language === 'en' ? 'Summary' : 'Resumo'}: ${fallback}` : ''
  }
  if (text.length > 4000) {
    text = `${text.slice(0, 3997)}...`
  }
  return text
}

function buildMultimodalPrompt(kind: 'image' | 'pdf', language: AiLanguage) {
  if (language === 'en') {
    if (kind === 'image') {
      return 'Analyze the image and extract only objective information relevant to continue a commercial service flow on WhatsApp.'
    }
    return 'Analyze the PDF and extract only objective information relevant to continue a commercial service flow on WhatsApp.'
  }

  if (kind === 'image') {
    return 'Analise a imagem e extraia apenas informações objetivas relevantes para continuar um atendimento comercial no WhatsApp.'
  }
  return 'Analise o PDF e extraia apenas informações objetivas relevantes para continuar um atendimento comercial no WhatsApp.'
}

function safeJsonParse(raw: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // noop
  }
  return {}
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function asEntityArray(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null
      }
      const record = entry as Record<string, unknown>
      const name = toString(record.name).trim()
      const rawValue = record.value
      const valueText = typeof rawValue === 'string' ? rawValue.trim() : JSON.stringify(rawValue ?? '')
      const value = valueText.trim()
      if (!name || !value) {
        return null
      }
      return { name, value }
    })
    .filter(Boolean) as Array<{ name: string; value: string }>
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

function isPdfDocumentRaw(raw: Record<string, unknown>) {
  const messageContainer = isRecord(raw.message) ? (raw.message as Record<string, unknown>) : null
  const message = unwrapMessage(messageContainer)
  const documentMessage = message && isRecord(message.documentMessage) ? (message.documentMessage as Record<string, unknown>) : null
  if (!documentMessage) {
    return false
  }
  const mimeType = toString(documentMessage.mimetype).trim().toLowerCase()
  const fileName = toString(documentMessage.fileName).trim().toLowerCase()
  return mimeType === 'application/pdf' || fileName.endsWith('.pdf')
}

function extractMediaMeta(raw: Record<string, unknown>): ExtractedMediaMeta | null {
  const messageContainer = isRecord(raw.message) ? (raw.message as Record<string, unknown>) : null
  const message = unwrapMessage(messageContainer)
  if (!message) {
    return null
  }

  const imageMessage = isRecord(message.imageMessage) ? (message.imageMessage as Record<string, unknown>) : null
  if (imageMessage) {
    const mediaKey = decodeMediaKey(imageMessage.mediaKey)
    const directPath = toString(imageMessage.directPath).trim()
    const url = toString(imageMessage.url).trim()
    const mimeType = toString(imageMessage.mimetype).trim() || 'image/jpeg'
    if (!mediaKey || !directPath) {
      return null
    }
    return {
      kind: 'image',
      mediaKey,
      directPath,
      ...(url ? { url } : {}),
      mimeType
    }
  }

  const documentMessage = isRecord(message.documentMessage) ? (message.documentMessage as Record<string, unknown>) : null
  if (!documentMessage) {
    return null
  }

  const mimeType = toString(documentMessage.mimetype).trim().toLowerCase()
  const fileName = toString(documentMessage.fileName).trim()
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    return null
  }

  const mediaKey = decodeMediaKey(documentMessage.mediaKey)
  const directPath = toString(documentMessage.directPath).trim()
  const url = toString(documentMessage.url).trim()
  if (!mediaKey || !directPath) {
    return null
  }

  return {
    kind: 'pdf',
    mediaKey,
    directPath,
    ...(url ? { url } : {}),
    mimeType: 'application/pdf',
    ...(fileName ? { fileName } : {})
  }
}

async function readStreamToBuffer(stream: AsyncIterable<unknown>, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of stream as any) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any)
    total += buf.length
    if (total > maxBytes) {
      throw new Error('too_large')
    }
    chunks.push(buf)
  }

  return Buffer.concat(chunks)
}

function isGroupChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@g.us')
}

function isBroadcastChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@broadcast')
}

export function resolveHandoffText(training?: AiTrainingData) {
  const custom = training?.mensagemEncaminharHumano
  if (typeof custom === 'string' && custom.trim()) {
    return custom.trim()
  }

  return resolveTrainingLanguage(training) === 'en' ? DEFAULT_HANDOFF_TEXT_EN : DEFAULT_HANDOFF_TEXT_PT
}

function resolveTrainingLanguage(training?: AiTrainingData): AiLanguage {
  const value = training?.language
  if (typeof value !== 'string') {
    return 'pt-BR'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb' || normalized.startsWith('en-')) {
    return 'en'
  }
  return 'pt-BR'
}

function round6(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * 1e6) / 1e6
}
