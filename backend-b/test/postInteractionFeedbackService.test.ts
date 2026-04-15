import assert from 'node:assert/strict'
import test from 'node:test'
import type { OutboundMessageRecord } from '../src/messages'
import type { PostInteractionFeedbackCampaignMeta } from '../src/leads'
import { PostInteractionFeedbackService } from '../src/postInteractionFeedback/service'

function buildMeta(overrides: Partial<PostInteractionFeedbackCampaignMeta> = {}): PostInteractionFeedbackCampaignMeta {
  return {
    sourceSessionId: 'source-session',
    sourceChatId: '5511999999999@s.whatsapp.net',
    sourceCompanyName: 'Escola de Patinação',
    sourceSystem: 'autowhats',
    qualificationKey: 'autowhats:source-session:5511999999999@s.whatsapp.net:22',
    whatsapp: '5511999999999',
    qualifiedAtMs: 1_700_000_000_000,
    userMessageCount: 2,
    aiReplyCount: 2,
    stage: 'awaiting_score',
    score: null,
    comment: null,
    scorePromptAttempts: 1,
    commentPromptAttempts: 0,
    lastPromptAtMs: 1_700_000_000_000,
    initialSentAtMs: 1_700_000_000_000,
    completedAtMs: null,
    ...overrides
  }
}

function buildSentAiRecord(overrides: Partial<OutboundMessageRecord> = {}): OutboundMessageRecord {
  return {
    id: 22,
    sessionId: 'source-session',
    chatId: '5511999999999@s.whatsapp.net',
    payloadHash: 'hash',
    status: 'sent',
    attempts: 1,
    messageId: 'wamid-1',
    error: null,
    payload: {
      type: 'text',
      text: 'Olá',
      origin: 'ai'
    },
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_000,
    ...overrides
  }
}

