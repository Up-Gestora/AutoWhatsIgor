import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import pino from 'pino'
import type { AuthStateStore } from '../auth'
import { buildBaileysAuthState } from './baileysAuth'
import { loadBaileys } from './baileysModule'
import { createBadDecryptAutoPurger } from './badDecryptAutoPurge'
import { resolveAudioMediaOptions } from './audioMedia'
import { downloadToBuffer } from './mediaDownloader'
import type { SessionDriver, SessionDriverHandle, SessionDriverHooks, SessionWhatsappLookupResult } from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type BaileysSessionDriverOptions = {
  authStore: AuthStateStore
  logger?: Logger
  logLevel?: string
  browserInfo?: [string, string, string]
  mediaDownloadTimeoutMs?: number
  mediaDownloadMaxBytes?: number
  autoPurgeBadDecryptEnabled?: boolean
  autoPurgeBadDecryptThreshold?: number
  autoPurgeBadDecryptWindowMs?: number
}

export class BaileysSessionDriver implements SessionDriver {
  private readonly authStore: AuthStateStore
  private readonly logger: Logger
  private readonly logLevel: string
  private readonly browserInfo: [string, string, string]
  private readonly mediaDownloadTimeoutMs: number
  private readonly mediaDownloadMaxBytes: number
  private readonly autoPurgeBadDecryptEnabled: boolean
  private readonly autoPurgeBadDecryptThreshold: number
  private readonly autoPurgeBadDecryptWindowMs: number

  constructor(options: BaileysSessionDriverOptions) {
    this.authStore = options.authStore
    this.logger = options.logger ?? {}
    this.logLevel = options.logLevel ?? 'warn'
    this.browserInfo = options.browserInfo ?? ['AutoWhats', 'Chrome', '1.0.0']
    this.mediaDownloadTimeoutMs = Math.max(1000, Math.floor(options.mediaDownloadTimeoutMs ?? 20000))
    this.mediaDownloadMaxBytes = Math.max(1, Math.floor(options.mediaDownloadMaxBytes ?? 16777216))
    this.autoPurgeBadDecryptEnabled = options.autoPurgeBadDecryptEnabled === true
    this.autoPurgeBadDecryptThreshold = Math.max(1, Math.floor(options.autoPurgeBadDecryptThreshold ?? 3))
    this.autoPurgeBadDecryptWindowMs = Math.max(1000, Math.floor(options.autoPurgeBadDecryptWindowMs ?? 120000))
  }

  async start(sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
    const { state, saveState } = await buildBaileysAuthState(sessionId, this.authStore)
    const baileys = await loadBaileys()
    const { fetchLatestBaileysVersion, DisconnectReason, WAMessageStatus } = baileys
    const makeWASocket = baileys.default
    if (typeof makeWASocket !== 'function') {
      throw new Error('Baileys default export not available')
    }

    let activeSocket: WASocket | null = null
    let stopped = false
    let reconnectTimer: NodeJS.Timeout | undefined
    let reconnectAttempt = 0
    const chatNameByJid = new Map<string, string>()
    const contactNameByJid = new Map<string, string>()

    const emitChatMetadata = (rawChatId: unknown, rawChatName: unknown, isGroup: boolean) => {
      const chatId = normalizeChatJid(rawChatId)
      const chatName = normalizeDisplayName(rawChatName)
      if (!chatId || !chatName) {
        return
      }

      if (isGroup) {
        chatNameByJid.set(chatId, chatName)
      } else {
        contactNameByJid.set(chatId, chatName)
      }

      hooks.onChatMetadata?.({
        chatId,
        chatName,
        isGroup
      })
    }

    const applyCachedMetadataToMessage = (message: WAMessage) => {
      if (!message || typeof message !== 'object') {
        return
      }

      const key = (message as { key?: { remoteJid?: unknown } }).key
      const remoteJid = normalizeChatJid(key?.remoteJid)
      if (!remoteJid) {
        return
      }

      const isGroup = remoteJid.endsWith('@g.us')
      const cachedName = isGroup ? chatNameByJid.get(remoteJid) : contactNameByJid.get(remoteJid)
      if (!cachedName) {
        return
      }

      const messageRecord = message as unknown as Record<string, unknown>
      if (!isGroup && typeof messageRecord.pushName !== 'string') {
        messageRecord.pushName = cachedName
      }
      if (typeof messageRecord.notify !== 'string') {
        messageRecord.notify = cachedName
      }
      if (typeof messageRecord.chatName !== 'string') {
        messageRecord.chatName = cachedName
      }
    }
    const autoPurger = this.autoPurgeBadDecryptEnabled
      ? createBadDecryptAutoPurger({
          threshold: this.autoPurgeBadDecryptThreshold,
          windowMs: this.autoPurgeBadDecryptWindowMs,
          onTrigger: (event) => {
            this.logger.warn?.('Baileys bad decrypt detected; requesting auto-purge', {
              sessionId,
              ...event
            })

            if (!stopped) {
              stopped = true
              clearReconnectTimer()
            }

            if (activeSocket) {
              detachListeners(activeSocket)
              void closeSocket(activeSocket)
              activeSocket = null
            }

            setTimeout(() => {
              hooks.onPurgeRequested?.('bad-decrypt')
            }, 0)
          }
        })
      : null

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    }

