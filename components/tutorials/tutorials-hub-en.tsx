'use client'

import { type ComponentType, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Brain,
  Calendar,
  ChevronDown,
  CheckCircle2,
  CreditCard,
  Megaphone,
  MessageSquare,
  QrCode,
  Search,
  UserCheck,
  Users,
} from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { Callout } from '@/components/tutorials/callout'
import { Reveal } from '@/components/tutorials/reveal'
import { TutorialTopicEn } from '@/components/tutorials/tutorial-topic-en'
import { useTutorialProgress } from '@/components/tutorials/use-tutorial-progress'
import {
  TUTORIAL_TAGS as TUTORIAL_TAGS_EN,
  TUTORIAL_TOPICS as TUTORIAL_TOPICS_EN,
  type TutorialTag as TutorialTagEn,
  type TutorialTopic as Topic
} from '@/lib/tutorials/content-en'
import { auth, db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'

type QuickstartCard = {
  title: string
  description: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const LEARNING_PATH_ORDER: string[] = [
  'primeiros-passos',
  'treinamento',
  'toggles-ia',
  'conexoes-conversas',
  'leads',
  'clientes',
  'agenda',
  'transmissao',
  'assinaturas-créditos',
]

const QUICK_INDEX_COLLAPSED_STORAGE_KEY = 'tutorials:quick-index-collapsed'
let scrollRequestCounter = 0

const quickstart: QuickstartCard[] = [
  {
    title: 'Connect WhatsApp',
    description: 'Generate the QR code and complete your number connection.',
    href: '/en/dashboard/connections',
    icon: QrCode,
  },
  {
    title: 'Train AI',
    description: 'Fill business profile, services, and rules to avoid wrong responses.',
    href: '/en/dashboard/training',
    icon: Brain,
  },
  {
    title: 'Conversations',
    description: 'Monitor support and enable global AI when needed.',
    href: '/en/dashboard/conversations',
    icon: MessageSquare,
  },
  {
    title: 'Leads',
    description: 'Prioritize follow-ups and track your sales pipeline.',
    href: '/en/dashboard/leads',
    icon: Users,
  },
  {
    title: 'Clients',
    description: 'Manage recurrence with status and next-contact control.',
    href: '/en/dashboard/clients',
    icon: UserCheck,
  },
  {
    title: 'Calendar',
    description: 'Centralize appointments and avoid scheduling conflicts.',
    href: '/en/dashboard/calendar',
    icon: Calendar,
  },
  {
    title: 'Broadcasts',
    description: 'Create campaigns and track responses with context.',
    href: '/en/dashboard/broadcasts',
    icon: Megaphone,
  },
  {
    title: 'Subscription and credits',
    description: 'Keep enough balance so AI remains active without pauses.',
    href: '/en/dashboard/settings?tab=assinatura_creditos',
    icon: CreditCard,
  },
]

function topicSearchText(topic: Topic): string {
  const parts: string[] = []
  parts.push(topic.title, topic.description, topic.tags.join(' '))
  for (const section of topic.sections) {
    parts.push(section.title)
    for (const block of section.blocks) {
      if (block.type === 'paragraph') parts.push(block.text)
      if (block.type === 'bullets') parts.push(block.items.join(' '))
      if (block.type === 'steps') parts.push(block.items.map((s) => `${s.title} ${s.description}`).join(' '))
      if (block.type === 'links') parts.push(block.links.map((l) => `${l.label} ${l.href} ${l.description ?? ''}`).join(' '))
      if (block.type === 'callout') parts.push(block.title, block.text)
      if (block.type === 'image') parts.push(block.alt, block.caption ?? '')
      if (block.type === 'toggleCards') parts.push(block.items.map((i) => `${i.title} ${i.description} ${i.note ?? ''}`).join(' '))
    }
  }
  return parts.join(' ').toLowerCase()
}

function findScrollableContainer(el: HTMLElement): HTMLElement | Window {
  let current: HTMLElement | null = el.parentElement
  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const canScroll = current.scrollHeight > current.clientHeight
    if (canScroll && (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')) {
      return current
    }
    current = current.parentElement
  }
  return window
}

function isWindowScrollContainer(container: Window | HTMLElement): container is Window {
  return container === window
}

function getScrollMarginTop(el: HTMLElement) {
  return Number.parseFloat(window.getComputedStyle(el).scrollMarginTop || '0') || 0
}

function getAlignmentDelta(el: HTMLElement, scrollContainer: HTMLElement | Window) {
  const marginTop = getScrollMarginTop(el)
  if (isWindowScrollContainer(scrollContainer)) {
    return el.getBoundingClientRect().top - marginTop
  }

  const containerRect = scrollContainer.getBoundingClientRect()
  return el.getBoundingClientRect().top - containerRect.top - marginTop
}

function alignElement(
  el: HTMLElement,
  params: { behavior: ScrollBehavior; minDeltaPx: number }
) {
  const scrollContainer = findScrollableContainer(el)
  const delta = getAlignmentDelta(el, scrollContainer)
  if (Math.abs(delta) <= params.minDeltaPx) {
    return false
  }

  if (isWindowScrollContainer(scrollContainer)) {
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: params.behavior })
    return true
  }

  scrollContainer.scrollTo({
    top: Math.max(0, scrollContainer.scrollTop + delta),
    behavior: params.behavior,
  })
  return true
}

