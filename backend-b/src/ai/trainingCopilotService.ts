import { calculateUsageCost } from './usagePricing'
import type { GeminiClient, GeminiUsage } from './geminiClient'
import type { MetricsStore } from '../observability/metrics'
import type { SystemSettingsService } from '../systemSettings'
import type { CreditsService } from '../credits'
import type { AiUsageStore } from './usageStore'
import type { TrainingCopilotStore } from './trainingCopilotStore'
import {
  applyTrainingPatch,
  normalizeTrainingData,
  type TrainingCopilotDecision,
  type TrainingCopilotMessage,
  type TrainingCopilotPatch,
  type TrainingCopilotProposal,
  type TrainingCopilotSessionState,
  validateTrainingPatch
} from './trainingCopilotSchema'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type TrainingCopilotServiceOptions = {
  store: TrainingCopilotStore
  geminiClient: GeminiClient
  creditsService?: CreditsService
  usageStore?: AiUsageStore
  systemSettings?: SystemSettingsService
  logger?: Logger
  metrics?: MetricsStore
  model?: string
  temperature?: number
  maxStoredMessages?: number
  maxModelMessages?: number
  maxDecisions?: number
}

export type TrainingCopilotBlockedReason = 'no_credits' | 'provider_unconfigured'

export class TrainingCopilotBlockedError extends Error {
  readonly reason: TrainingCopilotBlockedReason

  constructor(reason: TrainingCopilotBlockedReason, message: string) {
    super(message)
    this.name = 'TrainingCopilotBlockedError'
    this.reason = reason
  }
}

export type TrainingCopilotSendInput = {
  message: string
  currentTraining: {
    model?: string
    contextMaxMessages?: number
    instructions?: unknown
  }
}

export type TrainingCopilotSendResult = {
  assistantMessage: string
  pendingProposal: TrainingCopilotProposal | null
  session: TrainingCopilotSessionState
}

export type TrainingCopilotOneOffProposalInput = {
  message: string
  currentTraining: {
    model?: string
    contextMaxMessages?: number
    instructions?: unknown
  }
}

export type TrainingCopilotOneOffProposalResult = {
  assistantMessage: string
  proposal: TrainingCopilotProposal | null
}

type ParsedCopilotOutput = {
  assistantMessage: string
  proposal?: {
    summary?: string
    rationale?: string
    patch?: unknown
  } | null
}

type AiLanguage = 'pt-BR' | 'en'

export class TrainingCopilotService {
  private readonly store: TrainingCopilotStore
  private readonly geminiClient: GeminiClient
  private readonly creditsService?: CreditsService
  private readonly usageStore?: AiUsageStore
  private readonly systemSettings?: SystemSettingsService
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly model: string
  private readonly temperature: number
  private readonly maxStoredMessages: number
  private readonly maxModelMessages: number
  private readonly maxDecisions: number

  constructor(options: TrainingCopilotServiceOptions) {
    this.store = options.store
    this.geminiClient = options.geminiClient
    this.creditsService = options.creditsService
    this.usageStore = options.usageStore
    this.systemSettings = options.systemSettings
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.model = options.model ?? 'gemini-3-flash-preview'
    this.temperature = clampNumber(options.temperature ?? 0.4, 0, 2)
    this.maxStoredMessages = Math.max(10, options.maxStoredMessages ?? 120)
    this.maxModelMessages = Math.max(6, options.maxModelMessages ?? 30)
    this.maxDecisions = Math.max(10, options.maxDecisions ?? 200)
  }

