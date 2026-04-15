import type { SystemSettingsStore } from './store'
import type { AiPricing } from '../ai/types'

export type PostInteractionProspectingSettings = {
  enabled: boolean
  senderEmail: string
  ctaBaseUrl: string
}

export type SystemSettingsSnapshot = {
  debugAiPrompt: boolean
  debugAiResponse: boolean
  requestLogging: boolean
  usdBrlRate: number
  aiPricing: AiPricing
  aiAudioTranscriptionUsdPerMin: number
  newAccountCreditsBrl: number
  postInteractionProspecting: PostInteractionProspectingSettings
}

type SystemSettingsServiceOptions = {
  store: SystemSettingsStore
  defaults?: SystemSettingsSnapshot
}

export class SystemSettingsService {
  private readonly store: SystemSettingsStore
  private readonly defaults: SystemSettingsSnapshot
  private debugAiPrompt: boolean
  private debugAiResponse: boolean
  private requestLogging: boolean
  private usdBrlRate: number
  private aiPricing: AiPricing
  private aiAudioTranscriptionUsdPerMin: number
  private newAccountCreditsBrl: number
  private postInteractionProspecting: PostInteractionProspectingSettings

  constructor(options: SystemSettingsServiceOptions) {
    this.store = options.store
    this.defaults = options.defaults ?? {
      debugAiPrompt: false,
      debugAiResponse: false,
      requestLogging: true,
      usdBrlRate: 5,
      aiPricing: { models: {} },
      aiAudioTranscriptionUsdPerMin: 0,
      newAccountCreditsBrl: 0,
      postInteractionProspecting: {
        enabled: false,
        senderEmail: 'igsartor@icloud.com',
        ctaBaseUrl: '/login?mode=signup'
      }
    }
    this.debugAiPrompt = this.defaults.debugAiPrompt
    this.debugAiResponse = this.defaults.debugAiResponse
    this.requestLogging = this.defaults.requestLogging
    this.usdBrlRate = this.defaults.usdBrlRate
    this.aiPricing = this.defaults.aiPricing
    this.aiAudioTranscriptionUsdPerMin = this.defaults.aiAudioTranscriptionUsdPerMin
    this.newAccountCreditsBrl = this.defaults.newAccountCreditsBrl
    this.postInteractionProspecting = this.defaults.postInteractionProspecting
  }

  async load(): Promise<void> {
    const stored = await this.store.get<boolean>('debugAiPrompt')
    if (typeof stored === 'boolean') {
      this.debugAiPrompt = stored
    } else {
      this.debugAiPrompt = this.defaults.debugAiPrompt
    }

    const debugAiResponse = await this.store.get<boolean>('debugAiResponse')
    if (typeof debugAiResponse === 'boolean') {
      this.debugAiResponse = debugAiResponse
    } else {
      this.debugAiResponse = this.defaults.debugAiResponse
    }

    const requestLogging = await this.store.get<boolean>('requestLogging')
    if (typeof requestLogging === 'boolean') {
      this.requestLogging = requestLogging
    } else {
      this.requestLogging = this.defaults.requestLogging
    }

    const usdBrlRate = await this.store.get<number>('usdBrlRate')
    this.usdBrlRate = normalizeNumber(usdBrlRate, this.defaults.usdBrlRate)

    const aiPricing = await this.store.get<AiPricing>('aiPricing')
    this.aiPricing = normalizePricing(aiPricing, this.defaults.aiPricing)

    const aiAudioTranscriptionUsdPerMin = await this.store.get<number>('aiAudioTranscriptionUsdPerMin')
    this.aiAudioTranscriptionUsdPerMin = normalizeNumber(
      aiAudioTranscriptionUsdPerMin,
      this.defaults.aiAudioTranscriptionUsdPerMin
    )

    const newAccountCreditsBrl = await this.store.get<number>('newAccountCreditsBrl')
    this.newAccountCreditsBrl = normalizeNonNegativeNumber(newAccountCreditsBrl, this.defaults.newAccountCreditsBrl)

    const postInteractionProspecting =
      await this.store.get<PostInteractionProspectingSettings>('postInteractionProspecting')
    this.postInteractionProspecting = normalizePostInteractionProspectingSettings(
      postInteractionProspecting,
      this.defaults.postInteractionProspecting
    )
  }

  getDebugAiPrompt(): boolean {
    return this.debugAiPrompt
  }

  getDebugAiResponse(): boolean {
    return this.debugAiResponse
  }

  getRequestLogging(): boolean {
    return this.requestLogging
  }

  getUsdBrlRate(): number {
    return this.usdBrlRate
  }