function scrollElementIntoTutorialView(el: HTMLElement, behavior: ScrollBehavior) {
  const scrollContainer = findScrollableContainer(el)
  const marginTop = getScrollMarginTop(el)

  if (isWindowScrollContainer(scrollContainer)) {
    const targetTop = Math.max(0, window.scrollY + el.getBoundingClientRect().top - marginTop)
    window.scrollTo({ top: targetTop, behavior })
    return
  }

  const containerRect = scrollContainer.getBoundingClientRect()
  const targetTop = Math.max(0, scrollContainer.scrollTop + (el.getBoundingClientRect().top - containerRect.top) - marginTop)
  scrollContainer.scrollTo({ top: targetTop, behavior })
}

function scrollToId(id: string) {
  const requestId = ++scrollRequestCounter
  const el = document.getElementById(id)
  if (!el) {
    if (typeof window !== 'undefined') {
      window.location.hash = `#${id}`
    }
    return
  }

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  const smoothBehavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth'

  scrollElementIntoTutorialView(el, smoothBehavior)
  window.history.replaceState(null, '', `#${id}`)

  // Soft corrections to absorb layout shifts without visual jumps.
  const correctionDelays = prefersReduced ? [50, 150, 300] : [220, 520, 880]
  for (const delay of correctionDelays) {
    window.setTimeout(() => {
      if (requestId !== scrollRequestCounter) return
      const target = document.getElementById(id)
      if (!target) return
      alignElement(target, {
        behavior: prefersReduced ? 'auto' : 'smooth',
        minDeltaPx: prefersReduced ? 1 : 2,
      })
    }, delay)
  }

  // Final subtle adjustment (only if there is still visible offset).
  window.setTimeout(() => {
    if (requestId !== scrollRequestCounter) return
    const target = document.getElementById(id)
    if (!target) return
    alignElement(target, { behavior: 'auto', minDeltaPx: 4 })
  }, prefersReduced ? 380 : 1220)
}

function sortTopicsByLearningPath(topics: Topic[]) {
  const orderMap = new Map(LEARNING_PATH_ORDER.map((id, index) => [id, index]))
  return [...topics].sort((a, b) => {
    const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })
}

type TrainingDocData = {
  model?: unknown
  instructions?: unknown
}

type AiConfigResponse = {
  enabled?: boolean
}

type ChatAiConfigsResponse = {
  configs?: Array<{ aiEnabled?: boolean | null }>
}

const DEFAULT_TOGGLE_STATUS_BY_KEY: Record<string, string> = {
  modeloOpenAI: 'Off',
  modeloGoogle: 'On',
  modeloX: 'Soon',
  seApresentarComoIA: 'On',
  usarEmojis: 'On',
  desligarMensagemForaContexto: 'Off',
  comportamentoNãoSabe: 'Forward',
  responderGrupos: 'Off',
  responderClientes: 'Off',
  autoClassificarLeadComoCliente: 'Off',
  permitirSugestoesCamposLeadsClientes: 'Off',
  aprovarAutomaticamenteSugestoesLeadsClientes: 'Off',
  permitirIAEnviarArquivos: 'Off',
  permitirIAOuvirAudios: 'Off',
  permitirIALerImagensEPdfs: 'Off',
  usarAgendaAutomatica: 'Off',
  conversasIaGlobal: 'Off',
  conversasIaPorChat: 'No data',
  agendaVisibilidade: 'Visible',
  agendaDiaAtivo: 'Off',
  notifEmailNovoLead: 'Soon',
  notifEmailResumo: 'Soon',
  notifPushNovoLead: 'Soon',
  notifPushMensagens: 'Soon',
  notifSom: 'Soon',
}