    const persistState = async () => {
      try {
        await saveState()
      } catch (error) {
        this.logger.error?.('Failed to persist auth state', {
          sessionId,
          error: (error as Error).message
        })
      }
    }

    const clearAuthState = async (reason: string) => {
      try {
        await this.authStore.delete(sessionId)
        this.logger.warn?.('Auth state cleared', { sessionId, reason })
      } catch (error) {
        this.logger.error?.('Failed to clear auth state', {
          sessionId,
          reason,
          error: (error as Error).message
        })
      }
    }

    const handleMessage = (message: WAMessage) => {
      hooks.onMessage?.(message)
    }

    const mapStatus = (status?: number) => {
      switch (status) {
        case WAMessageStatus.ERROR:
          return 'failed'
        case WAMessageStatus.PENDING:
          return 'pending'
        case WAMessageStatus.SERVER_ACK:
          return 'sent'
        case WAMessageStatus.DELIVERY_ACK:
          return 'delivered'
        case WAMessageStatus.READ:
        case WAMessageStatus.PLAYED:
          return 'read'
        default:
          return 'unknown'
      }
    }

    const resolveDisconnectReason = (error?: Error): string => {
      const statusCode = (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
      if (!statusCode) {
        return 'connection-closed'
      }

      switch (statusCode) {
        case DisconnectReason.loggedOut:
          return 'logged-out'
        case DisconnectReason.badSession:
          return 'bad-session'
        case DisconnectReason.connectionClosed:
          return 'connection-closed'
        case DisconnectReason.connectionLost:
          return 'connection-lost'
        case DisconnectReason.connectionReplaced:
          return 'connection-replaced'
        case DisconnectReason.timedOut:
          return 'timed-out'
        case DisconnectReason.restartRequired:
          return 'restart-required'
        case DisconnectReason.multideviceMismatch:
          return 'multidevice-mismatch'
        default:
          return 'unknown'
      }
    }

    const scheduleReconnect = (reason: string, immediate = false) => {
      if (stopped || reconnectTimer) {
        return
      }

      if (immediate) {
        reconnectAttempt = 0
      } else {
        reconnectAttempt += 1
      }

      const delay = immediate ? 1000 : Math.min(1000 * 2 ** (reconnectAttempt - 1), 15000)
      hooks.onStatus?.('starting', reason)
      this.logger.warn?.('Baileys reconnect scheduled', { sessionId, reason, delay })
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined
        if (!stopped) {
          void startSocket()
        }
      }, delay)
    }

    const detachListeners = (sock: WASocket) => {
      try {
        sock.ev.removeAllListeners('creds.update')
        sock.ev.removeAllListeners('connection.update')
        sock.ev.removeAllListeners('messages.upsert')
        sock.ev.removeAllListeners('messaging-history.set')
        sock.ev.removeAllListeners('chats.upsert')
        sock.ev.removeAllListeners('chats.update')
        sock.ev.removeAllListeners('contacts.upsert')
        sock.ev.removeAllListeners('contacts.update')
        sock.ev.removeAllListeners('groups.upsert')
        sock.ev.removeAllListeners('groups.update')
        sock.ev.removeAllListeners('messages.update')
      } catch {
        // Ignore listener cleanup failures.
      }
    }

    const startSocket = async () => {
      clearReconnectTimer()
      const { version } = await fetchLatestBaileysVersion()

      if (activeSocket) {
        detachListeners(activeSocket)
        void closeSocket(activeSocket)
      }

      const sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        browser: this.browserInfo,
        logger: buildBaileysLogger({
          sessionId,
          baseLevel: this.logLevel,
          forceInfo: this.autoPurgeBadDecryptEnabled,
          autoPurger
        })
      })
      activeSocket = sock

      const onConnectionUpdate = (update: { connection?: string; lastDisconnect?: { error?: Error }; qr?: string }) => {
        if (update.qr) {
          hooks.onQr?.(update.qr)
        }

        if (update.connection === 'open') {
          reconnectAttempt = 0
          hooks.onReady?.()
          this.logger.info?.('Baileys connected', { sessionId })
        }

        if (update.connection === 'close') {
          if (stopped) {
            return
          }
          const reason = resolveDisconnectReason(update.lastDisconnect?.error)
          this.logger.warn?.('Baileys disconnected', { sessionId, reason })

          if (reason === 'logged-out' || reason === 'bad-session') {
            void clearAuthState(reason)
            hooks.onDisconnected?.(reason)
            return
          }

          if (reason === 'restart-required') {
            scheduleReconnect(reason, true)
            return
          }

          if (reason === 'connection-replaced' || reason === 'multidevice-mismatch') {
            hooks.onDisconnected?.(reason)
            return
          }

          scheduleReconnect(reason)
        }
      }

      sock.ev.on('creds.update', () => {
        void persistState()
      })
      sock.ev.on('connection.update', onConnectionUpdate)
      sock.ev.on('messages.upsert', (upsert) => {
        for (const message of upsert.messages ?? []) {
          applyCachedMetadataToMessage(message)
          handleMessage(message)
        }
      })
      sock.ev.on('messaging-history.set', (history) => {
        const historyChats = Array.isArray((history as { chats?: unknown }).chats)
          ? ((history as { chats?: unknown[] }).chats as unknown[])
          : []
        const historyContacts = Array.isArray((history as { contacts?: unknown }).contacts)
          ? ((history as { contacts?: unknown[] }).contacts as unknown[])
          : []

        if (historyChats.length > 0 || historyContacts.length > 0) {
          this.logger.info?.('Baileys history metadata sync received', {
            sessionId,
            chats: historyChats.length,
            contacts: historyContacts.length,
            isLatest: Boolean((history as { isLatest?: unknown }).isLatest)
          })
        }

        for (const row of historyChats) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          const rawId = record.id ?? record.jid ?? record.newJid ?? record.oldJid ?? record.lidJid ?? record.pnJid
          const chatId = normalizeChatJid(rawId)
          if (!chatId) {
            continue
          }
          emitChatMetadata(chatId, resolveChatNameFromRecord(record), chatId.endsWith('@g.us'))
        }

        for (const row of historyContacts) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          const contactName = resolveContactNameFromRecord(record)
          if (!contactName) {
            continue
          }

          emitChatMetadata(record.id, contactName, false)
          emitChatMetadata(record.phoneNumber, contactName, false)
          emitChatMetadata(record.lid, contactName, false)
        }
      })
      sock.ev.on('chats.upsert', (rows) => {
        for (const row of rows ?? []) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          const rawId = record.id ?? record.jid ?? record.newJid ?? record.oldJid ?? record.lidJid ?? record.pnJid
          const chatId = normalizeChatJid(rawId)
          if (!chatId) {
            continue
          }
          emitChatMetadata(chatId, resolveChatNameFromRecord(record), chatId.endsWith('@g.us'))
        }
      })
      sock.ev.on('chats.update', (rows) => {
        for (const row of rows ?? []) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          const rawId = record.id ?? record.jid ?? record.newJid ?? record.oldJid ?? record.lidJid ?? record.pnJid
          const chatId = normalizeChatJid(rawId)
          if (!chatId) {
            continue
          }
          emitChatMetadata(chatId, resolveChatNameFromRecord(record), chatId.endsWith('@g.us'))
        }
      })
      sock.ev.on('contacts.upsert', (rows) => {
        for (const row of rows ?? []) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          const contactName = resolveContactNameFromRecord(record)
          if (!contactName) {
            continue
          }
          emitChatMetadata(record.id, contactName, false)
          emitChatMetadata(record.phoneNumber, contactName, false)
          emitChatMetadata(record.lid, contactName, false)
        }
      })
      sock.ev.on('contacts.update', (rows) => {
        for (const row of rows ?? []) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          const contactName = resolveContactNameFromRecord(record)
          if (!contactName) {
            continue
          }
          emitChatMetadata(record.id, contactName, false)
          emitChatMetadata(record.phoneNumber, contactName, false)
          emitChatMetadata(record.lid, contactName, false)
        }
      })
      sock.ev.on('groups.upsert', (rows) => {
        for (const row of rows ?? []) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          emitChatMetadata(record.id, resolveGroupNameFromRecord(record), true)
        }
      })
      sock.ev.on('groups.update', (rows) => {
        for (const row of rows ?? []) {
          const record = asRecord(row)
          if (!record) {
            continue
          }
          emitChatMetadata(record.id, resolveGroupNameFromRecord(record), true)
        }
      })
      sock.ev.on('messages.update', (updates) => {
        for (const update of updates ?? []) {
          const status = (update as { update?: { status?: number } }).update?.status
          if (typeof status !== 'number') {
            continue
          }
          const key = (update as { key?: { id?: string | null; remoteJid?: string | null } }).key
          hooks.onMessageStatus?.({
            messageId: key?.id ?? null,
            chatId: key?.remoteJid ?? null,
            status: mapStatus(status),
            raw: update
          })
        }
      })
    }

    await startSocket()

    return {
      stop: async () => {
        stopped = true
        clearReconnectTimer()
        if (activeSocket) {
          detachListeners(activeSocket)
          await closeSocket(activeSocket)
          activeSocket = null
        }
      },
      sendText: async (chatId, text) => {
        if (!activeSocket) {
          throw new Error('session-not-ready')
        }
        const result = await activeSocket.sendMessage(chatId, { text })
        const messageId = result?.key?.id ?? null
        return {
          messageId,
          raw: result
        }
      },
      sendMedia: async (chatId, input) => {
        if (!activeSocket) {
          throw new Error('session-not-ready')
        }

        const mimeType = input?.mimeType?.trim() || undefined
        const fileName = input?.fileName?.trim() || undefined
        const caption = input?.caption?.trim() || undefined

        let buffer: Buffer
        let headerMimeType: string | undefined

        const provided = (input as any)?.data
        const providedBuffer = Buffer.isBuffer(provided) ? provided : provided instanceof Uint8Array ? Buffer.from(provided) : null
        if (providedBuffer && providedBuffer.byteLength > 0) {
          buffer = providedBuffer
        } else {
          const url = (input as any)?.url?.trim()
          if (!url) {
            throw new Error('url is required')
          }

          const host = safeUrlHost(url)
          const downloadStartedAt = Date.now()
          try {
            const downloaded = await downloadToBuffer(url, {
              timeoutMs: this.mediaDownloadTimeoutMs,
              maxBytes: this.mediaDownloadMaxBytes
            })
            buffer = downloaded.buffer
            headerMimeType = downloaded.contentType?.split(';')[0]?.trim() || undefined
          } catch (error) {
            this.logger.warn?.('Media download failed', {
              sessionId,
              host,
              error: (error as Error).message
            })
            throw error
          }

          const downloadMs = Date.now() - downloadStartedAt
          if (downloadMs > 3000 || buffer.byteLength > 5_000_000) {
            this.logger.info?.('Media downloaded', {
              sessionId,
              host,
              bytes: buffer.byteLength,
              ms: downloadMs
            })
          }
        }

        const effectiveMimeType = mimeType ?? headerMimeType

        let payload: any
        if (input.mediaType === 'imageMessage') {
          payload = {
            image: buffer,
            ...(effectiveMimeType ? { mimetype: effectiveMimeType } : {}),
            ...(caption ? { caption } : {})
          }
        } else if (input.mediaType === 'videoMessage') {
          payload = {
            video: buffer,
            ...(effectiveMimeType ? { mimetype: effectiveMimeType } : {}),
            ...(caption ? { caption } : {})
          }
        } else if (input.mediaType === 'audioMessage') {
          const audioOptions = resolveAudioMediaOptions(buffer, effectiveMimeType)
          payload = {
            audio: buffer,
            ...(audioOptions.mimeType ? { mimetype: audioOptions.mimeType } : {}),
            ptt: audioOptions.ptt
          }
        } else if (input.mediaType === 'documentMessage') {
          const wantsPdf = effectiveMimeType?.toLowerCase() === 'application/pdf'
          const resolvedFileName = fileName
            ? wantsPdf && !fileName.toLowerCase().endsWith('.pdf')
              ? `${fileName}.pdf`
              : fileName
            : wantsPdf
              ? 'arquivo.pdf'
              : 'arquivo'

          payload = {
            document: buffer,
            ...(effectiveMimeType ? { mimetype: effectiveMimeType } : {}),
            fileName: resolvedFileName,
            ...(caption ? { caption } : {})
          }
        } else {
          throw new Error('unsupported_media_type')
        }

        const result = await activeSocket.sendMessage(chatId, payload)
        const messageId = result?.key?.id ?? null
        return {
          messageId,
          raw: result
        }
      },
      sendContact: async (chatId, input) => {
        if (!activeSocket) {
          throw new Error('session-not-ready')
        }

        const rows = Array.isArray(input?.contacts) ? input.contacts : []
        const contacts: Array<{ name: string; whatsapp: string }> = []
        for (const row of rows) {
          const name = typeof row?.name === 'string' ? row.name.trim() : ''
          const whatsapp = typeof row?.whatsapp === 'string' ? row.whatsapp.replace(/\D/g, '') : ''
          if (!name || !whatsapp || whatsapp.length < 10 || whatsapp.length > 15) {
            continue
          }
          contacts.push({ name, whatsapp })
        }

        if (contacts.length === 0) {
          throw new Error('contacts is required')
        }

        const displayNameRaw = input?.displayName?.trim()
        const displayName = displayNameRaw || (contacts.length === 1 ? contacts[0].name : `${contacts.length} contatos`)

        const payload = {
          contacts: {
            ...(displayName ? { displayName } : {}),
            contacts: contacts.map((contact) => ({
              displayName: contact.name,
              vcard: buildContactVcard(contact.name, contact.whatsapp)
            }))
          }
        }

        const result = await activeSocket.sendMessage(chatId, payload as any)
        const messageId = result?.key?.id ?? null
        return {
          messageId,
          raw: result
        }
      },
      checkWhatsappNumbers: async (phoneNumbers) => {
        if (!activeSocket) {
          throw new Error('session-not-ready')
        }

        const normalizedNumbers = normalizeWhatsappLookupNumbers(phoneNumbers)
        if (normalizedNumbers.length === 0) {
          return []
        }

        const response = await activeSocket.onWhatsApp(...normalizedNumbers)
        const rows = Array.isArray(response) ? response : []
        const hitsByPhone = new Map<string, { jid: string; exists: boolean }>()

        for (const row of rows) {
          const normalizedJid = normalizeChatJid((row as { jid?: unknown }).jid)
          const phoneNumber = extractDigitsFromJid(normalizedJid)
          if (!phoneNumber) {
            continue
          }

          hitsByPhone.set(phoneNumber, {
            jid: normalizedJid ?? `${phoneNumber}@s.whatsapp.net`,
            exists: (row as { exists?: unknown }).exists === true
          })
        }

        const results: SessionWhatsappLookupResult[] = normalizedNumbers.map((phoneNumber, index) => {
          const directHit = hitsByPhone.get(phoneNumber)
          if (directHit) {
            return {
              phoneNumber,
              jid: directHit.jid,
              exists: directHit.exists
            }
          }

          // Preserve existence from the queried candidate when WA returns canonicalized JIDs.
          const positional = rows[index] as { jid?: unknown; exists?: unknown } | undefined
          if (positional && typeof positional.exists === 'boolean') {
            return {
              phoneNumber,
              jid: normalizeChatJid(positional.jid) ?? `${phoneNumber}@s.whatsapp.net`,
              exists: positional.exists
            }
          }

          return {
            phoneNumber,
            jid: `${phoneNumber}@s.whatsapp.net`,
            exists: false
          }
        })

        return results
      }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeWhatsappLookupNumbers(phoneNumbers: string[]): string[] {
  if (!Array.isArray(phoneNumbers)) {
    return []
  }

  const unique = new Set<string>()
  for (const phoneNumber of phoneNumbers) {
    const digits = typeof phoneNumber === 'string' ? phoneNumber.replace(/\D/g, '') : ''
    if (digits.length < 7 || digits.length > 15) {
      continue
    }
    unique.add(digits)
  }

  return Array.from(unique.values())
}

function normalizeChatJid(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (/^\d{7,15}$/.test(trimmed)) {
    return `${trimmed}@s.whatsapp.net`
  }

  const atIndex = trimmed.indexOf('@')
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return null
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

function extractDigitsFromJid(jid: string | null): string | null {
  if (!jid) {
    return null
  }

  const atIndex = jid.indexOf('@')
  if (atIndex <= 0) {
    return null
  }

  const localPart = jid.slice(0, atIndex).split(':')[0]?.trim() ?? ''
  return /^\d{7,15}$/.test(localPart) ? localPart : null
}

function resolveChatNameFromRecord(record: Record<string, unknown>): string | null {
  return (
    normalizeDisplayName(record.name) ??
    normalizeDisplayName(record.displayName) ??
    normalizeDisplayName(record.notify) ??
    normalizeDisplayName(record.subject) ??
    null
  )
}

function resolveContactNameFromRecord(record: Record<string, unknown>): string | null {
  return (
    normalizeDisplayName(record.name) ??
    normalizeDisplayName(record.notify) ??
    normalizeDisplayName(record.verifiedName) ??
    normalizeDisplayName(record.displayName) ??
    null
  )
}

function resolveGroupNameFromRecord(record: Record<string, unknown>): string | null {
  return (
    normalizeDisplayName(record.subject) ??
    normalizeDisplayName(record.notify) ??
    normalizeDisplayName(record.name) ??
    null
  )
}

function buildBaileysLogger(options: {
  sessionId: string
  baseLevel: string
  forceInfo: boolean
  autoPurger: { observe: (args: unknown[]) => void } | null
}) {
  const level = resolveBaileysLogLevel(options.baseLevel, options.forceInfo)
  const pinoOptions: pino.LoggerOptions = { level }
  if (options.autoPurger) {
    pinoOptions.hooks = {
      logMethod(args: unknown[], method: (...args: unknown[]) => unknown) {
        try {
          options.autoPurger?.observe(args)
        } catch {
          // Ignore hook failures.
        }
        return method.apply(this, args)
      }
    }
  }
  const baseLogger = pino(pinoOptions)

  return baseLogger.child({ sessionId: options.sessionId, component: 'baileys' })
}

function resolveBaileysLogLevel(value: string, forceInfo: boolean) {
  const normalized = (value ?? '').trim().toLowerCase()
  const allowed = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  const baseLevel = allowed.has(normalized) ? normalized : 'warn'
  if (!forceInfo) {
    return baseLevel
  }

  const ranks: Record<string, number> = {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    debug: 20,
    trace: 10
  }
  return ranks[baseLevel] > ranks.info ? 'info' : baseLevel
}

async function closeSocket(sock: WASocket) {
  try {
    if (typeof sock.end === 'function') {
      sock.end(new Error('session-stopped'))
      return
    }
  } catch {
    // Fallthrough to logout.
  }

  try {
    await sock.logout()
  } catch {
    // Ignore teardown failures.
  }
}

function safeUrlHost(value: string): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  try {
    return new URL(raw).host || null
  } catch {
    return null
  }
}

function buildContactVcard(name: string, whatsappDigits: string): string {
  const safeName = sanitizeVcardValue(name) || 'Contato'
  const digits = (whatsappDigits ?? '').replace(/\D/g, '')

  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${safeName}`,
    `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
    'END:VCARD'
  ].join('\n')
}

function sanitizeVcardValue(value: string): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim()
}