function createService(overrides: Partial<Record<string, unknown>> = {}) {
  const now = 1_700_000_000_000
  const calls = {
    events: [] as any[],
    upserts: [] as any[],
    updates: [] as any[],
    outbound: [] as any[],
    disables: [] as any[],
    enabled: [] as any[],
    presentationIncrements: [] as any[]
  }
  const state = {
    chatConfigs: new Map<string, { aiEnabled: boolean; disabledReason: string | null }>(),
    presentationCounters: new Map<string, number>()
  }
  const overrideMap = overrides as any

  const service = new PostInteractionFeedbackService({
    settings: {
      getPostInteractionProspecting: () => ({
        enabled: true,
        senderEmail: 'igsartor@icloud.com',
        ctaBaseUrl: '/login?mode=signup'
      }),
      ...(overrideMap.settings ?? {})
    } as any,
    eventStore: {
      getSummary: async () => ({
        qualified: 0,
        approachesSent: 0,
        feedbacksReceived: 0,
        averageScore: 0,
        offersSent: 0,
        timeoutsNoScore: 0,
        optOuts: 0
      }),
      getSummaryDetails: async () => ({
        summary: {
          qualified: 0,
          approachesSent: 0,
          feedbacksReceived: 0,
          averageScore: 0,
          offersSent: 0,
          timeoutsNoScore: 0,
          optOuts: 0
        },
        rawScoreEvents: 0,
        lastScoreAtMs: null
      }),
      getFeedbackDetails: async () => ({
        rows: [],
        stats: {
          feedbacksReceived: 0,
          averageScore: 0,
          byScore: [],
          byCompany: [],
          byDay: []
        },
        pageInfo: {
          limit: 25,
          nextCursor: null,
          hasMore: false
        }
      }),
      getLatestEventAt: async () => null,
      getLatestQualifiedEventContextByPhone: async () => null,
      getQualificationSnapshot: async () => ({
        initialSentAtMs: now,
        lastPromptAtMs: now,
        scorePromptAttempts: 1,
        commentPromptAttempts: 0,
        score: null,
        stage: 'awaiting_score',
        completedAtMs: null
      }),
      listEventStateByQualificationKeys: async () => new Map(),
      record: async (input: any) => {
        calls.events.push(input)
      },
      ...(overrideMap.eventStore ?? {})
    } as any,
    leadStore: {
      get: async () => ({
        id: 'source-lead',
        name: 'Ana',
        whatsapp: '5511999999999',
        campaign: null
      }),
      findByChatOrWhatsapp: async () => null,
      listByCampaignType: async () => [],
      upsertFromClient: async (input: any) => {
        calls.upserts.push(input)
        return { id: input.leadId }
      },
      update: async (_sessionId: string, leadId: string, update: any) => {
        calls.updates.push({ leadId, update })
        return null
      },
      claimDueByCampaignType: async () => [],
      releaseAutoFollowUpClaim: async () => undefined,
      ...(overrideMap.leadStore ?? {})
    } as any,
    inboundStore: {
      countUserMessagesSince: async () => 2,
      listUserTextsByChatIds: async () => [],
      ...(overrideMap.inboundStore ?? {})
    } as any,
    outboundStore: {
      countSentAiMessagesSince: async () => 2,
      listSentAiMessagesSince: async () => [],
      ...(overrideMap.outboundStore ?? {})
    } as any,
    outboundService: {
      enqueue: async (input: any) => {
        calls.outbound.push(input)
        return { id: 1 }
      },
      ...(overrideMap.outboundService ?? {})
    } as any,
    statusStore: {
      getStatus: async () => ({
        sessionId: 'sender-session',
        status: 'connected',
        updatedAt: now
      }),
      ...(overrideMap.statusStore ?? {})
    } as any,
    chatAiConfigStore: {
      get: async (sessionId: string, chatId: string) => {
        const entry = state.chatConfigs.get(`${sessionId}:${chatId}`)
        return entry ? { sessionId, chatId, ...entry } : null
      },
      disable: async (sessionId: string, chatId: string, reason: string) => {
        calls.disables.push({ sessionId, chatId, reason })
        state.chatConfigs.set(`${sessionId}:${chatId}`, {
          aiEnabled: false,
          disabledReason: reason
        })
      },
      setEnabled: async (sessionId: string, chatId: string, enabled: boolean) => {
        calls.enabled.push({ sessionId, chatId, enabled })
        state.chatConfigs.set(`${sessionId}:${chatId}`, {
          aiEnabled: enabled,
          disabledReason: enabled ? null : 'manual'
        })
        return { sessionId, chatId, aiEnabled: enabled, disabledReason: enabled ? null : 'manual' }
      },
      ...(overrideMap.chatAiConfigStore ?? {})
    } as any,
    presentationStore: {
      getCounter: async (sessionId: string, chatId: string) =>
        state.presentationCounters.get(`${sessionId}:${chatId}`) ?? 0,
      increment: async (sessionId: string, chatId: string) => {
        calls.presentationIncrements.push({ sessionId, chatId })
        const key = `${sessionId}:${chatId}`
        state.presentationCounters.set(key, (state.presentationCounters.get(key) ?? 0) + 1)
      },
      ...(overrideMap.presentationStore ?? {})
    } as any,
    aiOptOutStore: {
      setOptOut: async () => undefined,
      clearOptOut: async () => undefined,
      isOptedOut: async () => false,
      ...(overrideMap.aiOptOutStore ?? {})
    } as any,
    aiConfigResolver: {
      get: async (sessionId: string) =>
        sessionId === 'source-session'
          ? ({ training: { nomeEmpresa: 'Escola de Patinação' } } as any)
          : null,
      ...(overrideMap.aiConfigResolver ?? {})
    },
    defaultAiConfig: {
      enabled: true,
      respondInGroups: false,
      provider: 'openai',
      model: 'gpt-5.2',
      temperature: 0.4,
      maxTokens: 2000,
      systemPrompt: 'prompt',
      fallbackMode: 'silence',
      fallbackText: '',
      optOutKeywords: ['parar'],
      optInKeywords: ['voltar'],
      contextMaxMessages: 20,
      contextTtlSec: 3600,
      processingTimeoutMs: 60000,
      ...(overrideMap.defaultAiConfig ?? {})
    } as any,
    identityResolver: {
      resolveSessionIdByEmail: async () => 'sender-session',
      ...(overrideMap.identityResolver ?? {})
    },
    appPublicUrl: 'https://app.autowhats.com',
    now: () => now,
    ...(overrideMap.serviceOptions ?? {})
  })

  return { service, calls, now, state }
}

function lastUpdate(calls: ReturnType<typeof createService>['calls']) {
  return calls.updates.at(-1)?.update ?? null
}

