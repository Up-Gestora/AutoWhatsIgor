import { loadEnv } from './config/env'
import { AdminAuditStore, SessionHardDeleteService } from './admin'
import { buildAuthStateStores } from './auth'
import { createPostgresPool } from './storage/postgres'
import { createRedisClient } from './storage/redis'
import { buildServer } from './server'
import {
  InboundMessageQueue,
  InboundMessageService,
  InboundMessageStore,
  InboundMessageWorker,
  InboundDebounceStore,
  OutboundMessageQueue,
  OutboundMediaCleanupService,
  OutboundMessageService,
  OutboundMessageStore,
  OutboundMessageWorker,
  OutboundRateLimiter
} from './messages'
import { ChatDeleteService, ChatLabelStore, ChatMediaService, ChatService, ChatStateStore } from './chats'
import { LeadConversionStore, LeadStore } from './leads'
import { ClientStore } from './clients'
import { DashboardStore } from './dashboard'
import {
  AiConfigStore,
  AiContextCache,
  AiFieldSuggestionStore,
  TrainingCopilotStore,
  TrainingCopilotService,
  AudioTranscriptionStore,
  AudioTranscriptionService,
  MediaUnderstandingStore,
  MediaUnderstandingService,
  AiAutoFollowUpWorker,
  AiMessageService,
  AiOptOutStore,
  ChatAiConfigStore,
  AiPromptStore,
  AiPresentationStore,
  AiResponseStore,
  AiUsageStore,
  GeminiClient,
  OpenAiClient,
  buildDefaultAiConfig
} from './ai'
import { AiFileLibrary } from './ai/fileLibrary'
import { FirestoreAgendaStore } from './agenda/firestoreAgendaStore'
import { CreditsService, CreditsStore } from './credits'
import { BillingService, BillingStore } from './billing'
import { AffiliateService, AffiliateStore } from './affiliates'
import { SystemSettingsService, SystemSettingsStore } from './systemSettings'
import { BroadcastJobStore, BroadcastListStore, BroadcastWorker, SessionTrafficStore } from './broadcasts'
import { QuickReplyStore } from './quickReplies'
import { OnboardingDraftStore, OnboardingNurtureService, OnboardingService, OnboardingStore } from './onboarding'
import { PostInteractionFeedbackEventStore, PostInteractionFeedbackService, PostInteractionFeedbackWorker } from './postInteractionFeedback'
import {
  BaileysSessionDriver,
  NoopSessionDriver,
  RedisSessionLockManager,
  SessionEventBus,
  SessionEventService,
  SessionManager,
  SessionStatusStore
} from './sessions'
import { createSocketServer } from './socketServer'
import { autoRestoreSessions } from './sessions/autoRestore'
import { createLogger } from './observability/logger'
import { MetricsStore } from './observability/metrics'
import { AlertMonitor } from './observability/alerts'
import { FindmyangelContextProvider } from './integrations/findmyangelContext'
import {
  FindmyangelBrPreferenceStore,
  FindmyangelFailoverJobStore,
  FindmyangelFailoverWorker
} from './integrations/findmyangelDelivery'

