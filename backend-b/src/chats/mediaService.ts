import type { InboundMessageStore, OutboundMessageStore } from '../messages'
import { loadBaileys } from '../sessions/baileysModule'
import { downloadToBuffer } from '../sessions/mediaDownloader'
import type { ChatMessageMedia } from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type ChatMediaServiceOptions = {
  inboundStore: InboundMessageStore
  outboundStore: OutboundMessageStore
  downloadTimeoutMs: number
  downloadMaxBytes: number
  logger?: Logger
}

type ChatMediaRefSource = 'inbound' | 'outbound'

type ChatMediaRef = {
  source: ChatMediaRefSource
  id: number
}

type InboundMediaMeta = {
  mediaType: ChatMessageMedia['mediaType']
  downloadType: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  mediaKey: Buffer
  directPath: string
  url?: string
  mimeType?: string
  fileName?: string
}

export type ChatMediaErrorCode =
  | 'not_found'
  | 'media_unavailable'
  | 'unsupported_media'
  | 'too_large'
  | 'media_download_failed'

export class ChatMediaError extends Error {
  readonly code: ChatMediaErrorCode

  constructor(code: ChatMediaErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

export type ChatMediaResult = {
  mediaType: ChatMessageMedia['mediaType']
  buffer: Buffer
  contentType: string
  fileName?: string
}

export class ChatMediaService {
  private readonly inboundStore: InboundMessageStore
  private readonly outboundStore: OutboundMessageStore
  private readonly downloadTimeoutMs: number
  private readonly downloadMaxBytes: number
  private readonly logger: Logger

  constructor(options: ChatMediaServiceOptions) {
    this.inboundStore = options.inboundStore
    this.outboundStore = options.outboundStore
    this.downloadTimeoutMs = Math.max(1000, Math.floor(options.downloadTimeoutMs))
    this.downloadMaxBytes = Math.max(1024, Math.floor(options.downloadMaxBytes))
    this.logger = options.logger ?? {}
  }

  async getMedia(sessionId: string, chatId: string, mediaRefRaw: string): Promise<ChatMediaResult> {
    const mediaRef = parseMediaRef(mediaRefRaw)
    if (!mediaRef) {
      throw new ChatMediaError('not_found')
    }

    if (mediaRef.source === 'inbound') {
      return this.getInboundMedia(sessionId, chatId, mediaRef)
    }

    return this.getOutboundMedia(sessionId, chatId, mediaRef)
  }

  private async getInboundMedia(sessionId: string, chatId: string, mediaRef: ChatMediaRef): Promise<ChatMediaResult> {
    const inbound = await this.inboundStore.getById(mediaRef.id)
    if (!inbound || inbound.sessionId !== sessionId || inbound.chatId !== chatId) {
      throw new ChatMediaError('not_found')
    }

    const raw = await this.inboundStore.getRawPayloadById(inbound.id)
    if (!raw) {
      throw new ChatMediaError('media_unavailable')
    }

    const meta = extractInboundMediaMeta(inbound.messageType, raw)
    if (!meta) {
      throw new ChatMediaError('media_unavailable')
    }

    const startedAt = Date.now()
    try {
      const baileys = await loadBaileys()
      const stream = await baileys.downloadContentFromMessage(
        {
          mediaKey: meta.mediaKey,
          directPath: meta.directPath,
          url: meta.url
        },
        meta.downloadType
      )

      const buffer = await readStreamToBuffer(stream as any, this.downloadMaxBytes, this.downloadTimeoutMs)
      const elapsedMs = Date.now() - startedAt
      this.logger.info?.('Chat media download completed', {
        sessionId,
        chatId,
        mediaRef: `${mediaRef.source}:${mediaRef.id}`,
        bytes: buffer.byteLength,
        elapsedMs
      })

      return {
        mediaType: meta.mediaType,
        buffer,
        contentType: normalizeContentType(meta.mimeType) ?? defaultContentType(meta.mediaType),
        ...(meta.fileName ? { fileName: meta.fileName } : {})
      }
    } catch (error) {
      throw this.mapDownloadError(error)
    }
  }

  private async getOutboundMedia(sessionId: string, chatId: string, mediaRef: ChatMediaRef): Promise<ChatMediaResult> {
    const outbound = await this.outboundStore.getById(mediaRef.id)
    if (!outbound || outbound.sessionId !== sessionId || outbound.chatId !== chatId) {
      throw new ChatMediaError('not_found')
    }

    const payload =
      outbound.payload && typeof outbound.payload === 'object' && !Array.isArray(outbound.payload)
        ? (outbound.payload as Record<string, unknown>)
        : null
    if (!payload || payload.type !== 'media') {
      throw new ChatMediaError('unsupported_media')
    }

    const url = parseOptionalString(payload.url)
    if (!url) {
      throw new ChatMediaError('media_unavailable')
    }

    const mediaType = parseKnownMediaType(payload.mediaType)
    if (!mediaType) {
      throw new ChatMediaError('unsupported_media')
    }

    const configuredMimeType = normalizeContentType(parseOptionalString(payload.mimeType))
    const fileName = parseOptionalString(payload.fileName)

    const startedAt = Date.now()
    try {
      const downloaded = await downloadToBuffer(url, {
        timeoutMs: this.downloadTimeoutMs,
        maxBytes: this.downloadMaxBytes
      })

      const elapsedMs = Date.now() - startedAt
      this.logger.info?.('Chat media download completed', {
        sessionId,
        chatId,
        mediaRef: `${mediaRef.source}:${mediaRef.id}`,
        bytes: downloaded.buffer.byteLength,
        elapsedMs
      })

      return {
        mediaType,
        buffer: downloaded.buffer,
        contentType: configuredMimeType ?? normalizeContentType(downloaded.contentType) ?? defaultContentType(mediaType),
        ...(fileName ? { fileName } : {})
      }
    } catch (error) {
      throw this.mapDownloadError(error)
    }
  }

  private mapDownloadError(error: unknown): ChatMediaError {
    const message = error instanceof Error ? error.message : ''
    if (message === 'too_large' || message === 'media_download_too_large') {
      return new ChatMediaError('too_large', message)
    }

    if (message === 'media_url_invalid') {
      return new ChatMediaError('media_unavailable', message)
    }

    if (message.startsWith('media_download_') || message === 'media_download_failed' || message === 'media_download_empty') {
      return new ChatMediaError('media_download_failed', message)
    }

    return new ChatMediaError('media_download_failed', message || 'media_download_failed')
  }
}

function parseMediaRef(value: string): ChatMediaRef | null {
  const match = String(value ?? '').trim().match(/^(inbound|outbound):(\d+)$/)
  if (!match) {
    return null
  }

  const id = Number(match[2])
  if (!Number.isInteger(id) || id <= 0) {
    return null
  }

  return {
    source: match[1] as ChatMediaRefSource,
    id
  }
}

function extractInboundMediaMeta(messageType: string, raw: Record<string, unknown>): InboundMediaMeta | null {
  const messageContainer = asRecord(raw.message)
  const message = unwrapMessage(messageContainer)
  if (!message) {
    return null
  }

  if (messageType === 'imageMessage') {
    return parseInboundMediaNode('imageMessage', 'image', asRecord(message.imageMessage))
  }

  if (messageType === 'videoMessage') {
    return parseInboundMediaNode('videoMessage', 'video', asRecord(message.videoMessage))
  }

  if (messageType === 'audioMessage') {
    return parseInboundMediaNode('audioMessage', 'audio', asRecord(message.audioMessage))
  }

  if (messageType === 'documentMessage') {
    return parseInboundMediaNode('documentMessage', 'document', asRecord(message.documentMessage))
  }

  if (messageType === 'stickerMessage') {
    return parseInboundMediaNode('stickerMessage', 'sticker', asRecord(message.stickerMessage))
  }

  return null
}

function parseInboundMediaNode(
  mediaType: ChatMessageMedia['mediaType'],
  downloadType: InboundMediaMeta['downloadType'],
  node: Record<string, unknown> | null
): InboundMediaMeta | null {
  if (!node) {
    return null
  }

  const mediaKey = decodeMediaKey(node.mediaKey)
  const directPath = parseOptionalString(node.directPath)
  const url = parseOptionalString(node.url)
  if (!mediaKey || !directPath) {
    return null
  }

  const mimeType = parseOptionalString(node.mimetype) ?? parseOptionalString(node.mimeType)
  const fileName = parseOptionalString(node.fileName)

  return {
    mediaType,
    downloadType,
    mediaKey,
    directPath,
    ...(url ? { url } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(fileName ? { fileName } : {})
  }
}

async function readStreamToBuffer(stream: AsyncIterable<unknown>, maxBytes: number, timeoutMs: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0

  let timer: NodeJS.Timeout | null = null
  try {
    const readPromise = (async () => {
      for await (const chunk of stream as any) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any)
        total += buf.byteLength
        if (total > maxBytes) {
          throw new Error('too_large')
        }
        chunks.push(buf)
      }

      if (total === 0) {
        throw new Error('media_download_empty')
      }

      return Buffer.concat(chunks, total)
    })()

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('media_download_timeout')), timeoutMs)
    })

    return await Promise.race([readPromise, timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
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

function normalizeContentType(value?: string | null): string | null {
  if (!value || typeof value !== 'string') {
    return null
  }

  const normalized = value.split(';')[0]?.trim().toLowerCase() ?? ''
  return normalized || null
}

function defaultContentType(mediaType: ChatMessageMedia['mediaType']): string {
  if (mediaType === 'imageMessage') {
    return 'image/jpeg'
  }
  if (mediaType === 'videoMessage') {
    return 'video/mp4'
  }
  if (mediaType === 'audioMessage') {
    return 'audio/ogg'
  }
  if (mediaType === 'stickerMessage') {
    return 'image/webp'
  }
  return 'application/octet-stream'
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed || undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
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
