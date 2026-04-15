import assert from 'node:assert/strict'
import test from 'node:test'
import { InboundMessageService } from '../src/messages/inboundService'

test('InboundMessageService enqueues image messages into mediaQueue', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'm1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      imageMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        caption: 'Foto'
      }
    }
  }

  let inboundEnqueued = 0
  let mediaEnqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => ({ inserted: true, id: 10 })
    } as any,
    queue: {
      enqueue: async () => {
        inboundEnqueued += 1
      }
    } as any,
    mediaQueue: {
      enqueue: async () => {
        mediaEnqueued += 1
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.equal(inboundEnqueued, 0)
  assert.equal(mediaEnqueued, 1)
})

test('InboundMessageService enqueues PDF documents into mediaQueue', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'm2',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      documentMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        mimetype: 'application/pdf',
        fileName: 'arquivo.pdf',
        caption: 'Segue PDF'
      }
    }
  }

  let inboundEnqueued = 0
  let mediaEnqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => ({ inserted: true, id: 11 })
    } as any,
    queue: {
      enqueue: async () => {
        inboundEnqueued += 1
      }
    } as any,
    mediaQueue: {
      enqueue: async () => {
        mediaEnqueued += 1
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.equal(inboundEnqueued, 0)
  assert.equal(mediaEnqueued, 1)
})

test('InboundMessageService keeps non-PDF documents in text queue', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'm3',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      documentMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        mimetype: 'application/msword',
        fileName: 'arquivo.docx',
        caption: 'Segue DOC'
      }
    }
  }

  let inboundEnqueued = 0
  let mediaEnqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => ({ inserted: true, id: 12 })
    } as any,
    queue: {
      enqueue: async () => {
        inboundEnqueued += 1
      }
    } as any,
    mediaQueue: {
      enqueue: async () => {
        mediaEnqueued += 1
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.equal(inboundEnqueued, 1)
  assert.equal(mediaEnqueued, 0)
})
