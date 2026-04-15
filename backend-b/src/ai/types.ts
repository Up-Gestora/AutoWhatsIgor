export type AiProvider = 'openai' | 'google'

export type AiFallbackMode = 'reply' | 'silence'

export type AiTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type AiPricingModel = {
  inputUsdPerM: number
  outputUsdPerM: number
}

export type AiPricing = {
  models: Record<string, AiPricingModel>
}

export type AiBusinessHours = {
  timezone: string
  days: Record<string, Array<[string, string]>>
}

export type AiFollowUpAutomaticConfig = {
  enabled?: boolean
  allowClients?: boolean
}

export type AiTrainingData = {
  language?: 'pt-BR' | 'en'
  nomeEmpresa?: string
  nomeIA?: string
  seApresentarComoIA?: boolean
  permitirIATextoPersonalizadoAoEncaminharHumano?: boolean
  usarEmojis?: boolean
  usarAgendaAutomatica?: boolean
  orientacoesFollowUp?: string
  instrucoesLeadsTagPassiva?: string
  instrucoesLeadsTagAtiva?: string
  instrucoesFollowUpTagPassiva?: string
  instrucoesFollowUpTagAtiva?: string
  desligarMensagemForaContexto?: boolean
  desligarIASeUltimasDuasMensagensNaoRecebidas?: boolean
  desligarIASeHumanoRecente?: boolean
  desligarIASeHumanoRecenteUsarDias?: boolean
  desligarIASeHumanoRecenteUsarMensagens?: boolean
  desligarIASeHumanoRecenteDias?: number
  desligarIASeHumanoRecenteMensagens?: number
  responderClientes?: boolean
  autoClassificarLeadComoCliente?: boolean
  permitirSugestoesCamposLeadsClientes?: boolean
  aprovarAutomaticamenteSugestoesLeadsClientes?: boolean
  instrucoesSugestoesLeadsClientes?: string
  permitirIAEnviarArquivos?: boolean
  permitirIAOuvirAudios?: boolean
  permitirIALerImagensEPdfs?: boolean
  esconderGrupos?: boolean
  comportamentoNaoSabe?: 'encaminhar' | 'silencio'
  mensagemEncaminharHumano?: string
  tipoResposta?: string
  orientacoesGerais?: string
  empresa?: string
  descricaoServicosProdutosVendidos?: string
  horarios?: string
  outros?: string
  followUpAutomatico?: AiFollowUpAutomaticConfig
}

export type AiConfig = {
  enabled: boolean
  respondInGroups: boolean
  provider: AiProvider
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  fallbackMode: AiFallbackMode
  fallbackText: string
  optOutKeywords: string[]
  optInKeywords: string[]
  contextMaxMessages: number
  contextTtlSec: number
  processingTimeoutMs: number
  businessHours?: AiBusinessHours
  training?: AiTrainingData
}

export type AiConfigOverride = Partial<AiConfig> & {
  responderGrupos?: boolean
}

export type AiContextMessage = {
  role: 'user' | 'assistant'
  text: string
  timestampMs: number
  messageId?: string | null
  status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'retrying' | 'failed' | null
  fromMe?: boolean | null
  origin?: 'ai' | 'human_dashboard' | 'automation_api' | 'human_external' | 'inbound' | 'legacy_manual' | null
}
