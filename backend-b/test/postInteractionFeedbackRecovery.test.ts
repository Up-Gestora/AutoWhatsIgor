import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRecoveryEventInputs, buildRecoveryPreview } from '../src/postInteractionFeedback/recovery'

function buildLead() {
  return {
    id: 'lead-1',
    sessionId: 'sender-session',
    name: 'Ana',
    whatsapp: '5511999999999',
    chatId: '5511999999999@s.whatsapp.net',
    aiTag: 'P. Ativa',
    status: 'em_processo',
    lastContact: null,
    nextContact: null,
    observations: null,
    createdAt: null,
    lastMessage: null,
    source: 'autowhats_feedback',
    updatedAt: null,
    campaign: {
      type: 'post_interaction_feedback' as const,
      targetSessionId: 'source-session',
      attempt: 0,
      meta: {
        sourceSessionId: 'source-session',
        sourceChatId: '163874527551579@lid',
        sourceCompanyName: 'Empresa XPTO',
        sourceSystem: 'autowhats' as const,
        qualificationKey: 'autowhats:source-session:163874527551579@lid:22',
        whatsapp: '5511999999999',
        qualifiedAtMs: 1_700_000_000_000,
        userMessageCount: 2,
        aiReplyCount: 2,
        stage: 'awaiting_score' as const,
        score: null,
        comment: null,
        scorePromptAttempts: 1,
        commentPromptAttempts: 0,
        lastPromptAtMs: 1_700_000_000_000,
        initialSentAtMs: 1_700_000_000_000,
        completedAtMs: null
      }
    }
  }
}

test('buildRecoveryPreview detects missing score and comment events from inbound replies', async () => {
  const preview = await buildRecoveryPreview(
    {
      leadStore: {
        listByCampaignType: async () => [
          {
            ...buildLead(),
            chatId: '163874527551579@lid',
            campaign: {
              type: 'post_interaction_feedback',
              targetSessionId: 'source-session',
              attempt: 0,
              meta: null
            }
          }
        ]
      } as any,
      inboundStore: {
        listUserTextsByChatIds: async () => [
          {
            id: 10,
            sessionId: 'sender-session',
            chatId: '163874527551579@lid',
            messageId: 'msg-1',
            fromMe: false,
            messageType: 'conversation',
            text: 'nota: 8 gostei bastante',
            messageTimestampMs: 1_700_000_100_000
          }
        ]
      } as any,
      eventStore: {
        listQualifiedEventContexts: async () => [
          {
            senderSessionId: 'sender-session',
            chatId: '5511999999999@s.whatsapp.net',
            phone: '5511999999999',
            sourceSessionId: 'source-session',
            sourceCompanyName: 'Empresa XPTO',
            sourceSystem: 'autowhats',
            qualificationKey: 'autowhats:source-session:163874527551579@lid:22',
            qualifiedAtMs: 1_700_000_000_000,
            userMessageCount: 2,
            aiReplyCount: 2,
            triggerOutboundId: 22
          }
        ],
        listEventStateByQualificationKeys: async () => new Map()
      } as any
    },
    {
      senderSessionId: 'sender-session',
      fromMs: 1_700_000_000_000,
      toMs: 1_700_000_200_000
    }
  )

  assert.equal(preview.scoreCandidatesDetected, 1)
  assert.equal(preview.missingScoreEvents, 1)
  assert.equal(preview.missingCommentEvents, 1)

  const events = buildRecoveryEventInputs('sender-session', preview.candidates)
  assert.deepEqual(
    events.map((event) => event.eventName),
    ['score_received', 'comment_received']
  )
})

test('buildRecoveryEventInputs stays idempotent when score/comment already exist', () => {
  const events = buildRecoveryEventInputs('sender-session', [
    {
      leadId: 'lead-1',
      chatId: '5511999999999@s.whatsapp.net',
      phone: '5511999999999',
      sourceSessionId: 'source-session',
      sourceCompanyName: 'Empresa XPTO',
      sourceSystem: 'autowhats',
      qualificationKey: 'autowhats:source-session:163874527551579@lid:22',
      score: 8,
      comment: 'gostei bastante',
      messageTimestampMs: 1_700_000_100_000,
      inboundMessageId: 10,
      hasScoreEvent: true,
      hasCommentEvent: true
    },
    {
      leadId: 'lead-2',
      chatId: '551188887777@s.whatsapp.net',
      phone: '551188887777',
      sourceSessionId: 'source-session',
      sourceCompanyName: 'Empresa XPTO',
      sourceSystem: 'autowhats',
      qualificationKey: 'autowhats:source-session:551188887777@s.whatsapp.net:23',
      score: 6,
      comment: 'faltou contexto',
      messageTimestampMs: 1_700_000_200_000,
      inboundMessageId: 11,
      hasScoreEvent: true,
      hasCommentEvent: false
    }
  ])

  assert.deepEqual(
    events.map((event) => event.eventName),
    ['comment_received']
  )
  assert.equal(events[0]?.qualificationKey, 'autowhats:source-session:551188887777@s.whatsapp.net:23')
})
