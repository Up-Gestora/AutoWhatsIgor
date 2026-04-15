export type AIModel = 'openai' | 'google' | 'x'
export type TrainingLanguage = 'pt-BR' | 'en'

export const TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT = 20
export const TRAINING_CONTEXT_MAX_MESSAGES_MIN = 10
export const TRAINING_CONTEXT_MAX_MESSAGES_MAX = 100
export const TRAINING_RECENT_HUMAN_DAYS_DEFAULT = 3
export const TRAINING_RECENT_HUMAN_DAYS_MIN = 1
export const TRAINING_RECENT_HUMAN_DAYS_MAX = 30
export const TRAINING_RECENT_HUMAN_MESSAGES_DEFAULT = 10
export const TRAINING_RECENT_HUMAN_MESSAGES_MIN = 1
export const TRAINING_RECENT_HUMAN_MESSAGES_MAX = 200

export const DEFAULT_ORIENTACOES_GERAIS = `Respeitando as diretrizes abaixo, analise o histórico da conversa disponibilizada ao final desse prompt, bem como os dados e informações da empresa que você representa e responda da melhor forma possível as últimas mensagens recebidas.

SEU OBJETIVO: Tirar dúvidas dos clientes, passar informações sobre nossos serviços e preços, realizar agendamentos de horários e guiar a conversa de forma proativa.

DIRETRIZES:
- Priorize enviar mensagens curtas, como um humano faria.
- Evite fazer múltiplas perguntas em uma única mensagem, faça no máximo 1-2 perguntas por vez.
- Faça perguntas de qualificação para guiar a conversa sempre que necessário.
- Use o histórico da conversa fornecido ao final do prompt para entender o contexto da conversa e responder de forma adequada.
- Em hipótese alguma invente informações ou fuja do que está escrito e permitido na base de dados. Se tiver dúvidas, responda com 'N/A' para que um humano assuma a conversa.
- SEMPRE deixe uma linha em branco entre paragrafos diferentes.
- Use quebras de linha para separar topicos ou itens.
- Use dois pontos (:) antes de listar itens.
- Use hifens (-) ou asteriscos (*) para listas.
- Deixe uma linha em branco antes e depois de listas.
- IMPORTANTE: Para texto em negrito no WhatsApp, use UM asterisco antes e UM asterisco depois: texto em negrito. Exemplo correto: *atenção exclusiva.*
- AGENDAMENTOS: Utilize as ferramentas de agenda APENAS para serviços que explicitamente indiquem a necessidade de marcação ou agendamento na base de dados (ex: etiquetas como [Agendável] ou textos como "requer agendamento"). Para produtos físicos, digitais ou serviços de entrega imediata que não mencionem agendamento, NÃO use as ferramentas de agenda; apenas forneça as informações de venda e pagamento. Quando o agendamento for necessário: primeiro use list_agendas para saber quais agendas existem (se ainda não souber). Depois, use check_availability para a data solicitada. Sugira horários baseados nos intervalos de businessHours que não estejam ocupados em appointments. Após o cliente escolher, use create_appointment.
- IMPORTANTE - Divisão de mensagens: Quando sua resposta for longa ou você quiser enviar múltiplas mensagens curtas (como um humano faria), use o delimitador [SEPARAR] para indicar onde quer quebrar a mensagem. O sistema enviará cada parte como uma mensagem separada com delay entre elas.`

export const DEFAULT_MENSAGEM_ENCAMINHAR_HUMANO =
  'Desculpe, não tenho essa informação no momento. Vou encaminhar sua conversa para um atendente humano que poderá te ajudar melhor!'

