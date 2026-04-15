import type { InboundMessageStore, InboundMessageRow, NormalizedInboundMessage } from '../messages'
import type {
  OutboundAiFileSnapshot,
  OutboundMessageRecord,
  OutboundMessageStore,
  OutboundMessagePayload
} from '../messages'
import { ChatStateStore } from './store'
import { ChatLabelStore } from './labelStore'
import type {
  ChatStateRow,
  ChatMessage,
  ChatMessageContact,
  ChatMessageMedia,
  ChatMessageOrigin,
  ChatSummary
} from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type ChatServiceOptions = {
  stateStore: ChatStateStore
  labelStore?: ChatLabelStore
  inboundStore: InboundMessageStore
  outboundStore: OutboundMessageStore
  logger?: Logger
}

type ListMessagesOptions = {
  limit?: number
  beforeMs?: number
}

export class ChatService {
  private readonly stateStore: ChatStateStore
  private readonly labelStore?: ChatLabelStore
  private readonly inboundStore: InboundMessageStore
  private readonly outboundStore: OutboundMessageStore
  private readonly logger: Logger

  constructor(options: ChatServiceOptions) {
    this.stateStore = options.stateStore
    this.labelStore = options.labelStore
    this.inboundStore = options.inboundStore
    this.outboundStore = options.outboundStore
    this.logger = options.logger ?? {}
  }

  async handleInboundMessage(normalized: NormalizedInboundMessage, inserted: boolean): Promise<void> {
    if (!inserted) {
      return
    }

    const isGroup = isGroupChat(normalized.chatId)
    const chatName = extractChatName(normalized.raw, isGroup)

    await this.stateStore.upsertFromMessage(
      {
        sessionId: normalized.sessionId,
        chatId: normalized.chatId,
        chatName,
        isGroup,
        messageId: normalized.messageId ?? null,
        messageType: normalized.messageType,
        text: normalized.text ?? null,
        timestampMs: normalized.timestampMs,
        fromMe: normalized.fromMe
      },
      { incrementUnread: true }
    )
  }

  async handleChatMetadata(
    sessionId: string,
    update: {
      chatId: string
      chatName: string | null
      isGroup: boolean
    }
  ): Promise<void> {
    const chatId = typeof update.chatId === 'string' ? update.chatId.trim() : ''
    if (!sessionId || !chatId) {
      return
    }

    await this.stateStore.upsertMetadata({
      sessionId,
      chatId,
      chatName: update.chatName,
      isGroup: update.isGroup
    })
  }

  async handleOutboundMessage(record: OutboundMessageRecord): Promise<void> {
    const payload = record.payload as OutboundMessagePayload & { origin?: ChatMessageOrigin } & Record<string, any>
    const preview = resolveOutboundPayloadPreview(payload)
    await this.stateStore.upsertFromMessage(
      {
        sessionId: record.sessionId,
        chatId: record.chatId,
        chatName: null,
        isGroup: isGroupChat(record.chatId),
        messageId: record.messageId ?? null,
        messageType: preview.messageType,
        text: preview.text,
        timestampMs: record.createdAtMs,
        fromMe: true
      },
      { incrementUnread: false }
    )
  }

