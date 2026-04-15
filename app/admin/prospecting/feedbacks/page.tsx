'use client'

import Link from 'next/link'
import { useEffect, useState, type ComponentType } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, BarChart3, Building2, CalendarRange, CheckCircle2, Loader2, Percent } from 'lucide-react'
import { auth } from '@/lib/firebase'

type ProspectingFeedbackFocus =
  | 'qualified'
  | 'approachesSent'
  | 'feedbacksReceived'
  | 'averageScore'
  | 'offersSent'

type ProspectingFeedbackRow = {
  qualificationKey: string
  score: number
  companyName: string
  phone: string
  feedbackAtMs: number
  sourceSystem: 'autowhats' | 'dancing'
  chatId: string
}

type ProspectingFeedbackStats = {
  feedbacksReceived: number
  averageScore: number
  byScore: Array<{ score: number; count: number }>
  byCompany: Array<{ companyName: string; count: number; averageScore: number }>
  byDay: Array<{ day: string; count: number; averageScore: number }>
}

type ProspectingFeedbackPageInfo = {
  limit: number
  nextCursor: string | null
  hasMore: boolean
}

type ProspectingFeedbackPayload = {
  success?: boolean
  rows?: ProspectingFeedbackRow[]
  stats?: ProspectingFeedbackStats
  pageInfo?: ProspectingFeedbackPageInfo
}

const DEFAULT_LOOKBACK_DAYS = 84
const DEFAULT_PAGE_LIMIT = 25

export default function AdminProspectingFeedbacksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ProspectingFeedbackRow[]>([])
  const [stats, setStats] = useState<ProspectingFeedbackStats>(emptyProspectingFeedbackStats())
  const [pageInfo, setPageInfo] = useState<ProspectingFeedbackPageInfo>(emptyProspectingFeedbackPageInfo())
  const [fromDate, setFromDate] = useState(toDateInput(defaultFromMs()))
  const [toDate, setToDate] = useState(toDateInput(Date.now()))

  const pageState = readPageState(searchParams)
  const scoreMinValue = pageState.scoreMin === null ? 'all' : String(pageState.scoreMin)
  const scoreMaxValue = pageState.scoreMax === null ? 'all' : String(pageState.scoreMax)
  const scoreDistribution = buildScoreDistribution(stats.byScore)
  const positiveFeedbacks = stats.byScore
    .filter((entry) => entry.score >= 7)
    .reduce((total, entry) => total + entry.count, 0)

  useEffect(() => {
    setFromDate(toDateInput(pageState.fromMs))
    setToDate(toDateInput(pageState.toMs))
  }, [pageState.fromMs, pageState.toMs])

  useEffect(() => {
    void loadFeedbacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  async function fetchAdmin<T>(path: string): Promise<T> {
    if (!auth?.currentUser) {
      throw new Error('auth_unavailable')
    }

    const token = await auth.currentUser.getIdToken()
    const response = await fetch(path, {
      headers: {
        authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload?.error ? String(payload.error) : `request_failed_${response.status}`
      throw new Error(message)
    }
    return payload as T
  }

  async function loadFeedbacks(cursor?: string | null) {
    const query = buildApiQuery(searchParams, cursor ?? null)
    const isAppending = Boolean(cursor)
    if (isAppending) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setError(null)
    }

    try {
      const payload = await fetchAdmin<ProspectingFeedbackPayload>(`/api/admin/prospecting/feedbacks?${query.toString()}`)
      const nextRows = Array.isArray(payload.rows) ? payload.rows : []
      setRows((current) => (isAppending ? mergeFeedbackRows(current, nextRows) : nextRows))
      setStats(payload.stats ?? emptyProspectingFeedbackStats())
      setPageInfo(payload.pageInfo ?? emptyProspectingFeedbackPageInfo())
    } catch (loadError) {
      if (!isAppending) {
        setRows([])
        setStats(emptyProspectingFeedbackStats())
        setPageInfo(emptyProspectingFeedbackPageInfo())
      }
      setError(loadError instanceof Error ? loadError.message : 'prospecting_feedbacks_failed')
    } finally {
      if (isAppending) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }

  function replaceFilters(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    if (!next.has('fromMs')) {
      next.set('fromMs', String(pageState.fromMs))
    }
    if (!next.has('toMs')) {
      next.set('toMs', String(pageState.toMs))
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === '') {
        next.delete(key)
        return
      }
      next.set(key, value)
    })
    next.delete('cursor')
    router.replace(`/admin/prospecting/feedbacks?${next.toString()}`)
  }

  function applyDateRange() {
    const nextFromMs = parseDateInputToMs(fromDate, 'start')
    const nextToMs = parseDateInputToMs(toDate, 'end')
    if (nextFromMs === null || nextToMs === null || nextFromMs > nextToMs) {
      setError('invalid_period')
      return
    }

    replaceFilters({
      fromMs: String(nextFromMs),
      toMs: String(nextToMs)
    })
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-surface-lighter bg-surface-light p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao dashboard
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Prospecção por feedback</p>
              <h1 className="text-2xl font-bold text-white">{focusTitle(pageState.focus)}</h1>
              <p className="text-sm text-gray-400">{focusDescription(pageState.focus)}</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <DateField label="De" value={fromDate} onChange={setFromDate} />
            <DateField label="Até" value={toDate} onChange={setToDate} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <FilterField
            label="Empresa"
            value={pageState.company}
            onChange={(value) => replaceFilters({ company: value || null })}
            options={stats.byCompany.map((entry) => entry.companyName)}
          />
          <ScoreField
            label="Nota mínima"
            value={scoreMinValue}
            onChange={(value) => replaceFilters({ scoreMin: value === 'all' ? null : value })}
          />
          <ScoreField
            label="Nota máxima"
            value={scoreMaxValue}
            onChange={(value) => replaceFilters({ scoreMax: value === 'all' ? null : value })}
          />
          <button
            type="button"
            onClick={applyDateRange}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-black transition hover:bg-primary/90"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarRange className="mr-2 h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
          Falha ao carregar feedbacks: {humanizeError(error)}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FeedbackMetricCard
          label="Feedbacks recebidos"
          value={formatNumber(stats.feedbacksReceived)}
          detail="Eventos score_received no período"
          icon={CheckCircle2}
        />
        <FeedbackMetricCard
          label="Nota média"
          value={formatAverageScore(stats.averageScore)}
          detail="Média das notas capturadas"
          icon={Percent}
        />
        <FeedbackMetricCard
          label="Empresas"
          value={formatNumber(stats.byCompany.length)}
          detail="Empresas com feedback registrado"
          icon={Building2}
        />
        <FeedbackMetricCard
          label="Notas positivas"
          value={formatNumber(positiveFeedbacks)}
          detail="Feedbacks com nota 7+"
          icon={BarChart3}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelShell title="Feedbacks capturados" subtitle="Empresa, telefone, nota, data/hora e origem de cada feedback.">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface">
                <tr className="text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Número</th>
                  <th className="px-4 py-3 font-semibold">Nota</th>
                  <th className="px-4 py-3 font-semibold">Data/hora</th>
                  <th className="px-4 py-3 font-semibold">Origem</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <EmptyRow colSpan={5} text="Carregando feedbacks..." />
                ) : rows.length === 0 ? (
                  <EmptyRow colSpan={5} text="Nenhum feedback encontrado para os filtros atuais." />
                ) : (
                  rows.map((row) => (
                    <tr key={row.qualificationKey} className="border-t border-surface-lighter/50 text-gray-200">
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="font-medium text-white">{row.companyName}</div>
                          <div className="font-mono text-xs text-gray-500">{row.qualificationKey}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.phone}</td>
                      <td className="px-4 py-3 font-semibold text-primary">{row.score}</td>
                      <td className="px-4 py-3">{formatDateTime(row.feedbackAtMs)}</td>
                      <td className="px-4 py-3">{formatSourceSystem(row.sourceSystem)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pageInfo.hasMore ? (
            <div className="border-t border-surface-lighter/60 px-4 py-4">
              <button
                type="button"
                onClick={() => void loadFeedbacks(pageInfo.nextCursor)}
                disabled={loadingMore || !pageInfo.nextCursor}
                className="inline-flex items-center rounded-lg border border-surface-lighter px-4 py-2 text-sm font-medium text-white transition hover:bg-surface"
              >
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Carregar mais
              </button>
            </div>
          ) : null}
        </PanelShell>

        <div className="space-y-6">
          <PanelShell title="Distribuição por nota" subtitle="Quantidade de feedbacks por nota.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-2">
              {scoreDistribution.map((entry) => (
                <article key={entry.score} className="rounded-2xl border border-surface-lighter bg-surface p-4">
                  <p className="text-xs uppercase tracking-wider text-gray-400">Nota {entry.score}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(entry.count)}</p>
                </article>
              ))}
            </div>
          </PanelShell>

          <PanelShell title="Empresas com feedback" subtitle="Volume e média por empresa no período filtrado.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-surface">
                  <tr className="text-xs uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3 font-semibold">Empresa</th>
                    <th className="px-4 py-3 font-semibold">Feedbacks</th>
                    <th className="px-4 py-3 font-semibold">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byCompany.length === 0 ? (
                    <EmptyRow colSpan={3} text="Nenhuma empresa com feedback neste período." />
                  ) : (
                    stats.byCompany.map((entry) => (
                      <tr key={entry.companyName} className="border-t border-surface-lighter/50 text-gray-200">
                        <td className="px-4 py-3">{entry.companyName}</td>
                        <td className="px-4 py-3">{formatNumber(entry.count)}</td>
                        <td className="px-4 py-3 font-semibold text-primary">{formatAverageScore(entry.averageScore)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PanelShell>
        </div>
      </div>

      <PanelShell title="Série diária" subtitle="Quantidade e média por dia dentro do período selecionado.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface">
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3 font-semibold">Dia</th>
                <th className="px-4 py-3 font-semibold">Feedbacks</th>
                <th className="px-4 py-3 font-semibold">Média</th>
              </tr>
            </thead>
            <tbody>
              {stats.byDay.length === 0 ? (
                <EmptyRow colSpan={3} text="Sem série diária para os filtros atuais." />
              ) : (
                stats.byDay.map((entry) => (
                  <tr key={entry.day} className="border-t border-surface-lighter/50 text-gray-200">
                    <td className="px-4 py-3">{formatDay(entry.day)}</td>
                    <td className="px-4 py-3">{formatNumber(entry.count)}</td>
                    <td className="px-4 py-3 font-semibold text-primary">{formatAverageScore(entry.averageScore)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PanelShell>
    </section>
  )
}

function readPageState(searchParams: ReturnType<typeof useSearchParams>) {
  const now = Date.now()
  const defaultToMs = now
  const defaultFromMs = now - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  const fromMs = parseQueryTimestamp(searchParams.get('fromMs')) ?? defaultFromMs
  const toMs = parseQueryTimestamp(searchParams.get('toMs')) ?? defaultToMs
  const focus = parseFocus(searchParams.get('focus'))
  const company = searchParams.get('company')?.trim() || null
  const scoreMin = parseScore(searchParams.get('scoreMin'))
  const scoreMax = parseScore(searchParams.get('scoreMax'))

  return {
    fromMs,
    toMs,
    focus,
    company,
    scoreMin,
    scoreMax
  }
}

function buildApiQuery(searchParams: ReturnType<typeof useSearchParams>, cursor: string | null) {
  const state = readPageState(searchParams)
  const query = new URLSearchParams({
    fromMs: String(state.fromMs),
    toMs: String(state.toMs),
    limit: String(DEFAULT_PAGE_LIMIT)
  })

  if (state.focus) {
    query.set('focus', state.focus)
  }
  if (state.company) {
    query.set('company', state.company)
  }
  if (state.scoreMin !== null) {
    query.set('scoreMin', String(state.scoreMin))
  }
  if (state.scoreMax !== null) {
    query.set('scoreMax', String(state.scoreMax))
  }
  if (cursor) {
    query.set('cursor', cursor)
  }

  return query
}

function parseQueryTimestamp(value: string | null) {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null
}

function parseScore(value: string | null) {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  const rounded = Math.round(parsed)
  return rounded >= 1 && rounded <= 10 ? rounded : null
}

function parseFocus(value: string | null): ProspectingFeedbackFocus | null {
  if (
    value === 'qualified' ||
    value === 'approachesSent' ||
    value === 'feedbacksReceived' ||
    value === 'averageScore' ||
    value === 'offersSent'
  ) {
    return value
  }
  return null
}

function mergeFeedbackRows(current: ProspectingFeedbackRow[], next: ProspectingFeedbackRow[]) {
  const map = new Map<string, ProspectingFeedbackRow>()
  for (const row of current) {
    map.set(row.qualificationKey, row)
  }
  for (const row of next) {
    map.set(row.qualificationKey, row)
  }
  return Array.from(map.values()).sort((a, b) => b.feedbackAtMs - a.feedbackAtMs)
}

function focusTitle(focus: ProspectingFeedbackFocus | null) {
  switch (focus) {
    case 'qualified':
      return 'Feedbacks a partir do card de qualificados'
    case 'approachesSent':
      return 'Feedbacks a partir do card de abordagens'
    case 'averageScore':
      return 'Detalhe da nota média'
    case 'offersSent':
      return 'Feedbacks positivos e ofertas'
    case 'feedbacksReceived':
    default:
      return 'Feedbacks recebidos'
  }
}

function focusDescription(focus: ProspectingFeedbackFocus | null) {
  switch (focus) {
    case 'qualified':
      return 'Lista de feedbacks recebidos dentro do recorte que originou o card de qualificados.'
    case 'approachesSent':
      return 'Lista de feedbacks ligados às abordagens enviadas no período selecionado.'
    case 'averageScore':
      return 'Mesmo conjunto de feedbacks, com ênfase na média e distribuição das notas.'
    case 'offersSent':
      return 'Recorte inicial de feedbacks positivos, associados às ofertas comerciais enviadas.'
    case 'feedbacksReceived':
    default:
      return 'Lista paginada com empresa, número, nota, data/hora e estatísticas agregadas.'
  }
}

function humanizeError(error: string) {
  switch (error) {
    case 'invalid_period':
      return 'intervalo inválido'
    case 'invalid_cursor':
      return 'cursor inválido'
    case 'invalid_score_range':
      return 'faixa de nota inválida'
    case 'invalid_focus':
      return 'foco inválido'
    case 'auth_unavailable':
      return 'sessão admin indisponível'
    default:
      return error
  }
}

function emptyProspectingFeedbackStats(): ProspectingFeedbackStats {
  return {
    feedbacksReceived: 0,
    averageScore: 0,
    byScore: [],
    byCompany: [],
    byDay: []
  }
}

function emptyProspectingFeedbackPageInfo(): ProspectingFeedbackPageInfo {
  return {
    limit: DEFAULT_PAGE_LIMIT,
    nextCursor: null,
    hasMore: false
  }
}

function buildScoreDistribution(entries: Array<{ score: number; count: number }>) {
  const counts = new Map(entries.map((entry) => [entry.score, entry.count]))
  return Array.from({ length: 10 }, (_, index) => ({
    score: 10 - index,
    count: counts.get(10 - index) ?? 0
  }))
}

function formatAverageScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0'
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('pt-BR') : '0'
}

function formatDateTime(valueMs: number) {
  if (!Number.isFinite(valueMs)) {
    return '-'
  }
  return new Date(valueMs).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDay(day: string) {
  const parsed = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) {
    return day
  }
  return new Date(parsed).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatSourceSystem(sourceSystem: ProspectingFeedbackRow['sourceSystem']) {
  return sourceSystem === 'dancing' ? 'Dancing' : 'AutoWhats'
}

function toDateInput(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

function parseDateInputToMs(value: string, mode: 'start' | 'end') {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const suffix = mode === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
  const parsed = Date.parse(`${trimmed}${suffix}`)
  return Number.isFinite(parsed) ? parsed : null
}

function defaultFromMs() {
  return Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs text-gray-300">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block rounded-lg border border-surface-lighter bg-surface px-3 py-2 text-sm text-white"
      />
    </label>
  )
}

function FilterField({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className="text-xs text-gray-300">
      {label}
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 rounded-lg border border-surface-lighter bg-surface px-3 text-sm text-white"
      >
        <option value="">Todas</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function ScoreField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs text-gray-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 rounded-lg border border-surface-lighter bg-surface px-3 text-sm text-white"
      >
        <option value="all">Todas</option>
        {Array.from({ length: 10 }, (_, index) => 10 - index).map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
    </label>
  )
}

function PanelShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light">
      <div className="border-b border-surface-lighter/60 px-4 py-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-gray-400">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-400">
        {text}
      </td>
    </tr>
  )
}

function FeedbackMetricCard({
  label,
  value,
  detail,
  icon: Icon
}: {
  label: string
  value: string
  detail: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <article className="rounded-2xl border border-surface-lighter bg-surface-light p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-gray-400">{detail}</p>
        </div>
        <div className="rounded-xl bg-surface p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
    </article>
  )
}
