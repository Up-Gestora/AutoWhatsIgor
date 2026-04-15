import crypto from 'crypto'
import type { AiConfigOverride } from '../ai'
import { formatGuidedTestAssistantReply } from '../ai/replyFormatting'
import { applyTrainingPatch, normalizeTrainingData } from '../ai/trainingCopilotSchema'
import type { SessionStatusSnapshot } from '../sessions'
import { ONBOARDING_DRAFT_MAX_STEP } from './constants'
import { OnboardingDraftStore } from './draftStore'
import { OnboardingStore } from './store'
import {
  ONBOARDING_EVENT_NAMES,
  ONBOARDING_MILESTONES,
  type AcquisitionFunnelGroupBy,
  type AcquisitionFunnelRow,
  type GuidedTestResult,
  type GuidedTestTranscriptEntry,
  type OnboardingCohort,
  type OnboardingCreditsSnapshot,
  type OnboardingDraft,
  type OnboardingDraftPayload,
  type OnboardingDraftState,
  type OnboardingDraftStep,
  type OnboardingEventInput,
  type OnboardingEventName,
  type OnboardingEventSource,
  type OnboardingFunnelCohort,
  type OnboardingGuidedValidation,
  type OnboardingGuidedTestChangePreview,
  type OnboardingGuidedTestChangeProposal,
  type OnboardingGuidedTestMessageResult,
  type OnboardingGuidedTestSession,
  type OnboardingMilestoneId,
  type OnboardingNextAction,
  type OnboardingPublishResult,
  type OnboardingReadiness,
  type OnboardingState
} from './types'

type OnboardingServiceOptions = {
  store: OnboardingStore
  draftStore?: OnboardingDraftStore
  metrics?: {
    increment(name: string, value?: number): void
  }
  paidActivation7dEnabled?: boolean
  statusStore?: {
    getStatus(sessionId: string): Promise<SessionStatusSnapshot | null>
  }
  aiConfigStore?: {
    get(sessionId: string): Promise<AiConfigOverride | null>
    upsert?(sessionId: string, config: AiConfigOverride): Promise<void>
  }
  aiService?: {
    runGuidedTest?(sessionId: string): Promise<GuidedTestResult>
    runOnboardingGuidedTest?(
      sessionId: string,
      input: {
        draftTraining: Record<string, unknown>
      }
    ): Promise<GuidedTestResult>
    generateOnboardingGuidedReply?(
      sessionId: string,
      input: {
        draftTraining: Record<string, unknown>
        transcript: GuidedTestTranscriptEntry[]
        userMessage: string
      }
    ): Promise<{
      assistantMessage: string
      assistantParts: string[]
      usage: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
        costUsd: number
        costBrl: number
        pricingMissing: boolean
      }
      remainingCredits: number
    }>
  }
  trainingCopilotService?: {
    generateOneOffProposal?(
      sessionId: string,
      input: {
        message: string
        currentTraining: {
          model?: string
          contextMaxMessages?: number
          instructions?: unknown
        }
      }
    ): Promise<{
      assistantMessage: string
      proposal: {
        id: string
        summary: string
        rationale?: string | null
        patch: Record<string, unknown>
      } | null
    }>
  }
  creditsService?: {
    get(sessionId: string): Promise<{
      balanceBrl: number
      blockedReason: string | null
      updatedAt: number
    }>
  }
}

type UpdateDraftInput = {
  expectedVersion?: number | null
  currentStep?: number | null
  selectedTemplateId?: string | null
  trainingPatch?: Record<string, unknown> | null
}

type UpsertGuidedTestSessionInput = {
  scenarioId?: string | null
  action?: 'restart' | 'clear'
}

type GuidedTestMessageInput = {
  testSessionId?: string | null
  draftSnapshot?: {
    version?: number | null
    training?: Record<string, unknown> | null
  } | null
  userMessage: string
}

type GuidedTestChangeRequestInput = {
  draftSnapshot?: {
    version?: number | null
    training?: Record<string, unknown> | null
  } | null
  testSessionId?: string | null
  requestText: string
  transcript?: GuidedTestTranscriptEntry[] | null
}

type GuidedTestChangeApplyInput = {
  expectedVersion?: number | null
  proposal: {
    id?: string | null
    patch?: Record<string, unknown> | null
    summary?: string | null
    rationale?: string | null
  }
}

type PublishDraftInput = {
  expectedVersion?: number | null
  enableAi?: boolean
}

const eventNameSet = new Set<string>(ONBOARDING_EVENT_NAMES)
const eventSourceSet = new Set<OnboardingEventSource>(['frontend', 'backend', 'system'])
const stateEventNames: readonly OnboardingEventName[] = [...ONBOARDING_MILESTONES, 'dashboard_home_viewed']

