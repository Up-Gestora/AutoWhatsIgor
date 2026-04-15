export type RawInboundMessage = Record<string, unknown>

export type NormalizedInboundMessage = {
  sessionId: string
  chatId: string
  chatIdAlt: string | null
  messageId: string | null
  senderId: string | null
  fromMe: boolean
  timestampMs: number
  messageType: string
  text: string | null
  raw: RawInboundMessage
}

export type InboundMessageInsert = {
  sessionId: string
  chatId: string
  messageId: string | null
  payloadHash: string
  senderId: string | null
  fromMe: boolean
  messageTimestampMs: number
  receivedAtMs: number
  messageType: string
  text: string | null
  rawPayload: Record<string, unknown> | null
  normalizedPayload: Record<string, unknown>
}

export type InboundMessageInsertResult = {
  inserted: boolean
  id?: number
}

export type InboundQueueItem = {
  sessionId: string
  chatId: string
  inboundId: number
  messageId: string | null
  enqueuedAtMs: number
}
