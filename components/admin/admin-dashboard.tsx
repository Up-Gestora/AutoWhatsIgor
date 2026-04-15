'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { auth } from '@/lib/firebase'
import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Link2,
  Loader2,
  MessageSquareText,
  Percent,
  Rocket,
  ShieldOff,
  Smartphone
} from 'lucide-react'

type FunnelStageCounts = {
  whatsapp_saved: number
  whatsapp_connected: number
  training_score_70_reached: number
  ai_enabled: number
  first_ai_response_sent: number
}

type FunnelCohort = {
  cohortStartMs: number
  signups: number
  stageCounts: FunnelStageCounts
  conversionToActivated: number
}

type FunnelPayload = {
  success?: boolean
  cohort?: 'week'
  cohorts?: FunnelCohort[]
}

type AcquisitionStageCounts = {
  whatsapp_connected: number
  training_score_70_reached: number
  first_ai_response_sent: number
  account_activated_7d: number
}

type AcquisitionRates = {
  signup_to_whatsapp_connected: number
  signup_to_training_score_70_reached: number
  signup_to_first_ai_response_sent: number
  activation_7d: number
}

type AcquisitionRow = {
  cohortStartMs: number
  campaignKey: string
  sourceKey: string
  signups: number
  stageCounts: AcquisitionStageCounts
  rates: AcquisitionRates
}

type AcquisitionPayload = {
  success?: boolean
  cohort?: 'week'
  groupBy?: 'campaign'
  rows?: AcquisitionRow[]
}

type ProspectingSummary = {
  qualified: number
  approachesSent: number
  feedbacksReceived: number
  averageScore: number
  offersSent: number
  timeoutsNoScore: number
  optOuts: number
}

type ProspectingDiagnostics = {
  enabled: boolean
  senderEmail: string | null
  senderSessionId: string | null
  lookupStatus: 'ok' | 'disabled' | 'sender_email_missing' | 'sender_lookup_failed'
  failureReason: string | null
  lastScoreAtMs: number | null
  rawScoreEvents: number
  scoreCandidatesDetected: number
  missingScoreEvents: number
  missingCommentEvents: number
}

type ProspectingPayload = {
  success?: boolean
  summary?: ProspectingSummary
  diagnostics?: ProspectingDiagnostics
}

type ProspectingFeedbackFocus =
  | 'qualified'
  | 'approachesSent'
  | 'feedbacksReceived'
  | 'averageScore'
  | 'offersSent'

type AffiliateFunnelSummary = {
  clicks: number
  uniqueVisitors: number
  signups: number
  checkoutStarted: number
  subscriptionsCreated: number
  firstPaymentsConfirmed: number
}

type AffiliateFunnelRow = AffiliateFunnelSummary & {
  affiliateCode: string
  affiliateName: string
  status: 'active' | 'inactive'
  sharePath: string
}

type AffiliateFunnelPayload = {
  success?: boolean
  summary?: Partial<AffiliateFunnelSummary>
  rows?: AffiliateFunnelRow[]
}

const DEFAULT_LOOKBACK_DAYS = 84