const trainingScoreFields = [
  { key: 'nomeEmpresa', weight: 8, minLength: 3 },
  { key: 'nomeIA', weight: 4, minLength: 2 },
  { key: 'tipoResposta', weight: 6, minLength: 50 },
  { key: 'empresa', weight: 14, minLength: 120 },
  { key: 'descricaoServicosProdutosVendidos', weight: 26, minLength: 200 },
  { key: 'horarios', weight: 8, minLength: 20 },
  { key: 'orientacoesGerais', weight: 14, minLength: 180 },
  { key: 'orientacoesFollowUp', weight: 10, minLength: 80 },
  { key: 'instrucoesSugestoesLeadsClientes', weight: 10, minLength: 120 }
] as const

class DraftVersionConflictError extends Error {
  readonly payload: OnboardingDraftPayload

  constructor(payload: OnboardingDraftPayload) {
    super('draft_version_conflict')
    this.name = 'DraftVersionConflictError'
    this.payload = payload
  }
}

export class OnboardingService {
  private readonly store: OnboardingStore
  private readonly draftStore?: OnboardingDraftStore
  private readonly metrics?: OnboardingServiceOptions['metrics']
  private readonly paidActivation7dEnabled: boolean
  private readonly statusStore?: OnboardingServiceOptions['statusStore']
  private readonly aiConfigStore?: OnboardingServiceOptions['aiConfigStore']
  private readonly aiService?: OnboardingServiceOptions['aiService']
  private readonly trainingCopilotService?: OnboardingServiceOptions['trainingCopilotService']
  private readonly creditsService?: OnboardingServiceOptions['creditsService']

  constructor(options: OnboardingServiceOptions) {
    this.store = options.store
    this.draftStore = options.draftStore
    this.metrics = options.metrics
    this.paidActivation7dEnabled = options.paidActivation7dEnabled === true
    this.statusStore = options.statusStore
    this.aiConfigStore = options.aiConfigStore
    this.aiService = options.aiService
    this.trainingCopilotService = options.trainingCopilotService
    this.creditsService = options.creditsService
  }

  async recordEvent(input: OnboardingEventInput): Promise<{ recorded: boolean }> {
    const sessionId = input.sessionId.trim()
    const eventId = input.eventId.trim()
    const eventName = input.eventName
    const eventSource = input.eventSource
    const occurredAtMs = Number(input.occurredAtMs)

    if (!sessionId) {
      throw new Error('sessionId is required')
    }
    if (!eventId) {
      throw new Error('eventId is required')
    }
    if (!eventNameSet.has(eventName)) {
      throw new Error('event_name_invalid')
    }
    if (!eventSourceSet.has(eventSource)) {
      throw new Error('event_source_invalid')
    }
    if (!Number.isFinite(occurredAtMs)) {
      throw new Error('occurred_at_invalid')
    }

    const result = await this.store.insertEvent({
      sessionId,
      eventId,
      eventName,
      eventSource,
      occurredAtMs,
      properties: sanitizeProperties(input.properties)
    })

    if (result.recorded && eventName === 'signup_completed') {
      this.metrics?.increment('paid.signup_completed')
      const acquisitionSource = resolveAcquisitionSource(input.properties)
      if (!acquisitionSource || acquisitionSource === 'direct') {
        this.metrics?.increment('paid.attribution.missing_rate')
      }
    }

    if (result.recorded && eventName === 'first_ai_response_sent') {
      await this.maybeRecordActivatedWithin7Days(sessionId, occurredAtMs)
    }

    return { recorded: result.recorded }
  }

  async recordSystemEvent(
    sessionId: string,
    eventName: OnboardingEventName,
    properties?: Record<string, unknown>
  ): Promise<{ recorded: boolean }> {
    return this.recordEvent({
      sessionId,
      eventId: crypto.randomUUID(),
      eventName,
      eventSource: 'system',
      occurredAtMs: Date.now(),
      properties
    })
  }