  async getSession(sessionId: string): Promise<TrainingCopilotSessionState> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId_required')
    }

    const current = await this.store.get(safeSessionId)
    if (current) {
      return current
    }

    return this.store.reset(safeSessionId)
  }

  async resetSession(sessionId: string): Promise<TrainingCopilotSessionState> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId_required')
    }
    return this.store.reset(safeSessionId)
  }

  async deleteSession(sessionId: string): Promise<void> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId_required')
    }
    await this.store.delete(safeSessionId)
  }

  async sendMessage(sessionId: string, input: TrainingCopilotSendInput): Promise<TrainingCopilotSendResult> {
    const safeSessionId = sessionId.trim()
    const safeMessage = input.message?.trim()
    if (!safeSessionId) {
      throw new Error('sessionId_required')
    }
    if (!safeMessage) {
      throw new Error('message_required')
    }

    this.metrics?.increment('training.copilot.message.requested')

    if (!this.geminiClient.isConfigured()) {
      this.metrics?.increment('training.copilot.blocked.provider')
      throw new TrainingCopilotBlockedError(
        'provider_unconfigured',
        'Gemini nao configurado (API key ausente).'
      )
    }

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(safeSessionId)
      if (!canUse) {
        this.metrics?.increment('training.copilot.blocked.credits')
        throw new TrainingCopilotBlockedError('no_credits', 'Creditos insuficientes para usar a IA.')
      }
    }

    const state = await this.getSession(safeSessionId)
    const now = Date.now()
    const userMessage: TrainingCopilotMessage = {
      id: buildMessageId('user', now),
      role: 'user',
      content: safeMessage,
      createdAtMs: now
    }

    const currentTraining = normalizeTrainingData(input.currentTraining?.instructions)
    const language = resolveTrainingLanguage(currentTraining.language)
    const messages = appendAndTrimMessages(state.messages, userMessage, this.maxStoredMessages)

    const modelMessages = buildModelMessages({
      messages,
      currentTraining,
      pendingProposal: state.pendingProposal,
      language
    }).slice(-this.maxModelMessages - 1)

    let assistantText = ''
    let usage: GeminiUsage | undefined
    let parsedProposal: ParsedCopilotOutput['proposal'] = null

    try {
      const result = await this.geminiClient.createChatCompletion({
        model: this.model,
        temperature: this.temperature,
        messages: modelMessages
      })

      usage = result.usage
      const parsed = parseCopilotOutput(result.content, language)
      assistantText = parsed.assistantMessage
      parsedProposal = parsed.proposal ?? null
    } catch (error) {
      this.metrics?.increment('training.copilot.message.failed')
      this.logger.warn?.('Training copilot message failed', {
        sessionId: safeSessionId,
        error: (error as Error).message
      })
      throw error
    }

    const finalAssistantMessage: TrainingCopilotMessage = {
      id: buildMessageId('assistant', Date.now()),
      role: 'assistant',
      content: assistantText,
      createdAtMs: Date.now()
    }

    const nextMessages = appendAndTrimMessages(messages, finalAssistantMessage, this.maxStoredMessages)
    let nextProposalSeq = state.proposalSeq
    let nextPendingProposal: TrainingCopilotProposal | null = state.pendingProposal
    let nextDecisions = [...state.decisions]

    const hasProposal = parsedProposal && parsedProposal.patch && typeof parsedProposal.patch === 'object'
    if (hasProposal) {
      const validation = validateTrainingPatch(parsedProposal!.patch, currentTraining)
      if (!validation.ok) {
        this.metrics?.increment('training.copilot.proposal.invalid')
      } else {
        nextProposalSeq += 1

        if (state.pendingProposal) {
          nextDecisions.push({
            proposalId: state.pendingProposal.id,
            status: 'superseded',
            actorRole: 'system',
            actorUid: null,
            reason: 'new_proposal_created',
            createdAtMs: Date.now()
          })
        }

        const normalizedTraining = applyTrainingPatch(currentTraining, validation.patch)
        const summary = normalizeSummary(parsedProposal?.summary, validation.patch, language)
        const rationale = normalizeOptionalText(parsedProposal?.rationale)

        nextPendingProposal = {
          id: buildProposalId(nextProposalSeq, Date.now()),
          seq: nextProposalSeq,
          status: 'pending',
          summary,
          rationale,
          patch: buildMinimalPatch(currentTraining, normalizedTraining, validation.patch),
          createdAtMs: Date.now()
        }

        this.metrics?.increment('training.copilot.proposal.created')
      }
    }

    nextDecisions = trimDecisions(nextDecisions, this.maxDecisions)

    const saved = await this.store.upsert(safeSessionId, {
      messages: nextMessages,
      pendingProposal: nextPendingProposal,
      decisions: nextDecisions,
      proposalSeq: nextProposalSeq
    })

    if (usage) {
      await this.recordUsage({
        sessionId: safeSessionId,
        messageId: finalAssistantMessage.id,
        usage
      })
    } else {
      this.metrics?.increment('training.copilot.usage.missing')
    }

    this.metrics?.increment('training.copilot.message.succeeded')
    return {
      assistantMessage: finalAssistantMessage.content,
      pendingProposal: saved.pendingProposal,
      session: saved
    }
  }

  async generateOneOffProposal(
    sessionId: string,
    input: TrainingCopilotOneOffProposalInput
  ): Promise<TrainingCopilotOneOffProposalResult> {
    const safeSessionId = sessionId.trim()
    const safeMessage = input.message?.trim()
    if (!safeSessionId) {
      throw new Error('sessionId_required')
    }
    if (!safeMessage) {
      throw new Error('message_required')
    }

    this.metrics?.increment('training.copilot.one_off.requested')

    if (!this.geminiClient.isConfigured()) {
      this.metrics?.increment('training.copilot.blocked.provider')
      throw new TrainingCopilotBlockedError(
        'provider_unconfigured',
        'Gemini não configurado (API key ausente).'
      )
    }

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(safeSessionId)
      if (!canUse) {
        this.metrics?.increment('training.copilot.blocked.credits')
        throw new TrainingCopilotBlockedError('no_credits', 'Créditos insuficientes para usar a IA.')
      }
    }

    const currentTraining = normalizeTrainingData(input.currentTraining?.instructions)
    const language = resolveTrainingLanguage(currentTraining.language)
    const modelMessages = buildModelMessages({
      messages: [
        {
          id: buildMessageId('user', Date.now()),
          role: 'user',
          content: safeMessage,
          createdAtMs: Date.now()
        }
      ],
      currentTraining,
      pendingProposal: null,
      language
    })

    let assistantText = ''
    let usage: GeminiUsage | undefined
    let parsedProposal: ParsedCopilotOutput['proposal'] = null

    try {
      const result = await this.geminiClient.createChatCompletion({
        model: this.model,
        temperature: this.temperature,
        messages: modelMessages
      })
      usage = result.usage
      const parsed = parseCopilotOutput(result.content, language)
      assistantText = parsed.assistantMessage
      parsedProposal = parsed.proposal ?? null
    } catch (error) {
      this.metrics?.increment('training.copilot.one_off.failed')
      this.logger.warn?.('Training copilot one-off proposal failed', {
        sessionId: safeSessionId,
        error: (error as Error).message
      })
      throw error
    }

    const usageMessageId = buildMessageId('assistant', Date.now())
    if (usage) {
      await this.recordUsage({
        sessionId: safeSessionId,
        messageId: usageMessageId,
        usage
      })
    } else {
      this.metrics?.increment('training.copilot.usage.missing')
    }

    let proposal: TrainingCopilotProposal | null = null
    const hasProposal = parsedProposal && parsedProposal.patch && typeof parsedProposal.patch === 'object'
    if (hasProposal) {
      const validation = validateTrainingPatch(parsedProposal!.patch, currentTraining)
      if (validation.ok) {
        const normalizedTraining = applyTrainingPatch(currentTraining, validation.patch)
        proposal = {
          id: buildProposalId(1, Date.now()),
          seq: 1,
          status: 'pending',
          summary: normalizeSummary(parsedProposal?.summary, validation.patch, language),
          rationale: normalizeOptionalText(parsedProposal?.rationale),
          patch: buildMinimalPatch(currentTraining, normalizedTraining, validation.patch),
          createdAtMs: Date.now()
        }
        this.metrics?.increment('training.copilot.proposal.created')
      } else {
        this.metrics?.increment('training.copilot.proposal.invalid')
      }
    }

    this.metrics?.increment('training.copilot.one_off.succeeded')
    return {
      assistantMessage: assistantText,
      proposal
    }
  }

  async acceptProposal(
    sessionId: string,
    proposalId: string,
    decision?: {
      actorRole?: 'admin' | 'user' | 'system' | null
      actorUid?: string | null
    }
  ): Promise<TrainingCopilotSessionState | null> {
    return this.decideProposal(sessionId, proposalId, 'accepted', decision)
  }

  async rejectProposal(
    sessionId: string,
    proposalId: string,
    decision?: {
      actorRole?: 'admin' | 'user' | 'system' | null
      actorUid?: string | null
    }
  ): Promise<TrainingCopilotSessionState | null> {
    return this.decideProposal(sessionId, proposalId, 'rejected', decision)
  }

  private async decideProposal(
    sessionId: string,
    proposalId: string,
    status: TrainingCopilotDecision['status'],
    decision?: {
      actorRole?: 'admin' | 'user' | 'system' | null
      actorUid?: string | null
    }
  ): Promise<TrainingCopilotSessionState | null> {
    const safeSessionId = sessionId.trim()
    const safeProposalId = proposalId.trim()
    if (!safeSessionId || !safeProposalId) {
      throw new Error('proposal_required')
    }

    const state = await this.getSession(safeSessionId)
    if (!state.pendingProposal || state.pendingProposal.id !== safeProposalId) {
      return null
    }

    const decisions = trimDecisions(
      [
        ...state.decisions,
        {
          proposalId: safeProposalId,
          status,
          actorRole: decision?.actorRole ?? null,
          actorUid: decision?.actorUid ?? null,
          createdAtMs: Date.now()
        }
      ],
      this.maxDecisions
    )

    return this.store.upsert(safeSessionId, {
      messages: state.messages,
      pendingProposal: null,
      decisions,
      proposalSeq: state.proposalSeq
    })
  }

  private async recordUsage(input: { sessionId: string; messageId: string; usage: GeminiUsage }): Promise<void> {
    if (!this.usageStore) {
      return
    }

    const promptTokens = Math.max(0, Math.round(input.usage.promptTokens))
    const completionTokens = Math.max(0, Math.round(input.usage.completionTokens))
    const totalTokens = Math.max(0, Math.round(input.usage.totalTokens))

    const pricing = this.systemSettings?.getAiPricing?.() ?? { models: {} }
    const usdBrlRate = this.systemSettings?.getUsdBrlRate?.() ?? 0
    const cost = calculateUsageCost(
      {
        promptTokens,
        completionTokens,
        totalTokens
      },
      this.model,
      pricing,
      usdBrlRate
    )

    try {
      await this.usageStore.record({
        sessionId: input.sessionId,
        chatId: 'training:copilot',
        inboundId: null,
        provider: 'google',
        model: this.model,
        operation: 'training_copilot',
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: cost.costUsd,
        usdBrlRate,
        costBrl: cost.costBrl,
        pricingMissing: cost.pricingMissing
      })
    } catch (error) {
      this.logger.warn?.('Training copilot usage record failed', {
        sessionId: input.sessionId,
        error: (error as Error).message
      })
    }

    if (this.creditsService && cost.costBrl > 0) {
      try {
        await this.creditsService.consume(input.sessionId, cost.costBrl, {
          reason: 'training_copilot',
          referenceId: input.messageId
        })
        this.metrics?.increment('training.copilot.credits.debited')
      } catch (error) {
        this.logger.warn?.('Training copilot credits debit failed', {
          sessionId: input.sessionId,
          error: (error as Error).message
        })
        this.metrics?.increment('training.copilot.credits.debit_failed')
      }
    }
  }
}

