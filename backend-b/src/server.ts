import crypto from 'crypto'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import rawBody from 'fastify-raw-body'
import type { AdminAuditStore, SessionHardDeleteService } from './admin'
import { FollowUpBlockedError, TrainingCopilotBlockedError } from './ai'
import type {
  AiConfigStore,
  AiFieldSuggestionStore,
  AiMessageService,
  AiPromptStore,
  AiSuggestionDecisionActorRole,
  AiSuggestionDecisionSource,
  ChatAiConfigStore,
  AiUsageStore,
  TrainingCopilotService
} from './ai'
import type { BillingService, CreditsPackageId, SubscriptionPlan } from './billing'
import type { CreditsService } from './credits'
import type { LeadConversionStore, LeadStatus, LeadStore } from './leads'
import type { ClientStore } from './clients'
import { convertLeadToClient } from './leads/convertLead'
import type { EncryptedAuthStateRow, PostgresAuthStateStore } from './auth'
import {
  type ChatDeleteService,
  ChatLabelStoreError,
  ChatMediaError,
  type ChatLabelStore,
  type ChatMediaService,
  type ChatService
} from './chats'
import type { AppEnv } from './config/env'
import type { OutboundMessageService } from './messages'
import type { BroadcastJobStore, BroadcastListStore, BroadcastMessagePayload } from './broadcasts'
import type { SessionEventBus, SessionManager, SessionStatusStore } from './sessions'
import type { MetricsStore } from './observability/metrics'
import type { SystemSettingsService } from './systemSettings'
import type { DashboardStore } from './dashboard'
import type { AffiliateService } from './affiliates'
import type {
  PostInteractionFeedbackDetailsFilters,
  PostInteractionFeedbackDetailsReport,
  PostInteractionFeedbackSummaryReport
} from './postInteractionFeedback'
import { handleFindmyangelTemplateMessage, handleFindmyangelUserCreated } from './integrations/findmyangel'
import type { FindmyangelBrPreferenceStore, FindmyangelFailoverJobStore } from './integrations/findmyangelDelivery'
import type { AgendaStore } from './agenda/store'
import { computeAvailability } from './agenda/availability'
import { QuickReplyStoreError, type QuickReplyStore } from './quickReplies'
import {
  ONBOARDING_EVENT_NAMES,
  type AcquisitionFunnelGroupBy,
  type OnboardingCohort,
  type OnboardingEventName,
  type OnboardingEventSource,
  type OnboardingNurtureService,
  type OnboardingService
} from './onboarding'

type ServerDeps = {
  eventBus?: SessionEventBus
  statusStore?: SessionStatusStore
  sessionManager?: SessionManager
  auditStore?: AdminAuditStore
  authStateStore?: PostgresAuthStateStore
  outboundService?: OutboundMessageService
  aiService?: AiMessageService
  aiConfigStore?: AiConfigStore
  chatAiConfigStore?: ChatAiConfigStore
  leadStore?: LeadStore
  leadConversionStore?: LeadConversionStore
  clientStore?: ClientStore
  aiPromptStore?: AiPromptStore
  chatService?: ChatService
  chatDeleteService?: ChatDeleteService
  chatLabelStore?: ChatLabelStore
  chatMediaService?: ChatMediaService
  systemSettings?: SystemSettingsService
  metrics?: MetricsStore
  workerStatus?: () => WorkerStatusSnapshot
  dashboardStore?: DashboardStore
  aiUsageStore?: AiUsageStore
  creditsService?: CreditsService
  billingService?: BillingService
  suggestionStore?: AiFieldSuggestionStore
  trainingCopilotService?: TrainingCopilotService
  agendaStore?: AgendaStore
  quickReplyStore?: QuickReplyStore
  broadcastListStore?: BroadcastListStore
  broadcastJobStore?: BroadcastJobStore
  sessionHardDeleteService?: SessionHardDeleteService
  onboardingService?: OnboardingService
  onboardingNurtureService?: OnboardingNurtureService
  findmyangelBrPreferenceStore?: Pick<FindmyangelBrPreferenceStore, 'getPreferredVariant'>
  findmyangelFailoverJobStore?: Pick<FindmyangelFailoverJobStore, 'enqueue'>
  postInteractionFeedbackService?: {
    getSummary(fromMs: number, toMs: number): Promise<PostInteractionFeedbackSummaryReport>
    getFeedbackDetails(filters: PostInteractionFeedbackDetailsFilters): Promise<PostInteractionFeedbackDetailsReport>
    enrollQualifiedInteraction(input: {
      sourceSystem: 'dancing'
      sourceSessionId: string
      sourceChatId: string
      whatsapp: string
      contactName?: string | null
      sourceCompanyName?: string | null
      qualifiedAtMs: number
      userMessageCount: number
      aiReplyCount: number
      qualificationKey: string
      triggerOutboundId: number
    }): Promise<{
      status: 'enrolled' | 'duplicate' | 'cooldown_skipped' | 'active_campaign_skipped'
      senderSessionId: string | null
      leadId?: string
    }>
  }
  affiliateService?: AffiliateService
}

type SessionParams = {
  sessionId: string
}

type AdminQuery = {
  key?: string
}

type SessionCreateBody = {
  sessionId?: string
}

type SessionActionBody = {
  reason?: string
}

type AuthExportQuery = AdminQuery & {
  limit?: number | string
}

type SessionHistoryQuery = AdminQuery & {
  limit?: number | string
}

type AuthImportBody = {
  rows?: EncryptedAuthStateRow[]
}

type AiConfigBody = {
  config?: Record<string, unknown>
}

type SystemSettingsBody = {
  debugAiPrompt?: boolean
  debugAiResponse?: boolean
  requestLogging?: boolean
  usdBrlRate?: number | string
  aiAudioTranscriptionUsdPerMin?: number | string
  newAccountCreditsBrl?: number | string
  aiPricing?: {
    models?: Record<string, { inputUsdPerM?: number; outputUsdPerM?: number }>
  }
  postInteractionProspecting?: {
    enabled?: boolean
    senderEmail?: string
    ctaBaseUrl?: string
  }
}

type MessageSendBody = {
  sessionId?: string
  chatId?: string
  to?: string
  text?: string
  origin?: string
  media?: {
    url?: string
    mediaType?: string
    mimeType?: string
    fileName?: string
    caption?: string
    storagePolicy?: string
  }
  contact?: {
    displayName?: string
    contacts?: Array<{
      name?: string
      whatsapp?: string
    }>
  }
  idempotencyKey?: string
}

type MessageSendOrigin = 'human_dashboard' | 'automation_api'

type FindmyangelUserCreatedBody = {
  userId?: string
  name?: string | null
  email?: string | null
  whatsapp?: string
  createdAtMs?: number | string | null
}

type FindmyangelTemplateMessageBody = {
  userId?: string
  source?: string | null
  whatsapp?: string
  name?: string | null
  text?: string
  template?: {
    id?: string
    name?: string | null
    subject?: string | null
    occasion?: string | null
  }
  requestedBy?: string | null
  profileNumber?: number | string | null
  requestedAtMs?: number | string | null
}

type DancingQualifiedInteractionBody = {
  sourceSessionId?: string
  sourceChatId?: string
  whatsapp?: string
  contactName?: string | null
  sourceCompanyName?: string | null
  qualifiedAtMs?: number | string
  userMessageCount?: number | string
  aiReplyCount?: number | string
  triggerOutboundId?: number | string
}

type ChatListQuery = AdminQuery & {
  limit?: number | string
}

type ChatAiConfigListQuery = AdminQuery & {
  limit?: number | string
}

type AiPromptQuery = AdminQuery & {
  limit?: number | string
}

type ChatMessagesQuery = AdminQuery & {
  limit?: number | string
  beforeMs?: number | string
}

type ChatReadBody = {
  readAtMs?: number | string
}

type ChatLabelsQuery = AdminQuery & {
  limit?: number | string
}

type ChatLabelBody = {
  name?: string
  colorHex?: string
}

type ChatLabelAssignmentsBody = {
  labelIds?: string[]
}

type FollowUpSendBody = {
  text?: string
  idempotencyKey?: string
}

type TrainingCopilotSessionBody = {
  reset?: boolean
}

type TrainingCopilotMessageBody = {
  message?: string
  currentTraining?: {
    model?: string
    contextMaxMessages?: number
    instructions?: Record<string, unknown>
  }
}

type TrainingCopilotProposalDecisionBody = {
  actorRole?: string | null
  actorUid?: string | null
}

type ChatAiConfigBody = {
  aiEnabled?: boolean
}

type ChatAiConfigBulkResult = {
  totalChats: number
  updated: number
}

type LeadListQuery = AdminQuery & {
  limit?: number | string
  search?: string
}