  async recordSystemMilestoneOnce(
    sessionId: string,
    eventName: OnboardingEventName,
    properties?: Record<string, unknown>
  ): Promise<{ recorded: boolean }> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return { recorded: false }
    }
    const alreadyRecorded = await this.store.hasEventForSession(safeSessionId, eventName)
    if (alreadyRecorded) {
      return { recorded: false }
    }
    return this.recordSystemEvent(safeSessionId, eventName, properties)
  }

  async getState(sessionId: string): Promise<OnboardingState> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const [firstAtMap, latestStatus, config, scoreFromEvents] = await Promise.all([
      this.store.getFirstEventAtByNames(safeSessionId, stateEventNames),
      this.statusStore?.getStatus(safeSessionId) ?? Promise.resolve(null),
      this.aiConfigStore?.get(safeSessionId) ?? Promise.resolve(null),
      this.store.getLatestTrainingScore(safeSessionId)
    ])

    const scoreFromConfig = computeTrainingScore(config?.training)
    const trainingScore = clampScore(scoreFromEvents ?? scoreFromConfig)

    const milestones: Record<OnboardingMilestoneId, { reached: boolean; atMs: number | null }> = {
      signup_completed: milestoneFromMap(firstAtMap, 'signup_completed'),
      whatsapp_saved: milestoneFromMap(firstAtMap, 'whatsapp_saved'),
      whatsapp_connected: milestoneFromMap(firstAtMap, 'whatsapp_connected'),
      training_score_70_reached: milestoneFromMap(firstAtMap, 'training_score_70_reached'),
      ai_enabled: milestoneFromMap(firstAtMap, 'ai_enabled'),
      first_ai_response_sent: milestoneFromMap(firstAtMap, 'first_ai_response_sent')
    }

    const fallbackSignupAt = resolveFallbackSignupAt(milestones, firstAtMap.dashboard_home_viewed ?? null)
    if (!milestones.signup_completed.reached && fallbackSignupAt !== null) {
      milestones.signup_completed = { reached: true, atMs: fallbackSignupAt }
    }

    if (!milestones.whatsapp_connected.reached && latestStatus?.status === 'connected') {
      milestones.whatsapp_connected = {
        reached: true,
        atMs: Number.isFinite(latestStatus.updatedAt) ? latestStatus.updatedAt : null
      }
    }

    const aiEnabledFromConfig = config?.enabled === true
    if (!milestones.ai_enabled.reached && aiEnabledFromConfig) {
      milestones.ai_enabled = { reached: true, atMs: null }
    }

    if (!milestones.training_score_70_reached.reached && trainingScore >= 70) {
      milestones.training_score_70_reached = { reached: true, atMs: null }
    }

    const completed = ONBOARDING_MILESTONES.filter((id) => milestones[id].reached).length
    const progressPercent = Math.round((completed / ONBOARDING_MILESTONES.length) * 1000) / 10
    const nextAction = resolveNextAction(milestones)

    return {
      sessionId: safeSessionId,
      activationDefinition: 'first_ai_response_sent',
      trainingScore,
      progressPercent,
      milestones,
      nextAction
    }
  }

  async getDraft(sessionId: string): Promise<OnboardingDraftPayload> {
    const state = await this.ensureDraftState(sessionId)
    return this.buildDraftPayload(state)
  }

  async updateDraft(sessionId: string, input: UpdateDraftInput): Promise<OnboardingDraftPayload> {
    const state = await this.ensureDraftState(sessionId)
    await this.assertDraftVersion(state, input.expectedVersion)

    const nextStep = clampStep(input.currentStep ?? state.currentStep)
    const nextTemplateId =
      input.selectedTemplateId === undefined ? state.selectedTemplateId : normalizeNullableString(input.selectedTemplateId)
    const nextTraining = normalizeTrainingData({
      ...state.draft.training,
      ...sanitizeProperties(input.trainingPatch)
    })

    const nextState: OnboardingDraftState = {
      ...state,
      currentStep: nextStep,
      selectedTemplateId: nextTemplateId,
      draft: {
        version: state.draft.version + 1,
        updatedAtMs: Date.now(),
        training: nextTraining
      },
      guidedValidation: createIdleGuidedValidation()
    }

    await this.saveDraftState(nextState)

    if (nextStep > state.currentStep) {
      await this.recordSystemEvent(sessionId, 'onboarding_step_completed', { step: nextStep })
    }

    return this.buildDraftPayload(nextState)
  }

  async upsertGuidedTestSession(
    sessionId: string,
    input: UpsertGuidedTestSessionInput = {}
  ): Promise<OnboardingDraftPayload> {
    const state = await this.ensureDraftState(sessionId)
    const scenarioId =
      input.scenarioId === undefined
        ? state.guidedTestSession?.scenarioId ?? null
        : normalizeNullableString(input.scenarioId)
    const now = Date.now()
    const action = input.action === 'clear' ? 'clear' : 'restart'
    const currentSession = state.guidedTestSession

    const nextSession: OnboardingGuidedTestSession =
      action === 'clear' && currentSession
        ? {
            ...currentSession,
            scenarioId,
            transcript: [],
            updatedAtMs: now
          }
        : {
            id: crypto.randomUUID(),
            scenarioId,
            transcript: [],
            createdAtMs: now,
            updatedAtMs: now
          }

    const nextState: OnboardingDraftState = {
      ...state,
      currentStep: state.currentStep < 3 ? 3 : state.currentStep,
      guidedTestSession: nextSession
    }

    await this.saveDraftState(nextState)
    await this.recordSystemEvent(sessionId, 'guided_test_started', {
      scenarioId,
      action
    })

    return this.buildDraftPayload(nextState)
  }

  async sendGuidedTestMessage(
    sessionId: string,
    input: GuidedTestMessageInput
  ): Promise<OnboardingGuidedTestMessageResult> {
    const safeSessionId = sessionId.trim()
    const safeMessage = input.userMessage?.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeMessage) {
      throw new Error('userMessage_required')
    }

    const state = await this.ensureDraftState(safeSessionId)
    const currentSession = state.guidedTestSession
    if (!currentSession) {
      throw new Error('guided_test_session_required')
    }
    if (input.testSessionId && input.testSessionId !== currentSession.id) {
      throw new Error('guided_test_session_not_found')
    }
    if (!this.aiService?.generateOnboardingGuidedReply) {
      throw new Error('guided_test_unavailable')
    }

    const draftTraining = resolveRequestedDraftTraining(state.draft.training, input.draftSnapshot?.training)
    const readiness = computeDraftReadiness(draftTraining)
    if (!readiness.ready) {
      throw new Error('draft_not_ready')
    }

    const result = await this.aiService.generateOnboardingGuidedReply(safeSessionId, {
      draftTraining,
      transcript: currentSession.transcript,
      userMessage: safeMessage
    })

    const transcript = [
      ...currentSession.transcript,
      { role: 'user' as const, text: safeMessage },
      ...result.assistantParts.map((text) => ({ role: 'assistant' as const, text }))
    ]

    const nextState: OnboardingDraftState = {
      ...state,
      currentStep: state.currentStep < 3 ? 3 : state.currentStep,
      guidedTestSession: {
        ...currentSession,
        transcript,
        updatedAtMs: Date.now()
      }
    }

    await this.saveDraftState(nextState)
    await this.recordSystemEvent(safeSessionId, 'guided_test_message_sent', {
      testSessionId: currentSession.id,
      transcriptLength: transcript.length
    })

    return {
      testSessionId: currentSession.id,
      assistantMessage: result.assistantMessage,
      assistantParts: result.assistantParts,
      usage: result.usage,
      remainingCredits: result.remainingCredits,
      readiness
    }
  }

  async requestGuidedTestChange(
    sessionId: string,
    input: GuidedTestChangeRequestInput
  ): Promise<OnboardingGuidedTestChangeProposal> {
    const safeSessionId = sessionId.trim()
    const requestText = input.requestText?.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!requestText) {
      throw new Error('requestText_required')
    }
    if (!this.trainingCopilotService?.generateOneOffProposal) {
      throw new Error('training_copilot_unavailable')
    }

    const state = await this.ensureDraftState(safeSessionId)
    if (input.testSessionId && input.testSessionId !== state.guidedTestSession?.id) {
      throw new Error('guided_test_session_not_found')
    }

    const draftTraining = resolveRequestedDraftTraining(state.draft.training, input.draftSnapshot?.training)
    const transcript = normalizeTranscript(input.transcript ?? state.guidedTestSession?.transcript ?? [])
    const result = await this.trainingCopilotService.generateOneOffProposal(safeSessionId, {
      message: buildGuidedChangeRequestPrompt({
        requestText,
        transcript,
        currentTraining: draftTraining
      }),
      currentTraining: {
        instructions: draftTraining
      }
    })

    if (!result.proposal || !result.proposal.patch || Object.keys(result.proposal.patch).length === 0) {
      throw new Error('proposal_not_generated')
    }

    const preview = buildProposalPreview(draftTraining, result.proposal.patch)
    const proposal: OnboardingGuidedTestChangeProposal = {
      id: result.proposal.id,
      summary: result.proposal.summary,
      rationale: normalizeNullableString(result.proposal.rationale) ?? result.assistantMessage ?? null,
      patch: sanitizeProperties(result.proposal.patch),
      impactedFields: preview.map((entry) => entry.field),
      preview
    }

    await this.recordSystemEvent(safeSessionId, 'guided_test_change_requested', {
      fields: proposal.impactedFields,
      testSessionId: state.guidedTestSession?.id ?? null
    })

    return proposal
  }

  async applyGuidedTestChange(
    sessionId: string,
    input: GuidedTestChangeApplyInput
  ): Promise<OnboardingDraftPayload> {
    const state = await this.ensureDraftState(sessionId)
    await this.assertDraftVersion(state, input.expectedVersion)

    const patch = sanitizeProperties(input.proposal?.patch)
    if (Object.keys(patch).length === 0) {
      throw new Error('proposal_patch_required')
    }

    const nextTraining = applyTrainingPatch(
      normalizeTrainingData(state.draft.training),
      patch as Parameters<typeof applyTrainingPatch>[1]
    )
    const nextState: OnboardingDraftState = {
      ...state,
      draft: {
        version: state.draft.version + 1,
        updatedAtMs: Date.now(),
        training: nextTraining
      },
      guidedValidation: createIdleGuidedValidation()
    }

    await this.saveDraftState(nextState)
    await this.recordSystemEvent(sessionId, 'guided_test_change_applied', {
      proposalId: normalizeNullableString(input.proposal?.id),
      fields: Object.keys(patch)
    })

    return this.buildDraftPayload(nextState)
  }

  async publishDraft(sessionId: string, input: PublishDraftInput = {}): Promise<OnboardingPublishResult> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!this.aiConfigStore?.upsert) {
      throw new Error('ai_config_store_unavailable')
    }

    const state = await this.ensureDraftState(safeSessionId)
    await this.assertDraftVersion(state, input.expectedVersion)

    const [currentConfig, onboardingState] = await Promise.all([
      this.aiConfigStore.get(safeSessionId),
      this.getState(safeSessionId)
    ])

    const previousTraining = currentConfig?.training
    const previousScore = computeTrainingScore(previousTraining)
    const nextTraining = normalizeTrainingData({
      ...sanitizeProperties(previousTraining),
      ...state.draft.training
    })
    const nextScore = computeTrainingScore(nextTraining)
    const requestedEnableAi = input.enableAi === true
    const isConnected = onboardingState.milestones.whatsapp_connected.reached === true
    const previousEnabled = currentConfig?.enabled === true
    const nextEnabled = previousEnabled || (requestedEnableAi && isConnected)

    const nextConfig: AiConfigOverride = {
      ...(currentConfig ?? {}),
      training: nextTraining,
      enabled: nextEnabled
    }

    await this.aiConfigStore.upsert(safeSessionId, nextConfig)

    const nextState: OnboardingDraftState = {
      ...state,
      currentStep: 5,
      draft: {
        ...state.draft,
        updatedAtMs: Date.now(),
        training: nextTraining
      }
    }
    await this.saveDraftState(nextState)

    await this.recordSystemEvent(safeSessionId, 'onboarding_publish_confirmed', {
      requestedEnableAi,
      isConnected,
      trainingScore: nextScore
    })
    await this.recordSystemEvent(safeSessionId, 'training_score_updated', {
      score: nextScore,
      previousScore
    })
    if (previousScore < 70 && nextScore >= 70) {
      await this.recordSystemMilestoneOnce(safeSessionId, 'training_score_70_reached', {
        score: nextScore,
        previousScore
      })
    }
    if (!previousEnabled && nextEnabled) {
      await this.recordSystemMilestoneOnce(safeSessionId, 'ai_enabled', {
        enabled: true
      })
      await this.recordSystemEvent(safeSessionId, 'onboarding_activation_completed', {
        trainingScore: nextScore
      })
    }

    return {
      status: !isConnected && requestedEnableAi ? 'pending_connection' : nextEnabled ? 'activated' : 'published',
      enabled: nextEnabled,
      trainingScore: nextScore,
      connectionStatus: isConnected ? 'connected' : 'pending',
      draft: nextState.draft
    }
  }

  async getFunnel(fromMs: number, toMs: number, cohort: OnboardingCohort): Promise<OnboardingFunnelCohort[]> {
    const safeFrom = Number(fromMs)
    const safeTo = Number(toMs)
    if (!Number.isFinite(safeFrom) || !Number.isFinite(safeTo)) {
      throw new Error('invalid_period')
    }
    return this.store.getFunnelByCohort(safeFrom, safeTo, cohort)
  }

  async getAcquisitionFunnel(
    fromMs: number,
    toMs: number,
    cohort: OnboardingCohort,
    groupBy: AcquisitionFunnelGroupBy
  ): Promise<AcquisitionFunnelRow[]> {
    const safeFrom = Number(fromMs)
    const safeTo = Number(toMs)
    if (!Number.isFinite(safeFrom) || !Number.isFinite(safeTo)) {
      throw new Error('invalid_period')
    }
    return this.store.getAcquisitionFunnelByCohort(safeFrom, safeTo, cohort, groupBy)
  }

  async runGuidedTest(sessionId: string): Promise<GuidedTestResult> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    const state = await this.ensureDraftState(safeSessionId)

    if (!this.aiService?.runGuidedTest && !this.aiService?.runOnboardingGuidedTest) {
      throw new Error('guided_test_unavailable')
    }

    const result = this.aiService.runOnboardingGuidedTest
      ? await this.aiService.runOnboardingGuidedTest(safeSessionId, {
          draftTraining: state.draft.training
        })
      : await this.aiService.runGuidedTest!(safeSessionId)

    const nextState: OnboardingDraftState = {
      ...state,
      guidedValidation: {
        status: result.passed ? 'passed' : 'failed',
        draftVersion: state.draft.version,
        lastRunAtMs: Date.now(),
        checks: result.checks
      }
    }

    await this.saveDraftState(nextState)
    return result
  }

  private async ensureDraftState(sessionId: string): Promise<OnboardingDraftState> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!this.draftStore) {
      throw new Error('draft_store_unavailable')
    }

    const stored = await this.draftStore.get(safeSessionId)
    if (stored) {
      return normalizeDraftState(stored, safeSessionId)
    }

    const state = createDefaultDraftState(safeSessionId)
    await this.draftStore.upsert(safeSessionId, serializeDraftState(state))
    await this.recordSystemMilestoneOnce(safeSessionId, 'onboarding_draft_started')
    return state
  }

  private async saveDraftState(state: OnboardingDraftState): Promise<void> {
    if (!this.draftStore) {
      throw new Error('draft_store_unavailable')
    }
    await this.draftStore.upsert(state.sessionId, serializeDraftState(state))
  }

  private async buildDraftPayload(state: OnboardingDraftState): Promise<OnboardingDraftPayload> {
    const credits = await this.getCreditsSnapshot(state.sessionId)
    return {
      draft: state.draft,
      currentStep: state.currentStep,
      selectedTemplateId: state.selectedTemplateId,
      guidedTestSession: state.guidedTestSession,
      guidedValidation: state.guidedValidation,
      readiness: computeDraftReadiness(state.draft.training),
      credits
    }
  }

  private async assertDraftVersion(
    state: OnboardingDraftState,
    expectedVersion: number | null | undefined
  ): Promise<void> {
    if (expectedVersion === undefined || expectedVersion === null) {
      return
    }
    if (Number.isFinite(expectedVersion) && Math.round(expectedVersion) === state.draft.version) {
      return
    }
    await this.recordSystemEvent(state.sessionId, 'onboarding_save_conflict', {
      expectedVersion: Number.isFinite(expectedVersion) ? Math.round(expectedVersion) : null,
      actualVersion: state.draft.version
    })
    throw new DraftVersionConflictError(await this.buildDraftPayload(state))
  }

  private async getCreditsSnapshot(sessionId: string): Promise<OnboardingCreditsSnapshot | null> {
    if (!this.creditsService) {
      return null
    }
    const current = await this.creditsService.get(sessionId)
    return {
      balanceBrl: roundMoney(current.balanceBrl),
      blockedReason: current.blockedReason ?? null,
      updatedAtMs: Number.isFinite(current.updatedAt) ? current.updatedAt : Date.now()
    }
  }

  private async maybeRecordActivatedWithin7Days(sessionId: string, firstAiResponseAtMs: number): Promise<void> {
    if (!this.paidActivation7dEnabled) {
      return
    }
    if (!Number.isFinite(firstAiResponseAtMs)) {
      return
    }

    const firstEvents = await this.store.getFirstEventAtByNames(sessionId, ['signup_completed'])
    const signupAtMs = firstEvents.signup_completed
    if (typeof signupAtMs !== 'number' || !Number.isFinite(signupAtMs)) {
      return
    }
    if (firstAiResponseAtMs < signupAtMs) {
      return
    }

    const deltaMs = firstAiResponseAtMs - signupAtMs
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (deltaMs > sevenDaysMs) {
      return
    }

    const result = await this.recordSystemMilestoneOnce(sessionId, 'account_activated_7d', {
      signupAtMs,
      firstAiResponseAtMs,
      deltaMs
    })
    if (result.recorded) {
      this.metrics?.increment('paid.activation_7d')
    }
  }
}

