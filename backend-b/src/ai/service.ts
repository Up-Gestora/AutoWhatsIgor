import type { InboundMessageStore, InboundMessageRow } from '../messages/store'
import type { InboundQueueItem } from '../messages/types'
import type { OutboundMessageRecord, OutboundMessageService } from '../messages'
import type { ChatMessage, ChatService } from '../chats'
import { mergeAiConfig } from './config'
import type {
  AiConfig,
  AiContextMessage,
  AiPricing,
  AiTokenUsage,
  AiTrainingData
} from './types'
import { evaluateOptOut, isWithinBusinessHours } from './policy'
import type { AiConfigStore } from './configStore'
import type { ChatAiConfigStore } from './chatConfigStore'
import type { AiResponseStore } from './responseStore'
import type { AiContextCache } from './contextCache'
import type { AiOptOutStore } from './optOutStore'
import type { OpenAiClient, OpenAiMessage } from './openaiClient'
import type { GeminiClient } from './geminiClient'
import type { AiPresentationStore } from './presentationStore'
import type { AiPromptEntry, AiPromptStore } from './promptStore'
import { buildFollowUpPrompt, buildLegacyPrompt } from './promptBuilder'
import { calculateUsageCost } from './usagePricing'
import type { AiUsageStore, AiUsageOperation } from './usageStore'
import type {
  AiFieldSuggestionBase,
  AiFieldSuggestionPatch,
  AiFieldSuggestionStore,
  AiFieldSuggestionTargetType
} from './fieldSuggestionsStore'
import type { MetricsStore } from '../observability/metrics'
import type { SystemSettingsService } from '../systemSettings'
import type { ClientStore } from '../clients'
import type { ClientRecord } from '../clients/types'
import type { LeadConversionStore, LeadStore } from '../leads'
import { convertLeadToClient } from '../leads/convertLead'
import type { CreditsService } from '../credits'
import { extractOrderedSendSequence } from './fileDirective'
import type { AiFileLibrary, AiUserFile } from './fileLibrary'
import { extractWhatsappFromJid } from '../whatsapp/ids'
import type { FindmyangelContextProvider } from '../integrations/findmyangelContext'
import type { AgendaStore } from '../agenda/store'
import { buildAgendaTools, createAgendaToolExecutor } from './tools/agendaTools'
import { runWithTools } from './tools/toolRunner'
import type { ToolChatMessage } from './tools/types'
import type { GuidedTestCheckResult, GuidedTestResult, GuidedTestTranscriptEntry } from '../onboarding'
import {
  formatGuidedTestAssistantReply,
  sanitizeAssistantReplyOutput,
  splitReply
} from './replyFormatting'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type AiMessageServiceOptions = {
  inboundStore: InboundMessageStore
  outboundService: OutboundMessageService
  configStore: AiConfigStore
  chatConfigStore?: ChatAiConfigStore
  responseStore: AiResponseStore
  contextCache: AiContextCache
  optOutStore: AiOptOutStore
  openAiClient: OpenAiClient
  geminiClient?: GeminiClient
  defaultConfig: AiConfig
  agendaStore?: AgendaStore
  fileLibrary?: AiFileLibrary
  chatService?: ChatService
  presentationStore?: AiPresentationStore
  promptStore?: AiPromptStore
  systemSettings?: SystemSettingsService
  clientStore?: ClientStore
  leadStore?: LeadStore
  leadConversionStore?: LeadConversionStore
  suggestionStore?: AiFieldSuggestionStore
  usageStore?: AiUsageStore
  creditsService?: CreditsService
  findmyangelContextProvider?: FindmyangelContextProvider
  clientClassifyThreshold?: number
  clientClassifyCooldownSec?: number
  onFirstAiResponseSent?: (params: {
    sessionId: string
    chatId: string
    inboundId: number
    outboundId: number
  }) => Promise<void> | void
  logger?: Logger
  metrics?: MetricsStore
}

type OnboardingGuidedReplyResult = {
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
}

type OrderedAiReplySendItem = { type: 'text'; text: string } | { type: 'file'; file: AiUserFile }

const FIELD_SUGGEST_MAX_MESSAGES = 12
const FIELD_SUGGEST_MAX_TEXT = 800
const FIELD_SUGGEST_MAX_TRAINING_TEXT = 2000
const FIELD_SUGGEST_MAX_TRAINING_SHORT_TEXT = 200
const PROMPT_FILES_LIMIT = 25
const MAX_FILES_PER_AI_REPLY = 3
const MAX_FILE_SIZE_BYTES = 16 * 1024 * 1024
const DELIVERY_GUARD_REQUIRED_OUTBOUND = 2
const DELIVERY_GUARD_SENT_GRACE_MS = 5 * 60 * 1000
const DELIVERY_GUARD_HISTORY_MIN_LIMIT = 20
const RECENT_HUMAN_ACTIVITY_DAYS_DEFAULT = 3
const RECENT_HUMAN_ACTIVITY_DAYS_MIN = 1
const RECENT_HUMAN_ACTIVITY_DAYS_MAX = 30
const RECENT_HUMAN_ACTIVITY_MESSAGES_DEFAULT = 10
const RECENT_HUMAN_ACTIVITY_MESSAGES_MIN = 1
const RECENT_HUMAN_ACTIVITY_MESSAGES_MAX = 200
const RECENT_HUMAN_ACTIVITY_HISTORY_MIN_LIMIT = 50
const PERSONALIZED_HANDOFF_CONTEXT_LIMIT = 8
const PERSONALIZED_HANDOFF_TEMPERATURE = 0.3
const CONTEXT_FILE_ID_MAX = 80
const CONTEXT_FILE_NAME_MAX = 80
const CONTEXT_FILE_MIME_MAX = 80
const CONTEXT_FILE_DESC_MAX = 180
const CONTEXT_FILE_WHEN_MAX = 140
type AiLanguage = 'pt-BR' | 'en'

const FIELD_SUGGEST_SYSTEM_PROMPT_PT = `Voce e um assistente que sugere alteracoes em campos de CRM (leads/clientes).
Sua tarefa e propor, quando fizer sentido, um PATCH para atualizar:
- observations: string | null
- status: um dos valores permitidos em allowedStatus
- nextContactAt: epoch em ms | null

Regras:
- Use SOMENTE o que esta no historico e na resposta enviada pela IA.
- Nao invente informacoes. Se nao houver sugestao util, retorne patch vazio.
- Responda SOMENTE JSON valido, sem texto extra, no formato:
{"patch": {"observations": string|null, "status": "string", "nextContactAt": number|null}, "reason": "curto"}
- O objeto patch pode omitir campos. Nao inclua chaves desconhecidas.`

const FIELD_SUGGEST_SYSTEM_PROMPT_EN = `You are an assistant that suggests updates to CRM fields (leads/clients).
Your task is to propose, when it makes sense, a PATCH to update:
- observations: string | null
- status: one of the values allowed in allowedStatus
- nextContactAt: epoch in ms | null

Rules:
- Use ONLY what is present in the history and in the AI reply.
- Do not invent information. If there is no useful suggestion, return an empty patch.
- Reply with ONLY valid JSON, no extra text, in this format:
{"patch": {"observations": string|null, "status": "string", "nextContactAt": number|null}, "reason": "short"}
- The patch object may omit fields. Do not include unknown keys.`

const LEGACY_FIELD_SUGGEST_PROMPT_PT = FIELD_SUGGEST_SYSTEM_PROMPT_PT

const LEGACY_FIELD_SUGGEST_PROMPT_PT_ACCENTED = `Você é um assistente que sugere alterações em campos de CRM (leads/clientes).
Sua tarefa é propor, quando fizer sentido, um PATCH para atualizar:
- observations: string | null
- status: um dos valores permitidos em allowedStatus
- nextContactAt: epoch em ms | null

Regras:
- Use SOMENTE o que está no histórico e na resposta enviada pela IA.
- Não invente informações. Se não houver sugestão útil, retorne patch vazio.
- Responda SOMENTE JSON válido, sem texto extra, no formato:
{"patch": {"observations": string|null, "status": "string", "nextContactAt": number|null}, "reason": "curto"}
- O objeto patch pode omitir campos. Não inclua chaves desconhecidas.`

const LEGACY_FIELD_SUGGEST_PROMPT_EN = FIELD_SUGGEST_SYSTEM_PROMPT_EN

const FOLLOW_UP_GENERATION_PROMPT_PT =
  'Gere uma mensagem de follow-up para retomar o contato com base no histórico acima.'

const FOLLOW_UP_GENERATION_PROMPT_EN =
  'Generate a follow-up message to resume contact based on the conversation history above.'

const FIELD_SUGGEST_REQUEST_PROMPT_PT = 'Analise o JSON abaixo e responda no formato exigido.'

const FIELD_SUGGEST_REQUEST_PROMPT_EN = 'Analyze the JSON below and respond in the required format.'

function resolveFieldSuggestSystemPrompt(training?: AiTrainingData): string {
  const language = resolveTrainingLanguage(training)
  const basePrompt = language === 'en' ? FIELD_SUGGEST_SYSTEM_PROMPT_EN : FIELD_SUGGEST_SYSTEM_PROMPT_PT
  const userInstructions = normalizeFieldSuggestionUserInstructions(training?.instrucoesSugestoesLeadsClientes)
  if (!userInstructions) {
    return basePrompt
  }

  const additionalInfoTitle = language === 'en' ? 'Additional information from the user:' : 'Mais informacoes do usuario:'

  return `${basePrompt}\n\n${additionalInfoTitle}\n${userInstructions}`
}

function normalizeFieldSuggestionUserInstructions(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  const legacyPrompts = [
    LEGACY_FIELD_SUGGEST_PROMPT_PT,
    LEGACY_FIELD_SUGGEST_PROMPT_PT_ACCENTED,
    LEGACY_FIELD_SUGGEST_PROMPT_EN
  ]
    .map((entry) => entry.replace(/\r\n/g, '\n').trim())
    .filter(Boolean)

  for (const legacy of legacyPrompts) {
    if (normalized === legacy) {
      return ''
    }
    if (normalized.startsWith(`${legacy}\n\n`)) {
      return normalized.slice(legacy.length).trim()
    }
  }

  return normalized
}

function buildFieldSuggestionTrainingContext(training?: AiTrainingData): Record<string, string> | null {
  if (!training) {
    return null
  }

  const context: Record<string, string> = {}
  const assign = (key: string, value: unknown, maxLength = FIELD_SUGGEST_MAX_TRAINING_TEXT) => {
    if (typeof value !== 'string') {
      return
    }
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }
    context[key] = truncateText(trimmed, maxLength)
  }

  assign('language', training.language, 16)
  assign('nomeEmpresa', training.nomeEmpresa, FIELD_SUGGEST_MAX_TRAINING_SHORT_TEXT)
  assign('nomeIA', training.nomeIA, FIELD_SUGGEST_MAX_TRAINING_SHORT_TEXT)
  assign('tipoResposta', training.tipoResposta)
  assign('orientacoesGerais', training.orientacoesGerais)
  assign('instrucoesLeadsTagPassiva', training.instrucoesLeadsTagPassiva)
  assign('instrucoesLeadsTagAtiva', training.instrucoesLeadsTagAtiva)
  assign('empresa', training.empresa)
  assign('descricaoServicosProdutosVendidos', training.descricaoServicosProdutosVendidos)
  assign('horarios', training.horarios)
  assign('outros', training.outros)

  return Object.keys(context).length > 0 ? context : null
}

export type FollowUpBlockedReason =
  | 'group_chat'
  | 'broadcast_chat'
  | 'opted_out'
  | 'ai_disabled'
  | 'chat_disabled'
  | 'no_credits'
  | 'provider_unconfigured'
  | 'clients_disabled'
  | 'recent_human_activity'
  | 'delivery_guard'

type FollowUpAccessOptions = {
  allowClients?: boolean
  ignoreGlobalAiToggle?: boolean
  ignoreChatAiToggle?: boolean
  extraFollowUpMeta?: Record<string, unknown>
  objectivePrompt?: string
}

export class FollowUpBlockedError extends Error {
  readonly reason: FollowUpBlockedReason

  constructor(reason: FollowUpBlockedReason, message: string) {
    super(message)
    this.name = 'FollowUpBlockedError'
    this.reason = reason
  }
}

export class AiMessageService {
  private readonly inboundStore: InboundMessageStore
  private readonly outboundService: OutboundMessageService
  private readonly configStore: AiConfigStore
  private readonly chatConfigStore?: ChatAiConfigStore
  private readonly responseStore: AiResponseStore
  private readonly contextCache: AiContextCache
  private readonly optOutStore: AiOptOutStore
  private readonly openAiClient: OpenAiClient
  private readonly geminiClient?: GeminiClient
  private readonly defaultConfig: AiConfig
  private readonly agendaStore?: AgendaStore
  private readonly fileLibrary?: AiFileLibrary
  private readonly chatService?: ChatService
  private readonly presentationStore?: AiPresentationStore
  private readonly promptStore?: AiPromptStore
  private readonly systemSettings?: SystemSettingsService
  private readonly clientStore?: ClientStore
  private readonly leadStore?: LeadStore
  private readonly leadConversionStore?: LeadConversionStore
  private readonly suggestionStore?: AiFieldSuggestionStore
  private readonly usageStore?: AiUsageStore
  private readonly creditsService?: CreditsService
  private readonly findmyangelContextProvider?: FindmyangelContextProvider
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly clientClassifyThreshold: number
  private readonly clientClassifyCooldownSec: number
  private readonly onFirstAiResponseSent?: AiMessageServiceOptions['onFirstAiResponseSent']
  private readonly clientClassifyCache = new Map<string, number>()
  private loggedMissingKey = false

  constructor(options: AiMessageServiceOptions) {
    this.inboundStore = options.inboundStore
    this.outboundService = options.outboundService
    this.configStore = options.configStore
    this.chatConfigStore = options.chatConfigStore
    this.responseStore = options.responseStore
    this.contextCache = options.contextCache
    this.optOutStore = options.optOutStore
    this.openAiClient = options.openAiClient
    this.geminiClient = options.geminiClient
    this.defaultConfig = options.defaultConfig
    this.agendaStore = options.agendaStore
    this.fileLibrary = options.fileLibrary
    this.chatService = options.chatService
    this.presentationStore = options.presentationStore
    this.promptStore = options.promptStore
    this.systemSettings = options.systemSettings
    this.clientStore = options.clientStore
    this.leadStore = options.leadStore
    this.leadConversionStore = options.leadConversionStore
    this.suggestionStore = options.suggestionStore
    this.usageStore = options.usageStore
    this.creditsService = options.creditsService
    this.findmyangelContextProvider = options.findmyangelContextProvider
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.clientClassifyThreshold = clampNumber(options.clientClassifyThreshold ?? 0.8, 0, 1)
    this.clientClassifyCooldownSec = Math.max(0, options.clientClassifyCooldownSec ?? 0)
    this.onFirstAiResponseSent = options.onFirstAiResponseSent
  }

