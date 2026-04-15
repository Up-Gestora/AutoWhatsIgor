'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/providers/auth-provider'
import { auth, db } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { syncAiConfig } from '@/lib/aiConfigSync'
import { cn } from '@/lib/utils'
import {
  applyTrainingPatch,
  DEFAULT_TRAINING_INSTRUCTIONS,
  normalizeTrainingSnapshot,
  sanitizeTrainingPatch,
  type TrainingPatch,
  type TrainingSnapshot
} from '@/lib/training/schema'
import { createTrainingVersion, pruneTrainingVersions } from '@/lib/training/versioning'

type CreditBalance = {
  balanceBrl: number
  blockedAt: number | null
  blockedReason: string | null
  updatedAt: number
}

type CopilotMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAtMs: number
}

type CopilotProposal = {
  id: string
  summary: string
  rationale?: string | null
  patch: TrainingPatch
  createdAtMs: number
}

type CopilotSessionData = {
  messages: CopilotMessage[]
  pendingProposal: CopilotProposal | null
  credits: CreditBalance | null
}

const MAX_VERSIONS = 50

const labelByKeyPt: Record<string, string> = {
  nomeEmpresa: 'Nome da Empresa',
  nomeIA: 'Nome da IA',
  seApresentarComoIA: 'Se apresentar como IA',
  comportamentoNãoSabe: 'Quando não souber responder',
  mensagemEncaminharHumano: 'Mensagem ao encaminhar',
  permitirIATextoPersonalizadoAoEncaminharHumano: 'Permitir handoff personalizado por IA',
  tipoResposta: 'Tipo de resposta',
  usarEmojis: 'Usar emojis',
  usarAgendaAutomatica: 'Usar agenda automatica',
  orientacoesFollowUp: 'Orientacoes de follow-up',
  desligarMensagemForaContexto: 'Desligar mensagem fora de contexto',
  desligarIASeUltimasDuasMensagensNãoRecebidas:
    'Desligar IA se últimas 2 mensagens não recebidas',
  desligarIASeHumanoRecente: 'Desligar IA se humano mandou mensagem recentemente',
  desligarIASeHumanoRecenteUsarDias: 'Considerar janela de dias',
  desligarIASeHumanoRecenteUsarMensagens: 'Considerar últimas mensagens',
  desligarIASeHumanoRecenteDias: 'Janela de dias',
  desligarIASeHumanoRecenteMensagens: 'Últimas mensagens',
  responderClientes: 'Responder clientes',
  autoClassificarLeadComoCliente: 'Classificar lead como cliente',
  permitirSugestoesCamposLeadsClientes: 'Permitir sugestões em leads/clientes',
  aprovarAutomaticamenteSugestoesLeadsClientes: 'Aprovar sugestões automaticamente',
  permitirIAEnviarArquivos: 'Permitir IA enviar arquivos/contatos',
  permitirIAOuvirAudios: 'Permitir IA ouvir audios',
  permitirIALerImagensEPdfs: 'Permitir IA ler imagens/PDFs',
  responderGrupos: 'Responder grupos',
  esconderGrupos: 'Esconder grupos',
  orientacoesGerais: 'Orientacoes gerais',
  empresa: 'Descricao da empresa',
  descricaoServicosProdutosVendidos: 'Descrição comercial',
  horarios: 'Horarios',
  outros: 'Outras informações',
  followUpAutomatico: 'Follow-up automático'
}

