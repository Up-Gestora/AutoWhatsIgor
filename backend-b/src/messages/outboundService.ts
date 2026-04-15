import { hashPayload } from './json'
import type { SessionMessageStatusUpdate } from '../sessions'
import type { OutboundMessageQueue } from './outboundQueue'
import type { OutboundMessageStore } from './outboundStore'
import type {
  OutboundAiFileSnapshot,
  OutboundAiFileType,
  OutboundContactEntry,
  OutboundMediaStoragePolicy,
  OutboundMediaType,
  OutboundMessageOrigin,
  OutboundMessageRecord,
  OutboundMessageStatus
} from './outboundTypes'
import type { MetricsStore } from '../observability/metrics'
import type { ChatService } from '../chats'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type EnqueueTextParams = {
  sessionId: string
  chatId: string
  text: string
  idempotencyKey?: string
  origin?: OutboundMessageOrigin
}

type EnqueueMediaParams = {
  sessionId: string
  chatId: string
  mediaType: OutboundMediaType
  url: string
  mimeType?: string
  fileName?: string
  caption?: string
  storagePolicy?: OutboundMediaStoragePolicy
  aiFile?: OutboundAiFileSnapshot
  idempotencyKey?: string
  origin?: OutboundMessageOrigin
}

type EnqueueContactParams = {
  sessionId: string
  chatId: string
  contacts: Array<{ name: string; whatsapp: string }>
  displayName?: string
  idempotencyKey?: string
  origin?: OutboundMessageOrigin
}

type OutboundMessageServiceOptions = {
  store: OutboundMessageStore
  queue: OutboundMessageQueue
  logger?: Logger
  metrics?: MetricsStore
  chatService?: ChatService
}

export class OutboundMessageService {
  private readonly store: OutboundMessageStore
  private readonly queue: OutboundMessageQueue
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly chatService?: ChatService

  constructor(options: OutboundMessageServiceOptions) {
    this.store = options.store
    this.queue = options.queue
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.chatService = options.chatService
  }

  async enqueue(params: EnqueueTextParams): Promise<OutboundMessageRecord> {
    return this.enqueueText(params)
  }

  async enqueueText(params: EnqueueTextParams): Promise<OutboundMessageRecord> {
    const sessionId = params.sessionId.trim()
    const chatId = params.chatId.trim()
    const text = params.text.trim()
    const requestId = params.idempotencyKey?.trim()

    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!chatId) {
      throw new Error('chatId is required')
    }
    if (!text) {
      throw new Error('text is required')
    }

    if (requestId) {
      const existing = await this.store.findByRequestId(sessionId, requestId)
      if (existing) {
        this.metrics?.increment('messages.outbound.idempotent')
        return existing
      }
    }

    const origin = params.origin ?? 'automation_api'
    const payload = { type: 'text' as const, text, origin }
    const payloadHash = hashPayload({ sessionId, chatId, payload })
    const now = Date.now()

    const record = await this.store.insert({
      sessionId,
      chatId,
      requestId: requestId || undefined,
      payloadHash,
      status: 'queued',
      attempts: 0,
      messageId: null,
      error: null,
      payload,
      createdAtMs: now,
      updatedAtMs: now
    })

    await this.queue.enqueue({
      outboundId: record.id,
      sessionId,
      chatId,
      enqueuedAtMs: now
    })

    await this.chatService?.handleOutboundMessage(record)

    this.logger.info?.('Outbound message queued', {
      outboundId: record.id,
      sessionId,
      chatId
    })
    this.metrics?.increment('messages.outbound.queued')

