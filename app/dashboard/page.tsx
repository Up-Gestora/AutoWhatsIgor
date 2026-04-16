'use client'

import {
  Users,
  UserCheck,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical,
  Bot,
  Brain,
  Calendar,
  FolderOpen,
  Megaphone,
  MessageSquare,
  QrCode,
  Settings,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { auth, db } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { emitOnboardingEventSafe } from '@/lib/onboarding/events'
import {
  GUIDED_TUTORIAL_ORDER,
  GUIDED_TUTORIAL_ROUTE_KEYS,
  markGuidedTutorialCompleted,
  markGuidedTutorialPending,
  type GuidedTutorialKey,
  readCompletedGuidedTutorials,
} from '@/lib/onboarding/guided-tutorials'
import type { OnboardingState } from '@/lib/onboarding/types'
import { doc, onSnapshot } from 'firebase/firestore'

type DashboardStats = {
  totalLeads: number
  totalClients: number
  aiMessages: number
  inboundMessages: number
  responseRate: number
  fromMs: number
  toMs: number
}

type ConversionCohortSummary = {
  fromMs: number
  toMs: number
  leadsCreated: number
  convertedLeads: number
  aiAssistedConvertedLeads: number
  conversionRate: number
  aiAssistedRate: number
}

type DashboardLead = {
  id: string
  name: string | null
  whatsapp: string | null
  chatId?: string | null
  status: 'novo' | 'inativo' | 'aguardando' | 'em_processo' | 'cliente'
  lastContact: number | null
  createdAt: number | null
  lastMessage?: string | null
}

type DashboardSummary = {
  success?: boolean
  stats?: DashboardStats
  recentLeads?: DashboardLead[]
  conversions?: ConversionCohortSummary
}

type CreditBalance = {
  balanceBrl: number
  blockedAt: number | null
  blockedReason: string | null
  updatedAt: number
}

type FinanceiroSummary = {
  success?: boolean
  summary?: {
    credits?: CreditBalance | null
    responses?: {
      count: number
    }
    averages?: {
      costPerResponseBrl: number
      tokensPerResponse: number
    }
  }
}

type OnboardingStatePayload = {
  success?: boolean
  state?: OnboardingState
}

const leadStatusStyles: Record<DashboardLead['status'], { className: string }> = {
  novo: { className: 'bg-primary/10 text-primary' },
  inativo: { className: 'bg-gray-400/10 text-gray-300' },
  aguardando: { className: 'bg-yellow-400/10 text-yellow-300' },
  em_processo: { className: 'bg-orange-400/10 text-orange-300' },
  cliente: { className: 'bg-green-400/10 text-green-400' }
}

const normalizeLeadStatus = (value: unknown): DashboardLead['status'] => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'em_atendimento') return 'em_processo'
  if (normalized === 'finalizado') return 'inativo'

  if (normalized === 'novo') return 'novo'
  if (normalized === 'inativo') return 'inativo'
  if (normalized === 'aguardando') return 'aguardando'
  if (normalized === 'em_processo') return 'em_processo'
  if (normalized === 'cliente') return 'cliente'

  return 'novo'
}

type GuidedTutorialCard = {
  key: GuidedTutorialKey
  icon: ComponentType<{ className?: string }>
  labelPt: string
  labelEn: string
  descriptionPt: string
  descriptionEn: string
}

