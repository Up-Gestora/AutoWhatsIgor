import type { LeadStore } from '../leads'
import type { InboundMessageStore } from '../messages'
import { toUserJid } from '../whatsapp/normalize'
import type { PostInteractionFeedbackEventStore } from './eventStore'
import { parseScoreAndComment } from './scoreParsing'
import type {
  PostInteractionFeedbackEventInput,
  PostInteractionFeedbackQualifiedEventContext,
  PostInteractionFeedbackRecoveryCandidate,
  PostInteractionFeedbackRecoveryPreview
} from './types'

type RecoveryDependencies = {
  leadStore: Pick<LeadStore, 'listByCampaignType'>
  inboundStore: Pick<InboundMessageStore, 'listUserTextsByChatIds'>
  eventStore: Pick<PostInteractionFeedbackEventStore, 'listEventStateByQualificationKeys' | 'listQualifiedEventContexts'>
}

type RecoveryScope = {
  leadId: string | null
  chatIds: string[]
  phone: string
  qualificationKey: string
  sourceSessionId: string
  sourceCompanyName: string
  sourceSystem: 'autowhats' | 'dancing'
  windowStartMs: number
  windowEndMs: number
  qualifiedAtMs: number
}

export async function buildRecoveryPreview(
  deps: RecoveryDependencies,
  input: { senderSessionId: string; fromMs: number; toMs: number; leadLimit?: number; messageLimit?: number }
): Promise<PostInteractionFeedbackRecoveryPreview> {
  const safeFromMs = Math.max(0, Math.floor(input.fromMs))
  const safeToMs = Math.max(safeFromMs, Math.floor(input.toMs))
  const leadLimit = Math.max(1, Math.min(Math.floor(input.leadLimit ?? 10_000), 50_000))
  const messageLimit = Math.max(1, Math.min(Math.floor(input.messageLimit ?? 50_000), 100_000))

  const leads = await deps.leadStore.listByCampaignType(input.senderSessionId, 'post_interaction_feedback', leadLimit)
  const qualifiedEvents = await deps.eventStore.listQualifiedEventContexts(input.senderSessionId, {
    fromMs: safeFromMs,
    toMs: safeToMs,
    limit: leadLimit
  })
  const scopedLeads = buildScopedContexts(leads, qualifiedEvents, safeFromMs, safeToMs)
  if (scopedLeads.length === 0) {
    return emptyPreview()
  }

  const chatIds = uniqueTexts(scopedLeads.flatMap((lead) => lead.chatIds))
  const messages = await deps.inboundStore.listUserTextsByChatIds(input.senderSessionId, chatIds, {
    fromMs: safeFromMs,
    toMs: safeToMs,
    limit: messageLimit
  })

  const messagesByChat = new Map<string, typeof messages>()
  for (const message of messages) {
    const existing = messagesByChat.get(message.chatId) ?? []
    existing.push(message)
    messagesByChat.set(message.chatId, existing)
  }

  const candidatesByQualificationKey = new Map<string, PostInteractionFeedbackRecoveryCandidate>()
  for (const lead of scopedLeads) {
    const candidateMessages = uniqueMessagesById(
      lead.chatIds.flatMap((chatId) => messagesByChat.get(chatId) ?? [])
    )

    const match = candidateMessages.find((message) => {
      if (!Number.isFinite(message.messageTimestampMs)) {
        return false
      }
      if (message.messageTimestampMs < lead.windowStartMs || message.messageTimestampMs > lead.windowEndMs) {
        return false
      }
      return parseScoreAndComment(message.text ?? '').score !== null
    })
    if (!match) {
      continue
    }

    const parsed = parseScoreAndComment(match.text ?? '')
    if (parsed.score === null) {
      continue
    }

    const existing = candidatesByQualificationKey.get(lead.qualificationKey)
    if (existing && existing.messageTimestampMs <= match.messageTimestampMs) {
      continue
    }

    candidatesByQualificationKey.set(lead.qualificationKey, {
      leadId: lead.leadId,
      chatId: match.chatId,
      phone: lead.phone,
      sourceSessionId: lead.sourceSessionId,
      sourceCompanyName: lead.sourceCompanyName,
      sourceSystem: lead.sourceSystem,
      qualificationKey: lead.qualificationKey,
      score: parsed.score,
      comment: parsed.comment,
      messageTimestampMs: match.messageTimestampMs,
      inboundMessageId: match.id,
      hasScoreEvent: false,
      hasCommentEvent: false
    })
  }

  const candidates = Array.from(candidatesByQualificationKey.values()).sort(
    (a, b) => a.messageTimestampMs - b.messageTimestampMs || a.inboundMessageId - b.inboundMessageId
  )
  if (candidates.length === 0) {
    return emptyPreview()
  }

  const eventState = await deps.eventStore.listEventStateByQualificationKeys(
    input.senderSessionId,
    candidates.map((candidate) => candidate.qualificationKey)
  )

  const enriched = candidates.map((candidate) => {
    const existing = eventState.get(candidate.qualificationKey)
    return {
      ...candidate,
      hasScoreEvent: existing?.hasScoreEvent ?? false,
      hasCommentEvent: existing?.hasCommentEvent ?? false
    }
  })

  return {
    scoreCandidatesDetected: enriched.length,
    missingScoreEvents: enriched.filter((candidate) => !candidate.hasScoreEvent).length,
    missingCommentEvents: enriched.filter((candidate) => candidate.comment && !candidate.hasCommentEvent).length,
    candidates: enriched
  }
}

