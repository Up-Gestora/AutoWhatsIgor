import crypto from 'crypto'
import type { ClientStore } from '../clients'
import type { LeadStore } from '../leads'
import type { MetricsStore } from '../observability/metrics'
import type { OnboardingState } from '../onboarding'
import type { AiConfigStore } from './configStore'
import { AiMessageService, FollowUpBlockedError } from './service'
import type { AiConfigOverride, AiFollowUpAutomaticConfig } from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type AiAutoFollowUpWorkerOptions = {
  configStore: AiConfigStore
  aiService: AiMessageService
  leadStore: LeadStore
  clientStore: ClientStore
  pollIntervalMs: number
  sessionLimit: number
  batchSize: number
  leaseMs: number
  retryBaseMs: number
  retryMaxMs: number
  onboardingNurture?: {
    enabled?: boolean
    retryBaseMs?: number
    retryMaxMs?: number
    stateProvider?: {
      getState(sessionId: string): Promise<OnboardingState>
    }
  }
  logger?: Logger
  metrics?: MetricsStore
}

type NormalizedFollowUpAutomaticConfig = {
  enabled: boolean
  allowClients: boolean
}

type AutoFollowUpTarget = {
  kind: 'lead' | 'client'
  sessionId: string
  entityId: string
  chatId: string
  nextContactAt: number
  allowClients: boolean
  campaignType: 'onboarding_activation' | 'post_interaction_feedback' | null
  campaignTargetSessionId: string | null
  campaignAttempt: number
}

type NormalizedOnboardingNurtureConfig = {
  enabled: boolean
  retryBaseMs: number
  retryMaxMs: number
  stateProvider?: {
    getState(sessionId: string): Promise<OnboardingState>
  }
}

export class AiAutoFollowUpWorker {
  private readonly configStore: AiConfigStore
  private readonly aiService: AiMessageService
  private readonly leadStore: LeadStore
  private readonly clientStore: ClientStore
  private readonly pollIntervalMs: number
  private readonly sessionLimit: number
  private readonly batchSize: number
  private readonly leaseMs: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly onboardingNurture: NormalizedOnboardingNurtureConfig
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly retryState = new Map<string, number>()

  private running = false
  private timer?: NodeJS.Timeout
  private lastTickAt?: number

  constructor(options: AiAutoFollowUpWorkerOptions) {
    this.configStore = options.configStore
    this.aiService = options.aiService
    this.leadStore = options.leadStore
    this.clientStore = options.clientStore
    this.pollIntervalMs = Math.max(500, Math.floor(options.pollIntervalMs))
    this.sessionLimit = Math.max(1, Math.floor(options.sessionLimit))
    this.batchSize = Math.max(1, Math.floor(options.batchSize))
    this.leaseMs = Math.max(5_000, Math.floor(options.leaseMs))
    this.retryBaseMs = Math.max(1_000, Math.floor(options.retryBaseMs))
    this.retryMaxMs = Math.max(this.retryBaseMs, Math.floor(options.retryMaxMs))
    const nurtureRetryBaseRaw = Math.floor(options.onboardingNurture?.retryBaseMs ?? this.retryBaseMs)
    const nurtureRetryBaseMs = Math.max(1_000, nurtureRetryBaseRaw)
    const nurtureRetryMaxRaw = Math.floor(options.onboardingNurture?.retryMaxMs ?? this.retryMaxMs)
    const nurtureRetryMaxMs = Math.max(nurtureRetryBaseMs, nurtureRetryMaxRaw)
    this.onboardingNurture = {
      enabled: options.onboardingNurture?.enabled === true,
      retryBaseMs: nurtureRetryBaseMs,
      retryMaxMs: nurtureRetryMaxMs,
      stateProvider: options.onboardingNurture?.stateProvider
    }
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
  }

  start() {
    if (this.running) {
      return
    }
    this.running = true
    this.scheduleTick(0)
  }

  stop() {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.retryState.clear()
  }

  getStatus() {
    return {
      running: this.running,
      lastTickAt: this.lastTickAt ?? null
    }
  }

