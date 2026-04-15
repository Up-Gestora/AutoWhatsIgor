import type { LeadStore } from '../leads'
import type { OutboundMessageService } from '../messages'
import { admin, getFirestoreAdmin } from '../firebase/admin'
import type {
  EnqueueFindmyangelFailoverJobInput,
  FindmyangelFailoverJobStore,
  FindmyangelWhatsappVariant,
  FindmyangelBrPreferenceStore
} from './findmyangelDelivery'

export type FindmyangelUserCreatedPayload = {
  userId: string
  name?: string | null
  email?: string | null
  whatsapp: string
  createdAtMs?: number | null
}

export type FindmyangelUserCreatedResult = {
  sessionId: string
  leadId: string
  chatId: string
  outboundId: number
  resolution?: FindmyangelWhatsappResolution
  failoverScheduled?: boolean
}

export type FindmyangelTemplateMessagePayload = {
  userId: string
  source?: string | null
  whatsapp: string
  name?: string | null
  text: string
  template: {
    id: string
    name?: string | null
    subject?: string | null
    occasion?: string | null
  }
  requestedBy?: string | null
  profileNumber?: number | null
  requestedAtMs?: number | null
}

export type FindmyangelTemplateMessageResult = {
  sessionId: string
  leadId: string
  chatId: string
  outboundId: number
  resolution?: FindmyangelWhatsappResolution
  failoverScheduled?: boolean
}

export type FindmyangelWhatsappResolutionReason =
  | 'exists_with9'
  | 'exists_without9'
  | 'both_exists'
  | 'both_exists_preferred'
  | 'both_unknown'
  | 'both_unknown_preferred'
  | 'check_failed'
  | 'check_failed_preferred'

export type FindmyangelWhatsappResolution = {
  strategy: 'auto_detect'
  chosen: FindmyangelWhatsappVariant
  reason: FindmyangelWhatsappResolutionReason
  existsWith9: boolean | null
  existsWithout9: boolean | null
  preferredVariantBefore: FindmyangelWhatsappVariant | null
}

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type FindmyangelIntegrationEnv = {
  FINDMYANGEL_TARGET_SESSION_ID?: string
  FINDMYANGEL_TARGET_USER_EMAIL?: string
  FINDMYANGEL_BR_STRIP_NINTH_DIGIT?: boolean
  FINDMYANGEL_BR_FAILOVER_ENABLED?: boolean
  FINDMYANGEL_BR_FAILOVER_DELAY_MS?: number
  FINDMYANGEL_WELCOME_TEXT: string
  FINDMYANGEL_DEFAULT_COUNTRY_CODE: string
}

type FindmyangelIntegrationDeps = {
  leadStore: Pick<LeadStore, 'upsertFromClient'>
  outboundService: Pick<OutboundMessageService, 'enqueueText'>
  whatsappLookup?: {
    checkWhatsappNumbers(sessionId: string, phoneNumbers: string[]): Promise<Array<{ phoneNumber: string; exists: boolean }>>
  }
  whatsappPreferenceStore?: Pick<FindmyangelBrPreferenceStore, 'getPreferredVariant'>
  failoverJobStore?: Pick<FindmyangelFailoverJobStore, 'enqueue'>
  logger?: Logger
  now?: () => number
}

const SESSION_ID_CACHE_TTL_MS = 10 * 60 * 1000
const WHATSAPP_LOOKUP_TIMEOUT_MS = 1_500
const sessionIdByEmailCache = new Map<string, { sessionId: string; expiresAt: number }>()