test('PostInteractionFeedbackService qualifies a successful conversation and sends the first message', async () => {
  const { service, calls, now } = createService()

  await service.handleAiReplySent({
    sessionId: 'source-session',
    chatId: '5511999999999@s.whatsapp.net',
    inboundId: 11,
    outboundId: 22
  })

  assert.equal(calls.upserts.length, 1)
  assert.equal(calls.upserts[0].campaignType, 'post_interaction_feedback')
  assert.equal(calls.upserts[0].campaignMeta.whatsapp, '5511999999999')
  assert.equal(calls.updates.length, 2)
  assert.equal(calls.outbound.length, 1)
  assert.equal(calls.disables.length, 1)
  assert.equal(lastUpdate(calls)?.nextContact, now + 60 * 60 * 1000)
  assert.equal(lastUpdate(calls)?.campaignMeta.stage, 'awaiting_score')
  assert.equal(lastUpdate(calls)?.campaignMeta.initialSentAtMs, now)
  assert.match(calls.outbound[0].text, /Escola de Patinação/)
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['qualified', 'initial_message_sent']
  )
})

test('PostInteractionFeedbackService records qualified even when the sender session is offline', async () => {
  const { service, calls, now } = createService({
    statusStore: {
      getStatus: async () => ({
        sessionId: 'sender-session',
        status: 'disconnected',
        updatedAt: now
      })
    }
  })

  await service.handleAiReplySent({
    sessionId: 'source-session',
    chatId: '5511999999999@s.whatsapp.net',
    inboundId: 11,
    outboundId: 22
  })

  assert.equal(calls.outbound.length, 0)
  assert.equal(calls.updates.length, 2)
  assert.equal(lastUpdate(calls)?.nextContact, now + 5 * 60 * 1000)
  assert.equal(lastUpdate(calls)?.campaignMeta.initialSentAtMs, null)
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['qualified', 'initial_message_failed']
  )
})

test('PostInteractionFeedbackService enrolls a qualified Dancing interaction with external target metadata', async () => {
  const { service, calls } = createService()

  const result = await service.enrollQualifiedInteraction({
    sourceSystem: 'dancing',
    sourceSessionId: 'dancing-session',
    sourceChatId: '551188887777@s.whatsapp.net',
    whatsapp: '551188887777',
    contactName: 'Joana',
    sourceCompanyName: 'Dancing Patinação',
    qualifiedAtMs: 1_700_000_000_000,
    userMessageCount: 2,
    aiReplyCount: 2,
    qualificationKey: 'dancing:dancing-session:551188887777@s.whatsapp.net:42',
    triggerOutboundId: 42
  })

  assert.equal(result.status, 'enrolled')
  assert.equal(result.senderSessionId, 'sender-session')
  assert.equal(calls.upserts.length, 1)
  assert.equal(calls.upserts[0].campaignTargetSessionId, 'dancing:dancing-session')
  assert.equal(calls.upserts[0].campaignMeta.sourceSystem, 'dancing')
  assert.equal(calls.upserts[0].campaignMeta.qualificationKey, 'dancing:dancing-session:551188887777@s.whatsapp.net:42')
  assert.equal(calls.upserts[0].campaignMeta.whatsapp, '551188887777')
})

test('PostInteractionFeedbackService accepts score plus comment on @lid chats and sends the commercial offer', async () => {
  const lead = {
    id: 'lead-1',
    sessionId: 'sender-session',
    name: 'Ana',
    whatsapp: '5511999999999',
    chatId: '163874527551579@lid',
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
      type: 'post_interaction_feedback',
      targetSessionId: 'source-session',
      attempt: 0,
      meta: buildMeta({
        sourceChatId: '163874527551579@lid',
        whatsapp: '5511999999999'
      })
    }
  }

  const { service, calls } = createService({
    leadStore: {
      get: async () => null,
      findByChatOrWhatsapp: async () => lead,
      upsertFromClient: async () => ({ id: 'lead-1' })
    }
  })

  const result = await service.handleInboundMessage({
    sessionId: 'sender-session',
    chatId: '163874527551579@lid',
    chatIdAlt: null,
    messageId: 'm1',
    senderId: '5511999999999@s.whatsapp.net',
    fromMe: false,
    timestampMs: 1_700_000_000_000,
    messageType: 'conversation',
    text: 'nota 9 gostei bastante',
    raw: {}
  })

  assert.equal(result.handled, true)
  assert.equal(calls.outbound.length, 1)
  assert.equal(calls.updates.length, 1)
  assert.equal(calls.updates[0].update.status, 'aguardando')
  assert.equal(calls.updates[0].update.nextContact, null)
  assert.equal(calls.updates[0].update.campaignMeta.stage, 'completed_positive')
  assert.equal(calls.updates[0].update.campaignMeta.comment, 'gostei bastante')
  assert.match(calls.outbound[0].text, /utm_campaign=post_interaction_feedback/)
  assert.match(calls.outbound[0].text, /testar gratuitamente o AutoWhats/)
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['score_received', 'comment_received', 'offer_sent']
  )
})

