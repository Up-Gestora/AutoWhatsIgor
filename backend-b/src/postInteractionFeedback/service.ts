import type { AiConfig, AiConfigOverride, AiOptOutStore, AiPresentationStore, ChatAiConfigStore } from '../ai'
import { evaluateOptOut, mergeAiConfig } from '../ai'
import type { LeadRecord, LeadStore, LeadUpdate, PostInteractionFeedbackCampaignMeta } from '../leads'
import type { InboundMessageStore, NormalizedInboundMessage, OutboundMessageService, OutboundMessageStore } from '../messages'
import type { MetricsStore } from '../observability/metrics'
import type { PostInteractionProspectingSettings, SystemSettingsService } from '../systemSettings'
import { toUserJid } from '../whatsapp/normalize'
import { resolveWhatsappFromCandidates } from '../whatsapp/resolvePhone'
import type { SessionStatusStore } from '../sessions/statusStore'
import { PostInteractionFeedbackEventStore } from './eventStore'
import {
  loadUserProfile as loadUserProfileFromIdentity,
  resolveSessionIdByEmail as resolveSessionIdByEmailFromIdentity
} from './identity'
import { buildRecoveryPreview } from './recovery'
import {
  isScoreOnlyText as isSharedScoreOnlyText,
  normalizeComment,
  parseScoreAndComment as parseSharedScoreAndComment,
  type ParsedScoreAndComment
} from './scoreParsing'
import type {
  PostInteractionFeedbackAiReplySent,
  PostInteractionFeedbackDetailsFilters,
  PostInteractionFeedbackDetailsReport,
  PostInteractionFeedbackDueLead,
  PostInteractionFeedbackEnrollmentResult,
  PostInteractionFeedbackEventInput,
  PostInteractionFeedbackInboundResult,
  PostInteractionFeedbackQualifiedEventContext,
  PostInteractionFeedbackQualifiedInteraction,
  PostInteractionFeedbackSenderResolution,
  PostInteractionFeedbackSummary,
  PostInteractionFeedbackSummaryDiagnostics,
  PostInteractionFeedbackSummaryReport
} from './types'

const QUALIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
const FIRST_REMINDER_DELAY_MS = 60 * 60 * 1000
const SECOND_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000
const FINAL_GRACE_DELAY_MS = 24 * 60 * 60 * 1000
const INITIAL_SEND_RETRY_DELAY_MS = 5 * 60 * 1000
const SESSION_ID_CACHE_TTL_MS = 10 * 60 * 1000
const CTA_UTM = {
  utm_source: 'whatsapp_system',
  utm_medium: 'customer_feedback',
  utm_campaign: 'post_interaction_feedback'
} as const

const senderSessionCache = new Map<string, { sessionId: string; expiresAt: number }>()

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type IdentityResolver = {
  resolveSessionIdByEmail(email: string): Promise<string>
}

type UserProfile = {
  name: string | null
  companyName?: string | null
}

type ProfileResolver = {
  getUserProfile(sessionId: string): Promise<UserProfile | null>
}

type PostInteractionFeedbackServiceOptions = {
  settings: SystemSettingsService
  eventStore: PostInteractionFeedbackEventStore
  leadStore: Pick<
    LeadStore,
    | 'get'
    | 'findByChatOrWhatsapp'
    | 'upsertFromClient'
    | 'update'
    | 'claimDueByCampaignType'
    | 'releaseAutoFollowUpClaim'
    | 'listByCampaignType'
  >
  inboundStore: Pick<InboundMessageStore, 'countUserMessagesSince' | 'listUserTextsByChatIds'>
  outboundStore: Pick<OutboundMessageStore, 'countSentAiMessagesSince' | 'listSentAiMessagesSince'>
  outboundService: Pick<OutboundMessageService, 'enqueue'>
  statusStore?: Pick<SessionStatusStore, 'getStatus'>
  chatAiConfigStore?: Pick<ChatAiConfigStore, 'get' | 'disable' | 'setEnabled'>
  presentationStore?: Pick<AiPresentationStore, 'getCounter' | 'increment'>
  aiOptOutStore: Pick<AiOptOutStore, 'setOptOut' | 'clearOptOut' | 'isOptedOut'>
  aiConfigResolver?: {
    get(sessionId: string): Promise<AiConfigOverride | null>
  }
  defaultAiConfig: AiConfig
  appPublicUrl?: string
  identityResolver?: IdentityResolver
  profileResolver?: ProfileResolver
  logger?: Logger
  metrics?: Pick<MetricsStore, 'increment'>
  now?: () => number
}

type EnrollQualifiedInteractionOptions = {
  senderSessionId?: string | null
}

export class PostInteractionFeedbackService {
  private readonly settings: SystemSettingsService
  private readonly eventStore: PostInteractionFeedbackEventStore
  private readonly leadStore: PostInteractionFeedbackServiceOptions['leadStore']
  private readonly inboundStore: PostInteractionFeedbackServiceOptions['inboundStore']
  private readonly outboundStore: PostInteractionFeedbackServiceOptions['outboundStore']
  private readonly outboundService: PostInteractionFeedbackServiceOptions['outboundService']
  private readonly statusStore?: PostInteractionFeedbackServiceOptions['statusStore']
  private readonly chatAiConfigStore?: PostInteractionFeedbackServiceOptions['chatAiConfigStore']
  private readonly presentationStore?: PostInteractionFeedbackServiceOptions['presentationStore']
  private readonly aiOptOutStore: PostInteractionFeedbackServiceOptions['aiOptOutStore']
  private readonly aiConfigResolver?: PostInteractionFeedbackServiceOptions['aiConfigResolver']
  private readonly defaultAiConfig: AiConfig
  private readonly appPublicUrl: string | null
  private readonly identityResolver?: IdentityResolver
  private readonly profileResolver?: ProfileResolver
  private readonly logger: Logger
  private readonly metrics?: Pick<MetricsStore, 'increment'>
  private readonly now: () => number

  constructor(options: PostInteractionFeedbackServiceOptions) {
    this.settings = options.settings
    this.eventStore = options.eventStore
    this.leadStore = options.leadStore
    this.inboundStore = options.inboundStore
    this.outboundStore = options.outboundStore
    this.outboundService = options.outboundService
    this.statusStore = options.statusStore
    this.chatAiConfigStore = options.chatAiConfigStore
    this.presentationStore = options.presentationStore
    this.aiOptOutStore = options.aiOptOutStore
    this.aiConfigResolver = options.aiConfigResolver
    this.defaultAiConfig = options.defaultAiConfig
    this.appPublicUrl = normalizeOptionalText(options.appPublicUrl)
    this.identityResolver = options.identityResolver
    this.profileResolver = options.profileResolver
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.now = options.now ?? (() => Date.now())
  }

