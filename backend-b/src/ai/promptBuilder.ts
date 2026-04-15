import type { AiTrainingData } from './types'

type AiPromptFile = {
  id: string
  nome: string
  descricao?: string
  quandoUsar?: string
  tipo?: string
}

type PromptLanguage = 'pt-BR' | 'en'

type PromptBuildOptions = {
  training?: AiTrainingData
  fallbackPrompt?: string
  timezone?: string
  shouldIntroduce?: boolean
  now?: Date
  files?: AiPromptFile[]
  meta?: Record<string, unknown>
  objectivePrompt?: string
  leadTag?: string | null
  includeLeadTagInstruction?: boolean
}

const PROMPT_COPY = {
  'pt-BR': {
    defaultCompanyName: 'UP Gestao de Recursos',
    defaultAssistantName: 'Mario',
    defaultTone:
      'Seja extremamente amigavel, empatica e focada em atender bem as pessoas. Use linguagem natural, informal e calorosa, como uma secretaria real faria.',
    defaultGuidance: `Respeitando as diretrizes abaixo, analise o historico da conversa disponibilizada ao final desse prompt, bem como os dados e informacoes da empresa que voce representa e responda da melhor forma possivel as ultimas mensagens recebidas.

SEU OBJETIVO: Tirar duvidas dos clientes, passar informacoes sobre nossos servicos e precos, realizar agendamentos de horarios e guiar a conversa de forma proativa.

DIRETRIZES:
- Priorize enviar mensagens curtas, como um humano faria.
- Evite fazer multiplas perguntas em uma unica mensagem, faca no maximo 1-2 perguntas por vez.
- Faca perguntas de qualificacao para guiar a conversa sempre que necessario.
- Use o historico da conversa fornecido ao final do prompt para entender o contexto da conversa e responder de forma adequada.
- No historico, cada mensagem inclui metadados tecnicos (fromMe, origin, actor, channel) para indicar remetente e canal.
- Nem toda mensagem com papel "assistant" foi escrita pela IA; diferencie usando origin/actor/channel.
- Em hipotese alguma invente informacoes ou fuja do que esta escrito e permitido na base de dados. Se tiver duvidas, responda com 'N/A' para que um humano assuma a conversa.
- SEMPRE deixe uma linha em branco entre paragrafos diferentes.
- Use quebras de linha para separar topicos ou itens.
- Use dois pontos (:) antes de listar itens.
- Use hifens (-) ou asteriscos (*) para listas.
- Deixe uma linha em branco antes e depois de listas.
- IMPORTANTE: Para texto em negrito no WhatsApp, use UM asterisco antes e UM asterisco depois: texto em negrito. Exemplo correto: *atencao exclusiva.*
- NUNCA use dois asteriscos consecutivos para negrito (ex.: **texto**). O formato correto e sempre *texto*.
- NUNCA copie para a resposta linhas tecnicas que comecam com [MSG_TIME]. Isso e contexto interno.
- AGENDAMENTOS: Utilize as ferramentas de agenda APENAS para servicos que explicitamente indiquem a necessidade de marcacao ou agendamento na base de dados (ex: etiquetas como [Agendavel] ou textos como "requer agendamento"). Para produtos fisicos, digitais ou servicos de entrega imediata que nao mencionem agendamento, NAO use as ferramentas de agenda; apenas forneca as informacoes de venda e pagamento. Quando o agendamento for necessario: primeiro use list_agendas para saber quais agendas existem (se ainda nao souber). Depois, use check_availability para a data solicitada. Sugira horarios baseados nos intervalos de businessHours que nao estejam ocupados em appointments. Apos o cliente escolher, use create_appointment.
- IMPORTANTE - Divisao de mensagens: Quando sua resposta for longa ou voce quiser enviar multiplas mensagens curtas (como um humano faria), use o delimitador [SEPARAR] para indicar onde quer quebrar a mensagem. O sistema enviara cada parte como uma mensagem separada com delay entre elas.`,
    timezoneLabel: 'Data e Hora Atual',
    timezoneConnector: 'as',
    identityPrompt:
      'Voce e {assistantName}, atendente da empresa {companyName}. {presentationInstruction}',
    introduceAsAi:
      'IMPORTANTE: Voce DEVE se apresentar como uma inteligencia artificial nesta mensagem. Seja claro e direto sobre ser um assistente virtual.',
    doNotIntroduceAsAi:
      'IMPORTANTE: Voce NAO deve se apresentar como IA nesta mensagem. Aja de forma natural, como se fosse um humano. Voce ja se apresentou anteriormente.',
    actNatural: 'Aja de forma natural, como se fosse um humano.',
    emojiEnabled: 'Use emojis ocasionalmente para tornar a conversa mais humana.',
    emojiDisabled: 'Nao use emojis nas suas respostas.',
    leadTagSectionTitle: 'Instrucoes por tag do lead:',
    leadTagCurrentLabel: 'Tag atual do lead',
    leadTagAtivaDefaultReply:
      'Quando a tag for P. Ativa, trate o contato como prospect frio: nao assuma interesse imediato, priorize abordagem consultiva curta, gere curiosidade e valide interesse antes de avancar para oferta ou fechamento.',
    leadTagAtivaDefaultFollowUp:
      'No follow-up com tag P. Ativa, retome de forma leve e objetiva, reabra contexto sem pressao, destaque valor pratico e faça uma pergunta simples para reengajar.',
    dbSectionTitle: 'Use o JSON a seguir como sua base de dados:',
    followUpTitle: 'Orientacoes adicionais para follow-up:',
    followUpObjectiveTitle: 'Objetivo especifico deste follow-up:',
    extraDataTitle: 'Dados adicionais (JSON):',
    integrationTitle: 'INTEGRACAO FINDMYANGEL',
    integrationDescription: `- Estes dados sao do FindmyAngel e se referem ao usuario final que esta conversando no WhatsApp.
- Use APENAS para responder perguntas sobre saldo de tokens, plano/assinatura e campos do perfil.
- Nao invente informacoes. Se faltar algum dado, responda "N/A".
- Nao exponha UID/identificadores internos nas suas respostas.`,
    integrationJsonTitle: 'DADOS FINDMYANGEL (JSON):',
    extraMetaTitle: 'DADOS ADICIONAIS (JSON):',
    contactRulesTitle: 'REGRAS DE ENVIO DE CONTATO',
    contactRules: `- Voce pode enviar contato nativo do WhatsApp no formato vCard.
- Para enviar contato, adicione uma ou mais linhas NO FINAL da resposta, neste formato exato:
[ENVIAR_CONTATO:Nome|5511999999999]
- Use SOMENTE contatos que ja existam nos seus dados de treinamento (empresa, descricaoServicosProdutosVendidos, horarios, outros).
- Use numero internacional com DDI, apenas digitos.
- Evite enviar muitos contatos. Limite maximo: 3 contatos por resposta.`,
    filesRulesTitle: 'ARQUIVOS DISPONIVEIS (biblioteca do usuario)',
    filesRules: `- Voce pode enviar um ou mais arquivos cadastrados pelo usuario na pagina "Arquivos".
- Os arquivos podem ser imagens, videos, audios ou PDFs (documentos).
- Use o campo "quandoUsar" como gatilho estrito: envie SOMENTE se a situacao atual bater com esse texto.
- Para enviar arquivos, adicione a diretiva abaixo na POSICAO EXATA em que o arquivo deve ser enviado, sempre em uma linha isolada:
[ENVIAR_ARQUIVO:<id>]
- A ordem das diretivas define a ordem de envio entre as mensagens de texto.
- Use [SEPARAR] ou [SEPARATE] para dividir mensagens de texto quando quiser intercalar texto e arquivo.
- NUNCA invente ids. Use apenas ids da lista abaixo.
- Evite enviar muitos arquivos. Priorize os mais relevantes.`,
    filesListTitle: 'Lista de arquivos (JSON):'
  },
  en: {
    defaultCompanyName: 'AutoWhats',
    defaultAssistantName: 'Mia',
    defaultTone:
      'Be extremely friendly, empathetic, and focused on helping people. Use natural, informal, and warm language, like a real assistant.',
    defaultGuidance: `Follow the directives below, analyze the conversation history provided at the end of this prompt, plus the company data you represent, and reply in the best possible way to the latest incoming messages.

YOUR GOAL: Answer customer questions, share details about our services and pricing, schedule appointments when needed, and guide the conversation proactively.

GUIDELINES:
- Prioritize short messages, like a human would.
- Avoid multiple questions in one message. Ask at most 1-2 questions at a time.
- Ask qualification questions when needed to guide the conversation.
- Use the provided conversation history to understand context before replying.
- In the history, each message includes technical metadata (fromMe, origin, actor, channel) indicating sender and channel.
- Not every message with role "assistant" was written by AI; use origin/actor/channel to distinguish.
- Never invent information or go beyond what is explicitly allowed in the knowledge base. If unsure, answer 'N/A' so a human can take over.
- ALWAYS leave a blank line between different paragraphs.
- Use line breaks to separate topics or items.
- Use colons (:) before listing items.
- Use hyphens (-) or asterisks (*) for lists.
- Leave a blank line before and after lists.
- IMPORTANT: For bold text in WhatsApp, use ONE asterisk before and ONE after the text. Correct example: *exclusive attention.*
- NEVER use two consecutive asterisks for bold (e.g. **text**). The correct format is always *text*.
- NEVER copy technical lines that start with [MSG_TIME] into your reply. They are internal context only.
- SCHEDULING: Use scheduling tools ONLY for services that explicitly require booking in the knowledge base (for example tags like [Bookable] or text like "requires scheduling"). For physical/digital products or immediate delivery services that do not mention scheduling, DO NOT use scheduling tools; only provide sales and payment information. When scheduling is required: first use list_agendas (if needed), then use check_availability for the requested date, suggest slots from businessHours that are not occupied in appointments, and after the customer chooses, use create_appointment.
- IMPORTANT - Message splitting: When your answer is long or you want multiple short messages, use [SEPARAR] (or [SEPARATE]) to indicate split points. The system will send each part as a separate message with delays.`,
    timezoneLabel: 'Current Date and Time',
    timezoneConnector: 'at',
    identityPrompt:
      'You are {assistantName}, an agent from {companyName}. {presentationInstruction}',
    introduceAsAi:
      'IMPORTANT: You MUST introduce yourself as an AI assistant in this message. Be explicit and clear.',
    doNotIntroduceAsAi:
      'IMPORTANT: You MUST NOT introduce yourself as AI in this message. Act naturally, like a human assistant. You have already introduced yourself before.',
    actNatural: 'Act naturally, like a human assistant.',
    emojiEnabled: 'Use emojis occasionally to keep the conversation human and friendly.',
    emojiDisabled: 'Do not use emojis in your replies.',
    leadTagSectionTitle: 'Lead tag instructions:',
    leadTagCurrentLabel: 'Current lead tag',
    leadTagAtivaDefaultReply:
      'When tag is P. Ativa, treat the contact as a cold prospect: do not assume immediate intent, use short consultative messaging, build curiosity, and validate interest before pushing offer/closing.',
    leadTagAtivaDefaultFollowUp:
      'For follow-up with P. Ativa, restart the conversation gently and objectively, restore context without pressure, highlight practical value, and ask one simple re-engagement question.',
    dbSectionTitle: 'Use the following JSON as your knowledge base:',
    followUpTitle: 'Additional follow-up guidance:',
    followUpObjectiveTitle: 'Specific objective for this follow-up:',
    extraDataTitle: 'Additional data (JSON):',
    integrationTitle: 'FINDMYANGEL INTEGRATION',
    integrationDescription: `- This data comes from FindmyAngel and refers to the end user chatting on WhatsApp.
- Use it ONLY to answer questions about token balance, plan/subscription, and profile fields.
- Do not invent information. If data is missing, answer "N/A".
- Never expose internal UID/identifiers in your replies.`,
    integrationJsonTitle: 'FINDMYANGEL DATA (JSON):',
    extraMetaTitle: 'ADDITIONAL DATA (JSON):',
    contactRulesTitle: 'CONTACT SENDING RULES',
    contactRules: `- You can send native WhatsApp contacts in vCard format.
- To send a contact, append one or more lines at the END of your answer in this exact format:
[ENVIAR_CONTATO:Name|5511999999999]
- Use ONLY contacts that already exist in your training data (company, sold services/products description, hours, others).
- Use international number format with country code, digits only.
- Avoid sending too many contacts. Maximum: 3 contacts per response.`,
    filesRulesTitle: 'AVAILABLE FILES (user library)',
    filesRules: `- You can send one or more files previously registered by the user in the "Files" page.
- Files may be images, videos, audios, or PDFs (documents).
- Use the "quandoUsar" field as a strict trigger: send ONLY if the current scenario matches that text.
- To send files, place the directive below at the EXACT point where the file should be sent, always as a standalone line:
[ENVIAR_ARQUIVO:<id>]
- The directive order defines the send order between text messages.
- Use [SEPARAR] or [SEPARATE] to split text messages when you want to interleave text and files.
- NEVER invent ids. Use only ids from the list below.
- Avoid sending too many files. Prioritize the most relevant.`,
    filesListTitle: 'File list (JSON):'
  }
} as const