export function buildRecoveryEventInputs(
  senderSessionId: string,
  candidates: PostInteractionFeedbackRecoveryCandidate[]
): PostInteractionFeedbackEventInput[] {
  const events: PostInteractionFeedbackEventInput[] = []

  for (const candidate of candidates) {
    const baseEvent = {
      senderSessionId,
      chatId: candidate.chatId,
      phone: candidate.phone,
      sourceSessionId: candidate.sourceSessionId,
      sourceCompanyName: candidate.sourceCompanyName,
      sourceSystem: candidate.sourceSystem,
      qualificationKey: candidate.qualificationKey,
      score: candidate.score,
      payload: {
        source: 'post_interaction_feedback_backfill',
        recoveredFromInboundMessageId: candidate.inboundMessageId
      },
      occurredAtMs: candidate.messageTimestampMs
    } satisfies Omit<PostInteractionFeedbackEventInput, 'eventName'>

    if (!candidate.hasScoreEvent) {
      events.push({
        ...baseEvent,
        eventName: 'score_received'
      })
    }
    if (candidate.comment && !candidate.hasCommentEvent) {
      events.push({
        ...baseEvent,
        eventName: 'comment_received'
      })
    }
  }

  return events
}

function buildScopedContexts(
  leads: Awaited<ReturnType<RecoveryDependencies['leadStore']['listByCampaignType']>>,
  qualifiedEvents: PostInteractionFeedbackQualifiedEventContext[],
  fromMs: number,
  toMs: number
): RecoveryScope[] {
  const leadIndex = buildLeadIndex(leads)
  const rows = qualifiedEvents
    .map((event) => {
      const phone = normalizePhone(event.phone)
      const chatId = typeof event.chatId === 'string' ? event.chatId.trim() : ''
      if (!phone || !chatId) {
        return null
      }

      const matchedLead =
        leadIndex.byKey.get(buildLeadLookupKey(chatId, phone)) ??
        leadIndex.byPhone.get(phone) ??
        null
      const qualificationChatId = parseFeedbackQualificationKey(event.qualificationKey)?.sourceChatId ?? null

      return {
        leadId: matchedLead?.id ?? null,
        chatIds: uniqueTexts([chatId, matchedLead?.chatId ?? null, toUserJid(phone), qualificationChatId]),
        phone,
        qualificationKey: event.qualificationKey,
        sourceSessionId: event.sourceSessionId,
        sourceCompanyName: event.sourceCompanyName,
        sourceSystem: event.sourceSystem,
        windowStartMs: Math.max(fromMs, event.qualifiedAtMs),
        windowEndMs: toMs,
        qualifiedAtMs: event.qualifiedAtMs
      } satisfies RecoveryScope
    })
    .filter((lead): lead is RecoveryScope => lead !== null)

  const grouped = new Map<string, RecoveryScope[]>()
  for (const row of rows) {
    const key = row.phone
    const group = grouped.get(key) ?? []
    group.push(row)
    grouped.set(key, group)
  }

  const scoped: RecoveryScope[] = []
  for (const group of grouped.values()) {
    group.sort((a, b) => a.qualifiedAtMs - b.qualifiedAtMs)
    group.forEach((lead, index) => {
      const nextLead = group[index + 1]
      const nextQualifiedAtMs = nextLead?.qualifiedAtMs
      const windowEndMs =
        typeof nextQualifiedAtMs === 'number' && Number.isFinite(nextQualifiedAtMs)
          ? Math.min(toMs, nextQualifiedAtMs - 1)
          : toMs
      if (lead.windowStartMs > windowEndMs) {
        return
      }
      scoped.push({
        leadId: lead.leadId,
        chatIds: lead.chatIds,
        phone: lead.phone,
        qualificationKey: lead.qualificationKey,
        sourceSessionId: lead.sourceSessionId,
        sourceCompanyName: lead.sourceCompanyName,
        sourceSystem: lead.sourceSystem,
        qualifiedAtMs: lead.qualifiedAtMs,
        windowStartMs: lead.windowStartMs,
        windowEndMs
      })
    })
  }

  return scoped
}

function buildLeadIndex(leads: Awaited<ReturnType<RecoveryDependencies['leadStore']['listByCampaignType']>>) {
  const byKey = new Map<string, { id: string; chatId: string | null }>()
  const byPhone = new Map<string, { id: string; chatId: string | null }>()
  for (const lead of leads) {
    const phone = normalizePhone(lead.whatsapp)
    const chatId = typeof lead.chatId === 'string' ? lead.chatId.trim() : null
    if (!phone && !chatId) {
      continue
    }

    const entry = {
      id: lead.id,
      chatId
    }
    byKey.set(buildLeadLookupKey(chatId, phone), entry)
    if (phone && !byPhone.has(phone)) {
      byPhone.set(phone, entry)
    }
    if (phone) {
      byKey.set(buildLeadLookupKey(toUserJid(phone), phone), entry)
    }
  }
  return { byKey, byPhone }
}

function buildLeadLookupKey(chatId: string | null | undefined, phone: string | null | undefined) {
  return `${chatId ?? ''}|${phone ?? ''}`
}

function parseFeedbackQualificationKey(qualificationKey: string) {
  const match = qualificationKey.match(/^(autowhats|dancing):([^:]+):(.+):(\d+)$/)
  if (!match) {
    return null
  }

  return {
    sourceChatId: match[3]
  }
}

function normalizePhone(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

function uniqueTexts(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function uniqueMessagesById<T extends { id: number }>(messages: T[]) {
  const seen = new Set<number>()
  const result: T[] = []
  for (const message of messages) {
    if (seen.has(message.id)) {
      continue
    }
    seen.add(message.id)
    result.push(message)
  }
  return result.sort((a, b) => a.id - b.id)
}

function emptyPreview(): PostInteractionFeedbackRecoveryPreview {
  return {
    scoreCandidatesDetected: 0,
    missingScoreEvents: 0,
    missingCommentEvents: 0,
    candidates: []
  }
}
