'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, Wallet } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { useI18n } from '@/lib/i18n/client'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { WHATSAPP_LINK } from '@/lib/contact'

type CreditBalance = {
  balanceBrl: number
  blockedAt: number | null
  blockedReason: string | null
  updatedAt: number
}

type BillingSubscription = {
  stripeSubscriptionId: string | null
  status: string
  priceId: string | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  updatedAt: number
}

type BillingPaymentMethod = {
  stripePaymentMethodId: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  updatedAt: number
}

type BillingOverview = {
  customer: { stripeCustomerId: string; email: string | null; updatedAt: number } | null
  subscription: BillingSubscription | null
  paymentMethod: BillingPaymentMethod | null
}

type BillingPlanPricing = {
  enabled: boolean
  priceActive: boolean | null
  unitAmountCents: number | null
  currency: string | null
  interval: 'month' | 'year' | null
}

type BillingPlansCatalog = {
  pro_monthly: BillingPlanPricing
  pro_annual: BillingPlanPricing
  enterprise_annual: BillingPlanPricing
}

type BillingOverviewResponse = {
  success?: boolean
  stripeConfigured?: boolean
  billing?: BillingOverview | null
  plans?: BillingPlansCatalog | null
  credits?: CreditBalance | null
  error?: string
}

type CheckoutResponse = {
  success?: boolean
  url?: string
  error?: string
}