  async getSummary(fromMs: number, toMs: number): Promise<PostInteractionFeedbackSummaryReport> {
    const senderResolution = await this.resolveSenderSessionContext()
    const diagnostics = emptyDiagnostics(senderResolution)
    if (senderResolution.lookupStatus !== 'ok' || !senderResolution.sessionId) {
      return {
        summary: emptySummary(),
        diagnostics
      }
    }

    const details = await this.eventStore.getSummaryDetails(senderResolution.sessionId, fromMs, toMs)
    diagnostics.lastScoreAtMs = details.lastScoreAtMs
    diagnostics.rawScoreEvents = details.rawScoreEvents

    try {
      const recoveryPreview = await buildRecoveryPreview(
        {
          leadStore: this.leadStore,
          inboundStore: this.inboundStore,
          eventStore: this.eventStore
        },
        {
          senderSessionId: senderResolution.sessionId,
          fromMs,
          toMs
        }
      )
      diagnostics.scoreCandidatesDetected = recoveryPreview.scoreCandidatesDetected
      diagnostics.missingScoreEvents = recoveryPreview.missingScoreEvents
      diagnostics.missingCommentEvents = recoveryPreview.missingCommentEvents
    } catch (error) {
      this.logger.warn?.('Post-interaction recovery preview failed', {
        senderSessionId: senderResolution.sessionId,
        error: (error as Error).message
      })
    }

    if (details.summary.qualified > 0 && details.summary.feedbacksReceived === 0) {
      this.metrics?.increment('post_interaction_feedback.summary_empty_with_qualified')
      this.logger.warn?.('Post-interaction summary has qualified without captured score', {
        senderSessionId: senderResolution.sessionId,
        qualified: details.summary.qualified,
        feedbacksReceived: details.summary.feedbacksReceived
      })
    }
    if (diagnostics.missingScoreEvents > 0) {
      this.metrics?.increment('post_interaction_feedback.summary_missing_score_events', diagnostics.missingScoreEvents)
    }

    return {
      summary: details.summary,
      diagnostics
    }
  }

  async getFeedbackDetails(filters: PostInteractionFeedbackDetailsFilters): Promise<PostInteractionFeedbackDetailsReport> {
    const senderResolution = await this.resolveSenderSessionContext()
    if (senderResolution.lookupStatus !== 'ok' || !senderResolution.sessionId) {
      throw new Error(senderResolution.failureReason ?? senderResolution.lookupStatus)
    }

    return this.eventStore.getFeedbackDetails(senderResolution.sessionId, filters)
  }

  async resolveSenderSessionId(): Promise<string | null> {
    const result = await this.resolveSenderSessionContext()
    return result.sessionId
  }

  private async resolveSenderSessionContext(): Promise<PostInteractionFeedbackSenderResolution> {
    const config = this.settings.getPostInteractionProspecting()
    const senderEmail = normalizeOptionalText(config.senderEmail)
    if (!config.enabled) {
      return {
        enabled: false,
        senderEmail,
        sessionId: null,
        lookupStatus: 'disabled',
        failureReason: null
      }
    }

    if (!senderEmail) {
      return {
        enabled: true,
        senderEmail: null,
        sessionId: null,
        lookupStatus: 'sender_email_missing',
        failureReason: 'sender_email_missing'
      }
    }

    const now = this.now()
    const cached = senderSessionCache.get(senderEmail)
    if (cached && cached.expiresAt > now) {
      return {
        enabled: true,
        senderEmail,
        sessionId: cached.sessionId,
        lookupStatus: 'ok',
        failureReason: null
      }
    }

    try {
      const sessionId = this.identityResolver
        ? await this.identityResolver.resolveSessionIdByEmail(senderEmail)
        : await resolveSessionIdByEmailFromIdentity(senderEmail)
      senderSessionCache.set(senderEmail, {
        sessionId,
        expiresAt: now + SESSION_ID_CACHE_TTL_MS
      })
      return {
        enabled: true,
        senderEmail,
        sessionId,
        lookupStatus: 'ok',
        failureReason: null
      }
    } catch (error) {
      const failureReason = normalizeOptionalText((error as Error).message) ?? 'sender_lookup_failed'
      this.metrics?.increment('post_interaction_feedback.sender_lookup_failed')
      this.logger.warn?.('Post-interaction sender session lookup failed', {
        senderEmail,
        error: failureReason
      })
      return {
        enabled: true,
        senderEmail,
        sessionId: null,
        lookupStatus: 'sender_lookup_failed',
        failureReason
      }
    }
  }