export function normalizeFindmyangelWhatsappToE164Digits(
  input: string,
  defaultCountryCode: string,
  options?: { brStripNinthDigit?: boolean }
): string {
  const raw = (input ?? '').trim()
  if (!raw) {
    throw new Error('invalid_whatsapp')
  }

  const digits = raw.replace(/\D/g, '')
  if (!digits) {
    throw new Error('invalid_whatsapp')
  }

  const isInternational = raw.startsWith('+')
  const country = (defaultCountryCode ?? '').replace(/\D/g, '')
  let normalized = digits

  // If the number is not explicitly international (+), accept BR-style inputs without the DDI:
  // - 10 digits: DDD + landline/legacy (8 digits)
  // - 11 digits: DDD + mobile (9 digits)
  if (!isInternational && (digits.length === 10 || digits.length === 11)) {
    if (!country) {
      throw new Error('invalid_default_country_code')
    }
    normalized = `${country}${digits}`
  }

  // Optional Brazil-specific fix: strip the 9th digit (right after DDD) for +55 numbers.
  if (options?.brStripNinthDigit && normalized.startsWith('55') && normalized.length === 13) {
    // 55 + DDD(2) + 9 + XXXXXXXX(8)
    if (normalized[4] === '9') {
      normalized = `${normalized.slice(0, 4)}${normalized.slice(5)}`
    }
  }

  if (normalized.length < 7 || normalized.length > 15) {
    throw new Error('invalid_whatsapp')
  }

  return normalized
}

export function toUserJid(e164Digits: string): string {
  const trimmed = (e164Digits ?? '').trim()
  if (!trimmed) {
    throw new Error('invalid_whatsapp')
  }
  return `${trimmed}@s.whatsapp.net`
}

type FindmyangelWhatsappCandidate = {
  kind: FindmyangelWhatsappVariant
  digits: string
}

export function normalizeFindmyangelWhatsappCandidates(
  input: string,
  defaultCountryCode: string
): FindmyangelWhatsappCandidate[] {
  const normalized = normalizeFindmyangelWhatsappToE164Digits(input, defaultCountryCode, {
    brStripNinthDigit: false
  })

  const candidates: FindmyangelWhatsappCandidate[] = []
  const withoutNineDigits =
    normalized.startsWith('55') && normalized.length === 13 && normalized[4] === '9'
      ? `${normalized.slice(0, 4)}${normalized.slice(5)}`
      : null

  if (withoutNineDigits) {
    candidates.push({ kind: 'with9', digits: normalized })
    candidates.push({ kind: 'without9', digits: withoutNineDigits })
    return candidates
  }

  if (normalized.startsWith('55') && normalized.length === 12) {
    candidates.push({ kind: 'without9', digits: normalized })
    return candidates
  }

  candidates.push({ kind: 'with9', digits: normalized })
  return candidates
}

type FindmyangelFailoverPlan = {
  brBaseKey: string
  primaryVariant: FindmyangelWhatsappVariant
  alternateVariant: FindmyangelWhatsappVariant
  primaryChatId: string
  alternateChatId: string
}

type FindmyangelResolvedWhatsapp = {
  e164Digits: string
  chatId: string
  resolution: FindmyangelWhatsappResolution
  failoverPlan: FindmyangelFailoverPlan | null
}