  async listChats(sessionId: string, limit = 50): Promise<ChatSummary[]> {
    let rows = await this.stateStore.listBySession(sessionId, limit)
    if (rows.length === 0) {
      await this.seedFromInbound(sessionId, limit)
      rows = await this.stateStore.listBySession(sessionId, limit)
    }
    rows = rows.filter((row) => !isNoiseSystemChatRow(row))

    let labelsByChat: Record<string, Array<{ id: string; name: string; colorHex: string }>> = {}
    if (this.labelStore && rows.length > 0) {
      try {
        labelsByChat = await this.labelStore.listByChatIds(
          sessionId,
          rows.map((row) => row.chatId)
        )
      } catch (error) {
        this.logger.warn?.('Chat labels list failed', {
          sessionId,
          error: (error as Error).message
        })
      }
    }

    return rows.map((row) => ({
      id: row.chatId,
      name: formatChatName(row.chatId, row.chatName),
      isGroup: row.isGroup,
      unreadCount: row.unreadCount,
      manualUnread: row.manualUnread,
      labels: labelsByChat[row.chatId] ?? [],
      lastMessage: row.lastMessageTsMs
        ? {
            id: row.lastMessageId ?? null,
            text: row.lastMessageText ?? null,
            type: row.lastMessageType ?? null,
            timestampMs: row.lastMessageTsMs ?? null,
            fromMe: row.lastMessageFromMe ?? null
          }
        : null,
      lastActivityMs: row.lastMessageTsMs ?? row.updatedAtMs
    }))
  }

  async listMessages(sessionId: string, chatId: string, options: ListMessagesOptions = {}): Promise<ChatMessage[]> {
    const limit = clampLimit(options.limit ?? 50, 1, 200)
    const fetchLimit = clampLimit(limit * 2, 20, 400)
    const beforeMs = options.beforeMs

    const inbound = await this.inboundStore.listRecentByChat(sessionId, chatId, fetchLimit, {
      beforeTimestampMs: beforeMs
    })
    const outbound = await this.outboundStore.listRecentByChat(sessionId, chatId, fetchLimit, {
      beforeTimestampMs: beforeMs
    })

    const merged = [
      ...mapInbound(inbound),
      ...mapOutbound(outbound)
    ].sort((a, b) => a.timestampMs - b.timestampMs)

    const byMessageId = new Map<string, ChatMessage>()
    const withoutId: ChatMessage[] = []

    for (const message of merged) {
      if (!message.messageId) {
        withoutId.push(message)
        continue
      }

      const existing = byMessageId.get(message.messageId)
      if (!existing || shouldPrefer(message, existing)) {
        byMessageId.set(message.messageId, message)
      }
    }

    const deduped = [...withoutId, ...Array.from(byMessageId.values())].sort(
      (a, b) => a.timestampMs - b.timestampMs
    )

    return deduped.slice(Math.max(0, deduped.length - limit))
  }

  async markRead(sessionId: string, chatId: string): Promise<void> {
    await this.stateStore.markRead(sessionId, chatId)
  }

  async markUnread(sessionId: string, chatId: string): Promise<void> {
    await this.stateStore.markUnread(sessionId, chatId)
  }

  private async seedFromInbound(sessionId: string, limit: number): Promise<void> {
    try {
      const snapshots = await this.inboundStore.listRecentChats(sessionId, limit)
      for (const snapshot of snapshots) {
        await this.stateStore.upsertFromMessage(
          {
            sessionId,
            chatId: snapshot.chatId,
            chatName: null,
            isGroup: isGroupChat(snapshot.chatId),
            messageId: snapshot.messageId ?? null,
            messageType: snapshot.messageType,
            text: snapshot.text ?? null,
            timestampMs: snapshot.messageTimestampMs,
            fromMe: snapshot.fromMe
          },
          { incrementUnread: false }
        )
      }
    } catch (error) {
      this.logger.warn?.('Chat seed failed', { sessionId, error: (error as Error).message })
    }
  }
}

function mapInbound(rows: InboundMessageRow[]): ChatMessage[] {
  return rows.map((row) => {
    const mediaMeta = mapInboundMedia(row)
    const contactMeta = mapInboundContact(row)
    const fallbackContactText = contactMeta ? resolveContactFallbackText(contactMeta) : null

    return {
      id: row.messageId ?? `inbound:${row.id}`,
      chatId: row.chatId,
      text: row.text ?? fallbackContactText ?? null,
      type: row.messageType,
      timestampMs: row.messageTimestampMs,
      fromMe: row.fromMe,
      ...(mediaMeta.media ? { media: mediaMeta.media } : {}),
      ...(mediaMeta.mediaRef ? { mediaRef: mediaMeta.mediaRef } : {}),
      ...(contactMeta ? { contact: contactMeta } : {}),
      messageId: row.messageId ?? null,
      origin: row.fromMe ? 'human_external' : 'inbound'
    }
  })
}