const labelByKeyEn: Record<string, string> = {
  nomeEmpresa: 'Company name',
  nomeIA: 'AI name',
  seApresentarComoIA: 'Introduce as AI',
  comportamentoNãoSabe: 'When AI does not know the answer',
  mensagemEncaminharHumano: 'Handoff message',
  permitirIATextoPersonalizadoAoEncaminharHumano: 'Allow AI-personalized handoff',
  tipoResposta: 'Response style',
  usarEmojis: 'Use emojis',
  usarAgendaAutomatica: 'Use automatic scheduling',
  orientacoesFollowUp: 'Follow-up guidance',
  desligarMensagemForaContexto: 'Disable out-of-context message',
  desligarIASeUltimasDuasMensagensNãoRecebidas:
    'Disable AI if last 2 sent messages were not received',
  desligarIASeHumanoRecente: 'Disable AI if a human sent a message recently',
  desligarIASeHumanoRecenteUsarDias: 'Use day window',
  desligarIASeHumanoRecenteUsarMensagens: 'Use latest messages',
  desligarIASeHumanoRecenteDias: 'Day window',
  desligarIASeHumanoRecenteMensagens: 'Latest messages',
  responderClientes: 'Reply to clients',
  autoClassificarLeadComoCliente: 'Classify lead as client',
  permitirSugestoesCamposLeadsClientes: 'Allow lead/client field suggestions',
  aprovarAutomaticamenteSugestoesLeadsClientes: 'Auto-approve suggestions',
  permitirIAEnviarArquivos: 'Allow AI to send files/contacts',
  permitirIAOuvirAudios: 'Allow AI to process audio',
  permitirIALerImagensEPdfs: 'Allow AI to read images/PDFs',
  responderGrupos: 'Reply in groups',
  orientacoesGerais: 'General guidance',
  empresa: 'Company description',
  descricaoServicosProdutosVendidos: 'Commercial description',
  horarios: 'Business hours',
  outros: 'Other information',
  followUpAutomatico: 'Automatic follow-up'
}

function formatDateTime(value: number, locale: 'pt-BR' | 'en' = 'pt-BR'): string {
  try {
    return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')
  } catch {
    return String(value)
  }
}

function formatBrl(value: number, locale: 'pt-BR' | 'en' = 'pt-BR'): string {
  try {
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  } catch {
    return `R$ ${value.toFixed(2)}`
  }
}

function formatPatchValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '-'
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '[object]'
    }
  }
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseSessionPayload(payload: unknown, locale: 'pt-BR' | 'en' = 'pt-BR'): CopilotSessionData {
  const root = isRecord(payload) ? payload : {}
  const rawMessages = Array.isArray(root.messages) ? root.messages : []
  const messages = rawMessages
    .map((entry): CopilotMessage | null => {
      if (!isRecord(entry)) {
        return null
      }

      const id = typeof entry.id === 'string' ? entry.id : ''
      const content = typeof entry.content === 'string' ? entry.content : ''
      if (!id || !content.trim()) {
        return null
      }

      return {
        id,
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content,
        createdAtMs: typeof entry.createdAtMs === 'number' ? entry.createdAtMs : Date.now()
      }
    })
    .filter((entry): entry is CopilotMessage => entry !== null)

  const pendingProposalRaw = root.pendingProposal
  const pendingProposal: CopilotProposal | null =
    isRecord(pendingProposalRaw)
      ? {
          id: String(pendingProposalRaw.id ?? ''),
          summary:
            typeof pendingProposalRaw.summary === 'string'
              ? pendingProposalRaw.summary
              : locale === 'en'
                ? 'Training update suggestion'
                : 'Sugestão de ajustes',
          rationale:
            typeof pendingProposalRaw.rationale === 'string' ? pendingProposalRaw.rationale : null,
          patch: sanitizeTrainingPatch(pendingProposalRaw.patch),
          createdAtMs:
            typeof pendingProposalRaw.createdAtMs === 'number'
              ? pendingProposalRaw.createdAtMs
              : Date.now()
        }
      : null

  const creditsRaw = root.credits
  const credits: CreditBalance | null =
    isRecord(creditsRaw)
      ? {
          balanceBrl:
            typeof creditsRaw.balanceBrl === 'number' && Number.isFinite(creditsRaw.balanceBrl)
              ? creditsRaw.balanceBrl
              : 0,
          blockedAt: typeof creditsRaw.blockedAt === 'number' ? creditsRaw.blockedAt : null,
          blockedReason:
            typeof creditsRaw.blockedReason === 'string' ? creditsRaw.blockedReason : null,
          updatedAt: typeof creditsRaw.updatedAt === 'number' ? creditsRaw.updatedAt : Date.now()
        }
      : null

  return {
    messages,
    pendingProposal: pendingProposal?.id ? pendingProposal : null,
    credits
  }
}

