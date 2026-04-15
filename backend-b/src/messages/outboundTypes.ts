export type OutboundMessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'retrying'
  | 'failed'

export type OutboundMessageOrigin = 'ai' | 'human_dashboard' | 'automation_api'

export type OutboundTextPayload = {
  type: 'text'
  text: string
  origin?: OutboundMessageOrigin
}

export type OutboundMediaType = 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage'
export type OutboundMediaStoragePolicy = 'ttl_15d' | 'ttl_30d'

export type OutboundAiFileType = 'image' | 'video' | 'audio' | 'document'

export type OutboundAiFileSnapshot = {
  id: string
  nome: string
  tipo: OutboundAiFileType
  mimeType: string
  sizeBytes: number
  descricao: string
  quandoUsar: string
  updatedAtMs: number | null
}

export type OutboundMediaPayload = {
  type: 'media'
  mediaType: OutboundMediaType
  url: string
  mimeType?: string
  fileName?: string
  caption?: string
  storagePolicy?: OutboundMediaStoragePolicy
  storageDeletedAtMs?: number
  aiFile?: OutboundAiFileSnapshot
  origin?: OutboundMessageOrigin
}

export type OutboundContactEntry = {
  name: string
  whatsapp: string
}

export type OutboundContactPayload = {
  type: 'contact'
  contacts: OutboundContactEntry[]
  displayName?: string
  origin?: OutboundMessageOrigin
}

export type OutboundMessagePayload = OutboundTextPayload | OutboundMediaPayload | OutboundContactPayload

export type OutboundMessageRecord = {
  id: number
  sessionId: string
  chatId: string
  requestId?: string
  payloadHash: string
  status: OutboundMessageStatus
  attempts: number
  messageId?: string | null
  error?: string | null
  payload: OutboundMessagePayload
  createdAtMs: number
  updatedAtMs: number
}

export type OutboundMessageInsert = {
  sessionId: string
  chatId: string
  requestId?: string
  payloadHash: string
  status: OutboundMessageStatus
  attempts: number
  messageId?: string | null
  error?: string | null
  payload: OutboundMessagePayload
  createdAtMs: number
  updatedAtMs: number
}

export type OutboundQueueItem = {
  outboundId: number
  sessionId: string
  chatId: string
  enqueuedAtMs: number
}