function mapOutbound(rows: OutboundMessageRecord[]): ChatMessage[] {
  return rows.map((row) => {
    const payload = row.payload as OutboundMessagePayload & { origin?: ChatMessageOrigin } & Record<string, any>
    const preview = resolveOutboundPayloadPreview(payload)
    const media = payload?.type === 'media' ? mapOutboundMedia(payload) : undefined
    const contact = payload?.type === 'contact' ? mapOutboundContact(payload) : undefined
    const fallbackContactText = contact ? resolveContactFallbackText(contact) : null

    return {
      id: row.messageId ?? `outbound:${row.id}`,
      chatId: row.chatId,
      text: preview.text ?? fallbackContactText ?? null,
      type: preview.messageType,
      timestampMs: row.createdAtMs,
      fromMe: true,
      ...(media ? { media, mediaRef: `outbound:${row.id}` } : {}),
      ...(contact ? { contact } : {}),
      messageId: row.messageId ?? null,
      requestId: row.requestId ?? null,
      status: row.status,
      origin: normalizeOutboundOrigin(payload?.origin)
    }
  })
}

function mapInboundMedia(row: InboundMessageRow): { media?: ChatMessageMedia; mediaRef?: string } {
  const mediaType = parseKnownMediaType(row.messageType)
  if (!mediaType) {
    return {}
  }

  const parsed = parseInboundMedia(row.messageType, row.rawPayload ?? null)
  return {
    media: parsed ?? { mediaType },
    mediaRef: `inbound:${row.id}`
  }
}

function parseInboundMedia(messageType: string, rawPayload: Record<string, unknown> | null): ChatMessageMedia | undefined {
  const message = extractInboundMessage(rawPayload)
  if (!message) {
    return undefined
  }

  if (messageType === 'imageMessage') {
    const raw = asRecord(message.imageMessage)
    if (!raw) {
      return undefined
    }
    const caption = parseOptionalString(raw.caption)
    const mimeType = parseOptionalString(raw.mimetype) ?? parseOptionalString(raw.mimeType)
    return {
      mediaType: 'imageMessage',
      ...(mimeType ? { mimeType } : {}),
      ...(caption ? { caption } : {}),
      ...parseInboundMediaShared(raw)
    }
  }

  if (messageType === 'videoMessage') {
    const raw = asRecord(message.videoMessage)
    if (!raw) {
      return undefined
    }
    const caption = parseOptionalString(raw.caption)
    const mimeType = parseOptionalString(raw.mimetype) ?? parseOptionalString(raw.mimeType)
    return {
      mediaType: 'videoMessage',
      ...(mimeType ? { mimeType } : {}),
      ...(caption ? { caption } : {}),
      ...parseInboundMediaShared(raw)
    }
  }

  if (messageType === 'audioMessage') {
    const raw = asRecord(message.audioMessage)
    if (!raw) {
      return undefined
    }
    const mimeType = parseOptionalString(raw.mimetype) ?? parseOptionalString(raw.mimeType)
    return {
      mediaType: 'audioMessage',
      ...(mimeType ? { mimeType } : {}),
      ...parseInboundMediaShared(raw)
    }
  }

  if (messageType === 'documentMessage') {
    const raw = asRecord(message.documentMessage)
    if (!raw) {
      return undefined
    }
    const caption = parseOptionalString(raw.caption)
    const mimeType = parseOptionalString(raw.mimetype) ?? parseOptionalString(raw.mimeType)
    const fileName = parseOptionalString(raw.fileName)
    return {
      mediaType: 'documentMessage',
      ...(mimeType ? { mimeType } : {}),
      ...(fileName ? { fileName } : {}),
      ...(caption ? { caption } : {}),
      ...parseInboundMediaShared(raw)
    }
  }

  if (messageType === 'stickerMessage') {
    const raw = asRecord(message.stickerMessage)
    if (!raw) {
      return undefined
    }
    const mimeType = parseOptionalString(raw.mimetype) ?? parseOptionalString(raw.mimeType) ?? 'image/webp'
    return {
      mediaType: 'stickerMessage',
      ...(mimeType ? { mimeType } : {}),
      ...parseInboundMediaShared(raw)
    }
  }

  return undefined
}