type LeadUpdateBody = {
  name?: string | null
  whatsapp?: string | null
  aiTag?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type LeadCreateBody = {
  name?: string | null
  whatsapp?: string | null
  aiTag?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type LeadImportItemBody = {
  name?: string | null
  whatsapp?: string | null
  aiTag?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type LeadImportBody = {
  contacts?: LeadImportItemBody[]
  applyTag?: string | null
  updateExisting?: boolean
}

type AiSuggestionsQuery = AdminQuery & {
  targetType?: string
  status?: string
  limit?: number | string
}

type AiSuggestionDecisionBody = {
  decisionSource?: string | null
  decisionActorRole?: string | null
  decisionActorUid?: string | null
}

type AiSuggestionAcceptBody = AiSuggestionDecisionBody & {
  patch?: {
    status?: string
    nextContactAt?: number | string | null
    observations?: string | null
  }
}

type ClientListQuery = AdminQuery & {
  limit?: number | string
  search?: string
}

type ClientCreateBody = {
  name?: string | null
  whatsapp?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type ClientImportItemBody = {
  name?: string | null
  whatsapp?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type ClientImportBody = {
  contacts?: ClientImportItemBody[]
  updateExisting?: boolean
}

type ClientUpdateBody = {
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type BroadcastListBody = {
  name?: string
}

type BroadcastContactBody = {
  name?: string | null
  whatsapp?: string
}

const countUsefulEntitySearchChars = (value: string) =>
  value.replace(/[^0-9A-Za-z\u00C0-\u00FF]+/g, '').length

type BroadcastContactsBulkBody = {
  contacts?: Array<{ name?: string | null; whatsapp?: string }>
}

type BroadcastJobsQuery = AdminQuery & {
  limit?: number | string
}

type BroadcastContactsQuery = AdminQuery & {
  limit?: number | string
}

type BroadcastCreateBody = {
  listId?: string
  removeContactIfLastMessageUndelivered?: boolean
  text?: string
  media?: {
    url?: string
    mediaType?: string
    mimeType?: string
    fileName?: string
    caption?: string
  }
}

type QuickReplyBody = {
  shortcut?: string
  content?: string
}

type QuickRepliesQuery = AdminQuery & {
  limit?: number | string
}

type DashboardQuery = AdminQuery & {
  fromMs?: number | string
  recentLimit?: number | string
}

type AiUsageSummaryQuery = AdminQuery & {
  fromMs?: number | string
  toMs?: number | string
}

type CreditsUpdateBody = {
  mode?: 'set' | 'adjust'
  amountBrl?: number | string
  reason?: string | null
  actorId?: string | null
}

type CreditsBatchBody = {
  sessionIds?: string[]
}

type CreditsGrantSignupBody = {
  sessionId?: string
}

type AdminAgendaAvailabilityQuery = AdminQuery & {
  agendaId?: string
  date?: string
  durationMinutes?: number | string
  granularityMinutes?: number | string
}

type OnboardingEventBody = {
  eventId?: string
  eventName?: string
  eventSource?: string
  occurredAtMs?: number | string
  properties?: Record<string, unknown>
}

type OnboardingDraftUpdateBody = {
  expectedVersion?: number | string | null
  currentStep?: number | string | null
  selectedTemplateId?: string | null
  trainingPatch?: Record<string, unknown> | null
}

type OnboardingGuidedSessionBody = {
  scenarioId?: string | null
  action?: 'restart' | 'clear'
}

type OnboardingGuidedMessageBody = {
  testSessionId?: string | null
  draftSnapshot?: {
    version?: number | string | null
    training?: Record<string, unknown> | null
  } | null
  userMessage?: string
}

type OnboardingGuidedChangeRequestBody = {
  draftSnapshot?: {
    version?: number | string | null
    training?: Record<string, unknown> | null
  } | null
  testSessionId?: string | null
  requestText?: string
  transcript?: Array<{ role?: 'user' | 'assistant'; text?: string }> | null
}

type OnboardingGuidedChangeApplyBody = {
  expectedVersion?: number | string | null
  proposal?: {
    id?: string | null
    patch?: Record<string, unknown> | null
    summary?: string | null
    rationale?: string | null
  } | null
}

type OnboardingPublishBody = {
  expectedVersion?: number | string | null
  enableAi?: boolean
}

type OnboardingFunnelQuery = AdminQuery & {
  fromMs?: number | string
  toMs?: number | string
  cohort?: string
}

type ProspectingFeedbacksQuery = AdminQuery & {
  fromMs?: number | string
  toMs?: number | string
  focus?: string
  company?: string
  scoreMin?: number | string
  scoreMax?: number | string
  cursor?: string
  limit?: number | string
}

type AcquisitionFunnelQuery = OnboardingFunnelQuery & {
  groupBy?: string
}

type AffiliateLinkBody = {
  code?: string
  name?: string
  status?: string | null
}

type AffiliateClickBody = {
  visitorId?: string
  lockedAffiliateCode?: string | null
  lockedClickId?: string | null
  userAgent?: string | null
  referer?: string | null
  landingPath?: string | null
}

type AffiliateClaimBody = {
  sessionId?: string
  affiliateCode?: string | null
  clickId?: string | null
  visitorId?: string | null
  signupAtMs?: number | string | null
}

type BillingCheckoutSubscriptionBody = {
  plan?: SubscriptionPlan
  email?: string | null
}

type BillingCheckoutCreditsBody = {
  packageId?: CreditsPackageId
  email?: string | null
}

type WorkerStatusSnapshot = {
  inbound?: {
    running: boolean
    lastTickAt: number | null
  }
  audio?: {
    running: boolean
    lastTickAt: number | null
  }
  media?: {
    running: boolean
    lastTickAt: number | null
  }
  outbound?: {
    running: boolean
    lastTickAt: number | null
  }
  findmyangelFailover?: {
    running: boolean
    enabled: boolean
    lastTickAt: number | null
  }
  broadcast?: {
    running: boolean
    lastTickAt: number | null
  }
  autoFollowUp?: {
    running: boolean
    lastTickAt: number | null
  }
  postInteractionFeedback?: {
    running: boolean
    lastTickAt: number | null
  }
}

export function buildServer(env: AppEnv, deps: ServerDeps = {}) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    },
    disableRequestLogging: true
  })

  app.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: false,
    runFirst: true
  })

  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  const isOriginAllowed = (origin?: string) => {
    if (!origin) {
      return false
    }
    if (!allowedOrigins || allowedOrigins.length === 0) {
      return true
    }
    if (allowedOrigins.includes('*')) {
      return true
    }
    return allowedOrigins.includes(origin)
  }

  const applyCors = (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin
    if (origin && isOriginAllowed(origin)) {
      reply.header('Access-Control-Allow-Origin', origin)
      reply.header('Access-Control-Allow-Credentials', 'true')
      reply.header('Vary', 'Origin')
    }

    reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    const requestedHeaders = request.headers['access-control-request-headers']
    if (requestedHeaders) {
      reply.header('Access-Control-Allow-Headers', requestedHeaders)
    } else {
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
    }
    reply.header('Access-Control-Max-Age', '86400')
  }

  const shouldLogRequests = () => deps.systemSettings?.getRequestLogging?.() ?? true
  const sanitizeUrl = (value: string) => value.split('?')[0] ?? value

  app.addHook('onRequest', (request, reply, done) => {
    applyCors(request, reply)
    if (request.method === 'OPTIONS') {
      reply.code(204).send()
      return
    }
    if (shouldLogRequests()) {
      app.log.info(
        {
          reqId: request.id,
          method: request.method,
          url: sanitizeUrl(request.url),
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket.remotePort
        },
        'incoming request'
      )
    }
    done()
  })

  const isAdminRequest = (request: { headers: Record<string, string | string[] | undefined>; query?: unknown }) => {
    if (!env.ADMIN_API_KEY) {
      return true
    }
    const header = request.headers['x-admin-key']
    const queryKey = (request.query as AdminQuery | undefined)?.key
    const value = Array.isArray(header) ? header[0] : header
    return value === env.ADMIN_API_KEY || queryKey === env.ADMIN_API_KEY
  }

  const recordAudit = async (
    request: FastifyRequest,
    action: string,
    sessionId?: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!deps.auditStore) {
      return
    }

    try {
      await deps.auditStore.record({
        action,
        sessionId,
        requestId: request.id,
        ip: request.ip,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
        metadata
      })
    } catch (error) {
      app.log.warn({ err: error }, 'Failed to record admin audit')
    }
  }

  app.get('/health', async () => ({
    status: 'ok',
    uptimeSec: Math.round(process.uptime())
  }))

  app.get('/health/worker', async () => {
    if (!deps.workerStatus) {
      return {
        status: 'unknown'
      }
    }

    return {
      status: 'ok',
      workers: deps.workerStatus()
    }
  })

  app.post(
    '/webhooks/stripe',
    {
      config: {
        rawBody: true
      }
    },
    async (request, reply) => {
      if (!deps.billingService) {
        return reply.code(501).send({ received: false, error: 'Billing not configured' })
      }

      const signatureHeader = request.headers['stripe-signature']
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader
      const body = (request as any).rawBody as Buffer | string | undefined
      if (!body) {
        return reply.code(400).send({ received: false, error: 'raw_body_missing' })
      }

      try {
        await deps.billingService.handleWebhook(body, signature)
        return reply.code(200).send({ received: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'stripe_webhook_failed'
        // Signature failures should not be retried; processing failures should.
        const status = message.includes('signature') || message.includes('No signatures found') ? 400 : 500
        app.log.warn({ err: error }, 'Stripe webhook failed')
        return reply.code(status).send({ received: false, error: message })
      }
    }
  )

  const timingSafeEqual = (a: string, b: string) => {
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    if (aBuf.length !== bBuf.length) {
      const len = Math.max(aBuf.length, bBuf.length)
      const aPadded = Buffer.alloc(len)
      const bPadded = Buffer.alloc(len)
      aBuf.copy(aPadded)
      bBuf.copy(bPadded)
      crypto.timingSafeEqual(aPadded, bPadded)
      return false
    }
    return crypto.timingSafeEqual(aBuf, bBuf)
  }

  app.post<{
    Body: DancingQualifiedInteractionBody
  }>('/integrations/dancing/post-interaction-feedback/qualified', async (request, reply) => {
    if (!env.DANCING_POST_INTERACTION_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }

    const secret = env.DANCING_POST_INTERACTION_SECRET?.trim() ?? ''
    if (!secret) {
      app.log.error('Dancing post-interaction integration enabled but secret is missing')
      return reply.code(500).send({ success: false, error: 'integration_secret_missing' })
    }

    const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : ''
    const tokenRaw = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : authorization.trim()

    if (!tokenRaw || !timingSafeEqual(tokenRaw, secret)) {
      return reply.code(401).send({ success: false, error: 'unauthorized' })
    }

    if (!deps.postInteractionFeedbackService) {
      return reply.code(501).send({ success: false, error: 'Post-interaction feedback service not configured' })
    }

    const headerKey = request.headers['x-idempotency-key']
    const idempotencyKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey)?.trim() ?? ''
    if (!idempotencyKey) {
      return reply.code(400).send({ success: false, error: 'idempotency_key_required' })
    }

    const body = request.body ?? {}
    const sourceSessionId = body.sourceSessionId?.trim() ?? ''
    const sourceChatId = body.sourceChatId?.trim() ?? ''
    const whatsapp = typeof body.whatsapp === 'string' ? body.whatsapp.trim() : ''
    const contactName = parseNullableString(body.contactName)
    const sourceCompanyName = parseNullableString(body.sourceCompanyName) ?? 'Dancing Patinação'
    const qualifiedAtMs = parseOptionalInteger(body.qualifiedAtMs)
    const userMessageCount = parseOptionalInteger(body.userMessageCount)
    const aiReplyCount = parseOptionalInteger(body.aiReplyCount)
    const triggerOutboundId = parseOptionalInteger(body.triggerOutboundId)

    if (!sourceSessionId || !sourceChatId || !whatsapp) {
      return reply.code(400).send({ success: false, error: 'sourceSessionId, sourceChatId and whatsapp are required' })
    }
    if (!/^\d{10,15}$/.test(whatsapp)) {
      return reply.code(400).send({ success: false, error: 'whatsapp must be digits only' })
    }
    if (qualifiedAtMs === undefined || userMessageCount === undefined || aiReplyCount === undefined || triggerOutboundId === undefined) {
      return reply.code(400).send({
        success: false,
        error: 'qualifiedAtMs, userMessageCount, aiReplyCount and triggerOutboundId are required'
      })
    }
    if (userMessageCount < 2 || aiReplyCount < 2) {
      return reply.code(400).send({ success: false, error: 'minimum_interaction_not_met' })
    }

    const expectedIdempotencyKey = `dancing:${sourceSessionId}:${sourceChatId}:${triggerOutboundId}`
    if (idempotencyKey !== expectedIdempotencyKey) {
      return reply.code(400).send({ success: false, error: 'invalid_idempotency_key' })
    }

    const result = await deps.postInteractionFeedbackService.enrollQualifiedInteraction({
      sourceSystem: 'dancing',
      sourceSessionId,
      sourceChatId,
      whatsapp,
      contactName,
      sourceCompanyName,
      qualifiedAtMs,
      userMessageCount,
      aiReplyCount,
      qualificationKey: idempotencyKey,
      triggerOutboundId
    })

    return reply.code(200).send({
      success: true,
      status: result.status,
      ...(result.senderSessionId ? { senderSessionId: result.senderSessionId } : {}),
      ...(result.leadId ? { leadId: result.leadId } : {})
    })
  })

  app.post<{
    Body: FindmyangelUserCreatedBody
  }>('/integrations/findmyangel/user-created', async (request, reply) => {
    if (!env.FINDMYANGEL_INTEGRATION_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }

    const secret = env.FINDMYANGEL_INTEGRATION_SECRET?.trim() ?? ''
    if (!secret) {
      app.log.error('FindmyAngel integration enabled but secret is missing')
      return reply.code(500).send({ success: false, error: 'integration_secret_missing' })
    }

    const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : ''
    const tokenRaw = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : authorization.trim()

    if (!tokenRaw || !timingSafeEqual(tokenRaw, secret)) {
      return reply.code(401).send({ success: false, error: 'unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }
    if (!deps.outboundService) {
      return reply.code(501).send({ success: false, error: 'Outbound service not configured' })
    }

    const body = request.body ?? {}
    const userId = body.userId?.trim() ?? ''
    const whatsapp = body.whatsapp?.trim() ?? ''

    if (!userId) {
      return reply.code(400).send({ success: false, error: 'userId is required' })
    }
    if (!whatsapp) {
      return reply.code(400).send({ success: false, error: 'whatsapp is required' })
    }

    const headerKey = request.headers['x-idempotency-key']
    const idempotencyKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey)?.trim() ?? null

    const createdAtMs = parseTimestampMs(body.createdAtMs)

    try {
      const result = await handleFindmyangelUserCreated({
        payload: {
          userId,
          name: body.name ?? null,
          email: body.email ?? null,
          whatsapp,
          createdAtMs: createdAtMs ?? null
        },
        idempotencyKey,
        env: {
          FINDMYANGEL_TARGET_SESSION_ID: env.FINDMYANGEL_TARGET_SESSION_ID,
          FINDMYANGEL_TARGET_USER_EMAIL: env.FINDMYANGEL_TARGET_USER_EMAIL,
          FINDMYANGEL_BR_STRIP_NINTH_DIGIT: env.FINDMYANGEL_BR_STRIP_NINTH_DIGIT,
          FINDMYANGEL_BR_FAILOVER_ENABLED: env.FINDMYANGEL_BR_FAILOVER_ENABLED,
          FINDMYANGEL_BR_FAILOVER_DELAY_MS: env.FINDMYANGEL_BR_FAILOVER_DELAY_MS,
          FINDMYANGEL_WELCOME_TEXT: env.FINDMYANGEL_WELCOME_TEXT,
          FINDMYANGEL_DEFAULT_COUNTRY_CODE: env.FINDMYANGEL_DEFAULT_COUNTRY_CODE
        },
        deps: {
          leadStore: deps.leadStore,
          outboundService: deps.outboundService,
          ...(deps.findmyangelBrPreferenceStore
            ? {
                whatsappPreferenceStore: deps.findmyangelBrPreferenceStore
              }
            : {}),
          ...(deps.findmyangelFailoverJobStore
            ? {
                failoverJobStore: deps.findmyangelFailoverJobStore
              }
            : {}),
          ...(deps.sessionManager
            ? {
                whatsappLookup: {
                  checkWhatsappNumbers: (sessionId: string, phoneNumbers: string[]) =>
                    deps.sessionManager!.checkWhatsappNumbers(sessionId, phoneNumbers)
                }
              }
            : {}),
          logger: {
            info: (message, meta) => app.log.info(meta, message),
            warn: (message, meta) => app.log.warn(meta, message),
            error: (message, meta) => app.log.error(meta, message)
          }
        }
      })

      void recordAudit(request, 'integrations.findmyangel.user_created', result.sessionId, {
        requestId: idempotencyKey ?? `findmyangel:user:${userId}:welcome-v1`,
        userId,
        outboundId: result.outboundId,
        chatId: result.chatId,
        resolutionStrategy: result.resolution?.strategy,
        resolutionChosen: result.resolution?.chosen,
        resolutionReason: result.resolution?.reason,
        preferredVariantBefore: result.resolution?.preferredVariantBefore,
        existsWith9: result.resolution?.existsWith9,
        existsWithout9: result.resolution?.existsWithout9,
        failoverScheduled: result.failoverScheduled === true
      })

      return reply.code(200).send({
        success: true,
        sessionId: result.sessionId,
        leadId: result.leadId,
        chatId: result.chatId,
        outboundId: result.outboundId
      })
    } catch (error) {
      const message = (error as Error).message || 'integration_failed'
      const status =
        message === 'invalid_whatsapp' ||
        message === 'whatsapp_not_found' ||
        message === 'invalid_default_country_code' ||
        message.includes('required')
          ? 400
          : 500

      app.log.warn({ err: error, userId }, 'FindmyAngel integration failed')
      return reply.code(status).send({ success: false, error: message })
    }
  })

  app.post<{
    Body: FindmyangelTemplateMessageBody
  }>('/integrations/findmyangel/template-message', async (request, reply) => {
    if (!env.FINDMYANGEL_INTEGRATION_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }

    const secret = env.FINDMYANGEL_INTEGRATION_SECRET?.trim() ?? ''
    if (!secret) {
      app.log.error('FindmyAngel integration enabled but secret is missing')
      return reply.code(500).send({ success: false, error: 'integration_secret_missing' })
    }

    const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : ''
    const tokenRaw = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : authorization.trim()

    if (!tokenRaw || !timingSafeEqual(tokenRaw, secret)) {
      return reply.code(401).send({ success: false, error: 'unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }
    if (!deps.outboundService) {
      return reply.code(501).send({ success: false, error: 'Outbound service not configured' })
    }

    const body = request.body ?? {}
    const userId = body.userId?.trim() ?? ''
    const whatsapp = body.whatsapp?.trim() ?? ''
    const text = body.text?.trim() ?? ''
    const templateId = body.template?.id?.trim() ?? ''
    const source = body.source?.trim() ?? 'admin-users-modal'
    const name = body.name?.trim() || null
    const requestedBy = body.requestedBy?.trim() || null
    const profileNumber = parseTimestampMs(body.profileNumber)
    const requestedAtMs = parseTimestampMs(body.requestedAtMs)

    const headerKey = request.headers['x-idempotency-key']
    const idempotencyKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey)?.trim() ?? ''

    if (!idempotencyKey) {
      return reply.code(400).send({ success: false, error: 'idempotency_key_required' })
    }

    if (!userId) {
      return reply.code(400).send({ success: false, error: 'userId_required' })
    }
    if (!templateId) {
      return reply.code(400).send({ success: false, error: 'template_id_required' })
    }
    if (!whatsapp) {
      return reply.code(400).send({ success: false, error: 'whatsapp_required' })
    }
    if (!text) {
      return reply.code(400).send({ success: false, error: 'message_required' })
    }

    try {
      const result = await handleFindmyangelTemplateMessage({
        payload: {
          userId,
          source,
          whatsapp,
          name,
          text,
          template: {
            id: templateId,
            name: body.template?.name ?? null,
            subject: body.template?.subject ?? null,
            occasion: body.template?.occasion ?? null
          },
          requestedBy,
          profileNumber,
          requestedAtMs: requestedAtMs ?? Date.now()
        },
        idempotencyKey,
        env: {
          FINDMYANGEL_TARGET_SESSION_ID: env.FINDMYANGEL_TARGET_SESSION_ID,
          FINDMYANGEL_TARGET_USER_EMAIL: env.FINDMYANGEL_TARGET_USER_EMAIL,
          FINDMYANGEL_BR_STRIP_NINTH_DIGIT: env.FINDMYANGEL_BR_STRIP_NINTH_DIGIT,
          FINDMYANGEL_BR_FAILOVER_ENABLED: env.FINDMYANGEL_BR_FAILOVER_ENABLED,
          FINDMYANGEL_BR_FAILOVER_DELAY_MS: env.FINDMYANGEL_BR_FAILOVER_DELAY_MS,
          FINDMYANGEL_WELCOME_TEXT: env.FINDMYANGEL_WELCOME_TEXT,
          FINDMYANGEL_DEFAULT_COUNTRY_CODE: env.FINDMYANGEL_DEFAULT_COUNTRY_CODE
        },
        deps: {
          leadStore: deps.leadStore,
          outboundService: deps.outboundService,
          ...(deps.findmyangelBrPreferenceStore
            ? {
                whatsappPreferenceStore: deps.findmyangelBrPreferenceStore
              }
            : {}),
          ...(deps.findmyangelFailoverJobStore
            ? {
                failoverJobStore: deps.findmyangelFailoverJobStore
              }
            : {}),
          ...(deps.sessionManager
            ? {
                whatsappLookup: {
                  checkWhatsappNumbers: (sessionId: string, phoneNumbers: string[]) =>
                    deps.sessionManager!.checkWhatsappNumbers(sessionId, phoneNumbers)
                }
              }
            : {}),
          logger: {
            info: (message, meta) => app.log.info(meta, message),
            warn: (message, meta) => app.log.warn(meta, message),
            error: (message, meta) => app.log.error(meta, message)
          }
        }
      })

      void recordAudit(request, 'integrations.findmyangel.template_message', result.sessionId, {
        requestId: idempotencyKey,
        userId,
        templateId,
        outboundId: result.outboundId,
        chatId: result.chatId,
        resolutionStrategy: result.resolution?.strategy,
        resolutionChosen: result.resolution?.chosen,
        resolutionReason: result.resolution?.reason,
        preferredVariantBefore: result.resolution?.preferredVariantBefore,
        existsWith9: result.resolution?.existsWith9,
        existsWithout9: result.resolution?.existsWithout9,
        failoverScheduled: result.failoverScheduled === true
      })

      return reply.code(200).send({
        success: true,
        sessionId: result.sessionId,
        leadId: result.leadId,
        chatId: result.chatId,
        outboundId: result.outboundId
      })
    } catch (error) {
      const message = (error as Error).message || 'integration_failed'
      const status =
        message === 'userId_required' ||
        message === 'template_id_required' ||
        message === 'whatsapp_required' ||
        message === 'whatsapp_not_found' ||
        message === 'message_required' ||
        message === 'invalid_whatsapp' ||
        message === 'idempotency_key_required' ||
        message === 'invalid_default_country_code'
          ? 400
          : 500

      app.log.warn({ err: error, userId, templateId }, 'FindmyAngel template integration failed')
      return reply.code(status).send({ success: false, error: message })
    }
  })

  app.get('/admin/diagnostics', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    void recordAudit(request, 'admin.diagnostics')

    return {
      success: true,
      diagnostics: {
        uptimeSec: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        now: new Date().toISOString(),
        sessions: deps.sessionManager?.getDiagnostics(),
        eventBus: deps.eventBus?.getStats(),
        metrics: deps.metrics?.snapshot()
      }
    }
  })

  app.get('/admin/metrics', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.metrics) {
      return reply.code(501).send({ success: false, error: 'Metrics not configured' })
    }

    void recordAudit(request, 'admin.metrics')

    return {
      success: true,
      metrics: deps.metrics.snapshot(),
      workers: deps.workerStatus?.() ?? null
    }
  })

  app.get<{
    Querystring: OnboardingFunnelQuery
  }>('/admin/onboarding/funnel', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    const now = Date.now()
    const fromMs = parseTimestampMs(request.query?.fromMs)
    const toMs = parseTimestampMs(request.query?.toMs)
    const cohort = parseOnboardingCohort(request.query?.cohort)
    const safeFromMs = typeof fromMs === 'number' && Number.isFinite(fromMs) ? fromMs : now - 90 * 24 * 60 * 60 * 1000
    const safeToMs = typeof toMs === 'number' && Number.isFinite(toMs) ? toMs : now

    try {
      const cohorts = await deps.onboardingService.getFunnel(safeFromMs, safeToMs, cohort)
      void recordAudit(request, 'onboarding.funnel.get', undefined, {
        fromMs: safeFromMs,
        toMs: safeToMs,
        cohort
      })
      return {
        success: true,
        cohort,
        cohorts
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'invalid_period') {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_funnel_failed' })
    }
  })

  app.get<{
    Querystring: AcquisitionFunnelQuery
  }>('/admin/acquisition/funnel', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED || !env.PAID_FUNNEL_ADMIN_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    const now = Date.now()
    const fromMs = parseTimestampMs(request.query?.fromMs)
    const toMs = parseTimestampMs(request.query?.toMs)
    const cohort = parseOnboardingCohort(request.query?.cohort)
    const groupBy = parseAcquisitionGroupBy(request.query?.groupBy)
    const safeFromMs = typeof fromMs === 'number' && Number.isFinite(fromMs) ? fromMs : now - 90 * 24 * 60 * 60 * 1000
    const safeToMs = typeof toMs === 'number' && Number.isFinite(toMs) ? toMs : now

    try {
      const rows = await deps.onboardingService.getAcquisitionFunnel(safeFromMs, safeToMs, cohort, groupBy)
      void recordAudit(request, 'acquisition.funnel.get', undefined, {
        fromMs: safeFromMs,
        toMs: safeToMs,
        cohort,
        groupBy
      })
      return {
        success: true,
        cohort,
        groupBy,
        rows
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'invalid_period') {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'acquisition_funnel_failed' })
    }
  })

  app.get('/admin/affiliates', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!deps.affiliateService) {
      return reply.code(501).send({ success: false, error: 'Affiliate service not configured' })
    }

    const links = await deps.affiliateService.listLinks()
    void recordAudit(request, 'affiliates.list')
    return {
      success: true,
      links
    }
  })

  app.post<{
    Body: AffiliateLinkBody
  }>('/admin/affiliates', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!deps.affiliateService) {
      return reply.code(501).send({ success: false, error: 'Affiliate service not configured' })
    }

    const code = typeof request.body?.code === 'string' ? request.body.code : ''
    const name = typeof request.body?.name === 'string' ? request.body.name : ''
    const status = parseNullableString(request.body?.status)

    try {
      const link = await deps.affiliateService.saveLink({ code, name, status })
      void recordAudit(request, 'affiliates.save', undefined, {
        code: link.code,
        status: link.status
      })
      return {
        success: true,
        link
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'affiliate_save_failed'
      if (
        message === 'affiliate_code_invalid' ||
        message === 'affiliate_name_invalid'
      ) {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'affiliate_save_failed' })
    }
  })

  app.post<{
    Params: { code: string }
    Body: AffiliateClickBody
  }>('/admin/affiliates/:code/clicks', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!deps.affiliateService) {
      return reply.code(501).send({ success: false, error: 'Affiliate service not configured' })
    }

    try {
      const result = await deps.affiliateService.registerClick({
        affiliateCode: request.params.code,
        visitorId: typeof request.body?.visitorId === 'string' ? request.body.visitorId : '',
        lockedAffiliateCode: parseNullableString(request.body?.lockedAffiliateCode),
        lockedClickId: parseNullableString(request.body?.lockedClickId),
        userAgent: parseNullableString(request.body?.userAgent),
        referer: parseNullableString(request.body?.referer),
        landingPath: parseNullableString(request.body?.landingPath)
      })

      void recordAudit(request, 'affiliates.click', undefined, {
        code: result.click.affiliateCode,
        clickId: result.click.clickId,
        visitorId: result.click.visitorId,
        effectiveAffiliateCode: result.effectiveAffiliateCode,
        effectiveClickId: result.effectiveClickId
      })

      return {
        success: true,
        click: result.click,
        effectiveAffiliateCode: result.effectiveAffiliateCode,
        effectiveClickId: result.effectiveClickId
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'affiliate_click_failed'
      if (
        message === 'affiliate_not_found' ||
        message === 'affiliate_code_invalid' ||
        message === 'visitor_id_invalid'
      ) {
        return reply.code(404).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'affiliate_click_failed' })
    }
  })

  app.post<{
    Body: AffiliateClaimBody
  }>('/admin/affiliates/claim', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!deps.affiliateService) {
      return reply.code(501).send({ success: false, error: 'Affiliate service not configured' })
    }

    const sessionId = typeof request.body?.sessionId === 'string' ? request.body.sessionId : ''
    const signupAtMs = parseTimestampMs(request.body?.signupAtMs)

    try {
      const result = await deps.affiliateService.claimAttribution({
        sessionId,
        affiliateCode: parseNullableString(request.body?.affiliateCode),
        clickId: parseNullableString(request.body?.clickId),
        visitorId: parseNullableString(request.body?.visitorId),
        signupAtMs
      })

      void recordAudit(request, 'affiliates.claim', sessionId || undefined, {
        claimed: result.claimed,
        affiliateCode: result.attribution?.affiliateCode ?? null
      })

      return {
        success: true,
        claimed: result.claimed,
        attribution: result.attribution
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'affiliate_claim_failed'
      if (message === 'sessionId_required') {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'affiliate_claim_failed' })
    }
  })

  app.get<{
    Querystring: OnboardingFunnelQuery
  }>('/admin/affiliates/funnel', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!deps.affiliateService) {
      return reply.code(501).send({ success: false, error: 'Affiliate service not configured' })
    }

    const now = Date.now()
    const fromMs = parseTimestampMs(request.query?.fromMs)
    const toMs = parseTimestampMs(request.query?.toMs)
    const safeFromMs = typeof fromMs === 'number' && Number.isFinite(fromMs) ? fromMs : now - 90 * 24 * 60 * 60 * 1000
    const safeToMs = typeof toMs === 'number' && Number.isFinite(toMs) ? toMs : now

    try {
      const report = await deps.affiliateService.getFunnel(safeFromMs, safeToMs)
      void recordAudit(request, 'affiliates.funnel.get', undefined, {
        fromMs: safeFromMs,
        toMs: safeToMs
      })
      return {
        success: true,
        summary: report.summary,
        rows: report.rows
      }
    } catch {
      return reply.code(500).send({ success: false, error: 'affiliate_funnel_failed' })
    }
  })

  app.get<{
    Querystring: AdminQuery & { fromMs?: number | string; toMs?: number | string }
  }>('/admin/prospecting/summary', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.postInteractionFeedbackService) {
      return reply.code(501).send({ success: false, error: 'Post-interaction feedback service not configured' })
    }

    const fromMsRaw = parseTimestampMs((request.query as { fromMs?: number | string } | undefined)?.fromMs)
    const toMsRaw = parseTimestampMs((request.query as { toMs?: number | string } | undefined)?.toMs)
    const defaultToMs = Date.now()
    const defaultFromMs = defaultToMs - 30 * 24 * 60 * 60 * 1000

    if (fromMsRaw === undefined || toMsRaw === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_period' })
    }

    const safeFromMs = fromMsRaw ?? defaultFromMs
    const safeToMs = toMsRaw ?? defaultToMs
    if (safeFromMs > safeToMs) {
      return reply.code(400).send({ success: false, error: 'invalid_period' })
    }

    try {
      const report = await deps.postInteractionFeedbackService.getSummary(safeFromMs, safeToMs)
      void recordAudit(request, 'prospecting.summary.get', undefined, {
        fromMs: safeFromMs,
        toMs: safeToMs
      })
      return {
        success: true,
        fromMs: safeFromMs,
        toMs: safeToMs,
        summary: report.summary,
        diagnostics: report.diagnostics
      }
    } catch {
      return reply.code(500).send({ success: false, error: 'prospecting_summary_failed' })
    }
  })

  app.get<{
    Querystring: ProspectingFeedbacksQuery
  }>('/admin/prospecting/feedbacks', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.postInteractionFeedbackService) {
      return reply.code(501).send({ success: false, error: 'Post-interaction feedback service not configured' })
    }

    const fromMs = parseTimestampMs(request.query?.fromMs)
    const toMs = parseTimestampMs(request.query?.toMs)
    if (typeof fromMs !== 'number' || !Number.isFinite(fromMs) || typeof toMs !== 'number' || !Number.isFinite(toMs) || fromMs > toMs) {
      return reply.code(400).send({ success: false, error: 'invalid_period' })
    }

    const scoreMin = parseOptionalInteger(request.query?.scoreMin)
    const scoreMax = parseOptionalInteger(request.query?.scoreMax)
    if ((scoreMin !== undefined && (scoreMin < 1 || scoreMin > 10)) || (scoreMax !== undefined && (scoreMax < 1 || scoreMax > 10))) {
      return reply.code(400).send({ success: false, error: 'invalid_score_range' })
    }
    if (scoreMin !== undefined && scoreMax !== undefined && scoreMin > scoreMax) {
      return reply.code(400).send({ success: false, error: 'invalid_score_range' })
    }

    const focus = normalizeProspectingFeedbackFocus(request.query?.focus)
    if (request.query?.focus !== undefined && !focus) {
      return reply.code(400).send({ success: false, error: 'invalid_focus' })
    }

    const limit = parseOptionalInteger(request.query?.limit)
    if (limit !== undefined && limit <= 0) {
      return reply.code(400).send({ success: false, error: 'invalid_limit' })
    }

    try {
      const report = await deps.postInteractionFeedbackService.getFeedbackDetails({
        fromMs,
        toMs,
        focus,
        company: typeof request.query?.company === 'string' ? request.query.company.trim() || null : null,
        scoreMin: scoreMin ?? null,
        scoreMax: scoreMax ?? null,
        cursor: typeof request.query?.cursor === 'string' ? request.query.cursor.trim() || null : null,
        limit: limit ?? null
      })
      void recordAudit(request, 'prospecting.feedbacks.get', undefined, {
        fromMs,
        toMs,
        focus,
        company: typeof request.query?.company === 'string' ? request.query.company.trim() || null : null,
        scoreMin: scoreMin ?? null,
        scoreMax: scoreMax ?? null,
        limit: limit ?? null
      })
      return {
        success: true,
        rows: report.rows,
        stats: report.stats,
        pageInfo: report.pageInfo
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'prospecting_feedbacks_failed'
      if (
        message === 'invalid_cursor' ||
        message === 'invalid_score_range' ||
        message === 'invalid_limit' ||
        message === 'invalid_focus' ||
        message === 'invalid_period'
      ) {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'prospecting_feedbacks_failed' })
    }
  })

  app.get<{
    Querystring: AdminQuery
  }>('/admin/system-settings', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.systemSettings) {
      return reply.code(501).send({ success: false, error: 'System settings not configured' })
    }

    void recordAudit(request, 'system.settings.get')

    return {
      success: true,
      settings: deps.systemSettings.getSnapshot()
    }
  })

  app.post<{
    Body: SystemSettingsBody
  }>('/admin/system-settings', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.systemSettings) {
      return reply.code(501).send({ success: false, error: 'System settings not configured' })
    }

    const debugAiPrompt = request.body?.debugAiPrompt
    const debugAiResponse = request.body?.debugAiResponse
    const requestLogging = request.body?.requestLogging
    const usdBrlRateRaw = request.body?.usdBrlRate
    const aiAudioTranscriptionUsdPerMinRaw = request.body?.aiAudioTranscriptionUsdPerMin
    const newAccountCreditsBrlRaw = request.body?.newAccountCreditsBrl
    const aiPricing = request.body?.aiPricing
    const postInteractionProspecting = request.body?.postInteractionProspecting
    const hasDebug = typeof debugAiPrompt === 'boolean'
    const hasResponse = typeof debugAiResponse === 'boolean'
    const hasRequestLogging = typeof requestLogging === 'boolean'
    const usdBrlRate = parseNumber(usdBrlRateRaw)
    const hasUsdBrlRate = typeof usdBrlRate === 'number'
    const aiAudioTranscriptionUsdPerMin = parseNumber(aiAudioTranscriptionUsdPerMinRaw)
    const hasAiAudioTranscriptionUsdPerMin = typeof aiAudioTranscriptionUsdPerMin === 'number'
    const newAccountCreditsBrl = parseNumber(newAccountCreditsBrlRaw)
    const hasNewAccountCreditsBrl = typeof newAccountCreditsBrl === 'number'
    const hasAiPricing = Boolean(aiPricing && typeof aiPricing === 'object' && !Array.isArray(aiPricing))
    const hasPostInteractionProspectingObject = Boolean(
      postInteractionProspecting &&
      typeof postInteractionProspecting === 'object' &&
      !Array.isArray(postInteractionProspecting)
    )
    const postInteractionEnabled =
      hasPostInteractionProspectingObject && typeof postInteractionProspecting?.enabled === 'boolean'
        ? postInteractionProspecting.enabled
        : undefined
    const postInteractionSenderEmail =
      hasPostInteractionProspectingObject && typeof postInteractionProspecting?.senderEmail === 'string'
        ? postInteractionProspecting.senderEmail.trim()
        : undefined
    const postInteractionCtaBaseUrl =
      hasPostInteractionProspectingObject && typeof postInteractionProspecting?.ctaBaseUrl === 'string'
        ? postInteractionProspecting.ctaBaseUrl.trim()
        : undefined
    const hasPostInteractionProspecting =
      hasPostInteractionProspectingObject &&
      (
        typeof postInteractionEnabled === 'boolean' ||
        typeof postInteractionSenderEmail === 'string' ||
        typeof postInteractionCtaBaseUrl === 'string'
      )

    if (
      !hasDebug &&
      !hasResponse &&
      !hasRequestLogging &&
      !hasUsdBrlRate &&
      !hasAiAudioTranscriptionUsdPerMin &&
      !hasNewAccountCreditsBrl &&
      !hasAiPricing &&
      !hasPostInteractionProspecting
    ) {
      return reply.code(400).send({ success: false, error: 'settings_required' })
    }

    if (hasNewAccountCreditsBrl && newAccountCreditsBrl < 0) {
      return reply.code(400).send({ success: false, error: 'newAccountCreditsBrl_negative' })
    }
    if (hasPostInteractionProspecting && postInteractionSenderEmail === '') {
      return reply.code(400).send({ success: false, error: 'postInteractionProspecting_senderEmail_required' })
    }
    if (hasPostInteractionProspecting && postInteractionCtaBaseUrl === '') {
      return reply.code(400).send({ success: false, error: 'postInteractionProspecting_ctaBaseUrl_required' })
    }

    if (hasDebug) {
      await deps.systemSettings.setDebugAiPrompt(debugAiPrompt)
    }
    if (hasResponse) {
      await deps.systemSettings.setDebugAiResponse(debugAiResponse)
    }
    if (hasRequestLogging) {
      await deps.systemSettings.setRequestLogging(requestLogging)
    }
    if (hasUsdBrlRate) {
      await deps.systemSettings.setUsdBrlRate(usdBrlRate)
    }
    if (hasAiAudioTranscriptionUsdPerMin) {
      await deps.systemSettings.setAiAudioTranscriptionUsdPerMin(aiAudioTranscriptionUsdPerMin)
    }
    if (hasNewAccountCreditsBrl) {
      await deps.systemSettings.setNewAccountCreditsBrl(newAccountCreditsBrl)
    }
    if (hasAiPricing) {
      await deps.systemSettings.setAiPricing(aiPricing as { models: Record<string, { inputUsdPerM: number; outputUsdPerM: number }> })
    }
    if (hasPostInteractionProspecting) {
      await deps.systemSettings.setPostInteractionProspecting({
        ...(typeof postInteractionEnabled === 'boolean' ? { enabled: postInteractionEnabled } : {}),
        ...(typeof postInteractionSenderEmail === 'string' ? { senderEmail: postInteractionSenderEmail } : {}),
        ...(typeof postInteractionCtaBaseUrl === 'string' ? { ctaBaseUrl: postInteractionCtaBaseUrl } : {})
      })
    }
    void recordAudit(request, 'system.settings.set', undefined, {
      ...(hasDebug ? { debugAiPrompt } : {}),
      ...(hasResponse ? { debugAiResponse } : {}),
      ...(hasRequestLogging ? { requestLogging } : {}),
      ...(hasUsdBrlRate ? { usdBrlRate } : {}),
      ...(hasAiAudioTranscriptionUsdPerMin ? { aiAudioTranscriptionUsdPerMin } : {}),
      ...(hasNewAccountCreditsBrl ? { newAccountCreditsBrl } : {}),
      ...(hasAiPricing ? { aiPricingUpdated: true } : {}),
      ...(hasPostInteractionProspecting ? { postInteractionProspectingUpdated: true } : {})
    })

    return {
      success: true,
      settings: deps.systemSettings.getSnapshot()
    }
  })

  app.get<{
    Querystring: AiPromptQuery
  }>('/admin/ai/prompts', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiPromptStore) {
      return reply.code(501).send({ success: false, error: 'AI prompt store not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 50
    const prompts = deps.aiPromptStore.list(safeLimit)
    void recordAudit(request, 'ai.prompts.get', undefined, { count: prompts.length })

    return {
      success: true,
      prompts,
      total: prompts.length
    }
  })

  app.delete<{
    Querystring: AdminQuery
  }>('/admin/ai/prompts', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiPromptStore) {
      return reply.code(501).send({ success: false, error: 'AI prompt store not configured' })
    }

    deps.aiPromptStore.clear()
    void recordAudit(request, 'ai.prompts.clear')

    return {
      success: true
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/status', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.statusStore) {
      return reply.code(501).send({ success: false, error: 'Status store not configured' })
    }

    const snapshot = await deps.statusStore.getStatus(request.params.sessionId)
    if (!snapshot) {
      return reply.code(404).send({ success: false, error: 'Status not found' })
    }

    void recordAudit(request, 'sessions.status', request.params.sessionId, { status: snapshot.status })

    return {
      success: true,
      status: snapshot
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: DashboardQuery
  }>('/sessions/:sessionId/dashboard', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.dashboardStore || !deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Dashboard store not configured' })
    }

    const now = Date.now()
    const windowMs = 30 * 24 * 60 * 60 * 1000
    const rawFrom = request.query?.fromMs
    const parsedFrom = parseTimestampMs(rawFrom)
    const fromMs = typeof parsedFrom === 'number' ? parsedFrom : now - windowMs

    const rawLimit = request.query?.recentLimit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 50) : 5

    const conversionsPromise = deps.leadConversionStore
      ? deps.leadConversionStore.getCohortSummary(request.params.sessionId, fromMs, now).catch((error) => {
          app.log.warn({ err: error }, 'Failed to fetch lead conversion summary')
          return null
        })
      : Promise.resolve(null)

    const [stats, recentLeads, conversions] = await Promise.all([
      deps.dashboardStore.getStats(request.params.sessionId, fromMs, now),
      deps.leadStore.listBySession(request.params.sessionId, safeLimit),
      conversionsPromise
    ])

    void recordAudit(request, 'dashboard.summary', request.params.sessionId, {
      fromMs,
      toMs: now,
      recentLimit: safeLimit
    })

    return {
      success: true,
      stats,
      recentLeads,
      ...(conversions ? { conversions } : {})
    }
  })

  app.post<{
    Params: SessionParams
    Body: OnboardingEventBody
  }>('/sessions/:sessionId/onboarding/events', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    const eventId = typeof request.body?.eventId === 'string' ? request.body.eventId.trim() : ''
    const eventName = normalizeOnboardingEventName(request.body?.eventName)
    const eventSource = normalizeOnboardingEventSource(request.body?.eventSource) ?? 'frontend'
    const occurredAtMs = parseTimestampMs(request.body?.occurredAtMs)
    const properties = isRecord(request.body?.properties) ? request.body.properties : {}

    if (!eventId) {
      return reply.code(400).send({ success: false, error: 'event_id_required' })
    }
    if (!eventName) {
      return reply.code(400).send({ success: false, error: 'event_name_invalid' })
    }
    if (typeof occurredAtMs !== 'number' || !Number.isFinite(occurredAtMs)) {
      return reply.code(400).send({ success: false, error: 'occurred_at_invalid' })
    }

    try {
      const result = await deps.onboardingService.recordEvent({
        sessionId: request.params.sessionId,
        eventId,
        eventName,
        eventSource,
        occurredAtMs,
        properties
      })
      void recordAudit(request, 'onboarding.event.record', request.params.sessionId, {
        eventName,
        eventSource,
        recorded: result.recorded
      })

      if (result.recorded && deps.onboardingNurtureService?.isEnabled() === true) {
        void deps.onboardingNurtureService
          .handleOnboardingEvent({
            sessionId: request.params.sessionId,
            eventName,
            properties
          })
          .catch((error) => {
            app.log.warn(
              {
                err: error,
                sessionId: request.params.sessionId,
                eventName
              },
              'Onboarding nurture enrollment failed'
            )
          })
      }
      return {
        success: true,
        recorded: result.recorded
      }
    } catch (error) {
      const message = (error as Error).message
      if (
        message === 'event_name_invalid' ||
        message === 'event_source_invalid' ||
        message === 'occurred_at_invalid' ||
        message === 'eventId is required' ||
        message === 'sessionId is required'
      ) {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_event_record_failed' })
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/onboarding/state', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const state = await deps.onboardingService.getState(request.params.sessionId)
      void recordAudit(request, 'onboarding.state.get', request.params.sessionId)
      return {
        success: true,
        state
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'sessionId is required') {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_state_failed' })
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/onboarding/draft', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const payload = await deps.onboardingService.getDraft(request.params.sessionId)
      void recordAudit(request, 'onboarding.draft.get', request.params.sessionId)
      return {
        success: true,
        ...payload
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'sessionId is required') {
        return reply.code(400).send({ success: false, error: message })
      }
      if (message === 'draft_store_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_draft_get_failed' })
    }
  })

  app.put<{
    Params: SessionParams
    Body: OnboardingDraftUpdateBody
  }>('/sessions/:sessionId/onboarding/draft', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const payload = await deps.onboardingService.updateDraft(request.params.sessionId, {
        expectedVersion: parseOptionalInteger(request.body?.expectedVersion),
        currentStep: parseOptionalInteger(request.body?.currentStep),
        selectedTemplateId:
          typeof request.body?.selectedTemplateId === 'string' || request.body?.selectedTemplateId === null
            ? request.body?.selectedTemplateId
            : undefined,
        trainingPatch: isRecord(request.body?.trainingPatch) ? request.body.trainingPatch : undefined
      })
      void recordAudit(request, 'onboarding.draft.update', request.params.sessionId, {
        currentStep: payload.currentStep
      })
      return {
        success: true,
        ...payload
      }
    } catch (error) {
      const typedError = error as Error & { payload?: unknown }
      const message = typedError.message
      if (message === 'draft_version_conflict') {
        return reply.code(409).send({ success: false, error: message, draft: typedError.payload ?? null })
      }
      if (message === 'draft_store_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      if (message === 'sessionId is required') {
        return reply.code(400).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_draft_update_failed' })
    }
  })

  app.post<{
    Params: SessionParams
    Body: OnboardingGuidedSessionBody
  }>('/sessions/:sessionId/onboarding/guided-test/session', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED || !env.ONBOARDING_GUIDED_TEST_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const payload = await deps.onboardingService.upsertGuidedTestSession(request.params.sessionId, {
        scenarioId:
          typeof request.body?.scenarioId === 'string' || request.body?.scenarioId === null
            ? request.body?.scenarioId
            : undefined,
        action: request.body?.action === 'clear' ? 'clear' : 'restart'
      })
      void recordAudit(request, 'onboarding.guided_test.session', request.params.sessionId, {
        action: request.body?.action === 'clear' ? 'clear' : 'restart'
      })
      return {
        success: true,
        ...payload
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'draft_store_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_guided_test_session_failed' })
    }
  })

  app.post<{
    Params: SessionParams
    Body: OnboardingGuidedMessageBody
  }>('/sessions/:sessionId/onboarding/guided-test/message', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED || !env.ONBOARDING_GUIDED_TEST_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const result = await deps.onboardingService.sendGuidedTestMessage(request.params.sessionId, {
        testSessionId: typeof request.body?.testSessionId === 'string' ? request.body.testSessionId : undefined,
        draftSnapshot:
          request.body?.draftSnapshot &&
          typeof request.body.draftSnapshot === 'object' &&
          !Array.isArray(request.body.draftSnapshot)
            ? {
                version: parseOptionalInteger(request.body.draftSnapshot.version),
                training: isRecord(request.body.draftSnapshot.training)
                  ? request.body.draftSnapshot.training
                  : undefined
              }
            : undefined,
        userMessage: typeof request.body?.userMessage === 'string' ? request.body.userMessage : ''
      })
      void recordAudit(request, 'onboarding.guided_test.message', request.params.sessionId, {
        testSessionId: result.testSessionId
      })
      return {
        success: true,
        ...result
      }
    } catch (error) {
      const message = (error as Error).message
      if (
        message === 'userMessage_required' ||
        message === 'guided_test_session_required' ||
        message === 'guided_test_session_not_found' ||
        message === 'draft_not_ready'
      ) {
        return reply.code(400).send({ success: false, error: message })
      }
      if (message === 'no_credits') {
        return reply.code(409).send({ success: false, error: message })
      }
      if (message === 'draft_store_unavailable' || message === 'guided_test_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_guided_test_message_failed' })
    }
  })

  app.post<{
    Params: SessionParams
    Body: OnboardingGuidedChangeRequestBody
  }>('/sessions/:sessionId/onboarding/guided-test/change-request', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED || !env.ONBOARDING_GUIDED_TEST_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const proposal = await deps.onboardingService.requestGuidedTestChange(request.params.sessionId, {
        testSessionId: typeof request.body?.testSessionId === 'string' ? request.body.testSessionId : undefined,
        requestText: typeof request.body?.requestText === 'string' ? request.body.requestText : '',
        draftSnapshot:
          request.body?.draftSnapshot &&
          typeof request.body.draftSnapshot === 'object' &&
          !Array.isArray(request.body.draftSnapshot)
            ? {
                version: parseOptionalInteger(request.body.draftSnapshot.version),
                training: isRecord(request.body.draftSnapshot.training)
                  ? request.body.draftSnapshot.training
                  : undefined
              }
            : undefined,
        transcript: Array.isArray(request.body?.transcript)
          ? request.body.transcript
              .map((entry) => ({
                role: (entry?.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
                text: typeof entry?.text === 'string' ? entry.text : ''
              }))
              .filter((entry) => entry.text.trim())
          : undefined
      })
      void recordAudit(request, 'onboarding.guided_test.change_request', request.params.sessionId, {
        proposalId: proposal.id
      })
      return {
        success: true,
        proposal
      }
    } catch (error) {
      const message = (error as Error).message
      if (
        message === 'requestText_required' ||
        message === 'guided_test_session_not_found' ||
        message === 'proposal_not_generated'
      ) {
        return reply.code(400).send({ success: false, error: message })
      }
      if (message === 'training_copilot_unavailable' || message === 'draft_store_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      if (message === 'no_credits') {
        return reply.code(409).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_guided_test_change_request_failed' })
    }
  })

  app.post<{
    Params: SessionParams
    Body: OnboardingGuidedChangeApplyBody
  }>('/sessions/:sessionId/onboarding/guided-test/change-apply', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED || !env.ONBOARDING_GUIDED_TEST_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const payload = await deps.onboardingService.applyGuidedTestChange(request.params.sessionId, {
        expectedVersion: parseOptionalInteger(request.body?.expectedVersion),
        proposal:
          request.body?.proposal &&
          typeof request.body.proposal === 'object' &&
          !Array.isArray(request.body.proposal)
            ? {
                id: typeof request.body.proposal.id === 'string' ? request.body.proposal.id : undefined,
                patch: isRecord(request.body.proposal.patch) ? request.body.proposal.patch : undefined,
                summary:
                  typeof request.body.proposal.summary === 'string' ? request.body.proposal.summary : undefined,
                rationale:
                  typeof request.body.proposal.rationale === 'string'
                    ? request.body.proposal.rationale
                    : undefined
              }
            : { patch: null }
      })
      void recordAudit(request, 'onboarding.guided_test.change_apply', request.params.sessionId)
      return {
        success: true,
        ...payload
      }
    } catch (error) {
      const typedError = error as Error & { payload?: unknown }
      const message = typedError.message
      if (message === 'draft_version_conflict') {
        return reply.code(409).send({ success: false, error: message, draft: typedError.payload ?? null })
      }
      if (message === 'proposal_patch_required') {
        return reply.code(400).send({ success: false, error: message })
      }
      if (message === 'draft_store_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_guided_test_change_apply_failed' })
    }
  })

  app.post<{
    Params: SessionParams
    Body: OnboardingPublishBody
  }>('/sessions/:sessionId/onboarding/publish', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    try {
      const result = await deps.onboardingService.publishDraft(request.params.sessionId, {
        expectedVersion: parseOptionalInteger(request.body?.expectedVersion),
        enableAi: request.body?.enableAi === true
      })
      void recordAudit(request, 'onboarding.publish', request.params.sessionId, {
        status: result.status,
        enabled: result.enabled
      })
      return {
        success: true,
        ...result
      }
    } catch (error) {
      const typedError = error as Error & { payload?: unknown }
      const message = typedError.message
      if (message === 'draft_version_conflict') {
        return reply.code(409).send({ success: false, error: message, draft: typedError.payload ?? null })
      }
      if (message === 'ai_config_store_unavailable' || message === 'draft_store_unavailable') {
        return reply.code(501).send({ success: false, error: message })
      }
      return reply.code(500).send({ success: false, error: 'onboarding_publish_failed' })
    }
  })

  app.post<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/onboarding/guided-test/run', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }
    if (!env.ONBOARDING_V2_ENABLED || !env.ONBOARDING_GUIDED_TEST_ENABLED) {
      return reply.code(404).send({ success: false, error: 'not_found' })
    }
    if (!deps.onboardingService) {
      return reply.code(501).send({ success: false, error: 'Onboarding service not configured' })
    }

    const sessionId = request.params.sessionId
    await deps.onboardingService.recordSystemEvent(sessionId, 'guided_test_started')
    await deps.onboardingService.recordSystemEvent(sessionId, 'onboarding_validation_run')

    try {
      const result = await deps.onboardingService.runGuidedTest(sessionId)
      const draft = await deps.onboardingService.getDraft(sessionId)
      await deps.onboardingService.recordSystemEvent(
        sessionId,
        result.passed ? 'guided_test_passed' : 'guided_test_failed',
        {
          checks: result.checks
        }
      )
      await deps.onboardingService.recordSystemEvent(
        sessionId,
        result.passed ? 'onboarding_validation_passed' : 'onboarding_validation_failed',
        {
          checks: result.checks,
          draftVersion: draft.draft.version
        }
      )
      void recordAudit(request, 'onboarding.guided_test.run', sessionId, {
        passed: result.passed
      })
      return {
        success: true,
        result,
        guidedValidation: draft.guidedValidation
      }
    } catch (error) {
      const message = (error as Error).message || 'guided_test_failed'
      await deps.onboardingService.recordSystemEvent(sessionId, 'guided_test_failed', {
        error: message
      })
      await deps.onboardingService.recordSystemEvent(sessionId, 'onboarding_validation_failed', {
        error: message
      })
      const status =
        message === 'sessionId is required' ||
        message === 'guided_test_unavailable' ||
        message.includes('not configured')
          ? 400
          : 500
      return reply.code(status).send({ success: false, error: message })
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/credits', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.creditsService) {
      return reply.code(501).send({ success: false, error: 'Credits not configured' })
    }

    const credits = await deps.creditsService.get(request.params.sessionId)
    void recordAudit(request, 'credits.get', request.params.sessionId)

    return {
      success: true,
      credits
    }
  })

  app.post<{
    Params: SessionParams
    Body: CreditsUpdateBody
  }>('/sessions/:sessionId/credits', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.creditsService) {
      return reply.code(501).send({ success: false, error: 'Credits not configured' })
    }

    const mode = request.body?.mode
    const amountRaw = request.body?.amountBrl
    const amountBrl = parseNumber(amountRaw)
    if (mode !== 'set' && mode !== 'adjust') {
      return reply.code(400).send({ success: false, error: 'mode_invalid' })
    }
    if (amountBrl === undefined || !Number.isFinite(amountBrl)) {
      return reply.code(400).send({ success: false, error: 'amount_invalid' })
    }
    if (mode === 'set' && amountBrl < 0) {
      return reply.code(400).send({ success: false, error: 'amount_negative' })
    }

    const reason = parseNullableString(request.body?.reason)
    const actorId = parseNullableString(request.body?.actorId)

    const credits =
      mode === 'set'
        ? await deps.creditsService.setBalance(request.params.sessionId, amountBrl, { reason, actorId })
        : await deps.creditsService.adjustBalance(request.params.sessionId, amountBrl, { reason, actorId })

    void recordAudit(request, `credits.${mode}`, request.params.sessionId, {
      amountBrl,
      actorId: actorId ?? null,
      reason: reason ?? null
    })

    return {
      success: true,
      credits
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/billing', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.billingService) {
      return reply.code(501).send({ success: false, error: 'Billing not configured' })
    }

    const overview = await deps.billingService.getOverview(request.params.sessionId)
    void recordAudit(request, 'billing.get', request.params.sessionId)

    return {
      success: true,
      stripeConfigured: overview.stripeConfigured,
      billing: overview.billing,
      plans: overview.plans
    }
  })

  app.post<{
    Params: SessionParams
    Body: BillingCheckoutSubscriptionBody
  }>('/sessions/:sessionId/billing/checkout/subscription', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.billingService) {
      return reply.code(501).send({ success: false, error: 'Billing not configured' })
    }

    const plan = request.body?.plan
    if (plan !== 'pro_monthly' && plan !== 'pro_annual' && plan !== 'enterprise_annual') {
      return reply.code(400).send({ success: false, error: 'plan_invalid' })
    }

    const email = parseNullableString(request.body?.email)
    try {
      const url = await deps.billingService.createSubscriptionCheckoutUrl(request.params.sessionId, { plan, email })
      void recordAudit(request, 'billing.checkout.subscription', request.params.sessionId, { plan })
      return { success: true, url }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'billing_failed'
      if (message === 'already_subscribed') {
        return reply.code(409).send({ success: false, error: message })
      }
      if (message.startsWith('stripe_') || message.endsWith('_missing') || message === 'stripe_not_configured') {
        return reply.code(501).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.post<{
    Params: SessionParams
    Body: BillingCheckoutCreditsBody
  }>('/sessions/:sessionId/billing/checkout/credits', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.billingService) {
      return reply.code(501).send({ success: false, error: 'Billing not configured' })
    }

    const packageId = request.body?.packageId
    if (packageId !== '20' && packageId !== '50' && packageId !== '100') {
      return reply.code(400).send({ success: false, error: 'package_invalid' })
    }

    const email = parseNullableString(request.body?.email)
    try {
      const url = await deps.billingService.createCreditsCheckoutUrl(request.params.sessionId, { packageId, email })
      void recordAudit(request, 'billing.checkout.credits', request.params.sessionId, { packageId })
      return { success: true, url }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'billing_failed'
      if (message === 'pro_subscription_required') {
        return reply.code(403).send({ success: false, error: message })
      }
      if (message.startsWith('stripe_') || message.endsWith('_missing') || message === 'stripe_not_configured') {
        return reply.code(501).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.post<{
    Params: SessionParams
    Body: { email?: string | null }
  }>('/sessions/:sessionId/billing/portal', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.billingService) {
      return reply.code(501).send({ success: false, error: 'Billing not configured' })
    }

    const email = parseNullableString(request.body?.email)
    try {
      const url = await deps.billingService.createPortalUrl(request.params.sessionId, { email })
      void recordAudit(request, 'billing.portal', request.params.sessionId)
      return { success: true, url }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'billing_failed'
      if (message.startsWith('stripe_') || message.endsWith('_missing') || message === 'stripe_not_configured') {
        return reply.code(501).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AiUsageSummaryQuery
  }>('/sessions/:sessionId/ai-usage/summary', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiUsageStore) {
      return reply.code(501).send({ success: false, error: 'AI usage store not configured' })
    }

    const now = Date.now()
    const windowMs = 30 * 24 * 60 * 60 * 1000
    const parsedFrom = parseTimestampMs(request.query?.fromMs)
    const parsedTo = parseTimestampMs(request.query?.toMs)
    const fromMs = typeof parsedFrom === 'number' ? parsedFrom : now - windowMs
    const toMs = typeof parsedTo === 'number' ? parsedTo : now

    const creditsPromise = deps.creditsService
      ? deps.creditsService.get(request.params.sessionId).catch((error) => {
          app.log.warn({ err: error }, 'Failed to fetch credits summary')
          return null
        })
      : Promise.resolve(null)
    const broadcastUsagePromise = deps.creditsService
      ? deps.creditsService
          .getUsageCostByReason(request.params.sessionId, fromMs, toMs, 'broadcast_transmission')
          .catch((error) => {
            app.log.warn({ err: error }, 'Failed to fetch broadcast usage cost')
            return { costBrl: 0, events: 0 }
          })
      : Promise.resolve({ costBrl: 0, events: 0 })
    const broadcastSeriesPromise = deps.creditsService
      ? deps.creditsService
          .getUsageDailySeriesByReason(request.params.sessionId, fromMs, toMs, 'broadcast_transmission', 'America/Sao_Paulo')
          .catch((error) => {
            app.log.warn({ err: error }, 'Failed to fetch broadcast usage series')
            return []
          })
      : Promise.resolve([])
    const broadcastSentMessagesPromise = deps.broadcastJobStore
      ? deps.broadcastJobStore.getSentCountByPeriod(request.params.sessionId, fromMs, toMs).catch((error) => {
          app.log.warn({ err: error }, 'Failed to fetch broadcast sent messages count')
          return 0
        })
      : Promise.resolve(0)

    const [summary, series, models, credits, broadcastUsage, broadcastSeries, broadcastSentMessages] = await Promise.all([
      deps.aiUsageStore.getSummary(request.params.sessionId, fromMs, toMs),
      deps.aiUsageStore.getDailySeries(request.params.sessionId, fromMs, toMs, 'America/Sao_Paulo'),
      deps.aiUsageStore.getModelBreakdown(request.params.sessionId, fromMs, toMs),
      creditsPromise,
      broadcastUsagePromise,
      broadcastSeriesPromise,
      broadcastSentMessagesPromise
    ])

    const responseCount = summary.responses.count
    const averages = {
      costPerResponseUsd: responseCount > 0 ? summary.responses.costUsd / responseCount : 0,
      costPerResponseBrl: responseCount > 0 ? summary.responses.costBrl / responseCount : 0,
      tokensPerResponse: responseCount > 0 ? summary.responses.totalTokens / responseCount : 0
    }
    const broadcastBilledBlocks = Math.max(0, Math.floor(broadcastUsage.events))
    const mergedSeries = mergeCostSeriesByDay(series, broadcastSeries)
    const mergedModels = [...models]
    if (broadcastUsage.costBrl > 0 || broadcastBilledBlocks > 0 || broadcastSentMessages > 0) {
      mergedModels.push({
        provider: 'broadcast',
        model: 'transmissao',
        category: 'broadcast',
        costUsd: 0,
        costBrl: broadcastUsage.costBrl,
        totalTokens: 0,
        responses: broadcastSentMessages
      })
      mergedModels.sort((a, b) => {
        const byCost = b.costBrl - a.costBrl
        if (byCost !== 0) return byCost
        return b.totalTokens - a.totalTokens
      })
    }
    const totalsCombined = {
      costBrl: summary.totals.costBrl + broadcastUsage.costBrl
    }

    void recordAudit(request, 'ai.usage.summary', request.params.sessionId, {
      fromMs,
      toMs
    })

    return {
      success: true,
      summary: {
        fromMs,
        toMs,
        totals: summary.totals,
        totalsCombined,
        responses: summary.responses,
        averages,
        series: mergedSeries,
        models: mergedModels,
        broadcast: {
          sentMessages: broadcastSentMessages,
          billedBlocks: broadcastBilledBlocks,
          billedMessages: broadcastBilledBlocks * 10,
          costBrl: broadcastUsage.costBrl
        },
        pricingMissingCount: summary.pricingMissingCount,
        credits
      }
    }
  })

  app.post<{
    Body: CreditsGrantSignupBody
  }>('/admin/credits/grant-signup', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.creditsService) {
      return reply.code(501).send({ success: false, error: 'Credits not configured' })
    }

    if (!deps.systemSettings) {
      return reply.code(501).send({ success: false, error: 'System settings not configured' })
    }

    const sessionId = request.body?.sessionId?.trim()
    if (!sessionId) {
      return reply.code(400).send({ success: false, error: 'sessionId_required' })
    }

    const amountBrl = deps.systemSettings.getNewAccountCreditsBrl()
    const result = await deps.creditsService.grantSignupBonus(sessionId, amountBrl, {
      actorId: 'system',
      reason: 'new_account_credits'
    })

    void recordAudit(request, 'credits.signup_bonus', sessionId, {
      amountBrl,
      granted: result.granted
    })

    return {
      success: true,
      granted: result.granted,
      amountBrl,
      credits: result.credits
    }
  })

  app.post<{
    Body: CreditsBatchBody
  }>('/admin/credits/batch', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.creditsService) {
      return reply.code(501).send({ success: false, error: 'Credits not configured' })
    }

    const sessionIds = Array.isArray(request.body?.sessionIds)
      ? request.body?.sessionIds.map((id) => String(id).trim()).filter(Boolean)
      : []

    if (sessionIds.length === 0) {
      return reply.code(400).send({ success: false, error: 'sessionIds_required' })
    }

    const uniqueIds = Array.from(new Set(sessionIds)).slice(0, 500)
    const credits = await deps.creditsService.getBatch(uniqueIds)

    void recordAudit(request, 'credits.batch', undefined, { count: uniqueIds.length })

    return {
      success: true,
      credits
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/events', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.eventBus || !deps.statusStore) {
      return reply.code(501).send({ success: false, error: 'Event bus not configured' })
    }

    const { sessionId } = request.params
    void recordAudit(request, 'sessions.events', sessionId)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })
    reply.raw.write('\n')
    reply.hijack()

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const unsubscribe = deps.eventBus.addSubscriber(sessionId, send)
    const initial = await deps.statusStore.getStatus(sessionId)
    if (initial) {
      send('status', initial)
    }

    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n')
    }, 25000)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  app.post<{
    Body: SessionCreateBody
  }>('/sessions', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.sessionManager) {
      return reply.code(501).send({ success: false, error: 'Session manager not configured' })
    }

    const sessionId = request.body?.sessionId?.trim() ?? crypto.randomUUID()
    if (!sessionId) {
      return reply.code(400).send({ success: false, error: 'sessionId is required' })
    }

    const snapshot = await deps.sessionManager.startSession(sessionId)
    void recordAudit(request, 'sessions.create', sessionId, { status: snapshot.status })

    return {
      success: true,
      sessionId,
      status: snapshot
    }
  })

  app.post<{
    Params: SessionParams
    Body: SessionActionBody
  }>('/sessions/:sessionId/start', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.sessionManager) {
      return reply.code(501).send({ success: false, error: 'Session manager not configured' })
    }

    const snapshot = await deps.sessionManager.startSession(request.params.sessionId)
    void recordAudit(request, 'sessions.start', request.params.sessionId, { status: snapshot.status })

    return {
      success: true,
      status: snapshot
    }
  })

  app.post<{
    Params: SessionParams
    Body: SessionActionBody
  }>('/sessions/:sessionId/stop', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.sessionManager) {
      return reply.code(501).send({ success: false, error: 'Session manager not configured' })
    }

    const snapshot = await deps.sessionManager.stopSession(request.params.sessionId, request.body?.reason)
    void recordAudit(request, 'sessions.stop', request.params.sessionId, {
      status: snapshot.status,
      reason: snapshot.reason ?? null
    })

    return {
      success: true,
      status: snapshot
    }
  })

  app.post<{
    Params: SessionParams
    Body: SessionActionBody
  }>('/sessions/:sessionId/purge', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.sessionManager) {
      return reply.code(501).send({ success: false, error: 'Session manager not configured' })
    }

    const snapshot = await deps.sessionManager.purgeSession(request.params.sessionId, request.body?.reason)
    void recordAudit(request, 'sessions.purge', request.params.sessionId, { status: snapshot.status })

    return {
      success: true,
      status: snapshot
    }
  })

  app.post<{
    Params: SessionParams
    Body: SessionActionBody
  }>('/sessions/:sessionId/hard-delete', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.sessionHardDeleteService) {
      return reply.code(501).send({ success: false, error: 'Session hard delete not configured' })
    }

    const sessionId = request.params.sessionId?.trim()
    if (!sessionId) {
      return reply.code(400).send({ success: false, error: 'sessionId is required' })
    }

    const report: Record<string, unknown> = {}

    if (deps.sessionManager) {
      try {
        const snapshot = await deps.sessionManager.purgeSession(sessionId, request.body?.reason ?? 'hard-delete')
        report.purge = {
          success: true,
          status: snapshot
        }
      } catch (error) {
        report.purge = {
          success: false,
          error: error instanceof Error ? error.message : 'session_purge_failed'
        }
        void recordAudit(request, 'sessions.hard_delete', sessionId, {
          success: false,
          report
        })
        return reply.code(500).send({
          success: false,
          error: 'session_purge_failed',
          sessionId,
          report
        })
      }
    } else {
      report.purge = {
        success: true,
        skipped: true
      }
    }

    const hardDeleteReport = await deps.sessionHardDeleteService.hardDeleteSession(sessionId)
    report.hardDelete = hardDeleteReport

    if (!hardDeleteReport.success) {
      void recordAudit(request, 'sessions.hard_delete', sessionId, {
        success: false,
        report
      })
      return reply.code(500).send({
        success: false,
        error: 'session_hard_delete_failed',
        sessionId,
        report
      })
    }

    void recordAudit(request, 'sessions.hard_delete', sessionId, {
      success: true,
      report
    })

    return {
      success: true,
      sessionId,
      report
    }
  })

  app.post<{
    Body: MessageSendBody
  }>('/messages/send', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.outboundService) {
      return reply.code(501).send({ success: false, error: 'Outbound service not configured' })
    }

    const body = request.body ?? {}
    const sessionId = body.sessionId?.trim()
    const chatId = (body.chatId ?? body.to ?? '').trim()
    const text = body.text?.trim()
    const headerKey = request.headers['x-idempotency-key']
    const idempotencyKey =
      body.idempotencyKey?.trim() ??
      (Array.isArray(headerKey) ? headerKey[0] : headerKey)?.trim()

    if (!sessionId) {
      return reply.code(400).send({ success: false, error: 'sessionId is required' })
    }
    if (!chatId) {
      return reply.code(400).send({ success: false, error: 'chatId is required' })
    }

    const parsedInput = parseMessageSendPayload(body)
    if ('error' in parsedInput) {
      return reply.code(400).send({ success: false, error: parsedInput.error })
    }

    const origin = normalizeMessageSendOrigin(body.origin)
    if (!origin) {
      return reply.code(400).send({ success: false, error: 'invalid_origin' })
    }

    try {
      const record =
        parsedInput.kind === 'media'
          ? await deps.outboundService.enqueueMedia({
              sessionId,
              chatId,
              mediaType: parsedInput.media.mediaType,
              url: parsedInput.media.url,
              ...(parsedInput.media.mimeType ? { mimeType: parsedInput.media.mimeType } : {}),
              ...(parsedInput.media.fileName ? { fileName: parsedInput.media.fileName } : {}),
              ...(parsedInput.media.caption ? { caption: parsedInput.media.caption } : {}),
              ...(parsedInput.media.storagePolicy ? { storagePolicy: parsedInput.media.storagePolicy } : {}),
              idempotencyKey,
              origin
            })
          : parsedInput.kind === 'contact'
            ? await deps.outboundService.enqueueContact({
                sessionId,
                chatId,
                contacts: parsedInput.contact.contacts,
                ...(parsedInput.contact.displayName ? { displayName: parsedInput.contact.displayName } : {}),
                idempotencyKey,
                origin
              })
            : await deps.outboundService.enqueueText({
                sessionId,
                chatId,
                text: parsedInput.text,
                idempotencyKey,
                origin
              })

      void recordAudit(request, 'messages.send', sessionId, {
        outboundId: record.id,
        chatId: record.chatId,
        status: record.status,
        kind: parsedInput.kind,
        mediaType: parsedInput.kind === 'media' ? parsedInput.media.mediaType : null
      })

      return {
        success: true,
        message: record
      }
    } catch (error) {
      const mapped = mapMessageSendValidationError(error)
      if (mapped) {
        return reply.code(400).send({ success: false, error: mapped })
      }
      throw error
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: ChatListQuery
  }>('/sessions/:sessionId/chats', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatService) {
      return reply.code(501).send({ success: false, error: 'Chat service not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 50

    const chats = await deps.chatService.listChats(request.params.sessionId, safeLimit)
    void recordAudit(request, 'chats.list', request.params.sessionId, { count: chats.length })

    return {
      success: true,
      chats
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: ChatAiConfigListQuery
  }>('/sessions/:sessionId/chats/ai-configs', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatAiConfigStore) {
      return reply.code(501).send({ success: false, error: 'Chat AI config store not configured' })
    }

    const rawLimit = request.query?.limit
    const parsedLimit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof parsedLimit === 'number' && parsedLimit > 0
      ? Math.min(parsedLimit, 2000)
      : 2000

    const configs = await deps.chatAiConfigStore.listBySession(request.params.sessionId, safeLimit)
    void recordAudit(request, 'chats.ai_config.list', request.params.sessionId, { count: configs.length })

    return {
      success: true,
      configs
    }
  })

  app.post<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/chats/ai-configs/disable-all', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatAiConfigStore) {
      return reply.code(501).send({ success: false, error: 'Chat AI config store not configured' })
    }

    const result = await deps.chatAiConfigStore.setAllEnabledFromChatState(
      request.params.sessionId,
      false,
      'manual_bulk'
    )

    void recordAudit(request, 'chats.ai_config.disable_all', request.params.sessionId, result)

    return {
      success: true,
      enabled: false,
      ...result
    } satisfies ChatAiConfigBulkResult & { success: true; enabled: false }
  })

  app.post<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/chats/ai-configs/enable-all', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatAiConfigStore) {
      return reply.code(501).send({ success: false, error: 'Chat AI config store not configured' })
    }

    const result = await deps.chatAiConfigStore.setAllEnabledFromChatState(
      request.params.sessionId,
      true,
      'manual_bulk'
    )

    void recordAudit(request, 'chats.ai_config.enable_all', request.params.sessionId, result)

    return {
      success: true,
      enabled: true,
      ...result
    } satisfies ChatAiConfigBulkResult & { success: true; enabled: true }
  })

  app.get<{
    Params: SessionParams & { chatId: string }
    Querystring: ChatMessagesQuery
  }>('/sessions/:sessionId/chats/:chatId/messages', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatService) {
      return reply.code(501).send({ success: false, error: 'Chat service not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 200) : 50

    const rawBefore = request.query?.beforeMs
    const beforeMs = typeof rawBefore === 'string' ? Number(rawBefore) : rawBefore

    const messages = await deps.chatService.listMessages(request.params.sessionId, request.params.chatId, {
      limit: safeLimit,
      beforeMs: typeof beforeMs === 'number' && Number.isFinite(beforeMs) ? beforeMs : undefined
    })

    void recordAudit(request, 'chats.messages', request.params.sessionId, {
      chatId: request.params.chatId,
      count: messages.length
    })

    return {
      success: true,
      chatId: request.params.chatId,
      messages
    }
  })

  app.get<{
    Params: SessionParams & { chatId: string; mediaRef: string }
    Querystring: AdminQuery
  }>('/sessions/:sessionId/chats/:chatId/messages/:mediaRef/media', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatMediaService) {
      return reply.code(501).send({ success: false, error: 'Chat media service not configured' })
    }

    const { sessionId, chatId, mediaRef } = request.params
    const startedAt = Date.now()

    try {
      const media = await deps.chatMediaService.getMedia(sessionId, chatId, mediaRef)
      const safeFileName = sanitizeContentDispositionFileName(media.fileName)

      reply
        .header('Content-Type', media.contentType)
        .header('Content-Length', String(media.buffer.byteLength))
        .header('Cache-Control', 'private, max-age=300')

      if (safeFileName) {
        reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(safeFileName)}`)
      }

      void recordAudit(request, 'chats.media', sessionId, {
        chatId,
        mediaRef,
        mediaType: media.mediaType,
        bytes: media.buffer.byteLength,
        elapsedMs: Date.now() - startedAt
      })

      return reply.send(media.buffer)
    } catch (error) {
      const mapped = mapChatMediaError(error)
      void recordAudit(request, 'chats.media', sessionId, {
        chatId,
        mediaRef,
        error: mapped.error,
        elapsedMs: Date.now() - startedAt
      })
      return reply.code(mapped.statusCode).send({ success: false, error: mapped.error })
    }
  })

  app.post<{
    Params: SessionParams & { chatId: string }
    Querystring: AdminQuery
  }>('/sessions/:sessionId/chats/:chatId/ai/followup/draft', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiService) {
      return reply.code(501).send({ success: false, error: 'AI service not configured' })
    }

    try {
      const result = await deps.aiService.createFollowUpDraft(request.params.sessionId, request.params.chatId, {
        ignoreGlobalAiToggle: true,
        ignoreChatAiToggle: true
      })
      void recordAudit(request, 'ai.followup.draft', request.params.sessionId, {
        chatId: request.params.chatId
      })

      return {
        success: true,
        draft: {
          text: result.text
        },
        meta: result.meta
      }
    } catch (error) {
      if (error instanceof FollowUpBlockedError) {
        void recordAudit(request, 'ai.followup.blocked', request.params.sessionId, {
          chatId: request.params.chatId,
          reason: error.reason
        })
        return reply.code(409).send({
          success: false,
          error: 'followup_blocked',
          reason: error.reason,
          message: error.message
        })
      }

      app.log.warn({ err: error }, 'Follow-up draft failed')
      void recordAudit(request, 'ai.followup.draft_failed', request.params.sessionId, {
        chatId: request.params.chatId
      })
      return reply.code(500).send({ success: false, error: 'followup_draft_failed' })
    }
  })

  app.post<{
    Params: SessionParams & { chatId: string }
    Querystring: AdminQuery
    Body: FollowUpSendBody
  }>('/sessions/:sessionId/chats/:chatId/ai/followup/send', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiService) {
      return reply.code(501).send({ success: false, error: 'AI service not configured' })
    }

    const text = request.body?.text?.trim()
    const idempotencyKey = request.body?.idempotencyKey?.trim() || undefined

    if (!text) {
      return reply.code(400).send({ success: false, error: 'text_required' })
    }

    try {
      const message = await deps.aiService.sendFollowUp(
        request.params.sessionId,
        request.params.chatId,
        text,
        idempotencyKey,
        {
          ignoreGlobalAiToggle: true,
          ignoreChatAiToggle: true
        }
      )

      void recordAudit(request, 'ai.followup.send', request.params.sessionId, {
        chatId: request.params.chatId,
        outboundId: message.id
      })

      return {
        success: true,
        message
      }
    } catch (error) {
      if (error instanceof FollowUpBlockedError) {
        void recordAudit(request, 'ai.followup.blocked', request.params.sessionId, {
          chatId: request.params.chatId,
          reason: error.reason
        })
        return reply.code(409).send({
          success: false,
          error: 'followup_blocked',
          reason: error.reason,
          message: error.message
        })
      }

      app.log.warn({ err: error }, 'Follow-up send failed')
      void recordAudit(request, 'ai.followup.send_failed', request.params.sessionId, {
        chatId: request.params.chatId
      })
      return reply.code(500).send({ success: false, error: 'followup_send_failed' })
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/ai-training/session', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.trainingCopilotService) {
      return reply.code(501).send({ success: false, error: 'Training copilot not configured' })
    }

    const session = await deps.trainingCopilotService.getSession(request.params.sessionId)
    const credits = deps.creditsService
      ? await deps.creditsService.get(request.params.sessionId).catch(() => null)
      : null

    void recordAudit(request, 'ai.training.session.get', request.params.sessionId, {
      messages: session.messages.length,
      hasPendingProposal: Boolean(session.pendingProposal)
    })

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        proposalSeq: session.proposalSeq,
        decisionsCount: session.decisions.length,
        createdAtMs: session.createdAtMs,
        updatedAtMs: session.updatedAtMs
      },
      messages: session.messages,
      pendingProposal: session.pendingProposal,
      decisions: session.decisions,
      credits
    }
  })

  app.post<{
    Params: SessionParams
    Querystring: AdminQuery
    Body: TrainingCopilotSessionBody
  }>('/sessions/:sessionId/ai-training/session', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.trainingCopilotService) {
      return reply.code(501).send({ success: false, error: 'Training copilot not configured' })
    }

    const shouldReset = request.body?.reset === true
    const session = shouldReset
      ? await deps.trainingCopilotService.resetSession(request.params.sessionId)
      : await deps.trainingCopilotService.getSession(request.params.sessionId)
    const credits = deps.creditsService
      ? await deps.creditsService.get(request.params.sessionId).catch(() => null)
      : null

    void recordAudit(request, 'ai.training.session.post', request.params.sessionId, {
      reset: shouldReset
    })

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        proposalSeq: session.proposalSeq,
        decisionsCount: session.decisions.length,
        createdAtMs: session.createdAtMs,
        updatedAtMs: session.updatedAtMs
      },
      messages: session.messages,
      pendingProposal: session.pendingProposal,
      decisions: session.decisions,
      credits
    }
  })

  app.delete<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/sessions/:sessionId/ai-training/session', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.trainingCopilotService) {
      return reply.code(501).send({ success: false, error: 'Training copilot not configured' })
    }

    await deps.trainingCopilotService.deleteSession(request.params.sessionId)
    const session = await deps.trainingCopilotService.getSession(request.params.sessionId)
    const credits = deps.creditsService
      ? await deps.creditsService.get(request.params.sessionId).catch(() => null)
      : null

    void recordAudit(request, 'ai.training.session.delete', request.params.sessionId)

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        proposalSeq: session.proposalSeq,
        decisionsCount: session.decisions.length,
        createdAtMs: session.createdAtMs,
        updatedAtMs: session.updatedAtMs
      },
      messages: session.messages,
      pendingProposal: session.pendingProposal,
      decisions: session.decisions,
      credits
    }
  })

  app.post<{
    Params: SessionParams
    Querystring: AdminQuery
    Body: TrainingCopilotMessageBody
  }>('/sessions/:sessionId/ai-training/message', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.trainingCopilotService) {
      return reply.code(501).send({ success: false, error: 'Training copilot not configured' })
    }

    const message = request.body?.message?.trim()
    if (!message) {
      return reply.code(400).send({ success: false, error: 'message_required' })
    }

    const currentTraining = request.body?.currentTraining
    if (!isRecord(currentTraining) || !isRecord(currentTraining.instructions)) {
      return reply.code(400).send({ success: false, error: 'current_training_required' })
    }

    try {
      const result = await deps.trainingCopilotService.sendMessage(request.params.sessionId, {
        message,
        currentTraining
      })
      const credits = deps.creditsService
        ? await deps.creditsService.get(request.params.sessionId).catch(() => null)
        : null

      void recordAudit(request, 'ai.training.message', request.params.sessionId, {
        hasPendingProposal: Boolean(result.pendingProposal),
        messages: result.session.messages.length
      })

      return {
        success: true,
        assistantMessage: result.assistantMessage,
        pendingProposal: result.pendingProposal,
        session: {
          sessionId: result.session.sessionId,
          proposalSeq: result.session.proposalSeq,
          decisionsCount: result.session.decisions.length,
          createdAtMs: result.session.createdAtMs,
          updatedAtMs: result.session.updatedAtMs
        },
        messages: result.session.messages,
        decisions: result.session.decisions,
        credits
      }
    } catch (error) {
      if (error instanceof TrainingCopilotBlockedError) {
        void recordAudit(request, 'ai.training.blocked', request.params.sessionId, {
          reason: error.reason
        })
        return reply.code(409).send({
          success: false,
          error: 'training_copilot_blocked',
          reason: error.reason,
          message: error.message
        })
      }

      app.log.warn({ err: error }, 'Training copilot message failed')
      void recordAudit(request, 'ai.training.message_failed', request.params.sessionId)
      return reply.code(500).send({ success: false, error: 'training_copilot_message_failed' })
    }
  })

  app.post<{
    Params: SessionParams & { proposalId: string }
    Querystring: AdminQuery
    Body: TrainingCopilotProposalDecisionBody
  }>('/sessions/:sessionId/ai-training/proposals/:proposalId/accept', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.trainingCopilotService) {
      return reply.code(501).send({ success: false, error: 'Training copilot not configured' })
    }

    const actorRole = normalizeDecisionActorRole(request.body?.actorRole ?? undefined)
    const actorUidRaw = parseNullableString(request.body?.actorUid)
    const actorUid = typeof actorUidRaw === 'string' && actorUidRaw.trim() ? actorUidRaw.trim() : null

    const session = await deps.trainingCopilotService.acceptProposal(
      request.params.sessionId,
      request.params.proposalId,
      {
        actorRole: actorRole ?? null,
        actorUid
      }
    )

    if (!session) {
      return reply.code(404).send({ success: false, error: 'proposal_not_found' })
    }

    void recordAudit(request, 'ai.training.proposal.accept', request.params.sessionId, {
      proposalId: request.params.proposalId,
      actorRole: actorRole ?? null
    })

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        proposalSeq: session.proposalSeq,
        decisionsCount: session.decisions.length,
        createdAtMs: session.createdAtMs,
        updatedAtMs: session.updatedAtMs
      },
      messages: session.messages,
      pendingProposal: session.pendingProposal,
      decisions: session.decisions
    }
  })

  app.post<{
    Params: SessionParams & { proposalId: string }
    Querystring: AdminQuery
    Body: TrainingCopilotProposalDecisionBody
  }>('/sessions/:sessionId/ai-training/proposals/:proposalId/reject', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.trainingCopilotService) {
      return reply.code(501).send({ success: false, error: 'Training copilot not configured' })
    }

    const actorRole = normalizeDecisionActorRole(request.body?.actorRole ?? undefined)
    const actorUidRaw = parseNullableString(request.body?.actorUid)
    const actorUid = typeof actorUidRaw === 'string' && actorUidRaw.trim() ? actorUidRaw.trim() : null

    const session = await deps.trainingCopilotService.rejectProposal(
      request.params.sessionId,
      request.params.proposalId,
      {
        actorRole: actorRole ?? null,
        actorUid
      }
    )

    if (!session) {
      return reply.code(404).send({ success: false, error: 'proposal_not_found' })
    }

    void recordAudit(request, 'ai.training.proposal.reject', request.params.sessionId, {
      proposalId: request.params.proposalId,
      actorRole: actorRole ?? null
    })

    return {
      success: true,
      session: {
        sessionId: session.sessionId,
        proposalSeq: session.proposalSeq,
        decisionsCount: session.decisions.length,
        createdAtMs: session.createdAtMs,
        updatedAtMs: session.updatedAtMs
      },
      messages: session.messages,
      pendingProposal: session.pendingProposal,
      decisions: session.decisions
    }
  })

  app.get<{
    Params: SessionParams & { chatId: string }
    Querystring: AdminQuery
  }>('/sessions/:sessionId/chats/:chatId/ai-config', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatAiConfigStore) {
      return reply.code(501).send({ success: false, error: 'Chat AI config store not configured' })
    }

    const config = await deps.chatAiConfigStore.get(request.params.sessionId, request.params.chatId)
    void recordAudit(request, 'chats.ai_config.get', request.params.sessionId, {
      chatId: request.params.chatId
    })

    return {
      success: true,
      config:
        config ?? {
          sessionId: request.params.sessionId,
          chatId: request.params.chatId,
          aiEnabled: true,
          disabledReason: null,
          disabledAt: null
        }
    }
  })

  app.post<{
    Params: SessionParams & { chatId: string }
    Querystring: AdminQuery
    Body: ChatAiConfigBody
  }>('/sessions/:sessionId/chats/:chatId/ai-config', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatAiConfigStore) {
      return reply.code(501).send({ success: false, error: 'Chat AI config store not configured' })
    }

    const aiEnabled = request.body?.aiEnabled
    if (typeof aiEnabled !== 'boolean') {
      return reply.code(400).send({ success: false, error: 'aiEnabled must be boolean' })
    }

    const config = await deps.chatAiConfigStore.setEnabled(
      request.params.sessionId,
      request.params.chatId,
      aiEnabled,
      'manual'
    )
    void recordAudit(request, 'chats.ai_config.set', request.params.sessionId, {
      chatId: request.params.chatId,
      aiEnabled
    })

    return {
      success: true,
      config
    }
  })

  app.post<{
    Params: SessionParams & { chatId: string }
    Body: ChatReadBody
  }>('/sessions/:sessionId/chats/:chatId/read', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatService) {
      return reply.code(501).send({ success: false, error: 'Chat service not configured' })
    }

    await deps.chatService.markRead(request.params.sessionId, request.params.chatId)
    void recordAudit(request, 'chats.read', request.params.sessionId, { chatId: request.params.chatId })

    return {
      success: true
    }
  })

  app.post<{
    Params: SessionParams & { chatId: string }
  }>('/sessions/:sessionId/chats/:chatId/unread', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatService) {
      return reply.code(501).send({ success: false, error: 'Chat service not configured' })
    }

    await deps.chatService.markUnread(request.params.sessionId, request.params.chatId)
    void recordAudit(request, 'chats.unread', request.params.sessionId, { chatId: request.params.chatId })

    return {
      success: true
    }
  })

  app.delete<{
    Params: SessionParams & { chatId: string }
    Querystring: AdminQuery
  }>('/sessions/:sessionId/chats/:chatId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatDeleteService) {
      return reply.code(501).send({ success: false, error: 'Chat delete service not configured' })
    }

    const report = await deps.chatDeleteService.deleteChat(request.params.sessionId, request.params.chatId)
    void recordAudit(request, 'chats.delete', request.params.sessionId, {
      chatId: request.params.chatId,
      success: report.success,
      postgresDeleted: report.postgres.totalRowsDeleted,
      redisKeysDeleted: report.redis.totalKeysDeleted,
      redisSetMembersRemoved: report.redis.totalSetMembersRemoved,
      storageDeleted: report.storage.deleted,
      storageFailed: report.storage.failed
    })

    if (!report.success) {
      return reply.code(500).send({ success: false, error: 'chat_delete_failed', report })
    }

    return {
      success: true,
      chatId: request.params.chatId,
      report
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: ChatLabelsQuery
  }>('/sessions/:sessionId/labels', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatLabelStore) {
      return reply.code(501).send({ success: false, error: 'Chat label store not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && Number.isFinite(limit) ? limit : 200

    const labels = await deps.chatLabelStore.listBySession(request.params.sessionId, safeLimit)
    void recordAudit(request, 'labels.list', request.params.sessionId, { count: labels.length })

    return {
      success: true,
      labels
    }
  })

  app.post<{
    Params: SessionParams
    Body: ChatLabelBody
  }>('/sessions/:sessionId/labels', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatLabelStore) {
      return reply.code(501).send({ success: false, error: 'Chat label store not configured' })
    }

    const name = typeof request.body?.name === 'string' ? request.body.name : ''
    const colorHex = typeof request.body?.colorHex === 'string' ? request.body.colorHex : ''

    try {
      const label = await deps.chatLabelStore.create({
        sessionId: request.params.sessionId,
        id: crypto.randomUUID(),
        name,
        colorHex
      })

      void recordAudit(request, 'labels.create', request.params.sessionId, {
        labelId: label.id,
        name: label.name
      })

      return {
        success: true,
        label
      }
    } catch (error) {
      const mapped = mapChatLabelStoreError(error)
      if (mapped) {
        return reply.code(mapped.statusCode).send({ success: false, error: mapped.error })
      }
      throw error
    }
  })

  app.patch<{
    Params: SessionParams & { labelId: string }
    Body: ChatLabelBody
  }>('/sessions/:sessionId/labels/:labelId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatLabelStore) {
      return reply.code(501).send({ success: false, error: 'Chat label store not configured' })
    }

    const labelId = request.params.labelId.trim()
    if (!labelId) {
      return reply.code(404).send({ success: false, error: 'label_not_found' })
    }

    const name = typeof request.body?.name === 'string' ? request.body.name : ''
    const colorHex = typeof request.body?.colorHex === 'string' ? request.body.colorHex : ''

    try {
      const label = await deps.chatLabelStore.update({
        sessionId: request.params.sessionId,
        id: labelId,
        name,
        colorHex
      })
      if (!label) {
        return reply.code(404).send({ success: false, error: 'label_not_found' })
      }

      void recordAudit(request, 'labels.update', request.params.sessionId, {
        labelId: label.id,
        name: label.name
      })

      return {
        success: true,
        label
      }
    } catch (error) {
      const mapped = mapChatLabelStoreError(error)
      if (mapped) {
        return reply.code(mapped.statusCode).send({ success: false, error: mapped.error })
      }
      throw error
    }
  })

  app.delete<{
    Params: SessionParams & { labelId: string }
  }>('/sessions/:sessionId/labels/:labelId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatLabelStore) {
      return reply.code(501).send({ success: false, error: 'Chat label store not configured' })
    }

    const labelId = request.params.labelId.trim()
    if (!labelId) {
      return reply.code(404).send({ success: false, error: 'label_not_found' })
    }

    const deleted = await deps.chatLabelStore.delete(request.params.sessionId, labelId)
    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'label_not_found' })
    }

    void recordAudit(request, 'labels.delete', request.params.sessionId, { labelId })

    return {
      success: true
    }
  })

  app.put<{
    Params: SessionParams & { chatId: string }
    Body: ChatLabelAssignmentsBody
  }>('/sessions/:sessionId/chats/:chatId/labels', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.chatLabelStore) {
      return reply.code(501).send({ success: false, error: 'Chat label store not configured' })
    }

    if (request.body?.labelIds !== undefined && !Array.isArray(request.body.labelIds)) {
      return reply.code(400).send({ success: false, error: 'label_ids_invalid' })
    }
    const labelIds = normalizeStringArray(request.body?.labelIds)

    try {
      const labels = await deps.chatLabelStore.setChatLabels(
        request.params.sessionId,
        request.params.chatId,
        labelIds
      )

      void recordAudit(request, 'chats.labels.set', request.params.sessionId, {
        chatId: request.params.chatId,
        count: labels.length
      })

      return {
        success: true,
        chatId: request.params.chatId,
        labels
      }
    } catch (error) {
      const mapped = mapChatLabelStoreError(error)
      if (mapped) {
        return reply.code(mapped.statusCode).send({ success: false, error: mapped.error })
      }
      throw error
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: QuickRepliesQuery
  }>('/sessions/:sessionId/quick-replies', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.quickReplyStore) {
      return reply.code(501).send({ success: false, error: 'Quick reply store not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && Number.isFinite(limit) ? limit : 200

    const quickReplies = await deps.quickReplyStore.listBySession(request.params.sessionId, safeLimit)
    void recordAudit(request, 'quick_replies.list', request.params.sessionId, { count: quickReplies.length })

    return {
      success: true,
      quickReplies
    }
  })

  app.post<{
    Params: SessionParams
    Body: QuickReplyBody
  }>('/sessions/:sessionId/quick-replies', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.quickReplyStore) {
      return reply.code(501).send({ success: false, error: 'Quick reply store not configured' })
    }

    const shortcut = typeof request.body?.shortcut === 'string' ? request.body.shortcut : ''
    const content = typeof request.body?.content === 'string' ? request.body.content : ''

    try {
      const quickReply = await deps.quickReplyStore.create({
        sessionId: request.params.sessionId,
        id: crypto.randomUUID(),
        shortcut,
        content
      })

      void recordAudit(request, 'quick_replies.create', request.params.sessionId, {
        quickReplyId: quickReply.id,
        shortcut: quickReply.shortcut
      })

      return {
        success: true,
        quickReply
      }
    } catch (error) {
      const mapped = mapQuickReplyStoreError(error)
      if (mapped) {
        return reply.code(mapped.statusCode).send({ success: false, error: mapped.error })
      }
      throw error
    }
  })

  app.patch<{
    Params: SessionParams & { quickReplyId: string }
    Body: QuickReplyBody
  }>('/sessions/:sessionId/quick-replies/:quickReplyId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.quickReplyStore) {
      return reply.code(501).send({ success: false, error: 'Quick reply store not configured' })
    }

    const quickReplyId = request.params.quickReplyId.trim()
    if (!quickReplyId) {
      return reply.code(404).send({ success: false, error: 'quick_reply_not_found' })
    }

    const shortcut = typeof request.body?.shortcut === 'string' ? request.body.shortcut : ''
    const content = typeof request.body?.content === 'string' ? request.body.content : ''

    try {
      const quickReply = await deps.quickReplyStore.update({
        sessionId: request.params.sessionId,
        id: quickReplyId,
        shortcut,
        content
      })
      if (!quickReply) {
        return reply.code(404).send({ success: false, error: 'quick_reply_not_found' })
      }

      void recordAudit(request, 'quick_replies.update', request.params.sessionId, {
        quickReplyId: quickReply.id,
        shortcut: quickReply.shortcut
      })

      return {
        success: true,
        quickReply
      }
    } catch (error) {
      const mapped = mapQuickReplyStoreError(error)
      if (mapped) {
        return reply.code(mapped.statusCode).send({ success: false, error: mapped.error })
      }
      throw error
    }
  })

  app.delete<{
    Params: SessionParams & { quickReplyId: string }
  }>('/sessions/:sessionId/quick-replies/:quickReplyId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.quickReplyStore) {
      return reply.code(501).send({ success: false, error: 'Quick reply store not configured' })
    }

    const quickReplyId = request.params.quickReplyId.trim()
    if (!quickReplyId) {
      return reply.code(404).send({ success: false, error: 'quick_reply_not_found' })
    }

    const deleted = await deps.quickReplyStore.delete(request.params.sessionId, quickReplyId)
    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'quick_reply_not_found' })
    }
    void recordAudit(request, 'quick_replies.delete', request.params.sessionId, { quickReplyId })

    return {
      success: true
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: LeadListQuery
  }>('/sessions/:sessionId/leads', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }

    const rawLimit = request.query?.limit
    const search = typeof request.query?.search === 'string' ? request.query.search.trim() : ''
    const hasSearch = search.length > 0
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = hasSearch
      ? 50
      : typeof limit === 'number' && limit > 0
        ? Math.min(limit, 2000)
        : 500

    if (hasSearch && countUsefulEntitySearchChars(search) < 2) {
      return reply.code(400).send({ success: false, error: 'lead_search_too_short' })
    }

    if (hasSearch) {
      const [leads, total, matchedTotal] = await Promise.all([
        deps.leadStore.searchBySession(request.params.sessionId, search, safeLimit),
        deps.leadStore.countBySession(request.params.sessionId),
        deps.leadStore.countSearchBySession(request.params.sessionId, search)
      ])
      void recordAudit(request, 'leads.list', request.params.sessionId, {
        count: leads.length,
        total,
        matchedTotal,
        search
      })

      return {
        success: true,
        leads,
        total,
        matchedTotal,
        search
      }
    }

    const [leads, total] = await Promise.all([
      deps.leadStore.listBySession(request.params.sessionId, safeLimit),
      deps.leadStore.countBySession(request.params.sessionId)
    ])
    void recordAudit(request, 'leads.list', request.params.sessionId, {
      count: leads.length,
      total
    })

    return {
      success: true,
      leads,
      total
    }
  })

  app.post<{
    Params: SessionParams
    Body: LeadCreateBody
  }>('/sessions/:sessionId/leads', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }

    const rawStatus = request.body?.status
    const normalizedStatus = normalizeLeadStatus(rawStatus)
    if (rawStatus !== undefined && normalizedStatus === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_status' })
    }

    const rawName = parseNullableString(request.body?.name)
    const name = typeof rawName === 'string' ? (rawName.trim() ? rawName.trim() : null) : rawName
    const rawWhatsapp = parseNullableString(request.body?.whatsapp)
    const whatsapp = typeof rawWhatsapp === 'string' ? (rawWhatsapp.trim() ? rawWhatsapp.trim() : null) : rawWhatsapp
    const aiTag = sanitizeLeadTag(request.body?.aiTag)
    const nextContactAtMs = parseTimestampMs(request.body?.nextContactAt)
    const rawObservations = parseNullableString(request.body?.observations)
    const observations =
      typeof rawObservations === 'string'
        ? rawObservations.trim()
          ? rawObservations.trim()
          : null
        : rawObservations

    if (!name && !whatsapp) {
      return reply.code(400).send({ success: false, error: 'lead_create_required' })
    }

    const leadId = crypto.randomUUID()
    const lead = await deps.leadStore.upsertFromClient({
      sessionId: request.params.sessionId,
      leadId,
      name,
      whatsapp,
      aiTag,
      status: normalizedStatus ?? 'novo',
      nextContactAtMs,
      observations,
      source: 'manual'
    })

    void recordAudit(request, 'leads.create', request.params.sessionId, {
      leadId
    })

    return {
      success: true,
      lead
    }
  })

  app.post<{
    Params: SessionParams
    Body: LeadImportBody
  }>('/sessions/:sessionId/leads/import', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }

    if (!Array.isArray(request.body?.contacts) || request.body.contacts.length === 0) {
      return reply.code(400).send({ success: false, error: 'lead_import_contacts_required' })
    }

    const contacts = request.body.contacts.slice(0, 5000)
    const applyTag = sanitizeLeadTag(request.body?.applyTag)
    const updateExisting = request.body?.updateExisting !== false

    const summary = {
      total: contacts.length,
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0
    }
    const invalidRows: Array<{ index: number; error: string }> = []

    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index] ?? {}

      const rawStatus = contact.status
      const status = normalizeLeadStatus(rawStatus)
      if (rawStatus !== undefined && status === undefined) {
        summary.invalid += 1
        invalidRows.push({ index, error: 'invalid_status' })
        continue
      }

      const rawName = parseNullableString(contact.name)
      const name = typeof rawName === 'string' ? (rawName.trim() ? rawName.trim() : null) : rawName
      const rawWhatsapp = parseNullableString(contact.whatsapp)
      const whatsapp = typeof rawWhatsapp === 'string' ? (rawWhatsapp.trim() ? rawWhatsapp.trim() : null) : rawWhatsapp
      const nextContactAtMs = parseTimestampMs(contact.nextContactAt)
      const rawObservations = parseNullableString(contact.observations)
      const observations =
        typeof rawObservations === 'string'
          ? rawObservations.trim()
            ? rawObservations.trim()
            : null
          : rawObservations
      const aiTagFromContact = sanitizeLeadTag(contact.aiTag)
      const aiTag = applyTag !== undefined ? applyTag : aiTagFromContact

      if (!name && !whatsapp) {
        summary.invalid += 1
        invalidRows.push({ index, error: 'lead_create_required' })
        continue
      }

      const existing = whatsapp
        ? await deps.leadStore.findByChatOrWhatsapp(request.params.sessionId, null, whatsapp)
        : null

      if (existing) {
        if (!updateExisting) {
          summary.skipped += 1
          continue
        }

        const payload = {
          ...(name !== undefined ? { name } : {}),
          ...(whatsapp !== undefined ? { whatsapp } : {}),
          ...(status ? { status } : {}),
          ...(nextContactAtMs !== undefined ? { nextContact: nextContactAtMs } : {}),
          ...(observations !== undefined ? { observations } : {}),
          ...(aiTag !== undefined ? { aiTag } : {})
        }

        if (Object.keys(payload).length === 0) {
          summary.skipped += 1
          continue
        }

        const updated = await deps.leadStore.update(request.params.sessionId, existing.id, payload)
        if (updated) {
          summary.updated += 1
        } else {
          summary.skipped += 1
        }
        continue
      }

      await deps.leadStore.upsertFromClient({
        sessionId: request.params.sessionId,
        leadId: crypto.randomUUID(),
        name,
        whatsapp,
        status: status ?? 'novo',
        nextContactAtMs,
        observations,
        aiTag: aiTag ?? null,
        source: 'import'
      })

      summary.created += 1
    }

    void recordAudit(request, 'leads.import', request.params.sessionId, {
      ...summary,
      updateExisting
    })

    return {
      success: true,
      summary,
      invalidRows
    }
  })

  app.patch<{
    Params: SessionParams & { leadId: string }
    Body: LeadUpdateBody
  }>('/sessions/:sessionId/leads/:leadId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }

    const rawStatus = request.body?.status
    const status = normalizeLeadStatus(rawStatus)
    if (rawStatus !== undefined && status === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_status' })
    }

    const rawName = parseNullableString(request.body?.name)
    const name = typeof rawName === 'string' ? (rawName.trim() ? rawName.trim() : null) : rawName
    const rawWhatsapp = parseNullableString(request.body?.whatsapp)
    const whatsapp = typeof rawWhatsapp === 'string' ? (rawWhatsapp.trim() ? rawWhatsapp.trim() : null) : rawWhatsapp
    const aiTag = sanitizeLeadTag(request.body?.aiTag)
    const nextContact = parseTimestampMs(request.body?.nextContactAt)
    const observations = parseNullableString(request.body?.observations)

    if (
      name === undefined &&
      whatsapp === undefined &&
      aiTag === undefined &&
      status === undefined &&
      nextContact === undefined &&
      observations === undefined
    ) {
      return reply.code(400).send({ success: false, error: 'lead_update_required' })
    }

    const updated = await deps.leadStore.update(request.params.sessionId, request.params.leadId, {
      ...(name !== undefined ? { name } : {}),
      ...(whatsapp !== undefined ? { whatsapp } : {}),
      ...(aiTag !== undefined ? { aiTag } : {}),
      ...(status ? { status } : {}),
      ...(nextContact !== undefined ? { nextContact } : {}),
      ...(observations !== undefined ? { observations } : {})
    })

    if (!updated) {
      return reply.code(404).send({ success: false, error: 'lead_not_found' })
    }

    void recordAudit(request, 'leads.update', request.params.sessionId, {
      leadId: request.params.leadId,
      status: status ?? null
    })

    return {
      success: true,
      lead: updated
    }
  })

  app.delete<{
    Params: SessionParams & { leadId: string }
  }>('/sessions/:sessionId/leads/:leadId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }

    await deps.leadStore.delete(request.params.sessionId, request.params.leadId)
    void recordAudit(request, 'leads.delete', request.params.sessionId, {
      leadId: request.params.leadId
    })

    return {
      success: true
    }
  })

  app.post<{
    Params: SessionParams & { leadId: string }
  }>('/sessions/:sessionId/leads/:leadId/convert', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }
    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }

    const result = await convertLeadToClient(request.params.sessionId, request.params.leadId, {
      leadStore: deps.leadStore,
      clientStore: deps.clientStore,
      conversionStore: deps.leadConversionStore,
      conversionSource: 'manual',
      logger: {
        warn: (message, meta) => app.log.warn(meta, message)
      }
    })

    if (!result) {
      return reply.code(404).send({ success: false, error: 'lead_not_found' })
    }

    void recordAudit(request, 'leads.convert', request.params.sessionId, {
      leadId: request.params.leadId,
      clientId: result.client.id
    })

    return {
      success: true,
      client: result.client,
      deletedLeadId: result.deletedLeadId
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: ClientListQuery
  }>('/sessions/:sessionId/clients', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }

    const rawLimit = request.query?.limit
    const search = typeof request.query?.search === 'string' ? request.query.search.trim() : ''
    const hasSearch = search.length > 0
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = hasSearch
      ? 50
      : typeof limit === 'number' && limit > 0
        ? Math.min(limit, 2000)
        : 500

    if (hasSearch && countUsefulEntitySearchChars(search) < 2) {
      return reply.code(400).send({ success: false, error: 'client_search_too_short' })
    }

    if (hasSearch) {
      const [clients, total, matchedTotal] = await Promise.all([
        deps.clientStore.searchBySession(request.params.sessionId, search, safeLimit),
        deps.clientStore.countBySession(request.params.sessionId),
        deps.clientStore.countSearchBySession(request.params.sessionId, search)
      ])
      void recordAudit(request, 'clients.list', request.params.sessionId, {
        count: clients.length,
        total,
        matchedTotal,
        search
      })

      return {
        success: true,
        clients,
        total,
        matchedTotal,
        search
      }
    }

    const [clients, total] = await Promise.all([
      deps.clientStore.listBySession(request.params.sessionId, safeLimit),
      deps.clientStore.countBySession(request.params.sessionId)
    ])
    void recordAudit(request, 'clients.list', request.params.sessionId, {
      count: clients.length,
      total
    })

    return {
      success: true,
      clients,
      total
    }
  })

  app.post<{
    Params: SessionParams
    Body: ClientCreateBody
  }>('/sessions/:sessionId/clients', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }

    const rawStatus = request.body?.status
    const normalizedStatus = normalizeClientStatus(rawStatus)
    if (rawStatus !== undefined && normalizedStatus === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_status' })
    }
    if (normalizedStatus === 'lead') {
      return reply.code(400).send({ success: false, error: 'use_convert_endpoint' })
    }

    const rawName = parseNullableString(request.body?.name)
    const name = typeof rawName === 'string' ? (rawName.trim() ? rawName.trim() : null) : rawName
    const rawWhatsapp = parseNullableString(request.body?.whatsapp)
    const whatsapp = typeof rawWhatsapp === 'string' ? (rawWhatsapp.trim() ? rawWhatsapp.trim() : null) : rawWhatsapp
    const nextContactAtMs = parseTimestampMs(request.body?.nextContactAt)
    const rawObservations = parseNullableString(request.body?.observations)
    const observations =
      typeof rawObservations === 'string'
        ? rawObservations.trim()
          ? rawObservations.trim()
          : null
        : rawObservations

    if (!name && !whatsapp) {
      return reply.code(400).send({ success: false, error: 'client_create_required' })
    }

    const clientId = crypto.randomUUID()
    const client = await deps.clientStore.create({
      sessionId: request.params.sessionId,
      id: clientId,
      name: name ?? null,
      whatsapp: whatsapp ?? null,
      chatId: null,
      status: normalizedStatus ?? 'ativo',
      nextContactAt: nextContactAtMs,
      observations,
      source: 'manual'
    })

    void recordAudit(request, 'clients.create', request.params.sessionId, {
      clientId
    })

    return {
      success: true,
      client
    }
  })

  app.post<{
    Params: SessionParams
    Body: ClientImportBody
  }>('/sessions/:sessionId/clients/import', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }

    if (!Array.isArray(request.body?.contacts) || request.body.contacts.length === 0) {
      return reply.code(400).send({ success: false, error: 'client_import_contacts_required' })
    }

    const contacts = request.body.contacts.slice(0, 5000)
    const updateExisting = request.body?.updateExisting !== false
    const summary = {
      total: contacts.length,
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0
    }
    const invalidRows: Array<{ index: number; error: string }> = []

    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index] ?? {}
      const rawStatus = contact.status
      const status = normalizeClientStatus(rawStatus)

      if (rawStatus !== undefined && status === undefined) {
        summary.invalid += 1
        invalidRows.push({ index, error: 'invalid_status' })
        continue
      }
      if (status === 'lead') {
        summary.invalid += 1
        invalidRows.push({ index, error: 'use_convert_endpoint' })
        continue
      }

      const rawName = parseNullableString(contact.name)
      const name = typeof rawName === 'string' ? (rawName.trim() ? rawName.trim() : null) : rawName
      const rawWhatsapp = parseNullableString(contact.whatsapp)
      const whatsapp = typeof rawWhatsapp === 'string' ? (rawWhatsapp.trim() ? rawWhatsapp.trim() : null) : rawWhatsapp
      const nextContactAtMs = parseTimestampMs(contact.nextContactAt)
      const rawObservations = parseNullableString(contact.observations)
      const observations =
        typeof rawObservations === 'string'
          ? rawObservations.trim()
            ? rawObservations.trim()
            : null
          : rawObservations

      if (!name && !whatsapp) {
        summary.invalid += 1
        invalidRows.push({ index, error: 'client_create_required' })
        continue
      }

      const existing = whatsapp
        ? await deps.clientStore.findByChatOrWhatsapp(request.params.sessionId, null, whatsapp)
        : null

      if (existing && !updateExisting) {
        summary.skipped += 1
        continue
      }

      await deps.clientStore.create({
        sessionId: request.params.sessionId,
        id: existing?.id ?? crypto.randomUUID(),
        name: name ?? existing?.name ?? null,
        whatsapp: whatsapp ?? existing?.whatsapp ?? null,
        chatId: existing?.chatId ?? null,
        status: status ?? existing?.status ?? 'ativo',
        lastContactAt: existing?.lastContactAt ?? null,
        nextContactAt: nextContactAtMs !== undefined ? nextContactAtMs : existing?.nextContactAt ?? null,
        observations: observations !== undefined ? observations : existing?.observations ?? null,
        createdAt: existing?.createdAt ?? Date.now(),
        lastMessage: existing?.lastMessage ?? null,
        source: existing?.source ?? 'import',
        totalValue: existing?.totalValue ?? null,
        lastPurchaseAt: existing?.lastPurchaseAt ?? null
      })

      if (existing) {
        summary.updated += 1
      } else {
        summary.created += 1
      }
    }

    void recordAudit(request, 'clients.import', request.params.sessionId, {
      ...summary,
      updateExisting
    })

    return {
      success: true,
      summary,
      invalidRows
    }
  })

  app.patch<{
    Params: SessionParams & { clientId: string }
    Body: ClientUpdateBody
  }>('/sessions/:sessionId/clients/:clientId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }

    const rawStatus = request.body?.status
    const status = normalizeClientStatus(rawStatus)
    if (rawStatus !== undefined && status === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_status' })
    }
    if (status === 'lead') {
      return reply.code(400).send({ success: false, error: 'use_convert_endpoint' })
    }

    const nextContactAt = parseTimestampMs(request.body?.nextContactAt)
    const observations = parseNullableString(request.body?.observations)

    if (status === undefined && nextContactAt === undefined && observations === undefined) {
      return reply.code(400).send({ success: false, error: 'client_update_required' })
    }

    const updated = await deps.clientStore.update(request.params.sessionId, request.params.clientId, {
      ...(status ? { status } : {}),
      ...(nextContactAt !== undefined ? { nextContactAt } : {}),
      ...(observations !== undefined ? { observations } : {})
    })

    if (!updated) {
      return reply.code(404).send({ success: false, error: 'client_not_found' })
    }

    void recordAudit(request, 'clients.update', request.params.sessionId, {
      clientId: request.params.clientId,
      status: status ?? null
    })

    return {
      success: true,
      client: updated
    }
  })

  app.delete<{
    Params: SessionParams & { clientId: string }
  }>('/sessions/:sessionId/clients/:clientId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }

    await deps.clientStore.delete(request.params.sessionId, request.params.clientId)
    void recordAudit(request, 'clients.delete', request.params.sessionId, {
      clientId: request.params.clientId
    })

    return {
      success: true
    }
  })

  app.post<{
    Params: SessionParams & { clientId: string }
  }>('/sessions/:sessionId/clients/:clientId/convert', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.clientStore) {
      return reply.code(501).send({ success: false, error: 'Client store not configured' })
    }
    if (!deps.leadStore) {
      return reply.code(501).send({ success: false, error: 'Lead store not configured' })
    }

    const client = await deps.clientStore.get(request.params.sessionId, request.params.clientId)
    if (!client) {
      return reply.code(404).send({ success: false, error: 'client_not_found' })
    }

    let lead = await deps.leadStore.findByChatOrWhatsapp(
      request.params.sessionId,
      client.chatId ?? null,
      client.whatsapp ?? null
    )

    if (!lead) {
      const leadId = client.chatId ?? client.id
      lead = await deps.leadStore.upsertFromClient({
        sessionId: request.params.sessionId,
        leadId,
        name: client.name ?? 'Sem nome',
        whatsapp: client.whatsapp ?? null,
        chatId: client.chatId ?? null,
        status: 'novo',
        lastContactAtMs: client.lastContactAt ?? null,
        nextContactAtMs: client.nextContactAt ?? null,
        observations: client.observations ?? null,
        createdAtMs: client.createdAt ?? Date.now(),
        lastMessage: client.lastMessage ?? null,
        source: client.source ?? null
      })
    }

    await deps.clientStore.delete(request.params.sessionId, request.params.clientId)
    void recordAudit(request, 'clients.convert', request.params.sessionId, {
      clientId: request.params.clientId,
      leadId: lead.id
    })

    return {
      success: true,
      lead,
      deletedClientId: request.params.clientId
    }
  })

  app.get<{
    Params: SessionParams
  }>('/sessions/:sessionId/broadcast-lists', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const lists = await deps.broadcastListStore.listLists(request.params.sessionId)
    void recordAudit(request, 'broadcast_lists.list', request.params.sessionId, { count: lists.length })

    return {
      success: true,
      lists
    }
  })

  app.post<{
    Params: SessionParams
    Body: BroadcastListBody
  }>('/sessions/:sessionId/broadcast-lists', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const name = request.body?.name?.trim()
    if (!name) {
      return reply.code(400).send({ success: false, error: 'name is required' })
    }

    const listId = crypto.randomUUID()
    const list = await deps.broadcastListStore.createList(request.params.sessionId, listId, name)
    void recordAudit(request, 'broadcast_lists.create', request.params.sessionId, { listId: list.id, name })

    return {
      success: true,
      list
    }
  })

  app.patch<{
    Params: SessionParams & { listId: string }
    Body: BroadcastListBody
  }>('/sessions/:sessionId/broadcast-lists/:listId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const name = request.body?.name?.trim()
    if (!name) {
      return reply.code(400).send({ success: false, error: 'name is required' })
    }

    const list = await deps.broadcastListStore.updateList(request.params.sessionId, request.params.listId, name)
    if (!list) {
      return reply.code(404).send({ success: false, error: 'broadcast_list_not_found' })
    }

    void recordAudit(request, 'broadcast_lists.update', request.params.sessionId, { listId: list.id, name })
    return {
      success: true,
      list
    }
  })

  app.delete<{
    Params: SessionParams & { listId: string }
  }>('/sessions/:sessionId/broadcast-lists/:listId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    await deps.broadcastListStore.deleteList(request.params.sessionId, request.params.listId)
    void recordAudit(request, 'broadcast_lists.delete', request.params.sessionId, { listId: request.params.listId })

    return {
      success: true
    }
  })

  app.get<{
    Params: SessionParams & { listId: string }
    Querystring: BroadcastContactsQuery
  }>('/sessions/:sessionId/broadcast-lists/:listId/contacts', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 5000) : 5000

    const contacts = await deps.broadcastListStore.listContacts(request.params.sessionId, request.params.listId, safeLimit)
    void recordAudit(request, 'broadcast_contacts.list', request.params.sessionId, {
      listId: request.params.listId,
      count: contacts.length
    })

    return {
      success: true,
      contacts
    }
  })

  app.post<{
    Params: SessionParams & { listId: string }
    Body: BroadcastContactBody
  }>('/sessions/:sessionId/broadcast-lists/:listId/contacts', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const whatsapp = request.body?.whatsapp?.trim()
    if (!whatsapp) {
      return reply.code(400).send({ success: false, error: 'whatsapp is required' })
    }

    const contactId = crypto.randomUUID()
    try {
      const contact = await deps.broadcastListStore.upsertContact({
        sessionId: request.params.sessionId,
        listId: request.params.listId,
        contactId,
        name: request.body?.name ?? null,
        whatsapp
      })

      void recordAudit(request, 'broadcast_contacts.upsert', request.params.sessionId, {
        listId: request.params.listId,
        contactId: contact.id
      })

      return {
        success: true,
        contact
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'broadcast_list_contacts_limit_exceeded') {
        return reply.code(400).send({ success: false, error: message })
      }
      if (message === 'invalid_whatsapp' || message === 'invalid_default_country_code') {
        return reply.code(400).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.post<{
    Params: SessionParams & { listId: string }
    Body: BroadcastContactsBulkBody
  }>('/sessions/:sessionId/broadcast-lists/:listId/contacts/bulk', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const rows = Array.isArray(request.body?.contacts) ? request.body!.contacts! : []
    if (rows.length === 0) {
      return reply.code(400).send({ success: false, error: 'contacts is required' })
    }

    const contacts = rows.slice(0, 5000).map((row) => ({
      contactId: crypto.randomUUID(),
      name: row?.name ?? null,
      whatsapp: typeof row?.whatsapp === 'string' ? row.whatsapp : ''
    }))

    try {
      const result = await deps.broadcastListStore.upsertContactsBulk({
        sessionId: request.params.sessionId,
        listId: request.params.listId,
        contacts
      })

      void recordAudit(request, 'broadcast_contacts.bulk_upsert', request.params.sessionId, {
        listId: request.params.listId,
        inserted: result.inserted,
        updated: result.updated
      })

      return {
        success: true,
        ...result
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'broadcast_list_contacts_limit_exceeded') {
        return reply.code(400).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.patch<{
    Params: SessionParams & { listId: string; contactId: string }
    Body: BroadcastContactBody
  }>('/sessions/:sessionId/broadcast-lists/:listId/contacts/:contactId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    const update: { name?: string | null; whatsapp?: string } = {}
    if (request.body?.name !== undefined) {
      update.name = request.body.name ?? null
    }
    if (typeof request.body?.whatsapp === 'string' && request.body.whatsapp.trim()) {
      update.whatsapp = request.body.whatsapp
    }

    if (Object.keys(update).length === 0) {
      return reply.code(400).send({ success: false, error: 'contact_update_required' })
    }

    try {
      const contact = await deps.broadcastListStore.updateContact(
        request.params.sessionId,
        request.params.listId,
        request.params.contactId,
        update
      )
      if (!contact) {
        return reply.code(404).send({ success: false, error: 'broadcast_contact_not_found' })
      }

      void recordAudit(request, 'broadcast_contacts.update', request.params.sessionId, {
        listId: request.params.listId,
        contactId: request.params.contactId
      })

      return {
        success: true,
        contact
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'broadcast_contact_whatsapp_conflict') {
        return reply.code(409).send({ success: false, error: message })
      }
      if (message === 'invalid_whatsapp' || message === 'invalid_default_country_code') {
        return reply.code(400).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.delete<{
    Params: SessionParams & { listId: string; contactId: string }
  }>('/sessions/:sessionId/broadcast-lists/:listId/contacts/:contactId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast list store not configured' })
    }

    await deps.broadcastListStore.deleteContact(request.params.sessionId, request.params.listId, request.params.contactId)
    void recordAudit(request, 'broadcast_contacts.delete', request.params.sessionId, {
      listId: request.params.listId,
      contactId: request.params.contactId
    })

    return {
      success: true
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: BroadcastJobsQuery
  }>('/sessions/:sessionId/broadcasts', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastJobStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast job store not configured' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 200) : 25

    const jobs = await deps.broadcastJobStore.listJobs(request.params.sessionId, safeLimit)
    void recordAudit(request, 'broadcast_jobs.list', request.params.sessionId, { count: jobs.length })

    return {
      success: true,
      jobs
    }
  })

  app.post<{
    Params: SessionParams
    Body: BroadcastCreateBody
  }>('/sessions/:sessionId/broadcasts', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastJobStore || !deps.broadcastListStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast stores not configured' })
    }

    const listId = request.body?.listId?.trim()
    if (!listId) {
      return reply.code(400).send({ success: false, error: 'listId is required' })
    }

    const list = await deps.broadcastListStore.getList(request.params.sessionId, listId)
    if (!list) {
      return reply.code(404).send({ success: false, error: 'broadcast_list_not_found' })
    }

    const payload = buildBroadcastPayload(request.body)
    if (!payload) {
      return reply.code(400).send({ success: false, error: 'broadcast_message_required' })
    }

    const jobId = crypto.randomUUID()
    try {
      const job = await deps.broadcastJobStore.createJobFromList({
        sessionId: request.params.sessionId,
        jobId,
        listId,
        payload
      })

      void recordAudit(request, 'broadcast_jobs.create', request.params.sessionId, {
        jobId: job.id,
        listId,
        totalCount: job.totalCount
      })

      return {
        success: true,
        job
      }
    } catch (error) {
      const message = (error as Error).message
      if (message === 'broadcast_job_active_exists') {
        return reply.code(409).send({ success: false, error: message })
      }
      if (message === 'broadcast_contacts_limit_exceeded' || message === 'broadcast_list_empty') {
        return reply.code(400).send({ success: false, error: message })
      }
      throw error
    }
  })

  app.get<{
    Params: SessionParams & { jobId: string }
  }>('/sessions/:sessionId/broadcasts/:jobId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastJobStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast job store not configured' })
    }

    const job = await deps.broadcastJobStore.getJob(request.params.sessionId, request.params.jobId)
    if (!job) {
      return reply.code(404).send({ success: false, error: 'broadcast_job_not_found' })
    }

    const failures = await deps.broadcastJobStore.listFailures(request.params.sessionId, request.params.jobId, 5000)
    void recordAudit(request, 'broadcast_jobs.get', request.params.sessionId, {
      jobId: request.params.jobId,
      failures: failures.length
    })

    return {
      success: true,
      job,
      failures
    }
  })

  app.post<{
    Params: SessionParams & { jobId: string }
  }>('/sessions/:sessionId/broadcasts/:jobId/pause', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastJobStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast job store not configured' })
    }

    const job = await deps.broadcastJobStore.pauseJobById(request.params.sessionId, request.params.jobId, 'manual_pause')
    if (!job) {
      return reply.code(404).send({ success: false, error: 'broadcast_job_not_found_or_not_running' })
    }

    void recordAudit(request, 'broadcast_jobs.pause', request.params.sessionId, { jobId: request.params.jobId })

    return {
      success: true,
      job
    }
  })

  app.post<{
    Params: SessionParams & { jobId: string }
  }>('/sessions/:sessionId/broadcasts/:jobId/resume', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastJobStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast job store not configured' })
    }

    try {
      const job =
        (await deps.broadcastJobStore.resumeJob(request.params.sessionId, request.params.jobId)) ??
        (await deps.broadcastJobStore.resumeCancelledJobFromCancelledItems(request.params.sessionId, request.params.jobId))

      if (!job) {
        return reply.code(404).send({ success: false, error: 'broadcast_job_not_found_or_not_resumable' })
      }

      void recordAudit(request, 'broadcast_jobs.resume', request.params.sessionId, { jobId: request.params.jobId })

      return {
        success: true,
        job
      }
    } catch (error) {
      if ((error as Error).message === 'broadcast_job_active_exists') {
        return reply.code(409).send({ success: false, error: 'broadcast_job_active_exists' })
      }
      throw error
    }
  })

  app.post<{
    Params: SessionParams & { jobId: string }
  }>('/sessions/:sessionId/broadcasts/:jobId/cancel', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.broadcastJobStore) {
      return reply.code(501).send({ success: false, error: 'Broadcast job store not configured' })
    }

    const job = await deps.broadcastJobStore.cancelJob(request.params.sessionId, request.params.jobId)
    if (!job) {
      return reply.code(404).send({ success: false, error: 'broadcast_job_not_found_or_not_active' })
    }

    void recordAudit(request, 'broadcast_jobs.cancel', request.params.sessionId, { jobId: request.params.jobId })

    return {
      success: true,
      job
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AiSuggestionsQuery
  }>('/sessions/:sessionId/ai-suggestions', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.suggestionStore) {
      return reply.code(501).send({ success: false, error: 'Suggestion store not configured' })
    }

    const rawTargetType = request.query?.targetType
    const targetTypeNormalized = typeof rawTargetType === 'string' ? rawTargetType.trim().toLowerCase() : ''
    const targetType =
      targetTypeNormalized === 'lead' ? 'lead' : targetTypeNormalized === 'client' ? 'client' : undefined

    if (rawTargetType !== undefined && rawTargetType !== null && rawTargetType !== '' && !targetType) {
      return reply.code(400).send({ success: false, error: 'invalid_target_type' })
    }

    const rawStatus = request.query?.status
    const statusNormalized = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : ''
    const status =
      statusNormalized === 'accepted' ||
      statusNormalized === 'rejected' ||
      statusNormalized === 'pending' ||
      statusNormalized === 'all'
        ? statusNormalized
        : undefined

    if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '' && !status) {
      return reply.code(400).send({ success: false, error: 'invalid_status' })
    }

    const rawLimit = request.query?.limit
    const limit = typeof rawLimit === 'string' ? Number(rawLimit) : rawLimit
    const safeLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 500) : 100

    const statusFilter = (status ?? 'pending') as 'pending' | 'accepted' | 'rejected' | 'all'
    const suggestions = await deps.suggestionStore.listBySession(request.params.sessionId, {
      ...(targetType ? { targetType } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      limit: safeLimit
    })

    void recordAudit(request, 'ai.suggestions.list', request.params.sessionId, {
      count: suggestions.length,
      targetType: targetType ?? null,
      status: statusFilter
    })

    return {
      success: true,
      suggestions
    }
  })

  app.post<{
    Params: SessionParams & { suggestionId: string }
    Body: AiSuggestionAcceptBody
  }>('/sessions/:sessionId/ai-suggestions/:suggestionId/accept', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.suggestionStore) {
      return reply.code(501).send({ success: false, error: 'Suggestion store not configured' })
    }

    const suggestionId = Number(request.params.suggestionId)
    if (!Number.isInteger(suggestionId) || suggestionId <= 0) {
      return reply.code(400).send({ success: false, error: 'invalid_suggestion_id' })
    }

    const suggestion = await deps.suggestionStore.get(request.params.sessionId, suggestionId)
    if (!suggestion) {
      return reply.code(404).send({ success: false, error: 'suggestion_not_found' })
    }

    if (suggestion.status !== 'pending') {
      return reply.code(409).send({ success: false, error: 'suggestion_not_pending' })
    }

    const rawPatch = isRecord(request.body?.patch) ? request.body.patch : undefined
    const patchSource = rawPatch ?? suggestion.patch

    const patch: { status?: string; nextContactAt?: number | null; observations?: string | null } = {}

    const rawStatus = Object.prototype.hasOwnProperty.call(patchSource, 'status')
      ? (patchSource as any).status
      : undefined
    if (rawStatus !== undefined) {
      if (typeof rawStatus !== 'string') {
        return reply.code(400).send({ success: false, error: 'invalid_status' })
      }
      if (suggestion.targetType === 'lead') {
        const normalized = normalizeLeadStatus(rawStatus)
        if (!normalized || normalized === 'cliente') {
          return reply.code(400).send({ success: false, error: 'invalid_status' })
        }
        patch.status = normalized
      } else {
        const normalized = normalizeClientStatus(rawStatus)
        if (!normalized || normalized === 'lead') {
          return reply.code(400).send({ success: false, error: 'invalid_status' })
        }
        patch.status = normalized
      }
    }

    if (Object.prototype.hasOwnProperty.call(patchSource, 'nextContactAt')) {
      const nextContactAt = parseTimestampMs((patchSource as any).nextContactAt)
      if (nextContactAt === undefined) {
        return reply.code(400).send({ success: false, error: 'invalid_next_contact_at' })
      }
      patch.nextContactAt = nextContactAt
    }

    if (Object.prototype.hasOwnProperty.call(patchSource, 'observations')) {
      const observations = parseNullableString((patchSource as any).observations)
      if (observations === undefined) {
        return reply.code(400).send({ success: false, error: 'invalid_observations' })
      }
      patch.observations = observations
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ success: false, error: 'patch_required' })
    }

    const decisionSourceInput = request.body?.decisionSource
    const decisionSource = normalizeDecisionSource(decisionSourceInput)
    if (decisionSourceInput !== undefined && decisionSourceInput !== null && !decisionSource) {
      return reply.code(400).send({ success: false, error: 'invalid_decision_source' })
    }

    const decisionActorRoleInput = request.body?.decisionActorRole
    const decisionActorRole = normalizeDecisionActorRole(decisionActorRoleInput)
    if (decisionActorRoleInput !== undefined && decisionActorRoleInput !== null && !decisionActorRole) {
      return reply.code(400).send({ success: false, error: 'invalid_decision_actor_role' })
    }

    const decisionActorUid = parseNullableString(request.body?.decisionActorUid)
    if (request.body?.decisionActorUid !== undefined && decisionActorUid === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_decision_actor_uid' })
    }

    const decision = {
      source: decisionSource ?? 'manual',
      actorRole: decisionActorRole ?? null,
      actorUid: decisionActorUid ?? null
    }

    let updatedTarget: unknown = null
    if (suggestion.targetType === 'lead') {
      if (!deps.leadStore) {
        return reply.code(501).send({ success: false, error: 'Lead store not configured' })
      }

      const lead = await deps.leadStore.update(request.params.sessionId, suggestion.targetId, {
        ...(patch.status ? { status: patch.status as any } : {}),
        ...(patch.nextContactAt !== undefined ? { nextContact: patch.nextContactAt } : {}),
        ...(patch.observations !== undefined ? { observations: patch.observations } : {})
      })

      if (!lead) {
        return reply.code(404).send({ success: false, error: 'lead_not_found' })
      }

      updatedTarget = lead
    } else {
      if (!deps.clientStore) {
        return reply.code(501).send({ success: false, error: 'Client store not configured' })
      }

      const client = await deps.clientStore.update(request.params.sessionId, suggestion.targetId, {
        ...(patch.status ? { status: patch.status as any } : {}),
        ...(patch.nextContactAt !== undefined ? { nextContactAt: patch.nextContactAt } : {}),
        ...(patch.observations !== undefined ? { observations: patch.observations } : {})
      })

      if (!client) {
        return reply.code(404).send({ success: false, error: 'client_not_found' })
      }

      updatedTarget = client
    }

    const accepted = await deps.suggestionStore.markAccepted(request.params.sessionId, suggestionId, patch, decision)
    if (!accepted) {
      return reply.code(409).send({ success: false, error: 'suggestion_not_pending' })
    }

    void recordAudit(request, 'ai.suggestions.accept', request.params.sessionId, {
      suggestionId,
      targetType: suggestion.targetType,
      targetId: suggestion.targetId,
      decisionSource: decision.source,
      decisionActorRole: decision.actorRole,
      decisionActorUid: decision.actorUid
    })

    return {
      success: true,
      suggestion: accepted,
      ...(suggestion.targetType === 'lead' ? { lead: updatedTarget } : { client: updatedTarget })
    }
  })

  app.post<{
    Params: SessionParams & { suggestionId: string }
    Body: AiSuggestionDecisionBody
  }>('/sessions/:sessionId/ai-suggestions/:suggestionId/reject', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.suggestionStore) {
      return reply.code(501).send({ success: false, error: 'Suggestion store not configured' })
    }

    const suggestionId = Number(request.params.suggestionId)
    if (!Number.isInteger(suggestionId) || suggestionId <= 0) {
      return reply.code(400).send({ success: false, error: 'invalid_suggestion_id' })
    }

    const suggestion = await deps.suggestionStore.get(request.params.sessionId, suggestionId)
    if (!suggestion) {
      return reply.code(404).send({ success: false, error: 'suggestion_not_found' })
    }

    if (suggestion.status !== 'pending') {
      return reply.code(409).send({ success: false, error: 'suggestion_not_pending' })
    }

    const decisionSourceInput = request.body?.decisionSource
    const decisionSource = normalizeDecisionSource(decisionSourceInput)
    if (decisionSourceInput !== undefined && decisionSourceInput !== null && !decisionSource) {
      return reply.code(400).send({ success: false, error: 'invalid_decision_source' })
    }

    const decisionActorRoleInput = request.body?.decisionActorRole
    const decisionActorRole = normalizeDecisionActorRole(decisionActorRoleInput)
    if (decisionActorRoleInput !== undefined && decisionActorRoleInput !== null && !decisionActorRole) {
      return reply.code(400).send({ success: false, error: 'invalid_decision_actor_role' })
    }

    const decisionActorUid = parseNullableString(request.body?.decisionActorUid)
    if (request.body?.decisionActorUid !== undefined && decisionActorUid === undefined) {
      return reply.code(400).send({ success: false, error: 'invalid_decision_actor_uid' })
    }

    const decision = {
      source: decisionSource ?? 'manual',
      actorRole: decisionActorRole ?? null,
      actorUid: decisionActorUid ?? null
    }

    const rejected = await deps.suggestionStore.markRejected(request.params.sessionId, suggestionId, decision)
    if (!rejected) {
      return reply.code(409).send({ success: false, error: 'suggestion_not_pending' })
    }

    void recordAudit(request, 'ai.suggestions.reject', request.params.sessionId, {
      suggestionId,
      targetType: suggestion.targetType,
      targetId: suggestion.targetId,
      decisionSource: decision.source,
      decisionActorRole: decision.actorRole,
      decisionActorUid: decision.actorUid
    })

    return {
      success: true,
      suggestion: rejected
    }
  })

  app.get<{
    Querystring: AuthExportQuery
  }>('/admin/auth-states/export', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.authStateStore) {
      return reply.code(501).send({ success: false, error: 'Auth store not configured' })
    }

    const limitRaw = request.query?.limit
    const limit = typeof limitRaw === 'string' ? Number(limitRaw) : limitRaw
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : undefined
    const rows = await deps.authStateStore.exportEncrypted(safeLimit)
    void recordAudit(request, 'auth.export', undefined, { count: rows.length })

    return {
      success: true,
      rows
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: SessionHistoryQuery
  }>('/admin/sessions/:sessionId/history', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.statusStore) {
      return reply.code(501).send({ success: false, error: 'Status store not configured' })
    }

    const { sessionId } = request.params
    const limitRaw = request.query?.limit
    const limit = typeof limitRaw === 'string' ? Number(limitRaw) : limitRaw
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : undefined
    const history = await deps.statusStore.listHistory(sessionId, safeLimit)
    void recordAudit(request, 'sessions.history', sessionId, { count: history.length })

    return {
      success: true,
      history
    }
  })

  app.post<{
    Body: AuthImportBody
  }>('/admin/auth-states/import', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.authStateStore) {
      return reply.code(501).send({ success: false, error: 'Auth store not configured' })
    }

    const rows = request.body?.rows
    if (!Array.isArray(rows)) {
      return reply.code(400).send({ success: false, error: 'rows must be an array' })
    }

    await deps.authStateStore.importEncrypted(rows)
    void recordAudit(request, 'auth.import', undefined, { count: rows.length })

    return {
      success: true,
      imported: rows.length
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/admin/ai/config/:sessionId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiConfigStore) {
      return reply.code(501).send({ success: false, error: 'AI config store not configured' })
    }

    const { sessionId } = request.params
    const config = await deps.aiConfigStore.get(sessionId)
    void recordAudit(request, 'ai.config.get', sessionId)

    return {
      success: true,
      config: config ?? null
    }
  })

  app.post<{
    Params: SessionParams
    Querystring: AdminQuery
    Body: AiConfigBody
  }>('/admin/ai/config/:sessionId', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.aiConfigStore) {
      return reply.code(501).send({ success: false, error: 'AI config store not configured' })
    }

    const { sessionId } = request.params
    const config = request.body?.config
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return reply.code(400).send({ success: false, error: 'config must be an object' })
    }

    await deps.aiConfigStore.upsert(sessionId, config)
    void recordAudit(request, 'ai.config.set', sessionId)

    return {
      success: true
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminQuery
  }>('/admin/agenda/:sessionId/agendas', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.agendaStore) {
      return reply.code(501).send({ success: false, error: 'Agenda store not configured' })
    }

    const { sessionId } = request.params
    const agendas = await deps.agendaStore.listAgendas(sessionId)
    void recordAudit(request, 'agenda.list', sessionId, { count: agendas.length })

    return {
      success: true,
      agendas
    }
  })

  app.get<{
    Params: SessionParams
    Querystring: AdminAgendaAvailabilityQuery
  }>('/admin/agenda/:sessionId/availability', async (request, reply) => {
    if (!isAdminRequest(request)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' })
    }

    if (!deps.agendaStore) {
      return reply.code(501).send({ success: false, error: 'Agenda store not configured' })
    }

    const { sessionId } = request.params
    const agendaId = typeof request.query?.agendaId === 'string' ? request.query.agendaId.trim() : ''
    const date = typeof request.query?.date === 'string' ? request.query.date.trim() : ''
    const durationMinutes = parseNumber(request.query?.durationMinutes) ?? 60
    const granularityMinutes = parseNumber(request.query?.granularityMinutes) ?? 30

    if (!agendaId || !date) {
      return reply.code(400).send({ success: false, error: 'agendaId and date are required' })
    }

    const timezone = env.AI_TIMEZONE
    const agendas = await deps.agendaStore.listAgendas(sessionId)
    const agenda = agendas.find((entry) => entry.id === agendaId) ?? null
    if (!agenda) {
      return reply.code(404).send({ success: false, error: 'Agenda not found' })
    }

    const appointments = await deps.agendaStore.listAppointmentsByDay({
      sessionId,
      agendaId,
      date,
      timezone
    })

    const availability = computeAvailability({
      availableHours: agenda.availableHours,
      appointments,
      date,
      timezone,
      durationMinutes,
      granularityMinutes
    })

    void recordAudit(request, 'agenda.availability', sessionId, { agendaId, date })

    if (availability.success !== true) {
      return reply.code(400).send({ success: false, error: availability.error })
    }

    return {
      success: true,
      agendaId,
      date,
      timezone,
      businessHoursWindows: availability.businessHoursWindows,
      busy: availability.busy,
      freeWindows: availability.freeWindows,
      suggestedSlots: availability.suggestedSlots
    }
  })

  return app
}

function mergeCostSeriesByDay(
  aiSeries: Array<{ day: string; costUsd: number; costBrl: number; totalTokens: number; responses: number }>,
  broadcastSeries: Array<{ day: string; costBrl: number }>
) {
  const merged = new Map<
    string,
    {
      day: string
      costUsd: number
      costBrl: number
      totalTokens: number
      responses: number
    }
  >()

  for (const entry of aiSeries) {
    merged.set(entry.day, { ...entry })
  }

  for (const entry of broadcastSeries) {
    const current = merged.get(entry.day)
    if (current) {
      current.costBrl += Number(entry.costBrl ?? 0)
    } else {
      merged.set(entry.day, {
        day: entry.day,
        costUsd: 0,
        costBrl: Number(entry.costBrl ?? 0),
        totalTokens: 0,
        responses: 0
      })
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.day.localeCompare(b.day))
}

function parseAllowedOrigins(value?: string) {
  if (!value) {
    return undefined
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)

  return origins.length > 0 ? origins : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLeadStatus(value?: string): LeadStatus | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')

  // Backwards-compatible aliases.
  if (normalized === 'em_atendimento') return 'em_processo'
  if (normalized === 'finalizado') return 'inativo'

  if (normalized === 'novo') return 'novo'
  if (normalized === 'inativo') return 'inativo'
  if (normalized === 'aguardando') return 'aguardando'
  if (normalized === 'em_processo') return 'em_processo'
  if (normalized === 'cliente') return 'cliente'
  return undefined
}

function normalizeClientStatus(value?: string) {
  if (!value) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'ativo') return 'ativo'
  if (normalized === 'inativo') return 'inativo'
  if (normalized === 'vip') return 'vip'
  if (normalized === 'lead') return 'lead'
  return undefined
}

function parseTimestampMs(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      return asNumber
    }
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return undefined
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function parseOptionalInteger(value: unknown): number | undefined {
  const parsed = parseNumber(value)
  if (parsed === undefined || !Number.isFinite(parsed)) {
    return undefined
  }
  return Math.round(parsed)
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value === 'string') {
    return value
  }
  return undefined
}

function sanitizeLeadTag(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return normalizeLeadTag(trimmed)
}

function normalizeLeadTag(value: string): 'P. Ativa' | 'P. Passiva' | null {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (
    normalized === 'p passiva' ||
    normalized.includes('passiva')
  ) {
    return 'P. Passiva'
  }

  if (
    normalized === 'p ativa' ||
    normalized.includes('ativa')
  ) {
    return 'P. Ativa'
  }

  return null
}

function normalizeDecisionSource(value: unknown): AiSuggestionDecisionSource | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'manual' || normalized === 'automatic') {
    return normalized
  }
  return undefined
}

function normalizeDecisionActorRole(value: unknown): AiSuggestionDecisionActorRole | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'user' || normalized === 'system') {
    return normalized
  }
  return undefined
}

function normalizeOnboardingEventName(value: unknown): OnboardingEventName | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }
  return ONBOARDING_EVENT_NAMES.includes(normalized as OnboardingEventName)
    ? (normalized as OnboardingEventName)
    : undefined
}

function normalizeOnboardingEventSource(value: unknown): OnboardingEventSource | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'frontend' || normalized === 'backend' || normalized === 'system') {
    return normalized
  }
  return undefined
}

function parseOnboardingCohort(value: unknown): OnboardingCohort {
  if (typeof value !== 'string') {
    return 'week'
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'day' || normalized === 'week' || normalized === 'month') {
    return normalized
  }
  return 'week'
}

function parseAcquisitionGroupBy(value: unknown): AcquisitionFunnelGroupBy {
  if (typeof value !== 'string') {
    return 'campaign'
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'campaign') {
    return 'campaign'
  }
  return 'campaign'
}

function normalizeProspectingFeedbackFocus(value: unknown): PostInteractionFeedbackDetailsFilters['focus'] {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (
    normalized === 'qualified' ||
    normalized === 'approachesSent' ||
    normalized === 'feedbacksReceived' ||
    normalized === 'averageScore' ||
    normalized === 'offersSent'
  ) {
    return normalized
  }

  return null
}

function parseMessageSendPayload(body: MessageSendBody): {
  kind: 'text'
  text: string
} | {
  kind: 'media'
  media: {
    mediaType: 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage'
    url: string
    mimeType?: string
    fileName?: string
    caption?: string
    storagePolicy?: 'ttl_15d' | 'ttl_30d'
  }
} | {
  kind: 'contact'
  contact: {
    displayName?: string
    contacts: Array<{ name: string; whatsapp: string }>
  }
} | {
  error: string
} {
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const media = isRecord(body.media) ? body.media : null
  const contact = isRecord(body.contact) ? body.contact : null

  if (media && contact) {
    return { error: 'media_contact_conflict' }
  }

  if (media) {
    const url = typeof media.url === 'string' ? media.url.trim() : ''
    if (!url) {
      return { error: 'url is required' }
    }
    const mimeType = typeof media.mimeType === 'string' ? media.mimeType.trim() : ''
    const fileName = typeof media.fileName === 'string' ? media.fileName.trim() : ''
    const captionRaw = typeof media.caption === 'string' ? media.caption.trim() : ''
    const caption = captionRaw || text
    const storagePolicyRaw = typeof media.storagePolicy === 'string' ? media.storagePolicy.trim() : ''
    if (storagePolicyRaw && storagePolicyRaw !== 'ttl_15d' && storagePolicyRaw !== 'ttl_30d') {
      return { error: 'invalid_storage_policy' }
    }

    return {
      kind: 'media',
      media: {
        mediaType: normalizeBroadcastMediaType(media.mediaType, mimeType, fileName),
        url,
        ...(mimeType ? { mimeType } : {}),
        ...(fileName ? { fileName } : {}),
        ...(caption ? { caption } : {}),
        ...(
          storagePolicyRaw === 'ttl_15d' || storagePolicyRaw === 'ttl_30d'
            ? { storagePolicy: storagePolicyRaw as 'ttl_15d' | 'ttl_30d' }
            : {}
        )
      }
    }
  }

  if (contact) {
    const contactsRaw = Array.isArray(contact.contacts) ? contact.contacts : []
    const contacts = contactsRaw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }
        const name = typeof (entry as any).name === 'string' ? (entry as any).name.trim() : ''
        const whatsapp = typeof (entry as any).whatsapp === 'string' ? (entry as any).whatsapp.trim() : ''
        if (!name || !whatsapp) {
          return null
        }
        return { name, whatsapp }
      })
      .filter(Boolean) as Array<{ name: string; whatsapp: string }>

    const displayName = typeof contact.displayName === 'string' ? contact.displayName.trim() : ''
    return {
      kind: 'contact',
      contact: {
        ...(displayName ? { displayName } : {}),
        contacts
      }
    }
  }

  if (!text) {
    return { error: 'message_required' }
  }

  return {
    kind: 'text',
    text
  }
}

function normalizeMessageSendOrigin(value: unknown): MessageSendOrigin | null {
  if (value === undefined || value === null) {
    return 'automation_api'
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return 'automation_api'
  }

  if (normalized === 'human_dashboard' || normalized === 'automation_api') {
    return normalized
  }

  return null
}

function mapMessageSendValidationError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : ''
  if (!message) {
    return null
  }

  const validationErrors = new Set([
    'sessionId is required',
    'chatId is required',
    'text is required',
    'url is required',
    'contacts is required',
    'contacts_limit_exceeded',
    'contact_name_required',
    'invalid_whatsapp',
    'invalid_storage_policy'
  ])

  if (validationErrors.has(message)) {
    return message
  }

  return null
}

function mapChatLabelStoreError(error: unknown): { statusCode: number; error: string } | null {
  if (!(error instanceof ChatLabelStoreError)) {
    return null
  }

  const code = error.code
  if (
    code === 'label_name_required' ||
    code === 'label_name_too_long' ||
    code === 'label_color_required' ||
    code === 'label_color_invalid' ||
    code === 'labels_limit_reached' ||
    code === 'chat_labels_limit_exceeded' ||
    code === 'chat_label_invalid_ids'
  ) {
    return { statusCode: 400, error: code }
  }
  if (code === 'label_name_conflict') {
    return { statusCode: 409, error: code }
  }
  if (code === 'label_not_found') {
    return { statusCode: 404, error: code }
  }

  return { statusCode: 500, error: 'chat_label_store_failed' }
}

function mapQuickReplyStoreError(error: unknown): { statusCode: number; error: string } | null {
  if (!(error instanceof QuickReplyStoreError)) {
    return null
  }

  const code = error.code
  if (
    code === 'shortcut_required' ||
    code === 'shortcut_invalid_format' ||
    code === 'content_required' ||
    code === 'content_too_long' ||
    code === 'quick_replies_limit_reached'
  ) {
    return { statusCode: 400, error: code }
  }
  if (code === 'quick_reply_shortcut_conflict') {
    return { statusCode: 409, error: code }
  }
  if (code === 'quick_reply_not_found') {
    return { statusCode: 404, error: code }
  }

  return { statusCode: 500, error: 'quick_reply_store_failed' }
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }

  const seen = new Set<string>()
  const output: string[] = []
  input.forEach((value) => {
    if (typeof value !== 'string') {
      return
    }
    const safe = value.trim()
    if (!safe || seen.has(safe)) {
      return
    }
    seen.add(safe)
    output.push(safe)
  })
  return output
}

function buildBroadcastPayload(body: BroadcastCreateBody | undefined): BroadcastMessagePayload | null {
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const media = body?.media
  const url = typeof media?.url === 'string' ? media.url.trim() : ''
  const removeContactIfLastMessageUndelivered = body?.removeContactIfLastMessageUndelivered !== false

  if (url) {
    const mimeType = typeof media?.mimeType === 'string' ? media.mimeType.trim() : ''
    const fileName = typeof media?.fileName === 'string' ? media.fileName.trim() : ''
    const captionRaw = typeof media?.caption === 'string' ? media.caption.trim() : ''
    const caption = captionRaw || text
    const mediaType = normalizeBroadcastMediaType(media?.mediaType, mimeType, fileName)

    return {
      type: 'media',
      mediaType,
      url,
      removeContactIfLastMessageUndelivered,
      ...(mimeType ? { mimeType } : {}),
      ...(fileName ? { fileName } : {}),
      ...(caption ? { caption } : {})
    }
  }

  if (text) {
    return {
      type: 'text',
      text,
      removeContactIfLastMessageUndelivered
    }
  }

  return null
}

function normalizeBroadcastMediaType(
  raw: unknown,
  mimeType: string,
  fileName: string
): 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage' {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value === 'imageMessage' || value === 'videoMessage' || value === 'audioMessage' || value === 'documentMessage') {
    return value
  }

  const normalizedMime = (mimeType ?? '').toLowerCase().trim()
  if (normalizedMime.startsWith('image/')) return 'imageMessage'
  if (normalizedMime.startsWith('video/')) return 'videoMessage'
  if (normalizedMime.startsWith('audio/')) return 'audioMessage'

  const normalizedFile = (fileName ?? '').toLowerCase().trim()
  if (normalizedFile.endsWith('.pdf')) return 'documentMessage'

  return 'documentMessage'
}

function mapChatMediaError(error: unknown): { statusCode: number; error: string } {
  if (error instanceof ChatMediaError) {
    if (error.code === 'not_found') {
      return { statusCode: 404, error: 'not_found' }
    }
    if (error.code === 'media_unavailable') {
      return { statusCode: 410, error: 'media_unavailable' }
    }
    if (error.code === 'unsupported_media') {
      return { statusCode: 404, error: 'unsupported_media' }
    }
    if (error.code === 'too_large') {
      return { statusCode: 413, error: 'too_large' }
    }
    return { statusCode: 502, error: 'media_download_failed' }
  }

  return { statusCode: 502, error: 'media_download_failed' }
}

function sanitizeContentDispositionFileName(value: string | undefined) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .slice(0, 160)
}
