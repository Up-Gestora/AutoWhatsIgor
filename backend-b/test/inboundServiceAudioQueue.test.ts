import assert from 'node:assert/strict'
import test from 'node:test'
import { InboundMessageService } from '../src/messages/inboundService'

test('InboundMessageService enqueues audio messages into audioQueue', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'm1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      audioMessage: {
        mediaKey: 'AQID',
        directPath: '/file',
        url: 'https://example.com',
        seconds: 10,
        mimetype: 'audio/ogg; codecs=opus'
      }
    },
    pushName: 'Ana'
  }

  let inboundEnqueued = 0
  let audioEnqueued = 0
  let inserted: any = null

  const service = new InboundMessageService({
    store: {
      insert: async (input: any) => {
        inserted = input
        return { inserted: true, id: 10 }
      }
    } as any,
    queue: {
      enqueue: async () => {
        inboundEnqueued += 1
      }
    } as any,
    audioQueue: {
      enqueue: async () => {
        audioEnqueued += 1
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.ok(inserted?.normalizedPayload)
  assert.equal(inserted.normalizedPayload.messageType, 'audioMessage')
  assert.equal(inboundEnqueued, 0)
  assert.equal(audioEnqueued, 1)
})

