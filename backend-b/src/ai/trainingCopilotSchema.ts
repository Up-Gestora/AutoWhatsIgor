import type { AiFollowUpAutomaticConfig, AiTrainingData } from './types'

const TRAINING_RECENT_HUMAN_DAYS_DEFAULT = 3
const TRAINING_RECENT_HUMAN_DAYS_MIN = 1
const TRAINING_RECENT_HUMAN_DAYS_MAX = 30
const TRAINING_RECENT_HUMAN_MESSAGES_DEFAULT = 10
const TRAINING_RECENT_HUMAN_MESSAGES_MIN = 1
const TRAINING_RECENT_HUMAN_MESSAGES_MAX = 200

export const TRAINING_COPILOT_TEXT_KEYS = [
  'nomeEmpresa',
  'nomeIA',
  'mensagemEncaminharHumano',
  'tipoResposta',
  'orientacoesGerais',
  'orientacoesFollowUp',
  'instrucoesLeadsTagPassiva',
  'instrucoesLeadsTagAtiva',
  'instrucoesFollowUpTagPassiva',
  'instrucoesFollowUpTagAtiva',
  'instrucoesSugestoesLeadsClientes',
  'empresa',
  'descricaoServicosProdutosVendidos',
  'horarios',
  'outros'
] as const

export const TRAINING_COPILOT_TOGGLE_KEYS = [
  'seApresentarComoIA',
  'permitirIATextoPersonalizadoAoEncaminharHumano',
  'usarEmojis',
  'usarAgendaAutomatica',
  'desligarMensagemForaContexto',
  'desligarIASeUltimasDuasMensagensNaoRecebidas',
  'desligarIASeHumanoRecente',
  'desligarIASeHumanoRecenteUsarDias',
  'desligarIASeHumanoRecenteUsarMensagens',
  'responderClientes',
  'autoClassificarLeadComoCliente',
  'permitirSugestoesCamposLeadsClientes',
  'aprovarAutomaticamenteSugestoesLeadsClientes',
  'permitirIAEnviarArquivos',
  'permitirIAOuvirAudios',
  'permitirIALerImagensEPdfs',
  'responderGrupos',
  'esconderGrupos'
] as const

export const TRAINING_COPILOT_NUMBER_KEYS = [
  'desligarIASeHumanoRecenteDias',
  'desligarIASeHumanoRecenteMensagens'
] as const

export const TRAINING_COPILOT_ENUM_KEYS = ['comportamentoNaoSabe'] as const
export const TRAINING_COPILOT_OBJECT_KEYS = ['followUpAutomatico'] as const

export type TrainingCopilotTextKey = (typeof TRAINING_COPILOT_TEXT_KEYS)[number]
export type TrainingCopilotToggleKey = (typeof TRAINING_COPILOT_TOGGLE_KEYS)[number]
export type TrainingCopilotNumberKey = (typeof TRAINING_COPILOT_NUMBER_KEYS)[number]
export type TrainingCopilotEnumKey = (typeof TRAINING_COPILOT_ENUM_KEYS)[number]
export type TrainingCopilotObjectKey = (typeof TRAINING_COPILOT_OBJECT_KEYS)[number]

export type TrainingCopilotInstructions = Required<AiTrainingData> & {
  responderGrupos: boolean
  esconderGrupos: boolean
}

export type TrainingCopilotPatch = Partial<
  Record<TrainingCopilotTextKey, string> &
    Record<TrainingCopilotToggleKey, boolean> &
    Record<TrainingCopilotNumberKey, number> &
    Record<TrainingCopilotEnumKey, 'encaminhar' | 'silencio'> &
    Record<TrainingCopilotObjectKey, AiFollowUpAutomaticConfig>
>

export type TrainingCopilotMessageRole = 'user' | 'assistant'

export type TrainingCopilotMessage = {
  id: string
  role: TrainingCopilotMessageRole
  content: string
  createdAtMs: number
}

export type TrainingCopilotProposal = {
  id: string
  seq: number
  status: 'pending'
  summary: string
  rationale?: string | null
  patch: TrainingCopilotPatch
  createdAtMs: number
}

export type TrainingCopilotDecisionStatus = 'accepted' | 'rejected' | 'superseded'

export type TrainingCopilotDecision = {
  proposalId: string
  status: TrainingCopilotDecisionStatus
  actorRole?: 'admin' | 'user' | 'system' | null
  actorUid?: string | null
  reason?: string | null
  createdAtMs: number
}