function toToggleStatusByKey(params: {
  instructions: Record<string, unknown> | null | undefined
  model: unknown
}): Record<string, string> {
  const safeInstructions = params.instructions ?? {}
  const boolValue = (key: string, fallback: boolean) => {
    const value = safeInstructions[key]
    return typeof value === 'boolean' ? value : fallback
  }

  const normalizedModel = typeof params.model === 'string' ? params.model.trim().toLowerCase() : ''
  const selectedModel =
    normalizedModel === 'openai' || normalizedModel === 'google' || normalizedModel === 'x'
      ? normalizedModel
      : 'google'

  const permitirSugestoes = boolValue('permitirSugestoesCamposLeadsClientes', false)
  const autoAprovarSugestoes =
    permitirSugestoes &&
    boolValue('aprovarAutomaticamenteSugestoesLeadsClientes', false)
  const comportamentoNãoSabe =
    safeInstructions.comportamentoNãoSabe === 'silencio' ? 'Silence' : 'Forward'

  return {
    modeloOpenAI: selectedModel === 'openai' ? 'On' : 'Off',
    modeloGoogle: selectedModel === 'google' ? 'On' : 'Off',
    modeloX: selectedModel === 'x' ? 'On' : 'Soon',
    seApresentarComoIA: boolValue('seApresentarComoIA', true) ? 'On' : 'Off',
    usarEmojis: boolValue('usarEmojis', true) ? 'On' : 'Off',
    desligarMensagemForaContexto: boolValue('desligarMensagemForaContexto', false) ? 'On' : 'Off',
    comportamentoNãoSabe,
    responderGrupos: boolValue('responderGrupos', false) ? 'On' : 'Off',
    responderClientes: boolValue('responderClientes', false) ? 'On' : 'Off',
    autoClassificarLeadComoCliente: boolValue('autoClassificarLeadComoCliente', false) ? 'On' : 'Off',
    permitirSugestoesCamposLeadsClientes: permitirSugestoes ? 'On' : 'Off',
    aprovarAutomaticamenteSugestoesLeadsClientes: autoAprovarSugestoes ? 'On' : 'Off',
    permitirIAEnviarArquivos: boolValue('permitirIAEnviarArquivos', false) ? 'On' : 'Off',
    permitirIAOuvirAudios: boolValue('permitirIAOuvirAudios', false) ? 'On' : 'Off',
    permitirIALerImagensEPdfs: boolValue('permitirIALerImagensEPdfs', false) ? 'On' : 'Off',
    usarAgendaAutomatica: boolValue('usarAgendaAutomatica', false) ? 'On' : 'Off',
  }
}

