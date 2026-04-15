import assert from 'node:assert/strict'
import test from 'node:test'
import { OutboundMediaCleanupService } from '../src/messages/outboundMediaCleanupService'
import type { OutboundMessageRecord } from '../src/messages/outboundTypes'

function buildRecord(partial: Partial<OutboundMessageRecord> = {}): OutboundMessageRecord {
  const now = Date.now()
  return {
    id: 1,
    sessionId: 's1',
    chatId: 'c1',
    payloadHash: 'hash',
    status: 'sent',
    attempts: 1,
    payload: {
      type: 'media',
      mediaType: 'imageMessage',
      url: 'https://firebasestorage.googleapis.com/v0/b/app/o/users%2Fs1%2Fconversas%2Ffile.jpg',
      storagePolicy: 'ttl_15d'
    },
    createdAtMs: now,
    updatedAtMs: now,
    ...partial
  }
}

test('outbound media cleanup deletes expired media and tombstones payload URL', async () => {
  const listedParams: Array<{ olderThanMs: number; limit: number }> = []
  const marked: Array<{ id: number; deletedAtMs: number }> = []
  const deletedArgs: Array<{ url: string; expectedPrefix?: string }> = []

  const service = new OutboundMediaCleanupService({
    store: {
      listMediaForStorageCleanup: async (params: { olderThanMs: number; limit: number }) => {
        listedParams.push(params)
        return [buildRecord()]
      },
      markMediaStorageDeleted: async (id: number, deletedAtMs: number) => {
        marked.push({ id, deletedAtMs })
      }
    } as any,
    ttlDays: 15,
    batchSize: 200,
    deleteByUrl: async (url, options) => {
      deletedArgs.push({ url, expectedPrefix: options.expectedObjectPrefix })
      return {
        deleted: true,
        bucket: 'app',
        objectPath: 'users/s1/conversas/file.jpg'
      }
    }
  })

  const now = Date.now()
  const result = await service.runOnce(now)

  assert.equal(result.scanned, 1)
  assert.equal(result.deleted, 1)
  assert.equal(result.failed, 0)
  assert.equal(listedParams.length, 1)
  assert.equal(listedParams[0].limit, 200)
  const expectedCutoff = now - 15 * 24 * 60 * 60 * 1000
  assert.ok(Math.abs(listedParams[0].olderThanMs - expectedCutoff) < 2000)

  assert.equal(marked.length, 1)
  assert.equal(marked[0].id, 1)
  assert.ok(marked[0].deletedAtMs > 0)
  assert.equal(deletedArgs.length, 1)
  assert.equal(deletedArgs[0].expectedPrefix, 'users/s1/conversas/')
})

test('outbound media cleanup keeps URL for retry when delete fails', async () => {
  const marked: number[] = []

  const service = new OutboundMediaCleanupService({
    store: {
      listMediaForStorageCleanup: async () => [buildRecord({ id: 9 })],
      markMediaStorageDeleted: async (id: number) => {
        marked.push(id)
      }
    } as any,
    ttlDays: 15,
    batchSize: 200,
    deleteByUrl: async () => ({
      deleted: false,
      reason: 'prefix_mismatch'
    })
  })

  const result = await service.runOnce()
  assert.equal(result.scanned, 1)
  assert.equal(result.deleted, 0)
  assert.equal(result.failed, 1)
  assert.deepEqual(marked, [])
})

test('outbound media cleanup does nothing when no candidate is returned', async () => {
  const service = new OutboundMediaCleanupService({
    store: {
      listMediaForStorageCleanup: async () => [],
      markMediaStorageDeleted: async () => undefined
    } as any,
    ttlDays: 30,
    batchSize: 50
  })

  const result = await service.runOnce()
  assert.deepEqual(result, { scanned: 0, deleted: 0, failed: 0 })
})