  async handleInbound(item: InboundQueueItem): Promise<void> {
    const inbound = await this.inboundStore.getById(item.inboundId)
    if (!inbound) {
      this.logger.warn?.('AI inbound missing', { inboundId: item.inboundId })
      this.metrics?.increment('ai.inbound.missing')
      return
    }

    const config = await this.resolveConfig(inbound.sessionId)
    const text = inbound.text?.trim() ?? ''
    if (!config.respondInGroups && isGroupChat(inbound.chatId)) {
      this.metrics?.increment('ai.skipped.group')
      return
    }
    const chatConfig = await this.chatConfigStore?.get(inbound.sessionId, inbound.chatId)
    if (chatConfig?.aiEnabled === false) {
      this.metrics?.increment('ai.skipped.chat_disabled')
      return
    }
    if (!config.enabled) {
      if (text && inbound.fromMe) {
        await this.appendContext(inbound, 'assistant')
      }
      this.metrics?.increment('ai.skipped.disabled')
      return
    }

    if (config.provider === 'openai') {
      if (!this.openAiClient.isConfigured()) {
        if (!this.loggedMissingKey) {
          this.loggedMissingKey = true
          this.logger.warn?.('AI disabled: OpenAI key missing')
        }
        this.metrics?.increment('ai.skipped.no_key')
        return
      }
    } else if (config.provider === 'google') {
      if (!this.geminiClient?.isConfigured()) {
        this.logger.warn?.('AI disabled: Gemini key missing')
        this.metrics?.increment('ai.skipped.no_key')
        return
      }
    } else {
      this.metrics?.increment('ai.skipped.provider')
      return
    }

    if (!text) {
      this.metrics?.increment('ai.skipped.no_text')
      return
    }

    if (inbound.fromMe) {
      await this.appendContext(inbound, 'assistant')
      this.metrics?.increment('ai.skipped.from_me')
      return
    }

    const isGroup = isGroupChat(inbound.chatId)
    const isBroadcast = isBroadcastChat(inbound.chatId)
    const whatsapp = !isGroup && !isBroadcast ? extractWhatsappFromJid(inbound.chatId) : null
    let existingClient: ClientRecord | null = null

    if (
      this.clientStore &&
      !isGroup &&
      !isBroadcast &&
      (config.training?.responderClientes !== true || config.training?.autoClassificarLeadComoCliente)
    ) {
      try {
        existingClient = await this.clientStore.findByChatOrWhatsapp(inbound.sessionId, inbound.chatId, whatsapp)
      } catch (error) {
        this.logger.warn?.('AI client lookup failed', {
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          error: (error as Error).message
        })
      }
    }

    if (existingClient && config.training?.responderClientes !== true) {
      this.metrics?.increment('ai.skipped.client')
      return
    }

    const optDecision = evaluateOptOut(text, config.optOutKeywords, config.optInKeywords)
    if (optDecision.action === 'opt_in') {
      await this.optOutStore.clearOptOut(inbound.sessionId, inbound.chatId)
    } else if (optDecision.action === 'opt_out') {
      await this.optOutStore.setOptOut(inbound.sessionId, inbound.chatId)
      this.metrics?.increment('ai.skipped.opt_out')
      return
    }

    const optedOut = await this.optOutStore.isOptedOut(inbound.sessionId, inbound.chatId)
    if (optedOut) {
      this.metrics?.increment('ai.skipped.opted_out')
      return
    }

    if (!isWithinBusinessHours(inbound.messageTimestampMs, config.businessHours)) {
      this.metrics?.increment('ai.skipped.business_hours')
      return
    }

    const started = await this.responseStore.tryStart(item.inboundId, inbound.sessionId, inbound.chatId)
    if (!started) {
      this.metrics?.increment('ai.skipped.locked')
      return
    }

    const latestBefore = await this.isLatestUserInbound(inbound)
    if (!latestBefore) {
      await this.responseStore.markSkipped(item.inboundId, 'superseded-pre')
      this.metrics?.increment('ai.skipped.superseded_pre')
      return
    }

    const blockedByRecentHumanActivity = await this.shouldBlockByRecentHumanActivity(
      inbound.sessionId,
      inbound.chatId,
      config
    )
    if (blockedByRecentHumanActivity) {
      await this.disableChatByRecentHumanActivity(inbound.sessionId, inbound.chatId)
      await this.responseStore.markSkipped(item.inboundId, 'recent-human-activity')
      this.metrics?.increment('ai.skipped.recent_human_activity')
      return
    }

    const blockedByDeliveryGuard = await this.shouldBlockByDeliveryGuard(
      inbound.sessionId,
      inbound.chatId,
      config
    )
    if (blockedByDeliveryGuard) {
      await this.disableChatByDeliveryGuard(inbound.sessionId, inbound.chatId)
      await this.responseStore.markSkipped(item.inboundId, 'delivery-guard')
      this.metrics?.increment('ai.skipped.delivery_guard')
      return
    }

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(inbound.sessionId)
      if (!canUse) {
        await this.responseStore.markSkipped(item.inboundId, 'insufficient_credits')
        this.metrics?.increment('ai.skipped.no_credits')
        return
      }
    }

    const presentationCounter = await this.presentationStore?.getCounter(inbound.sessionId, inbound.chatId)
    const shouldIntroduce = shouldIntroduceToUser(config, presentationCounter ?? 0)
    const language = resolveTrainingLanguage(config.training)
    const context = await this.buildContext(inbound, config, language)

