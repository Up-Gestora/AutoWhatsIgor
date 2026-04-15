'use client'

import { DollarSign, Wallet, TrendingUp, Activity, AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { useI18n } from '@/lib/i18n/client'

type UsageTotals = {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  costUsd: number
  costBrl: number
  records: number
}

type UsageResponses = {
  count: number
  totalTokens: number
  costUsd: number
  costBrl: number
}

type UsageAverages = {
  costPerResponseUsd: number
  costPerResponseBrl: number
  tokensPerResponse: number
}

type UsageSeriesEntry = {
  day: string
  costUsd: number
  costBrl: number
  totalTokens: number
  responses: number
}

type UsageModelEntry = {
  provider: string
  model: string
  category?: 'ai' | 'broadcast'
  costUsd: number
  costBrl: number
  totalTokens: number
  responses: number
}

type UsageTotalsCombined = {
  costBrl: number
}

type BroadcastSummary = {
  sentMessages: number
  billedBlocks: number
  billedMessages: number
  costBrl: number
}

type UsageSummary = {
  fromMs: number
  toMs: number
  totals: UsageTotals
  totalsCombined?: UsageTotalsCombined
  responses: UsageResponses
  averages: UsageAverages
  series: UsageSeriesEntry[]
  models: UsageModelEntry[]
  broadcast?: BroadcastSummary
  pricingMissingCount: number
  credits?: CreditBalance | null
}

type UsageSummaryResponse = {
  success?: boolean
  summary?: UsageSummary
}

type FinanceiroPanelProps = {
  sessionId?: string
  title?: string
  subtitle?: string
}

type CreditBalance = {
  balanceBrl: number
  blockedAt: number | null
  blockedReason: string | null
  updatedAt: number
}

export function FinanceiroPanel({ sessionId, title, subtitle }: FinanceiroPanelProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const { user } = useAuth()
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWithAuth = useCallback(async <T,>(path: string): Promise<T> => {
    if (!auth?.currentUser) {
      throw new Error('auth_unavailable')
    }

    const token = await auth.currentUser.getIdToken()
    const response = await fetch(path, {
      headers: {
        authorization: `Bearer ${token}`
      }
    })

    const { payload, rawText } = await parseResponsePayload<T>(response)
    if (!response.ok) {
      const message = buildHttpErrorMessage(response.status, payload, rawText)
      throw new Error(message)
    }

    return (payload ?? ({} as T)) as T
  }, [])

  useEffect(() => {
    if (!user?.uid) {
      setSummary(null)
      return
    }

    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const now = Date.now()
        const fromMs = now - 30 * 24 * 60 * 60 * 1000
        const query = new URLSearchParams({
          fromMs: String(fromMs),
          toMs: String(now)
        })
        if (sessionId) {
          query.set('sessionId', sessionId)
        }
        const payload = await fetchWithAuth<UsageSummaryResponse>(`/api/financeiro/summary?${query.toString()}`)
        if (cancelled) return
        setSummary(payload.summary ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tr('Erro ao carregar dados', 'Failed to load data'))
          setSummary(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [fetchWithAuth, user?.uid, sessionId, tr])

  const formatCurrency = useCallback(
    (value: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
    [locale]
  )

  const formatUsd = useCallback((value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  }, [])

  const formatNumber = useCallback((value: number) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR').format(value), [locale])

  const chartData = useMemo(() => summary?.series ?? [], [summary?.series])
  const maxCost = useMemo(() => Math.max(...chartData.map((entry) => entry.costBrl), 0), [chartData])
  const credits = summary?.credits ?? null
  const isBlocked = credits ? credits.balanceBrl <= 0 || Boolean(credits.blockedAt) : false
  const points = useMemo(() => {
    if (chartData.length === 0) {
      return ''
    }
    const width = 600
    const height = 180
    const padding = 16
    const xStep = chartData.length > 1 ? (width - padding * 2) / (chartData.length - 1) : 0
    const yScale = maxCost > 0 ? (height - padding * 2) / maxCost : 0

    return chartData
      .map((entry, index) => {
        const x = padding + index * xStep
        const y = height - padding - entry.costBrl * yScale
        return `${x},${y}`
      })
      .join(' ')
  }, [chartData, maxCost])

  const cards = useMemo(() => {
    const totals = summary?.totals
    const totalsCombined = summary?.totalsCombined
    const responses = summary?.responses
    const averages = summary?.averages
    return [
      {
        label: tr('Gasto total (30d)', 'Total spend (30d)'),
        value: summary ? formatCurrency(totalsCombined?.costBrl ?? totals?.costBrl ?? 0) : '--',
        secondary: totals ? `${tr('IA', 'AI')}: ${formatUsd(totals.costUsd)}` : '--',
        icon: Wallet,
        accent: 'text-primary',
        bg: 'bg-primary/10'
      },
      {
        label: tr('Custo medio por resposta', 'Average cost per response'),
        value: averages ? formatCurrency(averages.costPerResponseBrl) : '--',
        secondary: averages ? formatUsd(averages.costPerResponseUsd) : '--',
        icon: TrendingUp,
        accent: 'text-green-400',
        bg: 'bg-green-400/10'
      },
      {
        label: tr('Tokens consumidos', 'Tokens consumed'),
        value: totals ? formatNumber(totals.totalTokens) : '--',
        secondary: totals
          ? `${formatNumber(totals.promptTokens)} ${tr('entrada', 'input')} / ${formatNumber(totals.completionTokens)} ${tr('saida', 'output')}`
          : '--',
        icon: Activity,
        accent: 'text-blue-400',
        bg: 'bg-blue-400/10'
      },
      {
        label: tr('Respostas da IA', 'AI responses'),
        value: responses ? formatNumber(responses.count) : '--',
        secondary: responses ? `${formatNumber(responses.totalTokens)} ${tr('tokens', 'tokens')}` : '--',
        icon: DollarSign,
        accent: 'text-yellow-400',
        bg: 'bg-yellow-400/10'
      }
    ]
  }, [summary, formatCurrency, formatUsd, formatNumber, tr])

  return (
    <div className="w-full space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-primary" />
            {title ?? tr('Financeiro', 'Billing')}
          </h1>
          <p className="text-gray-400">
            {subtitle ??
              tr(
                'Acompanhe o consumo de tokens da IA, custos em BRL e metricas por período.',
                'Track AI token usage, BRL costs, and metrics over time.'
              )}
          </p>
        </div>
      </div>

      {isBlocked ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('IA desativada por falta de créditos', 'AI disabled due to missing credits')}</p>
            <p className="text-xs text-red-200/80">
              {tr(
                'Seu saldo esta zerado. Recarregue os créditos para voltar a responder automaticamente.',
                'Your balance is zero. Top up credits to enable automatic replies again.'
              )}
            </p>
          </div>
        </div>
      ) : null}

      {summary?.pricingMissingCount ? (
        <div className="flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('Precos incompletos detectados', 'Incomplete pricing detected')}</p>
            <p className="text-xs text-yellow-200/80">
              {isEn
                ? `${summary.pricingMissingCount} records have no configured price. Update values in System Settings to calculate full cost.`
                : `${summary.pricingMissingCount} registros não possuem preco configurado. Atualize os valores em Configurações do Sistema para calcular o custo completo.`}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-surface-light border border-surface-lighter rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-6 h-6 ${card.accent}`} />
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-1">{card.label}</p>
            <h3 className="text-2xl font-bold text-white">{card.value}</h3>
            <p className="text-xs text-gray-500 mt-1">{card.secondary}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 bg-surface-light rounded-2xl border border-surface-lighter p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">{tr('Evolucao do gasto (BRL)', 'Spend trend (BRL)')}</h2>
            <span className="text-xs text-gray-500">{tr('Últimos 30 dias · IA + transmissão', 'Last 30 days · AI + broadcast')}</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400">{tr('Carregando dados...', 'Loading data...')}</div>
          ) : error ? (
            <div className="py-16 text-center text-red-400">{tr('Falha ao carregar dados.', 'Failed to load data.')}</div>
          ) : chartData.length === 0 ? (
            <div className="py-16 text-center text-gray-500">{tr('Sem consumo registrado neste período.', 'No usage recorded in this period.')}</div>
          ) : (
            <div className="space-y-4">
              <svg viewBox="0 0 600 180" className="w-full h-44">
                <polyline
                  fill="none"
                  stroke="url(#chartGradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
                <defs>
                  <linearGradient id="chartGradient" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="grid grid-cols-3 text-xs text-gray-500">
                <span>{chartData[0]?.day}</span>
                <span className="text-center">{tr('Pico', 'Peak')}: {formatCurrency(maxCost)}</span>
                <span className="text-right">{chartData[chartData.length - 1]?.day}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface-light rounded-2xl border border-surface-lighter p-6 space-y-6">
          <h2 className="text-lg font-bold text-white">{tr('Resumo do período', 'Period summary')}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{tr('Total de requisicoes IA', 'Total AI requests')}</span>
              <span className="text-white font-semibold">{summary ? formatNumber(summary.totals.records) : '--'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{tr('Respostas enviadas', 'Sent responses')}</span>
              <span className="text-white font-semibold">{summary ? formatNumber(summary.responses.count) : '--'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{tr('Tokens por resposta', 'Tokens per response')}</span>
              <span className="text-white font-semibold">
                {summary ? formatNumber(Math.round(summary.averages.tokensPerResponse)) : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{tr('Gasto total', 'Total spend')}</span>
              <span className="text-white font-semibold">
                {summary ? formatCurrency(summary.totalsCombined?.costBrl ?? summary.totals.costBrl) : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-light border border-surface-lighter rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-surface-lighter flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{tr('Consumo por modelo', 'Usage by model')}</h2>
          <span className="text-xs text-gray-500">{tr('BRL e tokens no período', 'BRL and tokens in period')}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-gray-400 text-xs font-medium uppercase tracking-wider">
                <th className="px-6 py-4">{tr('Modelo', 'Model')}</th>
                <th className="px-6 py-4">Provider</th>
                <th className="px-6 py-4">Tokens</th>
                <th className="px-6 py-4">{tr('Respostas', 'Responses')}</th>
                <th className="px-6 py-4 text-right">{tr('Custo (BRL)', 'Cost (BRL)')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-lighter">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-sm text-gray-400">
                    {tr('Carregando modelos...', 'Loading models...')}
                  </td>
                </tr>
              ) : !summary || summary.models.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-sm text-gray-500">
                    {tr('Nenhum consumo registrado.', 'No usage recorded.')}
                  </td>
                </tr>
              ) : (
                summary.models.map((entry) => (
                  <tr key={`${entry.provider}-${entry.model}`} className="hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-white font-medium">{entry.model}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">{entry.provider}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {entry.category === 'broadcast' ? '--' : formatNumber(entry.totalTokens)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">{formatNumber(entry.responses)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right text-green-400">
                      {formatCurrency(entry.costBrl)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