const DEFAULT_ORIENTACOES_GERAIS_EN = `Follow the directives below, analyze the conversation history provided at the end of this prompt, plus the company data you represent, and reply in the best possible way to the latest incoming messages.

YOUR GOAL: Answer customer questions, provide information about our services and pricing, schedule appointments when needed, and guide the conversation proactively.

GUIDELINES:
- Prioritize short messages, like a human would.
- Avoid asking multiple questions in one message. Ask at most 1-2 questions at a time.
- Ask qualification questions when needed to guide the conversation.
- Use the provided conversation history to understand context before replying.
- Never invent information or go beyond what is explicitly allowed in the knowledge base. If unsure, answer 'N/A' so a human can take over.
- ALWAYS leave a blank line between different paragraphs.
- Use line breaks to separate topics or items.
- Use colons (:) before listing items.
- Use hyphens (-) or asterisks (*) for lists.
- Leave a blank line before and after lists.
- IMPORTANT: For bold text in WhatsApp, use ONE asterisk before and ONE after the text. Correct example: *exclusive attention.*
- APPOINTMENTS: Use scheduling tools ONLY for services that explicitly require booking in the knowledge base (for example: tags like [Bookable] or text like "requires scheduling"). For physical/digital products or immediate delivery services that do not mention scheduling, DO NOT use scheduling tools; only provide sales and payment information. When scheduling is required: first use list_agendas (if needed), then use check_availability for the requested date, suggest slots from businessHours that are not occupied in appointments, and after the customer chooses, use create_appointment.
- IMPORTANT - Message splitting: When your answer is long or you want multiple short messages, use [SEPARAR] to indicate split points. The system will send each part as a separate message with delays.`

const DEFAULT_MENSAGEM_ENCAMINHAR_HUMANO_EN =
  "Sorry, I don't have that information right now. I'll forward your conversation to a human agent who can help you better!"