export function TutorialsHubEn() {
  const { user } = useAuth()
  const [toggleStatusByKey, setToggleStatusByKey] = useState<Record<string, string>>(DEFAULT_TOGGLE_STATUS_BY_KEY)

  const orderedTopics = useMemo(() => sortTopicsByLearningPath(TUTORIAL_TOPICS_EN), [])
  const topicIds = useMemo(() => orderedTopics.map((t) => t.id), [orderedTopics])
  const progress = useTutorialProgress({ userId: user?.uid, topicIds })

  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<TutorialTagEn | 'All'>('All')
  const [quickIndexCollapsed, setQuickIndexCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(QUICK_INDEX_COLLAPSED_STORAGE_KEY) === '1'
  })

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orderedTopics.filter((topic) => {
      if (activeTag !== 'All' && !topic.tags.includes(activeTag)) return false
      if (!q) return true
      return topicSearchText(topic).includes(q)
    })
  }, [activeTag, orderedTopics, query])

  const topicPositionMap = useMemo(() => {
    return new Map(orderedTopics.map((topic, index) => [topic.id, index + 1]))
  }, [orderedTopics])

  const clearFilters = useCallback(() => {
    setQuery('')
    setActiveTag('All')
  }, [])

  const toggleQuickIndex = useCallback(() => {
    setQuickIndexCollapsed((current) => !current)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(QUICK_INDEX_COLLAPSED_STORAGE_KEY, quickIndexCollapsed ? '1' : '0')
  }, [quickIndexCollapsed])

  useEffect(() => {
    let active = true
    const userId = user?.uid
    const firestore = db

    if (!userId || !firestore) {
      setToggleStatusByKey(DEFAULT_TOGGLE_STATUS_BY_KEY)
      return () => {
        active = false
      }
    }

    const fetchJson = async <T,>(url: string, token: string): Promise<T | null> => {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) {
          return null
        }
        return (await response.json().catch(() => null)) as T | null
      } catch {
        return null
      }
    }

    const loadToggleStatus = async () => {
      const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : ''
      if (!token) {
        setToggleStatusByKey(DEFAULT_TOGGLE_STATUS_BY_KEY)
        return
      }

      const docRef = doc(firestore, 'users', userId, 'settings', 'ai_training')
      const [trainingSnapshot, aiConfigPayload, chatConfigsPayload, agendasSnapshot] = await Promise.all([
        getDoc(docRef).catch(() => null),
        fetchJson<AiConfigResponse>(`/api/ai-config?sessionId=${encodeURIComponent(userId)}`, token),
        fetchJson<ChatAiConfigsResponse>(`/api/conversations/chats/ai-configs?sessionId=${encodeURIComponent(userId)}`, token),
        getDocs(collection(firestore, 'users', userId, 'agendas')).catch(() => null),
      ])

      if (!active) {
        return
      }

      const trainingData = trainingSnapshot?.exists() ? (trainingSnapshot.data() as TrainingDocData) : null
      const instructions =
        trainingData && trainingData.instructions && typeof trainingData.instructions === 'object'
          ? (trainingData.instructions as Record<string, unknown>)
          : undefined

      const statusFromTraining = toToggleStatusByKey({
        instructions,
        model: trainingData?.model,
      })

      const configs = Array.isArray(chatConfigsPayload?.configs) ? chatConfigsPayload.configs : []
      const enabledConfigs = configs.filter((config) => config?.aiEnabled !== false).length
      let conversasIaPorChat = 'No data'
      if (configs.length > 0) {
        conversasIaPorChat =
          enabledConfigs === 0 ? 'Off' : enabledConfigs === configs.length ? 'On' : 'Mixed'
      }

      const agendaDocs = agendasSnapshot?.docs ?? []
      const hasAnyEnabledDay = agendaDocs.some((agendaDoc) => {
        const agendaData = agendaDoc.data() as { availableHours?: unknown }
        if (!agendaData || !agendaData.availableHours || typeof agendaData.availableHours !== 'object') {
          return false
        }

        return Object.values(agendaData.availableHours as Record<string, unknown>).some((rawDayConfig) => {
          if (!rawDayConfig || typeof rawDayConfig !== 'object') {
            return false
          }

          const dayConfig = rawDayConfig as { enabled?: unknown; timeSlots?: unknown }
          return dayConfig.enabled === true && Array.isArray(dayConfig.timeSlots) && dayConfig.timeSlots.length > 0
        })
      })

      setToggleStatusByKey({
        ...DEFAULT_TOGGLE_STATUS_BY_KEY,
        ...statusFromTraining,
        conversasIaGlobal: aiConfigPayload?.enabled === true ? 'On' : 'Off',
        conversasIaPorChat,
        agendaVisibilidade: agendaDocs.length > 0 ? 'Visible' : 'No schedule',
        agendaDiaAtivo: hasAnyEnabledDay ? 'On' : agendaDocs.length > 0 ? 'Off' : 'No schedule',
      })
    }

    void loadToggleStatus().catch(() => {
        if (!active) return
        setToggleStatusByKey(DEFAULT_TOGGLE_STATUS_BY_KEY)
      })

    return () => {
      active = false
    }
  }, [user?.uid])

  const percent = Math.round(progress.percent)
  const remainingTopics = Math.max(progress.totalCount - progress.completedCount, 0)
  const totalEstimatedMinutes = useMemo(() => {
    return orderedTopics.reduce((acc, topic) => acc + topic.estimatedMinutes, 0)
  }, [orderedTopics])

  return (
    <div className={cn('relative space-y-8 animate-fade-in transition-[padding] duration-300', !quickIndexCollapsed && 'lg:pr-[19rem]')}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            background:
              'radial-gradient(1200px 600px at 20% 10%, rgba(37,211,102,0.22), transparent 60%), radial-gradient(900px 500px at 80% 30%, rgba(7,94,84,0.18), transparent 55%), radial-gradient(900px 600px at 50% 90%, rgba(52,232,121,0.10), transparent 65%)',
          }}
        />
        <div className="absolute inset-0 opacity-[0.24] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <div
        className={cn(
          'hidden lg:block fixed right-6 top-24 z-30 transition-all duration-300',
          quickIndexCollapsed ? 'w-44' : 'w-72'
        )}
      >
        <div
          id="tutorials-quick-index-panel"
          className="max-h-[calc(100vh-7rem)] rounded-2xl border border-surface-lighter bg-surface-light/90 backdrop-blur-sm shadow-[0_14px_30px_rgba(0,0,0,0.24)] flex flex-col overflow-hidden"
        >
          <button
            type="button"
            onClick={toggleQuickIndex}
            className={cn(
              'w-full px-4 pt-4 pb-3 text-left hover:bg-surface/30 transition-colors',
              quickIndexCollapsed ? 'border-b-0' : 'border-b border-surface-lighter'
            )}
            aria-expanded={!quickIndexCollapsed}
            aria-controls="tutorials-quick-index-body"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Quick index</p>
                <p
                  className={cn(
                    'text-xs text-gray-500 mt-1 transition-all duration-300 overflow-hidden',
                    quickIndexCollapsed ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100'
                  )}
                >
                  Jump to any step without losing your place.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-gray-400 mt-0.5 shrink-0 transition-transform duration-300',
                  quickIndexCollapsed ? 'rotate-0' : 'rotate-180'
                )}
              />
            </div>
          </button>

          <div
            id="tutorials-quick-index-body"
            className={cn(
              'transition-all duration-300 overflow-hidden',
              quickIndexCollapsed ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[calc(100vh-10.75rem)] opacity-100'
            )}
          >
            <div className="overflow-y-auto px-2 py-3 max-h-[calc(100vh-10.75rem)]">
              {filteredTopics.length === 0 ? (
                <p className="px-3 text-xs text-gray-500">No topics match the current filters.</p>
              ) : (
                <div className="space-y-1">
                  {filteredTopics.map((topic) => {
                    const done = progress.isCompleted(topic.id)
                    const position = topicPositionMap.get(topic.id)
                    return (
                      <button
                        key={`floating-toc-${topic.id}`}
                        type="button"
                        onClick={() => scrollToId(topic.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all',
                          done ? 'text-primary bg-primary/10' : 'text-gray-300 hover:text-white hover:bg-surface-lighter'
                        )}
                        title={topic.title}
                      >
                        <span className={cn('w-2 h-2 rounded-full', done ? 'bg-primary' : 'bg-gray-600')} />
                        <span className="text-sm font-semibold truncate">
                          {position}. {topic.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-surface-lighter">
                <ButtonLink href="/en/dashboard" variant="ghost" className="w-full justify-start">
                  Back to Dashboard
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Reveal>
        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-surface-light via-[#101b29] to-[#0c141f] p-6 md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,211,102,0.2),transparent_55%)]" />
          <div className="relative space-y-5">
            <div className="space-y-3">
              <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-primary" />
                Tutorials
              </h1>
              <p className="text-gray-300 max-w-3xl leading-relaxed">
                Practical and direct guide to configure, operate, and scale AutoWhats in the right order.
              </p>
            </div>

            <Callout variant="tip" title="How to navigate">
              Use the floating index to jump between steps at any time without returning to the top.
            </Callout>
          </div>
        </section>
      </Reveal>

      <Reveal delayClassName="delay-100">
        <div className="grid md:grid-cols-3 gap-4 auto-rows-fr">
          <div className="h-full rounded-2xl border border-primary/20 bg-surface-light/95 p-5 space-y-4 shadow-[0_12px_30px_rgba(0,0,0,0.26)]">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your progress</p>
              <p className="text-white font-semibold mt-1">
                {progress.completedCount} of {progress.totalCount} topics completed
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span>{percent}%</span>
                <span>{progress.totalCount} total</span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden border border-surface-lighter">
                <div className="h-full bg-gradient-to-r from-primary to-primary-light transition-all duration-500" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          </div>

          <div className="h-full rounded-2xl border border-surface-lighter bg-surface-light/95 p-5 flex flex-col justify-between shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Next steps</p>
            <div>
              <p className="text-3xl font-bold text-white">{remainingTopics}</p>
              <p className="text-sm text-gray-400 mt-1">topics remaining in the path</p>
            </div>
          </div>

          <div className="h-full rounded-2xl border border-surface-lighter bg-surface-light/95 p-5 flex flex-col justify-between shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estimated time</p>
            <div>
              <p className="text-3xl font-bold text-white">{totalEstimatedMinutes} min</p>
              <p className="text-sm text-gray-400 mt-1">to complete all topics</p>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delayClassName="delay-200">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Start here</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300 bg-surface border border-surface-lighter px-2 py-1 rounded-full">
              Quickstart
            </span>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-fr">
            {quickstart.map((card) => {
              const Icon = card.icon
              return (
                <a
                  key={card.href}
                  href={card.href}
                  className="group relative h-full overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light/95 p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_14px_35px_rgba(37,211,102,0.16)]"
                >
                  <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(37,211,102,0.18),transparent_60%)]" />
                  <div className="relative flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-white font-semibold leading-snug">{card.title}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{card.description}</p>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </Reveal>

      <Reveal delayClassName="delay-300">
        <section className="rounded-2xl border border-surface-lighter bg-surface-light/90 p-6 space-y-4 shadow-[0_10px_28px_rgba(0,0,0,0.25)]">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by feature, toggle, training, leads, calendar, broadcasts..."
                className="pl-10"
              />
            </div>

            {(query.trim() || activeTag !== 'All') && (
              <Button variant="outline" onClick={clearFilters} className="shrink-0">
                Clear filters
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTag('All')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                activeTag === 'All'
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-surface text-gray-300 border-surface-lighter hover:bg-surface-lighter/50 hover:text-white'
              )}
            >
              All
            </button>
            {TUTORIAL_TAGS_EN.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                  activeTag === tag
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-surface text-gray-300 border-surface-lighter hover:bg-surface-lighter/50 hover:text-white'
                )}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-500">
            Showing <span className="text-gray-300 font-semibold">{filteredTopics.length}</span> of{' '}
            <span className="text-gray-300 font-semibold">{orderedTopics.length}</span> topics.
          </div>
        </section>
      </Reveal>

      <Reveal delayClassName="delay-400">
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">Topics (recommended order)</h2>

          {filteredTopics.length === 0 ? (
            <div className="rounded-2xl border border-surface-lighter bg-surface-light p-6 text-gray-400">
              No tutorials found with the current filters.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
              {filteredTopics.map((topic) => {
                const Icon = topic.icon
                const done = progress.isCompleted(topic.id)
                const position = topicPositionMap.get(topic.id)

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => scrollToId(topic.id)}
                    className="group relative h-full overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light/95 p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_12px_30px_rgba(37,211,102,0.14)]"
                  >
                    <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(37,211,102,0.18),transparent_60%)]" />

                    <div className="relative h-full flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                              <Icon className="w-5 h-5 text-primary" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-white font-semibold leading-snug">{topic.title}</p>
                              <p className="text-xs text-gray-400 leading-relaxed">{topic.description}</p>
                            </div>
                          </div>

                          {done ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              OK
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300 bg-surface border border-surface-lighter px-2 py-1 rounded-full">
                          Step {position}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-surface border border-surface-lighter px-2 py-1 rounded-full">
                          {topic.estimatedMinutes} min
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Reveal>

      <div className="space-y-10 min-w-0">
        <div className="lg:hidden rounded-2xl border border-surface-lighter bg-surface-light/90 p-4">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Jump to</label>
            <select
              className="mt-2 w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value
                if (!value) return
                scrollToId(value)
              }}
            >
              <option value="" disabled>
                Select a topic
              </option>
              {filteredTopics.map((t) => {
                const position = topicPositionMap.get(t.id)
                return (
                  <option key={`jump-${t.id}`} value={t.id}>
                    {progress.isCompleted(t.id) ? 'OK ' : ''}
                    {position}. {t.title}
                  </option>
                )
              })}
            </select>
        </div>

        {filteredTopics.map((topic) => (
          <TutorialTopicEn
            key={`topic-${topic.id}`}
            topic={topic}
            completed={progress.isCompleted(topic.id)}
            onToggleCompleted={() => progress.toggleCompleted(topic.id)}
            toggleStatusByKey={toggleStatusByKey}
          />
        ))}
      </div>
    </div>
  )
}