    const autoConvert = await this.maybeAutoConvertLead({
      inbound,
      config,
      context,
      existingClient,
      whatsapp
    })
    if (autoConvert.action === 'skip') {
      await this.responseStore.markSkipped(item.inboundId, 'auto-converted-client')
      this.metrics?.increment('ai.skipped.auto_converted_client')
      return
    }
    if (autoConvert.action === 'fallback') {
      const latestAuto = await this.isLatestUserInbound(inbound)
      if (!latestAuto) {
        await this.responseStore.markSkipped(item.inboundId, 'superseded-auto-convert')
        this.metrics?.increment('ai.skipped.superseded_post')
        return
      }

      const fallbackReply = resolveHandoffText(config.training)
      this.metrics?.increment('ai.fallback.used')
      const outboundId = await this.sendReply(inbound, fallbackReply, `ai:auto-convert:${item.inboundId}`)
      await this.responseStore.markSent(item.inboundId, fallbackReply, outboundId)
      await this.updatePresentationCounter(inbound, config, shouldIntroduce)
      this.metrics?.increment('ai.sent')
      return
    }

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(inbound.sessionId)
      if (!canUse) {
        await this.responseStore.markSkipped(item.inboundId, 'insufficient_credits')
        this.metrics?.increment('ai.skipped.no_credits')
        return
      }
    }

    let promptFiles: AiUserFile[] = []
    if (config.training?.permitirIAEnviarArquivos === true && this.fileLibrary) {
      try {
        promptFiles = await this.fileLibrary.list(inbound.sessionId, PROMPT_FILES_LIMIT)
      } catch (error) {
        this.logger.warn?.('AI file library load failed', {
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          error: (error as Error).message
        })
      }
    }
    const promptFilesById = new Map(promptFiles.map((file) => [file.id, file] as const))

    const timezone = config.businessHours?.timezone || 'America/Sao_Paulo'
    const findmyangelMeta = await this.buildFindmyangelMeta(inbound.sessionId, inbound.chatId)
    const leadTag = await this.resolveLeadTag(inbound.sessionId, inbound.chatId, whatsapp)
    const systemPrompt = buildLegacyPrompt({
      training: config.training,
      fallbackPrompt: config.systemPrompt,
      timezone,
      shouldIntroduce,
      leadTag,
      meta: findmyangelMeta ?? undefined,
      files: promptFiles.map((file) => ({
        id: file.id,
        nome: file.nome,
        descricao: file.descricao,
        quandoUsar: file.quandoUsar,
        tipo: file.tipo
      }))
    })
    const messages = buildOpenAiMessages(systemPrompt, context, { timezone, language })
    const promptEntry: AiPromptEntry = {
      timestamp: new Date().toISOString(),
      sessionId: inbound.sessionId,
      chatId: inbound.chatId,
      model: config.model,
      systemPrompt,
      messages
    }
    this.promptStore?.add(promptEntry)
    if (this.systemSettings?.getDebugAiPrompt()) {
      this.logPrompt(promptEntry)
    }

    let reply = ''
    let rawReply: string | null = null
    let usage: AiTokenUsage | undefined
    try {
      const useAgendaTools = config.training?.usarAgendaAutomatica === true && Boolean(this.agendaStore)
      if (useAgendaTools) {
        const toolMessages: ToolChatMessage[] = messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
        const executeTool = createAgendaToolExecutor({
          agendaStore: this.agendaStore!,
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          timezone,
          logger: this.logger,
          metrics: this.metrics
        })

        const result = await runWithTools({
          provider: config.provider,
          model: config.model,
          temperature: config.temperature,
          messages: toolMessages,
          tools: buildAgendaTools(language),
          executeTool,
          openAiClient: this.openAiClient,
          geminiClient: this.geminiClient,
          language,
          maxIterations: 5,
          timeoutMs: config.processingTimeoutMs,
          logger: this.logger
        })
        reply = result.content
        rawReply = reply
        usage = result.usage
      } else if (config.provider === 'google') {
        const result = await this.geminiClient!.createChatCompletion({
          model: config.model,
          temperature: config.temperature,
          messages
        })
        reply = result.content
        rawReply = reply
        usage = result.usage
      } else {
        const result = await this.openAiClient.createChatCompletion({
          model: config.model,
          temperature: config.temperature,
          messages
        })
        reply = result.content
        rawReply = reply
        usage = result.usage
      }
    } catch (error) {
      const message = (error as Error).message
      this.logger.error?.('AI generation failed', {
        inboundId: item.inboundId,
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        provider: config.provider,
        error: message
      })
      this.metrics?.increment('ai.failed')
      this.metrics?.increment('errors.total')

      if (config.provider === 'google') {
        await this.responseStore.markFailed(item.inboundId, message)
        return
      }

      if (config.fallbackMode === 'reply' && config.fallbackText.trim()) {
        reply = config.fallbackText.trim()
        this.metrics?.increment('ai.fallback.used')
      } else {
        await this.responseStore.markFailed(item.inboundId, message)
        return
      }
    }

    if (usage) {
      await this.recordUsage({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        provider: config.provider,
        model: config.model,
        operation: 'response',
        usage
      })
    } else {
      this.metrics?.increment('ai.usage.missing')
    }

    if (rawReply !== null && this.systemSettings?.getDebugAiResponse()) {
      this.logResponse({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        model: config.model,
        provider: config.provider,
        timestamp: new Date().toISOString(),
        inboundId: inbound.id,
        reply: rawReply
      })
    }

    if (!reply) {
      await this.responseStore.markSkipped(item.inboundId, 'empty-response')
      this.metrics?.increment('ai.skipped.empty_response')
      return
    }

    if (isOutOfContextReply(reply)) {
      const shouldDisable = config.training?.desligarMensagemForaContexto === true
      const comportamento = resolveComportamentoNaoSabe(config.training)

      if (shouldDisable && this.chatConfigStore) {
        await this.chatConfigStore.disable(inbound.sessionId, inbound.chatId, 'context')
      }

      if (shouldDisable && comportamento !== 'encaminhar') {
        await this.responseStore.markSkipped(item.inboundId, 'out-of-context')
        this.metrics?.increment('ai.skipped.out_of_context')
        return
      }

      if (!shouldDisable && comportamento === 'silencio') {
        await this.responseStore.markSkipped(item.inboundId, 'out-of-context-silence')
        this.metrics?.increment('ai.skipped.out_of_context')
        return
      }

      const personalizedHandoffReply = await this.generatePersonalizedHandoffReply({
        inbound,
        config,
        context,
        timezone,
        language
      })

      if (personalizedHandoffReply) {
        reply = personalizedHandoffReply
      } else {
        reply = resolveHandoffText(config.training)
        this.metrics?.increment('ai.fallback.used')
      }
    }

    const latestAfter = await this.isLatestUserInbound(inbound)
    if (!latestAfter) {
      await this.responseStore.markSkipped(item.inboundId, 'superseded-post')
      this.metrics?.increment('ai.skipped.superseded_post')
      return
    }

    const sanitizedReply = sanitizeAssistantReplyOutput(reply)
    const { cleanedReply, items: replyItems, fileIds, contacts } = extractOrderedSendSequence(sanitizedReply)
    const trimmedReply = cleanedReply.trim()

    const filesById = new Map<string, AiUserFile>()
    let allowedFileIds: string[] = []
    if (config.training?.permitirIAEnviarArquivos === true && fileIds.length > 0) {
      for (const fileId of fileIds) {
        const resolved =
          promptFilesById.get(fileId) ??
          (this.fileLibrary ? await this.fileLibrary.get(inbound.sessionId, fileId).catch(() => null) : null)

        if (!resolved) {
          this.metrics?.increment('ai.files.missing')
          continue
        }

        if (resolved.sizeBytes > 0 && resolved.sizeBytes > MAX_FILE_SIZE_BYTES) {
          this.metrics?.increment('ai.files.too_large')
          continue
        }

        if (!resolved.downloadUrl?.trim()) {
          this.metrics?.increment('ai.files.missing_url')
          continue
        }

        filesById.set(fileId, resolved)
        allowedFileIds.push(fileId)
      }

      if (allowedFileIds.length > MAX_FILES_PER_AI_REPLY) {
        const truncatedFileIds = allowedFileIds.slice(0, MAX_FILES_PER_AI_REPLY)
        const allowedSet = new Set(truncatedFileIds)
        for (const fileId of Array.from(filesById.keys())) {
          if (!allowedSet.has(fileId)) {
            filesById.delete(fileId)
          }
        }
        allowedFileIds = truncatedFileIds
        this.metrics?.increment('ai.files.truncated')
        this.logger.warn?.('AI files truncated', {
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          requested: fileIds.length,
          allowed: MAX_FILES_PER_AI_REPLY
        })
      }
    } else if (fileIds.length > 0) {
      this.metrics?.increment('ai.files.ignored_disabled')
    }

    let contactsToSend: Array<{ name: string; whatsapp: string }> = []
    if (config.training?.permitirIAEnviarArquivos === true && contacts.length > 0) {
      contactsToSend = contacts
    } else if (contacts.length > 0) {
      this.metrics?.increment('ai.contacts.ignored_disabled')
    }

    const allowedFileIdSet = new Set(allowedFileIds)
    const orderedItems: OrderedAiReplySendItem[] = []
    for (const replyItem of replyItems) {
      if (replyItem.type === 'text') {
        orderedItems.push(replyItem)
        continue
      }
      if (!allowedFileIdSet.has(replyItem.fileId)) {
        continue
      }
      const file = filesById.get(replyItem.fileId)
      if (!file) {
        continue
      }
      orderedItems.push({ type: 'file', file })
    }

    let firstOutboundId: number | undefined
    let sentCount = 0
    let orderedStepIndex = 0
    const baseTimestamp = Date.now()
    const storedResponseParts: string[] = []
    for (const orderedItem of orderedItems) {
      if (orderedItem.type === 'text') {
        const outbound = await this.outboundService.enqueue({
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          text: orderedItem.text,
          idempotencyKey: `ai:${item.inboundId}:step:${orderedStepIndex}`,
          origin: 'ai'
        })

        if (!firstOutboundId) {
          firstOutboundId = outbound.id
        }
        sentCount += 1
        orderedStepIndex += 1
        storedResponseParts.push(orderedItem.text)

        await this.contextCache.appendMessage(inbound.sessionId, inbound.chatId, {
          role: 'assistant',
          text: orderedItem.text,
          timestampMs: baseTimestamp + sentCount,
          messageId: `outbound:${outbound.id}`,
          fromMe: true,
          origin: 'ai'
        })
        continue
      }

      const file = orderedItem.file
      const mediaType =
        file.tipo === 'image'
          ? 'imageMessage'
          : file.tipo === 'video'
            ? 'videoMessage'
            : file.tipo === 'audio'
              ? 'audioMessage'
              : 'documentMessage'

      const wantsPdf = (file.mimeType || '').trim().toLowerCase() === 'application/pdf'
      const baseName = file.nome?.trim() || 'arquivo'
      const fileName =
        file.tipo === 'document'
          ? wantsPdf && !baseName.toLowerCase().endsWith('.pdf')
            ? `${baseName}.pdf`
            : baseName
          : undefined
      const filePlaceholder = buildStoredFilePlaceholder(file.nome, language)

      const outbound = await this.outboundService.enqueueMedia({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        mediaType,
        url: file.downloadUrl,
        mimeType: file.mimeType || undefined,
        fileName,
        aiFile: {
          id: file.id,
          nome: file.nome,
          tipo: file.tipo,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          descricao: file.descricao,
          quandoUsar: file.quandoUsar,
          updatedAtMs: file.updatedAtMs
        },
        idempotencyKey: `ai:${item.inboundId}:step:${orderedStepIndex}`,
        origin: 'ai'
      })

      if (!firstOutboundId) {
        firstOutboundId = outbound.id
      }
      sentCount += 1
      orderedStepIndex += 1
      storedResponseParts.push(filePlaceholder)

      await this.contextCache.appendMessage(inbound.sessionId, inbound.chatId, {
        role: 'assistant',
        text: filePlaceholder,
        timestampMs: baseTimestamp + sentCount,
        messageId: `outbound:${outbound.id}`,
        fromMe: true,
        origin: 'ai'
      })
    }

    for (let index = 0; index < contactsToSend.length; index += 1) {
      const contact = contactsToSend[index]
      const contactPlaceholder = buildStoredContactPlaceholder(contact.name, language)
      const outbound = await this.outboundService.enqueueContact({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        contacts: [{ name: contact.name, whatsapp: contact.whatsapp }],
        displayName: contact.name,
        idempotencyKey: `ai:${item.inboundId}:contact:${index}`,
        origin: 'ai'
      })

      if (!firstOutboundId) {
        firstOutboundId = outbound.id
      }
      sentCount += 1

      await this.contextCache.appendMessage(inbound.sessionId, inbound.chatId, {
        role: 'assistant',
        text: contactPlaceholder,
        timestampMs: baseTimestamp + sentCount,
        messageId: `outbound:${outbound.id}`,
        fromMe: true,
        origin: 'ai'
      })
    }

    if (!firstOutboundId) {
      await this.responseStore.markSkipped(item.inboundId, 'empty-response')
      this.metrics?.increment('ai.skipped.empty_response')
      return
    }

    const storedResponse =
      storedResponseParts.join('\n\n').trim() ||
      buildStoredAttachmentSummary(filesById.size, contactsToSend.length, language)

    await this.responseStore.markSent(item.inboundId, storedResponse, firstOutboundId)
    await this.updatePresentationCounter(inbound, config, shouldIntroduce)
    this.metrics?.increment('ai.sent')
    if (this.onFirstAiResponseSent) {
      void Promise.resolve(
        this.onFirstAiResponseSent({
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          inboundId: inbound.id,
          outboundId: firstOutboundId
        })
      ).catch((error) => {
        this.logger.warn?.('AI first-response onboarding hook failed', {
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          inboundId: inbound.id,
          error: (error as Error).message
        })
      })
    }

    if (trimmedReply) {
      void this.maybeSuggestFieldUpdates({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        config,
        context,
        replyText: trimmedReply
      }).catch((error) => {
        this.logger.warn?.('AI field suggestion failed', {
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          inboundId: inbound.id,
          error: (error as Error).message
        })
        this.metrics?.increment('ai.suggestions.failed')
      })
    }
  }

  async createFollowUpDraft(
    sessionId: string,
    chatId: string,
    options: FollowUpAccessOptions = {}
  ): Promise<{ text: string; meta: Record<string, unknown> }> {
    const safeSessionId = sessionId.trim()
    const safeChatId = chatId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeChatId) {
      throw new Error('chatId is required')
    }

    this.metrics?.increment('ai.followup.draft.requested')
    const config = await this.resolveConfig(safeSessionId)
    const language = resolveTrainingLanguage(config.training)
    await this.ensureFollowUpAllowed({
      sessionId: safeSessionId,
      chatId: safeChatId,
      config,
      requireAiProvider: true,
      requireCredits: true,
      allowClients: options.allowClients === true,
      ignoreGlobalAiToggle: options.ignoreGlobalAiToggle === true,
      ignoreChatAiToggle: options.ignoreChatAiToggle === true
    })

    const limit = Math.max(2, config.contextMaxMessages)
    const history = await this.listChatHistory(safeSessionId, safeChatId, limit)
    const context = history.map((entry) =>
      mapChatMessageToAiContext(entry, language, entry.messageId ?? entry.id ?? null)
    ) satisfies AiContextMessage[]

    const timezone = config.businessHours?.timezone || 'America/Sao_Paulo'
    const now = new Date()
    const meta = buildFollowUpMeta(history, now, timezone, language)
    const mergedMeta = mergeFollowUpMeta(meta, options.extraFollowUpMeta)
    const followUpWhatsapp =
      !isGroupChat(safeChatId) && !isBroadcastChat(safeChatId) ? extractWhatsappFromJid(safeChatId) : null
    const leadTag = await this.resolveLeadTag(safeSessionId, safeChatId, followUpWhatsapp)

    const presentationCounter = await this.presentationStore?.getCounter(safeSessionId, safeChatId)
    const shouldIntroduce = shouldIntroduceToUser(config, presentationCounter ?? 0)
    const findmyangelMeta = await this.buildFindmyangelMeta(safeSessionId, safeChatId)
    const followUpFallbackPrompt = resolveFollowUpFallbackPrompt(config)
    const systemPrompt = buildFollowUpPrompt({
      training: config.training,
      fallbackPrompt: followUpFallbackPrompt,
      timezone,
      shouldIntroduce,
      now,
      meta: findmyangelMeta ?? undefined,
      leadTag,
      followUpMeta: mergedMeta,
      objectivePrompt: options.objectivePrompt
    })

    const messages = buildOpenAiMessages(systemPrompt, context, { timezone, language })
    messages.push({
      role: 'user',
      content: language === 'en' ? FOLLOW_UP_GENERATION_PROMPT_EN : FOLLOW_UP_GENERATION_PROMPT_PT
    })

    const promptEntry: AiPromptEntry = {
      timestamp: new Date().toISOString(),
      sessionId: safeSessionId,
      chatId: safeChatId,
      model: config.model,
      systemPrompt,
      messages
    }
    this.promptStore?.add(promptEntry)
    if (this.systemSettings?.getDebugAiPrompt()) {
      this.logPrompt(promptEntry)
    }

    let reply = ''
    let usage: AiTokenUsage | undefined
    try {
      if (config.provider === 'google') {
        const result = await this.geminiClient!.createChatCompletion({
          model: config.model,
          temperature: config.temperature,
          messages
        })
        reply = result.content
        usage = result.usage
      } else {
        const result = await this.openAiClient.createChatCompletion({
          model: config.model,
          temperature: config.temperature,
          messages
        })
        reply = result.content
        usage = result.usage
      }
    } catch (error) {
      this.metrics?.increment('ai.followup.draft.failed')
      this.metrics?.increment('errors.total')
      throw error
    }

    if (usage) {
      await this.recordUsage({
        sessionId: safeSessionId,
        chatId: safeChatId,
        inboundId: null,
        provider: config.provider,
        model: config.model,
        operation: 'response',
        usage
      })
    } else {
      this.metrics?.increment('ai.usage.missing')
    }

    const trimmed = sanitizeAssistantReplyOutput(reply).trim()
    if (!trimmed) {
      this.metrics?.increment('ai.followup.draft.empty')
      throw new Error('AI draft returned empty response')
    }

    this.metrics?.increment('ai.followup.draft.generated')
    return { text: trimmed, meta: mergedMeta }
  }

  async sendFollowUp(
    sessionId: string,
    chatId: string,
    text: string,
    idempotencyKey?: string,
    options: FollowUpAccessOptions = {}
  ): Promise<OutboundMessageRecord> {
    const safeSessionId = sessionId.trim()
    const safeChatId = chatId.trim()
    const safeText = sanitizeAssistantReplyOutput(text).trim()
    const safeKey = idempotencyKey?.trim() || undefined

    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeChatId) {
      throw new Error('chatId is required')
    }
    if (!safeText) {
      throw new Error('text is required')
    }

    this.metrics?.increment('ai.followup.send.requested')
    const config = await this.resolveConfig(safeSessionId)
    await this.ensureFollowUpAllowed({
      sessionId: safeSessionId,
      chatId: safeChatId,
      config,
      requireAiProvider: false,
      requireCredits: false,
      allowClients: options.allowClients === true,
      ignoreGlobalAiToggle: options.ignoreGlobalAiToggle === true,
      ignoreChatAiToggle: options.ignoreChatAiToggle === true
    })

    const presentationCounter = await this.presentationStore?.getCounter(safeSessionId, safeChatId)
    const shouldIntroduce = shouldIntroduceToUser(config, presentationCounter ?? 0)

    const parts = splitReply(safeText)
    let firstOutbound: OutboundMessageRecord | null = null

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const outbound = await this.outboundService.enqueue({
        sessionId: safeSessionId,
        chatId: safeChatId,
        text: part,
        idempotencyKey: safeKey ? `${safeKey}:${index}` : undefined,
        origin: 'ai'
      })

      if (!firstOutbound) {
        firstOutbound = outbound
      }

      await this.contextCache.appendMessage(safeSessionId, safeChatId, {
        role: 'assistant',
        text: part,
        timestampMs: Date.now() + index,
        messageId: `outbound:${outbound.id}`,
        fromMe: true,
        origin: 'ai'
      })
    }

    await this.updatePresentationCounterForChat(safeSessionId, safeChatId, config, shouldIntroduce)
    this.metrics?.increment('ai.followup.send.enqueued')
    if (!firstOutbound) {
      throw new Error('followup_enqueue_failed')
    }
    return firstOutbound
  }

  async suggestFieldUpdatesAfterFollowUp(
    sessionId: string,
    chatId: string,
    replyText: string,
    options: FollowUpAccessOptions = {}
  ): Promise<void> {
    const safeSessionId = sessionId.trim()
    const safeChatId = chatId.trim()
    const safeReplyText = replyText.trim()
    if (!safeSessionId || !safeChatId || !safeReplyText) {
      return
    }

    let config: AiConfig
    try {
      config = await this.resolveConfig(safeSessionId)
      await this.ensureFollowUpAllowed({
        sessionId: safeSessionId,
        chatId: safeChatId,
        config,
        requireAiProvider: false,
        requireCredits: false,
        allowClients: options.allowClients === true
      })
    } catch (error) {
      if (error instanceof FollowUpBlockedError) {
        return
      }
      this.logger.warn?.('AI follow-up field suggestion config failed', {
        sessionId: safeSessionId,
        chatId: safeChatId,
        error: (error as Error).message
      })
      return
    }

    const language = resolveTrainingLanguage(config.training)
    const limit = Math.max(1, config.contextMaxMessages)
    let context: AiContextMessage[] = []
    try {
      const history = await this.listChatHistory(safeSessionId, safeChatId, limit)
      context = history.map((entry) =>
        mapChatMessageToAiContext(entry, language, entry.messageId ?? entry.id ?? null)
      )
    } catch (error) {
      this.logger.warn?.('AI follow-up field suggestion history failed', {
        sessionId: safeSessionId,
        chatId: safeChatId,
        error: (error as Error).message
      })
    }

    try {
      await this.maybeSuggestFieldUpdates({
        sessionId: safeSessionId,
        chatId: safeChatId,
        inboundId: null,
        config,
        context,
        replyText: safeReplyText
      })
    } catch (error) {
      this.logger.warn?.('AI follow-up field suggestion failed', {
        sessionId: safeSessionId,
        chatId: safeChatId,
        error: (error as Error).message
      })
      this.metrics?.increment('ai.suggestions.failed')
    }
  }

  async runGuidedTest(sessionId: string): Promise<GuidedTestResult> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    this.metrics?.increment('ai.guided_test.requested')
    const config = await this.resolveConfig(safeSessionId)
    return this.executeGuidedTest(safeSessionId, config)
  }

  async runOnboardingGuidedTest(
    sessionId: string,
    input: {
      draftTraining: AiTrainingData
    }
  ): Promise<GuidedTestResult> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }

    this.metrics?.increment('ai.guided_test.requested')
    const baseConfig = await this.resolveConfig(safeSessionId)
    const config: AiConfig = {
      ...baseConfig,
      training: {
        ...(baseConfig.training ?? {}),
        ...(input.draftTraining ?? {})
      }
    }
    return this.executeGuidedTest(safeSessionId, config)
  }

  private async executeGuidedTest(sessionId: string, config: AiConfig): Promise<GuidedTestResult> {
    const language = resolveTrainingLanguage(config.training)

    if (config.provider === 'google') {
      if (!this.geminiClient?.isConfigured()) {
        throw new Error('Gemini is not configured. Set GEMINI_API_KEY.')
      }
    } else if (!this.openAiClient.isConfigured()) {
      throw new Error('OpenAI is not configured. Set OPENAI_API_KEY.')
    }

    const timezone = config.businessHours?.timezone || 'America/Sao_Paulo'
    const systemPrompt = [
      buildLegacyPrompt({
        training: config.training,
        fallbackPrompt: config.systemPrompt,
        timezone,
        shouldIntroduce: false
      }),
      buildOnboardingGuidedTestPrompt(language)
    ].join('\n\n')
    const scenario = buildGuidedTestScenario(language)
    const transcript: GuidedTestTranscriptEntry[] = []
    const context: AiContextMessage[] = []
    let timestampMs = Date.now()

    for (const userText of scenario) {
      const normalizedUser = userText.trim()
      transcript.push({ role: 'user', text: normalizedUser })
      context.push({
        role: 'user',
        text: normalizedUser,
        timestampMs,
        fromMe: false,
        origin: 'inbound'
      })
      timestampMs += 1

      const messages = buildOpenAiMessages(systemPrompt, context, { timezone, language })
      let reply = ''
      let usage: AiTokenUsage | undefined

      if (config.provider === 'google') {
        const result = await this.geminiClient!.createChatCompletion({
          model: config.model,
          temperature: config.temperature,
          messages
        })
        reply = result.content
        usage = result.usage
      } else {
        const result = await this.openAiClient.createChatCompletion({
          model: config.model,
          temperature: config.temperature,
          messages
        })
        reply = result.content
        usage = result.usage
      }

      if (usage) {
        await this.recordUsage({
          sessionId,
          chatId: '__guided_test__',
          inboundId: null,
          provider: config.provider,
          model: config.model,
          operation: 'response',
          usage
        })
      } else {
        this.metrics?.increment('ai.usage.missing')
      }

      const normalizedReply = reply.trim() || resolveHandoffText(config.training)
      transcript.push({ role: 'assistant', text: normalizedReply })
      context.push({
        role: 'assistant',
        text: normalizedReply,
        timestampMs,
        fromMe: true,
        origin: 'ai'
      })
      timestampMs += 1
    }

    const checks = evaluateGuidedTestChecks(transcript, config.training, language)
    const passed = checks.every((check) => check.passed)
    if (passed) {
      this.metrics?.increment('ai.guided_test.passed')
    } else {
      this.metrics?.increment('ai.guided_test.failed')
    }

    return {
      passed,
      checks,
      transcript
    }
  }

  async generateOnboardingGuidedReply(
    sessionId: string,
    input: {
      draftTraining: AiTrainingData
      transcript: GuidedTestTranscriptEntry[]
      userMessage: string
    }
  ): Promise<OnboardingGuidedReplyResult> {
    const safeSessionId = sessionId.trim()
    const safeMessage = input.userMessage?.trim()
    if (!safeSessionId) {
      throw new Error('sessionId is required')
    }
    if (!safeMessage) {
      throw new Error('userMessage is required')
    }

    this.metrics?.increment('ai.onboarding_guided_test.requested')

    if (this.creditsService) {
      const canUse = await this.creditsService.canUse(safeSessionId)
      if (!canUse) {
        throw new Error('no_credits')
      }
    }

    const baseConfig = await this.resolveConfig(safeSessionId)
    const config: AiConfig = {
      ...baseConfig,
      training: {
        ...(baseConfig.training ?? {}),
        ...(input.draftTraining ?? {})
      }
    }
    const language = resolveTrainingLanguage(config.training)

    if (config.provider === 'google') {
      if (!this.geminiClient?.isConfigured()) {
        throw new Error('Gemini is not configured. Set GEMINI_API_KEY.')
      }
    } else if (!this.openAiClient.isConfigured()) {
      throw new Error('OpenAI is not configured. Set OPENAI_API_KEY.')
    }

    const timezone = config.businessHours?.timezone || 'America/Sao_Paulo'
    const systemPrompt = buildLegacyPrompt({
      training: config.training,
      fallbackPrompt: config.systemPrompt,
      timezone,
      shouldIntroduce: false
    })

    const context: AiContextMessage[] = []
    let timestampMs = Date.now()
    for (const entry of input.transcript ?? []) {
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) {
        continue
      }
      const text = typeof entry.text === 'string' ? entry.text.trim() : ''
      if (!text) {
        continue
      }
      context.push({
        role: entry.role,
        text,
        timestampMs,
        fromMe: entry.role === 'assistant',
        origin: entry.role === 'assistant' ? 'ai' : 'inbound'
      })
      timestampMs += 1
    }

    context.push({
      role: 'user',
      text: safeMessage,
      timestampMs,
      fromMe: false,
      origin: 'inbound'
    })

    const messages = buildOpenAiMessages(systemPrompt, context, { timezone, language })
    let reply = ''
    let usage: AiTokenUsage | undefined

    if (config.provider === 'google') {
      const result = await this.geminiClient!.createChatCompletion({
        model: config.model,
        temperature: config.temperature,
        messages
      })
      reply = result.content
      usage = result.usage
    } else {
      const result = await this.openAiClient.createChatCompletion({
        model: config.model,
        temperature: config.temperature,
        messages
      })
      reply = result.content
      usage = result.usage
    }

    const usageSummary = this.buildUsageSummary(config.model, usage)
    if (usage) {
      await this.recordUsage({
        sessionId: safeSessionId,
        chatId: '__onboarding_guided_test__',
        inboundId: null,
        provider: config.provider,
        model: config.model,
        operation: 'response',
        usage
      })
    } else {
      this.metrics?.increment('ai.usage.missing')
    }

    const remainingCredits = this.creditsService
      ? (await this.creditsService.get(safeSessionId)).balanceBrl
      : 0

    const formattedReply = formatGuidedTestAssistantReply(reply.trim() || resolveHandoffText(config.training))

    this.metrics?.increment('ai.onboarding_guided_test.succeeded')
    return {
      assistantMessage: formattedReply.assistantMessage,
      assistantParts: formattedReply.assistantParts,
      usage: usageSummary,
      remainingCredits
    }
  }

  private async ensureFollowUpAllowed(input: {
    sessionId: string
    chatId: string
    config: AiConfig
    requireAiProvider: boolean
    requireCredits: boolean
    allowClients?: boolean
    ignoreGlobalAiToggle?: boolean
    ignoreChatAiToggle?: boolean
  }): Promise<void> {
    if (isGroupChat(input.chatId)) {
      this.metrics?.increment('ai.followup.blocked.group')
      throw new FollowUpBlockedError('group_chat', 'Follow-up não está disponível para grupos.')
    }
    if (isBroadcastChat(input.chatId)) {
      this.metrics?.increment('ai.followup.blocked.broadcast')
      throw new FollowUpBlockedError('broadcast_chat', 'Follow-up não está disponível para listas de transmissão.')
    }

    const chatConfig = await this.chatConfigStore?.get(input.sessionId, input.chatId)
    if (chatConfig?.aiEnabled === false && input.ignoreChatAiToggle !== true) {
      this.metrics?.increment('ai.followup.blocked.chat_disabled')
      throw new FollowUpBlockedError('chat_disabled', 'IA desativada para esta conversa.')
    }

    const optedOut = await this.optOutStore.isOptedOut(input.sessionId, input.chatId)
    if (optedOut) {
      this.metrics?.increment('ai.followup.blocked.opt_out')
      throw new FollowUpBlockedError('opted_out', 'Este contato optou por não receber mensagens automáticas.')
    }

    const whatsapp = extractWhatsappFromJid(input.chatId)
    const isClient = await this.resolveIsClient(input.sessionId, input.chatId, whatsapp)
    if (isClient && input.allowClients !== true && input.config.training?.responderClientes !== true) {
      this.metrics?.increment('ai.followup.blocked.client')
      throw new FollowUpBlockedError(
        'clients_disabled',
        'Treinamento: o envio para clientes está desativado.'
      )
    }

    if (!input.config.enabled && input.ignoreGlobalAiToggle !== true) {
      this.metrics?.increment('ai.followup.blocked.disabled')
      throw new FollowUpBlockedError('ai_disabled', 'IA global desativada para esta sessao.')
    }

    const blockedByRecentHumanActivity = await this.shouldBlockByRecentHumanActivity(
      input.sessionId,
      input.chatId,
      input.config
    )
    if (blockedByRecentHumanActivity) {
      await this.disableChatByRecentHumanActivity(input.sessionId, input.chatId)
      this.metrics?.increment('ai.followup.blocked.recent_human_activity')
      throw new FollowUpBlockedError(
        'recent_human_activity',
        'IA desligada por mensagem humana recente.'
      )
    }

    const blockedByDeliveryGuard = await this.shouldBlockByDeliveryGuard(
      input.sessionId,
      input.chatId,
      input.config
    )
    if (blockedByDeliveryGuard) {
      await this.disableChatByDeliveryGuard(input.sessionId, input.chatId)
      this.metrics?.increment('ai.followup.blocked.delivery_guard')
      throw new FollowUpBlockedError('delivery_guard', 'IA desligada por seguranca de entregabilidade.')
    }

    if (input.requireAiProvider) {
      if (input.config.provider === 'google') {
        if (!this.geminiClient?.isConfigured()) {
          this.metrics?.increment('ai.followup.blocked.provider')
          throw new FollowUpBlockedError(
            'provider_unconfigured',
            'Gemini não configurado (API key ausente).'
          )
        }
      } else if (input.config.provider === 'openai') {
        if (!this.openAiClient.isConfigured()) {
          this.metrics?.increment('ai.followup.blocked.provider')
          throw new FollowUpBlockedError(
            'provider_unconfigured',
            'OpenAI não configurada (API key ausente).'
          )
        }
      } else {
        this.metrics?.increment('ai.followup.blocked.provider')
        throw new FollowUpBlockedError('provider_unconfigured', 'Provider de IA não suportado.')
      }
    }

    if (input.requireCredits && this.creditsService) {
      const canUse = await this.creditsService.canUse(input.sessionId)
      if (!canUse) {
        this.metrics?.increment('ai.followup.blocked.credits')
        throw new FollowUpBlockedError('no_credits', 'Créditos insuficientes para usar a IA.')
      }
    }
  }

  private async resolveIsClient(sessionId: string, chatId: string, whatsapp: string | null): Promise<boolean> {
    if (isGroupChat(chatId) || isBroadcastChat(chatId)) {
      return false
    }

    if (this.clientStore) {
      try {
        const client = await this.clientStore.findByChatOrWhatsapp(sessionId, chatId, whatsapp)
        if (client) {
          return true
        }
      } catch (error) {
        this.logger.warn?.('Follow-up client lookup failed', {
          sessionId,
          chatId,
          error: (error as Error).message
        })
      }
    }

    if (this.leadStore) {
      try {
        const lead = await this.leadStore.findByChatOrWhatsapp(sessionId, chatId, whatsapp)
        if (lead?.status === 'cliente') {
          return true
        }
      } catch (error) {
        this.logger.warn?.('Follow-up lead lookup failed', {
          sessionId,
          chatId,
          error: (error as Error).message
        })
      }
    }

    return false
  }

  private async resolveLeadTag(
    sessionId: string,
    chatId: string,
    whatsapp: string | null
  ): Promise<'P. Ativa' | 'P. Passiva' | null> {
    if (!this.leadStore || isGroupChat(chatId) || isBroadcastChat(chatId)) {
      return null
    }

    try {
      const lead = await this.leadStore.findByChatOrWhatsapp(sessionId, chatId, whatsapp)
      return normalizePromptLeadTag(lead?.aiTag)
    } catch (error) {
      this.logger.warn?.('AI lead tag lookup failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
      return null
    }
  }

  private async shouldBlockByRecentHumanActivity(
    sessionId: string,
    chatId: string,
    config: AiConfig
  ): Promise<boolean> {
    const guard = resolveRecentHumanActivityGuard(config.training)
    if (!guard.enabled) {
      return false
    }

    try {
      const historyLimit = Math.max(
        config.contextMaxMessages,
        guard.useMessages ? guard.messages : 0,
        RECENT_HUMAN_ACTIVITY_HISTORY_MIN_LIMIT
      )
      const history = await this.listChatHistory(sessionId, chatId, historyLimit)
      if (history.length === 0) {
        return false
      }

      const sortedHistory = [...history].sort((a, b) => a.timestampMs - b.timestampMs)
      if (guard.useMessages) {
        const lastMessages = sortedHistory.slice(-guard.messages)
        if (lastMessages.some((entry) => isHumanSentMessage(entry))) {
          return true
        }
      }

      if (!guard.useDays) {
        return false
      }

      const nowMs = Date.now()
      const timeWindowStartMs = nowMs - guard.days * 24 * 60 * 60 * 1000
      return sortedHistory.some((entry) => {
        if (!isHumanSentMessage(entry)) {
          return false
        }
        return entry.timestampMs >= timeWindowStartMs
      })
    } catch (error) {
      this.logger.warn?.('AI recent human activity guard history failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
      return false
    }
  }

  private async disableChatByRecentHumanActivity(sessionId: string, chatId: string): Promise<void> {
    if (!this.chatConfigStore) {
      return
    }

    try {
      await this.chatConfigStore.disable(sessionId, chatId, 'recent_human_activity')
    } catch (error) {
      this.logger.warn?.('AI recent human activity guard disable failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
    }
  }

  private async shouldBlockByDeliveryGuard(
    sessionId: string,
    chatId: string,
    config: AiConfig
  ): Promise<boolean> {
    if (!isDeliveryGuardEnabled(config.training)) {
      return false
    }

    try {
      const historyLimit = Math.max(config.contextMaxMessages, DELIVERY_GUARD_HISTORY_MIN_LIMIT)
      const history = await this.listChatHistory(sessionId, chatId, historyLimit)
      const latestOutbound = history.filter((entry) => entry.fromMe).slice(-DELIVERY_GUARD_REQUIRED_OUTBOUND)
      if (latestOutbound.length < DELIVERY_GUARD_REQUIRED_OUTBOUND) {
        return false
      }

      const nowMs = Date.now()
      return latestOutbound.every((entry) => isDeliveryGuardUndelivered(entry, nowMs))
    } catch (error) {
      this.logger.warn?.('AI delivery guard history failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
      return false
    }
  }

  private async disableChatByDeliveryGuard(sessionId: string, chatId: string): Promise<void> {
    if (!this.chatConfigStore) {
      return
    }

    try {
      await this.chatConfigStore.disable(sessionId, chatId, 'delivery_guard')
    } catch (error) {
      this.logger.warn?.('AI delivery guard disable failed', {
        sessionId,
        chatId,
        error: (error as Error).message
      })
    }
  }

  private async listChatHistory(sessionId: string, chatId: string, limit: number): Promise<ChatMessage[]> {
    if (this.chatService) {
      return this.chatService.listMessages(sessionId, chatId, { limit })
    }

    const recent = await this.inboundStore.listRecentByChat(sessionId, chatId, limit)
    return recent.map((entry) => ({
      id: entry.messageId ?? `inbound:${entry.id}`,
      chatId: entry.chatId,
      text: entry.text ?? null,
      type: entry.messageType,
      timestampMs: entry.messageTimestampMs,
      fromMe: entry.fromMe,
      messageId: entry.messageId ?? null,
      origin: entry.fromMe ? 'human_external' : 'inbound'
    }))
  }

  private async updatePresentationCounterForChat(
    sessionId: string,
    chatId: string,
    config: AiConfig,
    shouldIntroduce: boolean
  ) {
    if (!this.presentationStore) {
      return
    }

    const shouldTrack = config.training?.seApresentarComoIA !== false
    if (!shouldTrack) {
      return
    }

    if (shouldIntroduce) {
      await this.presentationStore.reset(sessionId, chatId)
      await this.presentationStore.increment(sessionId, chatId)
      return
    }

    await this.presentationStore.increment(sessionId, chatId)
  }

  private async resolveConfig(sessionId: string): Promise<AiConfig> {
    const override = await this.configStore.get(sessionId)
    return mergeAiConfig(this.defaultConfig, override)
  }

  private async appendContext(inbound: InboundMessageRow, role: 'user' | 'assistant') {
    const text = inbound.text?.trim()
    if (!text) {
      return
    }
    await this.contextCache.appendMessage(inbound.sessionId, inbound.chatId, {
      role,
      text,
      timestampMs: inbound.messageTimestampMs,
      messageId: inbound.messageId ?? `inbound:${inbound.id}`,
      fromMe: role === 'assistant',
      origin: role === 'assistant' ? 'human_external' : 'inbound'
    })
  }

  private async maybeAutoConvertLead(input: {
    inbound: InboundMessageRow
    config: AiConfig
    context: AiContextMessage[]
    existingClient: ClientRecord | null
    whatsapp: string | null
  }): Promise<{ converted: boolean; action: 'none' | 'skip' | 'fallback' }> {
    if (input.existingClient) {
      return { converted: false, action: 'none' }
    }
    if (!input.config.training?.autoClassificarLeadComoCliente) {
      return { converted: false, action: 'none' }
    }
    if (!this.leadStore || !this.clientStore || !input.whatsapp) {
      return { converted: false, action: 'none' }
    }
    let lead
    try {
      lead = await this.leadStore.findByChatOrWhatsapp(
        input.inbound.sessionId,
        input.inbound.chatId,
        input.whatsapp
      )
    } catch (error) {
      this.logger.warn?.('Lead lookup failed for auto-classify', {
        sessionId: input.inbound.sessionId,
        chatId: input.inbound.chatId,
        error: (error as Error).message
      })
      return { converted: false, action: 'none' }
    }

    if (!lead || lead.status === 'cliente') {
      return { converted: false, action: 'none' }
    }

    if (this.shouldSkipClientClassification(input.inbound.sessionId, input.inbound.chatId)) {
      return { converted: false, action: 'none' }
    }

    this.metrics?.increment('ai.classify.requested')
    const classification = await this.classifyClient(input.config, input.context, input.inbound)
    if (!classification) {
      return { converted: false, action: 'none' }
    }
    this.metrics?.increment('ai.classify.success')

    if (!classification.isClient || classification.confidence < this.clientClassifyThreshold) {
      return { converted: false, action: 'none' }
    }

    try {
      const result = await convertLeadToClient(input.inbound.sessionId, lead.id, {
        leadStore: this.leadStore,
        clientStore: this.clientStore,
        conversionStore: this.leadConversionStore,
        conversionSource: 'ai_auto',
        logger: this.logger
      })
      if (!result) {
        return { converted: false, action: 'none' }
      }

      this.metrics?.increment('leads.auto_converted')
      if (input.config.training?.responderClientes !== true) {
        return {
          converted: true,
          action: resolveComportamentoNaoSabe(input.config.training) === 'silencio' ? 'skip' : 'fallback'
        }
      }

      return { converted: true, action: 'none' }
    } catch (error) {
      this.metrics?.increment('leads.auto_convert_failed')
      this.logger.warn?.('Auto-convert lead failed', {
        sessionId: input.inbound.sessionId,
        chatId: input.inbound.chatId,
        error: (error as Error).message
      })
      return { converted: false, action: 'none' }
    }
  }

  private async maybeSuggestFieldUpdates(input: {
    sessionId: string
    chatId: string
    inboundId?: number | null
    config: AiConfig
    context: AiContextMessage[]
    replyText: string
  }): Promise<void> {
    if (input.config.training?.permitirSugestoesCamposLeadsClientes !== true) {
      return
    }
    if (!this.suggestionStore) {
      return
    }
    if (!this.clientStore && !this.leadStore) {
      return
    }

    const chatId = input.chatId
    if (isGroupChat(chatId) || isBroadcastChat(chatId)) {
      return
    }

    const sessionId = input.sessionId
    const whatsapp = extractWhatsappFromJid(chatId)
    const resolved = await this.resolveSuggestionTarget(sessionId, chatId, whatsapp)
    if (!resolved) {
      this.metrics?.increment('ai.suggestions.missing_target')
      return
    }

    const language = resolveTrainingLanguage(input.config.training)
    const timezone = input.config.businessHours?.timezone || 'America/Sao_Paulo'
    const nowIso = new Date().toISOString()
    const trimmedContext = input.context.slice(-FIELD_SUGGEST_MAX_MESSAGES).map((entry) => {
      const contextMeta = resolveContextMeta(entry)
      return {
        role: entry.role,
        text: truncateText(entry.text, FIELD_SUGGEST_MAX_TEXT),
        fromMe: contextMeta.fromMe,
        origin: contextMeta.origin,
        actor: contextMeta.actor,
        channel: contextMeta.channel
      }
    })
    const trainingContext = buildFieldSuggestionTrainingContext(input.config.training)

    const requestPayload = {
      now: nowIso,
      timezone,
      targetType: resolved.targetType,
      allowedStatus: resolved.allowedStatus,
      base: resolved.base,
      recentMessages: trimmedContext,
      assistantReply: truncateText(input.replyText, FIELD_SUGGEST_MAX_TEXT),
      ...(trainingContext ? { trainingContext } : {})
    }

    const messages: OpenAiMessage[] = [
      { role: 'system', content: resolveFieldSuggestSystemPrompt(input.config.training) },
      {
        role: 'user',
        content: `${language === 'en' ? FIELD_SUGGEST_REQUEST_PROMPT_EN : FIELD_SUGGEST_REQUEST_PROMPT_PT}\n\n${JSON.stringify(requestPayload, null, 2)}`
      }
    ]

    let reply = ''
    let usage: AiTokenUsage | undefined
    try {
      if (input.config.provider === 'google') {
        const result = await this.geminiClient!.createChatCompletion({
          model: input.config.model,
          temperature: 0,
          messages
        })
        reply = result.content
        usage = result.usage
      } else {
        const result = await this.openAiClient.createChatCompletion({
          model: input.config.model,
          temperature: 0,
          messages
        })
        reply = result.content
        usage = result.usage
      }
    } catch (error) {
      this.logger.warn?.('AI field suggestion generation failed', {
        sessionId,
        chatId,
        inboundId: input.inboundId ?? null,
        provider: input.config.provider,
        error: (error as Error).message
      })
      this.metrics?.increment('ai.suggestions.generation_failed')
      return
    }

    if (usage) {
      await this.recordUsage({
        sessionId,
        chatId,
        inboundId: input.inboundId ?? null,
        provider: input.config.provider,
        model: input.config.model,
        operation: 'suggest',
        usage
      })
    } else {
      this.metrics?.increment('ai.usage.missing')
    }

    const parsed = parseFieldSuggestion(reply)
    if (!parsed) {
      this.metrics?.increment('ai.suggestions.parse_failed')
      return
    }

    const normalizedPatch = normalizeFieldSuggestionPatch(parsed.patch, resolved.targetType)
    const patch = stripUnchangedSuggestionPatch(normalizedPatch, resolved.base)
    if (!patch) {
      this.metrics?.increment('ai.suggestions.empty')
      return
    }

    let persistedSuggestion: { id: number } | null = null
    try {
      persistedSuggestion = await this.suggestionStore.upsertPending({
        sessionId,
        chatId,
        targetType: resolved.targetType,
        targetId: resolved.targetId,
        inboundId: input.inboundId ?? null,
        provider: input.config.provider,
        model: input.config.model,
        base: resolved.base,
        patch,
        reason: parsed.reason
      })
      this.metrics?.increment('ai.suggestions.generated')
    } catch (error) {
      this.logger.warn?.('AI field suggestion persist failed', {
        sessionId,
        chatId,
        inboundId: input.inboundId ?? null,
        error: (error as Error).message
      })
      this.metrics?.increment('ai.suggestions.persist_failed')
      return
    }

    if (input.config.training?.aprovarAutomaticamenteSugestoesLeadsClientes !== true) {
      return
    }

    const suggestionId =
      typeof persistedSuggestion.id === 'number'
        ? persistedSuggestion.id
        : Number((persistedSuggestion as { id?: unknown }).id)
    if (!Number.isFinite(suggestionId) || suggestionId <= 0) {
      this.logger.warn?.('AI field suggestion auto-approve skipped: invalid suggestion id', {
        sessionId,
        chatId,
        suggestionId: persistedSuggestion.id
      })
      this.metrics?.increment('ai.suggestions.auto_approve_failed')
      return
    }

    const statusUpdate =
      patch.status !== undefined
        ? { status: patch.status as any }
        : {}
    const observationsUpdate =
      patch.observations !== undefined
        ? { observations: patch.observations }
        : {}

    try {
      if (resolved.targetType === 'lead') {
        if (!this.leadStore) {
          this.logger.warn?.('AI field suggestion auto-approve skipped: lead store missing', {
            sessionId,
            chatId,
            suggestionId
          })
          this.metrics?.increment('ai.suggestions.auto_approve_failed')
          return
        }

        const updated = await this.leadStore.update(sessionId, resolved.targetId, {
          ...statusUpdate,
          ...(patch.nextContactAt !== undefined ? { nextContact: patch.nextContactAt } : {}),
          ...observationsUpdate
        })
        if (!updated) {
          this.logger.warn?.('AI field suggestion auto-approve target not found', {
            sessionId,
            chatId,
            targetType: resolved.targetType,
            targetId: resolved.targetId,
            suggestionId
          })
          this.metrics?.increment('ai.suggestions.auto_approve_failed')
          return
        }
      } else {
        if (!this.clientStore) {
          this.logger.warn?.('AI field suggestion auto-approve skipped: client store missing', {
            sessionId,
            chatId,
            suggestionId
          })
          this.metrics?.increment('ai.suggestions.auto_approve_failed')
          return
        }

        const updated = await this.clientStore.update(sessionId, resolved.targetId, {
          ...statusUpdate,
          ...(patch.nextContactAt !== undefined ? { nextContactAt: patch.nextContactAt } : {}),
          ...observationsUpdate
        })
        if (!updated) {
          this.logger.warn?.('AI field suggestion auto-approve target not found', {
            sessionId,
            chatId,
            targetType: resolved.targetType,
            targetId: resolved.targetId,
            suggestionId
          })
          this.metrics?.increment('ai.suggestions.auto_approve_failed')
          return
        }
      }
    } catch (error) {
      this.logger.warn?.('AI field suggestion auto-approve apply failed', {
        sessionId,
        chatId,
        targetType: resolved.targetType,
        targetId: resolved.targetId,
        suggestionId,
        error: (error as Error).message
      })
      this.metrics?.increment('ai.suggestions.auto_approve_failed')
      return
    }

    try {
      const accepted = await this.suggestionStore.markAccepted(sessionId, suggestionId, patch, {
        source: 'automatic',
        actorRole: 'system',
        actorUid: null
      })
      if (!accepted) {
        this.logger.warn?.('AI field suggestion auto-approve mark accepted conflict', {
          sessionId,
          chatId,
          targetType: resolved.targetType,
          targetId: resolved.targetId,
          suggestionId
        })
        this.metrics?.increment('ai.suggestions.auto_approve_mark_accepted_conflict')
        return
      }
      this.metrics?.increment('ai.suggestions.auto_approved')
    } catch (error) {
      this.logger.warn?.('AI field suggestion auto-approve mark accepted failed', {
        sessionId,
        chatId,
        targetType: resolved.targetType,
        targetId: resolved.targetId,
        suggestionId,
        error: (error as Error).message
      })
      this.metrics?.increment('ai.suggestions.auto_approve_mark_accepted_conflict')
    }
  }

  private async resolveSuggestionTarget(
    sessionId: string,
    chatId: string,
    whatsapp: string | null
  ): Promise<{
    targetType: AiFieldSuggestionTargetType
    targetId: string
    base: AiFieldSuggestionBase
    allowedStatus: string[]
  } | null> {
    if (this.clientStore) {
      try {
        const client = await this.clientStore.findByChatOrWhatsapp(sessionId, chatId, whatsapp)
        if (client) {
          return {
            targetType: 'client',
            targetId: client.id,
            base: {
              name: client.name ?? null,
              whatsapp: client.whatsapp ?? null,
              status: client.status,
              observations: client.observations ?? null,
              nextContactAt: client.nextContactAt ?? null,
              updatedAt: client.updatedAt ?? null
            },
            allowedStatus: ['ativo', 'inativo', 'vip']
          }
        }
      } catch (error) {
        this.logger.warn?.('AI suggestion client lookup failed', {
          sessionId,
          chatId,
          error: (error as Error).message
        })
      }
    }

    if (this.leadStore) {
      try {
        const lead = await this.leadStore.findByChatOrWhatsapp(sessionId, chatId, whatsapp)
        if (lead) {
          return {
            targetType: 'lead',
            targetId: lead.id,
            base: {
              name: lead.name ?? null,
              whatsapp: lead.whatsapp ?? null,
              status: lead.status,
              observations: lead.observations ?? null,
              nextContactAt: lead.nextContact ?? null,
              updatedAt: lead.updatedAt ?? null
            },
            allowedStatus: ['novo', 'inativo', 'aguardando', 'em_processo']
          }
        }
      } catch (error) {
        this.logger.warn?.('AI suggestion lead lookup failed', {
          sessionId,
          chatId,
          error: (error as Error).message
        })
      }
    }

    return null
  }

  private async buildFindmyangelMeta(sessionId: string, chatId: string): Promise<Record<string, unknown> | null> {
    const provider = this.findmyangelContextProvider
    if (!provider || !provider.isEnabledForSession(sessionId)) {
      return null
    }

    const whatsappDigits = extractWhatsappFromJid(chatId)
    if (!whatsappDigits) {
      return null
    }

    let userId: string | null = null

    if (this.clientStore) {
      try {
        const client = await this.clientStore.findByChatOrWhatsapp(sessionId, chatId, whatsappDigits)
        userId = extractFindmyangelUidFromCrm(client)
      } catch (error) {
        this.logger.warn?.('FindmyAngel CRM client lookup failed', {
          sessionId,
          chatId,
          error: (error as Error).message
        })
      }
    }

    if (!userId && this.leadStore) {
      try {
        const lead = await this.leadStore.findByChatOrWhatsapp(sessionId, chatId, whatsappDigits)
        userId = extractFindmyangelUidFromCrm(lead)
      } catch (error) {
        this.logger.warn?.('FindmyAngel CRM lead lookup failed', {
          sessionId,
          chatId,
          error: (error as Error).message
        })
      }
    }

    const payload = await provider.getForChat({
      sessionId,
      chatId,
      userId,
      whatsappDigits
    })
    if (!payload) {
      return null
    }

    const safe = provider.truncateForPrompt(payload)
    return { findmyangel: safe }
  }

  private async sendReply(
    inbound: InboundMessageRow,
    reply: string,
    idempotencyPrefix: string
  ): Promise<number | undefined> {
    const sanitizedReply = sanitizeAssistantReplyOutput(reply)
    const parts = splitReply(sanitizedReply)
    let firstOutboundId: number | undefined

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const outbound = await this.outboundService.enqueue({
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        text: part,
        idempotencyKey: `${idempotencyPrefix}:${index}`,
        origin: 'ai'
      })

      if (!firstOutboundId) {
        firstOutboundId = outbound.id
      }

      await this.contextCache.appendMessage(inbound.sessionId, inbound.chatId, {
        role: 'assistant',
        text: part,
        timestampMs: Date.now() + index,
        messageId: `outbound:${outbound.id}`,
        fromMe: true,
        origin: 'ai'
      })
    }

    return firstOutboundId
  }

  private async classifyClient(config: AiConfig, context: AiContextMessage[], inbound: InboundMessageRow) {
    const language = resolveTrainingLanguage(config.training)
    const timezone = config.businessHours?.timezone || 'America/Sao_Paulo'
    const messages = buildClientClassificationMessages(context, { timezone, language })
    if (messages.length === 0) {
      return null
    }

    try {
      if (config.provider === 'google') {
        const result = await this.geminiClient!.createChatCompletion({
          model: config.model,
          temperature: 0,
          messages
        })
        if (result.usage) {
          await this.recordUsage({
            sessionId: inbound.sessionId,
            chatId: inbound.chatId,
            inboundId: inbound.id,
            provider: config.provider,
            model: config.model,
            operation: 'classify',
            usage: result.usage
          })
        } else {
          this.metrics?.increment('ai.usage.missing')
        }
        return parseClientClassification(result.content)
      }

      const result = await this.openAiClient.createChatCompletion({
        model: config.model,
        temperature: 0,
        messages
      })
      if (result.usage) {
        await this.recordUsage({
          sessionId: inbound.sessionId,
          chatId: inbound.chatId,
          inboundId: inbound.id,
          provider: config.provider,
          model: config.model,
          operation: 'classify',
          usage: result.usage
        })
      } else {
        this.metrics?.increment('ai.usage.missing')
      }
      return parseClientClassification(result.content)
    } catch (error) {
      this.logger.warn?.('Client classification failed', {
        error: (error as Error).message
      })
      return null
    }
  }

  private shouldSkipClientClassification(sessionId: string, chatId: string) {
    if (this.clientClassifyCooldownSec <= 0) {
      return false
    }

    const now = Date.now()
    const key = `${sessionId}:${chatId}`
    const lastAttempt = this.clientClassifyCache.get(key)
    if (lastAttempt && now - lastAttempt < this.clientClassifyCooldownSec * 1000) {
      return true
    }

    this.clientClassifyCache.set(key, now)
    return false
  }

  private async buildContext(
    inbound: InboundMessageRow,
    config: AiConfig,
    language: AiLanguage
  ): Promise<AiContextMessage[]> {
    const limit = Math.max(1, config.contextMaxMessages)
    let context: AiContextMessage[] = []

    if (this.chatService) {
      const history = await this.chatService.listMessages(inbound.sessionId, inbound.chatId, { limit })
      context = history.map((entry) =>
        mapChatMessageToAiContext(entry, language, entry.messageId ?? `history:${entry.id}`)
      )
    } else {
      const recent = await this.inboundStore.listRecentByChat(inbound.sessionId, inbound.chatId, limit)
      context = recent.map((entry) => ({
        role: entry.fromMe ? 'assistant' : 'user',
        text: entry.text ?? '',
        timestampMs: entry.messageTimestampMs,
        messageId: entry.messageId ?? `inbound:${entry.id}`,
        fromMe: entry.fromMe,
        origin: entry.fromMe ? 'human_external' : 'inbound'
      }))
    }

    const inboundKey = inbound.messageId ?? `inbound:${inbound.id}`
    const hasInbound = context.some((entry) => entry.messageId === inboundKey)
    if (!hasInbound) {
      const text = inbound.text?.trim()
      if (text) {
        context.push({
          role: 'user',
          text,
          timestampMs: inbound.messageTimestampMs,
          messageId: inboundKey,
          fromMe: false,
          origin: 'inbound'
        })
      }
    }

    return context.slice(-limit)
  }

  private async isLatestUserInbound(inbound: InboundMessageRow): Promise<boolean> {
    try {
      if (inbound.messageType === 'audioMessage') {
        const latestAudio = await this.inboundStore.getLatestUserAudioByChat(inbound.sessionId, inbound.chatId)
        if (latestAudio && latestAudio.id !== inbound.id) {
          return false
        }
      }

      const latest = await this.inboundStore.getLatestUserTextByChat(inbound.sessionId, inbound.chatId)
      if (!latest) {
        return true
      }
      return latest.id === inbound.id
    } catch (error) {
      this.logger.warn?.('AI latest inbound check failed', {
        sessionId: inbound.sessionId,
        chatId: inbound.chatId,
        inboundId: inbound.id,
        error: (error as Error).message
      })
      return true
    }
  }

  private async updatePresentationCounter(inbound: InboundMessageRow, config: AiConfig, shouldIntroduce: boolean) {
    if (!this.presentationStore) {
      return
    }

    const shouldTrack = config.training?.seApresentarComoIA !== false
    if (!shouldTrack) {
      return
    }

    if (shouldIntroduce) {
      await this.presentationStore.reset(inbound.sessionId, inbound.chatId)
      await this.presentationStore.increment(inbound.sessionId, inbound.chatId)
      return
    }

    await this.presentationStore.increment(inbound.sessionId, inbound.chatId)
  }

  private async generatePersonalizedHandoffReply(input: {
    inbound: InboundMessageRow
    config: AiConfig
    context: AiContextMessage[]
    timezone: string
    language: AiLanguage
  }): Promise<string | null> {
    if (input.config.training?.permitirIATextoPersonalizadoAoEncaminharHumano !== true) {
      return null
    }

    const systemPrompt = buildPersonalizedHandoffSystemPrompt(input.config.training, input.language)
    const context = input.context.slice(-PERSONALIZED_HANDOFF_CONTEXT_LIMIT)
    const messages = buildOpenAiMessages(systemPrompt, context, {
      timezone: input.timezone,
      language: input.language
    })

    const promptEntry: AiPromptEntry = {
      timestamp: new Date().toISOString(),
      sessionId: input.inbound.sessionId,
      chatId: input.inbound.chatId,
      model: input.config.model,
      systemPrompt,
      messages
    }
    this.promptStore?.add(promptEntry)
    if (this.systemSettings?.getDebugAiPrompt()) {
      this.logPrompt(promptEntry)
    }

    let reply = ''
    let usage: AiTokenUsage | undefined
    try {
      if (input.config.provider === 'google') {
        const result = await this.geminiClient!.createChatCompletion({
          model: input.config.model,
          temperature: PERSONALIZED_HANDOFF_TEMPERATURE,
          messages
        })
        reply = result.content
        usage = result.usage
      } else {
        const result = await this.openAiClient.createChatCompletion({
          model: input.config.model,
          temperature: PERSONALIZED_HANDOFF_TEMPERATURE,
          messages
        })
        reply = result.content
        usage = result.usage
      }
    } catch (error) {
      this.logger.warn?.('AI personalized handoff generation failed', {
        sessionId: input.inbound.sessionId,
        chatId: input.inbound.chatId,
        inboundId: input.inbound.id,
        provider: input.config.provider,
        error: (error as Error).message
      })
      this.metrics?.increment('ai.handoff.personalized.failed')
      return null
    }

    if (usage) {
      await this.recordUsage({
        sessionId: input.inbound.sessionId,
        chatId: input.inbound.chatId,
        inboundId: input.inbound.id,
        provider: input.config.provider,
        model: input.config.model,
        operation: 'handoff',
        usage,
        referenceId: `handoff:${input.inbound.id}`
      })
    } else {
      this.metrics?.increment('ai.usage.missing')
    }

    if (this.systemSettings?.getDebugAiResponse()) {
      this.logResponse({
        sessionId: input.inbound.sessionId,
        chatId: input.inbound.chatId,
        model: input.config.model,
        provider: input.config.provider,
        timestamp: new Date().toISOString(),
        inboundId: input.inbound.id,
        reply
      })
    }

    const validated = validatePersonalizedHandoffReply(reply)
    if (!validated) {
      this.metrics?.increment('ai.handoff.personalized.fallback')
      return null
    }

    this.metrics?.increment('ai.handoff.personalized.used')
    return validated
  }

  private async recordUsage(params: {
    sessionId: string
    chatId: string
    inboundId?: number | null
    provider: string
    model: string
    operation: AiUsageOperation
    usage: AiTokenUsage
    referenceId?: string | null
  }) {
    if (!this.usageStore) {
      return
    }

    const promptTokens = Math.max(0, Math.round(params.usage.promptTokens))
    const completionTokens = Math.max(0, Math.round(params.usage.completionTokens))
    const totalTokens = Math.max(
      0,
      Math.round(
        Number.isFinite(params.usage.totalTokens)
          ? params.usage.totalTokens
          : promptTokens + completionTokens
      )
    )

    const pricing: AiPricing = this.systemSettings?.getAiPricing?.() ?? { models: {} }
    const usdBrlRate = this.systemSettings?.getUsdBrlRate?.() ?? 0
    const cost = calculateUsageCost(
      { promptTokens, completionTokens, totalTokens },
      params.model,
      pricing,
      usdBrlRate
    )

    if (cost.pricingMissing) {
      this.metrics?.increment('ai.usage.pricing_missing')
    }

    try {
      await this.usageStore.record({
        sessionId: params.sessionId,
        chatId: params.chatId,
        inboundId: params.inboundId ?? null,
        provider: params.provider,
        model: params.model,
        operation: params.operation,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: cost.costUsd,
        usdBrlRate,
        costBrl: cost.costBrl,
        pricingMissing: cost.pricingMissing
      })
    } catch (error) {
      this.logger.warn?.('AI usage record failed', {
        sessionId: params.sessionId,
        chatId: params.chatId,
        error: (error as Error).message
      })
    }

    if (this.creditsService) {
      try {
        if (cost.costBrl > 0) {
          const referenceId =
            params.referenceId ?? (params.inboundId !== undefined && params.inboundId !== null ? String(params.inboundId) : null)
          await this.creditsService.consume(params.sessionId, cost.costBrl, {
            referenceId
          })
          this.metrics?.increment('ai.credits.debited')
        }
      } catch (error) {
        this.logger.warn?.('AI credits debit failed', {
          sessionId: params.sessionId,
          chatId: params.chatId,
          error: (error as Error).message
        })
        this.metrics?.increment('ai.credits.debit_failed')
      }
    }
  }

  private buildUsageSummary(model: string, usage: AiTokenUsage | undefined) {
    const promptTokens = Math.max(0, Math.round(usage?.promptTokens ?? 0))
    const completionTokens = Math.max(0, Math.round(usage?.completionTokens ?? 0))
    const totalTokens = Math.max(
      0,
      Math.round(
        Number.isFinite(usage?.totalTokens)
          ? Number(usage?.totalTokens)
          : promptTokens + completionTokens
      )
    )
    const pricing: AiPricing = this.systemSettings?.getAiPricing?.() ?? { models: {} }
    const usdBrlRate = this.systemSettings?.getUsdBrlRate?.() ?? 0
    const cost = calculateUsageCost({ promptTokens, completionTokens, totalTokens }, model, pricing, usdBrlRate)

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd: cost.costUsd,
      costBrl: cost.costBrl,
      pricingMissing: cost.pricingMissing
    }
  }

  private logPrompt(entry: AiPromptEntry) {
    this.logger.info?.('ai.prompt', {
      sessionId: entry.sessionId,
      chatId: entry.chatId,
      model: entry.model,
      timestamp: entry.timestamp,
      messages: entry.messages
    })
  }

  private logResponse(entry: {
    sessionId: string
    chatId: string
    model: string
    provider: string
    timestamp: string
    inboundId: number
    reply: string
  }) {
    this.logger.info?.('ai.response', {
      sessionId: entry.sessionId,
      chatId: entry.chatId,
      model: entry.model,
      provider: entry.provider,
      inboundId: entry.inboundId,
      timestamp: entry.timestamp,
      reply: entry.reply
    })
  }
}

function buildFollowUpMeta(
  history: ChatMessage[],
  now: Date,
  timezone: string,
  language: AiLanguage
): Record<string, unknown> {
  const lastMessage = history.length > 0 ? history[history.length - 1] : null
  const lastUserMessage = [...history].reverse().find((entry) => !entry.fromMe) ?? null
  const lastAssistantMessage = [...history].reverse().find((entry) => entry.fromMe) ?? null

  return {
    timezone,
    now: toDateMeta(now, timezone, language),
    lastMessage: lastMessage ? toMessageMeta(lastMessage, timezone, language) : null,
    lastUserMessage: lastUserMessage ? toMessageMeta(lastUserMessage, timezone, language) : null,
    lastAssistantMessage: lastAssistantMessage ? toMessageMeta(lastAssistantMessage, timezone, language) : null
  }
}

function mergeFollowUpMeta(
  baseMeta: Record<string, unknown>,
  extraMeta?: Record<string, unknown>
): Record<string, unknown> {
  if (!extraMeta || Object.keys(extraMeta).length === 0) {
    return baseMeta
  }
  return {
    ...baseMeta,
    campaign: extraMeta
  }
}

function toMessageMeta(message: ChatMessage, timezone: string, language: AiLanguage) {
  const timestamp = new Date(message.timestampMs)
  return {
    fromMe: message.fromMe,
    type: message.type,
    timestampMs: message.timestampMs,
    iso: timestamp.toISOString(),
    local: formatLocal(timestamp, timezone, language),
    textPreview: truncatePreviewText(resolveContextMessageText(message, language), 140)
  }
}

function toDateMeta(date: Date, timezone: string, language: AiLanguage) {
  return {
    timestampMs: date.getTime(),
    iso: date.toISOString(),
    local: formatLocal(date, timezone, language)
  }
}

function formatLocal(date: Date, timezone: string, language: AiLanguage) {
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

function truncatePreviewText(value: string, max: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.length <= max) {
    return trimmed
  }
  return `${trimmed.slice(0, Math.max(0, max - 3))}...`
}

function mapChatMessageToAiContext(
  message: ChatMessage,
  language: AiLanguage,
  fallbackMessageId: string | null
): AiContextMessage {
  const fromMe = message.fromMe === true
  return {
    role: fromMe ? 'assistant' : 'user',
    text: resolveContextMessageText(message, language),
    timestampMs: message.timestampMs,
    messageId: message.messageId ?? fallbackMessageId,
    status: message.status ?? null,
    fromMe,
    origin: normalizeContextOrigin(message.origin, fromMe)
  }
}

function resolveContextMessageText(message: ChatMessage, language: AiLanguage = 'pt-BR'): string {
  const text = message.text?.trim()
  if (text) {
    return text
  }

  if (message.media) {
    return buildMediaContextSummary(message, message.media, language)
  }

  return buildTypeOnlyContextSummary(message, language)
}

function buildMediaContextSummary(
  message: Pick<ChatMessage, 'fromMe' | 'origin'>,
  media: NonNullable<ChatMessage['media']>,
  language: AiLanguage
): string {
  const direction = message.fromMe
    ? language === 'en'
      ? 'sent'
      : 'enviada'
    : language === 'en'
      ? 'received'
      : 'recebida'
  const kind = normalizeMediaType(media.mediaType)
  const fileName = truncateOptionalField(media.fileName, CONTEXT_FILE_NAME_MAX)
  const mimeType = truncateOptionalField(media.mimeType, CONTEXT_FILE_MIME_MAX)

  if (message.fromMe && message.origin === 'ai' && media.aiFile) {
    const aiFile = media.aiFile
    const id = truncateOptionalField(aiFile.id, CONTEXT_FILE_ID_MAX)
    const nome = truncateOptionalField(aiFile.nome, CONTEXT_FILE_NAME_MAX)
    const mime = truncateOptionalField(aiFile.mimeType, CONTEXT_FILE_MIME_MAX)
    const descricao = truncateOptionalField(aiFile.descricao, CONTEXT_FILE_DESC_MAX)
    const quandoUsar = truncateOptionalField(aiFile.quandoUsar, CONTEXT_FILE_WHEN_MAX)

    const parts =
      language === 'en'
        ? [
            '[AI_FILE_SENT]',
            id ? `id=${id}` : null,
            nome ? `name=${nome}` : null,
            `type=${aiFile.tipo}`,
            mime ? `mime=${mime}` : null,
            aiFile.sizeBytes > 0 ? `sizeBytes=${Math.floor(aiFile.sizeBytes)}` : null,
            descricao ? `description=${descricao}` : null,
            quandoUsar ? `whenToUse=${quandoUsar}` : null
          ].filter((value): value is string => Boolean(value))
        : [
            '[ARQUIVO_IA_ENVIADO]',
            id ? `id=${id}` : null,
            nome ? `nome=${nome}` : null,
            `tipo=${aiFile.tipo}`,
            mime ? `mime=${mime}` : null,
            aiFile.sizeBytes > 0 ? `tamanhoBytes=${Math.floor(aiFile.sizeBytes)}` : null,
            descricao ? `descricao=${descricao}` : null,
            quandoUsar ? `quandoUsar=${quandoUsar}` : null
          ].filter((value): value is string => Boolean(value))

    return parts.join(' | ')
  }

  const parts = [
    `[${language === 'en' ? 'MEDIA' : 'MIDIA'}_${direction.toUpperCase()}]`,
    `${language === 'en' ? 'type' : 'tipo'}=${kind}`,
    fileName ? `${language === 'en' ? 'fileName' : 'nomeArquivo'}=${fileName}` : null,
    mimeType ? `mime=${mimeType}` : null
  ].filter((value): value is string => Boolean(value))

  return parts.join(' | ')
}

function buildTypeOnlyContextSummary(
  message: Pick<ChatMessage, 'fromMe' | 'type'>,
  language: AiLanguage
): string {
  const direction = message.fromMe
    ? language === 'en'
      ? 'SENT'
      : 'ENVIADA'
    : language === 'en'
      ? 'RECEIVED'
      : 'RECEBIDA'
  const mediaType = parseMessageMediaType(message.type)
  if (mediaType) {
    return `[${language === 'en' ? 'MEDIA' : 'MIDIA'}_${direction}] | ${language === 'en' ? 'type' : 'tipo'}=${mediaType}`
  }
  if (isContactMessageType(message.type)) {
    return language === 'en' ? `[CONTACT_${direction}]` : `[CONTATO_${direction}]`
  }
  return ''
}

function normalizeMediaType(value: string): 'image' | 'video' | 'audio' | 'document' {
  if (value === 'imageMessage') return 'image'
  if (value === 'videoMessage') return 'video'
  if (value === 'audioMessage') return 'audio'
  return 'document'
}

function parseMessageMediaType(value: string): 'image' | 'video' | 'audio' | 'document' | null {
  if (value === 'imageMessage') return 'image'
  if (value === 'videoMessage') return 'video'
  if (value === 'audioMessage') return 'audio'
  if (value === 'documentMessage') return 'document'
  return null
}

function isContactMessageType(value: string): boolean {
  return value === 'contactMessage' || value === 'contactsArrayMessage'
}

function truncateOptionalField(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return truncateText(trimmed, maxLength)
}

function buildOpenAiMessages(
  systemPrompt: string,
  context: AiContextMessage[],
  options: { timezone?: string; language?: AiLanguage } = {}
): OpenAiMessage[] {
  const timezone = options.timezone?.trim() || 'America/Sao_Paulo'
  const language = options.language ?? 'pt-BR'
  const messages: OpenAiMessage[] = []
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  for (const entry of context) {
    messages.push({
      role: entry.role,
      content: formatContextMessageForPrompt(entry, timezone, language)
    })
  }

  return messages
}

function formatContextMessageForPrompt(message: AiContextMessage, timezone: string, language: AiLanguage): string {
  const text = typeof message.text === 'string' ? message.text : ''
  const timestampMeta = buildContextTimestampMeta(message, timezone, language)
  if (!text) {
    return `[MSG_TIME] ${timestampMeta}`
  }
  return `[MSG_TIME] ${timestampMeta}\n${text}`
}

function buildContextTimestampMeta(message: AiContextMessage, timezone: string, language: AiLanguage): string {
  const contextMeta = resolveContextMeta(message)
  const timestampMs = message.timestampMs
  const date = typeof timestampMs === 'number' && Number.isFinite(timestampMs) ? new Date(timestampMs) : null
  const hasValidDate = Boolean(date && !Number.isNaN(date.getTime()))

  const parts: string[] = []
  if (hasValidDate && date) {
    parts.push(`timestampMs=${Math.floor(timestampMs)}`)
    parts.push(`iso=${date.toISOString()}`)
    parts.push(`local=${formatLocal(date, timezone, language)}`)
  }
  parts.push(`fromMe=${contextMeta.fromMe ? 'true' : 'false'}`)
  parts.push(`origin=${contextMeta.origin}`)
  parts.push(`actor=${contextMeta.actor}`)
  parts.push(`channel=${contextMeta.channel}`)
  const status = normalizeContextStatus(message.status)
  if (status) {
    parts.push(`status=${status}`)
  }
  return parts.join(' | ')
}

function resolveContextMeta(message: Pick<AiContextMessage, 'role' | 'fromMe' | 'origin'>): {
  fromMe: boolean
  origin: NonNullable<AiContextMessage['origin']>
  actor: 'ai' | 'human' | 'automation' | 'contact'
  channel:
    | 'autowhats_ai'
    | 'autowhats_dashboard'
    | 'autowhats_api'
    | 'whatsapp_external'
    | 'whatsapp_inbound'
    | 'legacy_manual'
} {
  const fromMe = resolveContextFromMe(message)
  const origin = normalizeContextOrigin(message.origin, fromMe)
  const { actor, channel } = resolveContextActorAndChannel(origin)
  return { fromMe, origin, actor, channel }
}

function resolveContextFromMe(message: Pick<AiContextMessage, 'role' | 'fromMe'>): boolean {
  if (typeof message.fromMe === 'boolean') {
    return message.fromMe
  }
  return message.role === 'assistant'
}

function normalizeContextOrigin(
  value: AiContextMessage['origin'],
  fromMe: boolean
): NonNullable<AiContextMessage['origin']> {
  if (
    value === 'ai' ||
    value === 'human_dashboard' ||
    value === 'automation_api' ||
    value === 'human_external' ||
    value === 'inbound' ||
    value === 'legacy_manual'
  ) {
    return value
  }
  return fromMe ? 'legacy_manual' : 'inbound'
}

function resolveContextActorAndChannel(origin: NonNullable<AiContextMessage['origin']>) {
  if (origin === 'ai') {
    return { actor: 'ai' as const, channel: 'autowhats_ai' as const }
  }
  if (origin === 'human_dashboard') {
    return { actor: 'human' as const, channel: 'autowhats_dashboard' as const }
  }
  if (origin === 'automation_api') {
    return { actor: 'automation' as const, channel: 'autowhats_api' as const }
  }
  if (origin === 'human_external') {
    return { actor: 'human' as const, channel: 'whatsapp_external' as const }
  }
  if (origin === 'inbound') {
    return { actor: 'contact' as const, channel: 'whatsapp_inbound' as const }
  }
  return { actor: 'human' as const, channel: 'legacy_manual' as const }
}

function normalizeContextStatus(value: AiContextMessage['status']): NonNullable<AiContextMessage['status']> | null {
  if (
    value === 'queued' ||
    value === 'sending' ||
    value === 'sent' ||
    value === 'delivered' ||
    value === 'read' ||
    value === 'retrying' ||
    value === 'failed'
  ) {
    return value
  }
  return null
}

function resolveRecentHumanActivityGuard(training?: AiTrainingData): {
  enabled: boolean
  useDays: boolean
  days: number
  useMessages: boolean
  messages: number
} {
  const useDays = training?.desligarIASeHumanoRecenteUsarDias !== false
  const useMessages = training?.desligarIASeHumanoRecenteUsarMensagens !== false
  return {
    enabled: training?.desligarIASeHumanoRecente === true && (useDays || useMessages),
    useDays,
    days: normalizeRecentHumanActivityDays(training?.desligarIASeHumanoRecenteDias),
    useMessages,
    messages: normalizeRecentHumanActivityMessages(training?.desligarIASeHumanoRecenteMensagens)
  }
}

function normalizeRecentHumanActivityDays(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return RECENT_HUMAN_ACTIVITY_DAYS_DEFAULT
  }
  return clampInt(num, RECENT_HUMAN_ACTIVITY_DAYS_MIN, RECENT_HUMAN_ACTIVITY_DAYS_MAX)
}