function parseInboundMediaShared(raw: Record<string, unknown>) {
  const sizeBytes = parseNumber(raw.fileLength)
  const durationSec = parseNumber(raw.seconds)

  return {
    ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    ...(typeof durationSec === 'number' ? { durationSec } : {})
  }
}

function mapInboundContact(row: InboundMessageRow): ChatMessageContact | undefined {
  if (row.messageType !== 'contactMessage' && row.messageType !== 'contactsArrayMessage') {
    return undefined
  }

  const message = extractInboundMessage(row.rawPayload ?? null)
  if (!message) {
    return row.text?.trim()
      ? {
          displayName: row.text.trim(),
          contacts: [{ name: row.text.trim() }]
        }
      : undefined
  }

  if (row.messageType === 'contactMessage') {
    const contactMessage = asRecord(message.contactMessage)
    if (!contactMessage) {
      return undefined
    }

    const displayName = parseOptionalString(contactMessage.displayName)
    const vcard = parseOptionalString(contactMessage.vcard)
    const single = parseVcardContact(vcard, displayName)
    if (!single && !displayName) {
      return undefined
    }

    return {
      ...(displayName ? { displayName } : {}),
      contacts: [
        single ?? {
          ...(displayName ? { name: displayName } : {})
        }
      ]
    }
  }

  const contactsArrayMessage = asRecord(message.contactsArrayMessage)
  if (!contactsArrayMessage) {
    return undefined
  }

  const displayName = parseOptionalString(contactsArrayMessage.displayName)
  const contactsRaw = Array.isArray(contactsArrayMessage.contacts) ? contactsArrayMessage.contacts : []
  const contacts = contactsRaw
    .map((entry) => {
      const rowEntry = asRecord(entry)
      if (!rowEntry) {
        return null
      }

      const contactDisplayName = parseOptionalString(rowEntry.displayName)
      const vcard = parseOptionalString(rowEntry.vcard)
      const parsed = parseVcardContact(vcard, contactDisplayName)
      if (parsed) {
        return parsed
      }

      if (!contactDisplayName) {
        return null
      }

      return { name: contactDisplayName }
    })
    .filter(Boolean) as ChatMessageContact['contacts']

  if (!displayName && contacts.length === 0) {
    return undefined
  }

  return {
    ...(displayName ? { displayName } : {}),
    contacts
  }
}

function resolveOutboundPayloadPreview(
  payload: OutboundMessagePayload & { origin?: ChatMessageOrigin } & Record<string, any>
): { messageType: string; text: string | null } {
  const kind = payload?.type
  if (kind === 'media') {
    return {
      messageType: payload.mediaType ?? 'documentMessage',
      text: typeof payload.caption === 'string' ? payload.caption : null
    }
  }

  if (kind === 'contact') {
    const rows = Array.isArray(payload.contacts) ? payload.contacts : []
    const firstName = typeof rows[0]?.name === 'string' ? rows[0].name : null
    const displayName = typeof payload.displayName === 'string' ? payload.displayName : null
    return {
      messageType: rows.length > 1 ? 'contactsArrayMessage' : 'contactMessage',
      text: displayName || firstName
    }
  }

  return {
    messageType: 'text',
    text: typeof payload.text === 'string' ? payload.text : null
  }
}