async function main() {
  const env = loadEnv()
  const metrics = new MetricsStore()
  const makeLogger = (component: string) => createLogger({ component, baseMeta: { service: 'backend-b' } })
  const bootstrapLogger = makeLogger('bootstrap')
  const pool = createPostgresPool(env)
  const redis = createRedisClient(env)
  const findmyangelContextProvider = new FindmyangelContextProvider({
    redis,
    config: {
      enabled: env.FINDMYANGEL_CONTEXT_ENABLED,
      url: env.FINDMYANGEL_CONTEXT_URL,
      secret: env.FINDMYANGEL_CONTEXT_SECRET,
      timeoutMs: env.FINDMYANGEL_CONTEXT_TIMEOUT_MS,
      cacheTtlSec: env.FINDMYANGEL_CONTEXT_CACHE_TTL_SEC,
      maxBytes: env.FINDMYANGEL_CONTEXT_MAX_BYTES,
      targetSessionId: env.FINDMYANGEL_TARGET_SESSION_ID
    },
    logger: makeLogger('findmyangel-context'),
    metrics
  })

  const authStores = await buildAuthStateStores(env, pool)
  const authStore = authStores.store
  const auditStore = new AdminAuditStore({
    pool,
    tableName: env.ADMIN_AUDIT_TABLE
  })
  await auditStore.init()
  const sessionHardDeleteService = new SessionHardDeleteService({
    pool,
    redis,
    env
  })
  const inboundStore = new InboundMessageStore({
    pool,
    tableName: env.INBOUND_MESSAGES_TABLE
  })
  await inboundStore.init()
  const outboundStore = new OutboundMessageStore({
    pool,
    tableName: env.OUTBOUND_MESSAGES_TABLE
  })
  await outboundStore.init()
  const findmyangelBrPreferenceStore = new FindmyangelBrPreferenceStore({
    pool,
    tableName: env.FINDMYANGEL_BR_PREFERENCE_TABLE,
    memoryTtlDays: env.FINDMYANGEL_BR_MEMORY_TTL_DAYS
  })
  await findmyangelBrPreferenceStore.init()
  const findmyangelFailoverJobStore = new FindmyangelFailoverJobStore({
    pool,
    tableName: env.FINDMYANGEL_BR_FAILOVER_JOBS_TABLE
  })
  await findmyangelFailoverJobStore.init()
  const chatStateStore = new ChatStateStore({
    pool,
    tableName: env.CHAT_STATE_TABLE
  })
  await chatStateStore.init()
  const chatLabelStore = new ChatLabelStore({
    pool,
    labelsTableName: env.CHAT_LABELS_TABLE,
    assignmentsTableName: env.CHAT_LABEL_ASSIGNMENTS_TABLE
  })
  await chatLabelStore.init()
  const leadStore = new LeadStore({
    pool,
    tableName: env.LEADS_TABLE
  })
  await leadStore.init()
  const leadConversionStore = new LeadConversionStore({
    pool,
    tableName: env.LEAD_CONVERSIONS_TABLE,
    leadsTableName: env.LEADS_TABLE,
    outboundMessagesTableName: env.OUTBOUND_MESSAGES_TABLE
  })
  await leadConversionStore.init()
  const clientStore = new ClientStore({
    pool,
    tableName: env.CLIENTS_TABLE
  })
  await clientStore.init()
  const dashboardStore = new DashboardStore({
    pool,
    leadsTable: env.LEADS_TABLE,
    clientsTable: env.CLIENTS_TABLE,
    inboundTable: env.INBOUND_MESSAGES_TABLE,
    aiResponsesTable: env.AI_RESPONSE_TABLE
  })
  const postInteractionFeedbackEventStore = new PostInteractionFeedbackEventStore({ pool })
  await postInteractionFeedbackEventStore.init()
  const inboundQueue = new InboundMessageQueue({
    redis,
    queuePrefix: env.INBOUND_QUEUE_PREFIX,
    chatSetKey: env.INBOUND_QUEUE_CHAT_SET
  })
  const audioQueue = new InboundMessageQueue({
    redis,
    queuePrefix: env.AI_AUDIO_QUEUE_PREFIX,
    chatSetKey: env.AI_AUDIO_QUEUE_CHAT_SET
  })
  const mediaQueue = new InboundMessageQueue({
    redis,
    queuePrefix: env.AI_MEDIA_QUEUE_PREFIX,
    chatSetKey: env.AI_MEDIA_QUEUE_CHAT_SET
  })
  const inboundDebounceStore =
    env.AI_DEBOUNCE_MS > 0
      ? new InboundDebounceStore({
          redis,
          keyPrefix: env.AI_DEBOUNCE_PREFIX,
          ttlSec: env.AI_DEBOUNCE_TTL_SEC
        })
      : undefined
  const outboundQueue = new OutboundMessageQueue({
    redis,
    queuePrefix: env.OUTBOUND_QUEUE_PREFIX,
    chatSetKey: env.OUTBOUND_QUEUE_CHAT_SET
  })
  const sessionTrafficStore = new SessionTrafficStore({
    redis,
    keyPrefix: env.BROADCAST_TRAFFIC_PREFIX,
    inboundTtlSec: env.BROADCAST_YIELD_INBOUND_TTL_SEC
  })
  const broadcastListStore = new BroadcastListStore({
    pool,
    listsTableName: env.BROADCAST_LISTS_TABLE,
    contactsTableName: env.BROADCAST_CONTACTS_TABLE,
    defaultCountryCode: env.BROADCAST_DEFAULT_COUNTRY_CODE,
    brStripNinthDigit: env.BROADCAST_BR_STRIP_NINTH_DIGIT,
    maxContactsPerList: env.BROADCAST_MAX_CONTACTS_PER_LIST
  })
  await broadcastListStore.init()
  const broadcastJobStore = new BroadcastJobStore({
    pool,
    jobsTableName: env.BROADCAST_JOBS_TABLE,
    itemsTableName: env.BROADCAST_ITEMS_TABLE,
    contactsTableName: env.BROADCAST_CONTACTS_TABLE,
    maxContactsPerJob: env.BROADCAST_MAX_CONTACTS_PER_JOB
  })
  await broadcastJobStore.init()
  const chatService = new ChatService({
    stateStore: chatStateStore,
    labelStore: chatLabelStore,
    inboundStore,
    outboundStore,
    logger: makeLogger('chat-service')
  })
  const chatDeleteService = new ChatDeleteService({
    pool,
    redis,
    inboundMessagesTableName: env.INBOUND_MESSAGES_TABLE,
    outboundMessagesTableName: env.OUTBOUND_MESSAGES_TABLE,
    chatStateTableName: env.CHAT_STATE_TABLE,
    chatAiConfigTableName: env.CHAT_AI_CONFIG_TABLE,
    chatLabelAssignmentsTableName: env.CHAT_LABEL_ASSIGNMENTS_TABLE,
    aiResponsesTableName: env.AI_RESPONSE_TABLE,
    aiAudioTranscriptionsTableName: env.AI_AUDIO_TRANSCRIPTIONS_TABLE,
    aiMediaTableName: env.AI_MEDIA_TABLE,
    inboundQueuePrefix: env.INBOUND_QUEUE_PREFIX,
    inboundChatSetKey: env.INBOUND_QUEUE_CHAT_SET,
    aiAudioQueuePrefix: env.AI_AUDIO_QUEUE_PREFIX,
    aiAudioChatSetKey: env.AI_AUDIO_QUEUE_CHAT_SET,
    aiMediaQueuePrefix: env.AI_MEDIA_QUEUE_PREFIX,
    aiMediaChatSetKey: env.AI_MEDIA_QUEUE_CHAT_SET,
    outboundQueuePrefix: env.OUTBOUND_QUEUE_PREFIX,
    outboundChatSetKey: env.OUTBOUND_QUEUE_CHAT_SET,
    aiContextPrefix: env.AI_CONTEXT_PREFIX,
    aiDebouncePrefix: env.AI_DEBOUNCE_PREFIX,
    aiOptOutPrefix: env.AI_OPTOUT_PREFIX,
    outboundRateLimitPrefix: env.OUTBOUND_RATE_LIMIT_PREFIX,
    logger: makeLogger('chat-delete-service')
  })
  const chatMediaService = new ChatMediaService({
    inboundStore,
    outboundStore,
    downloadTimeoutMs: env.MEDIA_DOWNLOAD_TIMEOUT_MS,
    downloadMaxBytes: env.MEDIA_DOWNLOAD_MAX_BYTES,
    logger: makeLogger('chat-media-service')
  })
  let inboundService: InboundMessageService
  const outboundService = new OutboundMessageService({
    store: outboundStore,
    queue: outboundQueue,
    logger: makeLogger('outbound-service'),
    metrics,
    chatService
  })
  const outboundMediaCleanupService = new OutboundMediaCleanupService({
    store: outboundStore,
    ttlDays: env.OUTBOUND_MEDIA_TTL_DAYS,
    batchSize: env.OUTBOUND_MEDIA_CLEANUP_BATCH_SIZE,
    logger: makeLogger('outbound-media-cleanup'),
    metrics
  })
  const aiConfigStore = new AiConfigStore({
    pool,
    tableName: env.AI_CONFIG_TABLE
  })
  await aiConfigStore.init()
  const onboardingStore = new OnboardingStore({
    pool,
    tableName: env.ONBOARDING_EVENTS_TABLE
  })
  await onboardingStore.init()
  const affiliateStore = new AffiliateStore({
    pool,
    linksTable: env.AFFILIATE_LINKS_TABLE,
    clicksTable: env.AFFILIATE_CLICKS_TABLE,
    attributionsTable: env.AFFILIATE_ATTRIBUTIONS_TABLE
  })
  await affiliateStore.init()
  const affiliateService = new AffiliateService({
    store: affiliateStore
  })
  const onboardingDraftStore = new OnboardingDraftStore({
    pool
  })
  await onboardingDraftStore.init()
  const chatAiConfigStore = new ChatAiConfigStore({
    pool,
    tableName: env.CHAT_AI_CONFIG_TABLE,
    chatStateTableName: env.CHAT_STATE_TABLE
  })
  await chatAiConfigStore.init()
  const quickReplyStore = new QuickReplyStore({
    pool,
    tableName: env.QUICK_REPLIES_TABLE
  })
  await quickReplyStore.init()
  const aiResponseStore = new AiResponseStore({
    pool,
    tableName: env.AI_RESPONSE_TABLE,
    processingTimeoutMs: env.AI_PROCESSING_TIMEOUT_MS
  })
  await aiResponseStore.init()
  const audioTranscriptionStore = new AudioTranscriptionStore({
    pool,
    tableName: env.AI_AUDIO_TRANSCRIPTIONS_TABLE,
    processingTimeoutMs: env.AI_AUDIO_TRANSCRIBE_TIMEOUT_MS,
    maxAttempts: env.AI_AUDIO_MAX_ATTEMPTS
  })
  await audioTranscriptionStore.init()
  const mediaUnderstandingStore = new MediaUnderstandingStore({
    pool,
    tableName: env.AI_MEDIA_TABLE,
    processingTimeoutMs: env.AI_MEDIA_PROCESS_TIMEOUT_MS,
    maxAttempts: env.AI_MEDIA_MAX_ATTEMPTS
  })
  await mediaUnderstandingStore.init()
  const aiUsageStore = new AiUsageStore({ pool })
  await aiUsageStore.init()
  const suggestionStore = new AiFieldSuggestionStore({
    pool,
    tableName: env.AI_SUGGESTIONS_TABLE
  })
  await suggestionStore.init()
  const trainingCopilotStore = new TrainingCopilotStore({ pool })
  await trainingCopilotStore.init()
  const creditsStore = new CreditsStore({ pool })
  await creditsStore.init()
  const creditsService = new CreditsService({ store: creditsStore })
  const billingStore = new BillingStore({ pool })
  await billingStore.init()
  const billingService = new BillingService({
    env,
    store: billingStore,
    creditsService,
    affiliateService,
    metrics,
    logger: makeLogger('billing-service')
  })
  const aiContextCache = new AiContextCache({
    redis,
    keyPrefix: env.AI_CONTEXT_PREFIX,
    ttlSec: env.AI_CONTEXT_TTL_SEC,
    maxMessages: env.AI_CONTEXT_MAX_MESSAGES
  })
  const aiOptOutStore = new AiOptOutStore({
    redis,
    keyPrefix: env.AI_OPTOUT_PREFIX
  })
  const aiPresentationStore = new AiPresentationStore({ redis })
  const aiPromptStore = new AiPromptStore()
  const aiFileLibrary = new AiFileLibrary()
  const agendaStore = new FirestoreAgendaStore()
  const systemSettingsStore = new SystemSettingsStore({
    pool,
    tableName: env.SYSTEM_SETTINGS_TABLE
  })
  await systemSettingsStore.init()
  const systemSettings = new SystemSettingsService({ store: systemSettingsStore })
  await systemSettings.load()
  const aiDefaults = buildDefaultAiConfig(env)
  let statusStore: SessionStatusStore | null = null
  const postInteractionFeedbackService = new PostInteractionFeedbackService({
    settings: systemSettings,
    eventStore: postInteractionFeedbackEventStore,
    leadStore,
    inboundStore,
    outboundStore,
    outboundService,
    statusStore: {
      getStatus: async (sessionId) => statusStore?.getStatus(sessionId) ?? null
    },
    chatAiConfigStore,
    presentationStore: aiPresentationStore,
    aiOptOutStore,
    aiConfigResolver: aiConfigStore,
    defaultAiConfig: aiDefaults,
    appPublicUrl: env.APP_PUBLIC_URL,
    logger: makeLogger('post-interaction-feedback-service'),
    metrics
  })
  inboundService = new InboundMessageService({
    store: inboundStore,
    queue: inboundQueue,
    audioQueue,
    mediaQueue,
    logger: makeLogger('inbound-service'),
    metrics,
    chatService,
    leadStore,
    debounceStore: inboundDebounceStore,
    trafficStore: sessionTrafficStore,
    inboundInterceptor: postInteractionFeedbackService
  })
  const openAiClient = new OpenAiClient({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    logger: makeLogger('openai-client')
  })
  const geminiClient = new GeminiClient({
    apiKey: env.GEMINI_API_KEY,
    defaultModel: env.AI_GEMINI_MODEL,
    logger: makeLogger('gemini-client')
  })
  let onboardingService: OnboardingService | undefined
  let onboardingNurtureService: OnboardingNurtureService | undefined
  const aiService = new AiMessageService({
    inboundStore,
    outboundService,
    configStore: aiConfigStore,
    chatConfigStore: chatAiConfigStore,
    responseStore: aiResponseStore,
    contextCache: aiContextCache,
    optOutStore: aiOptOutStore,
    openAiClient,
    geminiClient,
    defaultConfig: aiDefaults,
    agendaStore,
    fileLibrary: aiFileLibrary,
    chatService,
    presentationStore: aiPresentationStore,
    promptStore: aiPromptStore,
    systemSettings,
    clientStore,
    leadStore,
    leadConversionStore,
    suggestionStore,
    usageStore: aiUsageStore,
    creditsService,
    findmyangelContextProvider,
    logger: makeLogger('ai-service'),
    metrics,
    clientClassifyThreshold: env.AI_CLIENT_CLASSIFY_THRESHOLD,
    clientClassifyCooldownSec: env.AI_CLIENT_CLASSIFY_COOLDOWN_SEC,
    onFirstAiResponseSent: async ({ sessionId, chatId, inboundId, outboundId }) => {
      if (env.ONBOARDING_V2_ENABLED && onboardingService) {
        try {
          await onboardingService.recordSystemMilestoneOnce(sessionId, 'first_ai_response_sent', {
            chatId,
            inboundId,
            outboundId
          })
        } catch (error) {
          bootstrapLogger.warn('Onboarding first AI response hook failed', {
            sessionId,
            chatId,
            inboundId,
            outboundId,
            error: (error as Error).message
          })
        }
      }
      try {
        await postInteractionFeedbackService.handleAiReplySent({
          sessionId,
          chatId,
          inboundId,
          outboundId
        })
      } catch (error) {
        bootstrapLogger.warn('Post-interaction feedback hook failed', {
          sessionId,
          chatId,
          inboundId,
          outboundId,
          error: (error as Error).message
        })
      }
    }
  })
  const trainingCopilotService = new TrainingCopilotService({
    store: trainingCopilotStore,
    geminiClient,
    creditsService,
    usageStore: aiUsageStore,
    systemSettings,
    logger: makeLogger('training-copilot-service'),
    metrics
  })
  const audioTranscriptionService = new AudioTranscriptionService({
    enabled: env.AI_AUDIO_ENABLED,
    maxSeconds: env.AI_AUDIO_MAX_SECONDS,
    maxBytes: env.AI_AUDIO_MAX_BYTES,
    fallbackMode: env.AI_AUDIO_FALLBACK_MODE,
    fallbackText: env.AI_AUDIO_FALLBACK_TEXT,
    transcribeModel: env.AI_AUDIO_TRANSCRIBE_MODEL,
    language: env.AI_AUDIO_LANGUAGE,
    aiQueue: inboundQueue,
    inboundStore,
    configStore: aiConfigStore,
    chatConfigStore: chatAiConfigStore,
    transcriptionStore: audioTranscriptionStore,
    openAiClient,
    systemSettings,
    usageStore: aiUsageStore,
    creditsService,
    outboundService,
    chatStateStore,
    defaultConfig: aiDefaults,
    logger: makeLogger('audio-transcription-service'),
    metrics
  })
  const mediaUnderstandingService = new MediaUnderstandingService({
    enabled: env.AI_MEDIA_ENABLED,
    maxBytes: env.AI_MEDIA_MAX_BYTES,
    maxPdfPages: env.AI_MEDIA_PDF_MAX_PAGES,
    model: env.AI_MEDIA_MODEL,
    aiQueue: inboundQueue,
    inboundStore,
    configStore: aiConfigStore,
    chatConfigStore: chatAiConfigStore,
    understandingStore: mediaUnderstandingStore,
    openAiClient,
    systemSettings,
    usageStore: aiUsageStore,
    creditsService,
    outboundService,
    chatStateStore,
    defaultConfig: aiDefaults,
    logger: makeLogger('media-understanding-service'),
    metrics
  })
  statusStore = new SessionStatusStore({
    pool,
    redis,
    cachePrefix: env.STATUS_CACHE_PREFIX,
    cacheTtlMs: env.STATUS_CACHE_TTL_MS,
    historyTable: env.STATUS_HISTORY_TABLE
  })
  await statusStore.init()
  onboardingService = new OnboardingService({
    store: onboardingStore,
    draftStore: onboardingDraftStore,
    metrics,
    paidActivation7dEnabled: env.PAID_ACTIVATION_7D_ENABLED,
    statusStore,
    aiConfigStore,
    aiService,
    trainingCopilotService,
    creditsService
  })
  onboardingNurtureService = new OnboardingNurtureService({
    enabled: env.ONBOARDING_NURTURE_ENABLED,
    senderEmail: env.ONBOARDING_NURTURE_SENDER_EMAIL,
    senderSessionId: env.ONBOARDING_NURTURE_SENDER_SESSION_ID,
    defaultCountryCode: env.ONBOARDING_NURTURE_DEFAULT_COUNTRY_CODE,
    brStripNinthDigit: env.ONBOARDING_NURTURE_BR_STRIP_NINTH_DIGIT,
    leadStore,
    onboardingStateProvider: onboardingService,
    logger: makeLogger('onboarding-nurture-service'),
    metrics
  })

  const eventBus = new SessionEventBus()
  const eventService = new SessionEventService({
    eventBus,
    statusStore,
    redis,
    qrMinIntervalMs: env.QR_MIN_INTERVAL_MS,
    qrThrottlePrefix: env.QR_THROTTLE_PREFIX,
    logger: makeLogger('session-event-service')
  })

  const sessionDriver =
    env.SESSION_DRIVER === 'noop'
      ? new NoopSessionDriver({
          readyDelayMs: env.NOOP_READY_DELAY_MS,
          disconnectAfterMs: env.NOOP_DISCONNECT_AFTER_MS,
          messageStatusDelayMs: env.NOOP_MESSAGE_STATUS_DELAY_MS,
          failStartRate: env.NOOP_FAIL_START_RATE
        })
      : new BaileysSessionDriver({
          authStore,
          logLevel: env.LOG_LEVEL,
          logger: makeLogger('baileys-driver'),
          mediaDownloadTimeoutMs: env.MEDIA_DOWNLOAD_TIMEOUT_MS,
          mediaDownloadMaxBytes: env.MEDIA_DOWNLOAD_MAX_BYTES,
          autoPurgeBadDecryptEnabled: env.SESSION_AUTO_PURGE_BAD_DECRYPT,
          autoPurgeBadDecryptThreshold: env.SESSION_AUTO_PURGE_BAD_DECRYPT_THRESHOLD,
          autoPurgeBadDecryptWindowMs: env.SESSION_AUTO_PURGE_BAD_DECRYPT_WINDOW_MS
        })

  const lockManager = new RedisSessionLockManager(redis)
  const sessionManager = new SessionManager({
    driver: sessionDriver,
    lockManager,
    authStore,
    logger: makeLogger('session-manager'),
    metrics,
    onStatusUpdate: (snapshot) => {
      void eventService.handleStatus(snapshot)
      if (env.ONBOARDING_V2_ENABLED && snapshot.status === 'connected' && onboardingService) {
        void onboardingService.recordSystemMilestoneOnce(snapshot.sessionId, 'whatsapp_connected', {
          status: snapshot.status,
          reason: snapshot.reason ?? null
        })
      }
    },
    onQr: (sessionId, qr) => {
      void eventService.handleQr(sessionId, qr)
    },
    onInboundMessage: (sessionId, message) => {
      void inboundService.handleRawMessage(sessionId, message).catch((error) => {
        bootstrapLogger.error('Failed to handle inbound message', {
          sessionId,
          error: error.message
        })
        metrics.increment('errors.total')
      })
    },
    onChatMetadata: (sessionId, update) => {
      void chatService.handleChatMetadata(sessionId, update).catch((error) => {
        bootstrapLogger.error('Failed to handle chat metadata', {
          sessionId,
          chatId: update.chatId,
          error: error.message
        })
        metrics.increment('errors.total')
      })
    },
    onMessageStatus: (sessionId, update) => {
      void outboundService.handleStatusUpdate(sessionId, update).catch((error) => {
        bootstrapLogger.error('Failed to handle outbound status update', {
          sessionId,
          error: error.message
        })
        metrics.increment('errors.total')
      })
    },
    startTimeoutMs: env.SESSION_START_TIMEOUT_MS,
    startConcurrency: env.SESSION_START_CONCURRENCY,
    lockTtlMs: env.SESSION_LOCK_TTL_MS,
    lockRenewMs: env.SESSION_LOCK_RENEW_MS,
    backoffBaseMs: env.SESSION_BACKOFF_BASE_MS,
    backoffMaxMs: env.SESSION_BACKOFF_MAX_MS,
    backoffResetMs: env.SESSION_BACKOFF_RESET_MS,
    maxSessions: env.SESSION_MAX_PER_WORKER,
    shardCount: env.SESSION_SHARD_COUNT,
    shardIndex: env.SESSION_SHARD_INDEX
  })

  let inboundWorker: InboundMessageWorker | null = null
  let audioWorker: InboundMessageWorker | null = null
  let mediaWorker: InboundMessageWorker | null = null
  let outboundWorker: OutboundMessageWorker | null = null
  let broadcastWorker: BroadcastWorker | null = null
  let autoFollowUpWorker: AiAutoFollowUpWorker | null = null
  let postInteractionFeedbackWorker: PostInteractionFeedbackWorker | null = null
  let findmyangelFailoverWorker: FindmyangelFailoverWorker | null = null
  const workerStatus = () => ({
    inbound: inboundWorker?.getStatus(),
    audio: audioWorker?.getStatus(),
    media: mediaWorker?.getStatus(),
    outbound: outboundWorker?.getStatus(),
    findmyangelFailover: findmyangelFailoverWorker?.getStatus(),
    broadcast: broadcastWorker?.getStatus(),
    autoFollowUp: autoFollowUpWorker?.getStatus(),
    postInteractionFeedback: postInteractionFeedbackWorker?.getStatus()
  })

  const app = buildServer(env, {
    eventBus,
    statusStore,
    sessionManager,
    auditStore,
    authStateStore: authStores.primary,
    outboundService,
    aiService,
    aiConfigStore,
    chatAiConfigStore,
    leadStore,
    leadConversionStore,
    clientStore,
    chatService,
    chatDeleteService,
    chatLabelStore,
    chatMediaService,
    aiPromptStore,
    systemSettings,
    dashboardStore,
    aiUsageStore,
    creditsService,
    billingService,
    affiliateService,
    suggestionStore,
    trainingCopilotService,
    metrics,
    workerStatus,
    agendaStore,
    quickReplyStore,
    broadcastListStore,
    broadcastJobStore,
    sessionHardDeleteService,
    onboardingService,
    onboardingNurtureService,
    findmyangelBrPreferenceStore,
    findmyangelFailoverJobStore,
    postInteractionFeedbackService
  })

  const io = createSocketServer({
    httpServer: app.server,
    env,
    sessionManager,
    eventBus,
    statusStore
  })

  const inboundCleanupIntervalMs = env.INBOUND_CLEANUP_INTERVAL_MS
  const outboundMediaCleanupIntervalMs = env.OUTBOUND_MEDIA_CLEANUP_INTERVAL_MS
  let inboundCleanupTimer: NodeJS.Timeout | undefined
  let outboundMediaCleanupTimer: NodeJS.Timeout | undefined
  let postInteractionBackfillTimer: NodeJS.Timeout | undefined
  const runInboundCleanup = async () => {
    await inboundService.compactAndExpire(env.INBOUND_RETENTION_DAYS, env.INBOUND_COMPACT_AFTER_DAYS)
  }
  const runOutboundMediaCleanup = async () => {
    await outboundMediaCleanupService.runOnce()
  }
  if (inboundCleanupIntervalMs > 0) {
    inboundCleanupTimer = setInterval(() => {
      void runInboundCleanup().catch((error) => {
        bootstrapLogger.error('Inbound cleanup failed', { error: error.message })
        metrics.increment('errors.total')
      })
    }, inboundCleanupIntervalMs)
    void runInboundCleanup().catch((error) => {
      bootstrapLogger.error('Inbound cleanup failed', { error: error.message })
      metrics.increment('errors.total')
    })
  }
  if (outboundMediaCleanupIntervalMs > 0) {
    outboundMediaCleanupTimer = setInterval(() => {
      void runOutboundMediaCleanup().catch((error) => {
        bootstrapLogger.error('Outbound media cleanup failed', { error: error.message })
        metrics.increment('errors.total')
      })
    }, outboundMediaCleanupIntervalMs)
    void runOutboundMediaCleanup().catch((error) => {
      bootstrapLogger.error('Outbound media cleanup failed', { error: error.message })
      metrics.increment('errors.total')
    })
  }

  inboundWorker = new InboundMessageWorker({
    queue: inboundQueue,
    handler: async (item) => {
      await aiService.handleInbound(item)
    },
    debounceMs: env.AI_DEBOUNCE_MS,
    debounceStore: inboundDebounceStore,
    logger: makeLogger('inbound-worker'),
    metrics
  })
  inboundWorker.start()
  audioWorker = new InboundMessageWorker({
    queue: audioQueue,
    handler: async (item) => {
      await audioTranscriptionService.handleInbound(item)
    },
    logger: makeLogger('audio-worker'),
    metrics
  })
  audioWorker.start()
  mediaWorker = new InboundMessageWorker({
    queue: mediaQueue,
    handler: async (item) => {
      await mediaUnderstandingService.handleInbound(item)
    },
    logger: makeLogger('media-worker'),
    metrics
  })
  mediaWorker.start()
  outboundWorker = new OutboundMessageWorker({
    queue: outboundQueue,
    store: outboundStore,
    sessionManager,
    rateLimiter: new OutboundRateLimiter({
      redis,
      sessionIntervalMs: env.OUTBOUND_RATE_LIMIT_SESSION_MS,
      chatIntervalMs: env.OUTBOUND_RATE_LIMIT_CHAT_MS,
      keyPrefix: env.OUTBOUND_RATE_LIMIT_PREFIX
    }),
    maxRetries: env.OUTBOUND_MAX_RETRIES,
    retryBaseMs: env.OUTBOUND_RETRY_BASE_MS,
    retryMaxMs: env.OUTBOUND_RETRY_MAX_MS,
    pollIntervalMs: env.OUTBOUND_WORKER_POLL_MS,
    maxPerChat: env.OUTBOUND_WORKER_MAX_PER_CHAT,
    logger: makeLogger('outbound-worker'),
    metrics
  })
  outboundWorker.start()
  findmyangelFailoverWorker = new FindmyangelFailoverWorker({
    enabled: env.FINDMYANGEL_BR_FAILOVER_ENABLED,
    failoverDelayMs: env.FINDMYANGEL_BR_FAILOVER_DELAY_MS,
    pollIntervalMs: env.FINDMYANGEL_BR_FAILOVER_WORKER_POLL_MS,
    maxJobsPerTick: env.FINDMYANGEL_BR_FAILOVER_WORKER_BATCH,
    staleProcessingMs: env.FINDMYANGEL_BR_FAILOVER_STALE_PROCESSING_MS,
    maxAttempts: env.FINDMYANGEL_BR_FAILOVER_MAX_ATTEMPTS,
    retryDelayMs: env.FINDMYANGEL_BR_FAILOVER_RETRY_MS,
    jobStore: findmyangelFailoverJobStore,
    preferenceStore: findmyangelBrPreferenceStore,
    outboundStore,
    outboundService,
    logger: makeLogger('findmyangel-failover-worker'),
    metrics
  })
  findmyangelFailoverWorker.start()

  broadcastWorker = new BroadcastWorker({
    pool,
    jobStore: broadcastJobStore,
    sessionManager,
    outboundQueue,
    outboundStore,
    trafficStore: sessionTrafficStore,
    defaultCountryCode: env.BROADCAST_DEFAULT_COUNTRY_CODE,
    brStripNinthDigit: env.BROADCAST_BR_STRIP_NINTH_DIGIT,
    pollIntervalMs: env.BROADCAST_WORKER_POLL_MS,
    maxInFlight: env.BROADCAST_WORKER_MAX_IN_FLIGHT,
    delayMinMs: env.BROADCAST_DELAY_MIN_MS,
    delayMaxMs: env.BROADCAST_DELAY_MAX_MS,
    yieldOutboundMs: env.BROADCAST_YIELD_OUTBOUND_MS,
    successTimeoutMs: env.BROADCAST_SUCCESS_TIMEOUT_MS,
    sendTimeoutMs: env.BROADCAST_SEND_TIMEOUT_MS,
    disconnectPauseGraceMs: env.BROADCAST_DISCONNECT_PAUSE_GRACE_MS,
    mediaDownloadTimeoutMs: env.MEDIA_DOWNLOAD_TIMEOUT_MS,
    mediaDownloadMaxBytes: env.MEDIA_DOWNLOAD_MAX_BYTES,
    creditsService,
    logger: makeLogger('broadcast-worker'),
    metrics
  })
  broadcastWorker.start()

  const autoFollowUpPollIntervalMs =
    env.ONBOARDING_NURTURE_ENABLED === true
      ? Math.min(env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS, env.ONBOARDING_NURTURE_WORKER_POLL_MS)
      : env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS

  autoFollowUpWorker = new AiAutoFollowUpWorker({
    configStore: aiConfigStore,
    aiService,
    leadStore,
    clientStore,
    pollIntervalMs: autoFollowUpPollIntervalMs,
    sessionLimit: env.AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT,
    batchSize: env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE,
    leaseMs: env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS,
    retryBaseMs: env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS,
    retryMaxMs: env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS,
    onboardingNurture: {
      enabled: env.ONBOARDING_NURTURE_ENABLED,
      retryBaseMs: env.ONBOARDING_NURTURE_RETRY_BASE_MS,
      retryMaxMs: env.ONBOARDING_NURTURE_RETRY_MAX_MS,
      stateProvider: onboardingService
    },
    logger: makeLogger('ai-auto-followup-worker'),
    metrics
  })
  autoFollowUpWorker.start()

  postInteractionFeedbackWorker = new PostInteractionFeedbackWorker({
    service: postInteractionFeedbackService,
    pollIntervalMs: env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS,
    batchSize: env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE,
    leaseMs: env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS,
    retryBaseMs: env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS,
    retryMaxMs: env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS,
    logger: makeLogger('post-interaction-feedback-worker'),
    metrics
  })
  postInteractionFeedbackWorker.start()
  postInteractionBackfillTimer = setTimeout(() => {
    void postInteractionFeedbackService.backfillRecentQualifiedInteractions({
      sinceMs: Date.now() - 24 * 60 * 60 * 1000,
      limit: 5_000
    }).catch((error) => {
      bootstrapLogger.warn('Post-interaction feedback backfill failed', {
        error: (error as Error).message
      })
    })
  }, 60_000)

  const alertMonitor = new AlertMonitor({
    metrics,
    logger: makeLogger('alert-monitor'),
    intervalMs: env.OBS_ALERT_INTERVAL_MS,
    errorRateThreshold: env.OBS_ERROR_RATE_THRESHOLD,
    queueChatThreshold: env.OBS_QUEUE_CHAT_THRESHOLD
  })
  if (env.OBS_ALERT_INTERVAL_MS > 0) {
    alertMonitor.start()
  }

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => {
      io.close(() => resolve())
    })
    if (inboundCleanupTimer) {
      clearInterval(inboundCleanupTimer)
    }
    if (outboundMediaCleanupTimer) {
      clearInterval(outboundMediaCleanupTimer)
    }
    if (postInteractionBackfillTimer) {
      clearTimeout(postInteractionBackfillTimer)
    }
    alertMonitor.stop()
    inboundWorker?.stop()
    audioWorker?.stop()
    mediaWorker?.stop()
    outboundWorker?.stop()
    findmyangelFailoverWorker?.stop()
    broadcastWorker?.stop()
    autoFollowUpWorker?.stop()
    postInteractionFeedbackWorker?.stop()
    await redis.quit()
    await pool.end()
  })

  await app.listen({
    host: '0.0.0.0',
    port: env.PORT
  })
  app.log.info({ port: env.PORT }, 'API listening')

  const autoRestoreStatuses = parseAutoRestoreStatuses(env.AUTO_RESTORE_STATUSES)
  const lockRetryDelayMs = Math.max(1000, env.SESSION_LOCK_TTL_MS + 1000)
  const autoRestoreOptions = {
    enabled: env.AUTO_RESTORE_ON_BOOT,
    authStore: authStores.primary,
    statusStore,
    sessionManager,
    maxSessions: env.AUTO_RESTORE_MAX_SESSIONS,
    parallel: env.AUTO_RESTORE_PARALLEL,
    batchSize: env.AUTO_RESTORE_BATCH_SIZE,
    batchDelayMs: env.AUTO_RESTORE_BATCH_DELAY_MS,
    statusAllowlist: autoRestoreStatuses,
    lockRetryDelayMs,
    lockRetryAttempts: 1,
    logger: makeLogger('auto-restore')
  }

  let reconcileRunning = false
  const runAutoRestore = async (label: string) => {
    if (reconcileRunning) {
      bootstrapLogger.warn('Auto-restore skipped: already running', { label })
      return
    }
    reconcileRunning = true
    try {
      await autoRestoreSessions(autoRestoreOptions)
    } catch (error) {
      bootstrapLogger.error('Auto-restore failed', { error: (error as Error).message, label })
      metrics.increment('errors.total')
    } finally {
      reconcileRunning = false
    }
  }

  setTimeout(() => {
    void runAutoRestore('boot')
  }, 1000)

  if (env.SESSION_RECONCILE_INTERVAL_MS > 0) {
    setInterval(() => {
      void runAutoRestore('interval')
    }, env.SESSION_RECONCILE_INTERVAL_MS)
  }
}

main().catch((error) => {
  const bootstrapLogger = createLogger({ component: 'bootstrap', baseMeta: { service: 'backend-b' } })
  bootstrapLogger.error('Failed to start server', { error: (error as Error).message })
  process.exit(1)
})

function parseAutoRestoreStatuses(raw?: string) {
  const defaults = ['connected', 'waiting_qr', 'starting', 'backoff', 'error']
  if (!raw) {
    return defaults
  }
  const parsed = raw
    .split(',')
    .map((status) => status.trim().toLowerCase())
    .filter(Boolean)

  return parsed.length > 0 ? parsed : defaults
}