function normalizeRecentHumanActivityMessages(value: unknown): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return RECENT_HUMAN_ACTIVITY_MESSAGES_DEFAULT
  }
  return clampInt(num, RECENT_HUMAN_ACTIVITY_MESSAGES_MIN, RECENT_HUMAN_ACTIVITY_MESSAGES_MAX)
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

function isHumanSentMessage(message: Pick<ChatMessage, 'fromMe' | 'origin'>): boolean {
  if (!message.fromMe) {
    return false
  }
  if (message.origin === 'ai' || message.origin === 'automation_api' || message.origin === 'inbound') {
    return false
  }
  return true
}

function isDeliveryGuardUndelivered(
  message: Pick<ChatMessage, 'status' | 'timestampMs'>,
  nowMs: number
): boolean {
  if (message.status === 'failed') {
    return true
  }
  if (message.status !== 'sent') {
    return false
  }

  const timestampMs =
    typeof message.timestampMs === 'number' && Number.isFinite(message.timestampMs)
      ? message.timestampMs
      : 0
  return nowMs - timestampMs >= DELIVERY_GUARD_SENT_GRACE_MS
}

function isGroupChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@g.us')
}

function isBroadcastChat(chatId: string) {
  return chatId.trim().toLowerCase().endsWith('@broadcast')
}