  getAiPricing(): AiPricing {
    return this.aiPricing
  }

  getAiAudioTranscriptionUsdPerMin(): number {
    return this.aiAudioTranscriptionUsdPerMin
  }

  getNewAccountCreditsBrl(): number {
    return this.newAccountCreditsBrl
  }

  getPostInteractionProspecting(): PostInteractionProspectingSettings {
    return this.postInteractionProspecting
  }

  getSnapshot(): SystemSettingsSnapshot {
    return {
      debugAiPrompt: this.debugAiPrompt,
      debugAiResponse: this.debugAiResponse,
      requestLogging: this.requestLogging,
      usdBrlRate: this.usdBrlRate,
      aiPricing: this.aiPricing,
      aiAudioTranscriptionUsdPerMin: this.aiAudioTranscriptionUsdPerMin,
      newAccountCreditsBrl: this.newAccountCreditsBrl,
      postInteractionProspecting: this.postInteractionProspecting
    }
  }

  async setDebugAiPrompt(value: boolean): Promise<void> {
    this.debugAiPrompt = value
    await this.store.set('debugAiPrompt', value)
  }

  async setDebugAiResponse(value: boolean): Promise<void> {
    this.debugAiResponse = value
    await this.store.set('debugAiResponse', value)
  }

  async setRequestLogging(value: boolean): Promise<void> {
    this.requestLogging = value
    await this.store.set('requestLogging', value)
  }

  async setUsdBrlRate(value: number): Promise<void> {
    this.usdBrlRate = normalizeNumber(value, this.defaults.usdBrlRate)
    await this.store.set('usdBrlRate', this.usdBrlRate)
  }

  async setAiPricing(value: AiPricing): Promise<void> {
    this.aiPricing = normalizePricing(value, this.defaults.aiPricing)
    await this.store.set('aiPricing', this.aiPricing)
  }

  async setAiAudioTranscriptionUsdPerMin(value: number): Promise<void> {
    this.aiAudioTranscriptionUsdPerMin = normalizeNumber(value, this.defaults.aiAudioTranscriptionUsdPerMin)
    await this.store.set('aiAudioTranscriptionUsdPerMin', this.aiAudioTranscriptionUsdPerMin)
  }

  async setNewAccountCreditsBrl(value: number): Promise<void> {
    this.newAccountCreditsBrl = normalizeNonNegativeNumber(value, this.defaults.newAccountCreditsBrl)
    await this.store.set('newAccountCreditsBrl', this.newAccountCreditsBrl)
  }

  async setPostInteractionProspecting(value: Partial<PostInteractionProspectingSettings>): Promise<void> {
    this.postInteractionProspecting = normalizePostInteractionProspectingSettings(
      value,
      this.postInteractionProspecting
    )
    await this.store.set('postInteractionProspecting', this.postInteractionProspecting)
  }
}

function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function normalizeNonNegativeNumber(value: unknown, fallback: number) {
  const normalized = normalizeNumber(value, fallback)
  return normalized < 0 ? 0 : normalized
}

function normalizePricing(value: unknown, fallback: AiPricing): AiPricing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback
  }

  const rawModels = (value as AiPricing).models
  if (!rawModels || typeof rawModels !== 'object' || Array.isArray(rawModels)) {
    return fallback
  }

  const models: Record<string, { inputUsdPerM: number; outputUsdPerM: number }> = {}
  for (const [model, entry] of Object.entries(rawModels)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const input = (entry as { inputUsdPerM?: unknown }).inputUsdPerM
    const output = (entry as { outputUsdPerM?: unknown }).outputUsdPerM
    const inputValue = normalizeNumber(input, NaN)
    const outputValue = normalizeNumber(output, NaN)
    if (Number.isFinite(inputValue) && Number.isFinite(outputValue)) {
      models[model] = { inputUsdPerM: inputValue, outputUsdPerM: outputValue }
    }
  }

  return { models }
}

function normalizePostInteractionProspectingSettings(
  value: unknown,
  fallback: PostInteractionProspectingSettings
): PostInteractionProspectingSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback
  }

  const source = value as Partial<PostInteractionProspectingSettings>
  const senderEmail =
    typeof source.senderEmail === 'string' && source.senderEmail.trim()
      ? source.senderEmail.trim()
      : fallback.senderEmail
  const ctaBaseUrl =
    typeof source.ctaBaseUrl === 'string' && source.ctaBaseUrl.trim()
      ? source.ctaBaseUrl.trim()
      : fallback.ctaBaseUrl

  return {
    enabled: source.enabled === true,
    senderEmail,
    ctaBaseUrl
  }
}
