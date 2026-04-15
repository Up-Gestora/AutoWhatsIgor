import type { InboundMessageStore } from './store'
import type { InboundDebounceStore } from './debounceStore'
import type { MetricsStore } from '../observability/metrics'
import type { ChatService } from '../chats'
import type { InboundMessageQueue } from './queue'
import type { LeadStore } from '../leads'
import { hashPayload, sanitizeForJson } from './json'
import { normalizeBaileysMessage } from './normalizer'
import type { NormalizedInboundMessage } from './types'
import type { InboundMessageInsertResult } from './types'
import { extractPhoneDigitsFromJid } from '../whatsapp/ids'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type InboundMessageServiceOptions = {
  store: InboundMessageStore
  queue: InboundMessageQueue
  audioQueue?: InboundMessageQueue
  mediaQueue?: InboundMessageQueue
  logger?: Logger
  metrics?: MetricsStore
  chatService?: ChatService
  leadStore?: LeadStore
  debounceStore?: InboundDebounceStore
  trafficStore?: { touchInbound: (sessionId: string) => Promise<void> }
  inboundInterceptor?: {
    handleInboundMessage(normalized: NormalizedInboundMessage): Promise<{ handled: boolean }>
  }
}

export class InboundMessageService {
  private readonly store: InboundMessageStore
  private readonly queue: InboundMessageQueue
  private readonly audioQueue?: InboundMessageQueue
  private readonly mediaQueue?: InboundMessageQueue
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly chatService?: ChatService
  private readonly leadStore?: LeadStore
  private readonly debounceStore?: InboundDebounceStore
  private readonly trafficStore?: { touchInbound: (sessionId: string) => Promise<void> }
  private readonly inboundInterceptor?: InboundMessageServiceOptions['inboundInterceptor']

  constructor(options: InboundMessageServiceOptions) {
    this.store = options.store
    this.queue = options.queue
    this.audioQueue = options.audioQueue
    this.mediaQueue = options.mediaQueue
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.chatService = options.chatService
    this.leadStore = options.leadStore
    this.debounceStore = options.debounceStore
    this.trafficStore = options.trafficStore
    this.inboundInterceptor = options.inboundInterceptor
  }

