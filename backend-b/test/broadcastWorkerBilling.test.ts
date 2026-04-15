import assert from 'node:assert/strict'
import test from 'node:test'
import { BroadcastWorker } from '../src/broadcasts/worker'

function buildWorkerContext() {
  const chargedUpdates: number[] = []
  const consumeCalls: Array<{ sessionId: string; amountBrl: number; meta: any }> = []

  const worker = new BroadcastWorker({
    pool: {} as any,
    jobStore: {
      updateChargedBlocks: async (_client: any, _sessionId: string, _jobId: string, chargedBlocks: number) => {
        chargedUpdates.push(chargedBlocks)
      }
    } as any,
    sessionManager: {} as any,
    outboundQueue: {} as any,
    trafficStore: {} as any,
    defaultCountryCode: '55',
    pollIntervalMs: 1000,
    maxInFlight: 1,
    delayMinMs: 1000,
    delayMaxMs: 1000,
    yieldOutboundMs: 1000,
    creditsService: {
      consume: async (sessionId: string, amountBrl: number, meta: any) => {
        consumeCalls.push({ sessionId, amountBrl, meta })
        return {} as any
      }
    } as any
  })

  return { worker, chargedUpdates, consumeCalls }
}

test('BroadcastWorker charges one block for each ten sent messages', async () => {
  const { worker, chargedUpdates, consumeCalls } = buildWorkerContext()
  const job: any = {
    id: 'job-1',
    sessionId: 'session-1',
    chargedBlocks: 0
  }

  await (worker as any).chargeBroadcastBlocks({ query: async () => ({}) }, job, 27)

  assert.equal(consumeCalls.length, 2)
  assert.deepEqual(
    consumeCalls.map((entry) => entry.meta.referenceId),
    ['broadcast:job-1:block:1', 'broadcast:job-1:block:2']
  )
  assert.ok(consumeCalls.every((entry) => entry.amountBrl === 0.01))
  assert.ok(consumeCalls.every((entry) => entry.meta.reason === 'broadcast_transmission'))
  assert.deepEqual(chargedUpdates, [2])
  assert.equal(job.chargedBlocks, 2)
})

test('BroadcastWorker treats duplicate broadcast debit as idempotent success', async () => {
  const { chargedUpdates, consumeCalls } = buildWorkerContext()
  const worker = new BroadcastWorker({
    pool: {} as any,
    jobStore: {
      updateChargedBlocks: async (_client: any, _sessionId: string, _jobId: string, chargedBlocks: number) => {
        chargedUpdates.push(chargedBlocks)
      }
    } as any,
    sessionManager: {} as any,
    outboundQueue: {} as any,
    trafficStore: {} as any,
    defaultCountryCode: '55',
    pollIntervalMs: 1000,
    maxInFlight: 1,
    delayMinMs: 1000,
    delayMaxMs: 1000,
    yieldOutboundMs: 1000,
    creditsService: {
      consume: async (sessionId: string, amountBrl: number, meta: any) => {
        consumeCalls.push({ sessionId, amountBrl, meta })
        if (meta.referenceId === 'broadcast:job-2:block:2') {
          const error = new Error('duplicate') as Error & { code: string }
          error.code = '23505'
          throw error
        }
        return {} as any
      }
    } as any
  })

  const job: any = {
    id: 'job-2',
    sessionId: 'session-1',
    chargedBlocks: 0
  }

  await (worker as any).chargeBroadcastBlocks({ query: async () => ({}) }, job, 20)

  assert.equal(consumeCalls.length, 2)
  assert.deepEqual(chargedUpdates, [2])
  assert.equal(job.chargedBlocks, 2)
})