function buildModelMessages(input: {
  messages: TrainingCopilotMessage[]
  currentTraining: ReturnType<typeof normalizeTrainingData>
  pendingProposal: TrainingCopilotProposal | null
  language: AiLanguage
}): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const systemPrompt = buildSystemPrompt(input.currentTraining, input.pendingProposal, input.language)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: systemPrompt
    }
  ]

  for (const item of input.messages) {
    messages.push({
      role: item.role,
      content: item.content
    })
  }

  return messages
}

function buildSystemPrompt(
  currentTraining: ReturnType<typeof normalizeTrainingData>,
  pendingProposal: TrainingCopilotProposal | null,
  language: AiLanguage
): string {
  const allowedKeys = [
    'nomeEmpresa:string',
    'nomeIA:string',
    'mensagemEncaminharHumano:string',
    'tipoResposta:string',
    'orientacoesGerais:string',
    'orientacoesFollowUp:string',
    'instrucoesSugestoesLeadsClientes:string',
    'empresa:string',
    'descricaoServicosProdutosVendidos:string',
    'horarios:string',
    'outros:string',
    'seApresentarComoIA:boolean',
    'permitirIATextoPersonalizadoAoEncaminharHumano:boolean',
    'usarEmojis:boolean',
    'usarAgendaAutomatica:boolean',
    'desligarMensagemForaContexto:boolean',
    'desligarIASeUltimasDuasMensagensNaoRecebidas:boolean',
    'desligarIASeHumanoRecente:boolean',
    'desligarIASeHumanoRecenteUsarDias:boolean',
    'desligarIASeHumanoRecenteUsarMensagens:boolean',
    'desligarIASeHumanoRecenteDias:number',
    'desligarIASeHumanoRecenteMensagens:number',
    'responderClientes:boolean',
    'autoClassificarLeadComoCliente:boolean',
    'permitirSugestoesCamposLeadsClientes:boolean',
    'aprovarAutomaticamenteSugestoesLeadsClientes:boolean',
    'permitirIAEnviarArquivos:boolean',
    'permitirIAOuvirAudios:boolean',
    'permitirIALerImagensEPdfs:boolean',
    'responderGrupos:boolean',
    'esconderGrupos:boolean',
    'followUpAutomatico:{enabled:boolean,allowClients:boolean,mode:always|only_if_no_reply|reschedule_if_replied,maxSendsTotal:number,intervals:[{value:number,unit:minutes|hours|days}]}',
    'comportamentoNaoSabe:encaminhar|silencio'
  ]

  const pendingSection =
    language === 'en'
      ? pendingProposal
        ? `\nCurrent pending proposal (JSON):\n${JSON.stringify(pendingProposal, null, 2)}\nIf the user asks for adjustments, you may generate a new proposal.`
        : '\nThere is no pending proposal right now.'
      : pendingProposal
        ? `\nProposta pendente atual (JSON):\n${JSON.stringify(pendingProposal, null, 2)}\nSe o usuário pedir ajustes, você pode gerar uma nova proposta.`
        : '\nNão há proposta pendente no momento.'

  if (language === 'en') {
    return `You are an AI training configuration copilot for AutoWhats.
Your goal is to understand the user's business, ask short questions when needed, and suggest training improvements.

Mandatory rules:
- Scope of changes: ONLY training texts and toggles.
- Do not change provider/model/context settings.
- When data is insufficient, ask short objective questions.
- When context is sufficient, include a change proposal in the "proposal" field.
- ALWAYS reply with valid JSON, no markdown, and no text outside JSON.

Exact output format:
{
  "assistantMessage": "text for the user",
  "proposal": {
    "summary": "short proposal summary",
    "rationale": "optional reason",
    "patch": { "field": "value" }
  }
}

If no change should be proposed, use "proposal": null.
Allowed patch keys:
${allowedKeys.map((entry) => `- ${entry}`).join('\n')}

Current training (JSON):
${JSON.stringify(currentTraining, null, 2)}
${pendingSection}`
  }

  return `Você é um copiloto de configuração do treinamento da IA no AutoWhats.
Seu objetivo é entender o negócio do usuário, fazer perguntas quando necessário e sugerir melhorias no treinamento.

Regras obrigatórias:
- Escopo de alterações: APENAS textos e toggles do treinamento.
- Não altere provider/model/contexto.
- Quando não houver dados suficientes, faça perguntas curtas.
- Quando houver contexto suficiente, inclua uma proposta de alteração no campo "proposal".
- Responda SEMPRE em JSON válido, sem markdown, sem texto fora do JSON.

Formato exato de saída:
{
  "assistantMessage": "texto para o usuário",
  "proposal": {
    "summary": "resumo curto da proposta",
    "rationale": "motivo opcional",
    "patch": { "campo": "valor" }
  }
}

Se não for propor mudanças, use "proposal": null.
Chaves permitidas no patch:
${allowedKeys.map((entry) => `- ${entry}`).join('\n')}

Treinamento atual (JSON):
${JSON.stringify(currentTraining, null, 2)}
${pendingSection}`
}

