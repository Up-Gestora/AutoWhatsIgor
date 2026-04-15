import assert from 'node:assert/strict'
import test from 'node:test'
import { InboundMessageWorker } from '../src/messages/worker'
import type { InboundQueueItem } from '../src/messages/types'

test('InboundMessageWorker skips chats within debounce window', async () => {
  let dequeued = false
  let handled = 0
  const queue = {
    listChatsWithPending: async () => [{ sessionId: 's1', chatId: 'c1' }],
    dequeue: async () => {
      dequeued = true
      return null
    }
  }
  const debounceStore = {
    getLastAt: async () => Date.now()
  }

  const worker = new InboundMessageWorker({
    queue: queue as any,
    handler: async () => {
      handled += 1
    },
    debounceMs: 1000,
    debounceStore: debounceStore as any
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(dequeued, false)
  assert.equal(handled, 0)
})

test('InboundMessageWorker processes when debounce window passes', async () => {
  let dequeuedCount = 0
  let handled = 0
  const item: InboundQueueItem = {
    sessionId: 's1',
    chatId: 'c1',
    inboundId: 1,
    messageId: 'm1',
    enqueuedAtMs: Date.now()
  }
  const queue = {
    listChatsWithPending: async () => [{ sessionId: 's1', chatId: 'c1' }],
    dequeue: async () => {
      dequeuedCount += 1
      return dequeuedCount === 1 ? item : null
    }
  }
  const debounceStore = {
    getLastAt: async () => Date.now() - 5000
  }

  const worker = new InboundMessageWorker({
    queue: queue as any,
    handler: async () => {
      handled += 1
    },
    debounceMs: 1000,
    debounceStore: debounceStore as any
  })

  ;(worker as any).running = true
  await (worker as any).tick()
  worker.stop()

  assert.equal(handled, 1)
  assert.ok(dequeuedCount >= 1)
})
