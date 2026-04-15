import { admin, getFirestoreAdmin } from '../firebase/admin'
import type { LeadStore } from '../leads'
import type { MetricsStore } from '../observability/metrics'
import { normalizeWhatsappToE164Digits, toUserJid } from '../whatsapp/normalize'
import type { OnboardingEventName, OnboardingState } from './types'

const ENROLLMENT_EVENT_NAMES = new Set<OnboardingEventName>(['signup_completed', 'whatsapp_saved'])
const ONBOARDING_CAMPAIGN_TYPE = 'onboarding_activation' as const
const ONBOARDING_CAMPAIGN_SOURCE = 'autowhats_onboarding'
const SESSION_ID_CACHE_TTL_MS = 10 * 60 * 1000

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
  email: string | null
  whatsapp: string | null
  telefone: string | null
}

type ProfileResolver = {
  getUserProfile(sessionId: string): Promise<UserProfile | null>
}

type OnboardingStateProvider = {
  getState(sessionId: string): Promise<OnboardingState>
}

type OnboardingNurtureServiceOptions = {
  enabled: boolean
  senderEmail?: string
  senderSessionId?: string
  defaultCountryCode: string
  brStripNinthDigit: boolean
  leadStore: Pick<LeadStore, 'get' | 'upsertFromClient' | 'update'>
  onboardingStateProvider?: OnboardingStateProvider
  logger?: Logger
  metrics?: Pick<MetricsStore, 'increment'>
  now?: () => number
  identityResolver?: IdentityResolver
  profileResolver?: ProfileResolver
}

type HandleOnboardingEventInput = {
  sessionId: string
  eventName: OnboardingEventName
  properties?: Record<string, unknown>
}

export class OnboardingNurtureService {
  private readonly enabled: boolean
  private readonly senderEmail: string | null
  private readonly senderSessionId: string | null
  private readonly defaultCountryCode: string
  private readonly brStripNinthDigit: boolean
  private readonly leadStore: Pick<LeadStore, 'get' | 'upsertFromClient' | 'update'>
  private readonly onboardingStateProvider?: OnboardingStateProvider
  private readonly logger: Logger
  private readonly metrics?: Pick<MetricsStore, 'increment'>
  private readonly now: () => number
  private readonly identityResolver?: IdentityResolver
  private readonly profileResolver?: ProfileResolver

