import assert from 'node:assert/strict'
import test from 'node:test'
import { InboundMessageService } from '../src/messages/inboundService'

test('InboundMessageService does not enqueue fromMe messages into inbound queue', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'm1',
      fromMe: true
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'Ola' },
    pushName: 'Eu'
  }

  let enqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => ({ inserted: true, id: 10 })
    } as any,
    queue: {
      enqueue: async () => {
        enqueued += 1
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.equal(enqueued, 0)
})