export function TrainingCopilotPanel() {
  const { user } = useAuth()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const labelByKey = isEn ? labelByKeyEn : labelByKeyPt
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | 'reset' | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [session, setSession] = useState<CopilotSessionData>({ messages: [], pendingProposal: null, credits: null })
  const [trainingSnapshot, setTrainingSnapshot] = useState<TrainingSnapshot>(
    normalizeTrainingSnapshot({
      model: 'google',
      instructions: {
        ...DEFAULT_TRAINING_INSTRUCTIONS,
        language: locale
      },
      contextMaxMessages: 20
    })
  )

  const fetchWithAuth = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!auth?.currentUser) {
        throw new Error('auth_unavailable')
      }

      const token = await auth.currentUser.getIdToken()
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          authorization: `Bearer ${token}`
        }
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          payload?.message && typeof payload.message === 'string'
            ? payload.message
            : payload?.error && typeof payload.error === 'string'
              ? payload.error
              : `request_failed_${response.status}`
        throw new Error(message)
      }

      return payload as T
    },
    []
  )

  const loadTrainingSnapshot = useCallback(async () => {
    if (!user?.uid || !db) {
      return normalizeTrainingSnapshot({
        model: 'google',
        instructions: {
          ...DEFAULT_TRAINING_INSTRUCTIONS,
          language: locale
        },
        contextMaxMessages: 20
      })
    }

    const ref = doc(db, 'users', user.uid, 'settings', 'ai_training')
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      return normalizeTrainingSnapshot({
        model: 'google',
        instructions: {
          ...DEFAULT_TRAINING_INSTRUCTIONS,
          language: locale
        },
        contextMaxMessages: 20
      })
    }

    const data = snap.data()
    return normalizeTrainingSnapshot({
      model: data.model,
      instructions: data.instructions,
      contextMaxMessages: data.contextMaxMessages
    })
  }, [locale, user?.uid])

  const loadSession = useCallback(async () => {
    const payload = await fetchWithAuth<any>('/api/training-copilot/session')
    setSession(parseSessionPayload(payload, locale))
  }, [fetchWithAuth, locale])

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const [snapshot] = await Promise.all([loadTrainingSnapshot(), loadSession()])
        if (!cancelled) {
          setTrainingSnapshot(snapshot)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tr('Erro ao carregar assistente', 'Failed to load assistant'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [loadSession, loadTrainingSnapshot, tr, user?.uid])

  const creditsBlocked = useMemo(() => {
    const credits = session.credits
    if (!credits) {
      return false
    }
    return credits.balanceBrl <= 0 || Boolean(credits.blockedAt)
  }, [session.credits])

  const sendMessage = useCallback(async () => {
    const message = draft.trim()
    if (!message) {
      return
    }

    setSending(true)
    setError(null)
    setNotice(null)
    try {
      const payload = await fetchWithAuth<any>('/api/training-copilot/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          currentTraining: trainingSnapshot
        })
      })
      setSession(parseSessionPayload(payload, locale))
      setDraft('')
    } catch (err: any) {
      const message = err instanceof Error ? err.message : tr('Erro ao enviar mensagem', 'Failed to send message')
      setError(message)
    } finally {
      setSending(false)
    }
  }, [draft, fetchWithAuth, locale, trainingSnapshot, tr])

  const handleReset = useCallback(async () => {
    setActionLoading('reset')
    setError(null)
    setNotice(null)
    try {
      const payload = await fetchWithAuth<any>('/api/training-copilot/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reset: true })
      })
      setSession(parseSessionPayload(payload, locale))
      setNotice(tr('Nova conversa iniciada.', 'New conversation started.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Erro ao iniciar nova conversa', 'Failed to start a new conversation'))
    } finally {
      setActionLoading(null)
    }
  }, [fetchWithAuth, locale, tr])

  const handleRejectProposal = useCallback(async () => {
    const proposal = session.pendingProposal
    if (!proposal) {
      return
    }

    setActionLoading('reject')
    setError(null)
    setNotice(null)
    try {
      const payload = await fetchWithAuth<any>(
        `/api/training-copilot/proposals/${encodeURIComponent(proposal.id)}/reject`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        }
      )
      setSession((prev) => ({ ...prev, ...parseSessionPayload(payload, locale) }))
      setNotice(tr('Proposta rejeitada.', 'Proposal rejected.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Erro ao rejeitar proposta', 'Failed to reject proposal'))
    } finally {
      setActionLoading(null)
    }
  }, [fetchWithAuth, locale, session.pendingProposal, tr])

  const handleApproveProposal = useCallback(async () => {
    const proposal = session.pendingProposal
    if (!proposal || !user?.uid || !db) {
      return
    }

    setActionLoading('approve')
    setError(null)
    setNotice(null)
    try {
      const nextSnapshot = applyTrainingPatch(trainingSnapshot, proposal.patch)
      const instructions = nextSnapshot.instructions

      const docRef = doc(db, 'users', user.uid, 'settings', 'ai_training')
      await setDoc(
        docRef,
        {
          model: nextSnapshot.model,
          instructions,
          contextMaxMessages: nextSnapshot.contextMaxMessages,
          updatedAt: serverTimestamp()
        },
        { mergeFields: ['model', 'instructions', 'contextMaxMessages', 'updatedAt'] }
      )

      await syncAiConfig({
        responderGrupos: instructions.esconderGrupos ? false : instructions.responderGrupos,
        training: {
          language: instructions.language || locale,
          nomeEmpresa: instructions.nomeEmpresa,
          nomeIA: instructions.nomeIA,
          seApresentarComoIA: instructions.seApresentarComoIA,
          permitirIATextoPersonalizadoAoEncaminharHumano:
            instructions.permitirIATextoPersonalizadoAoEncaminharHumano,
          usarEmojis: instructions.usarEmojis,
          usarAgendaAutomatica: instructions.usarAgendaAutomatica,
          orientacoesFollowUp: instructions.orientacoesFollowUp,
          desligarMensagemForaContexto: instructions.desligarMensagemForaContexto,
          desligarIASeUltimasDuasMensagensNãoRecebidas:
            instructions.desligarIASeUltimasDuasMensagensNãoRecebidas,
          responderClientes: instructions.responderClientes,
          autoClassificarLeadComoCliente: instructions.autoClassificarLeadComoCliente,
          permitirSugestoesCamposLeadsClientes: instructions.permitirSugestoesCamposLeadsClientes,
          aprovarAutomaticamenteSugestoesLeadsClientes:
            instructions.aprovarAutomaticamenteSugestoesLeadsClientes,
          permitirIAEnviarArquivos: instructions.permitirIAEnviarArquivos,
          permitirIAOuvirAudios: instructions.permitirIAOuvirAudios,
          permitirIALerImagensEPdfs: instructions.permitirIALerImagensEPdfs,
          responderGrupos: instructions.responderGrupos,
          esconderGrupos: instructions.esconderGrupos,
          comportamentoNãoSabe: instructions.comportamentoNãoSabe,
          mensagemEncaminharHumano: instructions.mensagemEncaminharHumano,
          tipoResposta: instructions.tipoResposta,
          orientacoesGerais: instructions.orientacoesGerais,
          empresa: instructions.empresa,
          descricaoServicosProdutosVendidos: instructions.descricaoServicosProdutosVendidos,
          horarios: instructions.horarios,
          outros: instructions.outros,
          followUpAutomatico: instructions.followUpAutomatico
        },
        provider: nextSnapshot.model === 'google' ? 'google' : 'openai',
        model: nextSnapshot.model === 'google' ? 'gemini-3-flash-preview' : 'gpt-5.2',
        contextMaxMessages: nextSnapshot.contextMaxMessages
      })

      await createTrainingVersion(
        db,
        user.uid,
        {
          model: nextSnapshot.model,
          instructions: nextSnapshot.instructions,
          contextMaxMessages: nextSnapshot.contextMaxMessages
        },
        {
          reason: 'manual',
          meta: {
            source: 'training_copilot',
            proposalId: proposal.id
          }
        }
      )
      await pruneTrainingVersions(db, user.uid, MAX_VERSIONS)

      await fetchWithAuth<any>(
        `/api/training-copilot/proposals/${encodeURIComponent(proposal.id)}/accept`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        }
      )

      setTrainingSnapshot(nextSnapshot)
      await loadSession()
      setNotice(tr('Mudancas aprovadas e aplicadas no treinamento.', 'Changes approved and applied to training.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Erro ao aprovar proposta', 'Failed to approve proposal'))
    } finally {
      setActionLoading(null)
    }
  }, [fetchWithAuth, loadSession, locale, session.pendingProposal, trainingSnapshot, tr, user?.uid])

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-3 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        {tr('Carregando assistente...', 'Loading assistant...')}
      </div>
    )
  }

  const orderedPatchEntries = Object.entries(session.pendingProposal?.patch ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-surface-lighter bg-surface-light p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Sparkles className="h-6 w-6 text-primary" />
            {tr('Treinar com IA', 'Train with AI')}
          </h1>
          <p className="text-sm text-gray-400">
            {tr(
              'Converse com a IA para ajustar textos e toggles do treinamento da sua empresa.',
              'Talk to AI to adjust text and toggles in your company training.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void handleReset()}
            disabled={actionLoading !== null || sending}
            className="bg-surface border-surface-lighter"
          >
            {actionLoading === 'reset' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {tr('Nova conversa', 'New conversation')}
          </Button>
          <Link
            href={toRoute('training')}
            className={cn(buttonVariants({ variant: 'outline' }), 'bg-surface border-surface-lighter')}
          >
            {tr('Voltar ao treinamento', 'Back to training')}
          </Link>
        </div>
      </div>

      {session.credits && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            creditsBlocked
              ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100'
              : 'border-surface-lighter bg-surface text-gray-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{tr('Saldo de créditos', 'Credit balance')}: {formatBrl(session.credits.balanceBrl ?? 0, locale)}</span>
            {creditsBlocked && (
              <Link
                href={toRoute('settings', { query: { tab: 'assinatura_creditos' } })}
                className="text-xs font-semibold text-yellow-200 underline"
              >
                {tr('Recarregar créditos', 'Top up credits')}
              </Link>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {session.pendingProposal && (
        <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">{tr('Proposta de mudancas pendente', 'Pending change proposal')}</h2>
            <p className="text-sm text-gray-400">{session.pendingProposal.summary}</p>
            {session.pendingProposal.rationale && (
              <p className="text-xs text-gray-500">{session.pendingProposal.rationale}</p>
            )}
            <p className="text-xs text-gray-500">
              {tr('Gerada em', 'Generated at')} {formatDateTime(session.pendingProposal.createdAtMs, locale)}
            </p>
          </div>

          <div className="space-y-3">
            {orderedPatchEntries.length === 0 ? (
              <p className="text-sm text-gray-500">{tr('Sem campos no patch.', 'No fields in patch.')}</p>
            ) : (
              orderedPatchEntries.map(([key, value]) => {
                const before = (trainingSnapshot.instructions as Record<string, unknown>)[key]
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-surface-lighter bg-surface p-3 text-sm"
                  >
                    <p className="font-semibold text-white">{labelByKey[key] ?? key}</p>
                    <p className="text-xs text-gray-500">{tr('Before', 'Before')}: {formatPatchValue(before)}</p>
                    <p className="text-xs text-primary">{tr('After', 'After')}: {formatPatchValue(value)}</p>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleApproveProposal()} disabled={actionLoading !== null || sending}>
              {actionLoading === 'approve' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {tr('Aprovar mudancas', 'Approve changes')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleRejectProposal()}
              disabled={actionLoading !== null || sending}
              className="bg-surface border-surface-lighter"
            >
              {actionLoading === 'reject' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {tr('Rejeitar mudancas', 'Reject changes')}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <div className="mb-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {session.messages.length === 0 ? (
            <p className="text-sm text-gray-500">
              {tr(
                'Comece contando como você quer que o AutoWhats funcione na sua empresa.',
                'Start by explaining how you want AutoWhats to work in your company.'
              )}
            </p>
          ) : (
            session.messages.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl p-3 text-sm ${
                  item.role === 'user'
                    ? 'ml-8 border border-primary/30 bg-primary/10 text-gray-100'
                    : 'mr-8 border border-surface-lighter bg-surface text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{item.content}</p>
                <p className="mt-2 text-[10px] text-gray-500">{formatDateTime(item.createdAtMs, locale)}</p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400">{tr('Mensagem para o assistente', 'Message for the assistant')}</label>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={tr('Descreva como a IA deve atender seus clientes...', 'Describe how AI should assist your clients...')}
            className="min-h-[110px]"
            disabled={sending || creditsBlocked}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => void sendMessage()}
              disabled={sending || creditsBlocked || !draft.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {tr('Enviar', 'Send')}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-surface-lighter bg-surface p-3 text-xs text-gray-500">
        {tr(
          'A conversa continua disponível para ajustes e novas sugestões. Você pode aprovar ou rejeitar cada pacote sugerido.',
          'The conversation remains available for adjustments and new suggestions. You can approve or reject each suggested package.'
        )}
      </div>
    </div>
  )
}