test('PostInteractionFeedbackService sends the CTA immediately for a positive score without requiring a comment', async () => {
  const lead = {
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
      type: 'post_interaction_feedback',
      targetSessionId: 'source-session',
      attempt: 0,
      meta: buildMeta()
    }
  }

  const { service, calls } = createService({
    leadStore: {
      get: async () => null,
      findByChatOrWhatsapp: async (_sessionId: string, chatId: string | null, whatsapp: string | null) => {
        if (chatId === '5511999999999@s.whatsapp.net' || whatsapp === '5511999999999') {
          return lead
        }
        return null
      },
      upsertFromClient: async () => ({ id: 'lead-1' })
    }
  })

  const result = await service.handleInboundMessage({
    sessionId: 'sender-session',
    chatId: '163874527551579@lid',
    chatIdAlt: null,
    messageId: 'm-positive',
    senderId: '5511999999999@s.whatsapp.net',
    fromMe: false,
    timestampMs: 1_700_000_000_000,
    messageType: 'conversation',
    text: '10',
    raw: {}
  })

  assert.equal(result.handled, true)
  assert.equal(calls.outbound.length, 1)
  assert.equal(calls.updates.length, 2)
  assert.equal(calls.updates.at(-1)?.update.status, 'aguardando')
  assert.equal(calls.updates.at(-1)?.update.chatId, '163874527551579@lid')
  assert.equal(calls.updates.at(-1)?.update.campaignMeta.stage, 'completed_positive')
  assert.equal(calls.updates.at(-1)?.update.campaignMeta.comment, null)
  assert.match(calls.outbound[0].text, /testar gratuitamente o AutoWhats/)
  assert.match(calls.outbound[0].text, /poderia melhorar nessa experiência/)
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['score_received', 'offer_sent']
  )
})

test('PostInteractionFeedbackService parses common short score variants', async () => {
  const variants = [
    { text: '2', score: 2 },
    { text: '6/10', score: 6 },
    { text: 'nota: 8', score: 8 },
    { text: 'minha nota é 10', score: 10 }
  ]

  for (const variant of variants) {
    const lead = {
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
        type: 'post_interaction_feedback',
        targetSessionId: 'source-session',
        attempt: 0,
        meta: buildMeta()
      }
    }

    const { service, calls } = createService({
      leadStore: {
        get: async () => null,
        findByChatOrWhatsapp: async () => lead,
        upsertFromClient: async () => ({ id: 'lead-1' })
      }
    })

    const result = await service.handleInboundMessage({
      sessionId: 'sender-session',
      chatId: '5511999999999@s.whatsapp.net',
      chatIdAlt: null,
      messageId: `msg-${variant.score}`,
      senderId: '5511999999999@s.whatsapp.net',
      fromMe: false,
      timestampMs: 1_700_000_000_000,
      messageType: 'conversation',
      text: variant.text,
      raw: {}
    })

    assert.equal(result.handled, true)
    assert.equal(calls.events[0]?.eventName, 'score_received')
    assert.equal(calls.events[0]?.score, variant.score)
  }
})

test('PostInteractionFeedbackService keeps low scores on the improvement path', async () => {
  const lead = {
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
      type: 'post_interaction_feedback',
      targetSessionId: 'source-session',
      attempt: 0,
      meta: buildMeta()
    }
  }

  const { service, calls } = createService({
    leadStore: {
      get: async () => null,
      findByChatOrWhatsapp: async () => lead,
      upsertFromClient: async () => ({ id: 'lead-1' })
    }
  })

  const result = await service.handleInboundMessage({
    sessionId: 'sender-session',
    chatId: '5511999999999@s.whatsapp.net',
    chatIdAlt: null,
    messageId: 'm-low',
    senderId: '5511999999999@s.whatsapp.net',
    fromMe: false,
    timestampMs: 1_700_000_000_000,
    messageType: 'conversation',
    text: '4',
    raw: {}
  })

  assert.equal(result.handled, true)
  assert.equal(calls.outbound.length, 1)
  assert.match(calls.outbound[0].text, /O que eu posso melhorar/)
  assert.equal(calls.updates.length, 1)
  assert.equal(calls.updates[0].update.campaignMeta.stage, 'awaiting_comment')
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['score_received', 'comment_request_sent']
  )
})

