import assert from 'node:assert/strict'
import test from 'node:test'
import { FindmyangelFailoverWorker, type FindmyangelFailoverJob } from '../src/integrations/findmyangelDelivery'

function makeJob(overrides: Partial<FindmyangelFailoverJob> = {}): FindmyangelFailoverJob {
  return {
    id: 1,
    requestId: 'request-1',
    sessionId: 'session-1',
    flow: 'template-message',
    userId: 'uid-1',
    templateId: 'tpl-1',
    brBaseKey: '554388462272',
    primaryVariant: 'with9',
    alternateVariant: 'without9',
    primaryChatId: '5543988462272@s.whatsapp.net',
    alternateChatId: '554388462272@s.whatsapp.net',
    text: 'Mensagem teste',
    primaryOutboundId: 10,
    failoverOutboundId: null,
    phase: 'primary_check',
    status: 'processing',
    runAtMs: 1000,
    attempts: 1,
    lastError: null,
    primaryStatus: null,
    failoverStatus: null,
    finalDeliveredVariant: null,
    completionReason: null,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    ...overrides
  }
}

test('FindmyangelFailoverWorker completes primary phase without failover when already delivered', async () => {
  const completed: any[] = []
  const preferenceUpdates: any[] = []
  let enqueueCalled = 0

  const worker = new FindmyangelFailoverWorker({
    enabled: true,
    failoverDelayMs: 60000,
    jobStore: {
      claimDueJobs: async () => [],
      scheduleFinalCheck: async () => undefined,
      markCompleted: async (input: any) => {
        completed.push(input)
      },
      reschedule: async () => undefined,
      markFailed: async () => undefined
    } as any,
    preferenceStore: {
      upsertPreferredVariant: async (input: any) => {
        preferenceUpdates.push(input)
      }
    } as any,
    outboundStore: {
      getById: async () => ({ status: 'delivered' })
    } as any,
    outboundService: {
      enqueueText: async () => {
        enqueueCalled += 1
        return { id: 999, status: 'queued' }
      }
    } as any
  })

  await (worker as any).processJob(makeJob())

  assert.equal(enqueueCalled, 0)
  assert.equal(preferenceUpdates.length, 1)
  assert.equal(preferenceUpdates[0].preferredVariant, 'with9')
  assert.equal(completed.length, 1)
  assert.equal(completed[0].finalDeliveredVariant, 'with9')
  assert.equal(completed[0].completionReason, 'primary_delivered')
})

test('FindmyangelFailoverWorker triggers failover in primary phase when message is not delivered', async () => {
  const scheduled: any[] = []
  let enqueueInput: any = null

  const worker = new FindmyangelFailoverWorker({
    enabled: true,
    failoverDelayMs: 60000,
    jobStore: {
      claimDueJobs: async () => [],
      scheduleFinalCheck: async (input: any) => {
        scheduled.push(input)
      },
      markCompleted: async () => undefined,
      reschedule: async () => undefined,
      markFailed: async () => undefined
    } as any,
    preferenceStore: {
      upsertPreferredVariant: async () => undefined
    } as any,
    outboundStore: {
      getById: async () => ({ status: 'sent' })
    } as any,
    outboundService: {
      enqueueText: async (input: any) => {
        enqueueInput = input
        return { id: 22, status: 'queued' }
      }
    } as any
  })

  await (worker as any).processJob(makeJob())

  assert.equal(enqueueInput.chatId, '554388462272@s.whatsapp.net')
  assert.equal(enqueueInput.idempotencyKey, 'request-1:failover:v1')
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].failoverOutboundId, 22)
  assert.equal(scheduled[0].primaryStatus, 'sent')
})

test('FindmyangelFailoverWorker stores alternate preference when final phase confirms alternate delivery', async () => {
  const completed: any[] = []
  const preferenceUpdates: any[] = []

  const worker = new FindmyangelFailoverWorker({
    enabled: true,
    failoverDelayMs: 60000,
    jobStore: {
      claimDueJobs: async () => [],
      scheduleFinalCheck: async () => undefined,
      markCompleted: async (input: any) => {
        completed.push(input)
      },
      reschedule: async () => undefined,
      markFailed: async () => undefined
    } as any,
    preferenceStore: {
      upsertPreferredVariant: async (input: any) => {
        preferenceUpdates.push(input)
      }
    } as any,
    outboundStore: {
      getById: async (id: number) => {
        if (id === 10) {
          return { status: 'sent' }
        }
        return { status: 'delivered' }
      }
    } as any,
    outboundService: {
      enqueueText: async () => ({ id: 22, status: 'queued' })
    } as any
  })

  await (worker as any).processJob(
    makeJob({
      phase: 'final_check',
      failoverOutboundId: 22
    })
  )

  assert.equal(preferenceUpdates.length, 1)
  assert.equal(preferenceUpdates[0].preferredVariant, 'without9')
  assert.equal(completed.length, 1)
  assert.equal(completed[0].finalDeliveredVariant, 'without9')
})
