import crypto from 'crypto'
import type { SessionDriver, SessionDriverHandle, SessionDriverHooks, SessionSendResult } from './types'

type NoopSessionDriverOptions = {
  readyDelayMs?: number
  disconnectAfterMs?: number
  messageStatusDelayMs?: number
  failStartRate?: number
}

export class NoopSessionDriver implements SessionDriver {
  private readonly readyDelayMs: number
  private readonly disconnectAfterMs: number
  private readonly messageStatusDelayMs: number
  private readonly failStartRate: number
  private messageSeq = 0

  constructor(options: NoopSessionDriverOptions = {}) {
    this.readyDelayMs = Math.max(0, options.readyDelayMs ?? 50)
    this.disconnectAfterMs = Math.max(0, options.disconnectAfterMs ?? 0)
    this.messageStatusDelayMs = Math.max(0, options.messageStatusDelayMs ?? 0)
    this.failStartRate = Math.min(1, Math.max(0, options.failStartRate ?? 0))
  }

  async start(sessionId: string, hooks: SessionDriverHooks): Promise<SessionDriverHandle> {
    if (this.failStartRate > 0 && Math.random() < this.failStartRate) {
      throw new Error('noop-start-failed')
    }

    let stopped = false
    let ready = false
    let readyTimer: NodeJS.Timeout | undefined
    let disconnectTimer: NodeJS.Timeout | undefined
    const statusTimers = new Set<NodeJS.Timeout>()

    const setReady = () => {
      if (stopped || ready) {
        return
      }
      ready = true
      hooks.onReady?.()
    }

    readyTimer = setTimeout(setReady, this.readyDelayMs)

    if (this.disconnectAfterMs > 0) {
      disconnectTimer = setTimeout(() => {
        if (stopped) {
          return
        }
        ready = false
        hooks.onDisconnected?.('noop-disconnect')
      }, this.disconnectAfterMs)
    }

    const handle: SessionDriverHandle = {
      stop: async () => {
        stopped = true
        if (readyTimer) {
          clearTimeout(readyTimer)
          readyTimer = undefined
        }
        if (disconnectTimer) {
          clearTimeout(disconnectTimer)
          disconnectTimer = undefined
        }
        for (const timer of statusTimers) {
          clearTimeout(timer)
        }
        statusTimers.clear()
      },
      sendText: async (chatId: string, text: string): Promise<SessionSendResult> => {
        if (stopped || !ready) {
          throw new Error('noop-not-ready')
        }
        this.messageSeq += 1
        const messageId = `noop-${sessionId}-${this.messageSeq}-${crypto.randomUUID()}`
        if (this.messageStatusDelayMs >= 0) {
          const timer = setTimeout(() => {
            statusTimers.delete(timer)
            if (!stopped && ready) {
              hooks.onMessageStatus?.({ messageId, chatId, status: 'sent' })
            }
          }, this.messageStatusDelayMs)
          statusTimers.add(timer)
        }
        return { messageId, raw: { text } }
      },
      sendContact: async (chatId: string, input: any): Promise<SessionSendResult> => {
        if (stopped || !ready) {
          throw new Error('noop-not-ready')
        }
        this.messageSeq += 1
        const messageId = `noop-${sessionId}-${this.messageSeq}-${crypto.randomUUID()}`
        if (this.messageStatusDelayMs >= 0) {
          const timer = setTimeout(() => {
            statusTimers.delete(timer)
            if (!stopped && ready) {
              hooks.onMessageStatus?.({ messageId, chatId, status: 'sent' })
            }
          }, this.messageStatusDelayMs)
          statusTimers.add(timer)
        }
        return { messageId, raw: { contacts: input?.contacts ?? [] } }
      },
      checkWhatsappNumbers: async (phoneNumbers: string[]) => {
        if (stopped || !ready) {
          throw new Error('noop-not-ready')
        }

        const normalized = Array.isArray(phoneNumbers)
          ? phoneNumbers
              .map((phoneNumber) => (typeof phoneNumber === 'string' ? phoneNumber.replace(/\D/g, '') : ''))
              .filter((phoneNumber) => phoneNumber.length >= 7 && phoneNumber.length <= 15)
          : []

        return normalized.map((phoneNumber) => ({
          phoneNumber,
          jid: `${phoneNumber}@s.whatsapp.net`,
          exists: true
        }))
      }
    }

    return handle
  }
}