export function AdminDashboard() {
  const [fromDate, setFromDate] = useState(() => toDateInput(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000))
  const [toDate, setToDate] = useState(() => toDateInput(Date.now()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cohorts, setCohorts] = useState<FunnelCohort[]>([])
  const [acquisitionRows, setAcquisitionRows] = useState<AcquisitionRow[]>([])
  const [acquisitionError, setAcquisitionError] = useState<string | null>(null)
  const [affiliateSummary, setAffiliateSummary] = useState<AffiliateFunnelSummary>(emptyAffiliateSummary())
  const [affiliateRows, setAffiliateRows] = useState<AffiliateFunnelRow[]>([])
  const [affiliateError, setAffiliateError] = useState<string | null>(null)
  const [prospectingSummary, setProspectingSummary] = useState<ProspectingSummary>({
    qualified: 0,
    approachesSent: 0,
    feedbacksReceived: 0,
    averageScore: 0,
    offersSent: 0,
    timeoutsNoScore: 0,
    optOuts: 0
  })
  const [prospectingDiagnostics, setProspectingDiagnostics] = useState<ProspectingDiagnostics>(emptyProspectingDiagnostics())
  const [prospectingError, setProspectingError] = useState<string | null>(null)

  const fetchAdmin = useCallback(async <T,>(path: string): Promise<T> => {
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
  }, [])

  const loadDashboard = useCallback(async () => {
    const fromMs = parseDateInputToMs(fromDate, 'start')
    const toMs = parseDateInputToMs(toDate, 'end')
    if (fromMs === null || toMs === null) {
      setError('intervalo_invalido')
      setCohorts([])
      setAcquisitionRows([])
      setAffiliateRows([])
      setAffiliateSummary(emptyAffiliateSummary())
      setProspectingSummary(emptyProspectingSummary())
      setProspectingDiagnostics(emptyProspectingDiagnostics())
      return
    }

    setLoading(true)
    setError(null)
    setAcquisitionError(null)
    setAffiliateError(null)
    setProspectingError(null)

    try {
      const [onboardingResult, acquisitionResult, affiliateResult, prospectingResult] = await Promise.allSettled([
        fetchAdmin<FunnelPayload>(`/api/admin/onboarding/funnel?fromMs=${fromMs}&toMs=${toMs}&cohort=week`),
        fetchAdmin<AcquisitionPayload>(
          `/api/admin/acquisition/funnel?fromMs=${fromMs}&toMs=${toMs}&cohort=week&groupBy=campaign`
        ),
        fetchAdmin<AffiliateFunnelPayload>(`/api/admin/affiliates/funnel?fromMs=${fromMs}&toMs=${toMs}`),
        fetchAdmin<ProspectingPayload>(`/api/admin/prospecting/summary?fromMs=${fromMs}&toMs=${toMs}`)
      ])

      if (onboardingResult.status === 'fulfilled') {
        setCohorts(Array.isArray(onboardingResult.value.cohorts) ? onboardingResult.value.cohorts : [])
      } else {
        throw onboardingResult.reason
      }

      if (acquisitionResult.status === 'fulfilled') {
        setAcquisitionRows(Array.isArray(acquisitionResult.value.rows) ? acquisitionResult.value.rows : [])
      } else {
        setAcquisitionRows([])
        const message = acquisitionResult.reason instanceof Error ? acquisitionResult.reason.message : 'acquisition_funnel_failed'
        setAcquisitionError(message === 'not_found' ? null : message)
      }

      if (affiliateResult.status === 'fulfilled') {
        setAffiliateRows(Array.isArray(affiliateResult.value.rows) ? affiliateResult.value.rows : [])
        setAffiliateSummary(normalizeAffiliateSummary(affiliateResult.value.summary))
      } else {
        setAffiliateRows([])
        setAffiliateSummary(emptyAffiliateSummary())
        const message = affiliateResult.reason instanceof Error ? affiliateResult.reason.message : 'affiliate_funnel_failed'
        setAffiliateError(message === 'not_found' ? null : message)
      }

      if (prospectingResult.status === 'fulfilled') {
        setProspectingSummary(prospectingResult.value.summary ?? emptyProspectingSummary())
        setProspectingDiagnostics(prospectingResult.value.diagnostics ?? emptyProspectingDiagnostics())
      } else {
        setProspectingSummary(emptyProspectingSummary())
        setProspectingDiagnostics(emptyProspectingDiagnostics())
        const message = prospectingResult.reason instanceof Error ? prospectingResult.reason.message : 'prospecting_summary_failed'
        setProspectingError(message)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'onboarding_funnel_failed')
      setCohorts([])
      setAcquisitionRows([])
      setAffiliateRows([])
      setAffiliateSummary(emptyAffiliateSummary())
      setProspectingSummary(emptyProspectingSummary())
      setProspectingDiagnostics(emptyProspectingDiagnostics())
    } finally {
      setLoading(false)
    }
  }, [fetchAdmin, fromDate, toDate])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const totals = useMemo(
    () =>
      cohorts.reduce(
        (acc, row) => {
          acc.signups += row.signups
          acc.whatsappConnected += row.stageCounts.whatsapp_connected
          acc.score70 += row.stageCounts.training_score_70_reached
          acc.activated += row.stageCounts.first_ai_response_sent
          return acc
        },
        { signups: 0, whatsappConnected: 0, score70: 0, activated: 0 }
      ),
    [cohorts]
  )

  const acquisitionTotals = useMemo(
    () =>
      acquisitionRows.reduce(
        (acc, row) => {
          acc.signups += row.signups
          acc.whatsappConnected += row.stageCounts.whatsapp_connected
          acc.score70 += row.stageCounts.training_score_70_reached
          acc.activated += row.stageCounts.first_ai_response_sent
          acc.activated7d += row.stageCounts.account_activated_7d
          return acc
        },
        { signups: 0, whatsappConnected: 0, score70: 0, activated: 0, activated7d: 0 }
      ),
    [acquisitionRows]
  )

  const acquisitionRates = {
    signupToWhatsappConnected:
      acquisitionTotals.signups > 0 ? acquisitionTotals.whatsappConnected / acquisitionTotals.signups : 0,
    signupToScore70: acquisitionTotals.signups > 0 ? acquisitionTotals.score70 / acquisitionTotals.signups : 0,
    signupToFirstAiResponse:
      acquisitionTotals.signups > 0 ? acquisitionTotals.activated / acquisitionTotals.signups : 0,
    activation7d: acquisitionTotals.signups > 0 ? acquisitionTotals.activated7d / acquisitionTotals.signups : 0
  }
  const prospectingNeedsAttention =
    prospectingDiagnostics.lookupStatus !== 'ok' || prospectingDiagnostics.missingScoreEvents > 0
  const prospectingDiagnosticsTone = prospectingDiagnostics.lookupStatus !== 'ok' ? 'critical' : 'warning'
  const prospectingFeedbackHref = (focus: ProspectingFeedbackFocus, options?: { scoreMin?: number }) => {
    const fromMs = parseDateInputToMs(fromDate, 'start')
    const toMs = parseDateInputToMs(toDate, 'end')
    if (fromMs === null || toMs === null) {
      return null
    }

    const query = new URLSearchParams({
      fromMs: String(fromMs),
      toMs: String(toMs),
      focus
    })
    if (typeof options?.scoreMin === 'number') {
      query.set('scoreMin', String(options.scoreMin))
    }
    return `/admin/prospecting/feedbacks?${query.toString()}`
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-surface-lighter bg-surface-light p-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin Analytics</p>
          <h2 className="text-xl font-bold text-white">Funis e prospecção no período</h2>
          <p className="text-sm text-gray-400">Ativação oficial: primeira resposta de IA enviada. A prospecção usa o mesmo intervalo selecionado.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <DateField label="De" value={fromDate} onChange={setFromDate} />
          <DateField label="Até" value={toDate} onChange={setToDate} />
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-black transition hover:bg-primary/90"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarRange className="mr-2 h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Signups no período" value={String(totals.signups)} detail="Total de contas novas" icon={Rocket} />
        <MetricCard
          label="WhatsApp conectado"
          value={formatPercent(totals.signups > 0 ? totals.whatsappConnected / totals.signups : 0)}
          detail={`${totals.whatsappConnected} contas`}
          icon={Smartphone}
        />
        <MetricCard
          label="Score 70+"
          value={formatPercent(totals.signups > 0 ? totals.score70 / totals.signups : 0)}
          detail={`${totals.score70} contas`}
          icon={BarChart3}
        />
        <MetricCard
          label="Conversão para ativado"
          value={formatPercent(totals.signups > 0 ? totals.activated / totals.signups : 0)}
          detail={`${totals.activated} contas ativadas`}
          icon={CheckCircle2}
        />
      </div>

      <TableShell title="Onboarding v2 por coorte semanal" subtitle="A ativação oficial é a primeira resposta de IA enviada.">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-surface">
            <tr className="text-xs uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3 font-semibold">Coorte</th>
              <th className="px-4 py-3 font-semibold">Signups</th>
              <th className="px-4 py-3 font-semibold">WhatsApp salvo</th>
              <th className="px-4 py-3 font-semibold">WhatsApp conectado</th>
              <th className="px-4 py-3 font-semibold">Score 70+</th>
              <th className="px-4 py-3 font-semibold">IA ativada</th>
              <th className="px-4 py-3 font-semibold">Ativados</th>
              <th className="px-4 py-3 font-semibold">Conversão final</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={8} text="Carregando funil..." />
            ) : error ? (
              <EmptyRow colSpan={8} text={`Falha ao carregar funil: ${error}`} tone="error" />
            ) : cohorts.length === 0 ? (
              <EmptyRow colSpan={8} text="Nenhum dado encontrado para o período selecionado." />
            ) : (
              cohorts.map((row) => (
                <tr key={row.cohortStartMs} className="border-t border-surface-lighter/50 text-gray-200">
                  <td className="px-4 py-3">{formatDate(row.cohortStartMs)}</td>
                  <td className="px-4 py-3">{row.signups}</td>
                  <td className="px-4 py-3">{row.stageCounts.whatsapp_saved}</td>
                  <td className="px-4 py-3">{row.stageCounts.whatsapp_connected}</td>
                  <td className="px-4 py-3">{row.stageCounts.training_score_70_reached}</td>
                  <td className="px-4 py-3">{row.stageCounts.ai_enabled}</td>
                  <td className="px-4 py-3">{row.stageCounts.first_ai_response_sent}</td>
                  <td className="px-4 py-3 font-semibold text-primary">{formatPercent(row.conversionToActivated)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableShell>

      <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Aquisição paga por campanha</h3>
          <p className="text-sm text-gray-400">Funil de qualidade do signup até a ativação em 7 dias.</p>
        </div>
        {acquisitionError ? <p className="text-sm text-red-300">Falha ao carregar aquisição paga: {acquisitionError}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricCard
            label="Signup → WhatsApp conectado"
            value={formatPercent(acquisitionRates.signupToWhatsappConnected)}
            detail={`${acquisitionTotals.whatsappConnected}/${acquisitionTotals.signups}`}
            icon={Smartphone}
          />
          <MetricCard
            label="Signup → Score 70+"
            value={formatPercent(acquisitionRates.signupToScore70)}
            detail={`${acquisitionTotals.score70}/${acquisitionTotals.signups}`}
            icon={BarChart3}
          />
          <MetricCard
            label="Signup → 1ª resposta IA"
            value={formatPercent(acquisitionRates.signupToFirstAiResponse)}
            detail={`${acquisitionTotals.activated}/${acquisitionTotals.signups}`}
            icon={CheckCircle2}
          />
          <MetricCard
            label="Activation 7d"
            value={formatPercent(acquisitionRates.activation7d)}
            detail={`${acquisitionTotals.activated7d}/${acquisitionTotals.signups}`}
            icon={Rocket}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-lighter/60">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface">
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3 font-semibold">Coorte</th>
                <th className="px-4 py-3 font-semibold">Campanha</th>
                <th className="px-4 py-3 font-semibold">Fonte</th>
                <th className="px-4 py-3 font-semibold">Signups</th>
                <th className="px-4 py-3 font-semibold">Conectados</th>
                <th className="px-4 py-3 font-semibold">Score 70+</th>
                <th className="px-4 py-3 font-semibold">1ª resposta IA</th>
                <th className="px-4 py-3 font-semibold">Activation 7d</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={8} text="Carregando aquisição..." />
              ) : acquisitionRows.length === 0 ? (
                <EmptyRow colSpan={8} text="Nenhum dado de aquisição paga no período." />
              ) : (
                acquisitionRows.map((row) => (
                  <tr key={`${row.cohortStartMs}:${row.campaignKey}:${row.sourceKey}`} className="border-t border-surface-lighter/50 text-gray-200">
                    <td className="px-4 py-3">{formatDate(row.cohortStartMs)}</td>
                    <td className="px-4 py-3">{row.campaignKey}</td>
                    <td className="px-4 py-3">{row.sourceKey}</td>
                    <td className="px-4 py-3">{row.signups}</td>
                    <td className="px-4 py-3">{row.stageCounts.whatsapp_connected} ({formatPercent(row.rates.signup_to_whatsapp_connected)})</td>
                    <td className="px-4 py-3">{row.stageCounts.training_score_70_reached} ({formatPercent(row.rates.signup_to_training_score_70_reached)})</td>
                    <td className="px-4 py-3">{row.stageCounts.first_ai_response_sent} ({formatPercent(row.rates.signup_to_first_ai_response_sent)})</td>
                    <td className="px-4 py-3 font-semibold text-primary">{row.stageCounts.account_activated_7d} ({formatPercent(row.rates.activation_7d)})</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Afiliados</h3>
          <p className="text-sm text-gray-400">
            Cliques e visitantes usam a data do clique. O funil usa a coorte de signup atribuído no intervalo.
          </p>
        </div>
        {affiliateError ? <p className="text-sm text-red-300">Falha ao carregar afiliados: {affiliateError}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Cliques"
            value={formatNumber(affiliateSummary.clicks)}
            detail={`${formatNumber(affiliateSummary.uniqueVisitors)} visitantes únicos`}
            icon={Link2}
          />
          <MetricCard
            label="Signups atribuídos"
            value={formatNumber(affiliateSummary.signups)}
            detail={`${formatNumber(affiliateSummary.checkoutStarted)} checkouts iniciados`}
            icon={Rocket}
          />
          <MetricCard
            label="Assinaturas criadas"
            value={formatNumber(affiliateSummary.subscriptionsCreated)}
            detail={`${formatPercent(affiliateSummary.signups > 0 ? affiliateSummary.subscriptionsCreated / affiliateSummary.signups : 0)} do cohort`}
            icon={CheckCircle2}
          />
          <MetricCard
            label="Primeiros pagamentos"
            value={formatNumber(affiliateSummary.firstPaymentsConfirmed)}
            detail={`${formatPercent(affiliateSummary.signups > 0 ? affiliateSummary.firstPaymentsConfirmed / affiliateSummary.signups : 0)} do cohort`}
            icon={BarChart3}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-lighter/60">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface">
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3 font-semibold">Afiliado</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Link</th>
                <th className="px-4 py-3 font-semibold">Cliques</th>
                <th className="px-4 py-3 font-semibold">Visitantes</th>
                <th className="px-4 py-3 font-semibold">Signups</th>
                <th className="px-4 py-3 font-semibold">Checkout</th>
                <th className="px-4 py-3 font-semibold">Assinaturas</th>
                <th className="px-4 py-3 font-semibold">Pagamentos</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={9} text="Carregando afiliados..." />
              ) : affiliateRows.length === 0 ? (
                <EmptyRow colSpan={9} text="Nenhum afiliado encontrado para o período." />
              ) : (
                affiliateRows.map((row) => (
                  <tr key={row.affiliateCode} className="border-t border-surface-lighter/50 text-gray-200">
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="font-medium text-white">{row.affiliateName || row.affiliateCode}</div>
                        <div className="text-xs text-gray-400">{row.affiliateCode}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          row.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-300'
                        }`}
                      >
                        {row.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{row.sharePath}</td>
                    <td className="px-4 py-3">{formatNumber(row.clicks)}</td>
                    <td className="px-4 py-3">{formatNumber(row.uniqueVisitors)}</td>
                    <td className="px-4 py-3">{formatNumber(row.signups)}</td>
                    <td className="px-4 py-3">{formatNumber(row.checkoutStarted)}</td>
                    <td className="px-4 py-3">{formatNumber(row.subscriptionsCreated)}</td>
                    <td className="px-4 py-3 font-semibold text-primary">{formatNumber(row.firstPaymentsConfirmed)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Prospecção por feedback</h3>
          <p className="text-sm text-gray-400">Resultados da campanha sistêmica que aborda usuários atendidos positivamente pela IA.</p>
        </div>
        {prospectingError ? <p className="text-sm text-red-300">Falha ao carregar prospecção: {prospectingError}</p> : null}
        <div
          className={`rounded-2xl border p-4 ${
            prospectingNeedsAttention
              ? prospectingDiagnosticsTone === 'critical'
                ? 'border-red-400/40 bg-red-500/10'
                : 'border-amber-400/40 bg-amber-500/10'
              : 'border-surface-lighter/70 bg-surface/40'
          }`}
        >
          <div className="flex gap-3">
            <AlertTriangle
              className={`mt-0.5 h-4 w-4 flex-none ${
                prospectingNeedsAttention
                  ? prospectingDiagnosticsTone === 'critical'
                    ? 'text-red-300'
                    : 'text-amber-300'
                  : 'text-primary'
              }`}
            />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-white">
                {prospectingNeedsAttention
                  ? formatProspectingDiagnosticHeadline(prospectingDiagnostics)
                  : 'Conta emissora resolvida e resumo operacional consistente no intervalo.'}
              </p>
              <p className="text-gray-300">
                Conta emissora: {prospectingDiagnostics.senderEmail ?? 'não configurada'} · sessão:{' '}
                <span className="font-mono text-xs">{prospectingDiagnostics.senderSessionId ?? 'não resolvida'}</span>
              </p>
              <p className="text-gray-400">
                Última nota: {formatDateTime(prospectingDiagnostics.lastScoreAtMs)} · score_received bruto:{' '}
                {formatNumber(prospectingDiagnostics.rawScoreEvents)} · notas detectadas nas conversas:{' '}
                {formatNumber(prospectingDiagnostics.scoreCandidatesDetected)}
              </p>
              {prospectingDiagnostics.failureReason ? (
                <p className="text-xs text-gray-400">Motivo: {prospectingDiagnostics.failureReason}</p>
              ) : null}
              {prospectingDiagnostics.missingScoreEvents > 0 ? (
                <p className="text-xs text-gray-300">
                  Gap identificado: {formatNumber(prospectingDiagnostics.missingScoreEvents)} conversa(s) com nota detectável ainda
                  sem `score_received`.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Qualificados"
            value={String(prospectingSummary.qualified)}
            detail="Conversas elegíveis"
            icon={MessageSquareText}
            href={prospectingFeedbackHref('qualified')}
          />
          <MetricCard
            label="Abordagens enviadas"
            value={String(prospectingSummary.approachesSent)}
            detail="Mensagens iniciais"
            icon={Rocket}
            href={prospectingFeedbackHref('approachesSent')}
          />
          <MetricCard
            label="Feedbacks recebidos"
            value={String(prospectingSummary.feedbacksReceived)}
            detail="Notas capturadas"
            icon={CheckCircle2}
            href={prospectingFeedbackHref('feedbacksReceived')}
          />
          <MetricCard
            label="Nota média"
            value={formatAverageScore(prospectingSummary.averageScore)}
            detail="Média de 1 a 10"
            icon={Percent}
            href={prospectingFeedbackHref('averageScore')}
          />
          <MetricCard
            label="Ofertas enviadas"
            value={String(prospectingSummary.offersSent)}
            detail="CTAs comerciais"
            icon={BarChart3}
            href={prospectingFeedbackHref('offersSent', { scoreMin: 7 })}
          />
          <MetricCard label="Timeouts / opt-out" value={`${prospectingSummary.timeoutsNoScore} / ${prospectingSummary.optOuts}`} detail="Sem nota / descadastro" icon={ShieldOff} />
        </div>
      </div>
    </section>
  )
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

function TableShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light">
      <div className="border-b border-surface-lighter/60 px-4 py-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-gray-400">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function EmptyRow({ colSpan, text, tone = 'muted' }: { colSpan: number; text: string; tone?: 'muted' | 'error' }) {
  return (
    <tr>
      <td colSpan={colSpan} className={`px-4 py-6 text-center ${tone === 'error' ? 'text-red-300' : 'text-gray-400'}`}>
        {text}
      </td>
    </tr>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  href
}: {
  label: string
  value: string
  detail: string
  icon: ComponentType<{ className?: string }>
  href?: string | null
}) {
  const content = (
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

  if (!href) {
    return content
  }

  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:opacity-95">
      {content}
    </Link>
  )
}

function toDateInput(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

function parseDateInputToMs(value: string, mode: 'start' | 'end'): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const suffix = mode === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'
  const parsed = Date.parse(`${trimmed}${suffix}`)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPercent(value: number) {
  const safe = Number.isFinite(value) ? value : 0
  return `${(safe * 100).toFixed(1)}%`
}

function formatAverageScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0'
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('pt-BR') : '0'
}

function formatDate(valueMs: number) {
  if (!Number.isFinite(valueMs)) {
    return '-'
  }
  return new Date(valueMs).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatDateTime(valueMs: number | null) {
  if (!valueMs || !Number.isFinite(valueMs)) {
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

function formatProspectingDiagnosticHeadline(diagnostics: ProspectingDiagnostics) {
  switch (diagnostics.lookupStatus) {
    case 'disabled':
      return 'A campanha está desativada nas configurações globais.'
    case 'sender_email_missing':
      return 'A conta emissora da prospecção não está configurada.'
    case 'sender_lookup_failed':
      return 'Não foi possível resolver a sessão da conta emissora para montar o resumo.'
    default:
      if (diagnostics.missingScoreEvents > 0) {
        return 'Existem notas detectáveis nas conversas que ainda não viraram eventos de score.'
      }
      return 'Resumo operacional disponível.'
  }
}

function emptyProspectingSummary(): ProspectingSummary {
  return {
    qualified: 0,
    approachesSent: 0,
    feedbacksReceived: 0,
    averageScore: 0,
    offersSent: 0,
    timeoutsNoScore: 0,
    optOuts: 0
  }
}

function emptyProspectingDiagnostics(): ProspectingDiagnostics {
  return {
    enabled: false,
    senderEmail: null,
    senderSessionId: null,
    lookupStatus: 'disabled',
    failureReason: null,
    lastScoreAtMs: null,
    rawScoreEvents: 0,
    scoreCandidatesDetected: 0,
    missingScoreEvents: 0,
    missingCommentEvents: 0
  }
}

function emptyAffiliateSummary(): AffiliateFunnelSummary {
  return {
    clicks: 0,
    uniqueVisitors: 0,
    signups: 0,
    checkoutStarted: 0,
    subscriptionsCreated: 0,
    firstPaymentsConfirmed: 0
  }
}

function normalizeAffiliateSummary(summary?: Partial<AffiliateFunnelSummary>): AffiliateFunnelSummary {
  return {
    clicks: Number(summary?.clicks ?? 0),
    uniqueVisitors: Number(summary?.uniqueVisitors ?? 0),
    signups: Number(summary?.signups ?? 0),
    checkoutStarted: Number(summary?.checkoutStarted ?? 0),
    subscriptionsCreated: Number(summary?.subscriptionsCreated ?? 0),
    firstPaymentsConfirmed: Number(summary?.firstPaymentsConfirmed ?? 0)
  }
}