function extractFindmyangelUidFromCrm(record: { source?: string | null; observations?: string | null } | null) {
  if (!record) {
    return null
  }

  const source = typeof record.source === 'string' ? record.source.trim().toLowerCase() : ''
  const observations = typeof record.observations === 'string' ? record.observations.trim() : ''
  if (!observations) {
    return null
  }

  const looksLikeFindmyangel =
    source === 'findmyangel' ||
    observations.toLowerCase().includes('findmyangel')

  if (!looksLikeFindmyangel) {
    return null
  }

  const match = observations.match(/\buid=([A-Za-z0-9_-]{3,128})\b/i)
  return match ? match[1] : null
}

function shouldIntroduceToUser(config: AiConfig, counter: number) {
  if (config.training?.seApresentarComoIA === false) {
    return false
  }

  if (counter <= 0) {
    return true
  }

  return counter % 20 === 0
}

function buildOnboardingGuidedTestPrompt(language: AiLanguage): string {
  if (language === 'en') {
    return [
      'ONBOARDING GUIDED TEST MODE:',
      '- This is a fictitious test chat, so optimize for readability in preview.',
      '- Prefer 2 to 4 short messages instead of one long block whenever the reply gets long.',
      '- If you need multiple messages, insert [SEPARATE] between the greeting, qualification questions, and CTA.',
      '- Never use **double asterisks** for bold. Always use *single asterisks* in WhatsApp style.'
    ].join('\n')
  }

  return [
    'MODO LABORATÓRIO DE ONBOARDING:',
    '- Este é um chat fictício de teste, então priorize legibilidade na prévia.',
    '- Prefira 2 a 4 mensagens curtas em vez de um bloco único sempre que a resposta ficar longa.',
    '- Se precisar mandar várias mensagens, use [SEPARAR] entre saudação, qualificação e CTA.',
    '- Nunca use **dois asteriscos** no negrito. Use sempre *um asterisco* no estilo do WhatsApp.'
  ].join('\n')
}

