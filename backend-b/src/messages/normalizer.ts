import type { NormalizedInboundMessage, RawInboundMessage } from './types'

type AnyRecord = Record<string, unknown>

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeChatJid(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const atIndex = trimmed.indexOf('@')
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return trimmed
  }

  const localPart = trimmed.slice(0, atIndex)
  const domainRaw = trimmed.slice(atIndex + 1)
  const domain = domainRaw.toLowerCase()

  if (domain === 's.whatsapp.net' || domain === 'c.us') {
    const localWithoutDevice = localPart.split(':')[0]?.trim() || localPart
    return `${localWithoutDevice}@s.whatsapp.net`
  }

  return `${localPart}@${domain}`
}

function resolveTimestamp(value: unknown): number | null {
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

  if (value && typeof value === 'object') {
    const maybeToNumber = (value as { toNumber?: () => number }).toNumber
    if (typeof maybeToNumber === 'function') {
      return maybeToNumber.call(value)
    }

    const low = (value as { low?: number }).low
    if (typeof low === 'number') {
      return low
    }
  }

  return null
}

function unwrapMessage(message: AnyRecord | null): AnyRecord | null {
  let current = message
  for (let i = 0; i < 4; i += 1) {
    if (!current) {
      return null
    }

    const ephemeral = current.ephemeralMessage
    if (isRecord(ephemeral) && isRecord(ephemeral.message)) {
      current = ephemeral.message as AnyRecord
      continue
    }

    const viewOnce = current.viewOnceMessage
    if (isRecord(viewOnce) && isRecord(viewOnce.message)) {
      current = viewOnce.message as AnyRecord
      continue
    }

    const viewOnceV2 = current.viewOnceMessageV2
    if (isRecord(viewOnceV2) && isRecord(viewOnceV2.message)) {
      current = viewOnceV2.message as AnyRecord
      continue
    }

    const viewOnceV2Extension = current.viewOnceMessageV2Extension
    if (isRecord(viewOnceV2Extension) && isRecord(viewOnceV2Extension.message)) {
      current = viewOnceV2Extension.message as AnyRecord
      continue
    }

    const documentWithCaption = current.documentWithCaptionMessage
    if (isRecord(documentWithCaption) && isRecord(documentWithCaption.message)) {
      current = documentWithCaption.message as AnyRecord
      continue
    }

    break
  }

  return current
}

function extractContent(message: AnyRecord | null): { messageType: string; text: string | null } {
  if (!message) {
    return { messageType: 'unknown', text: null }
  }

  if (typeof message.conversation === 'string') {
    return { messageType: 'conversation', text: message.conversation }
  }

  const extendedText = message.extendedTextMessage
  if (isRecord(extendedText) && typeof extendedText.text === 'string') {
    return { messageType: 'extendedTextMessage', text: extendedText.text }
  }

  const imageMessage = message.imageMessage
  if (isRecord(imageMessage) && typeof imageMessage.caption === 'string') {
    return { messageType: 'imageMessage', text: imageMessage.caption }
  }

  const videoMessage = message.videoMessage
  if (isRecord(videoMessage) && typeof videoMessage.caption === 'string') {
    return { messageType: 'videoMessage', text: videoMessage.caption }
  }

  const documentMessage = message.documentMessage
  if (isRecord(documentMessage) && typeof documentMessage.caption === 'string') {
    return { messageType: 'documentMessage', text: documentMessage.caption }
  }

  const buttonsResponse = message.buttonsResponseMessage
  if (isRecord(buttonsResponse) && typeof buttonsResponse.selectedDisplayText === 'string') {
    return { messageType: 'buttonsResponseMessage', text: buttonsResponse.selectedDisplayText }
  }

  const listResponse = message.listResponseMessage
  if (isRecord(listResponse) && typeof listResponse.title === 'string') {
    return { messageType: 'listResponseMessage', text: listResponse.title }
  }

  const templateButton = message.templateButtonReplyMessage
  if (isRecord(templateButton) && typeof templateButton.selectedDisplayText === 'string') {
    return { messageType: 'templateButtonReplyMessage', text: templateButton.selectedDisplayText }
  }

  const keys = Object.keys(message)
  if (keys.length > 0) {
    return { messageType: keys[0], text: null }
  }

  return { messageType: 'unknown', text: null }
}

export function normalizeBaileysMessage(sessionId: string, raw: unknown): NormalizedInboundMessage | null {
  if (!sessionId) {
    return null
  }

  if (!isRecord(raw)) {
    return null
  }

  const rawRecord: RawInboundMessage = raw
  const key = isRecord(rawRecord.key) ? rawRecord.key : null
  const senderId = normalizeChatJid(
    getString(key?.participant) ??
      getString(rawRecord.participant) ??
      getString(rawRecord.author) ??
      null
  )
  const participantPresent = Boolean(senderId)
  const normalizedRemoteJid =
    normalizeChatJid(getString(key?.remoteJid)) ??
    normalizeChatJid(getString(rawRecord.chatId) ?? getString(rawRecord.remoteJid) ?? null)
  const normalizedFromJid = normalizeChatJid(getString(rawRecord.from) ?? null)
  const canUseFromFallback = Boolean(
    normalizedFromJid &&
      (
        !participantPresent ||
        normalizedFromJid.endsWith('@g.us') ||
        normalizedFromJid.endsWith('@broadcast') ||
        normalizedFromJid !== senderId
      )
  )
  const chatId = normalizedRemoteJid ?? (canUseFromFallback ? normalizedFromJid : null)

  if (!chatId) {
    return null
  }

  const chatIdAlt = normalizeChatJid(
    getString((key as { remoteJidAlt?: unknown } | null)?.remoteJidAlt) ??
      getString((rawRecord as { remoteJidAlt?: unknown }).remoteJidAlt) ??
      null
  )

  const messageId = getString(key?.id) ?? getString(rawRecord.id)
  const fromMe =
    Boolean(key?.fromMe) ||
    Boolean(rawRecord.fromMe)

  const rawTimestamp = resolveTimestamp(rawRecord.messageTimestamp ?? rawRecord.timestamp)
  const timestamp = rawTimestamp ?? Date.now()
  const timestampMs = timestamp < 1e12 ? timestamp * 1000 : timestamp

  const messageContainer = isRecord(rawRecord.message) ? rawRecord.message : null
  const message = unwrapMessage(messageContainer)
  const { messageType, text } = extractContent(message)

  return {
    sessionId,
    chatId,
    chatIdAlt,
    messageId: messageId ?? null,
    senderId,
    fromMe,
    timestampMs,
    messageType,
    text,
    raw: rawRecord
  }
}