  private scheduleTick(delayMs: number) {
    if (!this.running) {
      return
    }
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      void this.tick()
    }, delayMs)
  }

  private async tick() {
    if (!this.running) {
      return
    }

    try {
      this.lastTickAt = Date.now()
      const sessions = await this.configStore.listSessionsWithAutoFollowUpEnabled(this.sessionLimit)
      for (const session of sessions) {
        const autoConfig = normalizeFollowUpAutomaticConfig(session.config)
        if (!autoConfig.enabled) {
          continue
        }
        await this.processSession(session.sessionId, autoConfig)
      }
    } catch (error) {
      this.logger.error?.('AI auto follow-up worker tick failed', { error: (error as Error).message })
      this.metrics?.increment('errors.total')
    } finally {
      this.scheduleTick(this.pollIntervalMs)
    }
  }

  private async processSession(sessionId: string, config: NormalizedFollowUpAutomaticConfig): Promise<void> {
    const dueBeforeMs = Date.now()
    const leads = await this.leadStore.claimDueForAutoFollowUp(sessionId, {
      dueBeforeMs,
      limit: this.batchSize,
      leaseMs: this.leaseMs
    })
    for (const lead of leads) {
      const target: AutoFollowUpTarget = {
        kind: 'lead',
        sessionId: lead.sessionId,
        entityId: lead.leadId,
        chatId: lead.chatId,
        nextContactAt: lead.nextContactAt,
        allowClients: false,
        campaignType: lead.campaignType,
        campaignTargetSessionId: lead.campaignTargetSessionId,
        campaignAttempt: lead.campaignAttempt
      }
      await this.processTarget(target)
    }

    if (!config.allowClients) {
      return
    }

    const clients = await this.clientStore.claimDueForAutoFollowUp(sessionId, {
      dueBeforeMs,
      limit: this.batchSize,
      leaseMs: this.leaseMs
    })
    for (const client of clients) {
      const target: AutoFollowUpTarget = {
        kind: 'client',
        sessionId: client.sessionId,
        entityId: client.clientId,
        chatId: client.chatId,
        nextContactAt: client.nextContactAt,
        allowClients: true,
        campaignType: null,
        campaignTargetSessionId: null,
        campaignAttempt: 0
      }
      await this.processTarget(target)
    }
  }

  private async processTarget(target: AutoFollowUpTarget): Promise<void> {
    const retryKey = buildRetryKey(target)
    const isOnboardingCampaign = this.isOnboardingCampaignTarget(target)

    if (isOnboardingCampaign) {
      await this.processOnboardingCampaignTarget(target, retryKey)
      return
    }

    try {
      const idempotencyKey = buildAutoFollowUpIdempotencyKey(target)
      const draft = await this.aiService.createFollowUpDraft(target.sessionId, target.chatId, {
        allowClients: target.allowClients
      })
      await this.aiService.sendFollowUp(
        target.sessionId,
        target.chatId,
        draft.text,
        idempotencyKey,
        { allowClients: target.allowClients }
      )

      // Apos enviar o follow-up automatico, encerra o ciclo atual limpando next_contact.
      await this.completeTarget(target, 0, null)

      // Se os toggles de sugestao/autoaprovacao estiverem ativos no treinamento,
      // esse metodo gera a sugestao e aplica automaticamente quando permitido.
      await this.aiService.suggestFieldUpdatesAfterFollowUp(
        target.sessionId,
        target.chatId,
        draft.text,
        { allowClients: target.allowClients }
      )

      this.retryState.delete(retryKey)
      this.metrics?.increment('ai.followup.auto.sent')
      this.metrics?.increment('ai.followup.auto.completed')
    } catch (error) {
      if (error instanceof FollowUpBlockedError) {
        this.metrics?.increment('ai.followup.auto.blocked')
        this.metrics?.increment(`ai.followup.auto.blocked.${sanitizeMetricKey(error.reason)}`)
        if (shouldRetryBlockedReason(error.reason, { includeSafetyGuards: false })) {
          await this.releaseWithBackoff(target, retryKey)
          return
        }
        await this.completeTarget(target, 0, null)
        this.retryState.delete(retryKey)
        return
      }

      this.logger.warn?.('AI auto follow-up target failed', {
        sessionId: target.sessionId,
        chatId: target.chatId,
        kind: target.kind,
        targetId: target.entityId,
        error: (error as Error).message
      })
      await this.releaseWithBackoff(target, retryKey)
    }
  }

  private async processOnboardingCampaignTarget(target: AutoFollowUpTarget, retryKey: string): Promise<void> {
    if (!this.onboardingNurture.enabled || !this.onboardingNurture.stateProvider) {
      await this.releaseWithBackoff(target, retryKey, 'onboarding_nurture')
      return
    }

    const targetSessionId = target.campaignTargetSessionId?.trim()
    if (!targetSessionId) {
      await this.stopOnboardingCampaign(target, 'target_session_missing')
      this.retryState.delete(retryKey)
      return
    }

    let onboardingState: OnboardingState
    try {
      onboardingState = await this.onboardingNurture.stateProvider.getState(targetSessionId)
    } catch (error) {
      this.logger.warn?.('Onboarding campaign state lookup failed', {
        sessionId: target.sessionId,
        targetSessionId,
        targetId: target.entityId,
        error: (error as Error).message
      })
      this.metrics?.increment('onboarding_nurture.errors')
      await this.releaseWithBackoff(target, retryKey, 'onboarding_nurture')
      return
    }

    if (onboardingState.milestones.first_ai_response_sent.reached) {
      await this.stopOnboardingCampaign(target, 'activated')
      this.retryState.delete(retryKey)
      this.metrics?.increment('onboarding_nurture.stopped.activated')
      return
    }

    try {
      const currentAttempt = Math.max(0, target.campaignAttempt)
      const nextAttempt = currentAttempt + 1
      const idempotencyKey = buildAutoFollowUpIdempotencyKey(target)
      const objectivePrompt = buildOnboardingObjectivePrompt(onboardingState)

      const draft = await this.aiService.createFollowUpDraft(target.sessionId, target.chatId, {
        allowClients: false,
        ignoreGlobalAiToggle: true,
        ignoreChatAiToggle: true,
        objectivePrompt,
        extraFollowUpMeta: buildOnboardingFollowUpMeta(onboardingState, currentAttempt, targetSessionId)
      })

      await this.aiService.sendFollowUp(target.sessionId, target.chatId, draft.text, idempotencyKey, {
        allowClients: false,
        ignoreGlobalAiToggle: true,
        ignoreChatAiToggle: true
      })

      const nextContactAt = Date.now() + resolveOnboardingCampaignDelayMs(nextAttempt)
      await this.leadStore.update(target.sessionId, target.entityId, {
        status: 'em_processo',
        nextContact: nextContactAt,
        campaignType: 'onboarding_activation',
        campaignTargetSessionId: targetSessionId,
        campaignAttempt: nextAttempt
      })

      this.retryState.delete(retryKey)
      this.metrics?.increment('ai.followup.auto.sent')
      this.metrics?.increment('onboarding_nurture.sent')
    } catch (error) {
      if (error instanceof FollowUpBlockedError) {
        this.metrics?.increment('ai.followup.auto.blocked')
        this.metrics?.increment(`ai.followup.auto.blocked.${sanitizeMetricKey(error.reason)}`)

        if (error.reason === 'opted_out') {
          await this.stopOnboardingCampaign(target, 'opt_out')
          this.retryState.delete(retryKey)
          this.metrics?.increment('onboarding_nurture.stopped.opt_out')
          return
        }

        if (shouldRetryBlockedReason(error.reason, { includeSafetyGuards: true })) {
          await this.releaseWithBackoff(target, retryKey, 'onboarding_nurture')
          this.metrics?.increment('onboarding_nurture.retry')
          return
        }

        await this.stopOnboardingCampaign(target, `blocked_${error.reason}`)
        this.retryState.delete(retryKey)
        return
      }

      this.logger.warn?.('Onboarding campaign follow-up failed', {
        sessionId: target.sessionId,
        targetId: target.entityId,
        targetSessionId,
        error: (error as Error).message
      })
      this.metrics?.increment('onboarding_nurture.errors')
      await this.releaseWithBackoff(target, retryKey, 'onboarding_nurture')
      this.metrics?.increment('onboarding_nurture.retry')
    }
  }

  private isOnboardingCampaignTarget(target: AutoFollowUpTarget): boolean {
    return (
      target.kind === 'lead' &&
      target.campaignType === 'onboarding_activation' &&
      this.onboardingNurture.enabled === true
    )
  }

  private async stopOnboardingCampaign(target: AutoFollowUpTarget, reason: string): Promise<void> {
    if (target.kind !== 'lead') {
      await this.completeTarget(target, 0, null)
      return
    }

    const current = await this.leadStore.get(target.sessionId, target.entityId)
    const observations = appendOnboardingStopObservation(current?.observations ?? null, reason)

    await this.leadStore.update(target.sessionId, target.entityId, {
      status: 'inativo',
      nextContact: null,
      observations,
      campaignType: null,
      campaignTargetSessionId: null,
      campaignAttempt: 0
    })
  }

  private async completeTarget(
    target: AutoFollowUpTarget,
    nextStep: number,
    nextContactAt: number | null
  ): Promise<void> {
    if (target.kind === 'lead') {
      await this.leadStore.completeAutoFollowUpStep(target.sessionId, target.entityId, {
        nextStep,
        nextContactAt
      })
      return
    }

    await this.clientStore.completeAutoFollowUpStep(target.sessionId, target.entityId, {
      nextStep,
      nextContactAt
    })
  }

  private async releaseWithBackoff(
    target: AutoFollowUpTarget,
    retryKey: string,
    mode: 'default' | 'onboarding_nurture' = 'default'
  ): Promise<void> {
    const attempt = (this.retryState.get(retryKey) ?? 0) + 1
    this.retryState.set(retryKey, attempt)
    const retryBaseMs = mode === 'onboarding_nurture' ? this.onboardingNurture.retryBaseMs : this.retryBaseMs
    const retryMaxMs = mode === 'onboarding_nurture' ? this.onboardingNurture.retryMaxMs : this.retryMaxMs
    const retryDelayMs = Math.min(retryMaxMs, retryBaseMs * 2 ** (attempt - 1))
    const retryAt = Date.now() + retryDelayMs

    if (target.kind === 'lead') {
      await this.leadStore.releaseAutoFollowUpClaim(target.sessionId, target.entityId, {
        nextContactAt: retryAt
      })
    } else {
      await this.clientStore.releaseAutoFollowUpClaim(target.sessionId, target.entityId, {
        nextContactAt: retryAt
      })
    }

    this.metrics?.increment('ai.followup.auto.retry')
  }
}