export type TrainingCopilotSessionState = {
  sessionId: string
  messages: TrainingCopilotMessage[]
  pendingProposal: TrainingCopilotProposal | null
  decisions: TrainingCopilotDecision[]
  proposalSeq: number
  createdAtMs: number
  updatedAtMs: number
}

export type ValidateTrainingPatchResult =
  | { ok: true; patch: TrainingCopilotPatch }
  | { ok: false; error: string }

const textKeySet = new Set<string>(TRAINING_COPILOT_TEXT_KEYS)
const toggleKeySet = new Set<string>(TRAINING_COPILOT_TOGGLE_KEYS)
const numberKeySet = new Set<string>(TRAINING_COPILOT_NUMBER_KEYS)
const enumKeySet = new Set<string>(TRAINING_COPILOT_ENUM_KEYS)
const objectKeySet = new Set<string>(TRAINING_COPILOT_OBJECT_KEYS)

const LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_PT = `Voce e um assistente que sugere alteracoes em campos de CRM (leads/clientes).
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

const LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_PT_ACCENTED = `Você é um assistente que sugere alterações em campos de CRM (leads/clientes).
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

const LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_EN = `You are an assistant that suggests updates to CRM fields (leads/clients).
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

const defaultTrainingData: TrainingCopilotInstructions = {
  language: 'pt-BR',
  nomeEmpresa: '',
  nomeIA: '',
  seApresentarComoIA: true,
  permitirIATextoPersonalizadoAoEncaminharHumano: false,
  usarEmojis: true,
  usarAgendaAutomatica: false,
  orientacoesFollowUp: '',
  instrucoesLeadsTagPassiva: '',
  instrucoesLeadsTagAtiva: '',
  instrucoesFollowUpTagPassiva: '',
  instrucoesFollowUpTagAtiva: '',
  desligarMensagemForaContexto: false,
  desligarIASeUltimasDuasMensagensNaoRecebidas: true,
  desligarIASeHumanoRecente: false,
  desligarIASeHumanoRecenteUsarDias: true,
  desligarIASeHumanoRecenteUsarMensagens: true,
  desligarIASeHumanoRecenteDias: TRAINING_RECENT_HUMAN_DAYS_DEFAULT,
  desligarIASeHumanoRecenteMensagens: TRAINING_RECENT_HUMAN_MESSAGES_DEFAULT,
  responderClientes: false,
  autoClassificarLeadComoCliente: false,
  permitirSugestoesCamposLeadsClientes: false,
  aprovarAutomaticamenteSugestoesLeadsClientes: false,
  instrucoesSugestoesLeadsClientes: '',
  permitirIAEnviarArquivos: false,
  permitirIAOuvirAudios: false,
  permitirIALerImagensEPdfs: false,
  responderGrupos: false,
  esconderGrupos: false,
  comportamentoNaoSabe: 'encaminhar',
  mensagemEncaminharHumano:
    'Desculpe, nao tenho essa informacao no momento. Vou encaminhar sua conversa para um atendente humano que podera te ajudar melhor!',
  tipoResposta:
    'Seja extremamente amigavel, empatica e focada em atender bem as pessoas. Use linguagem natural, informal e calorosa, como uma secretaria real faria.',
  orientacoesGerais: '',
  empresa: '',
  descricaoServicosProdutosVendidos: '',
  horarios: '',
  outros: '',
  followUpAutomatico: {
    enabled: false,
    allowClients: false
  }
}

function normalizeTextValue(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

function mergeCommercialDescription(source: Record<string, unknown>, language: 'pt-BR' | 'en'): string {
  const current = normalizeTextValue(source.descricaoServicosProdutosVendidos)
  if (current) {
    return current
  }

  const services = normalizeTextValue(source.servicos) || normalizeTextValue(source['serviços'])
  const pricing = normalizeTextValue(source.valores)
  if (services && pricing) {
    const labels =
      language === 'en'
        ? { services: 'Services/products', pricing: 'Pricing' }
        : { services: 'Serviços/produtos', pricing: 'Valores e preços' }
    return `${labels.services}:\n${services}\n\n${labels.pricing}:\n${pricing}`
  }

  return services || pricing
}

export function normalizeTrainingData(raw: unknown): TrainingCopilotInstructions {
  const input = isRecord(raw) ? (raw as Record<string, unknown>) : {}
  const next: TrainingCopilotInstructions = {
    ...defaultTrainingData
  }

  next.language = normalizeTrainingLanguage(input.language)
  for (const key of TRAINING_COPILOT_TEXT_KEYS) {
    const value = input[key]
    if (typeof value === 'string') {
      next[key] = value
    }
  }

  for (const key of TRAINING_COPILOT_TOGGLE_KEYS) {
    const value = input[key]
    if (typeof value === 'boolean') {
      next[key] = value
    }
  }
  next.desligarIASeHumanoRecenteDias = normalizeRecentHumanDays(
    input.desligarIASeHumanoRecenteDias,
    next.desligarIASeHumanoRecenteDias
  )
  next.desligarIASeHumanoRecenteMensagens = normalizeRecentHumanMessages(
    input.desligarIASeHumanoRecenteMensagens,
    next.desligarIASeHumanoRecenteMensagens
  )

  const comportamento = input.comportamentoNaoSabe
  if (comportamento === 'encaminhar' || comportamento === 'silencio') {
    next.comportamentoNaoSabe = comportamento
  }

  next.instrucoesSugestoesLeadsClientes = normalizeSuggestionUserInstructions(
    next.instrucoesSugestoesLeadsClientes
  )

  next.followUpAutomatico = normalizeFollowUpAutomaticConfig(
    input.followUpAutomatico ?? (input as Record<string, unknown>).followUpAutomatic
  )
  next.descricaoServicosProdutosVendidos = mergeCommercialDescription(input, next.language)

  return enforceTrainingInvariants(next)
}

function normalizeTrainingLanguage(value: unknown): 'pt-BR' | 'en' {
  if (typeof value !== 'string') {
    return 'pt-BR'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb' || normalized.startsWith('en-')) {
    return 'en'
  }

  if (
    normalized === 'pt' ||
    normalized === 'pt-br' ||
    normalized === 'pt_br' ||
    normalized.startsWith('pt-') ||
    normalized.startsWith('pt_')
  ) {
    return 'pt-BR'
  }

  return 'pt-BR'
}

export function applyTrainingPatch(
  base: TrainingCopilotInstructions,
  patch: TrainingCopilotPatch
): TrainingCopilotInstructions {
  const next: TrainingCopilotInstructions = {
    ...base,
    ...patch
  }
  return enforceTrainingInvariants(next)
}

export function validateTrainingPatch(
  rawPatch: unknown,
  currentTraining: unknown
): ValidateTrainingPatchResult {
  if (!isRecord(rawPatch)) {
    return { ok: false, error: 'patch_invalid' }
  }

  const parsedPatch: TrainingCopilotPatch = {}
  const patchEntries = Object.entries(rawPatch)

  if (patchEntries.length === 0) {
    return { ok: false, error: 'patch_empty' }
  }

  for (const [key, value] of patchEntries) {
    if (textKeySet.has(key)) {
      if (typeof value !== 'string') {
        return { ok: false, error: `patch_type_invalid:${key}` }
      }
      parsedPatch[key as TrainingCopilotTextKey] = value
      continue
    }

    if (toggleKeySet.has(key)) {
      if (typeof value !== 'boolean') {
        return { ok: false, error: `patch_type_invalid:${key}` }
      }
      parsedPatch[key as TrainingCopilotToggleKey] = value
      continue
    }

    if (numberKeySet.has(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        return { ok: false, error: `patch_type_invalid:${key}` }
      }
      if (key === 'desligarIASeHumanoRecenteDias') {
        parsedPatch[key as TrainingCopilotNumberKey] = normalizeRecentHumanDays(value)
      } else if (key === 'desligarIASeHumanoRecenteMensagens') {
        parsedPatch[key as TrainingCopilotNumberKey] = normalizeRecentHumanMessages(value)
      }
      continue
    }

    if (enumKeySet.has(key)) {
      if (value !== 'encaminhar' && value !== 'silencio') {
        return { ok: false, error: `patch_type_invalid:${key}` }
      }
      parsedPatch[key as TrainingCopilotEnumKey] = value
      continue
    }

    if (objectKeySet.has(key)) {
      parsedPatch[key as TrainingCopilotObjectKey] = normalizeFollowUpAutomaticConfig(value)
      continue
    }

    return { ok: false, error: `patch_key_invalid:${key}` }
  }

  const base = normalizeTrainingData(currentTraining)
  const next = applyTrainingPatch(base, parsedPatch)
  const normalizedPatch = buildPatchDiff(base, next)

  if (Object.keys(normalizedPatch).length === 0) {
    return { ok: false, error: 'patch_empty' }
  }

  return { ok: true, patch: normalizedPatch }
}

function buildPatchDiff(
  base: TrainingCopilotInstructions,
  next: TrainingCopilotInstructions
): TrainingCopilotPatch {
  const patch: TrainingCopilotPatch = {}

  for (const key of TRAINING_COPILOT_TEXT_KEYS) {
    if (base[key] !== next[key]) {
      patch[key] = next[key]
    }
  }

  for (const key of TRAINING_COPILOT_TOGGLE_KEYS) {
    if (base[key] !== next[key]) {
      patch[key] = next[key]
    }
  }
  for (const key of TRAINING_COPILOT_NUMBER_KEYS) {
    if (base[key] !== next[key]) {
      patch[key] = next[key]
    }
  }

  if (base.comportamentoNaoSabe !== next.comportamentoNaoSabe) {
    patch.comportamentoNaoSabe = next.comportamentoNaoSabe
  }

  if (!sameFollowUpAutomatic(base.followUpAutomatico, next.followUpAutomatico)) {
    patch.followUpAutomatico = next.followUpAutomatico
  }

  return patch
}

function enforceTrainingInvariants(
  value: TrainingCopilotInstructions
): TrainingCopilotInstructions {
  let next = {
    ...value,
    desligarIASeHumanoRecenteUsarDias: value.desligarIASeHumanoRecenteUsarDias !== false,
    desligarIASeHumanoRecenteUsarMensagens: value.desligarIASeHumanoRecenteUsarMensagens !== false,
    desligarIASeHumanoRecenteDias: normalizeRecentHumanDays(value.desligarIASeHumanoRecenteDias),
    desligarIASeHumanoRecenteMensagens: normalizeRecentHumanMessages(
      value.desligarIASeHumanoRecenteMensagens
    ),
    followUpAutomatico: normalizeFollowUpAutomaticConfig(value.followUpAutomatico)
  }

  if (next.esconderGrupos === true && next.responderGrupos === true) {
    next = {
      ...next,
      responderGrupos: false
    }
  }

  if (
    next.desligarIASeHumanoRecente === true &&
    next.desligarIASeHumanoRecenteUsarDias !== true &&
    next.desligarIASeHumanoRecenteUsarMensagens !== true
  ) {
    next = {
      ...next,
      desligarIASeHumanoRecente: false
    }
  }

  if (next.permitirSugestoesCamposLeadsClientes !== true) {
    return {
      ...next,
      aprovarAutomaticamenteSugestoesLeadsClientes: false
    }
  }

  return next
}

function normalizeSuggestionUserInstructions(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  const legacyPrompts = [
    LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_PT,
    LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_PT_ACCENTED,
    LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_EN
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeFollowUpAutomaticConfig(value: unknown): AiFollowUpAutomaticConfig {
  const input = isRecord(value) ? (value as Record<string, unknown>) : {}

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : false,
    allowClients: typeof input.allowClients === 'boolean' ? input.allowClients : false
  }
}

function sameFollowUpAutomatic(
  left: AiFollowUpAutomaticConfig | undefined,
  right: AiFollowUpAutomaticConfig | undefined
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function normalizeRecentHumanDays(value: unknown, fallback = TRAINING_RECENT_HUMAN_DAYS_DEFAULT): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return clampInt(fallback, TRAINING_RECENT_HUMAN_DAYS_MIN, TRAINING_RECENT_HUMAN_DAYS_MAX)
  }
  return clampInt(num, TRAINING_RECENT_HUMAN_DAYS_MIN, TRAINING_RECENT_HUMAN_DAYS_MAX)
}

function normalizeRecentHumanMessages(
  value: unknown,
  fallback = TRAINING_RECENT_HUMAN_MESSAGES_DEFAULT
): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return clampInt(
      fallback,
      TRAINING_RECENT_HUMAN_MESSAGES_MIN,
      TRAINING_RECENT_HUMAN_MESSAGES_MAX
    )
  }
  return clampInt(num, TRAINING_RECENT_HUMAN_MESSAGES_MIN, TRAINING_RECENT_HUMAN_MESSAGES_MAX)
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