export function AssinaturaCreditosTab(props: { billingReturn?: 'success' | 'cancel' | null }) {
  const { user } = useAuth()
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    stripeConfigured: boolean
    billing: BillingOverview | null
    plans: BillingPlansCatalog | null
    credits: CreditBalance | null
  } | null>(null)

  const fetchWithAuth = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
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

    const { payload, rawText } = await parseResponsePayload<T>(response)
    if (!response.ok) {
      const message = buildHttpErrorMessage(response.status, payload, rawText)
      throw new Error(message)
    }

    return (payload ?? ({} as T)) as T
  }, [])

  const formatBillingError = useCallback((message: string) => {
    if (message === 'already_subscribed') {
      return tr(
        'Você já possui uma assinatura. Use o botão "Gerenciar" para trocar cartão ou cancelar.',
        'You already have an active subscription. Use "Manage" to change your card or cancel.'
      )
    }
    if (message === 'pro_subscription_required') {
      return tr(
        'Para comprar créditos, você precisa de um Plano Pro ou Enterprise ativo. Assine ou regularize em "Gerenciar".',
        'To buy credits, you need an active Pro or Enterprise plan. Subscribe or fix it in "Manage".'
      )
    }
    if (message === 'stripe_not_configured') {
      return tr(
        'Pagamentos não estão configurados. Contate o suporte/administrador.',
        'Payments are not configured. Contact support/administrator.'
      )
    }
    if (message === 'stripe_price_annual_missing') {
      return tr(
        'Plano anual indisponível no momento. Contate o suporte/administrador.',
        'Annual plan is unavailable right now. Contact support/administrator.'
      )
    }
    if (message === 'stripe_price_enterprise_missing') {
      return tr(
        'Plano Enterprise indisponível no momento. Contate o suporte/administrador.',
        'Enterprise plan is unavailable right now. Contact support/administrator.'
      )
    }
    if (message === 'stripe_price_enterprise_conflicts_annual') {
      return tr(
        'Configuração inválida: o Price ID do Enterprise está igual ao Pro anual.',
        'Invalid configuration: Enterprise Price ID matches Pro annual.'
      )
    }
    if (message === 'stripe_price_enterprise_conflicts_monthly') {
      return tr(
        'Configuração inválida: o Price ID do Enterprise está igual ao Pro mensal.',
        'Invalid configuration: Enterprise Price ID matches Pro monthly.'
      )
    }
    if (message === 'stripe_price_monthly_missing') {
      return tr(
        'Pagamentos não estão configurados. Contate o suporte/administrador.',
        'Payments are not configured. Contact support/administrator.'
      )
    }
    if (message === 'backend_admin_key_missing' || message === 'backend_url_missing') {
      return tr('Erro interno de configuração. Contate o suporte.', 'Internal configuration error. Contact support.')
    }
    return message
  }, [tr])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchWithAuth<BillingOverviewResponse>('/api/billing/overview')
      setData({
        stripeConfigured: Boolean(payload.stripeConfigured),
        billing: payload.billing ?? null,
        plans: payload.plans ?? null,
        credits: payload.credits ?? null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : tr('Erro ao carregar dados', 'Failed to load data')
      setError(formatBillingError(message))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, formatBillingError, tr])

  useEffect(() => {
    if (!user?.uid) {
      setData(null)
      setError(null)
      return
    }

    void load()
  }, [user?.uid, load])

  useEffect(() => {
    if (props.billingReturn !== 'success') {
      return
    }

    let cancelled = false
    let remaining = 20000
    const intervalMs = 2500

    const tick = async () => {
      if (cancelled) return
      remaining -= intervalMs
      await load()
      if (remaining <= 0) {
        clearInterval(timer)
      }
    }

    const timer = setInterval(() => {
      void tick()
    }, intervalMs)

    // Initial immediate refresh
    void tick()

    // Clear query param to avoid repeated refresh loops.
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('billing')
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore
    }

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [props.billingReturn, load])

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat(isEn ? 'en-US' : 'pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }, [isEn])

  const formatPlanPrice = useCallback((plan: BillingPlanPricing | null) => {
    if (!plan?.enabled) {
      return null
    }
    if (typeof plan.unitAmountCents !== 'number' || !plan.currency) {
      return null
    }
    try {
      const currency = plan.currency.toUpperCase()
      return new Intl.NumberFormat(isEn ? 'en-US' : 'pt-BR', { style: 'currency', currency }).format(plan.unitAmountCents / 100)
    } catch {
      return null
    }
  }, [isEn])

  const formatDate = useCallback((timestamp?: number | null) => {
    if (!timestamp) return '--'
    try {
      return new Intl.DateTimeFormat(isEn ? 'en-US' : 'pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date(timestamp))
    } catch {
      return '--'
    }
  }, [isEn])

  const subscriptionLabel = useMemo(() => {
    const status = data?.billing?.subscription?.status ?? null
    if (!status) return tr('Sem assinatura', 'No subscription')
    if (status === 'active') return tr('Ativa', 'Active')
    if (status === 'trialing') return tr('Em teste', 'Trialing')
    if (status === 'past_due') return tr('Pagamento pendente', 'Payment pending')
    if (status === 'unpaid') return tr('Inadimplente', 'Unpaid')
    if (status === 'canceled') return tr('Cancelada', 'Canceled')
    if (status === 'incomplete') return tr('Incompleta', 'Incomplete')
    if (status === 'incomplete_expired') return tr('Expirada', 'Expired')
    if (status === 'paused') return tr('Pausada', 'Paused')
    return status
  }, [data?.billing?.subscription?.status, tr])

  const subscriptionPill = useMemo(() => {
    const status = data?.billing?.subscription?.status ?? null
    if (!status) {
      return 'bg-surface-lighter/30 text-gray-300 border-surface-lighter'
    }
    if (status === 'active' || status === 'trialing') {
      return 'bg-green-500/10 text-green-400 border-green-500/20'
    }
    if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') {
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
    }
    if (status === 'canceled' || status === 'incomplete_expired') {
      return 'bg-red-500/10 text-red-400 border-red-500/20'
    }
    return 'bg-surface-lighter/30 text-gray-300 border-surface-lighter'
  }, [data?.billing?.subscription?.status])

  const runCheckout = useCallback(
    async (path: string, body: Record<string, unknown>, loadingKey: string) => {
      setActionLoading(loadingKey)
      setError(null)
      try {
        const payload = await fetchWithAuth<CheckoutResponse>(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })

        const url = payload?.url
        if (!url) {
          throw new Error('checkout_url_missing')
        }

        window.location.href = url
      } catch (err) {
        const message = err instanceof Error ? err.message : tr('Erro ao iniciar pagamento', 'Failed to start payment')
        setError(formatBillingError(message))
      } finally {
        setActionLoading(null)
      }
    },
    [fetchWithAuth, formatBillingError, tr]
  )

  const handleSubscribeMonthly = useCallback(() => {
    void runCheckout(
      '/api/billing/subscription/checkout',
      { plan: 'pro_monthly', email: user?.email ?? null },
      'subscribe_monthly'
    )
  }, [runCheckout, user?.email])

  const handleSubscribeEnterprise = useCallback(() => {
    void runCheckout(
      '/api/billing/subscription/checkout',
      { plan: 'enterprise_annual', email: user?.email ?? null },
      'subscribe_enterprise'
    )
  }, [runCheckout, user?.email])

  const handlePortal = useCallback(() => {
    void runCheckout('/api/billing/portal', { email: user?.email ?? null }, 'portal')
  }, [runCheckout, user?.email])

  const handleBuyCredits = useCallback(
    (packageId: '20' | '50' | '100') => {
      void runCheckout(
        '/api/billing/credits/checkout',
        { packageId, email: user?.email ?? null },
        `credits_${packageId}`
      )
    },
    [runCheckout, user?.email]
  )

  const followUpAddOnHref = useMemo(
    () =>
      `${WHATSAPP_LINK}?text=${encodeURIComponent(
        isEn
          ? 'Hello! I want to activate the follow-up add-on for all clients (BRL 100/month).'
          : 'Olá! Quero ativar o add-on de follow-up para todos os clientes (R$ 100/mês).'
      )}`,
    [isEn]
  )

  const balance = data?.credits?.balanceBrl ?? 0
  const isBlocked = data?.credits ? balance <= 0 || Boolean(data.credits.blockedAt) : false
  const paymentMethod = data?.billing?.paymentMethod ?? null
  const subscriptionStatus = data?.billing?.subscription?.status ?? null
  const canSubscribe = !subscriptionStatus || subscriptionStatus === 'canceled' || subscriptionStatus === 'incomplete_expired'
  const canBuyCredits = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'

  const monthlyPlan = data?.plans?.pro_monthly ?? null
  const enterprisePlan = data?.plans?.enterprise_annual ?? null
  const monthlyPlanEnabled = monthlyPlan ? monthlyPlan.enabled && monthlyPlan.priceActive !== false : true
  const enterprisePlanEnabled = enterprisePlan ? enterprisePlan.enabled && enterprisePlan.priceActive !== false : true
  const enterprisePriceLabel = enterprisePlanEnabled ? formatPlanPrice(enterprisePlan) ?? '--' : tr('Indisponivel', 'Unavailable')

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            {tr('Assinatura e créditos', 'Subscription and credits')}
          </h2>
          <p className="text-sm text-gray-400">
            {tr('Modelo pay-per-use: mantenha seus créditos recarregados para usar a IA.', 'Pay-per-use model: keep your credits topped up to run AI.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading || actionLoading !== null}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loading ? 'animate-spin' : '')} />
            {tr('Atualizar', 'Refresh')}
          </Button>
        </div>
      </div>

      {props.billingReturn === 'success' ? (
        <div className="flex items-start gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">
          <CheckCircle2 className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('Pagamento concluído', 'Payment completed')}</p>
            <p className="text-xs text-green-200/80">
              {tr(
                'Estamos atualizando sua assinatura/créditos. Isso pode levar alguns segundos.',
                'We are updating your subscription/credits. This may take a few seconds.'
              )}
            </p>
          </div>
        </div>
      ) : null}

      {props.billingReturn === 'cancel' ? (
        <div className="flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('Pagamento cancelado', 'Payment canceled')}</p>
            <p className="text-xs text-yellow-200/80">{tr('Nenhuma cobrança foi concluída.', 'No charge was completed.')}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('Falha', 'Failure')}</p>
            <p className="text-xs text-red-200/80">{error}</p>
          </div>
        </div>
      ) : null}

      {!data?.stripeConfigured ? (
        <div className="flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('Pagamentos não configurados', 'Payments not configured')}</p>
            <p className="text-xs text-yellow-200/80">
              {tr(
                'As variáveis do Stripe ainda não estão configuradas no backend. Contate o suporte/administrador.',
                'Stripe variables are not configured on backend yet. Contact support/administrator.'
              )}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
        <p className="text-sm font-semibold text-primary">
          {tr('Regras de plano e cobrança', 'Plan and billing rules')}
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-surface/40">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-surface/70 text-gray-300">
              <tr>
                <th className="px-3 py-2 font-semibold">{tr('Modelo', 'Model')}</th>
                <th className="px-3 py-2 font-semibold">{tr('Mensalidade', 'Monthly fee')}</th>
                <th className="px-3 py-2 font-semibold">{tr('Custo IA/mensagem', 'AI cost/message')}</th>
                <th className="px-3 py-2 font-semibold">{tr('Recursos incluídos', 'Included features')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-gray-200">
              <tr>
                <td className="px-3 py-2 font-semibold text-white">{tr('Plano Básico', 'Basic')}</td>
                <td className="px-3 py-2">{tr('Sem mensalidade fixa', 'No fixed monthly fee')}</td>
                <td className="px-3 py-2">R$ 0,15</td>
                <td className="px-3 py-2">{tr('Funcionalidades essenciais + recarga de créditos', 'Essential features + credit top-up')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold text-white">Enterprise</td>
                <td className="px-3 py-2">R$ 300,00</td>
                <td className="px-3 py-2">R$ 0,05</td>
                <td className="px-3 py-2">{tr('Transmissão personalizada, agenda e pagamento integrados', 'Custom broadcasts, scheduling, and integrated payments')}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold text-white">{tr('Add-on Follow-up', 'Follow-up add-on')}</td>
                <td className="px-3 py-2">R$ 100,00</td>
                <td className="px-3 py-2">-</td>
                <td className="px-3 py-2">{tr('Follow-up para todos os clientes', 'Follow-up for all clients')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-light rounded-2xl border border-surface-lighter p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-gray-400">{tr('Status da assinatura', 'Subscription status')}</p>
              <div className="flex items-center gap-2">
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border', subscriptionPill)}>
                  {subscriptionLabel}
                </span>
                {data?.billing?.subscription?.cancelAtPeriodEnd ? (
                  <span className="text-xs text-yellow-300">{tr('Cancelamento agendado', 'Cancellation scheduled')}</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handlePortal}
                variant="outline"
                className="gap-2"
                disabled={!data?.stripeConfigured || actionLoading !== null}
              >
                <ExternalLink className="w-4 h-4" />
                {tr('Gerenciar', 'Manage')}
              </Button>
              <Button
                type="button"
                onClick={handleSubscribeMonthly}
                disabled={!data?.stripeConfigured || actionLoading !== null || !canSubscribe || !monthlyPlanEnabled}
              >
                {actionLoading === 'subscribe_monthly' ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('Ativar Básico', 'Activate Basic')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSubscribeEnterprise}
                disabled={!data?.stripeConfigured || actionLoading !== null || !canSubscribe || !enterprisePlanEnabled}
              >
                {actionLoading === 'subscribe_enterprise' ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('Ativar Enterprise', 'Activate Enterprise')}
              </Button>
              <ButtonLink
                href={followUpAddOnHref}
                target="_blank"
                rel="noreferrer noopener"
                variant="outline"
                className="h-11"
              >
                {tr('Ativar Follow-up', 'Activate Follow-up')}
              </ButtonLink>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-2 text-xs text-gray-400">
            <p>
              {tr('Básico', 'Basic')}: <span className="text-white font-semibold">{tr('Pay-per-use', 'Pay-per-use')}</span>
            </p>
            <p>
              {tr('Custo IA no Básico', 'Basic AI cost')}: <span className="text-white font-semibold">R$ 0,15</span> {tr('por mensagem', 'per message')}
            </p>
            <p>
              Enterprise: <span className="text-white font-semibold">{enterprisePriceLabel}</span> / {tr('mes', 'month')}
            </p>
          </div>

          <div className="rounded-xl border border-surface-lighter bg-surface p-4">
            <p className="text-xs text-gray-500">{tr('Add-on Follow-up', 'Follow-up add-on')}</p>
            <p className="text-sm text-white font-semibold mt-1">R$ 100,00 / {tr('mes', 'month')}</p>
            <p className="text-xs text-gray-400 mt-1">
              {tr(
                'Ative para incluir follow-up automático em todos os clientes.',
                'Enable to include automatic follow-up for all clients.'
              )}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-surface-lighter p-4">
              <p className="text-xs text-gray-500">{tr('Proxima renovação', 'Next renewal')}</p>
              <p className="text-sm text-white font-semibold mt-1">
                {formatDate(data?.billing?.subscription?.currentPeriodEnd)}
              </p>
            </div>
            <div className="bg-surface rounded-xl border border-surface-lighter p-4">
              <p className="text-xs text-gray-500">{tr('Cartão', 'Card')}</p>
              <p className="text-sm text-white font-semibold mt-1">
                {paymentMethod
                  ? `${paymentMethod.brand ?? tr('Cartão', 'Card')} •••• ${paymentMethod.last4 ?? '----'}`
                  : '--'}
              </p>
              {paymentMethod?.expMonth && paymentMethod?.expYear ? (
                <p className="text-xs text-gray-500 mt-1">
                  {tr('Validade', 'Expires')}: {String(paymentMethod.expMonth).padStart(2, '0')}/{paymentMethod.expYear}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="bg-surface-light rounded-2xl border border-surface-lighter p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">{tr('Créditos', 'Credits')}</p>
            <Wallet className="w-5 h-5 text-primary" />
          </div>

          <div>
            <p className="text-2xl font-bold text-white">{formatCurrency(balance)}</p>
            <p className="text-xs text-gray-500 mt-1">
              {isBlocked
                ? tr('IA bloqueada por falta de créditos', 'AI blocked due to missing credits')
                : tr('Saldo disponível para consumo da IA', 'Available balance for AI usage')}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['20', '50', '100'] as const).map((packageId) => (
              <Button
                key={packageId}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleBuyCredits(packageId)}
                disabled={!data?.stripeConfigured || actionLoading !== null || !canBuyCredits}
              >
                {actionLoading === `credits_${packageId}` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  `+ ${formatCurrency(Number(packageId))}`
                )}
              </Button>
            ))}
          </div>

          {!canBuyCredits ? (
            <p className="text-xs text-yellow-200/80">
              {tr(
                'Para comprar créditos, você precisa de um plano ativo no Stripe. Use Ativar Básico, Ativar Enterprise ou Gerenciar.',
                'To buy credits, you need an active Stripe plan. Use Activate Basic, Activate Enterprise, or Manage.'
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              {tr('Os créditos são pre-pagos e usados conforme o consumo da IA.', 'Credits are prepaid and consumed according to AI usage.')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