export const DEFAULT_ORIENTACOES_GERAIS = PROMPT_COPY['pt-BR'].defaultGuidance

export function buildLegacyPrompt(options: PromptBuildOptions): string {
  const training = options.training
  const fallbackPrompt = options.fallbackPrompt?.trim()
  const language = resolvePromptLanguage(training)
  const copy = PROMPT_COPY[language]

  const meta = isRecord(options.meta) ? options.meta : null
  const findmyangel = meta && isRecord(meta.findmyangel) ? meta.findmyangel : null

  let integrationSection = ''
  if (findmyangel) {
    integrationSection = `\n\n${copy.integrationTitle}:\n${copy.integrationDescription}\n\n${copy.integrationJsonTitle}\n\n${JSON.stringify(findmyangel, null, 2)}`
  } else if (meta && Object.keys(meta).length > 0) {
    integrationSection = `\n\n${copy.extraMetaTitle}\n\n${JSON.stringify(meta, null, 2)}`
  }

  if (!training && fallbackPrompt) {
    return integrationSection ? `${fallbackPrompt}${integrationSection}` : fallbackPrompt
  }

  const nomeIA = cleanText(training?.nomeIA) || copy.defaultAssistantName
  const nomeEmpresa = cleanText(training?.nomeEmpresa) || copy.defaultCompanyName
  const seApresentarComoIA = training?.seApresentarComoIA !== false
  const usarEmojis = training?.usarEmojis !== false
  const tipoResposta = cleanText(training?.tipoResposta) || copy.defaultTone
  const orientacoesGerais = cleanText(training?.orientacoesGerais) || copy.defaultGuidance
  const shouldIntroduce = Boolean(seApresentarComoIA && options.shouldIntroduce)
  const now = options.now ?? new Date()
  const timezone = options.timezone || 'America/Sao_Paulo'
  const leadTag = normalizeLeadTag(options.leadTag)
  const includeLeadTagInstruction = options.includeLeadTagInstruction !== false

  let apresentacaoInstrucao: string = copy.actNatural
  if (seApresentarComoIA) {
    apresentacaoInstrucao = shouldIntroduce ? copy.introduceAsAi : copy.doNotIntroduceAsAi
  }

  const currentDateStr = formatDateTime(now, timezone, language)
  const identityPrompt = `${copy.identityPrompt
    .replace('{assistantName}', nomeIA)
    .replace('{companyName}', nomeEmpresa)
    .replace('{presentationInstruction}', apresentacaoInstrucao)}

${copy.timezoneLabel}: ${currentDateStr}

${tipoResposta}

${usarEmojis ? copy.emojiEnabled : copy.emojiDisabled}`
  const leadTagInstruction = includeLeadTagInstruction
    ? resolveLeadTagInstruction({
        training,
        leadTag,
        mode: 'reply',
        language
      })
    : ''
  const leadTagSection = buildLeadTagSection(copy, leadTag, leadTagInstruction)

  const baseDados = {
    empresa: training?.empresa ?? '',
    descricaoServicosProdutosVendidos: training?.descricaoServicosProdutosVendidos ?? '',
    horarios: training?.horarios ?? '',
    outros: training?.outros ?? ''
  }

  const instrucoesIAJson = JSON.stringify(baseDados, null, 2)
  const files = Array.isArray(options.files) ? options.files : []

  let filesSection = ''
  if (training?.permitirIAEnviarArquivos === true) {
    const safeFiles = files
      .slice(0, 25)
      .map((file) => ({
        id: file.id,
        nome: file.nome,
        descricao: file.descricao ?? '',
        quandoUsar: file.quandoUsar ?? '',
        tipo: file.tipo ?? ''
      }))
      .filter((file) => Boolean(file.id && file.nome))

    filesSection = `\n\n${copy.contactRulesTitle}:\n${copy.contactRules}`
    if (safeFiles.length > 0) {
      filesSection += `\n\n${copy.filesRulesTitle}:\n${copy.filesRules}\n\n${copy.filesListTitle}\n\n${JSON.stringify(
        safeFiles,
        null,
        2
      )}`
    }
  }

  return `${identityPrompt}

${orientacoesGerais}${leadTagSection ? `\n\n${leadTagSection}` : ''}

${copy.dbSectionTitle}

${instrucoesIAJson}${filesSection}${integrationSection}`
}