function mapOutboundMedia(payload: OutboundMessagePayload & Record<string, any>): ChatMessageMedia {
  const mediaType = parseOutboundMediaType(payload.mediaType)
  const mimeType = parseOptionalString(payload.mimeType)
  const fileName = parseOptionalString(payload.fileName)
  const caption = parseOptionalString(payload.caption)
  const sizeBytes = parseNumber(payload.sizeBytes)
  const durationSec = parseNumber(payload.durationSec) ?? parseNumber(payload.seconds)
  const aiFile = parseAiFileSnapshot(payload.aiFile)

  return {
    mediaType,
    ...(mimeType ? { mimeType } : {}),
    ...(fileName ? { fileName } : {}),
    ...(caption ? { caption } : {}),
    ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    ...(typeof durationSec === 'number' ? { durationSec } : {}),
    ...(aiFile ? { aiFile } : {})
  }
}

function mapOutboundContact(payload: OutboundMessagePayload & Record<string, any>): ChatMessageContact | undefined {
  const displayName = parseOptionalString(payload.displayName)
  const rows = Array.isArray(payload.contacts) ? payload.contacts : []

  const contacts = rows
    .map((row) => {
      const rowRecord = asRecord(row)
      if (!rowRecord) {
        return null
      }

      const name = parseOptionalString(rowRecord.name)
      const whatsapp = parseOptionalString(rowRecord.whatsapp)
      if (!name && !whatsapp) {
        return null
      }

      return {
        ...(name ? { name } : {}),
        ...(whatsapp ? { whatsapp } : {})
      }
    })
    .filter(Boolean) as ChatMessageContact['contacts']

  if (!displayName && contacts.length === 0) {
    return undefined
  }

  return {
    ...(displayName ? { displayName } : {}),
    contacts
  }
}

function resolveContactFallbackText(contact: ChatMessageContact): string | null {
  const display = contact.displayName?.trim()
  if (display) {
    return display
  }

  for (const row of contact.contacts) {
    if (row.name?.trim()) {
      return row.name.trim()
    }
    if (row.whatsapp?.trim()) {
      return row.whatsapp.trim()
    }
  }

  return null
}

function parseKnownMediaType(value: unknown): ChatMessageMedia['mediaType'] | null {
  if (
    value === 'imageMessage' ||
    value === 'videoMessage' ||
    value === 'audioMessage' ||
    value === 'documentMessage' ||
    value === 'stickerMessage'
  ) {
    return value
  }
  return null
}

function parseOutboundMediaType(value: unknown): ChatMessageMedia['mediaType'] {
  if (value === 'imageMessage' || value === 'videoMessage' || value === 'audioMessage' || value === 'documentMessage') {
    return value
  }
  return 'documentMessage'
}

function parseAiFileSnapshot(value: unknown): OutboundAiFileSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const raw = value as Record<string, unknown>
  const id = parseOptionalString(raw.id)
  const nome = parseOptionalString(raw.nome)
  const tipo = parseAiFileType(raw.tipo)
  const mimeType = parseOptionalString(raw.mimeType) ?? ''
  const sizeBytes = parseNumber(raw.sizeBytes) ?? 0
  const descricao = parseOptionalString(raw.descricao) ?? ''
  const quandoUsar = parseOptionalString(raw.quandoUsar) ?? ''
  const updatedAtMs = parseNullableNumber(raw.updatedAtMs)

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

function parseAiFileType(value: unknown): OutboundAiFileSnapshot['tipo'] | null {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'document') {
    return value
  }
  return null
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value)
    return normalized >= 0 ? normalized : 0
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }

  if (typeof value === 'bigint') {
    const converted = Number(value)
    if (Number.isFinite(converted)) {
      return Math.max(0, Math.floor(converted))
    }
  }

  if (value && typeof value === 'object') {
    const maybeToNumber = (value as { toNumber?: () => number }).toNumber
    if (typeof maybeToNumber === 'function') {
      try {
        const fromMethod = maybeToNumber.call(value)
        if (Number.isFinite(fromMethod)) {
          return Math.max(0, Math.floor(fromMethod))
        }
      } catch {
        // Ignore conversion errors.
      }
    }

    const low = (value as { low?: unknown }).low
    if (typeof low === 'number' && Number.isFinite(low)) {
      return Math.max(0, Math.floor(low))
    }
  }

  return undefined
}

