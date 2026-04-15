import assert from 'node:assert/strict'
import test from 'node:test'
import { InboundMessageService } from '../src/messages/inboundService'

test('InboundMessageService ignores protocol messages', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'sys-1',
      fromMe: true
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      protocolMessage: {
        type: 0
      }
    }
  }

  let inserts = 0
  let enqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => {
        inserts += 1
        return { inserted: true, id: 1 }
      }
    } as any,
    queue: {
      enqueue: async () => {
        enqueued += 1
      }
    } as any
  })

  const result = await service.handleRawMessage('s1', raw)

  assert.equal(result.inserted, false)
  assert.equal(inserts, 0)
  assert.equal(enqueued, 0)
})

test('InboundMessageService ignores status@broadcast chat updates', async () => {
  const raw = {
    key: {
      remoteJid: 'status@broadcast',
      id: 'status-1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'status update' }
  }

  let inserts = 0
  let enqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => {
        inserts += 1
        return { inserted: true, id: 2 }
      }
    } as any,
    queue: {
      enqueue: async () => {
        enqueued += 1
      }
    } as any
  })

  const result = await service.handleRawMessage('s1', raw)

  assert.equal(result.inserted, false)
  assert.equal(inserts, 0)
  assert.equal(enqueued, 0)
})

test('InboundMessageService ignores placeholder messages', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'placeholder-1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      placeholderMessage: {
        id: 'x'
      }
    }
  }

  let inserts = 0
  let enqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => {
        inserts += 1
        return { inserted: true, id: 3 }
      }
    } as any,
    queue: {
      enqueue: async () => {
        enqueued += 1
      }
    } as any
  })

  const result = await service.handleRawMessage('s1', raw)

  assert.equal(result.inserted, false)
  assert.equal(inserts, 0)
  assert.equal(enqueued, 0)
})

test('InboundMessageService ignores template messages', async () => {
  const raw = {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      id: 'template-1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      templateMessage: {
        hydratedTemplate: {}
      }
    }
  }

  let inserts = 0
  let enqueued = 0

  const service = new InboundMessageService({
    store: {
      insert: async () => {
        inserts += 1
        return { inserted: true, id: 4 }
      }
    } as any,
    queue: {
      enqueue: async () => {
        enqueued += 1
      }
    } as any
  })

  const result = await service.handleRawMessage('s1', raw)

  assert.equal(result.inserted, false)
  assert.equal(inserts, 0)
  assert.equal(enqueued, 0)
})
