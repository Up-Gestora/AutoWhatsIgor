'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type TargetType = 'lead' | 'client'
type SuggestionStatus = 'pending' | 'accepted' | 'rejected'
type DecisionSource = 'manual' | 'automatic' | null
type DecisionActorRole = 'admin' | 'user' | 'system' | null
type SuggestionEvent = 'sugerido' | 'aprovado' | 'editado' | 'rejeitado'

type SuggestionBase = {
  name?: string | null
  whatsapp?: string | null
  status?: string | null
  observations?: string | null
  nextContactAt?: number | null
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
  decisionSource: DecisionSource
  decisionActorRole: DecisionActorRole
  decisionActorUid: string | null
}

type FetchWithAuth = <T,>(path: string, init?: RequestInit) => Promise<T>
type BuildSessionQuery = (entries: Record<string, string | number | undefined>) => string

type Props = {
  targetType: TargetType
  fetchWithAuth: FetchWithAuth
  buildSessionQuery: BuildSessionQuery
}

type EventFilter = 'todos' | SuggestionEvent
type SourceFilter = 'todas' | 'manual' | 'automatic' | 'indefinido'

export function AiFieldSuggestionsLogsPanel({ targetType, fetchWithAuth, buildSessionQuery }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState<EventFilter>('todos')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('todas')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchWithAuth<{ suggestions?: Suggestion[] }>(
        `/api/ai-suggestions${buildSessionQuery({ targetType, status: 'all', limit: 500 })}`
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null

    return suggestions.filter((suggestion) => {
      const event = classifyEvent(suggestion)
      const source = suggestion.decisionSource
      const updatedAt = suggestion.updatedAt ?? suggestion.createdAt ?? null

      if (eventFilter !== 'todos' && event !== eventFilter) {
        return false
      }

      if (sourceFilter !== 'todas') {
        if (sourceFilter === 'indefinido') {
          if (source !== null) {
            return false
          }
        } else if (source !== sourceFilter) {
          return false
        }
      }

      if (fromMs !== null || toMs !== null) {
        if (!updatedAt) {
          return false
        }
        if (fromMs !== null && updatedAt < fromMs) {
          return false
        }
        if (toMs !== null && updatedAt > toMs) {
          return false
        }
      }

      if (!term) {
        return true
      }

      const target = `${suggestion.base.name ?? ''} ${suggestion.base.whatsapp ?? ''}`.toLowerCase()
      const reason = (suggestion.reason ?? '').toLowerCase()
      const model = `${suggestion.provider} ${suggestion.model}`.toLowerCase()

      return target.includes(term) || reason.includes(term) || model.includes(term)
    })
  }, [dateFrom, dateTo, eventFilter, search, sourceFilter, suggestions])

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Carregando logs...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Logs de Sugestões IA</h2>
          <p className="text-sm text-gray-400">
            Histórico de sugestões e decisões em {targetType === 'lead' ? 'leads' : 'clientes'}.
          </p>
        </div>
        <Button variant="outline" className="bg-surface border-surface-lighter" onClick={loadSuggestions}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por contato, motivo ou modelo..."
          className="md:col-span-2"
        />

        <select
          value={eventFilter}
          onChange={(event) => setEventFilter(event.target.value as EventFilter)}
          className="rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-gray-200"
        >
          <option value="todos">Todos os eventos</option>
          <option value="sugerido">Sugerido</option>
          <option value="aprovado">Aprovado</option>
          <option value="editado">Editado</option>
          <option value="rejeitado">Rejeitado</option>
        </select>

        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
          className="rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-gray-200"
        >
          <option value="todas">Todas as origens</option>
          <option value="manual">Manual</option>
          <option value="automatic">Automatica</option>
          <option value="indefinido">Indefinido</option>
        </select>

        <div className="flex items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-surface-lighter bg-surface-light p-6 text-gray-400">
          Nenhum log encontrado com os filtros atuais.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((suggestion) => {
            const event = classifyEvent(suggestion)
            const sourceLabel = formatDecisionSource(suggestion.decisionSource)
            const actorLabel = formatDecisionActor(suggestion.decisionActorRole, suggestion.decisionActorUid)

            return (
              <div key={suggestion.id} className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-5">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <div className="font-semibold text-white">
                      {suggestion.base.name || 'Sem nome'}{' '}
                      <span className="font-normal text-gray-500">
                        {suggestion.base.whatsapp ? `(${suggestion.base.whatsapp})` : ''}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {targetTypeLabel(suggestion.targetType)} • Atualizado: {formatDateTime(suggestion.updatedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full px-2 py-1 text-xs font-bold uppercase', eventClassName(event))}>
                      {event}
                    </span>
                    <span className="rounded-full border border-surface-lighter px-2 py-1 text-xs text-gray-300">
                      {sourceLabel}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 text-xs text-gray-400 md:grid-cols-3">
                  <div>Ator: {actorLabel}</div>
                  <div>Modelo: {suggestion.provider}/{suggestion.model}</div>
                  <div>Status registro: {suggestion.status}</div>
                </div>

                {suggestion.reason && (
                  <div className="rounded-xl border border-surface-lighter bg-surface p-3 text-sm text-gray-200">
                    Motivo da IA: {suggestion.reason}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <PatchCard title="Sugerido pela IA" patch={suggestion.patch} />
                  <PatchCard title="Aplicado" patch={suggestion.appliedPatch} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PatchCard({ title, patch }: { title: string; patch: SuggestionPatch | null }) {
  const items = patchEntries(patch)
  return (
    <div className="rounded-xl border border-surface-lighter bg-surface p-4">
      <div className="text-xs font-bold uppercase text-gray-400">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-gray-500">Sem dados.</div>
      ) : (
        <div className="mt-2 space-y-1 text-sm">
          {items.map((item) => (
            <div key={item.label} className="text-gray-200">
              <span className="text-xs uppercase text-gray-500">{item.label}:</span> {item.value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function patchEntries(patch: SuggestionPatch | null): Array<{ label: string; value: string }> {
  if (!patch) {
    return []
  }
  const entries: Array<{ label: string; value: string }> = []
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    entries.push({ label: 'status', value: patch.status ?? '-' })
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nextContactAt')) {
    entries.push({ label: 'proximo_contato', value: formatDateTime(patch.nextContactAt) })
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'observations')) {
    entries.push({ label: 'observações', value: patch.observations ?? '-' })
  }
  return entries
}

function classifyEvent(suggestion: Suggestion): SuggestionEvent {
  if (suggestion.status === 'pending') {
    return 'sugerido'
  }
  if (suggestion.status === 'rejected') {
    return 'rejeitado'
  }
  if (!suggestion.appliedPatch || arePatchesEqual(suggestion.patch, suggestion.appliedPatch)) {
    return 'aprovado'
  }
  return 'editado'
}

function arePatchesEqual(a: SuggestionPatch | null, b: SuggestionPatch | null) {
  const normalizedA = normalizePatch(a)
  const normalizedB = normalizePatch(b)
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB)
}

function normalizePatch(patch: SuggestionPatch | null): Record<string, unknown> {
  if (!patch) {
    return {}
  }
  const normalized: Record<string, unknown> = {}
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    normalized.status = patch.status ?? null
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nextContactAt')) {
    normalized.nextContactAt = patch.nextContactAt ?? null
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'observations')) {
    normalized.observations = patch.observations ?? null
  }
  return normalized
}

function formatDecisionSource(source: DecisionSource) {
  if (source === 'manual') return 'Manual'
  if (source === 'automatic') return 'Automatica'
  return 'Indefinido'
}

function formatDecisionActor(role: DecisionActorRole, uid: string | null) {
  if (!role && !uid) return 'Indefinido'
  if (role === 'system') return 'System'
  if (uid) return `${role ?? 'user'} (${uid})`
  return role ?? 'Indefinido'
}

function targetTypeLabel(targetType: TargetType) {
  return targetType === 'lead' ? 'Lead' : 'Cliente'
}

function eventClassName(event: SuggestionEvent) {
  if (event === 'sugerido') return 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
  if (event === 'rejeitado') return 'bg-red-500/15 text-red-300 border border-red-500/30'
  if (event === 'editado') return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
  return 'bg-green-500/15 text-green-300 border border-green-500/30'
}

function formatDateTime(value: number | null | undefined) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch {
    return '-'
  }
}