    return record
  }

  async enqueueMedia(params: EnqueueMediaParams): Promise<OutboundMessageRecord> {
    const sessionId = params.sessionId.trim()
    const chatId = params.chatId.trim()
    const url = params.url.trim()
    const mediaType = params.mediaType
    const mimeType = params.mimeType?.trim() || undefined
    const fileName = params.fileName?.trim() || undefined
    const caption = params.caption?.trim() || undefined
    const storagePolicy = normalizeStoragePolicy(params.storagePolicy)
    const aiFile = sanitizeAiFileSnapshot(params.aiFile)
    const requestId = params.idempotencyKey?.trim()

    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!chatId) {
      throw new Error('chatId is required')
    }
    if (!url) {
      throw new Error('url is required')
    }

    if (requestId) {
      const existing = await this.store.findByRequestId(sessionId, requestId)
      if (existing) {
        this.metrics?.increment('messages.outbound.idempotent')
        return existing
      }
    }

    const origin = params.origin ?? 'automation_api'
    const payload = {
      type: 'media' as const,
      mediaType,
      url,
      ...(mimeType ? { mimeType } : {}),
      ...(fileName ? { fileName } : {}),
      ...(caption ? { caption } : {}),
      ...(storagePolicy ? { storagePolicy } : {}),
      ...(aiFile ? { aiFile } : {}),
      origin
    }
    const payloadHash = hashPayload({ sessionId, chatId, payload })
    const now = Date.now()

    const record = await this.store.insert({
      sessionId,
      chatId,
      requestId: requestId || undefined,
      payloadHash,
      status: 'queued',
      attempts: 0,
      messageId: null,
      error: null,
      payload,
      createdAtMs: now,
      updatedAtMs: now
    })

    await this.queue.enqueue({
      outboundId: record.id,
      sessionId,
      chatId,
      enqueuedAtMs: now
    })

    await this.chatService?.handleOutboundMessage(record)

    this.logger.info?.('Outbound media queued', {
      outboundId: record.id,
      sessionId,
      chatId,
      mediaType
    })
    this.metrics?.increment('messages.outbound.queued')

    return record
  }

  async enqueueContact(params: EnqueueContactParams): Promise<OutboundMessageRecord> {
    const sessionId = params.sessionId.trim()
    const chatId = params.chatId.trim()
    const requestId = params.idempotencyKey?.trim()
    const contacts = normalizeContactEntries(params.contacts)
    const displayNameRaw = params.displayName?.trim()
    const displayName =
      displayNameRaw ||
      (contacts.length === 1 ? contacts[0].name : `${contacts.length} contatos`)

    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!chatId) {
      throw new Error('chatId is required')
    }
    if (contacts.length === 0) {
      throw new Error('contacts is required')
    }
    if (contacts.length > 3) {
      throw new Error('contacts_limit_exceeded')
    }

    if (requestId) {
      const existing = await this.store.findByRequestId(sessionId, requestId)
      if (existing) {
        this.metrics?.increment('messages.outbound.idempotent')
        return existing
      }
    }

    const origin = params.origin ?? 'automation_api'
    const payload = {
      type: 'contact' as const,
      contacts,
      ...(displayName ? { displayName } : {}),
      origin
    }
    const payloadHash = hashPayload({ sessionId, chatId, payload })
    const now = Date.now()

    const record = await this.store.insert({
      sessionId,
      chatId,
      requestId: requestId || undefined,
      payloadHash,
      status: 'queued',
      attempts: 0,
      messageId: null,
      error: null,
      payload,
      createdAtMs: now,
      updatedAtMs: now
    })

    await this.queue.enqueue({
      outboundId: record.id,
      sessionId,
      chatId,
      enqueuedAtMs: now
    })

    await this.chatService?.handleOutboundMessage(record)

    this.logger.info?.('Outbound contact queued', {
      outboundId: record.id,
      sessionId,
      chatId,
      contactsCount: contacts.length
    })
    this.metrics?.increment('messages.outbound.queued')

    return record
  }

  async handleStatusUpdate(sessionId: string, update: SessionMessageStatusUpdate): Promise<void> {
    if (!update.messageId) {
      return
    }

    const mapped = mapStatus(update.status)
    if (!mapped) {
      return
    }

    await this.store.updateStatusByMessageId(sessionId, update.messageId, mapped)
    this.metrics?.increment(`messages.outbound.status.${mapped}`)
  }
}

function normalizeContactEntries(entries: Array<{ name: string; whatsapp: string }>): OutboundContactEntry[] {
  if (!Array.isArray(entries)) {
    return []
  }

  const unique = new Map<string, OutboundContactEntry>()
  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    const whatsapp = normalizeWhatsappDigits(entry?.whatsapp)
    if (!name) {
      throw new Error('contact_name_required')
    }
    if (!whatsapp) {
      throw new Error('invalid_whatsapp')
    }
    if (!unique.has(whatsapp)) {
      unique.set(whatsapp, { name, whatsapp })
    }
  }

  return Array.from(unique.values())
}

function normalizeWhatsappDigits(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    return null
  }
  return digits
}

function normalizeStoragePolicy(value: unknown): OutboundMediaStoragePolicy | undefined {
  if (value === 'ttl_15d' || value === 'ttl_30d') {
    return value
  }
  return undefined
}

function mapStatus(status: SessionMessageStatusUpdate['status']): OutboundMessageStatus | null {
  switch (status) {
    case 'pending':
      return 'sending'
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
      return 'failed'
    default:
      return null
  }
}

const AI_FILE_MAX_ID = 120
const AI_FILE_MAX_NAME = 200
const AI_FILE_MAX_MIME = 120
const AI_FILE_MAX_DESCRICAO = 1000
const AI_FILE_MAX_QUANDO_USAR = 1000

function sanitizeAiFileSnapshot(value?: OutboundAiFileSnapshot): OutboundAiFileSnapshot | undefined {
  if (!value) {
    return undefined
  }

  const id = truncateField(value.id, AI_FILE_MAX_ID)
  const nome = truncateField(value.nome, AI_FILE_MAX_NAME)
  const tipo = normalizeAiFileType(value.tipo)
  const mimeType = truncateField(value.mimeType, AI_FILE_MAX_MIME)
  const descricao = truncateField(value.descricao, AI_FILE_MAX_DESCRICAO)
  const quandoUsar = truncateField(value.quandoUsar, AI_FILE_MAX_QUANDO_USAR)
  const sizeBytes = normalizeSizeBytes(value.sizeBytes)
  const updatedAtMs = normalizeUpdatedAtMs(value.updatedAtMs)

  if (!id || !nome || !tipo) {
    return undefined
  }

  return {
    id,
    nome,
    tipo,
    mimeType,
    sizeBytes,
    descricao,
    quandoUsar,
    updatedAtMs
  }
}

function normalizeAiFileType(value: string): OutboundAiFileType | null {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'document') {
    return value
  }
  return null
}

function normalizeSizeBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : 0
}

function normalizeUpdatedAtMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return Math.floor(value)
}

function truncateField(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return trimmed.slice(0, maxLength)
}