  async backfillRecentQualifiedInteractions(options: { sinceMs?: number; limit?: number } = {}): Promise<void> {
    const senderSessionId = await this.resolveSenderSessionId()
    if (!senderSessionId) {
      return
    }

    const sinceMs = normalizeTimestampMs(options.sinceMs) ?? this.now() - QUALIFICATION_WINDOW_MS
    const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 5_000), 10_000))
    const records = await this.outboundStore.listSentAiMessagesSince(sinceMs, limit)

    for (const record of records) {
      if (record.sessionId === senderSessionId) {
        continue
      }
      try {
        await this.handleAiReplySent({
          sessionId: record.sessionId,
          chatId: record.chatId,
          inboundId: 0,
          outboundId: record.id
        })
      } catch (error) {
        this.logger.warn?.('Post-interaction backfill item failed', {
          sessionId: record.sessionId,
          chatId: record.chatId,
          outboundId: record.id,
          error: (error as Error).message
        })
      }
    }
  }

  async enrollQualifiedInteraction(
    input: PostInteractionFeedbackQualifiedInteraction,
    options: EnrollQualifiedInteractionOptions = {}
  ): Promise<PostInteractionFeedbackEnrollmentResult> {
    const sourceSessionId = input.sourceSessionId.trim()
    const sourceChatId = input.sourceChatId.trim()
    const sourceSystem = normalizeSourceSystem(input.sourceSystem)
    const phone = normalizeWhatsappDigits(input.whatsapp)
    const qualificationKey = normalizeOptionalText(input.qualificationKey)
    const senderSessionId = options.senderSessionId === undefined
      ? await this.resolveSenderSessionId()
      : options.senderSessionId

    if (!senderSessionId || !sourceSessionId || !sourceChatId || !sourceSystem || !phone || !qualificationKey) {
      return {
        status: 'active_campaign_skipped',
        senderSessionId
      }
    }

    const sourceCompanyName =
      normalizeOptionalText(input.sourceCompanyName) ??
      (sourceSystem === 'autowhats' ? await this.resolveSourceCompanyName(sourceSessionId) : 'Dancing Patinação')
    const contactName = normalizeOptionalText(input.contactName)
    const qualifiedAtMs = normalizeTimestampMs(input.qualifiedAtMs) ?? this.now()
    const userMessageCount = Math.max(0, Math.floor(input.userMessageCount))
    const aiReplyCount = Math.max(0, Math.floor(input.aiReplyCount))
    const senderChatId = toUserJid(phone)
    const initialText = buildInitialMessage(sourceCompanyName)
    const initialMessageIdempotencyKey = buildInitialMessageIdempotencyKey(sourceSystem, phone, qualificationKey)
    const eventContext = {
      senderSessionId,
      chatId: senderChatId,
      phone,
      sourceSessionId,
      sourceCompanyName,
      sourceSystem,
      qualificationKey
    } satisfies Omit<PostInteractionFeedbackEventInput, 'eventName' | 'occurredAtMs' | 'score' | 'payload'>

    const existing = await this.leadStore.findByChatOrWhatsapp(senderSessionId, senderChatId, phone)
    const existingMeta =
      existing?.campaign?.type === 'post_interaction_feedback' ? existing.campaign.meta ?? null : null
    if (existing && existingMeta && isPendingStage(existingMeta.stage)) {
      if (existingMeta.qualificationKey === qualificationKey) {
        const duplicatePhone = resolveWhatsappFromCandidates(existingMeta.whatsapp, existing.whatsapp, phone)
        if (duplicatePhone && !existingMeta.initialSentAtMs) {
          try {
            await this.ensureInitialPromptQueued({
              leadId: existing.id,
              sessionId: senderSessionId,
              chatId: existing.chatId ?? senderChatId,
              phone: duplicatePhone,
              meta: existingMeta,
              text: initialText,
              idempotencyKey: initialMessageIdempotencyKey
            })
          } catch (error) {
            await this.recordInitialMessageFailure({
              leadId: existing.id,
              sessionId: senderSessionId,
              chatId: existing.chatId ?? senderChatId,
              phone: duplicatePhone,
              meta: existingMeta,
              error
            })
          }
        }
        return {
          status: 'duplicate',
          senderSessionId,
          leadId: existing.id
        }
      }

      await this.recordEvent({
        ...eventContext,
        eventName: 'active_campaign_skipped',
        occurredAtMs: this.now(),
        payload: {
          leadId: existing.id,
          existingQualificationKey: existingMeta.qualificationKey
        }
      })
      return {
        status: 'active_campaign_skipped',
        senderSessionId,
        leadId: existing.id
      }
    }

    const latestEventAt = await this.eventStore.getLatestEventAt(senderSessionId, phone)
    const now = this.now()
    if (latestEventAt && now - latestEventAt < COOLDOWN_MS) {
      await this.recordEvent({
        ...eventContext,
        eventName: 'cooldown_skipped',
        occurredAtMs: now,
        payload: { latestEventAt, cooldownMs: COOLDOWN_MS }
      })
      return {
        status: 'cooldown_skipped',
        senderSessionId,
        ...(existing ? { leadId: existing.id } : {})
      }
    }

    const meta: PostInteractionFeedbackCampaignMeta = {
      sourceSessionId,
      sourceChatId,
      sourceCompanyName,
      sourceSystem,
      qualificationKey,
      whatsapp: phone,
      qualifiedAtMs,
      userMessageCount,
      aiReplyCount,
      stage: 'awaiting_score',
      score: null,
      comment: null,
      scorePromptAttempts: 1,
      commentPromptAttempts: 0,
      lastPromptAtMs: null,
      initialSentAtMs: null,
      completedAtMs: null
    }
    const leadId = existing?.id ?? senderChatId
    const enrolled = await this.leadStore.upsertFromClient({
      sessionId: senderSessionId,
      leadId,
      name: existing?.name ?? contactName,
      whatsapp: phone,
      chatId: senderChatId,
      aiTag: 'P. Ativa',
      status: 'em_processo',
      lastContactAtMs: existing?.lastContact ?? now,
      nextContactAtMs: now + INITIAL_SEND_RETRY_DELAY_MS,
      observations: buildObservation(sourceCompanyName, meta),
      createdAtMs: existing?.createdAt ?? qualifiedAtMs,
      lastMessage: existing?.lastMessage ?? null,
      source: 'autowhats_feedback',
      campaignType: 'post_interaction_feedback',
      campaignTargetSessionId: buildCampaignTargetSessionId(sourceSystem, sourceSessionId),
      campaignAttempt: 0,
      campaignMeta: meta
    })

    await this.leadStore.update(senderSessionId, enrolled.id, {
      name: existing?.name ?? contactName,
      whatsapp: phone,
      aiTag: 'P. Ativa',
      status: 'em_processo',
      nextContact: now + INITIAL_SEND_RETRY_DELAY_MS,
      observations: buildObservation(sourceCompanyName, meta),
      campaignType: 'post_interaction_feedback',
      campaignTargetSessionId: buildCampaignTargetSessionId(sourceSystem, sourceSessionId),
      campaignAttempt: 0,
      campaignMeta: meta
    })

    await this.ensureCampaignAiBlocked(senderSessionId, [senderChatId])

    await this.recordEvent({
      ...eventContext,
      eventName: 'qualified',
      occurredAtMs: now,
      payload: {
        userMessageCount,
        aiReplyCount,
        triggerOutboundId: input.triggerOutboundId ?? null
      }
    })
    this.metrics?.increment('post_interaction_feedback.qualified')

    try {
      await this.ensureInitialPromptQueued({
        leadId: enrolled.id,
        sessionId: senderSessionId,
        chatId: senderChatId,
        phone,
        meta,
        text: initialText,
        idempotencyKey: initialMessageIdempotencyKey
      })
    } catch (error) {
      await this.recordInitialMessageFailure({
        leadId: enrolled.id,
        sessionId: senderSessionId,
        chatId: senderChatId,
        phone,
        meta,
        error
      })
    }

    return {
      status: 'enrolled',
      senderSessionId,
      leadId: enrolled.id
    }
  }

  async handleAiReplySent(input: PostInteractionFeedbackAiReplySent): Promise<void> {
    const sourceSessionId = input.sessionId.trim()
    const sourceChatId = input.chatId.trim()
    if (!sourceSessionId || !sourceChatId || isGroupChat(sourceChatId) || isBroadcastChat(sourceChatId)) {
      return
    }

    const settings = this.settings.getPostInteractionProspecting()
    if (!settings.enabled) {
      return
    }

    const senderSessionId = await this.resolveSenderSessionId()
    if (!senderSessionId || senderSessionId === sourceSessionId) {
      return
    }

    const now = this.now()
    const sinceMs = now - QUALIFICATION_WINDOW_MS
    const [userMessageCount, aiReplyCount] = await Promise.all([
      this.inboundStore.countUserMessagesSince(sourceSessionId, sourceChatId, sinceMs),
      this.outboundStore.countSentAiMessagesSince(sourceSessionId, sourceChatId, sinceMs)
    ])

    if (userMessageCount < 2 || aiReplyCount < 2) {
      return
    }

    const sourceLead = await this.leadStore.get(sourceSessionId, sourceChatId)
    const phone = resolveWhatsappFromCandidates(sourceLead?.whatsapp, sourceChatId)
    if (!phone) {
      return
    }
    await this.enrollQualifiedInteraction(
      {
        sourceSystem: 'autowhats',
        sourceSessionId,
        sourceChatId,
        whatsapp: phone,
        contactName: sourceLead?.name ?? null,
        sourceCompanyName: await this.resolveSourceCompanyName(sourceSessionId),
        qualifiedAtMs: now,
        userMessageCount,
        aiReplyCount,
        qualificationKey: buildQualificationKey('autowhats', sourceSessionId, sourceChatId, input.outboundId),
        triggerOutboundId: input.outboundId
      },
      {
        senderSessionId
      }
    )
  }

  async handleInboundMessage(normalized: NormalizedInboundMessage): Promise<PostInteractionFeedbackInboundResult> {
    const sessionId = normalized.sessionId.trim()
    const chatId = normalized.chatId.trim()
    if (!sessionId || !chatId || normalized.fromMe || isGroupChat(chatId) || isBroadcastChat(chatId)) {
      return { handled: false }
    }

    const senderSessionId = await this.resolveSenderSessionId()
    if (!senderSessionId || senderSessionId !== sessionId) {
      return { handled: false }
    }

    const matched = await this.findCampaignLeadForInbound(sessionId, normalized)
    if (!matched) {
      return { handled: false }
    }

    const { lead, phone } = matched
    let meta = matched.meta

    if (meta.stage === 'opted_out') {
      return { handled: true }
    }

    if (!isPendingStage(meta.stage)) {
      await this.prepareAiHandoff({
        leadId: lead.id,
        sessionId,
        chatId,
        previousChatId: lead.chatId,
        phone,
        meta
      })
      return { handled: false }
    }

    meta = await this.syncCampaignLeadIdentity({
      lead,
      sessionId,
      chatId,
      phone,
      meta,
      keepAiBlocked: true
    })

    if (!isPendingStage(meta.stage)) {
      return { handled: false }
    }

    const text = normalized.text?.trim() ?? ''
    const config = await this.resolveAiConfig(sessionId)
    const optDecision = evaluateOptOut(text, config.optOutKeywords, config.optInKeywords)
    if (optDecision.action === 'opt_in') {
      await this.aiOptOutStore.clearOptOut(sessionId, chatId)
    } else if (optDecision.action === 'opt_out') {
      await this.aiOptOutStore.setOptOut(sessionId, chatId)
      await this.completeCampaign(lead.id, sessionId, chatId, phone, meta)
      return { handled: true }
    }

    if (meta.stage === 'awaiting_score') {
      await this.handleAwaitingScore(lead.id, sessionId, chatId, phone, meta, text)
      return { handled: true }
    }

    await this.handleAwaitingComment(lead.id, sessionId, chatId, phone, meta, text)
    return { handled: true }
  }

  async claimDueLeads(options: { batchSize: number; leaseMs: number }): Promise<PostInteractionFeedbackDueLead[]> {
    const senderSessionId = await this.resolveSenderSessionId()
    if (!senderSessionId) {
      return []
    }

    const claims = await this.leadStore.claimDueByCampaignType(senderSessionId, 'post_interaction_feedback', {
      dueBeforeMs: this.now(),
      limit: options.batchSize,
      leaseMs: options.leaseMs
    })

    const recovered: PostInteractionFeedbackDueLead[] = []
    for (const claim of claims) {
      if (claim.campaignType !== 'post_interaction_feedback') {
        continue
      }

      let meta = claim.campaignMeta
      if (!meta) {
        const lead = await this.leadStore.get(senderSessionId, claim.leadId)
        const phone = resolveWhatsappFromCandidates(lead?.whatsapp, claim.chatId)
        meta =
          phone
            ? await this.recoverCampaignMeta({
                sessionId: senderSessionId,
                phone,
                qualifiedBeforeMs: claim.nextContactAt
              })
            : null

        if (!lead || !meta || !phone) {
          await this.leadStore.releaseAutoFollowUpClaim(claim.sessionId, claim.leadId, {
            nextContactAt: claim.nextContactAt
          })
          continue
        }

        await this.syncCampaignLeadIdentity({
          lead,
          sessionId: senderSessionId,
          chatId: claim.chatId,
          phone,
          meta,
          keepAiBlocked: false
        })
      }

      recovered.push({
        ...claim,
        campaignType: 'post_interaction_feedback',
        campaignMeta: meta
      })
    }

    return recovered
  }

  async releaseDueLead(claim: Pick<PostInteractionFeedbackDueLead, 'sessionId' | 'leadId'>, nextContactAt: number | null) {
    await this.leadStore.releaseAutoFollowUpClaim(claim.sessionId, claim.leadId, { nextContactAt })
  }

  async processDueLead(claim: PostInteractionFeedbackDueLead): Promise<void> {
    const phone = resolveWhatsappFromCandidates(claim.campaignMeta.whatsapp, claim.chatId)
    if (!phone) {
      await this.leadStore.releaseAutoFollowUpClaim(claim.sessionId, claim.leadId, { nextContactAt: null })
      return
    }

    if (claim.campaignMeta.stage === 'awaiting_score') {
      if (!claim.campaignMeta.initialSentAtMs) {
        try {
          await this.ensureInitialPromptQueued({
            leadId: claim.leadId,
            sessionId: claim.sessionId,
            chatId: claim.chatId,
            phone,
            meta: claim.campaignMeta,
            text: buildInitialMessage(claim.campaignMeta.sourceCompanyName),
            idempotencyKey: buildInitialMessageIdempotencyKey(
              claim.campaignMeta.sourceSystem,
              phone,
              claim.campaignMeta.qualificationKey
            )
          })
        } catch (error) {
          await this.recordInitialMessageFailure({
            leadId: claim.leadId,
            sessionId: claim.sessionId,
            chatId: claim.chatId,
            phone,
            meta: claim.campaignMeta,
            error
          })
          throw error
        }
        return
      }
      await this.processAwaitingScoreReminder(claim, phone)
      return
    }

    if (claim.campaignMeta.stage === 'awaiting_comment') {
      await this.processAwaitingCommentReminder(claim, phone)
      return
    }

    await this.leadStore.releaseAutoFollowUpClaim(claim.sessionId, claim.leadId, { nextContactAt: null })
  }

  private async handleAwaitingScore(
    leadId: string,
    sessionId: string,
    chatId: string,
    phone: string,
    meta: PostInteractionFeedbackCampaignMeta,
    text: string
  ) {
    const parsed = parseSharedScoreAndComment(text)
    if (parsed.score === null) {
      this.metrics?.increment('post_interaction_feedback.score_parse_failed')
      this.logger.info?.('Post-interaction score parse failed', {
        sessionId,
        chatId,
        textPreview: truncateTextForLog(text)
      })
      await this.sendText(sessionId, chatId, 'Se puder, me responda só com uma nota de 1 a 10 para eu registrar certinho.')
      return
    }

    const now = this.now()
    await this.recordEvent({
      ...this.buildEventContext(sessionId, chatId, phone, meta),
      eventName: 'score_received',
      score: parsed.score,
      occurredAtMs: now
    })

    const updatedMeta: PostInteractionFeedbackCampaignMeta = {
      ...meta,
      score: parsed.score,
      comment: parsed.comment ?? null
    }

    if (parsed.comment) {
      await this.recordEvent({
        ...this.buildEventContext(sessionId, chatId, phone, meta),
        eventName: 'comment_received',
        score: parsed.score,
        occurredAtMs: now
      })
    }

    if (parsed.score >= 7) {
      await this.sendOfferAndComplete(leadId, sessionId, chatId, phone, updatedMeta)
      return
    }
    if (parsed.comment && parsed.score < 7) {
      await this.sendNegativeClosureAndComplete(leadId, sessionId, chatId, phone, updatedMeta)
      return
    }

    const awaitingCommentMeta: PostInteractionFeedbackCampaignMeta = {
      ...updatedMeta,
      stage: 'awaiting_comment',
      commentPromptAttempts: 1,
      lastPromptAtMs: now
    }

    await this.sendText(sessionId, chatId, 'Perfeito, obrigado. O que eu posso melhorar nessa experiência para as próximas conversas?')
    await this.leadStore.update(sessionId, leadId, {
      status: 'em_processo',
      nextContact: now + FIRST_REMINDER_DELAY_MS,
      observations: buildObservation(meta.sourceCompanyName, awaitingCommentMeta),
      campaignMeta: awaitingCommentMeta
    })
    await this.recordEvent({
      ...this.buildEventContext(sessionId, chatId, phone, awaitingCommentMeta),
      eventName: 'comment_request_sent',
      score: parsed.score,
      occurredAtMs: now
    })
  }

  private async handleAwaitingComment(
    leadId: string,
    sessionId: string,
    chatId: string,
    phone: string,
    meta: PostInteractionFeedbackCampaignMeta,
    text: string
  ) {
    const comment = normalizeComment(text)
    if (!comment || isSharedScoreOnlyText(text)) {
      await this.sendText(sessionId, chatId, 'Se puder, me manda em uma frase o que eu posso melhorar nessa experiência.')
      return
    }

    const now = this.now()
    const updatedMeta: PostInteractionFeedbackCampaignMeta = {
      ...meta,
      comment,
      completedAtMs: now
    }
    await this.recordEvent({
      ...this.buildEventContext(sessionId, chatId, phone, updatedMeta),
      eventName: 'comment_received',
      score: meta.score,
      occurredAtMs: now
    })

    if ((meta.score ?? 0) >= 7) {
      await this.sendOfferAndComplete(leadId, sessionId, chatId, phone, updatedMeta)
      return
    }
    await this.sendNegativeClosureAndComplete(leadId, sessionId, chatId, phone, updatedMeta)
  }

  private async processAwaitingScoreReminder(claim: PostInteractionFeedbackDueLead, phone: string) {
    const meta = claim.campaignMeta
    const now = this.now()
    if (meta.scorePromptAttempts <= 1) {
      await this.sendText(
        claim.sessionId,
        claim.chatId,
        'Passando só para reforçar: de 1 a 10, qual nota você daria para essa experiência?'
      )
      const updatedMeta: PostInteractionFeedbackCampaignMeta = {
        ...meta,
        scorePromptAttempts: 2,
        lastPromptAtMs: now
      }
      await this.leadStore.update(claim.sessionId, claim.leadId, {
        nextContact: now + SECOND_REMINDER_DELAY_MS,
        observations: buildObservation(meta.sourceCompanyName, updatedMeta),
        campaignMeta: updatedMeta
      })
      await this.recordEvent({
        ...this.buildEventContext(claim.sessionId, claim.chatId, phone, updatedMeta),
        eventName: 'score_reminder_sent',
        occurredAtMs: now,
        payload: { reminder: '1h' }
      })
      return
    }

    if (meta.scorePromptAttempts === 2) {
      await this.sendText(
        claim.sessionId,
        claim.chatId,
        'Último lembrete por aqui: quando puder, me manda só uma nota de 1 a 10 para essa experiência.'
      )
      const updatedMeta: PostInteractionFeedbackCampaignMeta = {
        ...meta,
        scorePromptAttempts: 3,
        lastPromptAtMs: now
      }
      await this.leadStore.update(claim.sessionId, claim.leadId, {
        nextContact: now + FINAL_GRACE_DELAY_MS,
        observations: buildObservation(meta.sourceCompanyName, updatedMeta),
        campaignMeta: updatedMeta
      })
      await this.recordEvent({
        ...this.buildEventContext(claim.sessionId, claim.chatId, phone, updatedMeta),
        eventName: 'score_reminder_sent',
        occurredAtMs: now,
        payload: { reminder: '1d' }
      })
      return
    }

    await this.leadStore.update(claim.sessionId, claim.leadId, {
      status: 'inativo',
      nextContact: null,
      observations: buildObservation(meta.sourceCompanyName, meta),
      campaignMeta: meta
    })
    await this.recordEvent({
      ...this.buildEventContext(claim.sessionId, claim.chatId, phone, meta),
      eventName: 'closed_no_score',
      occurredAtMs: now
    })
  }

  private async processAwaitingCommentReminder(claim: PostInteractionFeedbackDueLead, phone: string) {
    const meta = claim.campaignMeta
    const now = this.now()
    if (meta.commentPromptAttempts <= 1) {
      await this.sendText(
        claim.sessionId,
        claim.chatId,
        'Obrigado pela nota. Se puder, me manda em uma frase o que eu posso melhorar nessa experiência.'
      )
      const updatedMeta: PostInteractionFeedbackCampaignMeta = {
        ...meta,
        commentPromptAttempts: 2,
        lastPromptAtMs: now
      }
      await this.leadStore.update(claim.sessionId, claim.leadId, {
        nextContact: now + SECOND_REMINDER_DELAY_MS,
        observations: buildObservation(meta.sourceCompanyName, updatedMeta),
        campaignMeta: updatedMeta
      })
      await this.recordEvent({
        ...this.buildEventContext(claim.sessionId, claim.chatId, phone, updatedMeta),
        eventName: 'comment_reminder_sent',
        score: meta.score,
        occurredAtMs: now,
        payload: { reminder: '1h' }
      })
      return
    }

    if (meta.commentPromptAttempts === 2) {
      await this.sendText(
        claim.sessionId,
        claim.chatId,
        'Último lembrete por aqui: se puder, me manda só uma frase dizendo o que eu posso melhorar nessa experiência.'
      )
      const updatedMeta: PostInteractionFeedbackCampaignMeta = {
        ...meta,
        commentPromptAttempts: 3,
        lastPromptAtMs: now
      }
      await this.leadStore.update(claim.sessionId, claim.leadId, {
        nextContact: now + FINAL_GRACE_DELAY_MS,
        observations: buildObservation(meta.sourceCompanyName, updatedMeta),
        campaignMeta: updatedMeta
      })
      await this.recordEvent({
        ...this.buildEventContext(claim.sessionId, claim.chatId, phone, updatedMeta),
        eventName: 'comment_reminder_sent',
        score: meta.score,
        occurredAtMs: now,
        payload: { reminder: '1d' }
      })
      return
    }

    if ((meta.score ?? 0) >= 7) {
      await this.sendOfferAndComplete(claim.leadId, claim.sessionId, claim.chatId, phone, meta)
      return
    }

    const completedMeta: PostInteractionFeedbackCampaignMeta = {
      ...meta,
      stage: 'completed_negative',
      completedAtMs: now
    }
    await this.leadStore.update(claim.sessionId, claim.leadId, {
      status: 'inativo',
      nextContact: null,
      observations: buildObservation(meta.sourceCompanyName, completedMeta),
      campaignMeta: completedMeta
    })
    await this.recordEvent({
      ...this.buildEventContext(claim.sessionId, claim.chatId, phone, completedMeta),
      eventName: 'closed_negative',
      score: meta.score,
      occurredAtMs: now,
      payload: { silent: true }
    })
  }

  private async sendOfferAndComplete(
    leadId: string,
    sessionId: string,
    chatId: string,
    phone: string,
    meta: PostInteractionFeedbackCampaignMeta
  ) {
    const now = this.now()
    const completedMeta: PostInteractionFeedbackCampaignMeta = {
      ...meta,
      stage: 'completed_positive',
      completedAtMs: now
    }
    const message = buildOfferMessage(meta.sourceCompanyName, this.resolveCtaUrl(this.settings.getPostInteractionProspecting()))

    await this.sendText(sessionId, chatId, message)
    await this.leadStore.update(sessionId, leadId, {
      chatId,
      whatsapp: phone,
      status: 'aguardando',
      nextContact: null,
      observations: buildObservation(meta.sourceCompanyName, completedMeta),
      campaignMeta: completedMeta
    })
    await this.prepareAiHandoff({
      leadId,
      sessionId,
      chatId,
      previousChatId: chatId,
      phone,
      meta: completedMeta
    })
    await this.recordEvent({
      ...this.buildEventContext(sessionId, chatId, phone, completedMeta),
      eventName: 'offer_sent',
      score: meta.score,
      occurredAtMs: now
    })
  }

  private async sendNegativeClosureAndComplete(
    leadId: string,
    sessionId: string,
    chatId: string,
    phone: string,
    meta: PostInteractionFeedbackCampaignMeta
  ) {
    const now = this.now()
    const completedMeta: PostInteractionFeedbackCampaignMeta = {
      ...meta,
      stage: 'completed_negative',
      completedAtMs: now
    }

    await this.sendText(
      sessionId,
      chatId,
      `Obrigado pelo feedback. Vou repassar isso para a empresa ${meta.sourceCompanyName}.`
    )
    await this.leadStore.update(sessionId, leadId, {
      chatId,
      whatsapp: phone,
      status: 'inativo',
      nextContact: null,
      observations: buildObservation(meta.sourceCompanyName, completedMeta),
      campaignMeta: completedMeta
    })
    await this.prepareAiHandoff({
      leadId,
      sessionId,
      chatId,
      previousChatId: chatId,
      phone,
      meta: completedMeta
    })
    await this.recordEvent({
      ...this.buildEventContext(sessionId, chatId, phone, completedMeta),
      eventName: 'closed_negative',
      score: meta.score,
      occurredAtMs: now
    })
  }

  private async completeCampaign(
    leadId: string,
    sessionId: string,
    chatId: string,
    phone: string,
    meta: PostInteractionFeedbackCampaignMeta
  ) {
    const now = this.now()
    const completedMeta: PostInteractionFeedbackCampaignMeta = {
      ...meta,
      stage: 'opted_out',
      completedAtMs: now
    }

    await this.leadStore.update(sessionId, leadId, {
      status: 'inativo',
      nextContact: null,
      observations: buildObservation(meta.sourceCompanyName, completedMeta),
      campaignMeta: completedMeta
    })
    await this.recordEvent({
      ...this.buildEventContext(sessionId, chatId, phone, completedMeta),
      eventName: 'opted_out',
      score: meta.score,
      occurredAtMs: now
    })
  }

  private async ensureInitialPromptQueued(input: {
    leadId: string
    sessionId: string
    chatId: string
    phone: string
    meta: PostInteractionFeedbackCampaignMeta
    text: string
    idempotencyKey: string
  }) {
    const now = this.now()
    await this.sendText(input.sessionId, input.chatId, input.text, input.idempotencyKey)
    const updatedMeta: PostInteractionFeedbackCampaignMeta = {
      ...input.meta,
      initialSentAtMs: input.meta.initialSentAtMs ?? now,
      lastPromptAtMs: now
    }
    await this.leadStore.update(input.sessionId, input.leadId, {
      status: 'em_processo',
      nextContact: now + FIRST_REMINDER_DELAY_MS,
      observations: buildObservation(input.meta.sourceCompanyName, updatedMeta),
      campaignMeta: updatedMeta
    })
    await this.recordEvent({
      ...this.buildEventContext(input.sessionId, input.chatId, input.phone, updatedMeta),
      eventName: 'initial_message_sent',
      occurredAtMs: now
    })
  }

  private async recordInitialMessageFailure(input: {
    leadId: string
    sessionId: string
    chatId: string
    phone: string
    meta: PostInteractionFeedbackCampaignMeta
    error: unknown
  }) {
    const now = this.now()
    const message = normalizeOptionalText((input.error as Error | null | undefined)?.message) ?? 'initial_message_failed'
    await this.leadStore.update(input.sessionId, input.leadId, {
      status: 'em_processo',
      nextContact: now + INITIAL_SEND_RETRY_DELAY_MS,
      observations: buildObservation(input.meta.sourceCompanyName, input.meta),
      campaignMeta: input.meta
    })
    await this.recordEvent({
      ...this.buildEventContext(input.sessionId, input.chatId, input.phone, input.meta),
      eventName: 'initial_message_failed',
      occurredAtMs: now,
      payload: { error: truncateObservationField(message, 200) ?? 'initial_message_failed' }
    })
  }

  private async sendText(sessionId: string, chatId: string, text: string, idempotencyKey?: string) {
    await this.ensureSenderSessionConnected(sessionId)
    await this.outboundService.enqueue({
      sessionId,
      chatId,
      text,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      origin: 'automation_api'
    })
  }

  private async ensureSenderSessionConnected(sessionId: string) {
    if (!this.statusStore) {
      return
    }

    const snapshot = await this.statusStore.getStatus(sessionId)
    if (!snapshot || snapshot.status !== 'connected') {
      this.logger.warn?.('Post-interaction sender session unavailable', {
        sessionId,
        status: snapshot?.status ?? 'missing',
        reason: snapshot?.reason ?? null
      })
      throw new Error(`sender_session_${snapshot?.status ?? 'missing'}`)
    }
  }

  private async resolveSourceCompanyName(sessionId: string): Promise<string> {
    const config = await this.resolveAiConfig(sessionId)
    const companyFromTraining = normalizeOptionalText(config.training?.nomeEmpresa)
    if (companyFromTraining) {
      return companyFromTraining
    }

    const profile =
      this.profileResolver
        ? await this.profileResolver.getUserProfile(sessionId)
        : await loadUserProfileFromIdentity(sessionId)
    const companyFromProfile = normalizeOptionalText(profile?.companyName)
    if (companyFromProfile) {
      return companyFromProfile
    }

    const nameFromProfile = normalizeOptionalText(profile?.name)
    if (nameFromProfile) {
      return nameFromProfile
    }

    return 'essa empresa'
  }

  private async resolveAiConfig(sessionId: string): Promise<AiConfig> {
    if (!this.aiConfigResolver) {
      return this.defaultAiConfig
    }

    try {
      const config = await this.aiConfigResolver.get(sessionId)
      return mergeAiConfig(this.defaultAiConfig, config)
    } catch (error) {
      this.logger.warn?.('Post-interaction AI config lookup failed', {
        sessionId,
        error: (error as Error).message
      })
      return this.defaultAiConfig
    }
  }

  private async recoverCampaignMeta(input: {
    sessionId: string
    phone: string
    qualifiedBeforeMs?: number | null
  }): Promise<PostInteractionFeedbackCampaignMeta | null> {
    const qualifiedEvent = await this.eventStore.getLatestQualifiedEventContextByPhone(
      input.sessionId,
      input.phone,
      {
        beforeMs: input.qualifiedBeforeMs ?? undefined
      }
    )
    if (!qualifiedEvent) {
      return null
    }

    const snapshot = await this.eventStore.getQualificationSnapshot(input.sessionId, qualifiedEvent.qualificationKey)
    return buildRecoveredCampaignMeta(qualifiedEvent, input.phone, snapshot)
  }

  private async findCampaignLeadForInbound(
    sessionId: string,
    normalized: NormalizedInboundMessage
  ): Promise<{ lead: LeadRecord; meta: PostInteractionFeedbackCampaignMeta; phone: string } | null> {
    const candidateChatIds = uniqueTexts([normalized.chatId, normalized.chatIdAlt, normalized.senderId])
    const candidatePhones = uniqueTexts([
      resolveWhatsappFromCandidates(normalized.chatIdAlt, normalized.senderId, normalized.chatId),
      resolveWhatsappFromCandidates(normalized.senderId),
      resolveWhatsappFromCandidates(normalized.chatIdAlt),
      resolveWhatsappFromCandidates(normalized.chatId)
    ])
    const seen = new Set<string>()

    const findMatch = async (chatId: string | null, whatsapp: string | null) => {
      const key = `${chatId ?? '-'}|${whatsapp ?? '-'}`
      if (seen.has(key)) {
        return null
      }
      seen.add(key)

      const lead = await this.leadStore.findByChatOrWhatsapp(sessionId, chatId, whatsapp)
      if (!lead || lead.campaign?.type !== 'post_interaction_feedback') {
        return null
      }

      const phone = resolveWhatsappFromCandidates(
        lead?.whatsapp,
        normalized.chatIdAlt,
        normalized.senderId,
        normalized.chatId
      )
      if (!phone) {
        return null
      }

      const meta =
        lead.campaign.meta ??
        (await this.recoverCampaignMeta({
          sessionId,
          phone,
          qualifiedBeforeMs: normalized.timestampMs
        }))
      if (!meta) {
        return null
      }

      return { lead, meta, phone }
    }

    for (const candidateChatId of candidateChatIds) {
      for (const candidatePhone of [...candidatePhones, null]) {
        const match = await findMatch(candidateChatId, candidatePhone)
        if (match) {
          return match
        }
      }
    }

    for (const candidatePhone of candidatePhones) {
      const match = await findMatch(null, candidatePhone)
      if (match) {
        return match
      }
    }

    return null
  }

  private async syncCampaignLeadIdentity(input: {
    lead: LeadRecord
    sessionId: string
    chatId: string
    phone: string
    meta: PostInteractionFeedbackCampaignMeta
    keepAiBlocked: boolean
  }): Promise<PostInteractionFeedbackCampaignMeta> {
    const nextChatId = input.chatId.trim()
    let nextMeta = input.meta
    const update: LeadUpdate = {}
    const storedMeta =
      input.lead.campaign?.type === 'post_interaction_feedback' ? input.lead.campaign.meta ?? null : null

    if (nextChatId && input.lead.chatId !== nextChatId) {
      update.chatId = nextChatId
    }
    if (input.lead.whatsapp !== input.phone) {
      update.whatsapp = input.phone
    }
    if (input.meta.whatsapp !== input.phone) {
      nextMeta = {
        ...input.meta,
        whatsapp: input.phone
      }
      update.campaignMeta = nextMeta
      update.observations = buildObservation(input.meta.sourceCompanyName, nextMeta)
    }
    if (
      !storedMeta ||
      storedMeta.qualificationKey !== nextMeta.qualificationKey ||
      storedMeta.stage !== nextMeta.stage ||
      storedMeta.score !== nextMeta.score ||
      storedMeta.comment !== nextMeta.comment ||
      storedMeta.initialSentAtMs !== nextMeta.initialSentAtMs ||
      storedMeta.lastPromptAtMs !== nextMeta.lastPromptAtMs ||
      storedMeta.completedAtMs !== nextMeta.completedAtMs ||
      storedMeta.whatsapp !== nextMeta.whatsapp
    ) {
      update.campaignMeta = nextMeta
      update.observations = buildObservation(nextMeta.sourceCompanyName, nextMeta)
    }

    if (Object.keys(update).length > 0) {
      await this.leadStore.update(input.sessionId, input.lead.id, update)
    }

    if (input.keepAiBlocked) {
      await this.ensureCampaignAiBlocked(input.sessionId, [nextChatId, input.lead.chatId, toUserJid(input.phone)])
    }

    return nextMeta
  }

  private async prepareAiHandoff(input: {
    leadId: string
    sessionId: string
    chatId: string
    previousChatId: string | null
    phone: string
    meta: PostInteractionFeedbackCampaignMeta
  }): Promise<void> {
    const nextChatId = input.chatId.trim()
    let nextMeta = input.meta
    const update: LeadUpdate = {}

    if (nextChatId && input.previousChatId !== nextChatId) {
      update.chatId = nextChatId
    }
    if (input.meta.whatsapp !== input.phone) {
      nextMeta = {
        ...input.meta,
        whatsapp: input.phone
      }
      update.campaignMeta = nextMeta
      update.observations = buildObservation(input.meta.sourceCompanyName, nextMeta)
    }

    if (Object.keys(update).length > 0) {
      await this.leadStore.update(input.sessionId, input.leadId, update)
    }

    const handoffChatIds = [nextChatId, input.previousChatId, toUserJid(input.phone)]
    await this.restoreAiAfterCampaign(input.sessionId, handoffChatIds)
    await this.primeAiHandoffPresentation(input.sessionId, handoffChatIds)
  }

  private async ensureCampaignAiBlocked(sessionId: string, chatIds: Array<string | null | undefined>): Promise<void> {
    if (!this.chatAiConfigStore) {
      return
    }

    for (const chatId of uniqueTexts(chatIds)) {
      const current = await this.chatAiConfigStore.get(sessionId, chatId)
      if (current?.aiEnabled === false) {
        if (current.disabledReason === 'post_interaction_feedback') {
          continue
        }
        continue
      }

      await this.chatAiConfigStore.disable(sessionId, chatId, 'post_interaction_feedback')
    }
  }

  private async restoreAiAfterCampaign(sessionId: string, chatIds: Array<string | null | undefined>): Promise<void> {
    if (!this.chatAiConfigStore) {
      return
    }

    for (const chatId of uniqueTexts(chatIds)) {
      const current = await this.chatAiConfigStore.get(sessionId, chatId)
      if (current?.aiEnabled === false && current.disabledReason === 'post_interaction_feedback') {
        await this.chatAiConfigStore.setEnabled(sessionId, chatId, true)
      }
    }
  }

  private async primeAiHandoffPresentation(sessionId: string, chatIds: Array<string | null | undefined>): Promise<void> {
    if (!this.presentationStore) {
      return
    }

    for (const chatId of uniqueTexts(chatIds)) {
      const counter = await this.presentationStore.getCounter(sessionId, chatId)
      if (counter <= 0) {
        await this.presentationStore.increment(sessionId, chatId)
      }
    }
  }

  private buildEventContext(
    sessionId: string,
    chatId: string,
    phone: string,
    meta: PostInteractionFeedbackCampaignMeta
  ): Omit<PostInteractionFeedbackEventInput, 'eventName' | 'occurredAtMs' | 'score' | 'payload'> {
    return {
      senderSessionId: sessionId,
      chatId,
      phone,
      sourceSessionId: meta.sourceSessionId,
      sourceCompanyName: meta.sourceCompanyName,
      sourceSystem: meta.sourceSystem,
      qualificationKey: meta.qualificationKey
    }
  }

  private async recordEvent(input: PostInteractionFeedbackEventInput) {
    await this.eventStore.record(input)
  }

  private resolveCtaUrl(settings: PostInteractionProspectingSettings): string {
    const baseUrl = normalizeOptionalText(settings.ctaBaseUrl) ?? '/login?mode=signup'
    return appendUtm(baseUrl, CTA_UTM, this.appPublicUrl)
  }
}