function resolveFallbackSignupAt(
  milestones: Record<OnboardingMilestoneId, { reached: boolean; atMs: number | null }>,
  dashboardHomeViewedAt: number | null
): number | null {
  const candidates = ONBOARDING_MILESTONES
    .filter((id) => id !== 'signup_completed')
    .map((id) => milestones[id].atMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (typeof dashboardHomeViewedAt === 'number' && Number.isFinite(dashboardHomeViewedAt)) {
    candidates.push(dashboardHomeViewedAt)
  }
  if (candidates.length === 0) {
    return null
  }
  return Math.min(...candidates)
}

function milestoneFromMap(
  map: Partial<Record<OnboardingEventName, number>>,
  eventName: OnboardingMilestoneId
): { reached: boolean; atMs: number | null } {
  const atMs = map[eventName]
  return typeof atMs === 'number' && Number.isFinite(atMs)
    ? { reached: true, atMs }
    : { reached: false, atMs: null }
}

function resolveNextAction(
  milestones: Record<OnboardingMilestoneId, { reached: boolean; atMs: number | null }>
): OnboardingNextAction {
  if (!milestones.signup_completed.reached) {
    return {
      id: 'complete_signup',
      title: 'Concluir cadastro',
      description: 'Finalize os dados básicos da conta para seguir com o onboarding.',
      routeKey: 'settings',
      ctaLabel: 'Concluir cadastro'
    }
  }

  if (!milestones.whatsapp_saved.reached) {
    return {
      id: 'save_whatsapp',
      title: 'Salvar WhatsApp',
      description: 'Sem WhatsApp salvo no perfil da conta.',
      routeKey: 'settings',
      ctaLabel: 'Salvar agora'
    }
  }

  if (!milestones.whatsapp_connected.reached) {
    return {
      id: 'connect_whatsapp',
      title: 'Conectar WhatsApp',
      description: 'Sem conexão ativa detectada.',
      routeKey: 'connections',
      ctaLabel: 'Conectar agora'
    }
  }

  if (!milestones.training_score_70_reached.reached) {
    return {
      id: 'reach_training_score_70',
      title: 'Reforçar treinamento da IA',
      description: 'Seu treinamento ainda está abaixo do score recomendado de 70.',
      routeKey: 'onboarding_setup',
      ctaLabel: 'Validar etapa 3',
      query: { step: '3' }
    }
  }

  if (!milestones.ai_enabled.reached) {
    return {
      id: 'enable_ai',
      title: 'Ativar IA global',
      description: 'A IA global ainda está desligada.',
      routeKey: 'conversations',
      ctaLabel: 'Ativar IA'
    }
  }

  if (!milestones.first_ai_response_sent.reached) {
    return {
      id: 'send_first_ai_response',
      title: 'Gerar primeira resposta IA',
      description: 'Falta provar valor com a primeira resposta automática enviada.',
      routeKey: 'onboarding_setup',
      ctaLabel: 'Ir para etapa 4',
      query: { step: '4' }
    }
  }

  return {
    id: 'run_sales_routine',
    title: 'Acelerar rotina comercial',
    description: 'Conta ativada. Foque em qualificação e follow-ups na base de leads.',
    routeKey: 'leads',
    ctaLabel: 'Ir para Leads'
  }
}

function computeTrainingScore(training: unknown): number {
  if (!training || typeof training !== 'object' || Array.isArray(training)) {
    return 0
  }
  const source = training as Record<string, unknown>
  let score = 0

  for (const field of trainingScoreFields) {
    const raw = source[field.key]
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (!text) {
      continue
    }

    if (text.length >= field.minLength) {
      score += field.weight
    } else {
      score += field.weight * 0.5
    }
  }

  return clampScore(score)
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  const clamped = Math.max(0, Math.min(100, value))
  return Math.round(clamped * 10) / 10
}

function computeDraftReadiness(training: unknown): OnboardingReadiness {
  const normalized = normalizeTrainingData(training)
  const hints = [
    {
      field: 'empresa' as const,
      label: 'Preencha o contexto da empresa para a IA entender o negócio.',
      missing: !normalized.empresa.trim()
    },
    {
      field: 'descricaoServicosProdutosVendidos' as const,
      label: 'Descreva os serviços/produtos e a política comercial antes de testar.',
      missing: !normalized.descricaoServicosProdutosVendidos.trim()
    },
    {
      field: 'orientacoesGerais' as const,
      label: 'Defina uma orientação geral para o comportamento da IA.',
      missing: !normalized.orientacoesGerais.trim()
    }
  ]

  return {
    ready: hints.every((entry) => entry.missing === false),
    score: computeTrainingScore(normalized),
    hints
  }
}

function createDefaultDraftState(sessionId: string): OnboardingDraftState {
  const now = Date.now()
  return {
    sessionId,
    currentStep: 1,
    selectedTemplateId: null,
    draft: {
      version: 1,
      updatedAtMs: now,
      training: normalizeTrainingData({})
    },
    guidedTestSession: null,
    guidedValidation: createIdleGuidedValidation()
  }
}

function normalizeDraftState(raw: Record<string, unknown>, sessionId: string): OnboardingDraftState {
  const draftRaw =
    raw.draft && typeof raw.draft === 'object' && !Array.isArray(raw.draft)
      ? (raw.draft as Record<string, unknown>)
      : {}
  const guidedRaw =
    raw.guidedTestSession && typeof raw.guidedTestSession === 'object' && !Array.isArray(raw.guidedTestSession)
      ? (raw.guidedTestSession as Record<string, unknown>)
      : null
  const guidedValidationRaw =
    raw.guidedValidation && typeof raw.guidedValidation === 'object' && !Array.isArray(raw.guidedValidation)
      ? (raw.guidedValidation as Record<string, unknown>)
      : null

  return {
    sessionId,
    currentStep: clampStep(raw.currentStep),
    selectedTemplateId: normalizeNullableString(raw.selectedTemplateId),
    draft: {
      version: normalizePositiveInt(draftRaw.version, 1),
      updatedAtMs: normalizeTimestampMs(draftRaw.updatedAtMs, Date.now()),
      training: normalizeTrainingData(draftRaw.training)
    },
    guidedTestSession: guidedRaw
      ? {
          id:
            typeof guidedRaw.id === 'string' && guidedRaw.id.trim()
              ? guidedRaw.id.trim()
              : crypto.randomUUID(),
          scenarioId: normalizeNullableString(guidedRaw.scenarioId),
          transcript: normalizeTranscript(guidedRaw.transcript),
          createdAtMs: normalizeTimestampMs(guidedRaw.createdAtMs, Date.now()),
          updatedAtMs: normalizeTimestampMs(guidedRaw.updatedAtMs, Date.now())
        }
      : null,
    guidedValidation: normalizeGuidedValidation(guidedValidationRaw)
  }
}

function serializeDraftState(state: OnboardingDraftState): Record<string, unknown> {
  return {
    sessionId: state.sessionId,
    currentStep: state.currentStep,
    selectedTemplateId: state.selectedTemplateId,
    draft: state.draft,
    guidedTestSession: state.guidedTestSession,
    guidedValidation: state.guidedValidation
  }
}

function createIdleGuidedValidation(): OnboardingGuidedValidation {
  return {
    status: 'idle',
    draftVersion: null,
    lastRunAtMs: null,
    checks: []
  }
}

function normalizeGuidedValidation(value: Record<string, unknown> | null): OnboardingGuidedValidation {
  if (!value) {
    return createIdleGuidedValidation()
  }
  const checks = Array.isArray(value.checks)
    ? value.checks.reduce<GuidedTestResult['checks']>((acc, entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return acc
        }
        const row = entry as Record<string, unknown>
        const id = typeof row.id === 'string' ? row.id : ''
        const passed = row.passed === true
        if (
          id === 'no_na' ||
          id === 'has_cta' ||
          id === 'short_message' ||
          id === 'service_reference' ||
          id === 'safe_behavior'
        ) {
          acc.push({ id, passed })
        }
        return acc
      }, [])
    : []
  const status =
    value.status === 'passed' || value.status === 'failed' || value.status === 'idle'
      ? value.status
      : 'idle'
  return {
    status,
    draftVersion:
      typeof value.draftVersion === 'number' && Number.isFinite(value.draftVersion)
        ? Math.round(value.draftVersion)
        : null,
    lastRunAtMs:
      typeof value.lastRunAtMs === 'number' && Number.isFinite(value.lastRunAtMs)
        ? Math.round(value.lastRunAtMs)
        : null,
    checks
  }
}