function normalizeFollowUpAutomaticConfig(config: AiConfigOverride): NormalizedFollowUpAutomaticConfig {
  const rawTraining =
    config.training && typeof config.training === 'object' && !Array.isArray(config.training)
      ? config.training
      : {}
  const rawFollowUp = rawTraining.followUpAutomatico
  const source =
    rawFollowUp && typeof rawFollowUp === 'object' && !Array.isArray(rawFollowUp)
      ? (rawFollowUp as AiFollowUpAutomaticConfig)
      : {}

  return {
    enabled: source.enabled === true,
    allowClients: source.allowClients === true
  }
}

function buildRetryKey(target: AutoFollowUpTarget): string {
  return `${target.sessionId}:${target.kind}:${target.entityId}`
}

function buildAutoFollowUpIdempotencyKey(target: AutoFollowUpTarget): string {
  const base = `${target.sessionId}|${target.kind}|${target.entityId}|${target.nextContactAt}`
  const hash = crypto.createHash('sha1').update(base).digest('hex')
  return `auto_followup:${target.kind}:${hash}`
}

function sanitizeMetricKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function shouldRetryBlockedReason(
  reason: FollowUpBlockedError['reason'],
  options: { includeSafetyGuards: boolean }
): boolean {
  if (
    reason === 'provider_unconfigured' ||
    reason === 'no_credits' ||
    reason === 'ai_disabled' ||
    reason === 'chat_disabled'
  ) {
    return true
  }

  if (options.includeSafetyGuards) {
    return reason === 'recent_human_activity' || reason === 'delivery_guard'
  }

  return false
}