function emptySummary(): PostInteractionFeedbackSummary {
  return {
    qualified: 0,
    approachesSent: 0,
    feedbacksReceived: 0,
    averageScore: 0,
    offersSent: 0,
    timeoutsNoScore: 0,
    optOuts: 0
  }
}

function emptyDiagnostics(senderResolution: PostInteractionFeedbackSenderResolution): PostInteractionFeedbackSummaryDiagnostics {
  return {
    enabled: senderResolution.enabled,
    senderEmail: senderResolution.senderEmail,
    senderSessionId: senderResolution.sessionId,
    lookupStatus: senderResolution.lookupStatus,
    failureReason: senderResolution.failureReason,
    lastScoreAtMs: null,
    rawScoreEvents: 0,
    scoreCandidatesDetected: 0,
    missingScoreEvents: 0,
    missingCommentEvents: 0
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeWhatsappDigits(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

function normalizeTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed)
    }
  }
  return null
}

function normalizeSourceSystem(value: unknown): PostInteractionFeedbackCampaignMeta['sourceSystem'] | null {
  if (value === 'autowhats' || value === 'dancing') {
    return value
  }
  return null
}

function isGroupChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@g.us')
}

function isBroadcastChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@broadcast')
}

function isPendingStage(stage: PostInteractionFeedbackCampaignMeta['stage'] | null | undefined) {
  return stage === 'awaiting_score' || stage === 'awaiting_comment'
}