test('PostInteractionFeedbackService releases the chat back to the AutoWhats AI after a completed positive campaign', async () => {
  const lead = {
    id: 'lead-1',
    sessionId: 'sender-session',
    name: 'Ana',
    whatsapp: '5511999999999',
    chatId: '5511999999999@s.whatsapp.net',
    aiTag: 'P. Ativa',
    status: 'aguardando',
    lastContact: null,
    nextContact: null,
    observations: null,
    createdAt: null,
    lastMessage: null,
    source: 'autowhats_feedback',
    updatedAt: null,
    campaign: {
      type: 'post_interaction_feedback',
      targetSessionId: 'source-session',
      attempt: 0,
      meta: buildMeta({
        stage: 'completed_positive',
        score: 10,
        completedAtMs: 1_700_000_000_000
      })
    }
  }

  const { service, calls, state } = createService({
    leadStore: {
      get: async () => null,
      findByChatOrWhatsapp: async (_sessionId: string, chatId: string | null, whatsapp: string | null) => {
        if (chatId === '5511999999999@s.whatsapp.net' || whatsapp === '5511999999999') {
          return lead
        }
        return null
      },
      upsertFromClient: async () => ({ id: 'lead-1' })
    }
  })

  state.chatConfigs.set('sender-session:163874527551579@lid', {
    aiEnabled: false,
    disabledReason: 'post_interaction_feedback'
  })
  state.chatConfigs.set('sender-session:5511999999999@s.whatsapp.net', {
    aiEnabled: false,
    disabledReason: 'post_interaction_feedback'
  })

  const result = await service.handleInboundMessage({
    sessionId: 'sender-session',
    chatId: '163874527551579@lid',
    chatIdAlt: null,
    messageId: 'm-handoff',
    senderId: '5511999999999@s.whatsapp.net',
    fromMe: false,
    timestampMs: 1_700_000_000_000,
    messageType: 'conversation',
    text: 'Quero entender melhor como funciona',
    raw: {}
  })

  assert.equal(result.handled, false)
  assert.equal(calls.outbound.length, 0)
  assert.deepEqual(
    calls.enabled.map((entry) => entry.chatId),
    ['163874527551579@lid', '5511999999999@s.whatsapp.net']
  )
  assert.deepEqual(
    calls.presentationIncrements.map((entry) => entry.chatId),
    ['163874527551579@lid', '5511999999999@s.whatsapp.net']
  )
})

test('PostInteractionFeedbackService retries the initial prompt before sending reminders', async () => {
  const meta = buildMeta({
    sourceChatId: '163874527551579@lid',
    whatsapp: '5511999999999',
    lastPromptAtMs: null,
    initialSentAtMs: null
  })
  const claim = {
    sessionId: 'sender-session',
    leadId: 'lead-1',
    chatId: '163874527551579@lid',
    status: 'em_processo',
    nextContactAt: 1_700_000_000_000,
    autoFollowUpStep: 0,
    campaignType: 'post_interaction_feedback' as const,
    campaignTargetSessionId: 'source-session',
    campaignAttempt: 0,
    campaignMeta: meta
  }

  const { service, calls, now } = createService()
  await service.processDueLead(claim)

  assert.equal(calls.outbound.length, 1)
  assert.match(calls.outbound[0].text, /De 1 a 10/)
  assert.equal(calls.updates.length, 1)
  assert.equal(calls.updates[0].update.nextContact, now + 60 * 60 * 1000)
  assert.equal(calls.updates[0].update.campaignMeta.initialSentAtMs, now)
  assert.equal(calls.events[0].eventName, 'initial_message_sent')
})

