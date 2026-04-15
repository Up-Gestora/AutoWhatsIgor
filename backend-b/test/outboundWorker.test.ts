import assert from 'node:assert/strict'
import test from 'node:test'
import { OutboundMessageWorker } from '../src/messages/outboundWorker'
import type { OutboundQueueItem } from '../src/messages/outboundTypes'

test('OutboundMessageWorker sends multiple media payloads via sessionManager.sendMedia', async () => {
  const items: OutboundQueueItem[] = [
    { outboundId: 1, sessionId: 's1', chatId: 'c1', enqueuedAtMs: Date.now() },
    { outboundId: 2, sessionId: 's1', chatId: 'c1', enqueuedAtMs: Date.now() }
  ]

  const queue = {
    listChatsWithPending: async () => [{ sessionId: 's1', chatId: 'c1' }],
    peek: async () => (items.length > 0 ? items[0] : null),
    dequeue: async () => (items.length > 0 ? items.shift()! : null)
  }

  const sendMediaCalls: any[] = []
  const sessionManager = {
    sendMedia: async (_sessionId: string, _chatId: string, media: any) => {
      sendMediaCalls.push(media)
      return { messageId: `m${sendMediaCalls.length}` }
    }
  }

  let markedSent = 0
  const store = {
    getById: async (outboundId: number) => ({
      id: outboundId,
      sessionId: 's1',
      chatId: 'c1',
      status: 'queued',
      payload: {
        type: 'media',
        mediaType: 'imageMessage',
        url: `https://example.com/${outboundId}.png`,
        mimeType: 'image/png',
        origin: 'ai'
      }
    }),
    markSending: async () => 1,
    markSent: async () => {
      markedSent += 1
    },
    markRetrying: async () => {},
    markFailed: async () => {}
  }

  const worker = new OutboundMessageWorker({
    queue: queue as any,
    store: store as any,
    sessionManager: sessionManager as any,
    rateLimiter: { allow: async () => true } as any,
    maxRetries: 0,
    retryBaseMs: 1000,
    retryMaxMs: 1000,
    pollIntervalMs: 1000,
    maxPerChat: 25
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(sendMediaCalls.length, 2)
  assert.equal(markedSent, 2)
  assert.equal(sendMediaCalls[0].url, 'https://example.com/1.png')
  assert.equal(sendMediaCalls[1].url, 'https://example.com/2.png')
})

test('OutboundMessageWorker sends contact payloads via sessionManager.sendContact', async () => {
  const items: OutboundQueueItem[] = [{ outboundId: 3, sessionId: 's1', chatId: 'c1', enqueuedAtMs: Date.now() }]

  const queue = {
    listChatsWithPending: async () => [{ sessionId: 's1', chatId: 'c1' }],
    peek: async () => (items.length > 0 ? items[0] : null),
    dequeue: async () => (items.length > 0 ? items.shift()! : null)
  }

  const sendContactCalls: any[] = []
  const sessionManager = {
    sendContact: async (_sessionId: string, _chatId: string, input: any) => {
      sendContactCalls.push(input)
      return { messageId: `contact-${sendContactCalls.length}` }
    }
  }

  let markedSent = 0
  const store = {
    getById: async (outboundId: number) => ({
      id: outboundId,
      sessionId: 's1',
      chatId: 'c1',
      status: 'queued',
      payload: {
        type: 'contact',
        contacts: [{ name: 'Comercial', whatsapp: '5511988887777' }],
        displayName: 'Comercial',
        origin: 'ai'
      }
    }),
    markSending: async () => 1,
    markSent: async () => {
      markedSent += 1
    },
    markRetrying: async () => {},
    markFailed: async () => {}
  }

  const worker = new OutboundMessageWorker({
    queue: queue as any,
    store: store as any,
    sessionManager: sessionManager as any,
    rateLimiter: { allow: async () => true } as any,
    maxRetries: 0,
    retryBaseMs: 1000,
    retryMaxMs: 1000,
    pollIntervalMs: 1000,
    maxPerChat: 25
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(sendContactCalls.length, 1)
  assert.deepEqual(sendContactCalls[0].contacts, [{ name: 'Comercial', whatsapp: '5511988887777' }])
  assert.equal(markedSent, 1)
})