export function buildFollowUpPrompt(
  options: PromptBuildOptions & { followUpMeta?: Record<string, unknown> }
): string {
  const base = buildLegacyPrompt({
    ...options,
    includeLeadTagInstruction: false
  })
  const language = resolvePromptLanguage(options.training)
  const copy = PROMPT_COPY[language]
  const shouldIncludeFollowUpGuidance = isFollowUpGuidanceEnabled(options.training)
  const orientacoesFollowUp = shouldIncludeFollowUpGuidance
    ? cleanText(options.training?.orientacoesFollowUp)
    : ''
  const objectivePrompt = cleanText(options.objectivePrompt)
  const meta = options.followUpMeta
  const leadTag = normalizeLeadTag(options.leadTag)
  const leadTagInstruction = shouldIncludeFollowUpGuidance
    ? resolveLeadTagInstruction({
        training: options.training,
        leadTag,
        mode: 'followup',
        language
      })
    : ''

  let result = base
  const leadTagSection = buildLeadTagSection(copy, leadTag, leadTagInstruction)
  if (leadTagSection) {
    result += `\n\n${leadTagSection}`
  }
  if (orientacoesFollowUp) {
    result += `\n\n${copy.followUpTitle}\n\n${orientacoesFollowUp}`
  }

  if (objectivePrompt) {
    result += `\n\n${copy.followUpObjectiveTitle}\n\n${objectivePrompt}`
  }

  if (meta && Object.keys(meta).length > 0) {
    result += `\n\n${copy.extraDataTitle}\n\n${JSON.stringify(meta, null, 2)}`
  }

  return result
}