test('PostInteractionFeedbackService closes the campaign after the final no-score window', async () => {
  const meta = buildMeta({ scorePromptAttempts: 3 })
  const claim = {
    sessionId: 'sender-session',
    leadId: 'lead-1',
    chatId: '5511999999999@s.whatsapp.net',
    status: 'em_processo',
    nextContactAt: 1_700_000_000_000,
    autoFollowUpStep: 0,
    campaignType: 'post_interaction_feedback' as const,
    campaignTargetSessionId: 'source-session',
    campaignAttempt: 0,
    campaignMeta: meta
  }

  const { service, calls } = createService()
  await service.processDueLead(claim)

  assert.equal(calls.outbound.length, 0)
  assert.equal(calls.updates.length, 1)
  assert.equal(calls.updates[0].update.status, 'inativo')
  assert.equal(calls.updates[0].update.nextContact, null)
  assert.equal(calls.updates[0].update.campaignMeta.stage, 'awaiting_score')
  assert.equal(calls.events[0].eventName, 'closed_no_score')
})

test('PostInteractionFeedbackService backfills recent AI sends using the lead whatsapp for @lid chats', async () => {
  const record = buildSentAiRecord({
    id: 222,
    chatId: '163874527551579@lid'
  })
  const { service, calls } = createService({
    leadStore: {
      get: async () => ({
        id: 'source-lead',
        name: 'Ana',
        whatsapp: '5511999999999',
        campaign: null
      })
    },
    outboundStore: {
      countSentAiMessagesSince: async () => 2,
      listSentAiMessagesSince: async () => [record]
    }
  })

  await service.backfillRecentQualifiedInteractions({
    sinceMs: 1_700_000_000_000 - 24 * 60 * 60 * 1000
  })

  assert.equal(calls.upserts.length, 1)
  assert.equal(calls.upserts[0].whatsapp, '5511999999999')
  assert.equal(calls.outbound.length, 1)
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['qualified', 'initial_message_sent']
  )
})

test('PostInteractionFeedbackService recovers missing campaign meta from qualified events on inbound replies', async () => {
  const lead = {
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
      meta: null
    }
  }

  const { service, calls } = createService({
    leadStore: {
      get: async () => null,
      findByChatOrWhatsapp: async () => lead,
      upsertFromClient: async () => ({ id: 'lead-1' })
    },
    eventStore: {
      getLatestQualifiedEventContextByPhone: async () => ({
        senderSessionId: 'sender-session',
        chatId: '5511999999999@s.whatsapp.net',
        phone: '5511999999999',
        sourceSessionId: 'source-session',
        sourceCompanyName: 'Escola de Patinação',
        sourceSystem: 'autowhats',
        qualificationKey: 'autowhats:source-session:5511999999999@s.whatsapp.net:22',
        qualifiedAtMs: 1_700_000_000_000,
        userMessageCount: 2,
        aiReplyCount: 2,
        triggerOutboundId: 22
      }),
      getQualificationSnapshot: async () => ({
        initialSentAtMs: 1_700_000_000_000,
        lastPromptAtMs: 1_700_000_000_000,
        scorePromptAttempts: 1,
        commentPromptAttempts: 0,
        score: null,
        stage: 'awaiting_score' as const,
        completedAtMs: null
      })
    }
  })

  const result = await service.handleInboundMessage({
    sessionId: 'sender-session',
    chatId: '5511999999999@s.whatsapp.net',
    chatIdAlt: null,
    messageId: 'm-recovered',
    senderId: '5511999999999@s.whatsapp.net',
    fromMe: false,
    timestampMs: 1_700_000_000_500,
    messageType: 'conversation',
    text: '8',
    raw: {}
  })

  assert.equal(result.handled, true)
  assert.equal(calls.outbound.length, 1)
  assert.equal(calls.updates[0]?.update.campaignMeta?.qualificationKey, 'autowhats:source-session:5511999999999@s.whatsapp.net:22')
  assert.equal(calls.updates.at(-1)?.update.campaignMeta.stage, 'completed_positive')
  assert.deepEqual(
    calls.events.map((entry) => entry.eventName),
    ['score_received', 'offer_sent']
  )
})

