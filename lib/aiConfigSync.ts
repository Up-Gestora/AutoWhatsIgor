import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'

export type AiFollowUpAutomaticPayload = {
  enabled?: boolean
  allowClients?: boolean
}

type AiConfigSyncInput = {
  sessionId?: string
  responderGrupos?: boolean
  respondInGroups?: boolean
  enabled?: boolean
  onboardingSoftBlockOverrideConfirmed?: boolean
  contextMaxMessages?: number
  training?: AiTrainingPayload
  provider?: 'openai' | 'google'
  model?: string
}

export type AiTrainingPayload = {
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
  desligarIASeUltimasDuasMensagensNãoRecebidas?: boolean
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
  responderGrupos?: boolean
  esconderGrupos?: boolean
  comportamentoNaoSabe?: 'encaminhar' | 'silencio' | 'silêncio'
  comportamentoNãoSabe?: 'encaminhar' | 'silencio' | 'silêncio'
  mensagemEncaminharHumano?: string
  tipoResposta?: string
  orientacoesGerais?: string
  empresa?: string
  descricaoServicosProdutosVendidos?: string
  horarios?: string
  outros?: string
  followUpAutomatico?: AiFollowUpAutomaticPayload
}

export async function syncAiConfig(input: AiConfigSyncInput): Promise<void> {
  if (!auth?.currentUser) {
    throw new Error('auth_unavailable')
  }

  const token = await auth.currentUser.getIdToken()
  const normalizedTraining = input.training
    ? (() => {
        const comportamentoSource =
          input.training?.comportamentoNaoSabe ?? input.training?.comportamentoNãoSabe
        const comportamento =
          comportamentoSource === 'silêncio' ? 'silencio' : comportamentoSource
        const desligarDuasMensagens =
          input.training?.desligarIASeUltimasDuasMensagensNaoRecebidas ??
          input.training?.desligarIASeUltimasDuasMensagensNãoRecebidas

        const rest: AiTrainingPayload = { ...input.training }
        delete rest.comportamentoNãoSabe
        delete rest.desligarIASeUltimasDuasMensagensNãoRecebidas

        return {
          ...rest,
          ...(typeof comportamento === 'string'
            ? { comportamentoNaoSabe: comportamento }
            : {}),
          ...(typeof desligarDuasMensagens === 'boolean'
            ? { desligarIASeUltimasDuasMensagensNaoRecebidas: desligarDuasMensagens }
            : {})
        }
      })()
    : undefined

  const normalizedInput: AiConfigSyncInput = {
    ...input,
    training: normalizedTraining
  }

  const response = await fetch('/api/ai-config', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(normalizedInput)
  })

  if (!response.ok) {
    const { payload, rawText } = await parseResponsePayload<Record<string, unknown>>(response)
    const message = buildHttpErrorMessage(response.status, payload, rawText)
    throw new Error(message)
  }
}
