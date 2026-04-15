import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

loadDotenv()

const toBoolean = (value: unknown) => {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true
    }
    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false
    }
  }
  return value
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_ORIGINS: z.string().optional(),
  AI_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  AI_RESPOND_IN_GROUPS: z.preprocess(toBoolean, z.boolean()).default(false),
  AI_PROVIDER: z.enum(['openai', 'google']).default('openai'),
  AI_MODEL: z.string().min(1).default('gpt-5.2'),
  AI_GEMINI_MODEL: z.string().min(1).default('gemini-3-flash-preview'),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  AI_SYSTEM_PROMPT: z
    .string()
    .default('You are a helpful assistant for WhatsApp customer support.'),
  AI_FALLBACK_MODE: z.enum(['reply', 'silence']).default('silence'),
  AI_FALLBACK_TEXT: z.string().default('Desculpe, nao consegui responder agora.'),
  AI_OPT_OUT_KEYWORDS: z.string().optional(),
  AI_OPT_IN_KEYWORDS: z.string().optional(),
  AI_CONTEXT_MAX_MESSAGES: z.coerce.number().int().positive().default(20),
  AI_CONTEXT_TTL_SEC: z.coerce.number().int().positive().default(21600),
  AI_PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  AI_AUTO_FOLLOWUP_WORKER_POLL_MS: z.coerce.number().int().positive().default(30000),
  AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT: z.coerce.number().int().positive().default(200),
  AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),
  AI_AUTO_FOLLOWUP_WORKER_LEASE_MS: z.coerce.number().int().positive().default(120000),
  AI_AUTO_FOLLOWUP_RETRY_BASE_MS: z.coerce.number().int().positive().default(300000),
  AI_AUTO_FOLLOWUP_RETRY_MAX_MS: z.coerce.number().int().positive().default(86400000),
  AI_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(1200),
  AI_DEBOUNCE_TTL_SEC: z.coerce.number().int().positive().default(300),
  AI_DEBOUNCE_PREFIX: z.string().min(1).default('ai-debounce'),
  AI_CLIENT_CLASSIFY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  AI_CLIENT_CLASSIFY_COOLDOWN_SEC: z.coerce.number().int().nonnegative().default(0),
  AI_BUSINESS_HOURS: z.string().optional(),
  AI_TIMEZONE: z.string().default('America/Sao_Paulo'),
  AI_AUDIO_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  AI_AUDIO_QUEUE_PREFIX: z.string().min(1).default('audio-queue'),
  AI_AUDIO_QUEUE_CHAT_SET: z.string().min(1).default('audio-queue-chats'),
  AI_AUDIO_MAX_SECONDS: z.coerce.number().int().positive().default(90),
  AI_AUDIO_MAX_BYTES: z.coerce.number().int().positive().default(10_000_000),
  AI_AUDIO_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  AI_AUDIO_TRANSCRIBE_MODEL: z.string().min(1).default('whisper-1'),
  AI_AUDIO_LANGUAGE: z.string().min(1).default('pt'),
  AI_AUDIO_FALLBACK_MODE: z.enum(['reply', 'silence']).default('reply'),
  AI_AUDIO_FALLBACK_TEXT: z
    .string()
    .default('Recebi seu audio, mas nao consegui transcrever. Pode enviar em texto?'),
  AI_AUDIO_TRANSCRIBE_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_AUDIO_TRANSCRIPTIONS_TABLE: z.string().min(1).default('ai_audio_transcriptions'),
  AI_MEDIA_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  AI_MEDIA_QUEUE_PREFIX: z.string().min(1).default('media-queue'),
  AI_MEDIA_QUEUE_CHAT_SET: z.string().min(1).default('media-queue-chats'),
  AI_MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(20_000_000),
  AI_MEDIA_PDF_MAX_PAGES: z.coerce.number().int().positive().default(10),
  AI_MEDIA_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  AI_MEDIA_PROCESS_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  AI_MEDIA_TABLE: z.string().min(1).default('ai_media_understandings'),
  AI_MEDIA_MODEL: z.string().min(1).default('gpt-5.2'),
  AI_CONFIG_TABLE: z.string().min(1).default('ai_configs'),
  AI_RESPONSE_TABLE: z.string().min(1).default('ai_responses'),
  AI_CONTEXT_PREFIX: z.string().min(1).default('ai-context'),
  AI_OPTOUT_PREFIX: z.string().min(1).default('ai-optout'),
  CHAT_AI_CONFIG_TABLE: z.string().min(1).default('chat_ai_configs'),
  CHAT_LABELS_TABLE: z.string().min(1).default('chat_labels'),
  CHAT_LABEL_ASSIGNMENTS_TABLE: z.string().min(1).default('chat_label_assignments'),
  QUICK_REPLIES_TABLE: z.string().min(1).default('quick_replies'),
  AI_SUGGESTIONS_TABLE: z.string().min(1).default('ai_field_suggestions'),
  ONBOARDING_EVENTS_TABLE: z.string().min(1).default('onboarding_events'),
  ONBOARDING_V2_ENABLED: z.preprocess(toBoolean, z.boolean()).default(true),
  ONBOARDING_WIZARD_ENABLED: z.preprocess(toBoolean, z.boolean()).default(true),
  ONBOARDING_GUIDED_TEST_ENABLED: z.preprocess(toBoolean, z.boolean()).default(true),
  ONBOARDING_NURTURE_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  ONBOARDING_NURTURE_SENDER_EMAIL: z.string().min(3).default('igsartor@icloud.com'),
  ONBOARDING_NURTURE_SENDER_SESSION_ID: z.string().optional(),
  ONBOARDING_NURTURE_DEFAULT_COUNTRY_CODE: z.string().min(1).default('55'),
  ONBOARDING_NURTURE_BR_STRIP_NINTH_DIGIT: z.preprocess(toBoolean, z.boolean()).default(true),
  ONBOARDING_NURTURE_WORKER_POLL_MS: z.coerce.number().int().positive().default(30000),
  ONBOARDING_NURTURE_RETRY_BASE_MS: z.coerce.number().int().positive().default(300000),
  ONBOARDING_NURTURE_RETRY_MAX_MS: z.coerce.number().int().positive().default(86400000),
  PAID_ATTRIBUTION_V1_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  PAID_ACTIVATION_7D_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  PAID_FUNNEL_ADMIN_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  PAID_CRO_AB_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  AFFILIATE_LINKS_TABLE: z.string().min(1).default('affiliate_links'),
  AFFILIATE_CLICKS_TABLE: z.string().min(1).default('affiliate_clicks'),
  AFFILIATE_ATTRIBUTIONS_TABLE: z.string().min(1).default('affiliate_attributions'),
  LEADS_TABLE: z.string().min(1).default('leads'),
  LEAD_CONVERSIONS_TABLE: z.string().min(1).default('lead_conversions'),
  CLIENTS_TABLE: z.string().min(1).default('clients'),
  SYSTEM_SETTINGS_TABLE: z.string().min(1).default('system_settings'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  FINDMYANGEL_INTEGRATION_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  FINDMYANGEL_INTEGRATION_SECRET: z.string().min(16).optional(),
  FINDMYANGEL_TARGET_SESSION_ID: z.string().min(1).optional(),
  FINDMYANGEL_TARGET_USER_EMAIL: z.string().min(3).default('angel@findmyangel.com'),
  FINDMYANGEL_BR_PREFERENCE_TABLE: z.string().min(1).default('findmyangel_br_preferences'),
  FINDMYANGEL_BR_FAILOVER_JOBS_TABLE: z.string().min(1).default('findmyangel_failover_jobs'),
  FINDMYANGEL_BR_FAILOVER_ENABLED: z.preprocess(toBoolean, z.boolean()).default(true),
  FINDMYANGEL_BR_FAILOVER_DELAY_MS: z.coerce.number().int().positive().default(60000),
  FINDMYANGEL_BR_FAILOVER_WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  FINDMYANGEL_BR_FAILOVER_WORKER_BATCH: z.coerce.number().int().positive().default(20),
  FINDMYANGEL_BR_FAILOVER_STALE_PROCESSING_MS: z.coerce.number().int().positive().default(120000),
  FINDMYANGEL_BR_FAILOVER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  FINDMYANGEL_BR_FAILOVER_RETRY_MS: z.coerce.number().int().positive().default(10000),
  FINDMYANGEL_BR_MEMORY_TTL_DAYS: z.coerce.number().int().nonnegative().default(30),
  // Some Brazilian numbers (fixed lines / legacy mobiles) may be stored without the 9th digit.
  // When enabled, we strip the "9" right after the DDD for +55 numbers (55DD9XXXXXXXX -> 55DDXXXXXXXX).
  FINDMYANGEL_BR_STRIP_NINTH_DIGIT: z.preprocess(toBoolean, z.boolean()).default(false),
  FINDMYANGEL_WELCOME_TEXT: z
    .string()
    .default(
      'Olá {name}! Bem-vindo(a) ao FindmyAngel. Sou o Seraphim. Responda esta mensagem se precisar de ajuda para começar.'
    ),
  FINDMYANGEL_DEFAULT_COUNTRY_CODE: z.string().min(1).default('55'),
  FINDMYANGEL_CONTEXT_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  FINDMYANGEL_CONTEXT_URL: z.string().min(8).optional(),
  FINDMYANGEL_CONTEXT_SECRET: z.string().min(16).optional(),
  FINDMYANGEL_CONTEXT_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  FINDMYANGEL_CONTEXT_CACHE_TTL_SEC: z.coerce.number().int().nonnegative().default(600),
  FINDMYANGEL_CONTEXT_MAX_BYTES: z.coerce.number().int().positive().default(40000),
  DANCING_POST_INTERACTION_ENABLED: z.preprocess(toBoolean, z.boolean()).default(false),
  DANCING_POST_INTERACTION_SECRET: z.string().min(16).optional(),
  AUTO_RESTORE_ON_BOOT: z.preprocess(toBoolean, z.boolean()).default(true),
  AUTO_RESTORE_MAX_SESSIONS: z.coerce.number().int().positive().default(25),
  AUTO_RESTORE_PARALLEL: z.coerce.number().int().positive().default(2),
  AUTO_RESTORE_BATCH_SIZE: z.coerce.number().int().nonnegative().default(0),
  AUTO_RESTORE_BATCH_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  AUTO_RESTORE_STATUSES: z.string().optional(),
  ADMIN_API_KEY: z.string().min(8).optional(),
  ADMIN_AUDIT_TABLE: z.string().min(1).default('admin_audit'),
  APP_PUBLIC_URL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_ID_PRO_MONTHLY: z.string().min(1).optional(),
  STRIPE_PRICE_ID_PRO_ANNUAL: z.string().min(1).optional(),
  STRIPE_PRICE_ID_ENTERPRISE_ANNUAL: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  AUTH_ENCRYPTION_KEY: z.string().min(32).optional(),
  AUTH_STATE_TABLE: z.string().min(1).default('auth_states'),
  AUTH_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(300000),
  AUTH_CACHE_DIR: z.string().optional(),
  SESSIONS_DIR: z.string().default('/data/sessions-b'),
  STATUS_CACHE_TTL_MS: z.coerce.number().int().nonnegative().default(86400000),
  STATUS_CACHE_PREFIX: z.string().min(1).default('session-status'),
  STATUS_HISTORY_TABLE: z.string().min(1).default('session_status_events'),
  QR_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(5000),
  QR_THROTTLE_PREFIX: z.string().min(1).default('qr-throttle'),
  SESSION_START_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  SESSION_START_CONCURRENCY: z.coerce.number().int().positive().default(3),
  SESSION_MAX_PER_WORKER: z.coerce.number().int().nonnegative().default(10),
  SESSION_LOCK_TTL_MS: z.coerce.number().int().positive().default(30000),
  SESSION_LOCK_RENEW_MS: z.coerce.number().int().positive().default(10000),
  SESSION_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(60000),
  SESSION_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(900000),
  SESSION_BACKOFF_RESET_MS: z.coerce.number().int().positive().default(3600000),
  SESSION_DRIVER: z.enum(['baileys', 'noop']).default('baileys'),
  MEDIA_DOWNLOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  MEDIA_DOWNLOAD_MAX_BYTES: z.coerce.number().int().positive().default(16777216),
  SESSION_SHARD_COUNT: z.coerce.number().int().nonnegative().default(0),
  SESSION_SHARD_INDEX: z.coerce.number().int().nonnegative().default(0),
  SESSION_RECONCILE_INTERVAL_MS: z.coerce.number().int().nonnegative().default(300000),
  SESSION_AUTO_PURGE_BAD_DECRYPT: z.preprocess(toBoolean, z.boolean()).default(false),
  SESSION_AUTO_PURGE_BAD_DECRYPT_THRESHOLD: z.coerce.number().int().positive().default(3),
  SESSION_AUTO_PURGE_BAD_DECRYPT_WINDOW_MS: z.coerce.number().int().positive().default(120000),
  NOOP_READY_DELAY_MS: z.coerce.number().int().nonnegative().default(50),
  NOOP_DISCONNECT_AFTER_MS: z.coerce.number().int().nonnegative().optional(),
  NOOP_MESSAGE_STATUS_DELAY_MS: z.coerce.number().int().nonnegative().optional(),
  NOOP_FAIL_START_RATE: z.coerce.number().min(0).max(1).default(0),
  INBOUND_MESSAGES_TABLE: z.string().min(1).default('inbound_messages'),
  INBOUND_QUEUE_PREFIX: z.string().min(1).default('inbound-queue'),
  INBOUND_QUEUE_CHAT_SET: z.string().min(1).default('inbound-queue-chats'),
  INBOUND_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  INBOUND_COMPACT_AFTER_DAYS: z.coerce.number().int().positive().default(7),
  INBOUND_CLEANUP_INTERVAL_MS: z.coerce.number().int().nonnegative().default(3600000),
  OUTBOUND_MESSAGES_TABLE: z.string().min(1).default('outbound_messages'),
  OUTBOUND_QUEUE_PREFIX: z.string().min(1).default('outbound-queue'),
  OUTBOUND_QUEUE_CHAT_SET: z.string().min(1).default('outbound-queue-chats'),
  OUTBOUND_RATE_LIMIT_SESSION_MS: z.coerce.number().int().nonnegative().default(1000),
  OUTBOUND_RATE_LIMIT_CHAT_MS: z.coerce.number().int().nonnegative().default(1500),
  OUTBOUND_RATE_LIMIT_PREFIX: z.string().min(1).default('outbound-rate'),
  OUTBOUND_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  OUTBOUND_RETRY_BASE_MS: z.coerce.number().int().positive().default(5000),
  OUTBOUND_RETRY_MAX_MS: z.coerce.number().int().positive().default(60000),
  OUTBOUND_WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  OUTBOUND_WORKER_MAX_PER_CHAT: z.coerce.number().int().positive().default(25),
  OUTBOUND_MEDIA_TTL_DAYS: z.coerce.number().int().positive().default(15),
  OUTBOUND_MEDIA_CLEANUP_INTERVAL_MS: z.coerce.number().int().nonnegative().default(3600000),
  OUTBOUND_MEDIA_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().default(200),
  BROADCAST_LISTS_TABLE: z.string().min(1).default('broadcast_lists'),
  BROADCAST_CONTACTS_TABLE: z.string().min(1).default('broadcast_list_contacts'),
  BROADCAST_JOBS_TABLE: z.string().min(1).default('broadcast_jobs'),
  BROADCAST_ITEMS_TABLE: z.string().min(1).default('broadcast_items'),
  BROADCAST_DEFAULT_COUNTRY_CODE: z.string().min(1).default('55'),
  // Brazil quirk: some WhatsApp accounts still resolve without the extra 9 digit (55 + DDD + 9 + XXXXXXXX).
  // Default enabled to match our current BR production behavior; can be disabled explicitly via env var.
  BROADCAST_BR_STRIP_NINTH_DIGIT: z.preprocess(toBoolean, z.boolean()).default(true),
  BROADCAST_MAX_CONTACTS_PER_LIST: z.coerce.number().int().positive().default(5000),
  BROADCAST_MAX_CONTACTS_PER_JOB: z.coerce.number().int().positive().default(3000),
  BROADCAST_WORKER_POLL_MS: z.coerce.number().int().positive().default(250),
  BROADCAST_WORKER_MAX_IN_FLIGHT: z.coerce.number().int().positive().default(3),
  BROADCAST_DELAY_MIN_MS: z.coerce.number().int().positive().default(1000),
  BROADCAST_DELAY_MAX_MS: z.coerce.number().int().positive().default(3000),
  BROADCAST_YIELD_OUTBOUND_MS: z.coerce.number().int().positive().default(2000),
  BROADCAST_SUCCESS_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  BROADCAST_SEND_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  BROADCAST_DISCONNECT_PAUSE_GRACE_MS: z.coerce.number().int().positive().default(45000),
  BROADCAST_YIELD_INBOUND_TTL_SEC: z.coerce.number().int().positive().default(15),
  BROADCAST_TRAFFIC_PREFIX: z.string().min(1).default('session-traffic'),
  CHAT_STATE_TABLE: z.string().min(1).default('chat_state'),
  OBS_ALERT_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60000),
  OBS_ERROR_RATE_THRESHOLD: z.coerce.number().int().nonnegative().default(10),
  OBS_QUEUE_CHAT_THRESHOLD: z.coerce.number().int().nonnegative().default(100)
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const message = parsed.error.flatten().fieldErrors
    throw new Error(`Invalid environment variables: ${JSON.stringify(message)}`)
  }

  return parsed.data
}