function parseNullableNumber(value: unknown): number | null {
  const parsed = parseNumber(value)
  return typeof parsed === 'number' ? parsed : null
}

function shouldPrefer(next: ChatMessage, current: ChatMessage): boolean {
  if (
    current.origin === 'human_external' &&
    next.fromMe &&
    next.origin !== 'human_external'
  ) {
    return true
  }
  if (
    next.origin === 'human_external' &&
    current.fromMe &&
    current.origin !== 'human_external'
  ) {
    return false
  }

  const nextHasMedia = Boolean(next.media)
  const currentHasMedia = Boolean(current.media)
  if (nextHasMedia !== currentHasMedia) {
    return nextHasMedia
  }

  const nextHasContact = Boolean(next.contact)
  const currentHasContact = Boolean(current.contact)
  if (nextHasContact !== currentHasContact) {
    return nextHasContact
  }

  const nextHasMediaRef = Boolean(next.mediaRef)
  const currentHasMediaRef = Boolean(current.mediaRef)
  if (nextHasMediaRef !== currentHasMediaRef) {
    return nextHasMediaRef
  }

  if (next.origin === 'ai' && current.origin !== 'ai') {
    return true
  }
  if (current.origin === 'ai' && next.origin !== 'ai') {
    return false
  }

  const nextHasRequestId = Boolean(next.requestId)
  const currentHasRequestId = Boolean(current.requestId)
  if (nextHasRequestId !== currentHasRequestId) {
    return nextHasRequestId
  }
  return next.timestampMs >= current.timestampMs
}

function normalizeOutboundOrigin(value: unknown): ChatMessageOrigin {
  if (value === 'ai' || value === 'human_dashboard' || value === 'automation_api') {
    return value
  }
  return 'legacy_manual'
}

function extractChatName(raw: unknown, isGroup: boolean): string | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const chatName = (raw as { chatName?: unknown }).chatName
  if (typeof chatName === 'string' && chatName.trim()) {
    return chatName.trim()
  }

  const groupName = (raw as { groupName?: unknown }).groupName
  if (typeof groupName === 'string' && groupName.trim()) {
    return groupName.trim()
  }

  if (isGroup) {
    return null
  }

  const pushName = (raw as { pushName?: unknown }).pushName
  if (typeof pushName === 'string' && pushName.trim()) {
    return pushName.trim()
  }

  const notify = (raw as { notify?: unknown }).notify
  if (typeof notify === 'string' && notify.trim()) {
    return notify.trim()
  }

  return null
}

function formatChatName(chatId: string, fallback: string | null): string {
  const safeFallback = fallback?.trim() || ''
  if (safeFallback && !isTechnicalFallbackName(chatId, safeFallback)) {
    return safeFallback
  }

  const trimmed = chatId.trim()
  if (!trimmed) {
    return 'Sem nome'
  }

  if (trimmed.endsWith('@g.us')) {
    return 'Grupo sem nome'
  }

  if (trimmed.endsWith('@s.whatsapp.net') || trimmed.endsWith('@c.us')) {
    return 'Contato sem nome'
  }

  return 'Sem nome'
}

function isGroupChat(chatId: string): boolean {
  return chatId.trim().toLowerCase().endsWith('@g.us')
}