  constructor(options: OnboardingNurtureServiceOptions) {
    this.enabled = options.enabled
    this.senderEmail = normalizeOptionalText(options.senderEmail)
    this.senderSessionId = normalizeOptionalText(options.senderSessionId)
    this.defaultCountryCode = (options.defaultCountryCode || '55').trim()
    this.brStripNinthDigit = options.brStripNinthDigit
    this.leadStore = options.leadStore
    this.onboardingStateProvider = options.onboardingStateProvider
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.now = options.now ?? (() => Date.now())
    this.identityResolver = options.identityResolver
    this.profileResolver = options.profileResolver
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async handleOnboardingEvent(input: HandleOnboardingEventInput): Promise<{ enrolled: boolean; reason?: string }> {
    const targetSessionId = normalizeRequiredText(input.sessionId)
    if (!targetSessionId) {
      return { enrolled: false, reason: 'missing_session' }
    }
    if (!this.enabled) {
      return { enrolled: false, reason: 'disabled' }
    }
    if (!ENROLLMENT_EVENT_NAMES.has(input.eventName)) {
      return { enrolled: false, reason: 'event_not_supported' }
    }

    const senderSessionId = await this.resolveSenderSessionId()
    if (!senderSessionId) {
      return { enrolled: false, reason: 'sender_not_configured' }
    }
    if (senderSessionId === targetSessionId) {
      return { enrolled: false, reason: 'self_session' }
    }

    const activated = await this.isTargetSessionActivated(targetSessionId)
    if (activated) {
      return { enrolled: false, reason: 'already_activated' }
    }

    const profile = await this.resolveUserProfile(targetSessionId)
    const rawWhatsapp = resolveWhatsappFromSources(input.properties, profile)
    if (!rawWhatsapp) {
      this.metrics?.increment('onboarding_nurture.errors')
      return { enrolled: false, reason: 'missing_whatsapp' }
    }

    let normalizedWhatsapp: string
    try {
      normalizedWhatsapp = normalizeWhatsappToE164Digits(rawWhatsapp, this.defaultCountryCode, {
        brStripNinthDigit: this.brStripNinthDigit
      })
    } catch (error) {
      this.logger.warn?.('Onboarding nurture skipped due to invalid whatsapp', {
        targetSessionId,
        error: (error as Error).message
      })
      this.metrics?.increment('onboarding_nurture.errors')
      return { enrolled: false, reason: 'invalid_whatsapp' }
    }

    const chatId = toUserJid(normalizedWhatsapp)
    const now = this.now()
    const existing = await this.leadStore.get(senderSessionId, chatId)

    if (existing?.status === 'inativo') {
      return { enrolled: false, reason: 'lead_inactive' }
    }

    const campaignAttempt =
      existing?.campaign?.type === ONBOARDING_CAMPAIGN_TYPE && existing.campaign.targetSessionId === targetSessionId
        ? existing.campaign.attempt
        : 0

    const upserted = await this.leadStore.upsertFromClient({
      sessionId: senderSessionId,
      leadId: chatId,
      name: existing?.name ?? profile?.name ?? null,
      whatsapp: normalizedWhatsapp,
      chatId,
      status: 'em_processo',
      lastContactAtMs: existing?.lastContact ?? now,
      nextContactAtMs: existing?.nextContact ?? now,
      observations: buildOnboardingObservation(existing?.observations ?? null, targetSessionId, input.eventName),
      createdAtMs: existing?.createdAt ?? now,
      lastMessage: existing?.lastMessage ?? null,
      source: existing?.source ?? ONBOARDING_CAMPAIGN_SOURCE,
      campaignType: ONBOARDING_CAMPAIGN_TYPE,
      campaignTargetSessionId: targetSessionId,
      campaignAttempt
    })

    if (upserted.status !== 'em_processo') {
      await this.leadStore.update(senderSessionId, chatId, {
        status: 'em_processo',
        ...(upserted.nextContact ? {} : { nextContact: now }),
        campaignType: ONBOARDING_CAMPAIGN_TYPE,
        campaignTargetSessionId: targetSessionId,
        campaignAttempt
      })
    }

    this.metrics?.increment('onboarding_nurture.enrolled')
    this.logger.info?.('Onboarding nurture lead enrolled', {
      senderSessionId,
      targetSessionId,
      chatId,
      eventName: input.eventName
    })

    return { enrolled: true }
  }

  private async isTargetSessionActivated(targetSessionId: string): Promise<boolean> {
    if (!this.onboardingStateProvider) {
      return false
    }
    try {
      const state = await this.onboardingStateProvider.getState(targetSessionId)
      return state.milestones.first_ai_response_sent.reached === true
    } catch (error) {
      this.logger.warn?.('Onboarding nurture activation check failed', {
        targetSessionId,
        error: (error as Error).message
      })
      return false
    }
  }

  private async resolveSenderSessionId(): Promise<string | null> {
    if (this.senderSessionId) {
      return this.senderSessionId
    }
    if (!this.senderEmail) {
      return null
    }

    const now = this.now()
    const cached = senderSessionCache.get(this.senderEmail)
    if (cached && cached.expiresAt > now) {
      return cached.sessionId
    }

    try {
      const sessionId = this.identityResolver
        ? await this.identityResolver.resolveSessionIdByEmail(this.senderEmail)
        : await resolveSessionIdByEmail(this.senderEmail)
      senderSessionCache.set(this.senderEmail, {
        sessionId,
        expiresAt: now + SESSION_ID_CACHE_TTL_MS
      })
      return sessionId
    } catch (error) {
      this.logger.warn?.('Onboarding nurture sender session lookup failed', {
        senderEmail: this.senderEmail,
        error: (error as Error).message
      })
      return null
    }
  }

  private async resolveUserProfile(sessionId: string): Promise<UserProfile | null> {
    if (this.profileResolver) {
      return this.profileResolver.getUserProfile(sessionId)
    }
    return loadUserProfileFromFirestore(sessionId)
  }
}

async function resolveSessionIdByEmail(email: string): Promise<string> {
  const safeEmail = normalizeRequiredText(email)
  if (!safeEmail) {
    throw new Error('sender_email_missing')
  }

  const db = getFirestoreAdmin()
  if (!db) {
    throw new Error('firebase_admin_unavailable')
  }

  if (!admin.apps.length) {
    throw new Error('firebase_admin_unavailable')
  }

  try {
    const authUser = await admin.auth().getUserByEmail(safeEmail)
    return authUser.uid
  } catch {
    // Fallback for environments where Auth lookup is unavailable but Firestore user docs exist.
    const direct = await db.collection('users').where('email', '==', safeEmail).limit(1).get()
    if (!direct.empty) {
      return direct.docs[0]!.id
    }

    const lowered = safeEmail.toLowerCase()
    if (lowered !== safeEmail) {
      const fallback = await db.collection('users').where('email', '==', lowered).limit(1).get()
      if (!fallback.empty) {
        return fallback.docs[0]!.id
      }
    }
    throw new Error('sender_session_not_found')
  }
}

async function loadUserProfileFromFirestore(sessionId: string): Promise<UserProfile | null> {
  const safeSessionId = normalizeRequiredText(sessionId)
  if (!safeSessionId) {
    return null
  }

  const db = getFirestoreAdmin()
  if (!db) {
    return null
  }

  const doc = await db.collection('users').doc(safeSessionId).get()
  if (!doc.exists) {
    return null
  }

  const data = doc.data() ?? {}
  return {
    name: normalizeOptionalText(data.nome ?? data.name),
    email: normalizeOptionalText(data.email),
    whatsapp: normalizeOptionalText(data.whatsapp),
    telefone: normalizeOptionalText(data.telefone)
  }
}

function resolveWhatsappFromSources(
  properties: Record<string, unknown> | undefined,
  profile: UserProfile | null
): string | null {
  const fromEvent = resolveWhatsappFromProperties(properties)
  if (fromEvent) {
    return fromEvent
  }
  return normalizeOptionalText(profile?.whatsapp) ?? normalizeOptionalText(profile?.telefone)
}

function resolveWhatsappFromProperties(properties?: Record<string, unknown>): string | null {
  if (!properties || typeof properties !== 'object') {
    return null
  }
  const candidates = ['whatsapp', 'telefone', 'phone', 'phoneNumber']
  for (const key of candidates) {
    const value = normalizeOptionalText((properties as Record<string, unknown>)[key])
    if (value) {
      return value
    }
  }
  return null
}

function buildOnboardingObservation(existing: string | null, targetSessionId: string, eventName: OnboardingEventName): string {
  const safeExisting = normalizeOptionalText(existing)
  if (safeExisting) {
    return safeExisting
  }
  return `[AutoWhats Onboarding] targetSessionId=${targetSessionId} event=${eventName}`
}

function normalizeRequiredText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeRequiredText(value)
  return normalized ? normalized : null
}