function normalizeTranscript(value: unknown): GuidedTestTranscriptEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.reduce<GuidedTestTranscriptEntry[]>((acc, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return acc
    }
    const row = entry as Record<string, unknown>
    const role = row.role === 'user' || row.role === 'assistant' ? row.role : null
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    if (!role || !text) {
      return acc
    }
    if (role === 'assistant') {
      acc.push(
        ...formatGuidedTestAssistantReply(text).assistantParts.map(
          (part) =>
            ({
              role,
              text: part
            }) satisfies GuidedTestTranscriptEntry
        )
      )
      return acc
    }
    acc.push({ role, text } satisfies GuidedTestTranscriptEntry)
    return acc
  }, [])
}

function resolveRequestedDraftTraining(
  currentTraining: Record<string, unknown>,
  requestedTraining: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return normalizeTrainingData({
    ...currentTraining,
    ...sanitizeProperties(requestedTraining)
  })
}

function buildGuidedChangeRequestPrompt(input: {
  requestText: string
  transcript: GuidedTestTranscriptEntry[]
  currentTraining: Record<string, unknown>
}): string {
  return [
    'Contexto do laboratório de onboarding do AutoWhats.',
    '',
    'Pedido do usuário:',
    input.requestText,
    '',
    'Objetivo:',
    '- Proponha um patch objetivo no treinamento para melhorar as respostas da IA nesse laboratório.',
    '- Só altere campos do treinamento.',
    '- Se houver proposta, ela precisa ser aplicável imediatamente.',
    '',
    'Transcrição do teste guiado:',
    input.transcript.length > 0
      ? input.transcript.map((entry) => `${entry.role === 'user' ? 'Cliente' : 'IA'}: ${entry.text}`).join('\n')
      : 'Sem histórico ainda.',
    '',
    'Treinamento atual (JSON):',
    JSON.stringify(input.currentTraining, null, 2)
  ].join('\n')
}