function isTechnicalFallbackName(chatId: string, value: string): boolean {
  const fallback = value.trim()
  if (!fallback) {
    return true
  }

  const trimmedChatId = chatId.trim()
  if (!trimmedChatId) {
    return false
  }

  const chatLower = trimmedChatId.toLowerCase()
  const fallbackLower = fallback.toLowerCase()
  if (fallbackLower === chatLower) {
    return true
  }

  const localPart = trimmedChatId.split('@')[0]?.trim() || ''
  if (localPart && fallbackLower === localPart.toLowerCase()) {
    return true
  }

  if (chatLower.endsWith('@g.us') && fallbackLower === `grupo ${localPart.toLowerCase()}`) {
    return true
  }

  return false
}

function isNoiseSystemChatRow(row: ChatStateRow): boolean {
  const type = (row.lastMessageType ?? '').trim()
  if (type !== 'placeholderMessage' && type !== 'templateMessage') {
    return false
  }

  const safeName = row.chatName?.trim() || ''
  const hasResolvedName = Boolean(safeName && !isTechnicalFallbackName(row.chatId, safeName))
  return !hasResolvedName
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractInboundMessage(rawPayload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!rawPayload) {
    return null
  }

  const messageContainer = asRecord(rawPayload.message)
  return unwrapMessage(messageContainer)
}

function unwrapMessage(message: Record<string, unknown> | null): Record<string, unknown> | null {
  let current = message
  for (let i = 0; i < 4; i += 1) {
    if (!current) {
      return null
    }

    const ephemeral = asRecord(current.ephemeralMessage)
    const ephemeralMessage = ephemeral ? asRecord(ephemeral.message) : null
    if (ephemeralMessage) {
      current = ephemeralMessage
      continue
    }

    const viewOnce = asRecord(current.viewOnceMessage)
    const viewOnceMessage = viewOnce ? asRecord(viewOnce.message) : null
    if (viewOnceMessage) {
      current = viewOnceMessage
      continue
    }

    const viewOnceV2 = asRecord(current.viewOnceMessageV2)
    const viewOnceV2Message = viewOnceV2 ? asRecord(viewOnceV2.message) : null
    if (viewOnceV2Message) {
      current = viewOnceV2Message
      continue
    }

    const viewOnceV2Extension = asRecord(current.viewOnceMessageV2Extension)
    const viewOnceV2ExtensionMessage = viewOnceV2Extension ? asRecord(viewOnceV2Extension.message) : null
    if (viewOnceV2ExtensionMessage) {
      current = viewOnceV2ExtensionMessage
      continue
    }

    const documentWithCaption = asRecord(current.documentWithCaptionMessage)
    const documentWithCaptionMessage = documentWithCaption ? asRecord(documentWithCaption.message) : null
    if (documentWithCaptionMessage) {
      current = documentWithCaptionMessage
      continue
    }

    break
  }

  return current
}

function parseVcardContact(vcard: string | undefined, displayName: string | undefined) {
  const cleanVcard = vcard?.trim()
  const name = parseVcardName(cleanVcard) ?? displayName
  const whatsapp = parseVcardWhatsapp(cleanVcard)
  if (!name && !whatsapp && !cleanVcard) {
    return null
  }

  return {
    ...(name ? { name } : {}),
    ...(whatsapp ? { whatsapp } : {}),
    ...(cleanVcard ? { vcard: cleanVcard } : {})
  }
}

function parseVcardName(vcard?: string): string | undefined {
  if (!vcard) {
    return undefined
  }

  const fnMatch = vcard.match(/^FN:(.+)$/im)
  if (!fnMatch?.[1]) {
    return undefined
  }

  const value = fnMatch[1]
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .trim()

  return value || undefined
}

function parseVcardWhatsapp(vcard?: string): string | undefined {
  if (!vcard) {
    return undefined
  }

  const waidMatch = vcard.match(/waid=(\d{7,15})/i)
  if (waidMatch?.[1]) {
    return waidMatch[1]
  }

  const telLines = vcard.split(/\r?\n/)
  for (const line of telLines) {
    if (!/^TEL/i.test(line.trim())) {
      continue
    }
    const digits = line.replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) {
      return digits
    }
  }

  return undefined
}
