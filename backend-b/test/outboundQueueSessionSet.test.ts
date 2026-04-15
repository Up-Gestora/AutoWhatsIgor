import assert from 'node:assert/strict'
import test from 'node:test'
import { OutboundMessageQueue } from '../src/messages/outboundQueue'

class FakeRedis {
  lists = new Map<string, string[]>()
  sets = new Map<string, Set<string>>()

  async rpush(key: string, value: string) {
    const list = this.lists.get(key) ?? []
    list.push(value)
    this.lists.set(key, list)
    return list.length
  }

  async lindex(key: string, index: number) {
    const list = this.lists.get(key) ?? []
    const value = list[index]
    return value ?? null
  }

  async lpop(key: string) {
    const list = this.lists.get(key) ?? []
    if (list.length === 0) {
      return null
    }
    const value = list.shift() ?? null
    this.lists.set(key, list)
    return value
  }

  async llen(key: string) {
    const list = this.lists.get(key) ?? []
    return list.length
  }

  async sadd(key: string, value: string) {
    const set = this.sets.get(key) ?? new Set<string>()
    set.add(value)
    this.sets.set(key, set)
    return set.size
  }

  async srem(key: string, value: string) {
    const set = this.sets.get(key)
    if (!set) {
      return 0
    }
    const had = set.delete(value)
    if (set.size === 0) {
      this.sets.delete(key)
    } else {
      this.sets.set(key, set)
    }
    return had ? 1 : 0
  }

  async smembers(key: string) {
    const set = this.sets.get(key) ?? new Set<string>()
    return Array.from(set.values())
  }

  async scard(key: string) {
    const set = this.sets.get(key)
    return set ? set.size : 0
  }
}

test('OutboundMessageQueue maintains a per-session set for pending chats', async () => {
  const redis = new FakeRedis()
  const queue = new OutboundMessageQueue({
    redis: redis as any,
    queuePrefix: 'q',
    chatSetKey: 'outbound-queue-chats'
  })

  assert.equal(await queue.hasPendingForSession('s1'), false)

  await queue.enqueue({ outboundId: 1, sessionId: 's1', chatId: 'c1', enqueuedAtMs: Date.now() })
  assert.equal(await queue.hasPendingForSession('s1'), true)

  const item = await queue.dequeue('s1', 'c1')
  assert.equal(item?.outboundId, 1)
  assert.equal(await queue.hasPendingForSession('s1'), false)
})