const GUIDED_TUTORIAL_CARDS: GuidedTutorialCard[] = [
  {
    key: 'connections',
    icon: QrCode,
    labelPt: 'Conexões',
    labelEn: 'Connections',
    descriptionPt: 'Conecte o WhatsApp e valide a sessão com QR Code.',
    descriptionEn: 'Connect WhatsApp and validate the session with QR code.',
  },
  {
    key: 'training',
    icon: Brain,
    labelPt: 'Treinamento',
    labelEn: 'Training',
    descriptionPt: 'Configure modelo, instruções e regras da IA.',
    descriptionEn: 'Configure AI model, instructions, and rules.',
  },
  {
    key: 'conversations',
    icon: MessageSquare,
    labelPt: 'Conversas',
    labelEn: 'Conversations',
    descriptionPt: 'Entenda IA global, contexto e operação diária.',
    descriptionEn: 'Understand global AI, context, and daily operation.',
  },
  {
    key: 'leads',
    icon: Users,
    labelPt: 'Leads',
    labelEn: 'Leads',
    descriptionPt: 'Organize funil, follow-up e classificação comercial.',
    descriptionEn: 'Organize funnel, follow-up, and lead classification.',
  },
  {
    key: 'clients',
    icon: UserCheck,
    labelPt: 'Clientes',
    labelEn: 'Clients',
    descriptionPt: 'Gerencie status, próximos contatos e valor.',
    descriptionEn: 'Manage status, next contacts, and value.',
  },
  {
    key: 'calendar',
    icon: Calendar,
    labelPt: 'Agenda',
    labelEn: 'Calendar',
    descriptionPt: 'Configure agendas e rotina de agendamentos.',
    descriptionEn: 'Configure calendars and scheduling routine.',
  },
  {
    key: 'broadcasts',
    icon: Megaphone,
    labelPt: 'Transmissão',
    labelEn: 'Broadcasts',
    descriptionPt: 'Envie campanhas e acompanhe histórico.',
    descriptionEn: 'Send campaigns and track history.',
  },
  {
    key: 'files',
    icon: FolderOpen,
    labelPt: 'Arquivos',
    labelEn: 'Files',
    descriptionPt: 'Gerencie materiais usados pela operação.',
    descriptionEn: 'Manage materials used by the operation.',
  },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const { locale, toRoute } = useI18n()
  const router = useRouter()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const [userName, setUserName] = useState<string>('')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [conversions, setConversions] = useState<ConversionCohortSummary | null>(null)
  const [recentLeads, setRecentLeads] = useState<DashboardLead[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [credits, setCredits] = useState<CreditBalance | null>(null)
  const [aiUsage, setAiUsage] = useState<{ costPerResponseBrl: number; tokensPerResponse: number; responses: number } | null>(null)
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [showGuidedConnectionsIntro, setShowGuidedConnectionsIntro] = useState(false)
  const [completedGuidedTutorials, setCompletedGuidedTutorials] = useState<Set<GuidedTutorialKey>>(new Set())
  const [isGuidedTutorialDropdownOpen, setIsGuidedTutorialDropdownOpen] = useState(false)
  const dashboardViewEventRef = useRef(false)

  useEffect(() => {
    if (!user?.uid || !db) {
      setUserName('')
      return
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data()
          if (data?.nome) {
            const firstName = data.nome.trim().split(' ')[0]
            setUserName(firstName)
          } else {
            setUserName('')
          }
        } else {
          setUserName('')
        }
      },
      (error) => {
        console.error('Erro ao escutar mudanças no perfil:', error)
        setUserName('')
      }
    )

    return () => unsubscribe()
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) {
      dashboardViewEventRef.current = false
      return
    }
    if (dashboardViewEventRef.current) {
      return
    }
    dashboardViewEventRef.current = true
    void emitOnboardingEventSafe({
      sessionId: user.uid,
      eventName: 'dashboard_home_viewed'
    })
  }, [user?.uid])

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

  const loadGuidedTutorialProgress = useCallback(() => {
    if (!user?.uid) {
      setCompletedGuidedTutorials(new Set())
      return
    }
    const completed = readCompletedGuidedTutorials(user.uid)
    setCompletedGuidedTutorials(new Set(completed))
  }, [user?.uid])

  useEffect(() => {
    loadGuidedTutorialProgress()
  }, [loadGuidedTutorialProgress])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadGuidedTutorialProgress()
      }
    }
    const handleWindowFocus = () => {
      loadGuidedTutorialProgress()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [loadGuidedTutorialProgress])

  useEffect(() => {
    if (!user?.uid) {
      setStats(null)
      setConversions(null)
      setRecentLeads([])
      return
    }

    let cancelled = false
    const loadSummary = async () => {
      setSummaryLoading(true)
      setSummaryError(null)
      try {
        const fromMs = Date.now() - 30 * 24 * 60 * 60 * 1000
        const query = new URLSearchParams({
          fromMs: String(fromMs),
          recentLimit: '5'
        })
        const payload = await fetchWithAuth<DashboardSummary>(`/api/dashboard/summary?${query.toString()}`)
        if (cancelled) {
          return
        }
        setStats(payload.stats ?? null)
        setConversions(payload.conversions ?? null)
        const recent = Array.isArray(payload.recentLeads) ? payload.recentLeads : []
        setRecentLeads(
          recent.map((lead) => ({
            ...lead,
            status: normalizeLeadStatus((lead as any)?.status)
          }))
        )
      } catch (error) {
        if (!cancelled) {
          setSummaryError(error instanceof Error ? error.message : tr('Erro ao carregar dados', 'Failed to load data'))
          setStats(null)
          setConversions(null)
          setRecentLeads([])
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false)
        }
      }
    }

    void loadSummary()
    return () => {
      cancelled = true
    }
  }, [fetchWithAuth, tr, user?.uid])

  useEffect(() => {
    if (!user?.uid) {
      setOnboardingState(null)
      return
    }

    let cancelled = false
    const loadOnboardingState = async () => {
      setOnboardingLoading(true)
      try {
        const payload = await fetchWithAuth<OnboardingStatePayload>('/api/onboarding/state')
        if (cancelled) {
          return
        }
        setOnboardingState(payload.state ?? null)
      } catch (error) {
        if (!cancelled) {
          setOnboardingState(null)
        }
      } finally {
        if (!cancelled) {
          setOnboardingLoading(false)
        }
      }
    }

    void loadOnboardingState()
    const intervalId = setInterval(() => {
      void loadOnboardingState()
    }, 60_000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [fetchWithAuth, tr, user?.uid])

  useEffect(() => {
    if (!user?.uid) {
      setCredits(null)
      setAiUsage(null)
      return
    }

    let cancelled = false
    const loadCredits = async () => {
      try {
        const now = Date.now()
        const fromMs = now - 30 * 24 * 60 * 60 * 1000
        const query = new URLSearchParams({
          fromMs: String(fromMs),
          toMs: String(now)
        })
        const payload = await fetchWithAuth<FinanceiroSummary>(`/api/financeiro/summary?${query.toString()}`)
        if (!cancelled) {
          setCredits(payload.summary?.credits ?? null)

          const responsesCount = Number(payload.summary?.responses?.count ?? 0)
          const costPerResponseBrl = Number(payload.summary?.averages?.costPerResponseBrl ?? NaN)
          const tokensPerResponse = Number(payload.summary?.averages?.tokensPerResponse ?? NaN)
          if (
            Number.isFinite(responsesCount) &&
            Number.isFinite(costPerResponseBrl) &&
            Number.isFinite(tokensPerResponse)
          ) {
            setAiUsage({
              responses: responsesCount,
              costPerResponseBrl,
              tokensPerResponse
            })
          } else {
            setAiUsage(null)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setCredits(null)
          setAiUsage(null)
        }
      }
    }

    void loadCredits()
    return () => {
      cancelled = true
    }
  }, [fetchWithAuth, user?.uid])

  const formattedStats = useMemo(() => {
    const windowLabel = tr('Últimos 30d', 'Last 30d')
    return [
      {
        label: tr('Total de leads', 'Total leads'),
        value: stats ? stats.totalLeads.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR') : '--',
        change: windowLabel,
        trend: 'neutral',
        icon: Users,
        color: 'text-blue-400',
        bg: 'bg-blue-400/10'
      },
      {
        label: tr('AI messages', 'AI messages'),
        value: stats ? stats.aiMessages.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR') : '--',
        change: windowLabel,
        trend: 'neutral',
        icon: Bot,
        color: 'text-primary',
        bg: 'bg-primary/10'
      },
      {
        label: tr('Clientes cadastrados', 'Registered clients'),
        value: stats ? stats.totalClients.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR') : '--',
        change: windowLabel,
        trend: 'neutral',
        icon: UserCheck,
        color: 'text-purple-400',
        bg: 'bg-purple-400/10'
      },
      {
        label: tr('Taxa de resposta', 'Response rate'),
        value: stats ? `${(stats.responseRate * 100).toFixed(1)}%` : '--',
        change: windowLabel,
        trend: 'neutral',
        icon: TrendingUp,
        color: 'text-yellow-400',
        bg: 'bg-yellow-400/10'
      }
    ]
  }, [locale, stats, tr])

  const formatRelativeTime = useCallback((timestampMs: number | null) => {
    if (!timestampMs) {
      return tr('Sem data', 'No date')
    }
    const diffMs = timestampMs - Date.now()
    const absMs = Math.abs(diffMs)
    if (absMs < 60000) {
      return tr('Agora mesmo', 'Just now')
    }
    const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', { numeric: 'auto' })
    if (absMs < 3600000) {
      return rtf.format(Math.round(diffMs / 60000), 'minute')
    }
    if (absMs < 86400000) {
      return rtf.format(Math.round(diffMs / 3600000), 'hour')
    }
    if (absMs < 2592000000) {
      return rtf.format(Math.round(diffMs / 86400000), 'day')
    }
    return new Date(timestampMs).toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', {
      day: '2-digit',
      month: 'short'
    })
  }, [locale, tr])

  const resolveLeadDate = useCallback((lead: DashboardLead) => {
    return lead.lastContact ?? lead.createdAt ?? null
  }, [])

  const openLeadConversations = useCallback(
    (lead: DashboardLead) => {
      const query: Record<string, string | null | undefined> = {
        chatId: typeof lead.chatId === 'string' && lead.chatId.trim() ? lead.chatId.trim() : undefined,
        leadWhatsapp: typeof lead.whatsapp === 'string' && lead.whatsapp.trim() ? lead.whatsapp.trim() : undefined,
        leadName: typeof lead.name === 'string' && lead.name.trim() ? lead.name.trim() : undefined
      }

      router.push(
        toRoute('conversations', {
          query
        })
      )
    },
    [router, toRoute]
  )

  const openSettings = useCallback(() => {
    router.push(toRoute('settings'))
  }, [router, toRoute])

  const openConnections = useCallback(() => {
    router.push(toRoute('connections'))
  }, [router, toRoute])

  const openLeadsTable = useCallback(() => {
    router.push(toRoute('leads'))
  }, [router, toRoute])

  const greeting = userName ? (isEn ? `Hello, ${userName}!` : `Olá, ${userName}!`) : isEn ? 'Hello!' : 'Olá!'
  const isBlocked = credits ? credits.balanceBrl <= 0 || Boolean(credits.blockedAt) : false
  const isWhatsappConnected = onboardingState?.milestones?.whatsapp_connected?.reached === true

  const formatPercent = useCallback((ratio: number | null | undefined) => {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
      return '--'
    }
    return `${(ratio * 100).toFixed(1)}%`
  }, [])

  const clampPercent = useCallback((ratio: number | null | undefined) => {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
      return 0
    }
    return Math.max(0, Math.min(100, ratio * 100))
  }, [])

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }, [locale])

  const formatNumber = useCallback((value: number) => {
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR').format(value)
  }, [locale])

  const getLeadStatusLabel = useCallback(
    (status: DashboardLead['status']) => {
      if (status === 'novo') return tr('Novo', 'New')
      if (status === 'inativo') return tr('Inativo', 'Inactive')
      if (status === 'aguardando') return tr('Aguardando', 'Waiting')
      if (status === 'em_processo') return tr('Em processo', 'In progress')
      return tr('Cliente', 'Client')
    },
    [tr]
  )

  const guidedTutorialCompletedCount = useMemo(() => {
    return GUIDED_TUTORIAL_ORDER.reduce((count, tutorialKey) => {
      return completedGuidedTutorials.has(tutorialKey) ? count + 1 : count
    }, 0)
  }, [completedGuidedTutorials])

  const guidedTutorialTotalCount = GUIDED_TUTORIAL_ORDER.length
  const guidedTutorialProgressPercent =
    guidedTutorialTotalCount > 0
      ? (guidedTutorialCompletedCount / guidedTutorialTotalCount) * 100
      : 0

  const nextGuidedTutorialKey = useMemo<GuidedTutorialKey>(() => {
    const nextPending = GUIDED_TUTORIAL_ORDER.find((tutorialKey) => !completedGuidedTutorials.has(tutorialKey))
    return nextPending ?? 'connections'
  }, [completedGuidedTutorials])

  const nextGuidedTutorialCard = useMemo(() => {
    return GUIDED_TUTORIAL_CARDS.find((item) => item.key === nextGuidedTutorialKey) ?? GUIDED_TUTORIAL_CARDS[0]
  }, [nextGuidedTutorialKey])

  const openGuidedTutorial = useCallback((tutorialKey: GuidedTutorialKey) => {
    const routeKey = GUIDED_TUTORIAL_ROUTE_KEYS[tutorialKey]
    router.push(
      toRoute(routeKey, {
        query: {
          guidedOnboarding: '1',
          guidedTutorial: tutorialKey,
        },
      })
    )
  }, [router, toRoute])

  const startGuidedTutorial = useCallback(() => {
    openGuidedTutorial(nextGuidedTutorialKey)
  }, [nextGuidedTutorialKey, openGuidedTutorial])

  const setGuidedTutorialStatus = useCallback(
    (tutorialKey: GuidedTutorialKey, completed: boolean) => {
      if (!user?.uid) {
        return
      }

      const next = completed
        ? markGuidedTutorialCompleted(user.uid, tutorialKey)
        : markGuidedTutorialPending(user.uid, tutorialKey)

      setCompletedGuidedTutorials(new Set(next))
    },
    [user?.uid]
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.uid || onboardingLoading) {
      return
    }

    const decisionKey = `dashboard.guided_connections_intro.v1.${user.uid}`
    const hasDecision = window.localStorage.getItem(decisionKey)
    if (hasDecision) {
      setShowGuidedConnectionsIntro(false)
      return
    }

    const whatsappConnected = onboardingState?.milestones?.whatsapp_connected?.reached === true
    if (!whatsappConnected) {
      setShowGuidedConnectionsIntro(true)
    }
  }, [onboardingLoading, onboardingState?.milestones?.whatsapp_connected?.reached, user?.uid])

  const dismissGuidedConnectionsIntro = useCallback(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      window.localStorage.setItem(`dashboard.guided_connections_intro.v1.${user.uid}`, 'dismissed')
    }
    setShowGuidedConnectionsIntro(false)
  }, [user?.uid])

  const acceptGuidedConnectionsIntro = useCallback(() => {
    if (typeof window !== 'undefined' && user?.uid) {
      window.localStorage.setItem(`dashboard.guided_connections_intro.v1.${user.uid}`, 'accepted')
    }
    setShowGuidedConnectionsIntro(false)
    openGuidedTutorial('connections')
  }, [openGuidedTutorial, user?.uid])

  return (
    <div className="space-y-8 animate-fade-in">
      {showGuidedConnectionsIntro ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-surface-lighter bg-surface-light p-6 shadow-2xl">
            <button
              type="button"
              onClick={dismissGuidedConnectionsIntro}
              className="ml-auto mb-2 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-white"
              aria-label={tr('Fechar convite de onboarding', 'Close onboarding invite')}
            >
              ×
            </button>
            <h2 className="text-xl font-bold text-white">
              {tr('Quer um tutorial guiado rápido?', 'Want a quick guided tutorial?')}
            </h2>
            <p className="mt-2 text-sm text-gray-300">
              {tr(
                'Vamos te mostrar em etapas como conectar o WhatsApp e começar do jeito certo.',
                'We will guide you step by step to connect WhatsApp and start correctly.'
              )}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-surface-lighter bg-surface text-gray-200"
                onClick={dismissGuidedConnectionsIntro}
              >
                {tr('Agora não', 'Not now')}
              </Button>
              <Button type="button" className="bg-primary text-black hover:bg-primary/90" onClick={acceptGuidedConnectionsIntro}>
                {tr('Iniciar tutorial guiado', 'Start guided tutorial')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Welcome Section */} 
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{greeting}</h1>
          <p className="text-gray-400">{tr('Aqui esta o que esta acontecendo com suas automacoes hoje.', 'Here is what is happening with your automations today.')}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-lighter bg-surface-light p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{tr('Configurações', 'Settings')}</h2>
              <p className="mt-1 text-sm text-gray-400">
                {tr(
                  'Acesse os ajustes da conta e conecte seu WhatsApp quando precisar.',
                  'Access account settings and connect your WhatsApp whenever needed.'
                )}
              </p>
              <div
                className={cn(
                  'mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold',
                  isWhatsappConnected
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isWhatsappConnected ? tr('WhatsApp conectado', 'WhatsApp connected') : tr('WhatsApp pendente', 'WhatsApp pending')}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-surface-lighter bg-surface text-gray-200"
              onClick={openSettings}
            >
              {tr('Abrir Configurações', 'Open Settings')}
            </Button>
            <Button
              type="button"
              className="bg-primary text-black hover:bg-primary/90"
              onClick={openConnections}
            >
              {isWhatsappConnected ? tr('Gerenciar WhatsApp', 'Manage WhatsApp') : tr('Conectar WhatsApp', 'Connect WhatsApp')}
            </Button>
          </div>
        </div>
      </div>

      {isBlocked ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{tr('IA desativada por falta de créditos', 'AI disabled due to missing credits')}</p>
            <p className="text-xs text-red-200/80">
              {tr('Seu saldo esta zerado.', 'Your balance is zero.')}{' '}
              <Link
                href={toRoute('settings', { query: { tab: 'assinatura_creditos' } })}
                className="font-semibold text-red-200 underline underline-offset-4 hover:text-white"
              >
                {tr('Recarregue os créditos', 'Top up credits')}
              </Link>{' '}
              {tr('para voltar a responder automaticamente.', 'to enable automatic replies again.')}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          'rounded-2xl border border-surface-lighter bg-surface-light p-5',
          !isGuidedTutorialDropdownOpen && 'cursor-pointer'
        )}
        onClick={() => {
          if (!isGuidedTutorialDropdownOpen) {
            setIsGuidedTutorialDropdownOpen(true)
          }
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {tr('Onboarding', 'Onboarding')}
            </p>
            <h2 className="text-lg font-bold text-white">
              {tr('Tutorial guiado por tópicos', 'Guided tutorial by topics')}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {tr(
                'Inicie quando quiser e acompanhe a progressão com base nos tutoriais concluídos.',
                'Start anytime and track progress based on completed tutorials.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setIsGuidedTutorialDropdownOpen((prev) => !prev)
            }}
            aria-expanded={isGuidedTutorialDropdownOpen}
            className="inline-flex items-center gap-2 self-start text-sm text-gray-300 transition hover:text-white"
          >
            <span>
              {guidedTutorialCompletedCount}/{guidedTutorialTotalCount} {tr('concluídos', 'completed')}
            </span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', isGuidedTutorialDropdownOpen ? 'rotate-180' : '')}
            />
          </button>
        </div>

        <div
          className={cn(
            'overflow-hidden transition-all duration-300',
            isGuidedTutorialDropdownOpen ? 'mt-4 max-h-[2600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          )}
        >
          <div className="h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(0, Math.min(100, guidedTutorialProgressPercent))}%` }}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => openGuidedTutorial('connections')}
              className="bg-primary text-black hover:bg-primary/90"
            >
              {tr('Iniciar tutorial guiado (Conexões)', 'Start guided tutorial (Connections)')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-surface-lighter bg-surface text-gray-200"
              onClick={startGuidedTutorial}
            >
              {tr('Continuar de onde parou', 'Continue where you left off')}
            </Button>
            <span className="text-xs text-gray-400">
              {tr('Próximo recomendado:', 'Next recommended:')} {tr(nextGuidedTutorialCard.labelPt, nextGuidedTutorialCard.labelEn)}
            </span>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-white">{tr('Selecione um tutorial', 'Select a tutorial')}</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {GUIDED_TUTORIAL_CARDS.map((card) => {
                const Icon = card.icon
                const isCompleted = completedGuidedTutorials.has(card.key)
                const title = tr(card.labelPt, card.labelEn)
                const description = tr(card.descriptionPt, card.descriptionEn)
                return (
                  <div
                    key={card.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => openGuidedTutorial(card.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openGuidedTutorial(card.key)
                      }
                    }}
                    className={cn(
                      'rounded-xl border p-3 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      isCompleted
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-surface-lighter bg-surface hover:border-primary/40 hover:bg-surface-lighter/60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          isCompleted ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700/70 text-gray-300'
                        )}
                      >
                        {isCompleted ? tr('Concluído', 'Completed') : tr('Pendente', 'Pending')}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-xs text-gray-400">{description}</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setGuidedTutorialStatus(card.key, !isCompleted)
                        }}
                        className={cn(
                          'rounded-md border px-2 py-1 text-[11px] font-semibold transition',
                          isCompleted
                            ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        )}
                      >
                        {isCompleted
                          ? tr('Marcar como pendente', 'Mark as pending')
                          : tr('Marcar como concluído', 'Mark as completed')}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {formattedStats.map((stat) => (
          <div key={stat.label} className="bg-surface-light p-6 rounded-2xl border border-surface-lighter card-hover">
            <div className="flex items-start justify-between mb-4">
              <div className={cn("p-3 rounded-xl", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                stat.trend === 'up' ? 'text-primary' : stat.trend === 'down' ? 'text-red-400' : 'text-gray-400'
              )}>
                {stat.trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
                {stat.trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <p className="text-gray-400 text-sm font-medium">{stat.label}</p>
            <h3 className="text-2xl font-bold text-white mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Bottom Section */}
      <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
        {/* Recent Activity / Leads */}
        <div className="lg:col-span-2 bg-surface-light rounded-2xl border border-surface-lighter overflow-hidden">
          <div className="p-6 border-b border-surface-lighter flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">{tr('Leads recentes', 'Recent leads')}</h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary-light"
              onClick={openLeadsTable}
            >
              {tr('Ver todos', 'See all')}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">{tr('Lead', 'Lead')}</th>
                  <th className="px-6 py-4">{tr('Data', 'Date')}</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-lighter">
                {summaryLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-gray-400">
                      {tr('Carregando leads recentes...', 'Loading recent leads...')}
                    </td>
                  </tr>
                ) : recentLeads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-sm text-gray-500">
                      {summaryError ? tr('Falha ao carregar dados.', 'Failed to load data.') : tr('Nenhum lead recente encontrado.', 'No recent leads found.')}
                    </td>
                  </tr>
                ) : (
                  recentLeads.map((lead) => {
                    const status = leadStatusStyles[lead.status]
                    const secondary = lead.whatsapp ?? lead.lastMessage ?? '-'
                    return (
                      <tr key={lead.id} className="group hover:bg-surface-lighter/50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <button
                              type="button"
                              onClick={() => openLeadConversations(lead)}
                              className="text-sm font-semibold text-white transition-colors hover:text-primary"
                            >
                              {lead.name || tr('Sem nome', 'No name')}
                            </button>
                            <p className="text-xs text-gray-500">{secondary}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {formatRelativeTime(resolveLeadDate(lead))}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                            status.className
                          )}>
                            {getLeadStatusLabel(lead.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Performance Card */}
        <div className="bg-surface-light rounded-2xl border border-surface-lighter p-6 flex flex-col h-full">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h3 className="text-lg font-bold text-white">{tr('Desempenho da IA', 'AI performance')}</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
              {tr('Últimos 30d', 'Last 30d')}
            </span>
          </div>

          <div className="flex-1 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-medium">{tr('Conversoes com IA (janela de 30d)', 'AI-assisted conversions (30d window)')}</span>
                <div className="text-right leading-tight">
                  <div className="text-primary font-bold">{formatPercent(conversions?.aiAssistedRate)}</div>
                  {conversions ? (
                    <div className="text-[10px] text-gray-500">
                      {conversions.aiAssistedConvertedLeads.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')}/{conversions.convertedLeads.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${clampPercent(conversions?.aiAssistedRate)}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-medium">{tr('Taxa de conversão geral (janela de 30d)', 'Overall conversion rate (30d window)')}</span>
                <div className="text-right leading-tight">
                  <div className="text-blue-400 font-bold">{formatPercent(conversions?.conversionRate)}</div>
                  {conversions ? (
                    <div className="text-[10px] text-gray-500">
                      {conversions.convertedLeads.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')}/{conversions.leadsCreated.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-blue-400" style={{ width: `${clampPercent(conversions?.conversionRate)}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-medium">{tr('Taxa de resposta da IA', 'AI response rate')}</span>
                <div className="text-right leading-tight">
                  <div className="text-yellow-400 font-bold">{formatPercent(stats?.responseRate)}</div>
                  {stats ? (
                    <div className="text-[10px] text-gray-500">
                      {stats.aiMessages.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')}/{stats.inboundMessages.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR')}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-yellow-400" style={{ width: `${clampPercent(stats?.responseRate)}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-8 bg-surface rounded-xl p-4 border border-surface-lighter">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center shrink-0">
                <Bot className="w-6 h-6 text-black" />
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider mb-1">{tr('Eficiencia (30d)', 'Efficiency (30d)')}</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {tr('Custo medio/resp', 'Avg cost/response')}:{' '}
                  <span className="text-white/90 font-semibold">
                    {aiUsage && aiUsage.responses > 0 ? formatCurrency(aiUsage.costPerResponseBrl) : '--'}
                  </span>
                  <br />
                  {tr('Tokens/resp', 'Tokens/response')}:{' '}
                  <span className="text-white/90 font-semibold">
                    {aiUsage && aiUsage.responses > 0 ? formatNumber(Math.round(aiUsage.tokensPerResponse)) : '--'}
                  </span>
                  <br />
                  {tr('Respostas', 'Responses')}:{' '}
                  <span className="text-white/90 font-semibold">
                    {aiUsage ? aiUsage.responses.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR') : '--'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