function buildInitialMessage(companyName: string) {
  return [
    'Oi, tudo bem? Aqui é do AutoWhats.',
    `Vi que você conversou com a empresa ${companyName}.`,
    '',
    'Talvez você não tenha percebido, mas parte daquele atendimento foi feita por uma inteligência artificial.',
    'De 1 a 10, qual nota você daria para essa experiência?'
  ].join('\n')
}

function buildOfferMessage(companyName: string, ctaUrl: string) {
  return [
    `Que bom! Fico feliz que você gostou. Vou repassar o feedback para a empresa ${companyName}.`,
    '',
    `Se você quiser implementar uma automação de WhatsApp como essa no seu negócio, pode testar gratuitamente o AutoWhats aqui: ${ctaUrl}`,
    '',
    'E, se quiser, também pode me dizer algo que eu poderia melhorar nessa experiência.'
  ].join('\n')
}

function buildObservation(companyName: string, meta: PostInteractionFeedbackCampaignMeta) {
  const parts = [
    '[AutoWhats Feedback]',
    `empresa=${companyName}`,
    `origem_sistema=${meta.sourceSystem}`,
    `whatsapp=${meta.whatsapp ?? '-'}`,
    `qualification_key=${truncateObservationField(meta.qualificationKey, 80) ?? '-'}`,
    `stage=${meta.stage}`,
    `score=${meta.score ?? '-'}`,
    `comentário=${truncateObservationField(meta.comment) ?? '-'}`,
    `tentativas_nota=${meta.scorePromptAttempts}`,
    `tentativas_comentário=${meta.commentPromptAttempts}`
  ]
  return parts.join(' ')
}