function parseCopilotOutput(raw: string, language: AiLanguage): ParsedCopilotOutput {
  const fallback = raw.trim()
  if (!fallback) {
    return {
      assistantMessage:
        language === 'en'
          ? 'Understood. Could you share a bit more about how you want the AI to serve your customers?'
          : 'Entendi. Pode me contar um pouco mais sobre como quer que a IA atenda seus clientes?',
      proposal: null
    }
  }

  const parsed = parseJsonLoose(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { assistantMessage: fallback, proposal: null }
  }

  const row = parsed as Record<string, unknown>
  const assistantMessage = normalizeAssistantText(row.assistantMessage, fallback)
  const proposalRaw =
    row.proposal === null
      ? null
      : row.proposal && typeof row.proposal === 'object' && !Array.isArray(row.proposal)
        ? (row.proposal as ParsedCopilotOutput['proposal'])
        : null

  return {
    assistantMessage,
    proposal: proposalRaw
  }
}

function parseJsonLoose(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    // continue
  }

  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (codeBlock?.[1]) {
    try {
      return JSON.parse(codeBlock[1])
    } catch {
      // continue
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }

  return null
}

function normalizeAssistantText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return fallback
}

function normalizeSummary(summary: unknown, patch: TrainingCopilotPatch, language: AiLanguage): string {
  const normalized = typeof summary === 'string' ? summary.trim() : ''
  if (normalized) {
    return normalized
  }

  const keys = Object.keys(patch)
  if (keys.length === 0) {
    return language === 'en' ? 'Suggested training adjustments.' : 'Sugestão de ajustes no treinamento.'
  }
  return language === 'en'
    ? `Suggestion to adjust ${keys.length} training field(s).`
    : `Sugestão para ajustar ${keys.length} campo(s) do treinamento.`
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function appendAndTrimMessages(
  current: TrainingCopilotMessage[],
  nextMessage: TrainingCopilotMessage,
  maxMessages: number
): TrainingCopilotMessage[] {
  const merged = [...current, nextMessage]
  if (merged.length <= maxMessages) {
    return merged
  }
  return merged.slice(merged.length - maxMessages)
}

function trimDecisions(input: TrainingCopilotDecision[], maxDecisions: number): TrainingCopilotDecision[] {
  if (input.length <= maxDecisions) {
    return input
  }
  return input.slice(input.length - maxDecisions)
}

function buildMinimalPatch(
  currentTraining: ReturnType<typeof normalizeTrainingData>,
  normalizedTraining: ReturnType<typeof normalizeTrainingData>,
  patch: TrainingCopilotPatch
): TrainingCopilotPatch {
  const result: TrainingCopilotPatch = {}
  for (const [key, value] of Object.entries(patch)) {
    const typedKey = key as keyof TrainingCopilotPatch
    if ((currentTraining as any)[typedKey] !== (normalizedTraining as any)[typedKey]) {
      ;(result as any)[typedKey] = value
    }
  }
  return result
}

function buildMessageId(prefix: 'user' | 'assistant', now: number): string {
  return `${prefix}_${now}_${Math.random().toString(16).slice(2, 10)}`
}

function buildProposalId(seq: number, now: number): string {
  return `proposal_${seq}_${now}`
}

function resolveTrainingLanguage(value: unknown): AiLanguage {
  if (typeof value !== 'string') {
    return 'pt-BR'
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb' || normalized.startsWith('en-')) {
    return 'en'
  }
  return 'pt-BR'
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