function resolveOnboardingCampaignDelayMs(nextAttempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(nextAttempt))
  if (safeAttempt === 1) {
    return 24 * 60 * 60 * 1000
  }
  if (safeAttempt === 2) {
    return 3 * 24 * 60 * 60 * 1000
  }
  if (safeAttempt === 3) {
    return 7 * 24 * 60 * 60 * 1000
  }
  if (safeAttempt === 4) {
    return 14 * 24 * 60 * 60 * 1000
  }
  return 30 * 24 * 60 * 60 * 1000
}

function buildOnboardingObjectivePrompt(state: OnboardingState): string {
  const nextAction = state.nextAction
  const progress = Number.isFinite(state.progressPercent) ? state.progressPercent : 0
  const score = Number.isFinite(state.trainingScore) ? state.trainingScore : 0

  if (!nextAction) {
    return [
      'Envie uma mensagem de acompanhamento de onboarding em 1 a 3 linhas.',
      'Reconheca o progresso atual, proponha o proximo passo e inclua um CTA unico de ajuda.',
      "Finalize oferecendo opt-out curto: se nao quiser receber mensagens, responder 'parar'."
    ].join(' ')
  }

  return [
    'Você está em uma campanha de ativação de onboarding.',
    `Progresso atual: ${progress.toFixed(1)}%. Score de treinamento: ${score.toFixed(1)}.`,
    `A próxima etapa é "${nextAction.title}" (${nextAction.description}).`,
    'A mensagem deve explicar o que já foi concluído, por que a próxima etapa importa e como fazer rapidamente.',
    'Use no máximo 3 linhas e apenas 1 CTA de ajuda.',
    "Inclua opt-out curto: se não quiser receber mensagens, responder 'parar'."
  ].join(' ')
}

function buildOnboardingFollowUpMeta(
  state: OnboardingState,
  attempt: number,
  targetSessionId: string
): Record<string, unknown> {
  return {
    campaignType: 'onboarding_activation',
    targetSessionId,
    attempt,
    progressPercent: state.progressPercent,
    trainingScore: state.trainingScore,
    milestones: state.milestones,
    nextAction: state.nextAction
  }
}

function appendOnboardingStopObservation(existing: string | null, reason: string): string {
  const normalizedReason = sanitizeMetricKey(reason)
  const eventText = `[Onboarding Nurture] flow_stopped reason=${normalizedReason}`
  const base = typeof existing === 'string' ? existing.trim() : ''
  if (!base) {
    return eventText
  }
  if (base.includes(eventText)) {
    return base
  }
  return `${base}\n${eventText}`
}
