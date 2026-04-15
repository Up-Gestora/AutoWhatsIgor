import assert from 'node:assert/strict'
import test from 'node:test'
import { InboundMessageService } from '../src/messages/inboundService'

test('InboundMessageService skips AI enqueue when post-interaction interceptor handles the message', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'm1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      conversation: 'nota 9'
    },
    pushName: 'Ana'
  }

  let inboundEnqueued = 0
  let interceptorCalls = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => ({ inserted: true, id: 10 })
    } as any,
    queue: {
      enqueue: async () => {
        inboundEnqueued += 1
      }
    } as any,
    inboundInterceptor: {
      handleInboundMessage: async () => {
        interceptorCalls += 1
        return { handled: true }
      }
    }
  })

  await service.handleRawMessage('s1', raw)

  assert.equal(interceptorCalls, 1)
  assert.equal(inboundEnqueued, 0)
})