async function resolveFindmyangelWhatsapp(options: {
  whatsappRaw: string
  sessionId: string
  env: FindmyangelIntegrationEnv
  deps: FindmyangelIntegrationDeps
}): Promise<FindmyangelResolvedWhatsapp> {
  const candidates = normalizeFindmyangelWhatsappCandidates(options.whatsappRaw, options.env.FINDMYANGEL_DEFAULT_COUNTRY_CODE)
  const with9Candidate = candidates.find((candidate) => candidate.kind === 'with9') ?? null
  const without9Candidate = candidates.find((candidate) => candidate.kind === 'without9') ?? null
  const brBaseKey = without9Candidate?.digits ?? null
  const preferredVariantBefore =
    brBaseKey && options.deps.whatsappPreferenceStore
      ? await resolvePreferredVariant({
          sessionId: options.sessionId,
          brBaseKey,
          deps: options.deps
        })
      : null

  if (!with9Candidate || !without9Candidate) {
    const chosen = with9Candidate ?? without9Candidate
    if (!chosen) {
      throw new Error('invalid_whatsapp')
    }
    return {
      e164Digits: chosen.digits,
      chatId: toUserJid(chosen.digits),
      failoverPlan: null,
      resolution: {
        strategy: 'auto_detect',
        chosen: chosen.kind,
        reason: 'both_unknown',
        existsWith9: null,
        existsWithout9: null,
        preferredVariantBefore
      }
    }
  }

  let with9Exists: boolean | null = null
  let without9Exists: boolean | null = null

  try {
    with9Exists = await probeWhatsappCandidate({
      sessionId: options.sessionId,
      candidateDigits: with9Candidate.digits,
      deps: options.deps
    })
    without9Exists = await probeWhatsappCandidate({
      sessionId: options.sessionId,
      candidateDigits: without9Candidate.digits,
      deps: options.deps
    })
  } catch (error) {
    options.deps.logger?.warn?.('FindmyAngel WhatsApp auto-detect check failed', {
      sessionId: options.sessionId,
      with9: maskWhatsappDigits(with9Candidate.digits),
      without9: maskWhatsappDigits(without9Candidate.digits),
      error: (error as Error).message
    })

    const chosenVariant = preferredVariantBefore ?? 'with9'
    const chosenCandidate = chosenVariant === 'without9' ? without9Candidate : with9Candidate
    return buildResolvedWhatsapp({
      with9Candidate,
      without9Candidate,
      chosenCandidate,
      reason: preferredVariantBefore ? 'check_failed_preferred' : 'check_failed',
      existsWith9: null,
      existsWithout9: null,
      preferredVariantBefore
    })
  }

  if (with9Exists === false && without9Exists === false) {
    throw new Error('whatsapp_not_found')
  }

  if (with9Exists === true && without9Exists === true) {
    const chosenVariant = preferredVariantBefore ?? 'with9'
    const chosenCandidate = chosenVariant === 'without9' ? without9Candidate : with9Candidate
    return buildResolvedWhatsapp({
      with9Candidate,
      without9Candidate,
      chosenCandidate,
      reason: preferredVariantBefore ? 'both_exists_preferred' : 'both_exists',
      existsWith9: with9Exists,
      existsWithout9: without9Exists,
      preferredVariantBefore
    })
  }

  if (with9Exists === true && without9Exists !== true) {
    return buildResolvedWhatsapp({
      with9Candidate,
      without9Candidate,
      chosenCandidate: with9Candidate,
      reason: 'exists_with9',
      existsWith9: with9Exists,
      existsWithout9: without9Exists,
      preferredVariantBefore
    })
  }

  if (with9Exists !== true && without9Exists === true) {
    return buildResolvedWhatsapp({
      with9Candidate,
      without9Candidate,
      chosenCandidate: without9Candidate,
      reason: 'exists_without9',
      existsWith9: with9Exists,
      existsWithout9: without9Exists,
      preferredVariantBefore
    })
  }

  const chosenVariant = preferredVariantBefore ?? 'with9'
  const chosenCandidate = chosenVariant === 'without9' ? without9Candidate : with9Candidate
  return buildResolvedWhatsapp({
    with9Candidate,
    without9Candidate,
    chosenCandidate,
    reason: preferredVariantBefore ? 'both_unknown_preferred' : 'both_unknown',
    existsWith9: with9Exists,
    existsWithout9: without9Exists,
    preferredVariantBefore
  })
}

function buildResolvedWhatsapp(input: {
  with9Candidate: FindmyangelWhatsappCandidate
  without9Candidate: FindmyangelWhatsappCandidate
  chosenCandidate: FindmyangelWhatsappCandidate
  reason: FindmyangelWhatsappResolutionReason
  existsWith9: boolean | null
  existsWithout9: boolean | null
  preferredVariantBefore: FindmyangelWhatsappVariant | null
}): FindmyangelResolvedWhatsapp {
  const chosen = input.chosenCandidate
  const alternate = chosen.kind === 'with9' ? input.without9Candidate : input.with9Candidate

  return {
    e164Digits: chosen.digits,
    chatId: toUserJid(chosen.digits),
    failoverPlan: {
      brBaseKey: input.without9Candidate.digits,
      primaryVariant: chosen.kind,
      alternateVariant: alternate.kind,
      primaryChatId: toUserJid(chosen.digits),
      alternateChatId: toUserJid(alternate.digits)
    },
    resolution: {
      strategy: 'auto_detect',
      chosen: chosen.kind,
      reason: input.reason,
      existsWith9: input.existsWith9,
      existsWithout9: input.existsWithout9,
      preferredVariantBefore: input.preferredVariantBefore
    }
  }
}

