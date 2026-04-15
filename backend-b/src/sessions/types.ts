export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'waiting_qr'
  | 'connected'
  | 'stopped'
  | 'error'
  | 'backoff'

export type SessionStatusSnapshot = {
  sessionId: string
  status: SessionStatus
  updatedAt: number
  reason?: string
}

export type SessionStartAttempt = {
  attemptId: string
  startedAt: number
  timeoutAt: number
  cancelled: boolean
  cancelReason?: string
}

export type SessionBackoffState = {
  failureCount: number
  lastFailureAt?: number
  backoffUntil?: number
}

export type SessionInboundMessage = unknown

export type SessionChatMetadataUpdate = {
  chatId: string
  chatName: string | null
  isGroup: boolean
}

export type SessionSendResult = {
  messageId?: string | null
  raw?: unknown
}

export type SessionSendMediaType = 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage'

export type SessionSendMediaUrlInput = {
  mediaType: SessionSendMediaType
  url: string
  mimeType?: string
  fileName?: string
  caption?: string
}

export type SessionSendMediaBufferInput = {
  mediaType: SessionSendMediaType
  data: Buffer
  mimeType?: string
  fileName?: string
  caption?: string
}

export type SessionSendMediaInput = SessionSendMediaUrlInput | SessionSendMediaBufferInput

export type SessionSendContact = {
  name: string
  whatsapp: string
}

export type SessionSendContactInput = {
  contacts: SessionSendContact[]
  displayName?: string
}

export type SessionWhatsappLookupResult = {
  phoneNumber: string
  jid: string
  exists: boolean
}

export type SessionMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'unknown'

export type SessionMessageStatusUpdate = {
  messageId?: string | null
  chatId?: string | null
  status: SessionMessageStatus
  raw?: unknown
}

export type SessionDriverHooks = {
  onQr?: (qr: string) => void
  onReady?: () => void
  onStatus?: (status: SessionStatus, reason?: string) => void
  onDisconnected?: (reason?: string) => void
  onError?: (error: Error) => void
  onPurgeRequested?: (reason: string) => void
  onMessage?: (message: SessionInboundMessage) => void
  onChatMetadata?: (update: SessionChatMetadataUpdate) => void
  onMessageStatus?: (update: SessionMessageStatusUpdate) => void
}

export interface SessionDriverHandle {
  stop(): Promise<void>
  sendText?(chatId: string, text: string): Promise<SessionSendResult>
  sendMedia?(chatId: string, input: SessionSendMediaInput): Promise<SessionSendResult>
  sendContact?(chatId: string, input: SessionSendContactInput): Promise<SessionSendResult>
  checkWhatsappNumbers?(phoneNumbers: string[]): Promise<SessionWhatsappLookupResult[]>
}

export interface SessionDriver {
  start(sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle>
}
