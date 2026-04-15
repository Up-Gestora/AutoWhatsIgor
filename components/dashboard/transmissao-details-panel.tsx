'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/client'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { cn } from '@/lib/utils'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, PauseCircle, Play, XCircle } from 'lucide-react'

type BroadcastJobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'

type BroadcastJob = {
  id: string
  sessionId: string
  listId: string
  status: BroadcastJobStatus
  pauseReason: string | null
  payload: any
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: number | null
  updatedAt: number | null
  startedAt: number | null
  completedAt: number | null
  nextSendAt: number | null
}

type BroadcastFailure = {
  id: number
  contactName: string | null
  whatsapp: string
  error: string | null
}

const AUTO_REMOVED_LAST_MESSAGE_UNDELIVERED_PREFIX = 'auto_removed_last_message_undelivered'

function formatDateTime(ms: number | null, locale: 'pt-BR' | 'en') {
  if (!ms) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms))
  } catch {
    return '—'
  }
}

function statusLabel(status: BroadcastJobStatus, tr: (pt: string, en: string) => string) {
  if (status === 'running') return tr('Rodando', 'Running')
  if (status === 'paused') return tr('Pausado', 'Paused')
  if (status === 'completed') return tr('Concluído', 'Completed')
  if (status === 'cancelled') return tr('Cancelado', 'Canceled')
  return tr('Falhou', 'Failed')
}

function statusBadgeClass(status: BroadcastJobStatus) {
  if (status === 'running') return 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  if (status === 'paused') return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
  if (status === 'completed') return 'bg-green-500/15 text-green-300 border-green-500/30'
  if (status === 'cancelled') return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
  return 'bg-red-500/15 text-red-300 border-red-500/30'
}

function humanizeActionError(raw: string, tr: (pt: string, en: string) => string) {
  if (raw === 'broadcast_job_active_exists') {
    return tr('Já existe outra transmissão ativa nesta sessão.', 'There is already another active broadcast in this session.')
  }
  if (raw === 'broadcast_job_not_found_or_not_running') {
    return tr('Esta transmissão não está rodando para pausar.', 'This broadcast is not running, so it cannot be paused.')
  }
  if (raw === 'broadcast_job_not_found_or_not_resumable') {
    return tr('Esta transmissão não pode ser retomada no estado atual.', 'This broadcast cannot be resumed in its current status.')
  }
  if (raw === 'broadcast_job_not_found_or_not_active') {
    return tr('Esta transmissão não pode ser cancelada no estado atual.', 'This broadcast cannot be canceled in its current status.')
  }
  return raw
}

function isAutoRemovedFailure(raw: string | null | undefined) {
  return typeof raw === 'string' && raw.startsWith(AUTO_REMOVED_LAST_MESSAGE_UNDELIVERED_PREFIX)
}

function humanizeFailureError(raw: string | null | undefined, tr: (pt: string, en: string) => string) {
  if (isAutoRemovedFailure(raw)) {
    return tr(
      'Contato removido automaticamente: última mensagem enviada não foi recebida.',
      'Contact automatically removed: last sent message was not received.'
    )
  }
  return raw || 'failed'
}

interface TransmissaoDetailsPanelProps {
  sessionId: string | null
  broadcastId: string
  backHref: string
}