async function resolvePreferredVariant(options: {
  sessionId: string
  brBaseKey: string
  deps: FindmyangelIntegrationDeps
}): Promise<FindmyangelWhatsappVariant | null> {
  if (!options.deps.whatsappPreferenceStore) {
    return null
  }

  try {
    return await options.deps.whatsappPreferenceStore.getPreferredVariant(options.sessionId, options.brBaseKey)
  } catch (error) {
    options.deps.logger?.warn?.('FindmyAngel preferred variant lookup failed', {
      sessionId: options.sessionId,
      brBaseKey: maskWhatsappDigits(options.brBaseKey),
      error: (error as Error).message
    })
    return null
  }
}

async function probeWhatsappCandidate(options: {
  sessionId: string
  candidateDigits: string
  deps: FindmyangelIntegrationDeps
}): Promise<boolean | null> {
  if (!options.deps.whatsappLookup) {
    return null
  }

  const lookupResults = await withTimeout(
    options.deps.whatsappLookup.checkWhatsappNumbers(options.sessionId, [options.candidateDigits]),
    WHATSAPP_LOOKUP_TIMEOUT_MS
  )

  if (!Array.isArray(lookupResults) || lookupResults.length === 0) {
    return null
  }

  const matchingRow = lookupResults.find((row) => normalizeLookupPhoneDigits(row?.phoneNumber) === options.candidateDigits)
  if (matchingRow) {
    return matchingRow.exists === true
  }

  const firstRow = lookupResults[0]
  if (firstRow && typeof firstRow.exists === 'boolean') {
    return firstRow.exists
  }

  return null
}

function normalizeLookupPhoneDigits(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.replace(/\D/g, '')
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise
  }

  let timer: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('whatsapp_lookup_timeout'))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}

