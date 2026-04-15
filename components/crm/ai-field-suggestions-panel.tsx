'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Edit2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type TargetType = 'lead' | 'client'

type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

type SuggestionBase = {
  name?: string | null
  whatsapp?: string | null
  status?: string | null
  observations?: string | null
  nextContactAt?: number | null
  updatedAt?: number | null
}

type SuggestionPatch = {
  status?: string
  observations?: string | null
  nextContactAt?: number | null
}

type Suggestion = {
  id: number
  sessionId: string
  chatId: string
  targetType: TargetType
  targetId: string
  inboundId: number | null
  provider: string
  model: string
  status: SuggestionStatus
  base: SuggestionBase
  patch: SuggestionPatch
  reason: string | null
  appliedPatch: SuggestionPatch | null
  createdAt: number | null
  updatedAt: number | null
  decidedAt: number | null
  appliedAt: number | null
}

type FetchWithAuth = <T,>(path: string, init?: RequestInit) => Promise<T>

type BuildSessionQuery = (entries: Record<string, string | number | undefined>) => string

type Props = {
  targetType: TargetType
  fetchWithAuth: FetchWithAuth
  buildSessionQuery: BuildSessionQuery
  onApplied?: () => void | Promise<void>
}

export function AiFieldSuggestionsPanel({ targetType, fetchWithAuth, buildSessionQuery, onApplied }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draftStatus, setDraftStatus] = useState('')
  const [draftNextContact, setDraftNextContact] = useState('')
  const [draftObservations, setDraftObservations] = useState('')
  const [submittingId, setSubmittingId] = useState<number | null>(null)

  const allowedStatus = useMemo(() => {
    return targetType === 'lead'
      ? ['novo', 'inativo', 'aguardando', 'em_processo']
      : ['ativo', 'inativo', 'vip']
  }, [targetType])

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchWithAuth<{ suggestions?: Suggestion[] }>(
        `/api/ai-suggestions${buildSessionQuery({ targetType, status: 'pending', limit: 100 })}`
      )
      const rows = Array.isArray(payload.suggestions) ? payload.suggestions : []
      setSuggestions(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [buildSessionQuery, fetchWithAuth, targetType])

  useEffect(() => {
    void loadSuggestions()
  }, [loadSuggestions])

  const startEdit = (suggestion: Suggestion) => {
    setEditingId(suggestion.id)
    const baseStatus = suggestion.base.status ?? ''
    setDraftStatus(suggestion.patch.status ?? baseStatus)

    const hasObs = Object.prototype.hasOwnProperty.call(suggestion.patch, 'observations')
    const baseObs = suggestion.base.observations ?? ''
    const patchObs = suggestion.patch.observations ?? ''
    setDraftObservations(hasObs ? patchObs : baseObs)

    const hasNext = Object.prototype.hasOwnProperty.call(suggestion.patch, 'nextContactAt')
    const baseNext = suggestion.base.nextContactAt ?? null
    const patchNext = suggestion.patch.nextContactAt ?? null
    const nextValue = hasNext ? patchNext : baseNext
    setDraftNextContact(nextValue ? new Date(nextValue).toISOString().slice(0, 16) : '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftStatus('')
    setDraftNextContact('')
    setDraftObservations('')
  }

  const buildPatchFromDraft = (suggestion: Suggestion): SuggestionPatch | null => {
    const patch: SuggestionPatch = {}

    const status = draftStatus.trim()
    const baseStatus = suggestion.base.status ?? null
    if (status && status !== baseStatus) {
      if (!allowedStatus.includes(status)) {
        setError('Status inválido.')
        return null
      }
      patch.status = status
    }

    const baseObs = suggestion.base.observations ?? null
    const observations = draftObservations.trim() ? draftObservations.trim() : null
    if (observations !== baseObs) {
      patch.observations = observations
    }

    const baseNext = suggestion.base.nextContactAt ?? null
    const nextContactAt = draftNextContact ? new Date(draftNextContact).getTime() : null
    if (nextContactAt !== baseNext) {
      patch.nextContactAt = nextContactAt
    }

    return Object.keys(patch).length > 0 ? patch : null
  }

  const handleReject = async (suggestion: Suggestion) => {
    setSubmittingId(suggestion.id)
    setError(null)
    try {
      await fetchWithAuth(
        `/api/ai-suggestions/${encodeURIComponent(String(suggestion.id))}/reject${buildSessionQuery({})}`,
        { method: 'POST' }
      )
      await loadSuggestions()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingId(null)
    }
  }

  const handleApprove = async (suggestion: Suggestion) => {
    setSubmittingId(suggestion.id)
    setError(null)
    try {
      let body: unknown = {}
      if (editingId === suggestion.id) {
        const patch = buildPatchFromDraft(suggestion)
        if (!patch) {
          setError('Nenhuma alteração para aplicar.')
          return
        }
        body = { patch }
      }

      await fetchWithAuth(
        `/api/ai-suggestions/${encodeURIComponent(String(suggestion.id))}/accept${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(body)
        }
      )

      cancelEdit()
      await loadSuggestions()
      await onApplied?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Carregando sugestões...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Sugestões da IA</h2>
          <p className="text-sm text-gray-400">
            Revise, edite e aprove alterações em {targetType === 'lead' ? 'leads' : 'clientes'}.
          </p>
        </div>
        <Button variant="outline" className="bg-surface border-surface-lighter" onClick={loadSuggestions}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm rounded-xl p-3">
          {error}
        </div>
      )}

      {suggestions.length === 0 ? (
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 text-gray-400">
          Nenhuma sugestão pendente no momento.
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => {
            const isEditing = editingId === suggestion.id
            const isSubmitting = submittingId === suggestion.id

            const hasStatus = suggestion.patch.status !== undefined
            const hasObs = Object.prototype.hasOwnProperty.call(suggestion.patch, 'observations')
            const hasNext = Object.prototype.hasOwnProperty.call(suggestion.patch, 'nextContactAt')

            return (
              <div
                key={suggestion.id}
                className="bg-surface-light border border-surface-lighter rounded-2xl p-5 space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="text-white font-semibold">
                      {suggestion.base.name || 'Sem nome'}{' '}
                      <span className="text-gray-500 font-normal">
                        {suggestion.base.whatsapp ? `(${suggestion.base.whatsapp})` : ''}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Atualizado: {formatDateTime(suggestion.updatedAt)}
                      {suggestion.reason ? ` • Motivo: ${suggestion.reason}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isEditing && (
                      <Button
                        variant="outline"
                        className="bg-surface border-surface-lighter"
                        onClick={() => startEdit(suggestion)}
                        disabled={isSubmitting}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Editar
                      </Button>
                    )}

                    <Button
                      className="bg-primary hover:bg-primary/90 text-black"
                      onClick={() => handleApprove(suggestion)}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Aprovar
                    </Button>

                    <Button
                      variant="outline"
                      className="bg-surface border-surface-lighter text-red-300 hover:bg-red-500/10 hover:border-red-500/30"
                      onClick={() => handleReject(suggestion)}
                      disabled={isSubmitting}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Rejeitar
                    </Button>
                  </div>
                </div>

                {!isEditing ? (
                  <div className="grid md:grid-cols-3 gap-3">
                    <DiffCard
                      title="Status"
                      visible={hasStatus}
                      before={suggestion.base.status ?? '-'}
                      after={suggestion.patch.status ?? '-'}
                    />
                    <DiffCard
                      title="Próximo contato"
                      visible={hasNext}
                      before={formatDateTime(suggestion.base.nextContactAt)}
                      after={formatDateTime(suggestion.patch.nextContactAt)}
                    />
                    <DiffCard
                      title="Observações"
                      visible={hasObs}
                      before={suggestion.base.observations ?? '-'}
                      after={suggestion.patch.observations ?? '-'}
                    />
                  </div>
                ) : (
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">Status</label>
                      <select
                        value={draftStatus}
                        onChange={(e) => setDraftStatus(e.target.value)}
                        className="w-full bg-surface border border-surface-lighter text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary"
                      >
                        <option value="">(sem alteração)</option>
                        {allowedStatus.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">Próximo contato</label>
                      <Input
                        type="datetime-local"
                        value={draftNextContact}
                        onChange={(e) => setDraftNextContact(e.target.value)}
                      />
                      <div className="text-[11px] text-gray-500">
                        Deixe vazio para limpar o próximo contato.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-400 uppercase">Observações</label>
                      <Textarea
                        value={draftObservations}
                        onChange={(e) => setDraftObservations(e.target.value)}
                        className="min-h-[90px]"
                        placeholder="Observações..."
                      />
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          className={cn('text-gray-400', isSubmitting && 'opacity-50')}
                          onClick={cancelEdit}
                          disabled={isSubmitting}
                        >
                          Cancelar edição
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DiffCard(props: { title: string; before: string; after: string; visible: boolean }) {
  if (!props.visible) {
    return (
      <div className="bg-surface border border-surface-lighter rounded-xl p-4 opacity-60">
        <div className="text-xs font-bold text-gray-400 uppercase">{props.title}</div>
        <div className="text-sm text-gray-500 mt-1">Sem sugestão</div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-surface-lighter rounded-xl p-4">
      <div className="text-xs font-bold text-gray-400 uppercase">{props.title}</div>
      <div className="mt-2 space-y-1 text-sm">
        <div className="text-gray-400">
          <span className="text-[11px] uppercase text-gray-500">Antes:</span> {props.before || '-'}
        </div>
        <div className="text-primary">
          <span className="text-[11px] uppercase text-gray-500">Depois:</span> {props.after || '-'}
        </div>
      </div>
    </div>
  )
}

function formatDateTime(value: number | null | undefined) {
  if (!value) {
    return '-'
  }
  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch {
    return '-'
  }
}