export function TransmissaoDetailsPanel({
  sessionId,
  broadcastId,
  backHref
}: TransmissaoDetailsPanelProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const safeSessionId = sessionId?.trim() || null
  const safeBroadcastId = broadcastId.trim()

  const [job, setJob] = useState<BroadcastJob | null>(null)
  const [failures, setFailures] = useState<BroadcastFailure[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const refreshInFlightRef = useRef(false)

  useEffect(() => {
    setJob(null)
    setFailures([])
    setError(null)
    setInitialLoading(Boolean(safeSessionId && safeBroadcastId))
  }, [safeBroadcastId, safeSessionId])

  const buildSessionQuery = useCallback(
    (entries: Record<string, string | number | undefined>) => {
      const q = new URLSearchParams()
      if (safeSessionId) {
        q.set('sessionId', safeSessionId)
      }
      Object.entries(entries).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          q.set(k, String(v))
        }
      })
      const query = q.toString()
      return query ? `?${query}` : ''
    },
    [safeSessionId]
  )

  const fetchWithAuth = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!user) {
        throw new Error('auth_unavailable')
      }

      const token = await user.getIdToken()
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          authorization: `Bearer ${token}`
        }
      })

      const { payload, rawText } = await parseResponsePayload<T>(response)
      if (!response.ok) {
        const message = buildHttpErrorMessage(response.status, payload, rawText)
        throw new Error(message)
      }

      return (payload ?? ({} as T)) as T
    },
    [user]
  )

  const loadDetails = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (!user || !safeSessionId || !safeBroadcastId) return

    const isInitial = mode === 'initial'
    if (isInitial) {
      setInitialLoading(true)
    } else {
      if (refreshInFlightRef.current) {
        return
      }
      refreshInFlightRef.current = true
      setRefreshing(true)
    }

    try {
      const payload = await fetchWithAuth<{ job?: BroadcastJob; failures?: BroadcastFailure[] }>(
        `/api/broadcasts/${encodeURIComponent(safeBroadcastId)}${buildSessionQuery({})}`
      )
      setJob(payload.job ?? null)
      setFailures(Array.isArray(payload.failures) ? payload.failures : [])
      setError(null)
    } catch (error) {
      setError((error as Error).message)
      if (isInitial) {
        setJob(null)
        setFailures([])
      }
    } finally {
      if (isInitial) {
        setInitialLoading(false)
      } else {
        refreshInFlightRef.current = false
        setRefreshing(false)
      }
    }
  }, [buildSessionQuery, fetchWithAuth, safeBroadcastId, safeSessionId, user])

  useEffect(() => {
    void loadDetails('initial')
  }, [loadDetails])

  useEffect(() => {
    if (!job || job.status !== 'running') return
    const timer = setInterval(() => {
      void loadDetails('refresh')
    }, 2000)
    return () => clearInterval(timer)
  }, [job, loadDetails])

  const processed = useMemo(() => {
    if (!job) return 0
    return Math.max(0, job.sentCount + job.failedCount)
  }, [job])

  const percent = useMemo(() => {
    if (!job || job.totalCount <= 0) return 0
    return Math.round((processed / job.totalCount) * 100)
  }, [job, processed])

  const canResume = Boolean(job && (job.status === 'paused' || (job.status === 'cancelled' && processed < job.totalCount)))
  const canPause = job?.status === 'running'
  const canCancel = job?.status === 'running' || job?.status === 'paused'
  const primaryAction = canPause ? 'pause' : canResume ? 'resume' : null

  const handleResume = async () => {
    if (!user || !safeSessionId || !safeBroadcastId) return
    if (job?.status === 'cancelled') {
      const ok = window.confirm(
        tr(
          'Retomar esta transmissão cancelada? Somente contatos não tentados (itens cancelados) serão retomados; falhas não serão reenviadas.',
          'Resume this canceled broadcast? Only untouched contacts (canceled items) will resume; failed ones will not be retried.'
        )
      )
      if (!ok) return
    }
    setActing(true)
    setError(null)
    try {
      await fetchWithAuth(`/api/broadcasts/${encodeURIComponent(safeBroadcastId)}/resume${buildSessionQuery({})}`, {
        method: 'POST'
      })
      await loadDetails('refresh')
    } catch (error) {
      setError(humanizeActionError((error as Error).message, tr))
    } finally {
      setActing(false)
    }
  }

  const handlePause = async () => {
    if (!user || !safeSessionId || !safeBroadcastId) return
    setActing(true)
    setError(null)
    try {
      await fetchWithAuth(`/api/broadcasts/${encodeURIComponent(safeBroadcastId)}/pause${buildSessionQuery({})}`, {
        method: 'POST'
      })
      await loadDetails('refresh')
    } catch (error) {
      setError(humanizeActionError((error as Error).message, tr))
    } finally {
      setActing(false)
    }
  }

  const handleCancel = async () => {
    if (!user || !safeSessionId || !safeBroadcastId) return
    const ok = window.confirm(
      tr(
        'Cancelar esta transmissão? Itens pendentes serão marcados como cancelados.',
        'Cancel this broadcast? Pending items will be marked as canceled.'
      )
    )
    if (!ok) return
    setActing(true)
    setError(null)
    try {
      await fetchWithAuth(`/api/broadcasts/${encodeURIComponent(safeBroadcastId)}/cancel${buildSessionQuery({})}`, {
        method: 'POST'
      })
      await loadDetails('refresh')
    } catch (error) {
      setError(humanizeActionError((error as Error).message, tr))
    } finally {
      setActing(false)
    }
  }

  const payloadSummary = useMemo(() => {
    const payload = job?.payload
    if (!payload || typeof payload !== 'object') return null
    if (payload.type === 'text') {
      const text = typeof payload.text === 'string' ? payload.text.trim() : ''
      return text ? { label: tr('Texto', 'Text'), detail: text } : { label: tr('Texto', 'Text'), detail: '' }
    }
    if (payload.type === 'media') {
      const fileName = typeof payload.fileName === 'string' ? payload.fileName : ''
      const mediaType = typeof payload.mediaType === 'string' ? payload.mediaType : 'media'
      return { label: tr('Arquivo', 'File'), detail: fileName || mediaType }
    }
    return null
  }, [job, tr])

  const autoRemovedFailures = useMemo(
    () => failures.filter((failure) => isAutoRemovedFailure(failure.error)),
    [failures]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr('Voltar', 'Back')}
          </Button>
          <h1 className="text-xl font-bold text-white">{tr('Detalhes da transmissão', 'Broadcast details')}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDetails('refresh')}
            disabled={refreshing || acting || initialLoading}
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {tr('Atualizar', 'Refresh')}
          </Button>
          {primaryAction === 'pause' ? (
            <Button
              variant="outline"
              onClick={handlePause}
              disabled={!canPause || acting}
              size="sm"
              className="border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/10 hover:text-yellow-100"
            >
              <PauseCircle className="w-4 h-4 mr-2" />
              {tr('Pausar', 'Pause')}
            </Button>
          ) : null}
          {primaryAction === 'resume' ? (
            <Button onClick={handleResume} disabled={!canResume || acting} size="sm">
              <Play className="w-4 h-4 mr-2" />
              {tr('Retomar', 'Resume')}
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={!canCancel || acting}
            size="sm"
            className="border-red-500/50 text-red-200 hover:bg-red-500/10 hover:text-red-100"
          >
            <XCircle className="w-4 h-4 mr-2" />
            {tr('Cancelar', 'Cancel')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">{tr('Erro', 'Error')}</p>
            <p className="text-red-200/90 break-words">{error}</p>
          </div>
        </div>
      )}

      {initialLoading ? (
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 text-center text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          <p className="mt-3">{tr('Carregando...', 'Loading...')}</p>
        </div>
      ) : !job ? (
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 text-center text-gray-500">
          {tr('Transmissão não encontrada.', 'Broadcast not found.')}
        </div>
      ) : (
        <>
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-semibold px-2 py-1 rounded-full border', statusBadgeClass(job.status))}>
                    {statusLabel(job.status, tr)}
                  </span>
                  {job.pauseReason ? (
                    <span className="text-xs text-gray-400 truncate">{tr('Motivo', 'Reason')}: {job.pauseReason}</span>
                  ) : null}
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  {tr('Criado', 'Created')} {formatDateTime(job.createdAt, locale)} · {tr('Atualizado', 'Updated')} {formatDateTime(job.updatedAt, locale)}
                </p>
                {payloadSummary ? (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{payloadSummary.label}</p>
                    <p className="text-sm text-white whitespace-pre-wrap break-words">{payloadSummary.detail || '—'}</p>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label={tr('Total', 'Total')} value={job.totalCount} />
                <Stat label={tr('Enviadas', 'Sent')} value={job.sentCount} />
                <Stat label={tr('Falhas', 'Failures')} value={job.failedCount} />
                <Stat label={tr('Progresso', 'Progress')} value={`${percent}%`} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>
                  {processed}/{job.totalCount}
                </span>
                <span className="text-white font-semibold">{percent}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface overflow-hidden border border-surface-lighter">
                <div className="h-full bg-primary origin-left" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
              </div>
            </div>
          </div>

          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold">{tr('Falhas', 'Failures')}</h2>
              {failures.length > 0 ? (
                <span className="text-xs text-gray-400">{failures.length} {tr('contatos', 'contacts')}</span>
              ) : null}
            </div>

            {autoRemovedFailures.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3">
                <p className="text-sm font-semibold text-yellow-200">
                  {tr('Removidos automaticamente', 'Automatically removed')} ({autoRemovedFailures.length})
                </p>
                <p className="mt-1 text-xs text-yellow-200/90">
                  {tr(
                    'Contatos retirados da lista porque a última mensagem enviada não foi recebida.',
                    'Contacts removed from the list because the last sent message was not received.'
                  )}
                </p>
                <div className="mt-2 space-y-1">
                  {autoRemovedFailures.map((failure) => (
                    <p key={`auto-removed-${failure.id}`} className="text-xs text-yellow-100/90">
                      {(failure.contactName || tr('Sem nome', 'No name'))} · {failure.whatsapp}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {failures.length === 0 ? (
              <div className="mt-4 text-sm text-gray-500 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-300" />
                {tr('Nenhuma falha registrada.', 'No failures logged.')}
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {failures.map((failure) => (
                  <div
                    key={failure.id}
                    className="border border-surface-lighter rounded-2xl p-3 bg-surface"
                  >
                    <p className="text-white font-semibold truncate">
                      {failure.contactName || tr('Sem nome', 'No name')} ·{' '}
                      <span className="text-gray-400 font-normal">{failure.whatsapp}</span>
                    </p>
                    <p className="text-xs text-red-200/90 mt-1 break-words">{humanizeFailureError(failure.error, tr)}</p>
                    {isAutoRemovedFailure(failure.error) && failure.error ? (
                      <p className="text-[11px] text-gray-500 mt-1 break-words">{failure.error}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Stat(props: { label: string; value: string | number }) {
  return (
    <div className="bg-surface border border-surface-lighter rounded-2xl p-3">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">{props.label}</p>
      <p className="text-lg font-bold text-white mt-1">{props.value}</p>
    </div>
  )
}