  async handleRawMessage(sessionId: string, raw: unknown): Promise<InboundMessageInsertResult> {
    this.metrics?.increment('messages.inbound.received')
    const normalized = normalizeBaileysMessage(sessionId, raw)
    if (!normalized) {
      this.logger.warn?.('Inbound message ignored: unable to normalize', { sessionId })
      this.metrics?.increment('messages.inbound.ignored')
      return { inserted: false }
    }

    if (shouldIgnoreInbound(normalized)) {
      this.metrics?.increment('messages.inbound.ignored.system')
      return { inserted: false }
    }

    const payloadHash = hashPayload(normalized.raw)
    const receivedAtMs = Date.now()
    const sanitizedRaw = sanitizeForJson(normalized.raw)
    const normalizedPayload = {
      sessionId: normalized.sessionId,
      chatId: normalized.chatId,
      chatIdAlt: normalized.chatIdAlt,
      messageId: normalized.messageId,
      senderId: normalized.senderId,
      fromMe: normalized.fromMe,
      timestampMs: normalized.timestampMs,
      messageType: normalized.messageType,
      text: normalized.text
    }

    const insertResult = await this.store.insert({
      sessionId: normalized.sessionId,
      chatId: normalized.chatId,
      messageId: normalized.messageId,
      payloadHash,
      senderId: normalized.senderId,
      fromMe: normalized.fromMe,
      messageTimestampMs: normalized.timestampMs,
      receivedAtMs,
      messageType: normalized.messageType,
      text: normalized.text,
      rawPayload: isRecord(sanitizedRaw) ? sanitizedRaw : null,
      normalizedPayload
    })

    if (!insertResult.inserted || typeof insertResult.id !== 'number') {
      this.metrics?.increment('messages.inbound.duplicate')
      return insertResult
    }

    const trimmedText = normalized.text?.trim()
    if (this.debounceStore && !normalized.fromMe && trimmedText) {
      try {
        await this.debounceStore.touch(normalized.sessionId, normalized.chatId, receivedAtMs)
      } catch (error) {
        this.logger.warn?.('Inbound debounce touch failed', {
          sessionId: normalized.sessionId,
          chatId: normalized.chatId,
          error: (error as Error).message
        })
      }
    }

    await this.chatService?.handleInboundMessage(normalized, true)
    await this.handleLeadIdentification(normalized)

    if (!normalized.fromMe && this.trafficStore && !isGroupChat(normalized.chatId) && !isBroadcastChat(normalized.chatId)) {
      try {
        await this.trafficStore.touchInbound(normalized.sessionId)
      } catch (error) {
        this.logger.warn?.('Traffic store touch failed', {
          sessionId: normalized.sessionId,
          chatId: normalized.chatId,
          error: (error as Error).message
        })
      }
    }

    if (!normalized.fromMe && this.inboundInterceptor) {
      const interception = await this.inboundInterceptor.handleInboundMessage(normalized)
      if (interception.handled) {
        return insertResult
      }
    }

    const queueItem = {
      sessionId: normalized.sessionId,
      chatId: normalized.chatId,
      inboundId: insertResult.id,
      messageId: normalized.messageId,
      enqueuedAtMs: receivedAtMs
    }

    const shouldRouteToMediaQueue = Boolean(
      this.mediaQueue &&
      !normalized.fromMe &&
      isSupportedInboundMediaForAi(normalized.messageType, normalized.raw)
    )
    const shouldEnqueue = !normalized.fromMe && Boolean(trimmedText) && !shouldRouteToMediaQueue
    if (shouldEnqueue) {
      await this.queue.enqueue(queueItem)
    }

    if (this.audioQueue && !normalized.fromMe && normalized.messageType === 'audioMessage') {
      try {
        await this.audioQueue.enqueue(queueItem)
        this.metrics?.increment('ai.audio.enqueued')
      } catch (error) {
        this.logger.warn?.('Audio queue enqueue failed', {
          sessionId: normalized.sessionId,
          chatId: normalized.chatId,
          inboundId: insertResult.id,
          error: (error as Error).message
        })
        this.metrics?.increment('ai.audio.enqueue_failed')
      }
    }

    if (shouldRouteToMediaQueue && this.mediaQueue) {
      try {
        await this.mediaQueue.enqueue(queueItem)
        this.metrics?.increment('ai.media.enqueued')
      } catch (error) {
        this.logger.warn?.('Media queue enqueue failed', {
          sessionId: normalized.sessionId,
          chatId: normalized.chatId,
          inboundId: insertResult.id,
          error: (error as Error).message
        })
        this.metrics?.increment('ai.media.enqueue_failed')
      }
    }

    this.logger.info?.('Inbound message stored', {
      sessionId: normalized.sessionId,
      chatId: normalized.chatId,
      messageId: normalized.messageId,
      inboundId: insertResult.id
    })
    this.metrics?.increment('messages.inbound.stored')

    return insertResult
  }