function resolvePromptLanguage(training?: AiTrainingData): PromptLanguage {
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

function cleanText(value?: string) {
  if (!value) {
    return ''
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function isFollowUpGuidanceEnabled(training?: AiTrainingData): boolean {
  if (!training) {
    return false
  }

  if (cleanText(training.orientacoesFollowUp)) {
    return true
  }

  if (training.followUpAutomatico?.enabled === true) {
    return true
  }

  const legacy = (training as AiTrainingData & { followUpAutomatic?: { enabled?: boolean } }).followUpAutomatic
  return legacy?.enabled === true
}

type LeadTag = 'P. Ativa' | 'P. Passiva'

function normalizeLeadTag(value: unknown): LeadTag | null {
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

function resolveLeadTagInstruction(input: {
  training?: AiTrainingData
  leadTag: LeadTag | null
  mode: 'reply' | 'followup'
  language: PromptLanguage
}): string {
  const { training, leadTag, mode, language } = input
  if (!leadTag) {
    return ''
  }

  const copy = PROMPT_COPY[language]
  const customInstruction =
    mode === 'followup'
      ? leadTag === 'P. Ativa'
        ? cleanText(training?.instrucoesFollowUpTagAtiva)
        : cleanText(training?.instrucoesFollowUpTagPassiva)
      : leadTag === 'P. Ativa'
        ? cleanText(training?.instrucoesLeadsTagAtiva)
        : cleanText(training?.instrucoesLeadsTagPassiva)

  if (customInstruction) {
    return customInstruction
  }

  if (leadTag === 'P. Ativa') {
    return mode === 'followup' ? copy.leadTagAtivaDefaultFollowUp : copy.leadTagAtivaDefaultReply
  }

  return ''
}

function buildLeadTagSection(
  copy: (typeof PROMPT_COPY)[PromptLanguage],
  leadTag: LeadTag | null,
  instruction: string
): string {
  if (!leadTag || !instruction) {
    return ''
  }
  return `${copy.leadTagSectionTitle}\n${copy.leadTagCurrentLabel}: ${leadTag}\n${instruction}`
}

function formatDateTime(date: Date, timeZone: string, language: PromptLanguage) {
  const locale = language === 'en' ? 'en-US' : 'pt-BR'
  const dayPart = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date)
  const timePart = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)

  const connector = language === 'en' ? 'at' : 'as'
  return `${dayPart} ${connector} ${timePart}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