function buildGuidedTestScenario(language: AiLanguage): string[] {
  if (language === 'en') {
    return [
      "Hi, I'd like to understand what AutoWhats can do for my business.",
      "I worry setup is hard. What's the fastest way to start?",
      'How do you suggest we move forward from here?'
    ]
  }

  return [
    'Oi, quero entender como a AutoWhats pode ajudar meu negocio.',
    'Tenho receio de ser dificil configurar. Qual o caminho mais rapido para comecar?',
    'Qual voce recomenda como proximo passo para avancar?'
  ]
}

function evaluateGuidedTestChecks(
  transcript: GuidedTestTranscriptEntry[],
  training: AiTrainingData | undefined,
  language: AiLanguage
): GuidedTestCheckResult[] {
  const assistantMessages = transcript
    .filter((entry) => entry.role === 'assistant')
    .map((entry) => entry.text.trim())
    .filter(Boolean)
  const combinedAssistant = assistantMessages.join('\n')

  const noNa = assistantMessages.every((entry) => !/^\s*N\s*\/\s*A\s*$/i.test(entry))

  const hasCtaRegex =
    language === 'en'
      ? /\b(trial|create (an )?account|book|schedule|meeting|next step|activate)\b/i
      : /\b(teste gr[aá]tis|criar conta|agendar|reuni[aã]o|pr[oó]ximo passo|ativar)\b/i
  const hasCta = hasCtaRegex.test(combinedAssistant)

  const averageLength =
    assistantMessages.length > 0
      ? assistantMessages.reduce((total, entry) => total + entry.length, 0) / assistantMessages.length
      : 0
  const shortMessage = assistantMessages.every((entry) => entry.length <= 420) && averageLength <= 260

  const commercialDescription =
    typeof training?.descricaoServicosProdutosVendidos === 'string'
      ? training.descricaoServicosProdutosVendidos
      : ''
  const hasCommercialDescriptionText = commercialDescription.trim().length > 0
  const serviceKeywords = extractServiceKeywords(commercialDescription)
  const normalizedCombined = normalizeForMatch(combinedAssistant)
  const hasServiceKeyword = serviceKeywords.some((keyword) => normalizedCombined.includes(keyword))
  const hasFallbackServiceMention =
    /\b(crm|agenda|transmiss[aã]o|arquivos|financeiro|subcontas?|whatsapp)\b/i.test(combinedAssistant)
  const serviceReference = !hasCommercialDescriptionText || hasServiceKeyword || hasFallbackServiceMention

  const mentionsPrice = /(?:r\$\s*\d|\$\s*\d|\b\d+\s*(?:reais|real|usd|d[oó]lar(?:es)?))/i.test(
    combinedAssistant
  )
  const hasPricingHints = /(?:r\$\s*\d|\$\s*\d|\b\d+(?:[.,]\d+)?\s*(?:reais|real|usd|d[oó]lar(?:es)?)\b|\bpre[cç]o(?:s)?\b|\bvalor(?:es)?\b|\bpricing\b|\bprice(?:s)?\b|\bfaixa\b)/i.test(
    commercialDescription
  )
  const unsafeClaims =
    /\b(100%\s*garantid[oa]|garantia de resultado|resultado garantido|lucro garantido)\b/i.test(
      combinedAssistant
    )
  const safeBehavior = !unsafeClaims && (hasPricingHints || !mentionsPrice)

  return [
    { id: 'no_na', passed: noNa },
    { id: 'has_cta', passed: hasCta },
    { id: 'short_message', passed: shortMessage },
    { id: 'service_reference', passed: serviceReference },
    { id: 'safe_behavior', passed: safeBehavior }
  ]
}

