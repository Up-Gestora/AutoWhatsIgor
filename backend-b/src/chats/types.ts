import type { OutboundAiFileSnapshot, OutboundMediaType, OutboundMessageStatus } from '../messages'

export type ChatMessageOrigin =
  | 'ai'
  | 'human_dashboard'
  | 'automation_api'
  | 'human_external'
  | 'inbound'
  | 'legacy_manual'

export type ChatMessageSummary = {
  id: string | null
  text: string | null
  type: string | null
  timestampMs: number | null
  fromMe: boolean | null
  origin?: ChatMessageOrigin
}

export type ChatSummary = {
  id: string
  name: string
  isGroup: boolean
  unreadCount: number
  manualUnread: boolean
  labels: ChatLabelSummary[]
  lastMessage: ChatMessageSummary | null
  lastActivityMs: number | null
}

export type ChatLabelSummary = {
  id: string
  name: string
  colorHex: string
}

export type ChatMessageMediaType = OutboundMediaType | 'stickerMessage'

export type ChatMessageMedia = {
  mediaType: ChatMessageMediaType
  mimeType?: string
  fileName?: string
  caption?: string
  sizeBytes?: number
  durationSec?: number
  aiFile?: OutboundAiFileSnapshot
}

export type ChatMessageContact = {
  displayName?: string
  contacts: Array<{
    name?: string
    whatsapp?: string
    vcard?: string
  }>
}

export type ChatMessage = {
  id: string
  chatId: string
  text: string | null
  type: string
  timestampMs: number
  fromMe: boolean
  media?: ChatMessageMedia
  mediaRef?: string
  contact?: ChatMessageContact
  messageId?: string | null
  requestId?: string | null
  status?: OutboundMessageStatus | null
  origin?: ChatMessageOrigin
}

export type ChatStateRow = {
  sessionId: string
  chatId: string
  chatName: string | null
  isGroup: boolean
  unreadCount: number
  manualUnread: boolean
  lastMessageId: string | null
  lastMessageText: string | null
  lastMessageType: string | null
  lastMessageFromMe: boolean | null
  lastMessageTsMs: number | null
  updatedAtMs: number | null
}

export type ChatStateUpsert = {
  sessionId: string
  chatId: string
  chatName?: string | null
  isGroup: boolean
  messageId?: string | null
  messageType?: string | null
  text?: string | null
  timestampMs: number
  fromMe: boolean
}

export type ChatMetadataUpsert = {
  sessionId: string
  chatId: string
  chatName: string | null
  isGroup: boolean
}