  private async handleLeadIdentification(normalized: NormalizedInboundMessage) {
    if (!this.leadStore) {
      return
    }

    if (normalized.fromMe) {
      return
    }

    const chatId = normalized.chatId
    if (isGroupChat(chatId) || isBroadcastChat(chatId)) {
      return
    }

    const name = resolveContactName(normalized.raw) ?? 'Sem nome'
    const whatsapp =
      extractPhoneDigitsFromJid(chatId) ??
      extractPhoneDigitsFromJid(normalized.chatIdAlt ?? '')
    const lastMessage = buildLastMessage(normalized.text, normalized.messageType)
    const now = Date.now()

    if (!whatsapp) {
      const reason = normalized.chatIdAlt ? 'format_unexpected' : 'no_pn_available'
      this.metrics?.increment('leads.whatsapp_missing')
      if (chatId.trim().toLowerCase().endsWith('@lid')) {
        this.metrics?.increment('leads.chatid_lid')
      }
      this.logger.info?.('Lead missing whatsapp (phone not available)', {
        sessionId: normalized.sessionId,
        chatIdHash: hashPayload(chatId).slice(0, 12),
        chatIdAltHash: normalized.chatIdAlt ? hashPayload(normalized.chatIdAlt).slice(0, 12) : null,
        reason
      })
    }

    try {
      await this.leadStore.upsertFromInbound({
        sessionId: normalized.sessionId,
        leadId: chatId,
        name,
        whatsapp,
        chatId,
        lastMessage,
        source: 'whatsapp',
        lastContactAtMs: now,
        createdAtMs: now
      })
      this.metrics?.increment('leads.upserted')
    } catch (error) {
      this.logger.warn?.('Lead upsert failed', { error: (error as Error).message, chatId })
      this.metrics?.increment('leads.failed')
    }
  }

  async compactAndExpire(retentionDays: number, compactAfterDays: number): Promise<void> {
    const { deleted, compacted } = await this.store.compactAndExpire(retentionDays, compactAfterDays)
    if (deleted || compacted) {
      this.logger.info?.('Inbound cleanup complete', { deleted, compacted })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isGroupChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@g.us')
}

function isBroadcastChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@broadcast')
}

function isStatusBroadcastChat(chatId: string) {
  return chatId.trim().toLowerCase() === 'status@broadcast'
}

function isSystemMessageType(messageType: string) {
  const normalized = messageType.trim()
  return (
    normalized === 'protocolMessage' ||
    normalized === 'placeholderMessage' ||
    normalized === 'templateMessage' ||
    normalized === 'senderKeyDistributionMessage' ||
    normalized === 'messageContextInfo' ||
    normalized === 'historySyncNotification'
  )
}

function shouldIgnoreInbound(normalized: NormalizedInboundMessage) {
  if (isStatusBroadcastChat(normalized.chatId)) {
    return true
  }

  if (isSystemMessageType(normalized.messageType)) {
    return true
  }

  return false
}

function resolveContactName(raw: Record<string, unknown>): string | null {
  const pushName = getString(raw.pushName)
  if (pushName) {
    return pushName
  }
  const notify = getString(raw.notify)
  if (notify) {
    return notify
  }
  const sender = raw.sender
  if (isRecord(sender)) {
    const senderPush = getString(sender.pushname)
    if (senderPush) {
      return senderPush
    }
    const formatted = getString(sender.formattedName)
    if (formatted) {
      return formatted
    }
    const name = getString(sender.name)
    if (name) {
      return name
    }
  }
  return null
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function buildLastMessage(text: string | null, messageType: string) {
  const raw = text && text.trim() ? text.trim() : `[${messageType}]`
  return raw.length > 100 ? raw.slice(0, 100) : raw
}

function isSupportedInboundMediaForAi(messageType: string, raw: Record<string, unknown>) {
  if (messageType === 'imageMessage') {
    return true
  }
  if (messageType !== 'documentMessage') {
    return false
  }
  return isPdfDocumentRaw(raw)
}

function isPdfDocumentRaw(raw: Record<string, unknown>) {
  const messageContainer = isRecord(raw.message) ? (raw.message as Record<string, unknown>) : null
  const message = unwrapMessage(messageContainer)
  const documentMessage = message && isRecord(message.documentMessage) ? (message.documentMessage as Record<string, unknown>) : null
  if (!documentMessage) {
    return false
  }

  const mimeType = (typeof documentMessage.mimetype === 'string' ? documentMessage.mimetype : '').trim().toLowerCase()
  const fileName = (typeof documentMessage.fileName === 'string' ? documentMessage.fileName : '').trim().toLowerCase()
  return mimeType === 'application/pdf' || fileName.endsWith('.pdf')
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