function extractServiceKeywords(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    return []
  }
  const stopWords = new Set([
    'para',
    'com',
    'sem',
    'mais',
    'menos',
    'sobre',
    'entre',
    'uma',
    'umas',
    'uns',
    'servico',
    'servicos',
    'service',
    'services',
    'descricao',
    'produto',
    'produtos',
    'product',
    'products',
    'valor',
    'valores',
    'preco',
    'precos',
    'price',
    'prices',
    'pricing',
    'pagamento',
    'payment',
    'with',
    'that',
    'this',
    'from',
    'your',
    'you',
    'nossa',
    'nosso',
    'nos',
    'auto',
    'whats',
    'autowhats'
  ])
  const tokens = normalizeForMatch(raw)
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 5 && !stopWords.has(entry) && !/^\d+$/.test(entry))

  const unique: string[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    if (seen.has(token)) {
      continue
    }
    seen.add(token)
    unique.push(token)
    if (unique.length >= 25) {
      break
    }
  }
  return unique
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildStoredFilePlaceholder(fileName: string, language: AiLanguage = 'pt-BR'): string {
  return language === 'en' ? `[File sent: ${fileName}]` : `[Arquivo enviado: ${fileName}]`
}

function buildStoredContactPlaceholder(contactName: string, language: AiLanguage = 'pt-BR'): string {
  return language === 'en' ? `[Contact sent: ${contactName}]` : `[Contato enviado: ${contactName}]`
}