function maskWhatsappDigits(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  if (digits.length <= 4) {
    return digits
  }
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`
}

function resolveFindmyangelFailoverDelayMs(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : NaN
  if (Number.isFinite(parsed) && parsed >= 1_000) {
    return parsed
  }
  return 60_000
}

function isFindmyangelFailoverEnabled(env: FindmyangelIntegrationEnv): boolean {
  return env.FINDMYANGEL_BR_FAILOVER_ENABLED !== false
}

async function scheduleFindmyangelFailover(options: {
  flow: EnqueueFindmyangelFailoverJobInput['flow']
  requestId: string
  userId: string
  templateId?: string | null
  sessionId: string
  text: string
  primaryOutboundId: number
  resolvedWhatsapp: FindmyangelResolvedWhatsapp
  env: FindmyangelIntegrationEnv
  deps: FindmyangelIntegrationDeps
  nowMs: number
}): Promise<boolean> {
  if (!isFindmyangelFailoverEnabled(options.env)) {
    return false
  }
  if (!options.deps.failoverJobStore) {
    return false
  }
  if (!options.requestId || !options.resolvedWhatsapp.failoverPlan) {
    return false
  }

  const resolution = options.resolvedWhatsapp.resolution
  const alternateKnownMissing =
    resolution.chosen === 'with9' ? resolution.existsWithout9 === false : resolution.existsWith9 === false
  if (alternateKnownMissing) {
    return false
  }

  const plan = options.resolvedWhatsapp.failoverPlan
  const runAtMs = options.nowMs + resolveFindmyangelFailoverDelayMs(options.env.FINDMYANGEL_BR_FAILOVER_DELAY_MS)

  try {
    const result = await options.deps.failoverJobStore.enqueue({
      requestId: options.requestId,
      sessionId: options.sessionId,
      flow: options.flow,
      userId: options.userId,
      templateId: options.templateId ?? null,
      brBaseKey: plan.brBaseKey,
      primaryVariant: plan.primaryVariant,
      alternateVariant: plan.alternateVariant,
      primaryChatId: plan.primaryChatId,
      alternateChatId: plan.alternateChatId,
      text: options.text,
      primaryOutboundId: options.primaryOutboundId,
      runAtMs
    })
    return result.scheduled
  } catch (error) {
    options.deps.logger?.warn?.('FindmyAngel failover scheduling failed', {
      requestId: options.requestId,
      sessionId: options.sessionId,
      userId: options.userId,
      templateId: options.templateId ?? null,
      error: (error as Error).message
    })
    return false
  }
}

export function renderWelcomeText(
  template: string,
  vars: { name?: string | null; email?: string | null }
): string {
  const base = typeof template === 'string' ? template : ''
  const name = typeof vars.name === 'string' ? vars.name.trim() : ''
  const email = typeof vars.email === 'string' ? vars.email.trim() : ''

  return base
    .replace(/\{name\}/g, name)
    .replace(/\{email\}/g, email)
    .replace(/\s+([!?.;,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function resolveTargetSessionId(env: FindmyangelIntegrationEnv, deps: FindmyangelIntegrationDeps): Promise<string> {
  const explicitSessionId = env.FINDMYANGEL_TARGET_SESSION_ID?.trim()
  if (explicitSessionId) {
    return explicitSessionId
  }

  const email = env.FINDMYANGEL_TARGET_USER_EMAIL?.trim()
  if (!email) {
    throw new Error('findmyangel_target_session_missing')
  }

  const now = deps.now?.() ?? Date.now()
  const cached = sessionIdByEmailCache.get(email)
  if (cached && cached.expiresAt > now) {
    return cached.sessionId
  }

  const db = getFirestoreAdmin()
  if (!db) {
    throw new Error('firebase_admin_unavailable')
  }

  try {
    const record = await admin.auth().getUserByEmail(email)
    const sessionId = record.uid
    sessionIdByEmailCache.set(email, { sessionId, expiresAt: now + SESSION_ID_CACHE_TTL_MS })
    return sessionId
  } catch (error) {
    deps.logger?.warn?.('FindmyAngel session lookup failed', {
      error: (error as Error).message
    })
    throw new Error('findmyangel_target_session_lookup_failed')
  }
}

export async function handleFindmyangelUserCreated(options: {
  payload: FindmyangelUserCreatedPayload
  idempotencyKey?: string | null
  env: FindmyangelIntegrationEnv
  deps: FindmyangelIntegrationDeps
}): Promise<FindmyangelUserCreatedResult> {
  const { payload, env, deps } = options
  const now = deps.now?.() ?? Date.now()

  const userId = payload.userId?.trim()
  if (!userId) {
    throw new Error('userId is required')
  }

  const whatsappRaw = payload.whatsapp?.trim()
  if (!whatsappRaw) {
    throw new Error('whatsapp is required')
  }

  const sessionId = await resolveTargetSessionId(env, deps)
  const resolvedWhatsapp = await resolveFindmyangelWhatsapp({
    whatsappRaw,
    sessionId,
    env,
    deps
  })
  const e164Digits = resolvedWhatsapp.e164Digits
  const chatId = resolvedWhatsapp.chatId
  const leadId = chatId

  deps.logger?.info?.('FindmyAngel WhatsApp auto-detect resolved', {
    sessionId,
    userId,
    strategy: resolvedWhatsapp.resolution.strategy,
    chosen: resolvedWhatsapp.resolution.chosen,
    reason: resolvedWhatsapp.resolution.reason,
    existsWith9: resolvedWhatsapp.resolution.existsWith9,
    existsWithout9: resolvedWhatsapp.resolution.existsWithout9,
    preferredVariantBefore: resolvedWhatsapp.resolution.preferredVariantBefore,
    whatsapp: maskWhatsappDigits(e164Digits)
  })

  const createdAtMs =
    typeof payload.createdAtMs === 'number' && Number.isFinite(payload.createdAtMs)
      ? payload.createdAtMs
      : now

  const name = payload.name ?? null
  const email = payload.email ?? null

  const observations = email
    ? `[FindmyAngel] email=${email} uid=${userId}`
    : `[FindmyAngel] uid=${userId}`

  await deps.leadStore.upsertFromClient({
    sessionId,
    leadId,
    name,
    whatsapp: e164Digits,
    chatId,
    lastContactAtMs: now,
    createdAtMs,
    source: 'findmyangel',
    observations,
    lastMessage: null
  })

  const template = env.FINDMYANGEL_WELCOME_TEXT?.trim()
  if (!template) {
    throw new Error('findmyangel_welcome_text_missing')
  }

  const welcomeText = renderWelcomeText(template, { name, email })
  if (!welcomeText) {
    throw new Error('findmyangel_welcome_text_missing')
  }

  const requestId =
    (options.idempotencyKey ?? '').trim() || `findmyangel:user:${userId}:welcome-v1`

  const outbound = await deps.outboundService.enqueueText({
    sessionId,
    chatId,
    text: welcomeText,
    idempotencyKey: requestId,
    origin: 'automation_api'
  })

  const failoverScheduled = await scheduleFindmyangelFailover({
    flow: 'user-created',
    requestId,
    userId,
    sessionId,
    text: welcomeText,
    primaryOutboundId: outbound.id,
    resolvedWhatsapp,
    env,
    deps,
    nowMs: now
  })

  return {
    sessionId,
    leadId,
    chatId,
    outboundId: outbound.id,
    resolution: resolvedWhatsapp.resolution,
    failoverScheduled
  }
}

export async function handleFindmyangelTemplateMessage(options: {
  payload: FindmyangelTemplateMessagePayload
  idempotencyKey: string
  env: FindmyangelIntegrationEnv
  deps: FindmyangelIntegrationDeps
}): Promise<FindmyangelTemplateMessageResult> {
  const { payload, env, deps } = options
  const now = deps.now?.() ?? Date.now()

  const requestId = options.idempotencyKey?.trim()
  if (!requestId) {
    throw new Error('idempotency_key_required')
  }

  const userId = payload.userId?.trim()
  if (!userId) {
    throw new Error('userId_required')
  }

  const templateId = payload.template?.id?.trim()
  if (!templateId) {
    throw new Error('template_id_required')
  }

  const whatsappRaw = payload.whatsapp?.trim()
  if (!whatsappRaw) {
    throw new Error('whatsapp_required')
  }

  const text = payload.text?.trim()
  if (!text) {
    throw new Error('message_required')
  }

  const sessionId = await resolveTargetSessionId(env, deps)
  const resolvedWhatsapp = await resolveFindmyangelWhatsapp({
    whatsappRaw,
    sessionId,
    env,
    deps
  })
  const e164Digits = resolvedWhatsapp.e164Digits
  const chatId = resolvedWhatsapp.chatId
  const leadId = chatId

  const createdAtMs =
    typeof payload.requestedAtMs === 'number' && Number.isFinite(payload.requestedAtMs)
      ? payload.requestedAtMs
      : now

  const name = payload.name?.trim() || null
  const source = payload.source?.trim() || 'admin-users-modal'
  const requestedBy = payload.requestedBy?.trim() || 'unknown'

  const observations = `[FindmyAngel][Template] uid=${userId} template=${templateId} requestedBy=${requestedBy} source=${source}`

  deps.logger?.info?.('FindmyAngel WhatsApp auto-detect resolved', {
    sessionId,
    userId,
    templateId,
    strategy: resolvedWhatsapp.resolution.strategy,
    chosen: resolvedWhatsapp.resolution.chosen,
    reason: resolvedWhatsapp.resolution.reason,
    existsWith9: resolvedWhatsapp.resolution.existsWith9,
    existsWithout9: resolvedWhatsapp.resolution.existsWithout9,
    preferredVariantBefore: resolvedWhatsapp.resolution.preferredVariantBefore,
    whatsapp: maskWhatsappDigits(e164Digits)
  })

  await deps.leadStore.upsertFromClient({
    sessionId,
    leadId,
    name,
    whatsapp: e164Digits,
    chatId,
    lastContactAtMs: now,
    createdAtMs,
    source: 'findmyangel',
    observations,
    lastMessage: null
  })

  const outbound = await deps.outboundService.enqueueText({
    sessionId,
    chatId,
    text,
    idempotencyKey: requestId,
    origin: 'automation_api'
  })

  const failoverScheduled = await scheduleFindmyangelFailover({
    flow: 'template-message',
    requestId,
    userId,
    templateId,
    sessionId,
    text,
    primaryOutboundId: outbound.id,
    resolvedWhatsapp,
    env,
    deps,
    nowMs: now
  })

  return {
    sessionId,
    leadId,
    chatId,
    outboundId: outbound.id,
    resolution: resolvedWhatsapp.resolution,
    failoverScheduled
  }
}