function buildProposalPreview(
  currentTraining: Record<string, unknown>,
  patch: Record<string, unknown>
): OnboardingGuidedTestChangePreview[] {
  return Object.keys(patch).map((field) => ({
    field,
    before: normalizePreviewValue((currentTraining as Record<string, unknown>)[field]),
    after: normalizePreviewValue(patch[field])
  }))
}

function normalizePreviewValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'boolean') {
    return value
  }
  return null
}

function clampStep(value: unknown): OnboardingDraftStep {
  const parsed = normalizePositiveInt(value, 1)
  if (parsed <= 1) return 1
  if (parsed >= ONBOARDING_DRAFT_MAX_STEP) return ONBOARDING_DRAFT_MAX_STEP
  return parsed as OnboardingDraftStep
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.max(1, Math.round(parsed))
}

function normalizeTimestampMs(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(value * 100) / 100
}

function sanitizeProperties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function resolveAcquisitionSource(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const source = value as Record<string, unknown>

  const acquisition = source.acquisition
  if (acquisition && typeof acquisition === 'object' && !Array.isArray(acquisition)) {
    const acquisitionSource = (acquisition as Record<string, unknown>).source
    if (typeof acquisitionSource === 'string' && acquisitionSource.trim()) {
      return acquisitionSource.trim().toLowerCase()
    }
  }

  const utmSource = source.utm_source
  if (typeof utmSource === 'string' && utmSource.trim()) {
    return utmSource.trim().toLowerCase()
  }

  return null
}
