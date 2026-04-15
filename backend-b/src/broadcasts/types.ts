import type { SessionSendMediaType } from '../sessions/types'

export type BroadcastJobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'

export type BroadcastItemStatus = 'pending' | 'sent' | 'failed' | 'cancelled'

export type BroadcastMessagePayload =
  | {
      type: 'text'
      text: string
      removeContactIfLastMessageUndelivered?: boolean
    }
  | {
      type: 'media'
      mediaType: SessionSendMediaType
      url: string
      mimeType?: string
      fileName?: string
      caption?: string
      removeContactIfLastMessageUndelivered?: boolean
    }

export type BroadcastListRecord = {
  id: string
  sessionId: string
  name: string
  contactsCount: number
  createdAt: number | null
  updatedAt: number | null
}

export type BroadcastContactRecord = {
  id: string
  sessionId: string
  listId: string
  name: string | null
  whatsapp: string
  createdAt: number | null
  updatedAt: number | null
}

export type BroadcastJobRecord = {
  id: string
  sessionId: string
  listId: string
  status: BroadcastJobStatus
  pauseReason: string | null
  payload: BroadcastMessagePayload
  totalCount: number
  sentCount: number
  failedCount: number
  chargedBlocks: number
  createdAt: number | null
  updatedAt: number | null
  startedAt: number | null
  completedAt: number | null
  nextSendAt: number | null
}

export type BroadcastFailureRecord = {
  id: number
  sessionId: string
  jobId: string
  contactName: string | null
  whatsapp: string
  chatId: string
  error: string | null
  updatedAt: number | null
}