function buildCampaignTargetSessionId(sourceSystem: PostInteractionFeedbackCampaignMeta['sourceSystem'], sourceSessionId: string) {
  return sourceSystem === 'dancing' ? `dancing:${sourceSessionId}` : sourceSessionId
}

function buildQualificationKey(
  sourceSystem: PostInteractionFeedbackCampaignMeta['sourceSystem'],
  sourceSessionId: string,
  sourceChatId: string,
  triggerOutboundId: number
) {
  return `${sourceSystem}:${sourceSessionId}:${sourceChatId}:${triggerOutboundId}`
}

function buildInitialMessageIdempotencyKey(
  sourceSystem: PostInteractionFeedbackCampaignMeta['sourceSystem'],
  phone: string,
  qualificationKey: string
) {
  return `post-feedback:init:${sourceSystem}:${phone}:${qualificationKey}`
}

function truncateObservationField(value: string | null, maxLength = 120) {
  if (!value) {
    return null
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

function uniqueTexts(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const items: string[] = []

  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }

    seen.add(trimmed)
    items.push(trimmed)
  }

  return items
}

function parseCapturedScoreAndComment(text: string): ParsedScoreAndComment {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return { score: null, comment: null }
  }

  const prepared = normalized.replace(/^[\s"'([{]+/, '').trim()
  const patterns = [
    /^(?:minha\s+)?nota(?:\s*(?:é|e|foi|seria))?(?:\s*[:=-]\s*|\s+)?(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i,
    /^(?:dou|dei|daria)\s+(?:nota\s+)?(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i,
    /^(?:foi|é|e)\s+(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i,
    /^(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i
  ]

  for (const pattern of patterns) {
    const match = prepared.match(pattern)
    if (!match) {
      continue
    }

    const score = Number(match[1])
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      continue
    }

    return {
      score,
      comment: normalizeComment(match[2] ?? '')
    }
  }

  return { score: null, comment: null }
}

function isCapturedScoreOnlyText(text: string) {
  const parsed = parseCapturedScoreAndComment(text)
  return parsed.score !== null && parsed.comment === null
}

function truncateTextForLog(value: string, maxLength = 120) {
  const normalized = normalizeOptionalText(value) ?? ''
  if (!normalized) {
    return ''
  }
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

function buildRecoveredCampaignMeta(
  qualifiedEvent: PostInteractionFeedbackQualifiedEventContext,
  phone: string,
  snapshot: Awaited<ReturnType<PostInteractionFeedbackEventStore['getQualificationSnapshot']>>
): PostInteractionFeedbackCampaignMeta {
  const parsedQualificationKey = parseFeedbackQualificationKey(qualifiedEvent.qualificationKey)
  return {
    sourceSessionId: qualifiedEvent.sourceSessionId,
    sourceChatId: parsedQualificationKey?.sourceChatId ?? toUserJid(phone),
    sourceCompanyName: qualifiedEvent.sourceCompanyName,
    sourceSystem: qualifiedEvent.sourceSystem,
    qualificationKey: qualifiedEvent.qualificationKey,
    whatsapp: phone,
    qualifiedAtMs: qualifiedEvent.qualifiedAtMs,
    userMessageCount: qualifiedEvent.userMessageCount,
    aiReplyCount: qualifiedEvent.aiReplyCount,
    stage: snapshot.stage,
    score: snapshot.score,
    comment: null,
    scorePromptAttempts: snapshot.scorePromptAttempts,
    commentPromptAttempts: snapshot.commentPromptAttempts,
    lastPromptAtMs: snapshot.lastPromptAtMs,
    initialSentAtMs: snapshot.initialSentAtMs,
    completedAtMs: snapshot.completedAtMs
  }
}

function parseFeedbackQualificationKey(
  qualificationKey: string
): { sourceChatId: string; triggerOutboundId: number | null } | null {
  const match = qualificationKey.match(/^(autowhats|dancing):([^:]+):(.+):(\d+)$/)
  if (!match) {
    return null
  }

  return {
    sourceChatId: match[3],
    triggerOutboundId: Number(match[4])
  }
}

function parseScoreAndComment(text: string): ParsedScoreAndComment {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return { score: null, comment: null }
  }

  const prepared = normalized.replace(/^[\s"'([{]+/, '').trim()
  const patterns = [
    /^(?:minha\s+)?nota(?:\s*(?:é|e))?\s*(10|[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,]\s*|\s+)?(.*)$/i,
    /^(?:dou|dei)\s+(?:nota\s+)?(10|[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,]\s*|\s+)?(.*)$/i,
    /^(10|[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,]\s*|\s+)?(.*)$/i
  ]

  for (const pattern of patterns) {
    const match = prepared.match(pattern)
    if (!match) {
      continue
    }

    const score = Number(match[1])
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      continue
    }

    const comment = normalizeComment(match[2] ?? '')
    return {
      score,
      comment
    }
  }

  return { score: null, comment: null }
}

function isScoreOnlyText(text: string) {
  const parsed = parseScoreAndComment(text)
  return parsed.score !== null && parsed.comment === null
}

function appendUtm(rawUrl: string, utm: Record<string, string>, appPublicUrl: string | null): string {
  const safeUrl = normalizeOptionalText(rawUrl) ?? '/login?mode=signup'

  try {
    const url =
      /^https?:\/\//i.test(safeUrl)
        ? new URL(safeUrl)
        : appPublicUrl
          ? new URL(safeUrl, appPublicUrl)
          : null

    if (url) {
      Object.entries(utm).forEach(([key, value]) => url.searchParams.set(key, value))
      return url.toString()
    }
  } catch {
    // Fallback below keeps the link usable even if URL parsing fails.
  }

  const separator = safeUrl.includes('?') ? '&' : '?'
  const query = new URLSearchParams(utm).toString()
  return `${safeUrl}${separator}${query}`
}