test('PostInteractionFeedbackService recovers due leads with missing campaign meta from qualified events', async () => {
  const lead = {
    id: 'lead-1',
    sessionId: 'sender-session',
    name: 'Ana',
    whatsapp: '5511999999999',
    chatId: '5511999999999@s.whatsapp.net',
    aiTag: 'P. Ativa',
    status: 'em_processo',
    lastContact: null,
    nextContact: 1_700_000_000_000,
    observations: null,
    createdAt: null,
    lastMessage: null,
    source: 'autowhats_feedback',
    updatedAt: null,
    campaign: {
      type: 'post_interaction_feedback' as const,
      targetSessionId: 'source-session',
      attempt: 0,
      meta: null
    }
  }

  const { service, calls } = createService({
    leadStore: {
      get: async () => lead,
      claimDueByCampaignType: async () => [
        {
          sessionId: 'sender-session',
          leadId: 'lead-1',
          chatId: '5511999999999@s.whatsapp.net',
          status: 'em_processo',
          nextContactAt: 1_700_000_000_000,
          autoFollowUpStep: 0,
          campaignType: 'post_interaction_feedback',
          campaignTargetSessionId: 'source-session',
          campaignAttempt: 0,
          campaignMeta: null
        }
      ]
    },
    eventStore: {
      getLatestQualifiedEventContextByPhone: async () => ({
        senderSessionId: 'sender-session',
        chatId: '5511999999999@s.whatsapp.net',
        phone: '5511999999999',
        sourceSessionId: 'source-session',
        sourceCompanyName: 'Escola de Patinação',
        sourceSystem: 'autowhats',
        qualificationKey: 'autowhats:source-session:5511999999999@s.whatsapp.net:22',
        qualifiedAtMs: 1_700_000_000_000,
        userMessageCount: 2,
        aiReplyCount: 2,
        triggerOutboundId: 22
      }),
      getQualificationSnapshot: async () => ({
        initialSentAtMs: 1_700_000_000_000,
        lastPromptAtMs: 1_700_000_000_000,
        scorePromptAttempts: 2,
        commentPromptAttempts: 0,
        score: null,
        stage: 'awaiting_score' as const,
        completedAtMs: null
      })
    }
  })

  const claims = await service.claimDueLeads({
    batchSize: 10,
    leaseMs: 60_000
  })

  assert.equal(claims.length, 1)
  assert.equal(claims[0]?.campaignMeta.qualificationKey, 'autowhats:source-session:5511999999999@s.whatsapp.net:22')
  assert.equal(calls.updates[0]?.update.campaignMeta?.scorePromptAttempts, 2)
})

test('PostInteractionFeedbackService exposes diagnostics when sender lookup fails', async () => {
  const { service } = createService({
    settings: {
      getPostInteractionProspecting: () => ({
        enabled: true,
        senderEmail: 'missing-sender@autowhats.com',
        ctaBaseUrl: '/login?mode=signup'
      })
    },
    identityResolver: {
      resolveSessionIdByEmail: async () => {
        throw new Error('sender_session_not_found')
      }
    }
  })

  const report = await service.getSummary(1_700_000_000_000, 1_700_100_000_000)

  assert.deepEqual(report.summary, {
    qualified: 0,
    approachesSent: 0,
    feedbacksReceived: 0,
    averageScore: 0,
    offersSent: 0,
    timeoutsNoScore: 0,
    optOuts: 0
  })
  assert.equal(report.diagnostics.lookupStatus, 'sender_lookup_failed')
  assert.equal(report.diagnostics.failureReason, 'sender_session_not_found')
  assert.equal(report.diagnostics.senderSessionId, null)
})

test('PostInteractionFeedbackService returns feedback detail report from the event store', async () => {
  const detailReport = {
    rows: [
      {
        qualificationKey: 'autowhats:source-session:5511999999999@s.whatsapp.net:22',
        score: 8,
        companyName: 'Escola de Patinação',
        phone: '5511999999999',
        feedbackAtMs: 1_700_000_000_000,
        sourceSystem: 'autowhats' as const,
        chatId: '163874527551579@lid'
      }
    ],
    stats: {
      feedbacksReceived: 1,
      averageScore: 8,
      byScore: [{ score: 8, count: 1 }],
      byCompany: [{ companyName: 'Escola de Patinação', count: 1, averageScore: 8 }],
      byDay: [{ day: '2025-11-14', count: 1, averageScore: 8 }]
    },
    pageInfo: {
      limit: 25,
      nextCursor: null,
      hasMore: false
    }
  }

  const { service } = createService({
    eventStore: {
      getFeedbackDetails: async () => detailReport
    }
  })

  const report = await service.getFeedbackDetails({
    fromMs: 1_700_000_000_000,
    toMs: 1_700_100_000_000,
    focus: 'feedbacksReceived',
    company: null,
    scoreMin: null,
    scoreMax: null,
    cursor: null,
    limit: 25
  })

  assert.deepEqual(report, detailReport)
})
