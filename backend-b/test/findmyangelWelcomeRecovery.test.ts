import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildFindmyangelRecoveryRequestId,
  reissueFindmyangelWelcomeWithFailover,
  type FindmyangelFailoverJob
} from '../src/integrations/findmyangelDelivery'

function makeJob(overrides: Partial<FindmyangelFailoverJob> = {}): FindmyangelFailoverJob {
  return {
    id: 1,
    requestId: 'findmyangel:user:uid-1:welcome-v1',
    sessionId: 'session-1',
    flow: 'user-created',
    userId: 'uid-1',
    templateId: null,
    brBaseKey: '5511999999999',
    primaryVariant: 'with9',
    alternateVariant: 'without9',
    primaryChatId: '5511999999999@s.whatsapp.net',
    alternateChatId: '551199999999@s.whatsapp.net',
    text: 'Bem-vindo',
    primaryOutboundId: 10,
    failoverOutboundId: 11,
    phase: 'final_check',
    status: 'completed',
    runAtMs: 1000,
    attempts: 1,
    lastError: null,
    primaryStatus: 'failed',
    failoverStatus: 'failed',
    finalDeliveredVariant: null,
    completionReason: 'final_unknown',
    createdAtMs: 1000,
    updatedAtMs: 2000,
    ...overrides
  }
}

test('buildFindmyangelRecoveryRequestId appends deterministic recovery suffix', () => {
  assert.equal(
    buildFindmyangelRecoveryRequestId('findmyangel:user:uid-1:welcome-v1'),
    'findmyangel:user:uid-1:welcome-v1:recovery:v1'
  )
  assert.equal(
    buildFindmyangelRecoveryRequestId('findmyangel:user:uid-1:welcome-v1:recovery:v1'),
    'findmyangel:user:uid-1:welcome-v1:recovery:v1'
  )
})

test('reissueFindmyangelWelcomeWithFailover recreates primary send and failover job', async () => {
  let enqueueTextInput: any = null
  let enqueueJobInput: any = null

  const result = await reissueFindmyangelWelcomeWithFailover({
    job: makeJob(),
    outboundService: {
      enqueueText: async (input: any) => {
        enqueueTextInput = input
        return { id: 200, status: 'queued' }
      }
    } as any,
    failoverJobStore: {
      enqueue: async (input: any) => {
        enqueueJobInput = input
        return { scheduled: true }
      }
    } as any,
    failoverDelayMs: 60_000,
    now: () => 5_000
  })

  assert.equal(result.requestId, 'findmyangel:user:uid-1:welcome-v1:recovery:v1')
  assert.equal(result.outboundId, 200)
  assert.equal(result.failoverScheduled, true)
  assert.equal(enqueueTextInput.chatId, '5511999999999@s.whatsapp.net')
  assert.equal(enqueueTextInput.idempotencyKey, 'findmyangel:user:uid-1:welcome-v1:recovery:v1')
  assert.equal(enqueueTextInput.origin, 'automation_api')
  assert.equal(enqueueJobInput.requestId, 'findmyangel:user:uid-1:welcome-v1:recovery:v1')
  assert.equal(enqueueJobInput.primaryOutboundId, 200)
  assert.equal(enqueueJobInput.runAtMs, 65_000)
  assert.equal(enqueueJobInput.alternateChatId, '551199999999@s.whatsapp.net')
})