const LEGACY_SUGESTOES_LEADS_CLIENTES_PROMPT_PT = `Você é um assistente que sugere alterações em campos de CRM (leads/clientes).
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

const DEFAULT_INSTRUCOES_SUGESTOES_LEADS_CLIENTES = ''

export type TrainingFollowUpAutomaticConfig = {
  enabled: boolean
  allowClients: boolean
}

export const TRAINING_COMMERCIAL_DESCRIPTION_FIELD = 'descricaoServicosProdutosVendidos'

export const DEFAULT_TRAINING_FOLLOWUP_AUTOMATIC: TrainingFollowUpAutomaticConfig = {
  enabled: false,
  allowClients: false
}

export type TrainingInstructions = {
  language: TrainingLanguage
  nomeEmpresa: string
  nomeIA: string
  seApresentarComoIA: boolean
  comportamentoNãoSabe: 'encaminhar' | 'silêncio'
  mensagemEncaminharHumano: string
  permitirIATextoPersonalizadoAoEncaminharHumano: boolean
  tipoResposta: string
  usarEmojis: boolean
  usarAgendaAutomatica: boolean
  orientacoesFollowUp: string
  instrucoesLeadsTagPassiva: string
  instrucoesLeadsTagAtiva: string
  instrucoesFollowUpTagPassiva: string
  instrucoesFollowUpTagAtiva: string
  desligarMensagemForaContexto: boolean
  desligarIASeUltimasDuasMensagensNãoRecebidas: boolean
  desligarIASeHumanoRecente: boolean
  desligarIASeHumanoRecenteUsarDias: boolean
  desligarIASeHumanoRecenteUsarMensagens: boolean
  desligarIASeHumanoRecenteDias: number
  desligarIASeHumanoRecenteMensagens: number
  responderClientes: boolean
  autoClassificarLeadComoCliente: boolean
  permitirSugestoesCamposLeadsClientes: boolean
  aprovarAutomaticamenteSugestoesLeadsClientes: boolean
  instrucoesSugestoesLeadsClientes: string
  permitirIAEnviarArquivos: boolean
  permitirIAOuvirAudios: boolean
  permitirIALerImagensEPdfs: boolean
  responderGrupos: boolean
  esconderGrupos: boolean
  orientacoesGerais: string
  empresa: string
  descricaoServicosProdutosVendidos: string
  horarios: string
  outros: string
  followUpAutomatico: TrainingFollowUpAutomaticConfig
}

export type TrainingSnapshot = {
  model: AIModel
  instructions: TrainingInstructions
  contextMaxMessages: number
}

export const TRAINING_TEXT_KEYS = [
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

export const TRAINING_TOGGLE_KEYS = [
  'seApresentarComoIA',
  'permitirIATextoPersonalizadoAoEncaminharHumano',
  'usarEmojis',
  'usarAgendaAutomatica',
  'desligarMensagemForaContexto',
  'desligarIASeUltimasDuasMensagensNãoRecebidas',
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

export const TRAINING_NUMBER_KEYS = [
  'desligarIASeHumanoRecenteDias',
  'desligarIASeHumanoRecenteMensagens'
] as const

export const TRAINING_ENUM_KEYS = ['comportamentoNãoSabe'] as const
export const TRAINING_OBJECT_KEYS = ['followUpAutomatico'] as const

export type TrainingTextKey = (typeof TRAINING_TEXT_KEYS)[number]
export type TrainingToggleKey = (typeof TRAINING_TOGGLE_KEYS)[number]
export type TrainingNumberKey = (typeof TRAINING_NUMBER_KEYS)[number]
export type TrainingEnumKey = (typeof TRAINING_ENUM_KEYS)[number]
export type TrainingObjectKey = (typeof TRAINING_OBJECT_KEYS)[number]
export type TrainingPatchKey =
  | TrainingTextKey
  | TrainingToggleKey
  | TrainingNumberKey
  | TrainingEnumKey
  | TrainingObjectKey

export type TrainingPatch = Partial<
  Record<TrainingTextKey, string> &
    Record<TrainingToggleKey, boolean> &
    Record<TrainingNumberKey, number> &
    Record<TrainingEnumKey, TrainingInstructions['comportamentoNãoSabe']> &
    Record<TrainingObjectKey, TrainingFollowUpAutomaticConfig>
>

const textKeySet = new Set<string>(TRAINING_TEXT_KEYS)
const toggleKeySet = new Set<string>(TRAINING_TOGGLE_KEYS)
const numberKeySet = new Set<string>(TRAINING_NUMBER_KEYS)
const enumKeySet = new Set<string>(TRAINING_ENUM_KEYS)
const objectKeySet = new Set<string>(TRAINING_OBJECT_KEYS)

const DEFAULT_TIPO_RESPOSTA =
  'Seja extremamente amigável, empática e focada em atender bem as pessoas. Use linguagem natural, informal e calorosa, como uma secretária real faria.'

const DEFAULT_TIPO_RESPOSTA_EN =
  'Be extremely friendly, empathetic, and focused on helping people. Use natural, informal, and warm language, as a real assistant would.'

export const DEFAULT_TRAINING_INSTRUCTIONS: TrainingInstructions = {
  language: 'pt-BR',
  nomeEmpresa: '',
  nomeIA: '',
  seApresentarComoIA: true,
  comportamentoNãoSabe: 'encaminhar',
  mensagemEncaminharHumano: DEFAULT_MENSAGEM_ENCAMINHAR_HUMANO,
  permitirIATextoPersonalizadoAoEncaminharHumano: false,
  tipoResposta: DEFAULT_TIPO_RESPOSTA,
  usarEmojis: true,
  usarAgendaAutomatica: false,
  orientacoesFollowUp: '',
  instrucoesLeadsTagPassiva: '',
  instrucoesLeadsTagAtiva: '',
  instrucoesFollowUpTagPassiva: '',
  instrucoesFollowUpTagAtiva: '',
  desligarMensagemForaContexto: false,
  desligarIASeUltimasDuasMensagensNãoRecebidas: true,
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
  orientacoesGerais: DEFAULT_ORIENTACOES_GERAIS,
  empresa: '',
  descricaoServicosProdutosVendidos: '',
  horarios: '',
  outros: '',
  followUpAutomatico: {
    enabled: DEFAULT_TRAINING_FOLLOWUP_AUTOMATIC.enabled,
    allowClients: DEFAULT_TRAINING_FOLLOWUP_AUTOMATIC.allowClients
  }
}

export function normalizeContextMaxMessages(
  value: unknown,
  fallback = TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT
): number {
  if (typeof value === 'string' && !value.trim()) {
    return normalizeContextMaxMessages(fallback, TRAINING_CONTEXT_MAX_MESSAGES_DEFAULT)
  }

  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return Math.max(
      TRAINING_CONTEXT_MAX_MESSAGES_MIN,
      Math.min(TRAINING_CONTEXT_MAX_MESSAGES_MAX, fallback)
    )
  }

  if (num < TRAINING_CONTEXT_MAX_MESSAGES_MIN) return TRAINING_CONTEXT_MAX_MESSAGES_MIN
  if (num > TRAINING_CONTEXT_MAX_MESSAGES_MAX) return TRAINING_CONTEXT_MAX_MESSAGES_MAX
  return num
}

export function normalizeRecentHumanDays(
  value: unknown,
  fallback = TRAINING_RECENT_HUMAN_DAYS_DEFAULT
): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return Math.max(TRAINING_RECENT_HUMAN_DAYS_MIN, Math.min(TRAINING_RECENT_HUMAN_DAYS_MAX, fallback))
  }

  if (num < TRAINING_RECENT_HUMAN_DAYS_MIN) return TRAINING_RECENT_HUMAN_DAYS_MIN
  if (num > TRAINING_RECENT_HUMAN_DAYS_MAX) return TRAINING_RECENT_HUMAN_DAYS_MAX
  return num
}

export function normalizeRecentHumanMessages(
  value: unknown,
  fallback = TRAINING_RECENT_HUMAN_MESSAGES_DEFAULT
): number {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return Math.max(
      TRAINING_RECENT_HUMAN_MESSAGES_MIN,
      Math.min(TRAINING_RECENT_HUMAN_MESSAGES_MAX, fallback)
    )
  }

  if (num < TRAINING_RECENT_HUMAN_MESSAGES_MIN) return TRAINING_RECENT_HUMAN_MESSAGES_MIN
  if (num > TRAINING_RECENT_HUMAN_MESSAGES_MAX) return TRAINING_RECENT_HUMAN_MESSAGES_MAX
  return num
}

export function normalizeModel(value: unknown): AIModel {
  if (typeof value !== 'string') {
    return 'google'
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'openai') return 'openai'
  if (normalized === 'google' || normalized === 'gemini') return 'google'
  if (normalized === 'x') return 'x'
  return 'google'
}

export function normalizeTrainingLanguage(
  value: unknown,
  fallback: TrainingLanguage = 'pt-BR'
): TrainingLanguage {
  if (typeof value !== 'string') {
    return fallback
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
  return fallback
}

function getLanguageDefaults(language: TrainingLanguage) {
  if (language === 'en') {
    return {
      orientacoesGerais: DEFAULT_ORIENTACOES_GERAIS_EN,
      mensagemEncaminharHumano: DEFAULT_MENSAGEM_ENCAMINHAR_HUMANO_EN,
      tipoResposta: DEFAULT_TIPO_RESPOSTA_EN,
      instrucoesSugestoesLeadsClientes: DEFAULT_INSTRUCOES_SUGESTOES_LEADS_CLIENTES
    }
  }

  return {
    orientacoesGerais: DEFAULT_ORIENTACOES_GERAIS,
    mensagemEncaminharHumano: DEFAULT_MENSAGEM_ENCAMINHAR_HUMANO,
    tipoResposta: DEFAULT_TIPO_RESPOSTA,
    instrucoesSugestoesLeadsClientes: DEFAULT_INSTRUCOES_SUGESTOES_LEADS_CLIENTES
  }
}

function normalizeTrainingTextValue(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

export function mergeTrainingCommercialDescription(
  source: Record<string, unknown>,
  language: TrainingLanguage = 'pt-BR',
  fallback = ''
): string {
  const current = normalizeTrainingTextValue(source[TRAINING_COMMERCIAL_DESCRIPTION_FIELD])
  if (current) {
    return current
  }

  const services = normalizeTrainingTextValue(source['serviços']) || normalizeTrainingTextValue(source.servicos)
  const pricing = normalizeTrainingTextValue(source.valores)
  if (services && pricing) {
    const labels =
      language === 'en'
        ? { services: 'Services/products', pricing: 'Pricing' }
        : { services: 'Serviços/produtos', pricing: 'Valores e preços' }
    return `${labels.services}:\n${services}\n\n${labels.pricing}:\n${pricing}`
  }

  return services || pricing || fallback
}

export function normalizeTrainingInstructions(
  value: unknown,
  defaults: TrainingInstructions = DEFAULT_TRAINING_INSTRUCTIONS
): TrainingInstructions {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<TrainingInstructions>)
      : {}
  const rawInput =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  const language = normalizeTrainingLanguage(input.language, defaults.language)
  const languageDefaults = getLanguageDefaults(language)
  const resolvedDefaultMessage =
    defaults.language === language
      ? defaults.mensagemEncaminharHumano
      : languageDefaults.mensagemEncaminharHumano
  const resolvedDefaultTone =
    defaults.language === language ? defaults.tipoResposta : languageDefaults.tipoResposta
  const resolvedDefaultGeneralGuidance =
    defaults.language === language ? defaults.orientacoesGerais : languageDefaults.orientacoesGerais
  const resolvedDefaultSuggestionsGuidance =
    defaults.language === language
      ? defaults.instrucoesSugestoesLeadsClientes
      : languageDefaults.instrucoesSugestoesLeadsClientes
  const resolvedDefaultSuggestionsGuidanceNormalized = normalizeSuggestionUserInstructions(
    resolvedDefaultSuggestionsGuidance
  )

  const next: TrainingInstructions = {
    ...defaults,
    language,
    nomeEmpresa: typeof input.nomeEmpresa === 'string' ? input.nomeEmpresa : defaults.nomeEmpresa,
    nomeIA: typeof input.nomeIA === 'string' ? input.nomeIA : defaults.nomeIA,
    seApresentarComoIA:
      typeof input.seApresentarComoIA === 'boolean'
        ? input.seApresentarComoIA
        : defaults.seApresentarComoIA,
    comportamentoNãoSabe:
      input.comportamentoNãoSabe === 'silêncio' || input.comportamentoNãoSabe === 'encaminhar'
        ? input.comportamentoNãoSabe
        : defaults.comportamentoNãoSabe,
    mensagemEncaminharHumano:
      typeof input.mensagemEncaminharHumano === 'string' && input.mensagemEncaminharHumano.trim()
        ? input.mensagemEncaminharHumano
        : resolvedDefaultMessage,
    permitirIATextoPersonalizadoAoEncaminharHumano:
      typeof input.permitirIATextoPersonalizadoAoEncaminharHumano === 'boolean'
        ? input.permitirIATextoPersonalizadoAoEncaminharHumano
        : defaults.permitirIATextoPersonalizadoAoEncaminharHumano,
    tipoResposta: typeof input.tipoResposta === 'string' ? input.tipoResposta : resolvedDefaultTone,
    usarEmojis: typeof input.usarEmojis === 'boolean' ? input.usarEmojis : defaults.usarEmojis,
    usarAgendaAutomatica:
      typeof input.usarAgendaAutomatica === 'boolean'
        ? input.usarAgendaAutomatica
        : defaults.usarAgendaAutomatica,
    orientacoesFollowUp:
      typeof input.orientacoesFollowUp === 'string'
        ? input.orientacoesFollowUp
        : defaults.orientacoesFollowUp,
    instrucoesLeadsTagPassiva:
      typeof input.instrucoesLeadsTagPassiva === 'string'
        ? input.instrucoesLeadsTagPassiva
        : defaults.instrucoesLeadsTagPassiva,
    instrucoesLeadsTagAtiva:
      typeof input.instrucoesLeadsTagAtiva === 'string'
        ? input.instrucoesLeadsTagAtiva
        : defaults.instrucoesLeadsTagAtiva,
    instrucoesFollowUpTagPassiva:
      typeof input.instrucoesFollowUpTagPassiva === 'string'
        ? input.instrucoesFollowUpTagPassiva
        : defaults.instrucoesFollowUpTagPassiva,
    instrucoesFollowUpTagAtiva:
      typeof input.instrucoesFollowUpTagAtiva === 'string'
        ? input.instrucoesFollowUpTagAtiva
        : defaults.instrucoesFollowUpTagAtiva,
    desligarMensagemForaContexto:
      typeof input.desligarMensagemForaContexto === 'boolean'
        ? input.desligarMensagemForaContexto
        : defaults.desligarMensagemForaContexto,
    desligarIASeUltimasDuasMensagensNãoRecebidas:
      typeof input.desligarIASeUltimasDuasMensagensNãoRecebidas === 'boolean'
        ? input.desligarIASeUltimasDuasMensagensNãoRecebidas
        : defaults.desligarIASeUltimasDuasMensagensNãoRecebidas,
    desligarIASeHumanoRecente:
      typeof input.desligarIASeHumanoRecente === 'boolean'
        ? input.desligarIASeHumanoRecente
        : defaults.desligarIASeHumanoRecente,
    desligarIASeHumanoRecenteUsarDias:
      typeof input.desligarIASeHumanoRecenteUsarDias === 'boolean'
        ? input.desligarIASeHumanoRecenteUsarDias
        : defaults.desligarIASeHumanoRecenteUsarDias,
    desligarIASeHumanoRecenteUsarMensagens:
      typeof input.desligarIASeHumanoRecenteUsarMensagens === 'boolean'
        ? input.desligarIASeHumanoRecenteUsarMensagens
        : defaults.desligarIASeHumanoRecenteUsarMensagens,
    desligarIASeHumanoRecenteDias: normalizeRecentHumanDays(
      input.desligarIASeHumanoRecenteDias,
      defaults.desligarIASeHumanoRecenteDias
    ),
    desligarIASeHumanoRecenteMensagens: normalizeRecentHumanMessages(
      input.desligarIASeHumanoRecenteMensagens,
      defaults.desligarIASeHumanoRecenteMensagens
    ),
    responderClientes:
      typeof input.responderClientes === 'boolean' ? input.responderClientes : defaults.responderClientes,
    autoClassificarLeadComoCliente:
      typeof input.autoClassificarLeadComoCliente === 'boolean'
        ? input.autoClassificarLeadComoCliente
        : defaults.autoClassificarLeadComoCliente,
    permitirSugestoesCamposLeadsClientes:
      typeof input.permitirSugestoesCamposLeadsClientes === 'boolean'
        ? input.permitirSugestoesCamposLeadsClientes
        : defaults.permitirSugestoesCamposLeadsClientes,
    aprovarAutomaticamenteSugestoesLeadsClientes:
      typeof input.aprovarAutomaticamenteSugestoesLeadsClientes === 'boolean'
        ? input.aprovarAutomaticamenteSugestoesLeadsClientes
        : defaults.aprovarAutomaticamenteSugestoesLeadsClientes,
    instrucoesSugestoesLeadsClientes: normalizeSuggestionUserInstructions(
      typeof input.instrucoesSugestoesLeadsClientes === 'string'
        ? input.instrucoesSugestoesLeadsClientes
        : resolvedDefaultSuggestionsGuidanceNormalized
    ),
    permitirIAEnviarArquivos:
      typeof input.permitirIAEnviarArquivos === 'boolean'
        ? input.permitirIAEnviarArquivos
        : defaults.permitirIAEnviarArquivos,
    permitirIAOuvirAudios:
      typeof input.permitirIAOuvirAudios === 'boolean'
        ? input.permitirIAOuvirAudios
        : defaults.permitirIAOuvirAudios,
    permitirIALerImagensEPdfs:
      typeof input.permitirIALerImagensEPdfs === 'boolean'
        ? input.permitirIALerImagensEPdfs
        : defaults.permitirIALerImagensEPdfs,
    responderGrupos:
      typeof input.responderGrupos === 'boolean' ? input.responderGrupos : defaults.responderGrupos,
    esconderGrupos:
      typeof input.esconderGrupos === 'boolean' ? input.esconderGrupos : defaults.esconderGrupos,
    orientacoesGerais:
      typeof input.orientacoesGerais === 'string' && input.orientacoesGerais.trim()
        ? input.orientacoesGerais
        : resolvedDefaultGeneralGuidance,
    empresa: typeof input.empresa === 'string' ? input.empresa : defaults.empresa,
    descricaoServicosProdutosVendidos: mergeTrainingCommercialDescription(
      rawInput,
      language,
      defaults.descricaoServicosProdutosVendidos
    ),
    horarios: typeof input.horarios === 'string' ? input.horarios : defaults.horarios,
    outros: typeof input.outros === 'string' ? input.outros : defaults.outros,
    followUpAutomatico: normalizeFollowUpAutomaticConfig(
      input.followUpAutomatico ??
        ((input as Partial<TrainingInstructions> & { followUpAutomatic?: unknown }).followUpAutomatic ??
          undefined),
      defaults.followUpAutomatico
    )
  }

  return normalizeInstructionInvariants(next)
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

export function normalizeTrainingSnapshot(value: unknown): TrainingSnapshot {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<TrainingSnapshot>)
      : {}

  return {
    model: normalizeModel(input.model),
    instructions: normalizeTrainingInstructions(input.instructions),
    contextMaxMessages: normalizeContextMaxMessages(input.contextMaxMessages)
  }
}

export function sanitizeTrainingPatch(raw: unknown): TrainingPatch {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }

  const input = raw as Record<string, unknown>
  const patch: TrainingPatch = {}

  for (const [key, value] of Object.entries(input)) {
    if (textKeySet.has(key)) {
      if (typeof value === 'string') {
        patch[key as TrainingTextKey] = value
      }
      continue
    }

    if (toggleKeySet.has(key)) {
      if (typeof value === 'boolean') {
        patch[key as TrainingToggleKey] = value
      }
      continue
    }

    if (numberKeySet.has(key)) {
      if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
        if (key === 'desligarIASeHumanoRecenteDias') {
          patch[key as TrainingNumberKey] = normalizeRecentHumanDays(value)
        } else if (key === 'desligarIASeHumanoRecenteMensagens') {
          patch[key as TrainingNumberKey] = normalizeRecentHumanMessages(value)
        }
      }
      continue
    }

    if (enumKeySet.has(key)) {
      if (value === 'encaminhar' || value === 'silêncio') {
        patch[key as TrainingEnumKey] = value
      }
      continue
    }

    if (objectKeySet.has(key)) {
      patch[key as TrainingObjectKey] = normalizeFollowUpAutomaticConfig(value)
    }
  }

  return patch
}

export function applyTrainingPatch(snapshot: TrainingSnapshot, rawPatch: unknown): TrainingSnapshot {
  const normalized = normalizeTrainingSnapshot(snapshot)
  const patch = sanitizeTrainingPatch(rawPatch)
  const nextInstructions: TrainingInstructions = {
    ...normalized.instructions,
    ...patch
  }

  return {
    ...normalized,
    instructions: normalizeInstructionInvariants(nextInstructions)
  }
}

function normalizeInstructionInvariants(instructions: TrainingInstructions): TrainingInstructions {
  let next = {
    ...instructions,
    desligarIASeHumanoRecenteUsarDias: instructions.desligarIASeHumanoRecenteUsarDias !== false,
    desligarIASeHumanoRecenteUsarMensagens: instructions.desligarIASeHumanoRecenteUsarMensagens !== false,
    desligarIASeHumanoRecenteDias: normalizeRecentHumanDays(instructions.desligarIASeHumanoRecenteDias),
    desligarIASeHumanoRecenteMensagens: normalizeRecentHumanMessages(
      instructions.desligarIASeHumanoRecenteMensagens
    ),
    followUpAutomatico: normalizeFollowUpAutomaticConfig(instructions.followUpAutomatico)
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

export function normalizeFollowUpAutomaticConfig(
  value: unknown,
  defaults: TrainingFollowUpAutomaticConfig = DEFAULT_TRAINING_FOLLOWUP_AUTOMATIC
): TrainingFollowUpAutomaticConfig {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<TrainingFollowUpAutomaticConfig>)
      : {}

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    allowClients: typeof input.allowClients === 'boolean' ? input.allowClients : defaults.allowClients
  }
}