function buildStoredAttachmentSummary(
  filesCount: number,
  contactsCount: number,
  language: AiLanguage = 'pt-BR'
): string {
  if (filesCount > 0 && contactsCount > 0) {
    return language === 'en'
      ? `[Files and contacts sent: ${filesCount} files, ${contactsCount} contacts]`
      : `[Arquivos e contatos enviados: ${filesCount} arquivos, ${contactsCount} contatos]`
  }
  if (filesCount > 0) {
    return language === 'en' ? `[Files sent: ${filesCount}]` : `[Arquivos enviados: ${filesCount}]`
  }
  if (contactsCount > 0) {
    return language === 'en' ? `[Contacts sent: ${contactsCount}]` : `[Contatos enviados: ${contactsCount}]`
  }
  return ''
}

const DEFAULT_HANDOFF_TEXT_PT =
  'Desculpe, não tenho essa informação no momento. Vou encaminhar sua conversa para um atendente humano que poderá te ajudar melhor!'

const DEFAULT_HANDOFF_TEXT_EN =
  "Sorry, I don't have that information right now. I'll forward your conversation to a human agent who can help you better."

const PERSONALIZED_HANDOFF_SYSTEM_PROMPT_PT = `Você vai escrever apenas a mensagem final de encaminhamento no WhatsApp antes de um humano assumir o atendimento.

Objetivo:
- enviar 1 única mensagem curta, natural e contextual;
- reconhecer que o atendimento será encaminhado para um humano;
- encerrar a atuação da IA com clareza.

Regras obrigatórias:
- Não responda a dúvida pendente do cliente.
- Não invente informações.
- Não use "N/A".
- Não use [SEPARAR], [SEPARATE], [ENVIAR_ARQUIVO] ou [ENVIAR_CONTATO].
- Não divida em múltiplas mensagens.
- Não prometa prazo específico.
- Mantenha um tom humano e adequado ao histórico.`

const PERSONALIZED_HANDOFF_SYSTEM_PROMPT_EN = `You are writing only the final WhatsApp handoff message before a human takes over.

Goal:
- send 1 single short, natural, contextual message;
- acknowledge that the conversation is being handed to a human;
- clearly end the AI participation.

Mandatory rules:
- Do not answer the customer's pending question.
- Do not invent information.
- Do not use "N/A".
- Do not use [SEPARAR], [SEPARATE], [ENVIAR_ARQUIVO], or [ENVIAR_CONTATO].
- Do not split into multiple messages.
- Do not promise a specific response time.
- Keep a human, context-appropriate tone.`

export function resolveHandoffText(training?: AiTrainingData) {
  const custom = training?.mensagemEncaminharHumano
  if (typeof custom === 'string' && custom.trim()) {
    return custom.trim()
  }

  return resolveTrainingLanguage(training) === 'en' ? DEFAULT_HANDOFF_TEXT_EN : DEFAULT_HANDOFF_TEXT_PT
}

function buildPersonalizedHandoffSystemPrompt(training: AiTrainingData | undefined, language: AiLanguage): string {
  const assistantName = typeof training?.nomeIA === 'string' ? training.nomeIA.trim() : ''
  const companyName = typeof training?.nomeEmpresa === 'string' ? training.nomeEmpresa.trim() : ''
  const responseStyle = typeof training?.tipoResposta === 'string' ? training.tipoResposta.trim() : ''
  const usingEmojis = training?.usarEmojis !== false

  const details =
    language === 'en'
      ? [
          assistantName ? `Assistant name: ${assistantName}` : null,
          companyName ? `Company: ${companyName}` : null,
          responseStyle ? `Preferred tone/style: ${truncateText(responseStyle, 300)}` : null,
          usingEmojis ? 'If it feels natural, use at most one emoji.' : 'Do not use emojis.'
        ]
      : [
          assistantName ? `Nome do assistente: ${assistantName}` : null,
          companyName ? `Empresa: ${companyName}` : null,
          responseStyle ? `Tom/estilo desejado: ${truncateText(responseStyle, 300)}` : null,
          usingEmojis ? 'Se soar natural, use no máximo 1 emoji.' : 'Não use emojis.'
        ]

  const profile = details.filter((item): item is string => Boolean(item)).join('\n')
  const basePrompt =
    language === 'en' ? PERSONALIZED_HANDOFF_SYSTEM_PROMPT_EN : PERSONALIZED_HANDOFF_SYSTEM_PROMPT_PT

  return profile ? `${basePrompt}\n\n${profile}` : basePrompt
}

function validatePersonalizedHandoffReply(reply: string): string | null {
  const sanitized = sanitizeAssistantReplyOutput(reply).trim()
  if (!sanitized) {
    return null
  }

  if (isOutOfContextReply(sanitized)) {
    return null
  }

  const sequence = extractOrderedSendSequence(sanitized)
  if (sequence.fileIds.length > 0 || sequence.contacts.length > 0) {
    return null
  }

  if (sequence.cleanedReply.trim() !== sanitized) {
    return null
  }

  if (splitReply(sanitized).length !== 1) {
    return null
  }

  return sanitized
}

function resolveFollowUpFallbackPrompt(config: AiConfig): string {
  const rawConfig = config as AiConfig & {
    followUpSystemPrompt?: unknown
    followupSystemPrompt?: unknown
    follow_up_system_prompt?: unknown
  }

  const candidates = [
    rawConfig.followUpSystemPrompt,
    rawConfig.followupSystemPrompt,
    rawConfig.follow_up_system_prompt,
    config.systemPrompt
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }
    const trimmed = candidate.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return config.systemPrompt
}

function resolveTrainingLanguage(training?: AiTrainingData): AiLanguage {
  const value = training?.language
  if (typeof value !== 'string') {
    return 'pt-BR'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb' || normalized.startsWith('en-')) {
    return 'en'
  }
  return 'pt-BR'
}

function resolveComportamentoNaoSabe(training?: AiTrainingData): 'encaminhar' | 'silencio' | undefined {
  const legacy = training as
    | (AiTrainingData & { comportamentoNãoSabe?: 'encaminhar' | 'silencio' | 'silêncio' })
    | undefined
  const raw = training?.comportamentoNaoSabe ?? legacy?.comportamentoNãoSabe
  if (raw === 'encaminhar') {
    return 'encaminhar'
  }
  if (raw === 'silencio' || raw === 'silêncio') {
    return 'silencio'
  }
  return undefined
}

function isDeliveryGuardEnabled(training?: AiTrainingData): boolean {
  const legacy = training as
    | (AiTrainingData & { desligarIASeUltimasDuasMensagensNãoRecebidas?: boolean })
    | undefined
  const value =
    typeof training?.desligarIASeUltimasDuasMensagensNaoRecebidas === 'boolean'
      ? training.desligarIASeUltimasDuasMensagensNaoRecebidas
      : legacy?.desligarIASeUltimasDuasMensagensNãoRecebidas
  return value !== false
}

function isOutOfContextReply(reply: string) {
  return /\bN\s*\/\s*A\b/i.test(reply)
}

const CLIENT_CLASSIFY_SYSTEM_PROMPT_PT = `Você é um classificador de clientes para WhatsApp.
Sua tarefa é decidir se a pessoa já é cliente/aluno/assinante (true) ou ainda é lead (false).

Considere cliente se houver EVIDÊNCIA CLARA de:
- Auto declaração (ex: "sou cliente", "já sou aluno", "sou assinante", "já tenho matrícula").
- Dúvidas típicas de cliente ativo (ex: "preciso pagar minha mensalidade", "qual o valor da mensalidade?",
  "minha fatura", "segunda via", "renovar", "reposição de aula").

Não classifique como cliente por interesse genérico, orçamento inicial ou perguntas comuns de lead.
Se não tiver evidência clara, responda false.

Responda SOMENTE JSON válido, sem texto extra:
{"isClient": true|false, "confidence": 0..1, "reason": "curto"}`

const CLIENT_CLASSIFY_SYSTEM_PROMPT_EN = `You are a WhatsApp customer classifier.
Your task is to decide whether the person is already a customer/student/subscriber (true) or still a lead (false).

Consider customer only when there is CLEAR EVIDENCE of:
- Self-declaration (e.g. "I'm already a customer", "I'm a student", "I'm a subscriber", "I'm already enrolled").
- Typical active-customer requests (e.g. invoice, monthly payment, second copy, renewal, class replacement).

Do not classify as customer based on generic interest, first quote questions, or regular lead questions.
If evidence is unclear, reply false.

Reply with ONLY valid JSON, no extra text:
{"isClient": true|false, "confidence": 0..1, "reason": "short"}`

const CLIENT_CLASSIFY_MAX_MESSAGES = 12

function buildClientClassificationMessages(
  context: AiContextMessage[],
  options: { timezone?: string; language?: AiLanguage } = {}
): OpenAiMessage[] {
  const timezone = options.timezone?.trim() || 'America/Sao_Paulo'
  const language = options.language ?? 'pt-BR'
  const trimmed = context.slice(-CLIENT_CLASSIFY_MAX_MESSAGES)
  if (trimmed.length === 0) {
    return []
  }

  const systemPrompt =
    language === 'en' ? CLIENT_CLASSIFY_SYSTEM_PROMPT_EN : CLIENT_CLASSIFY_SYSTEM_PROMPT_PT
  const messages: OpenAiMessage[] = [{ role: 'system', content: systemPrompt }]
  for (const entry of trimmed) {
    messages.push({
      role: entry.role,
      content: formatContextMessageForPrompt(entry, timezone, language)
    })
  }
  return messages
}

function parseClientClassification(reply: string) {
  if (!reply) {
    return null
  }
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  const raw = reply.slice(start, end + 1)
  try {
    const parsed = JSON.parse(raw) as {
      isClient?: unknown
      confidence?: unknown
      reason?: unknown
    }
    let isClient = false
    if (typeof parsed.isClient === 'boolean') {
      isClient = parsed.isClient
    } else if (typeof parsed.isClient === 'string') {
      const normalized = parsed.isClient.trim().toLowerCase()
      if (['true', 'sim', 'yes'].includes(normalized)) {
        isClient = true
      } else if (['false', 'nao', 'não', 'no'].includes(normalized)) {
        isClient = false
      }
    } else if (typeof parsed.isClient === 'number') {
      isClient = parsed.isClient > 0
    }

    const confidence = typeof parsed.confidence === 'number' ? clampNumber(parsed.confidence, 0, 1) : 0
    const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
    return { isClient, confidence, reason }
  } catch {
    return null
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return trimmed.slice(0, maxLength)
}

function parseFieldSuggestion(reply: string): { patch: unknown; reason: string } | null {
  if (!reply) {
    return null
  }

  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  const raw = reply.slice(start, end + 1)
  try {
    const parsed = JSON.parse(raw) as { patch?: unknown; reason?: unknown }
    return {
      patch: parsed.patch,
      reason: typeof parsed.reason === 'string' ? parsed.reason : ''
    }
  } catch {
    return null
  }
}

function normalizeFieldSuggestionPatch(
  patch: unknown,
  targetType: AiFieldSuggestionTargetType
): AiFieldSuggestionPatch {
  const normalized: AiFieldSuggestionPatch = {}
  if (!isRecord(patch)) {
    return normalized
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    const rawStatus = patch.status
    if (typeof rawStatus === 'string' && rawStatus.trim()) {
      if (targetType === 'lead') {
        const status = normalizeLeadStatus(rawStatus)
        if (status && status !== 'cliente') {
          normalized.status = status
        }
      } else {
        const status = normalizeClientStatus(rawStatus)
        if (status && status !== 'lead') {
          normalized.status = status
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'nextContactAt')) {
    const parsed = parseTimestampMs(patch.nextContactAt)
    if (parsed !== undefined) {
      normalized.nextContactAt = parsed
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'observations')) {
    const raw = patch.observations
    if (raw === null) {
      normalized.observations = null
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim()
      normalized.observations = trimmed.length > 0 ? trimmed : null
    }
  }

  return normalized
}

function stripUnchangedSuggestionPatch(
  patch: AiFieldSuggestionPatch,
  base: AiFieldSuggestionBase
): AiFieldSuggestionPatch | null {
  const stripped: AiFieldSuggestionPatch = {}
  const baseStatus = typeof base.status === 'string' ? base.status : null
  const baseObservations = base.observations ?? null
  const baseNextContact = base.nextContactAt ?? null

  if (patch.status !== undefined && patch.status !== baseStatus) {
    stripped.status = patch.status
  }

  if (patch.observations !== undefined && patch.observations !== baseObservations) {
    stripped.observations = patch.observations
  }

  if (patch.nextContactAt !== undefined && patch.nextContactAt !== baseNextContact) {
    stripped.nextContactAt = patch.nextContactAt
  }

  return Object.keys(stripped).length > 0 ? stripped : null
}

function normalizeLeadStatus(value?: string) {
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
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_')
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

function normalizePromptLeadTag(value: unknown): 'P. Ativa' | 'P. Passiva' | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (normalized.includes('passiva')) {
    return 'P. Passiva'
  }
  if (normalized.includes('ativa')) {
    return 'P. Ativa'
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
