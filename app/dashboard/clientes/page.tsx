'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage } from '@/lib/http-error'
import { onAuthStateChanged } from 'firebase/auth'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { 
  UserCheck, 
  Search, 
  Filter, 
  Loader2,
  ArrowUpDown,
  ChevronDown,
  X,
  Edit2,
  Save,
  Sparkles,
  UserPlus,
  FileUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AiFieldSuggestionsPanel } from '@/components/crm/ai-field-suggestions-panel'
import { AiFieldSuggestionsLogsPanel } from '@/components/crm/ai-field-suggestions-logs-panel'
import { FollowUpModal } from '@/components/ai/followup-modal'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey
} from '@/lib/onboarding/guided-tutorials'

interface Cliente {
  id: string
  name: string | null
  whatsapp: string | null
  chatId: string | null
  status: 'ativo' | 'inativo' | 'vip' | 'lead'
  lastContactAt: number | null
  nextContactAt: number | null
  observations?: string | null
  createdAt: number | null
  lastMessage?: string | null
  source?: string | null
  totalValue?: number | null
  lastPurchaseAt?: number | null
}

type ClientImportContact = {
  name?: string | null
  whatsapp?: string | null
}

type ClientImportSummary = {
  total: number
  created: number
  updated: number
  skipped: number
  invalid: number
}

type ClientsListResponse = {
  clients?: Cliente[]
  total?: number
  matchedTotal?: number
  search?: string | null
}

type ColorSelectOption<T extends string> = {
  value: T
  label: string
  toneClass: string
}

const parseClientImportText = (text: string): { contacts: ClientImportContact[]; invalidLines: number } => {
  const INVISIBLE_CHARS_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

  const normalizeLine = (value: string) => (value || '').replace(INVISIBLE_CHARS_RE, '').trim()

  const hasValidDigits = (value: string) => value.replace(/\D/g, '').length >= 7

  const parseDelimited = (line: string): ClientImportContact | null => {
    const parts = line.includes(';')
      ? line.split(';')
      : line.includes(',')
        ? line.split(',')
        : line.includes('\t')
          ? line.split('\t')
          : null

    if (!parts) return null

    const trimmed = parts.map((p) => p.trim()).filter(Boolean)
    if (trimmed.length === 0) return null

    const candidates = trimmed.map((value) => ({ value, digitsCount: value.replace(/\D/g, '').length }))
    candidates.sort((a, b) => b.digitsCount - a.digitsCount)
    const best = candidates[0]
    if (!best || best.digitsCount < 7) return null

    const whatsapp = best.value
    const name = trimmed.filter((value) => value !== whatsapp).join(' ').trim()
    return { whatsapp, ...(name ? { name } : {}) }
  }

  const parseInlinePhone = (line: string): ClientImportContact | null => {
    if (!hasValidDigits(line)) return null

    const hasLetters = /[A-Za-z\u00C0-\u00FF]/.test(line)
    if (!hasLetters) {
      return { whatsapp: line }
    }

    const matches = Array.from(line.matchAll(/(\+?\d[\d\s().-]{5,}\d)/g))
      .map((match) => match[1] ?? '')
      .filter(Boolean)
    if (matches.length === 0) {
      return { whatsapp: line }
    }

    const best = matches
      .map((value) => ({ value: value.trim(), digitsCount: value.replace(/\D/g, '').length }))
      .sort((a, b) => b.digitsCount - a.digitsCount)[0]

    if (!best || best.digitsCount < 7) {
      return { whatsapp: line }
    }

    const whatsapp = best.value
    const name = line.replace(whatsapp, ' ').replace(/\s+/g, ' ').trim()
    return { whatsapp, ...(name ? { name } : {}) }
  }

  const isProbablyNote = (line: string) => {
    const safe = line.trim()
    if (safe.length < 2) return false
    if (safe.startsWith('"') && safe.endsWith('"') && safe.length >= 10) return true
    if (safe.startsWith("'") && safe.endsWith("'") && safe.length >= 10) return true
    return false
  }

  const rawLines = (text || '').split(/\r?\n/)
  const contacts: ClientImportContact[] = []
  let invalidLines = 0
  let pendingName: string | null = null
  let seenNonEmpty = 0

  for (const raw of rawLines) {
    const line = normalizeLine(raw)
    if (!line) continue
    seenNonEmpty += 1
    if (seenNonEmpty > 5000) break

    const delimited = parseDelimited(line)
    if (delimited) {
      if (pendingName) {
        invalidLines += 1
        pendingName = null
      }
      contacts.push(delimited)
      continue
    }

    const inline = parseInlinePhone(line)
    if (inline) {
      if (!inline.name && pendingName) {
        contacts.push({ whatsapp: inline.whatsapp ?? '', name: pendingName })
        pendingName = null
        continue
      }

      if (pendingName) {
        invalidLines += 1
        pendingName = null
      }

      contacts.push(inline)
      pendingName = null
      continue
    }

    if (isProbablyNote(line)) {
      continue
    }

    if (pendingName) {
      invalidLines += 1
    }
    pendingName = line
  }

  if (pendingName) {
    invalidLines += 1
  }

  const filtered = contacts.filter((contact) => {
    if (!contact.whatsapp || !hasValidDigits(contact.whatsapp)) {
      invalidLines += 1
      return false
    }
    return true
  })

  return { contacts: filtered, invalidLines }
}

const countUsefulClientSearchChars = (value: string) =>
  value.replace(/[^0-9A-Za-z\u00C0-\u00FF]+/g, '').length

const normalizeClientStatus = (value: unknown): Cliente['status'] => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'ativo') return 'ativo'
  if (normalized === 'inativo') return 'inativo'
  if (normalized === 'vip') return 'vip'
  if (normalized === 'lead') return 'lead'
  return 'ativo'
}

type GuidedStepTarget =
  | 'tabs'
  | 'search_filters'
  | 'advanced_filters'
  | 'table'
  | 'status_column'
  | 'value_tracking'
  | 'notes_column'
  | 'ai_actions'
  | 'suggestions_tab'
  | 'suggestions_demo'
  | 'logs_tab'
  | 'logs_demo'

type GuidedStep = {
  id: string
  target: GuidedStepTarget
  title: string
  description: string
}

const GUIDED_DEMO_CLIENT_ID = '__guided_demo_client__'

function ColorDropdown<T extends string>(props: {
  value: T
  options: Array<ColorSelectOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  widthClassName?: string
}) {
  const { value, options, onChange, ariaLabel, widthClassName } = props
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [portalReady, setPortalReady] = useState(false)
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 320
  })

  const selected = options.find((option) => option.value === value) ?? options[0]

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }

    const rect = trigger.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const spacing = 4
    const estimatedMenuHeight = Math.min(380, options.length * 42 + 16)
    const minVisibleMenu = Math.min(220, estimatedMenuHeight)
    const spaceBelow = viewportHeight - rect.bottom - spacing
    const spaceAbove = rect.top - spacing
    const shouldOpenUpwards = spaceBelow < minVisibleMenu && spaceAbove > spaceBelow

    let top = rect.bottom + spacing
    let maxHeight = Math.max(40, viewportHeight - top - spacing)

    if (shouldOpenUpwards) {
      const desiredHeight = Math.min(estimatedMenuHeight, Math.max(40, spaceAbove))
      top = Math.max(spacing, rect.top - desiredHeight - spacing)
      maxHeight = desiredHeight
    }

    setMenuStyle({
      top,
      left: rect.left,
      width: rect.width,
      maxHeight
    })
  }, [options.length])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    updateMenuPosition()

    const handleViewportChange = () => {
      updateMenuPosition()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) {
        return
      }
      if (menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div ref={containerRef} className={cn('relative', widthClassName ?? 'w-[145px]')}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          'flex w-full items-center justify-center gap-1 rounded-lg border-2 py-2 px-2 text-xs font-bold uppercase shadow-sm transition-all hover:opacity-90 hover:scale-[1.02]',
          selected.toneClass
        )}
      >
        <span className="truncate text-center">{selected.label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open ? 'rotate-180' : 'rotate-0')} />
      </button>

      {open &&
        portalReady &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[260] overflow-y-auto rounded-xl border border-surface-lighter bg-surface p-1 shadow-2xl"
            style={{
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight
            }}
          >
            <div className="space-y-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    if (option.value !== value) {
                      onChange(option.value)
                    }
                  }}
                  className={cn(
                    'flex w-full items-center justify-center rounded-lg border-2 py-2 px-2 text-center text-xs font-bold uppercase transition-all',
                    option.toneClass,
                    option.value === value ? 'ring-1 ring-white/25' : 'opacity-95 hover:opacity-100'
                  )}
                >
                  <span className="truncate text-center">{option.label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

type ClientesPageProps = {
  sessionIdOverride?: string | null
  disableGuidedOnboarding?: boolean
}

export default function ClientesPage({
  sessionIdOverride = null,
  disableGuidedOnboarding = false
}: ClientesPageProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'clients'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt, GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en)
    : null
  const statusConfig = useMemo(() => ({
    ativo: {
      label: tr('Ativo', 'Active'),
      color: 'bg-green-500/20 text-green-400 border-green-500/40'
    },
    inativo: {
      label: tr('Inativo', 'Inactive'),
      color: 'bg-gray-500/20 text-gray-400 border-gray-500/40'
    },
    vip: {
      label: 'VIP',
      color: 'bg-purple-500/20 text-purple-400 border-purple-500/40'
    },
    lead: {
      label: tr('Lead', 'Lead'),
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/40'
    }
  }), [tr])
  const statusOptions = useMemo<Array<ColorSelectOption<Cliente['status']>>>(() => ([
    { value: 'ativo', label: tr('Ativo', 'Active'), toneClass: statusConfig.ativo.color },
    { value: 'inativo', label: tr('Inativo', 'Inactive'), toneClass: statusConfig.inativo.color },
    { value: 'vip', label: 'VIP', toneClass: statusConfig.vip.color },
    { value: 'lead', label: tr('Lead', 'Lead'), toneClass: statusConfig.lead.color }
  ]), [statusConfig, tr])
  const statusFilterOptions = useMemo<Array<ColorSelectOption<string>>>(() => ([
    {
      value: 'todos',
      label: tr('Todos os status', 'All statuses'),
      toneClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
    },
    ...statusOptions.map((option) => ({ ...option, value: option.value as string }))
  ]), [statusOptions, tr])
  const nextContactFilterOptions = useMemo<Array<ColorSelectOption<string>>>(() => ([
    {
      value: 'todos',
      label: tr('Todos', 'All'),
      toneClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
    },
    {
      value: 'com_data',
      label: tr('Com data', 'With date'),
      toneClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    },
    {
      value: 'sem_data',
      label: tr('Sem data', 'Without date'),
      toneClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    },
    {
      value: 'vencido',
      label: tr('Vencidos', 'Overdue'),
      toneClass: 'bg-red-500/20 text-red-300 border-red-500/40'
    },
    {
      value: 'hoje',
      label: tr('Hoje', 'Today'),
      toneClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40'
    }
  ]), [tr])
  const observationsFilterOptions = useMemo<Array<ColorSelectOption<string>>>(() => ([
    {
      value: 'todos',
      label: tr('Todas observações', 'All notes'),
      toneClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
    },
    {
      value: 'com_observacoes',
      label: tr('Com observações', 'With notes'),
      toneClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    },
    {
      value: 'sem_observacoes',
      label: tr('Sem observações', 'Without notes'),
      toneClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    }
  ]), [tr])
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const userId = sessionIdOverride?.trim() || authUserId
  const isGuidedOnboardingEnabled = !disableGuidedOnboarding && !sessionIdOverride
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [totalClientes, setTotalClientes] = useState(0)
  const [matchedClientesTotal, setMatchedClientesTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'lista' | 'sugestoes' | 'logs'>('lista')
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [clientsError, setClientsError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [showCreateClient, setShowCreateClient] = useState(false)
  const [showImportClients, setShowImportClients] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createWhatsapp, setCreateWhatsapp] = useState('')
  const [createStatus, setCreateStatus] = useState<Cliente['status']>('ativo')
  const [createNextContact, setCreateNextContact] = useState<string>('')
  const [createObservations, setCreateObservations] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const [importInput, setImportInput] = useState('')
  const [importStatus, setImportStatus] = useState<Cliente['status']>('ativo')
  const [importingClients, setImportingClients] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<ClientImportSummary | null>(null)
  const [sortBy, setSortBy] = useState<'lastContact' | 'name' | 'nextContact' | 'totalValue'>('lastContact')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [nextContactFilter, setNextContactFilter] = useState<string>('todos')
  const [observationsFilter, setObservationsFilter] = useState<string>('todos')
  const [editingNextContactClientId, setEditingNextContactClientId] = useState<string | null>(null)
  const [inlineNextContactValue, setInlineNextContactValue] = useState<string>('')
  const [savingNextContactClientId, setSavingNextContactClientId] = useState<string | null>(null)
  const [observationPreview, setObservationPreview] = useState<{
    clientId: string
    clientName: string
    text: string
    chatId: string | null
  } | null>(null)
  const [editingObservationPreview, setEditingObservationPreview] = useState(false)
  const [observationPreviewDraft, setObservationPreviewDraft] = useState('')
  const [savingObservationPreview, setSavingObservationPreview] = useState(false)
  const [followUpTarget, setFollowUpTarget] = useState<{ chatId: string; name: string | null } | null>(null)
  // Manual date filters
  const [lastContactDateFrom, setLastContactDateFrom] = useState<string>('')
  const [lastContactDateTo, setLastContactDateTo] = useState<string>('')
  const [nextContactDateFrom, setNextContactDateFrom] = useState<string>('')
  const [nextContactDateTo, setNextContactDateTo] = useState<string>('')
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [guidedDemoClient, setGuidedDemoClient] = useState<Cliente | null>(null)

  const guidedSnapshotRef = useRef<{
    activeTab: 'lista' | 'sugestoes' | 'logs'
    showFilters: boolean
  } | null>(null)
  const guidedSuppressAutoOpenRef = useRef(false)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const filtersRef = useRef<HTMLDivElement | null>(null)
  const advancedFiltersRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLDivElement | null>(null)
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const firstClientRowRef = useRef<HTMLTableRowElement | null>(null)
  const statusColumnRef = useRef<HTMLTableCellElement | null>(null)
  const valueTrackingRef = useRef<HTMLTableCellElement | null>(null)
  const notesColumnRef = useRef<HTMLTableCellElement | null>(null)
  const aiActionsRef = useRef<HTMLTableCellElement | null>(null)
  const suggestionsDemoRef = useRef<HTMLDivElement | null>(null)
  const logsDemoRef = useRef<HTMLDivElement | null>(null)

  const buildSessionQuery = useCallback((entries: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    if (userId) {
      params.set('sessionId', userId)
    }
    Object.entries(entries).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value))
      }
    })
    const query = params.toString()
    return query ? `?${query}` : ''
  }, [userId])

  const fetchWithAuth = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!auth?.currentUser) {
      throw new Error('auth_unavailable')
    }

    const token = await auth.currentUser.getIdToken()
    const requestMethod = (init?.method ?? 'GET').toUpperCase()
    const isClientsListRequest = requestMethod === 'GET' && /^\/api\/clients(?:\?|$)/.test(path)
    const clientsListSearch =
      isClientsListRequest
        ? new URLSearchParams(path.split('?')[1] ?? '').get('search')?.trim() ?? ''
        : ''
    const isDefaultClientsListRequest = isClientsListRequest && !clientsListSearch
    let response: Response
    try {
      response = await fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          authorization: `Bearer ${token}`
        }
      })
    } catch (error) {
      if (isDefaultClientsListRequest) {
        return ({ clients: [] } as unknown) as T
      }
      const message = error instanceof Error ? error.message : 'network_request_failed'
      throw new Error(message)
    }

    let payload: unknown = null
    let rawText = ''
    try {
      payload = await response.clone().json()
    } catch {
      rawText = await response.text().catch(() => '')
    }

    if (!response.ok) {
      const message = buildHttpErrorMessage(response.status, payload, rawText)

      if (isDefaultClientsListRequest) {
        const normalized = message.toLowerCase()
        if (
          normalized.includes('proxy_failed') ||
          normalized.includes('fetch failed') ||
          normalized.includes('backend_request_failed') ||
          normalized.includes('backend_unreachable')
        ) {
          return ({ clients: [] } as unknown) as T
        }
      }

      throw new Error(message)
    }

    return (payload ?? {}) as T
  }, [])

  // Auth check
  useEffect(() => {
    if (!auth) return
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUserId(user.uid)
      } else {
        setAuthUserId(null)
      }
    })
    return () => unsubscribe()
  }, [])

  const loadClientes = useCallback(async (options?: { search?: string | null; syncSearchState?: boolean }) => {
    if (!userId) return
    const requestedSearch = typeof options?.search === 'string' ? options.search.trim() : ''
    const hasSearch = requestedSearch.length > 0
    const syncSearchState = options?.syncSearchState ?? false
    setLoading(true)
    setClientsError(null)
    try {
      const payload = await fetchWithAuth<ClientsListResponse>(
        `/api/clients${buildSessionQuery(hasSearch ? { search: requestedSearch } : {})}`
      )
      const clientesData = Array.isArray(payload.clients) ? payload.clients : []
      const normalizedPayloadSearch =
        typeof payload.search === 'string' ? payload.search.trim() : requestedSearch
      setTotalClientes(
        typeof payload.total === 'number' && Number.isFinite(payload.total)
          ? payload.total
          : clientesData.length
      )
      setMatchedClientesTotal(
        hasSearch
          ? typeof payload.matchedTotal === 'number' && Number.isFinite(payload.matchedTotal)
            ? payload.matchedTotal
            : clientesData.length
          : null
      )
      setClientes(
        clientesData.map((cliente) => ({
          ...cliente,
          status: normalizeClientStatus((cliente as any)?.status)
        }))
      )
      if (syncSearchState) {
        setAppliedSearch(hasSearch ? normalizedPayloadSearch : '')
        setSearchDraft(hasSearch ? normalizedPayloadSearch : '')
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error)
      const message = error instanceof Error ? error.message : 'unknown_error'
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('client_search_too_short')) {
        setClientsError(tr('Digite ao menos 2 caracteres úteis para pesquisar.', 'Enter at least 2 useful characters to search.'))
      } else if (hasSearch && normalizedMessage.includes('client_search_unavailable_in_fallback')) {
        setClientsError(
          tr(
            'A busca global está indisponível no momento. Tente novamente em instantes.',
            'Global search is currently unavailable right now. Please try again shortly.'
          )
        )
      } else if (hasSearch) {
        setClientsError(
          tr(
            'Não foi possível pesquisar na base inteira de clientes.',
            'Could not search the full client database.'
          )
        )
      } else {
        setClientsError(tr('Não foi possível carregar os clientes.', 'Could not load clients.'))
      }
    } finally {
      setLoading(false)
    }
  }, [buildSessionQuery, fetchWithAuth, tr, userId])

  const reloadClientes = useCallback(async () => {
    await loadClientes({ search: appliedSearch, syncSearchState: false })
  }, [appliedSearch, loadClientes])

  // Fetch clientes
  useEffect(() => {
    if (!userId) return
    void loadClientes({ search: null, syncSearchState: false })
  }, [userId, loadClientes])

  // Handlers
  const handleUpdateStatus = async (clienteId: string, newStatus: Cliente['status']) => {
    if (!userId) return

    try {
      if (newStatus === 'lead') {
        await fetchWithAuth(
          `/api/clients/${encodeURIComponent(clienteId)}/convert${buildSessionQuery({})}`,
          { method: 'POST' }
        )
      } else {
        await fetchWithAuth(
          `/api/clients/${encodeURIComponent(clienteId)}${buildSessionQuery({})}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
          }
        )
      }

      await reloadClientes()
    } catch (error) {
      console.error('Failed to update client status:', error)
    }
  }

  const handleDeleteCliente = async (clienteId: string) => {
    if (!userId || !confirm(tr('Tem certeza que deseja remover este cliente?', 'Are you sure you want to remove this client?'))) return
    try {
      await fetchWithAuth(
        `/api/clients/${encodeURIComponent(clienteId)}${buildSessionQuery({})}`,
        { method: 'DELETE' }
      )
      await reloadClientes()
    } catch (error) {
      console.error('Failed to delete client:', error)
    }
  }

  const toDateTimeLocalInput = (timestamp: number | null) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const handleOpenInlineNextContactEditor = (cliente: Cliente) => {
    setEditingNextContactClientId(cliente.id)
    setInlineNextContactValue(toDateTimeLocalInput(cliente.nextContactAt))
  }

  const handleCancelInlineNextContactEditor = () => {
    setEditingNextContactClientId(null)
    setInlineNextContactValue('')
  }

  const handleSaveInlineNextContact = async (clientId: string) => {
    if (!userId) return
    setSavingNextContactClientId(clientId)
    try {
      const nextContactAt = inlineNextContactValue ? new Date(inlineNextContactValue).getTime() : null
      await fetchWithAuth(
        `/api/clients/${encodeURIComponent(clientId)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ nextContactAt })
        }
      )

      setClientes((previous) =>
        previous.map((cliente) => (cliente.id === clientId ? { ...cliente, nextContactAt } : cliente))
      )
      setEditingNextContactClientId(null)
      setInlineNextContactValue('')
    } catch (error) {
      console.error('Failed to update next contact:', error)
    } finally {
      setSavingNextContactClientId(null)
    }
  }

  const openObservationPreview = (cliente: Cliente) => {
    const text = cliente.observations ?? ''
    setObservationPreview({
      clientId: cliente.id,
      clientName: cliente.name || tr('Sem nome', 'No name'),
      text,
      chatId: cliente.chatId ?? null
    })
    setEditingObservationPreview(false)
    setObservationPreviewDraft(text)
  }

  const openObservationEditor = (cliente: Cliente) => {
    openObservationPreview(cliente)
    setEditingObservationPreview(true)
  }

  const closeObservationPreview = () => {
    setObservationPreview(null)
    setEditingObservationPreview(false)
    setObservationPreviewDraft('')
    setSavingObservationPreview(false)
  }

  const handleSaveObservationPreview = async () => {
    if (!userId || !observationPreview || savingObservationPreview) return
    setSavingObservationPreview(true)
    try {
      const nextObservation = observationPreviewDraft.trim() ? observationPreviewDraft.trim() : null
      await fetchWithAuth(
        `/api/clients/${encodeURIComponent(observationPreview.clientId)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ observations: nextObservation })
        }
      )

      setClientes((previous) =>
        previous.map((cliente) =>
          cliente.id === observationPreview.clientId
            ? { ...cliente, observations: nextObservation }
            : cliente
        )
      )

      setObservationPreview((previous) =>
        previous
          ? {
              ...previous,
              text: nextObservation ?? ''
            }
          : previous
      )
      setEditingObservationPreview(false)
    } catch (error) {
      console.error('Failed to update client observation from preview:', error)
    } finally {
      setSavingObservationPreview(false)
    }
  }

  const resetCreateClientForm = () => {
    setCreateName('')
    setCreateWhatsapp('')
    setCreateStatus('ativo')
    setCreateNextContact('')
    setCreateObservations('')
    setCreateError(null)
  }

  const handleCreateClient = async () => {
    if (!userId) return

    const name = createName.trim() ? createName.trim() : null
    const whatsapp = createWhatsapp.trim() ? createWhatsapp.trim() : null
    const nextContactAt = createNextContact ? new Date(createNextContact).getTime() : null
    const observations = createObservations.trim() ? createObservations.trim() : null

    if (!name && !whatsapp) {
      setCreateError(tr('Informe nome ou WhatsApp.', 'Provide name or WhatsApp.'))
      return
    }
    if (createStatus === 'lead') {
      setCreateError(tr('Para criar um lead, use a tela de Leads.', 'To create a lead, use the Leads screen.'))
      return
    }

    setCreatingClient(true)
    setCreateError(null)
    try {
      await fetchWithAuth(
        `/api/clients${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            name,
            whatsapp,
            status: createStatus,
            nextContactAt,
            observations
          })
        }
      )

      resetCreateClientForm()
      setShowCreateClient(false)
      await reloadClientes()
    } catch (error) {
      console.error('Failed to create client:', error)
      setCreateError(tr('Não foi possível criar o cliente.', 'Could not create the client.'))
    } finally {
      setCreatingClient(false)
    }
  }

  const handleImportClients = async () => {
    if (!userId) return

    const { contacts, invalidLines } = parseClientImportText(importInput)
    if (contacts.length === 0) {
      setImportError(
        tr(
          'Cole uma lista (1 por linha) ou em pares (nome em cima, WhatsApp embaixo). Formatos aceitos: `whatsapp` ou `nome;whatsapp` ou `nome,whatsapp`.',
          'Paste a list (1 per line) or in pairs (name above, WhatsApp below). Accepted formats: `whatsapp`, `name;whatsapp`, or `name,whatsapp`.'
        )
      )
      return
    }

    setImportingClients(true)
    setImportError(null)
    setImportSummary(null)
    try {
      const payload = await fetchWithAuth<{ summary?: ClientImportSummary }>(
        `/api/clients/import${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            contacts: contacts.map((contact) => ({
              ...contact,
              status: importStatus
            })),
            updateExisting: true
          })
        }
      )

      if (payload.summary) {
        setImportSummary({
          ...payload.summary,
          invalid: payload.summary.invalid + invalidLines
        })
      }
      setImportInput('')
      await reloadClientes()
    } catch (error) {
      console.error('Failed to import clients:', error)
      setImportError(tr('Não foi possível importar os clientes.', 'Could not import clients.'))
    } finally {
      setImportingClients(false)
    }
  }

  const toggleSort = (field: 'lastContact' | 'name' | 'nextContact' | 'totalValue') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleApplySearch = useCallback(async () => {
    if (loading) return

    const nextSearch = searchDraft.trim()
    if (!nextSearch) {
      setClientsError(null)
      setAppliedSearch('')
      setMatchedClientesTotal(null)
      setSearchDraft('')
      await loadClientes({ search: null, syncSearchState: false })
      return
    }

    if (countUsefulClientSearchChars(nextSearch) < 2) {
      setClientsError(tr('Digite ao menos 2 caracteres úteis para pesquisar.', 'Enter at least 2 useful characters to search.'))
      return
    }

    setClientsError(null)
    await loadClientes({ search: nextSearch, syncSearchState: true })
  }, [loadClientes, loading, searchDraft, tr])

  // Filtered and sorted clientes
  const filteredClientes = useMemo(() => {
    const now = Date.now()
    return clientes
      .filter(cliente => {
        const matchesStatus = statusFilter === 'todos' || cliente.status === statusFilter
        
        // Filtro de último contato por data manual
        let matchesLastContact = true
        if (lastContactDateFrom || lastContactDateTo) {
          if (cliente.lastContactAt) {
            const clienteDate = cliente.lastContactAt
            const fromDate = lastContactDateFrom ? new Date(lastContactDateFrom).getTime() : 0
            const toDate = lastContactDateTo ? new Date(lastContactDateTo + 'T23:59:59').getTime() : Date.now()
            matchesLastContact = clienteDate >= fromDate && clienteDate <= toDate
          } else {
            matchesLastContact = false
          }
        }
        
        // Filtro de próximo contato
        let matchesNextContact = true
        if (nextContactDateFrom || nextContactDateTo) {
          // Filtro por data manual tem prioridade
          if (cliente.nextContactAt) {
            const clienteDate = cliente.nextContactAt
            const fromDate = nextContactDateFrom ? new Date(nextContactDateFrom).getTime() : 0
            const toDate = nextContactDateTo ? new Date(nextContactDateTo + 'T23:59:59').getTime() : Infinity
            matchesNextContact = clienteDate >= fromDate && clienteDate <= toDate
          } else {
            matchesNextContact = false
          }
        } else if (nextContactFilter === 'com_data') {
          matchesNextContact = cliente.nextContactAt != null
        } else if (nextContactFilter === 'sem_data') {
          matchesNextContact = cliente.nextContactAt == null
        } else if (nextContactFilter === 'vencido') {
          matchesNextContact = cliente.nextContactAt !== null && cliente.nextContactAt < now
        } else if (nextContactFilter === 'hoje') {
          if (cliente.nextContactAt) {
            const nextDate = new Date(cliente.nextContactAt)
            const today = new Date()
            matchesNextContact = nextDate.toDateString() === today.toDateString()
          } else {
            matchesNextContact = false
          }
        }
        
        // Filtro de observações
        let matchesObservations = true
        if (observationsFilter === 'com_observacoes') {
          matchesObservations = cliente.observations !== null && cliente.observations !== undefined && cliente.observations.trim() !== ''
        } else if (observationsFilter === 'sem_observacoes') {
          matchesObservations = !cliente.observations || cliente.observations.trim() === ''
        }
        
        return matchesStatus && matchesLastContact && matchesNextContact && matchesObservations
      })
      .sort((a, b) => {
        let comparison = 0
        if (sortBy === 'lastContact') {
          const timeA = a.lastContactAt ?? 0
          const timeB = b.lastContactAt ?? 0
          comparison = timeA - timeB
        } else if (sortBy === 'nextContact') {
          const timeA = a.nextContactAt ?? 0
          const timeB = b.nextContactAt ?? 0
          comparison = timeA - timeB
        } else if (sortBy === 'totalValue') {
          const valueA = a.totalValue || 0
          const valueB = b.totalValue || 0
          comparison = valueA - valueB
        } else {
          const nameA = a.name ?? ''
          const nameB = b.name ?? ''
          comparison = nameA.localeCompare(nameB)
        }
        return sortOrder === 'desc' ? -comparison : comparison
      })
  }, [clientes, statusFilter, nextContactFilter, observationsFilter, lastContactDateFrom, lastContactDateTo, nextContactDateFrom, nextContactDateTo, sortBy, sortOrder])

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return tr('Nunca', 'Never')
    const date = new Date(timestamp)
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateOnly = (timestamp: number | null) => {
    if (!timestamp) return tr('Não definido', 'Not set')
    const date = new Date(timestamp)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (date.toDateString() === today.toDateString()) {
      return tr('Hoje', 'Today')
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return tr('Amanha', 'Tomorrow')
    }
    
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return locale === 'en' ? 'R$0.00' : 'R$ 0,00'
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const getNextContactStatus = (timestamp: number | null) => {
    if (!timestamp) return { label: tr('Sem data', 'No date'), color: 'text-gray-500' }
    const date = new Date(timestamp)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    
    if (days < 0) {
      return { label: tr('Vencido', 'Overdue'), color: 'text-red-500' }
    } else if (days === 0) {
      return { label: tr('Hoje', 'Today'), color: 'text-yellow-500' }
    } else if (days === 1) {
      return { label: tr('Amanha', 'Tomorrow'), color: 'text-blue-500' }
    } else if (days <= 7) {
      return { label: isEn ? `In ${days} days` : `Em ${days} dias`, color: 'text-green-500' }
    } else {
      return { label: formatDateOnly(timestamp), color: 'text-gray-400' }
    }
  }

  const clearAllFilters = useCallback(() => {
    setStatusFilter('todos')
    setNextContactFilter('todos')
    setObservationsFilter('todos')
    setSearchDraft('')
    setAppliedSearch('')
    setMatchedClientesTotal(null)
    setLastContactDateFrom('')
    setLastContactDateTo('')
    setNextContactDateFrom('')
    setNextContactDateTo('')
    setClientsError(null)
    void loadClientes({ search: null, syncSearchState: false })
  }, [loadClientes])

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (statusFilter !== 'todos') count++
    if (nextContactFilter !== 'todos') count++
    if (observationsFilter !== 'todos') count++
    if (appliedSearch) count++
    if (lastContactDateFrom || lastContactDateTo) count++
    if (nextContactDateFrom || nextContactDateTo) count++
    return count
  }, [statusFilter, nextContactFilter, observationsFilter, appliedSearch, lastContactDateFrom, lastContactDateTo, nextContactDateFrom, nextContactDateTo])

  const searchResultsTotal =
    appliedSearch && typeof matchedClientesTotal === 'number' && Number.isFinite(matchedClientesTotal)
      ? matchedClientesTotal
      : appliedSearch
        ? clientes.length
        : null

  const guidedSteps = useMemo<GuidedStep[]>(
    () => [
      {
        id: 'tabs',
        target: 'tabs',
        title: tr('Etapa 1: Navegação de Clientes', 'Step 1: Clients navigation'),
        description: tr(
          'Aqui você alterna entre Lista, Sugestões IA e Logs para gerir clientes com apoio da IA.',
          'Here you switch between List, AI suggestions, and Logs to manage clients with AI support.'
        )
      },
      {
        id: 'search_filters',
        target: 'search_filters',
        title: tr('Etapa 2: Busca e filtros', 'Step 2: Search and filters'),
        description: tr(
          'Use a busca e os filtros para encontrar rápidamente os clientes certos.',
          'Use search and filters to quickly find the right clients.'
        )
      },
      {
        id: 'advanced_filters',
        target: 'advanced_filters',
        title: tr('Etapa 3: Filtros avançados', 'Step 3: Advanced filters'),
        description: tr(
          'Refine por status, período e observações para priorizar o atendimento.',
          'Refine by status, period, and notes to prioritize customer handling.'
        )
      },
      {
        id: 'table',
        target: 'table',
        title: tr('Etapa 4: Tabela de clientes', 'Step 4: Clients table'),
        description: tr(
          'A tabela centraliza dados do cliente e ações operacionais no CRM.',
          'The table centralizes client data and operational CRM actions.'
        )
      },
      {
        id: 'status_column',
        target: 'status_column',
        title: tr('Etapa 5: Status do cliente', 'Step 5: Client status'),
        description: tr(
          'Atualize o status para refletir a etapa atual do relacionamento.',
          'Update status to reflect the current relationship stage.'
        )
      },
      {
        id: 'value_tracking',
        target: 'value_tracking',
        title: tr('Etapa 6: Valor e acompanhamento', 'Step 6: Value and tracking'),
        description: tr(
          'Acompanhe valor total e últimos contatos para priorizar o que gera mais retorno.',
          'Track total value and recent contacts to prioritize what generates more return.'
        )
      },
      {
        id: 'notes_column',
        target: 'notes_column',
        title: tr('Etapa 7: Observações', 'Step 7: Notes'),
        description: tr(
          'Registre contexto do cliente para manter histórico claro do atendimento.',
          'Capture client context to keep a clear customer history.'
        )
      },
      {
        id: 'ai_actions',
        target: 'ai_actions',
        title: tr('Etapa 8: Follow-up com IA', 'Step 8: AI follow-up'),
        description: tr(
          'Use este botão para gerar follow-up com IA no cliente selecionado.',
          'Use this button to generate AI follow-up for the selected client.'
        )
      },
      {
        id: 'suggestions_tab',
        target: 'suggestions_tab',
        title: tr('Etapa 9: Abrir Sugestões IA', 'Step 9: Open AI suggestions'),
        description: tr(
          'Agora vamos para a aba de sugestões para validar alterações antes de aplicar no CRM.',
          'Now we move to the suggestions tab to validate changes before applying them to the CRM.'
        )
      },
      {
        id: 'suggestions_demo',
        target: 'suggestions_demo',
        title: tr('Etapa 10: Como usar Sugestões IA', 'Step 10: How to use AI suggestions'),
        description: tr(
          'Nesta caixa demo você vê o fluxo recomendado para revisar, editar e aprovar sugestões da IA.',
          'In this demo box you can see the recommended flow to review, edit, and approve AI suggestions.'
        )
      },
      {
        id: 'logs_tab',
        target: 'logs_tab',
        title: tr('Etapa 11: Abrir Logs', 'Step 11: Open logs'),
        description: tr(
          'Agora vamos para a aba de logs para auditar o histórico de decisões.',
          'Now we move to the logs tab to audit decision history.'
        )
      },
      {
        id: 'logs_demo',
        target: 'logs_demo',
        title: tr('Etapa 12: Como ler os Logs', 'Step 12: How to read logs'),
        description: tr(
          'Nesta caixa demo você entende como filtrar eventos e rastrear alterações aplicadas.',
          'In this demo box you learn how to filter events and track applied changes.'
        )
      }
    ],
    [tr]
  )

  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

  const resolveGuidedTargetElement = useCallback((target: GuidedStepTarget) => {
    if (target === 'tabs') return tabsRef.current
    if (target === 'search_filters') return filtersRef.current
    if (target === 'advanced_filters') return advancedFiltersRef.current
    if (target === 'table') return firstClientRowRef.current ?? tableHeaderRef.current ?? tableRef.current
    if (target === 'status_column') return statusColumnRef.current
    if (target === 'value_tracking') return valueTrackingRef.current
    if (target === 'notes_column') return notesColumnRef.current
    if (target === 'ai_actions') return aiActionsRef.current
    if (target === 'suggestions_tab') return tabsRef.current
    if (target === 'suggestions_demo') return suggestionsDemoRef.current ?? tabsRef.current
    if (target === 'logs_tab') return tabsRef.current
    return logsDemoRef.current ?? tabsRef.current
  }, [])

  const restoreGuidedSnapshot = useCallback(() => {
    const snapshot = guidedSnapshotRef.current
    if (!snapshot) return
    setActiveTab(snapshot.activeTab)
    setShowFilters(snapshot.showFilters)
    setEditingNextContactClientId(null)
    setInlineNextContactValue('')
    guidedSnapshotRef.current = null
  }, [])

  const closeGuidedOnboarding = useCallback(() => {
    guidedSuppressAutoOpenRef.current = true
    setGuidedOpen(false)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
    setGuidedDemoClient(null)
    setFollowUpTarget(null)
    setEditingNextContactClientId(null)
    setInlineNextContactValue('')
    closeObservationPreview()
    restoreGuidedSnapshot()

    const query = new URLSearchParams(searchParams.toString())
    if (query.has('guidedOnboarding')) {
      query.delete('guidedOnboarding')
    }
    if (query.has('guidedTutorial')) {
      query.delete('guidedTutorial')
    }
    const queryString = query.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname)
  }, [pathname, restoreGuidedSnapshot, router, searchParams])

  const goToPreviousGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.max(0, current - 1))
  }, [])

  const goToNextGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.min(lastGuidedStepIndex, current + 1))
  }, [lastGuidedStepIndex])

  const isGuidedTargetActive = useCallback(
    (target: GuidedStepTarget) => guidedOpen && currentGuidedStep?.target === target,
    [currentGuidedStep?.target, guidedOpen]
  )

  const finishGuidedTutorial = useCallback(() => {
    if (userId) {
      markGuidedTutorialCompleted(userId, currentGuidedTutorialKey)
    }
    setGuidedCompletionModalOpen(true)
  }, [currentGuidedTutorialKey, userId])

  const goToNextGuidedTutorial = useCallback(() => {
    restoreGuidedSnapshot()
    setGuidedDemoClient(null)

    if (!nextGuidedTutorialKey) {
      closeGuidedOnboarding()
      return
    }

    setGuidedCompletionModalOpen(false)
    setGuidedOpen(false)
    setGuidedStep(0)

    const nextRouteKey = GUIDED_TUTORIAL_ROUTE_KEYS[nextGuidedTutorialKey]
    router.push(
      toRoute(nextRouteKey, {
        query: {
          guidedOnboarding: '1',
          guidedTutorial: nextGuidedTutorialKey
        }
      })
    )
  }, [closeGuidedOnboarding, nextGuidedTutorialKey, restoreGuidedSnapshot, router, toRoute])

  const displayClientes = useMemo(() => {
    if (guidedOpen && activeTab === 'lista' && guidedDemoClient) {
      const withoutDemo = filteredClientes.filter((cliente) => cliente.id !== GUIDED_DEMO_CLIENT_ID)
      return [guidedDemoClient, ...withoutDemo]
    }
    return filteredClientes
  }, [activeTab, filteredClientes, guidedDemoClient, guidedOpen])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!isGuidedOnboardingEnabled) {
      guidedSuppressAutoOpenRef.current = true
      if (guidedOpen) {
        setGuidedOpen(false)
      }
      return
    }

    const shouldOpen =
      searchParams.get('guidedOnboarding') === '1' &&
      (!searchParams.get('guidedTutorial') || currentGuidedTutorialKey === 'clients')

    if (!shouldOpen) {
      guidedSuppressAutoOpenRef.current = false
      return
    }
    if (guidedSuppressAutoOpenRef.current) return
    if (guidedOpen) return

    if (!guidedSnapshotRef.current) {
      guidedSnapshotRef.current = {
        activeTab,
        showFilters
      }
    }

    setActiveTab('lista')
    setShowFilters(false)
    setEditingNextContactClientId(null)
    setInlineNextContactValue('')
    closeObservationPreview()
    setFollowUpTarget(null)
    setGuidedOpen(true)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
  }, [activeTab, currentGuidedTutorialKey, guidedOpen, isGuidedOnboardingEnabled, searchParams, showFilters])

  useEffect(() => {
    if (!guidedOpen) return

    const target = currentGuidedStep.target
    setEditingNextContactClientId(null)
    setInlineNextContactValue('')
    closeObservationPreview()
    setFollowUpTarget(null)

    if (target === 'suggestions_tab' || target === 'suggestions_demo') {
      setActiveTab('sugestoes')
      setShowFilters(false)
      return
    }

    if (target === 'logs_tab' || target === 'logs_demo') {
      setActiveTab('logs')
      setShowFilters(false)
      return
    }

    setActiveTab('lista')
    setShowFilters(target === 'advanced_filters')
  }, [currentGuidedStep.target, guidedOpen])

  useEffect(() => {
    if (!guidedOpen) return

    const scrollToTarget = () => {
      const target = resolveGuidedTargetElement(currentGuidedStep.target)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }

    const timeoutA = window.setTimeout(scrollToTarget, 90)
    const timeoutB = window.setTimeout(scrollToTarget, 280)
    return () => {
      window.clearTimeout(timeoutA)
      window.clearTimeout(timeoutB)
    }
  }, [currentGuidedStep.target, guidedOpen, resolveGuidedTargetElement])

  useEffect(() => {
    if (!guidedOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (guidedCompletionModalOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeGuidedOnboarding()
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeGuidedOnboarding()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousGuidedStep()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (guidedStep === lastGuidedStepIndex) {
          return
        }
        goToNextGuidedStep()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    closeGuidedOnboarding,
    goToNextGuidedStep,
    goToPreviousGuidedStep,
    guidedCompletionModalOpen,
    guidedOpen,
    guidedStep,
    lastGuidedStepIndex
  ])

  useEffect(() => {
    if (guidedOpen && activeTab === 'lista') {
      setGuidedDemoClient((current) => {
        if (current) return current
        const now = Date.now()
        return {
          id: GUIDED_DEMO_CLIENT_ID,
          name: tr('Cliente Demo', 'Demo client'),
          whatsapp: '+55 11 99999-0000',
          chatId: null,
          status: 'ativo',
          lastContactAt: now - 1000 * 60 * 45,
          nextContactAt: now + 1000 * 60 * 60 * 24,
          observations: tr('Exemplo fictício para demonstrar os recursos da aba Clientes.', 'Fictional example to demonstrate Clients tab features.'),
          createdAt: now - 1000 * 60 * 60 * 24 * 3,
          lastMessage: tr('Vamos alinhar os próximos passos ainda hoje?', 'Can we align next steps today?'),
          source: 'demo',
          totalValue: 2490
        }
      })
      return
    }

    setGuidedDemoClient(null)
  }, [activeTab, guidedOpen, tr])

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-primary" />
            {tr('Gestão de clientes', 'Client management')}
          </h1>
          <p className="text-gray-400 text-sm">{tr('Acompanhe e gerencie seus clientes.', 'Track and manage your clients.')}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setShowCreateClient((prev) => !prev)
              setCreateError(null)
            }}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {tr('Novo cliente', 'New client')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowImportClients((prev) => !prev)
              setImportError(null)
              setImportSummary(null)
            }}
          >
            <FileUp className="w-4 h-4 mr-2" />
            {tr('Importar em massa', 'Bulk import')}
          </Button>
          <div className="bg-surface-light border border-surface-lighter px-4 py-2 rounded-xl">
            <span className="text-xs text-gray-400 block uppercase font-bold">{tr('Total de clientes', 'Total clients')}</span>
            <span className="text-xl font-bold text-white">{totalClientes}</span>
          </div>
        </div>
      </div>

      <div
        ref={tabsRef}
        className={cn(
          'flex items-center gap-2 bg-surface-light border border-surface-lighter p-2 rounded-2xl w-fit',
          (isGuidedTargetActive('tabs') ||
            isGuidedTargetActive('suggestions_tab') ||
            isGuidedTargetActive('logs_tab')) &&
            'relative z-[210] ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
        )}
      >
        <button
          type="button"
          onClick={() => setActiveTab('lista')}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-bold transition-all',
            activeTab === 'lista'
              ? 'bg-primary/10 text-primary'
              : 'text-gray-400 hover:text-white hover:bg-surface-lighter'
          )}
        >
          {tr('Lista', 'List')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sugestoes')}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-bold transition-all',
            activeTab === 'sugestoes'
              ? 'bg-primary/10 text-primary'
              : 'text-gray-400 hover:text-white hover:bg-surface-lighter'
          )}
        >
          {tr('Sugestões IA', 'AI suggestions')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-bold transition-all',
            activeTab === 'logs'
              ? 'bg-primary/10 text-primary'
              : 'text-gray-400 hover:text-white hover:bg-surface-lighter'
          )}
        >
          Logs
        </button>
      </div>

      {activeTab === 'lista' ? (
        <>
          {showCreateClient && (
            <div className="bg-surface-light border border-surface-lighter p-4 rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white">{tr('Criar cliente manual', 'Create client manually')}</h2>
                  <p className="text-gray-400 text-xs">{tr('Informe nome e/ou WhatsApp.', 'Provide name and/or WhatsApp.')}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateClient(false)
                    resetCreateClientForm()
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    {tr('Nome', 'Name')}
                  </label>
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder={tr('Ex: Maria', 'E.g.: Maria')}
                    className="bg-surface border-surface-lighter"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    WhatsApp
                  </label>
                  <Input
                    value={createWhatsapp}
                    onChange={(e) => setCreateWhatsapp(e.target.value)}
                    placeholder={tr('Ex: +55 11 99999-9999', 'E.g.: +1 202 555-0123')}
                    className="bg-surface border-surface-lighter"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    {tr('Status', 'Status')}
                  </label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as Cliente['status'])}
                    className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
                  >
                    <option value="ativo">{tr('Ativo', 'Active')}</option>
                    <option value="inativo">{tr('Inativo', 'Inactive')}</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    {tr('Próximo contato', 'Next contact')}
                  </label>
                  <input
                    type="datetime-local"
                    value={createNextContact}
                    onChange={(e) => setCreateNextContact(e.target.value)}
                    className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-2.5 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  {tr('Observações', 'Notes')}
                </label>
                <Textarea
                  value={createObservations}
                  onChange={(e) => setCreateObservations(e.target.value)}
                  placeholder={tr('Anotações sobre esse cliente...', 'Notes about this client...')}
                  className="min-h-[80px] text-sm"
                />
              </div>

              {createError && (
                <div className="text-sm text-red-400">
                  {createError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void handleCreateClient()}
                  disabled={creatingClient}
                >
                  {creatingClient && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {tr('Criar', 'Create')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateClient(false)
                    resetCreateClientForm()
                  }}
                  disabled={creatingClient}
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
              </div>
            </div>
          )}
          {showImportClients && (
            <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white">{tr('Importação em massa', 'Bulk import')}</h2>
                  <p className="text-gray-400 text-xs">
                    {tr(
                      'Cole uma lista (1 por linha) ou em pares (nome em cima, WhatsApp embaixo). Formatos aceitos: `whatsapp` ou `nome;whatsapp` ou `nome,whatsapp`.',
                      'Paste a list (1 per line) or in pairs (name above, WhatsApp below). Accepted formats: `whatsapp`, `name;whatsapp`, or `name,whatsapp`.'
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowImportClients(false)
                    setImportError(null)
                    setImportSummary(null)
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <div className="md:w-[220px] md:flex-shrink-0">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    {tr('Status na importação', 'Import status')}
                  </label>
                  <select
                    value={importStatus}
                    onChange={(e) => setImportStatus(e.target.value as Cliente['status'])}
                    className="w-full h-10 bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block px-3"
                  >
                    <option value="ativo">{tr('Ativo', 'Active')}</option>
                    <option value="inativo">{tr('Inativo', 'Inactive')}</option>
                    <option value="vip">VIP</option>
                  </select>
                </div>
                <div className="flex-1 rounded-xl border border-surface-lighter bg-surface/60 p-3 md:p-4">
                  <p className="text-sm font-semibold text-gray-200">
                    {tr('Como funciona a importação', 'How import works')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">
                    {tr(
                      'Você pode colar somente números, ou pares de nome + número em diferentes formatos. A importação cria os novos clientes e também atualiza os existentes quando o WhatsApp for o mesmo.',
                      'You can paste only numbers, or name + number pairs in different formats. Import creates new clients and also updates existing ones when WhatsApp matches.'
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-primary">
                    {tr(
                      'Defina o status padrão para os clientes importados e ajuste depois na tabela quando necessário.',
                      'Set the default status for imported clients and adjust it later in the table when needed.'
                    )}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  {tr('Lista para importar', 'List to import')}
                </label>
                <Textarea
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder={tr(
                    'Ex:\nTania Santiago\n+55 21 96418-3539\nMaria;+55 11 99999-9999\n+55 11 98888-7777',
                    'Example:\nTania Santiago\n+55 21 96418-3539\nMaria;+55 11 99999-9999\n+55 11 98888-7777'
                  )}
                  className="min-h-[140px] text-sm font-mono"
                />
              </div>

              {importError && <div className="text-sm text-red-400">{importError}</div>}

              {importSummary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <div className="bg-surface rounded-lg p-2 border border-surface-lighter">
                    <div className="text-gray-400 text-xs uppercase">{tr('Total', 'Total')}</div>
                    <div className="text-white font-bold">{importSummary.total}</div>
                  </div>
                  <div className="bg-surface rounded-lg p-2 border border-surface-lighter">
                    <div className="text-gray-400 text-xs uppercase">{tr('Criados', 'Created')}</div>
                    <div className="text-green-400 font-bold">{importSummary.created}</div>
                  </div>
                  <div className="bg-surface rounded-lg p-2 border border-surface-lighter">
                    <div className="text-gray-400 text-xs uppercase">{tr('Atualizados', 'Updated')}</div>
                    <div className="text-blue-400 font-bold">{importSummary.updated}</div>
                  </div>
                  <div className="bg-surface rounded-lg p-2 border border-surface-lighter">
                    <div className="text-gray-400 text-xs uppercase">{tr('Ignorados', 'Skipped')}</div>
                    <div className="text-yellow-400 font-bold">{importSummary.skipped}</div>
                  </div>
                  <div className="bg-surface rounded-lg p-2 border border-surface-lighter">
                    <div className="text-gray-400 text-xs uppercase">{tr('Inválidos', 'Invalid')}</div>
                    <div className="text-red-400 font-bold">{importSummary.invalid}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void handleImportClients()}
                  disabled={importingClients}
                >
                  {importingClients && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <FileUp className="w-4 h-4 mr-2" />
                  {tr('Importar', 'Import')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportClients(false)
                    setImportError(null)
                    setImportSummary(null)
                  }}
                  disabled={importingClients}
                >
                  {tr('Fechar', 'Close')}
                </Button>
              </div>
            </div>
          )}

          {/* Filters and search */}
          <div
            ref={filtersRef}
            className={cn(
              'bg-surface-light border border-surface-lighter p-4 rounded-2xl space-y-4',
              isGuidedTargetActive('search_filters') &&
                'relative z-[210] ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
            )}
          >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex w-full gap-2 lg:flex-1 lg:min-w-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder={tr('Buscar na base por nome ou WhatsApp...', 'Search the full database by name or WhatsApp...')}
                value={searchDraft}
                onChange={(e) => {
                  setSearchDraft(e.target.value)
                  if (clientsError) {
                    setClientsError(null)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleApplySearch()
                  }
                }}
                className="h-10 pl-10 bg-surface border-surface-lighter"
              />
            </div>
            <Button
              onClick={() => void handleApplySearch()}
              disabled={loading}
              className="h-10 shrink-0"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {!loading && <Search className="w-4 h-4 mr-2" />}
              {tr('Pesquisar', 'Search')}
            </Button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
            <div className="sm:min-w-[180px]">
              <ColorDropdown
                value={statusFilter}
                options={statusFilterOptions}
                onChange={setStatusFilter}
                ariaLabel={tr('Filtrar por status', 'Filter by status')}
                widthClassName="w-full sm:w-[190px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "h-10 bg-surface border-surface-lighter hover:bg-surface-lighter/80 relative",
                  showFilters && "bg-primary/10 border-primary"
                )}
              >
                <Filter className="w-4 h-4 mr-2" />
                {tr('Filtros', 'Filters')}
                {activeFiltersCount > 0 && (
                  <span className="ml-2 bg-primary text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>

              {activeFiltersCount > 0 && (
                <Button 
                  variant="outline" 
                  onClick={clearAllFilters}
                  className="h-10 bg-surface-lighter border-none hover:bg-surface-lighter/80"
                >
                  <X className="w-4 h-4 mr-2" />
                  {tr('Limpar', 'Clear')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {clientsError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {clientsError}
          </div>
        )}

        {activeTab === 'lista' && appliedSearch && searchResultsTotal !== null && (
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-gray-200">
            <div>
              {tr(
                `Exibindo ${filteredClientes.length} de ${searchResultsTotal} resultados para "${appliedSearch}".`,
                `Showing ${filteredClientes.length} of ${searchResultsTotal} results for "${appliedSearch}".`
              )}
            </div>
            {searchResultsTotal > 50 && (
              <div className="mt-1 text-xs text-primary-100">
                {tr('A v1 mostra apenas os primeiros 50.', 'Version 1 only shows the first 50.')}
              </div>
            )}
          </div>
        )}

        {/* Advanced filters panel */}
        {showFilters && (
          <div
            ref={advancedFiltersRef}
            className={cn(
              'border-t border-surface-lighter pt-4 space-y-4',
              isGuidedTargetActive('advanced_filters') &&
                'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 p-3 pointer-events-none'
            )}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-surface-lighter bg-surface/40 p-4 space-y-3">
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  {tr('Próximo contato', 'Next contact')}
                </label>
                <select 
                  value={nextContactFilter}
                  onChange={(e) => setNextContactFilter(e.target.value)}
                  className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
                >
                  <option value="todos">{tr('Todos', 'All')}</option>
                  <option value="com_data">{tr('Com data definida', 'With date')}</option>
                  <option value="sem_data">{tr('Sem data definida', 'Without date')}</option>
                  <option value="vencido">{tr('Vencidos', 'Overdue')}</option>
                  <option value="hoje">{tr('Hoje', 'Today')}</option>
                </select>
              </div>

              <div className="rounded-xl border border-surface-lighter bg-surface/40 p-4 space-y-3">
                <label className="block text-xs font-bold text-gray-400 uppercase">
                  {tr('Observações', 'Notes')}
                </label>
                <ColorDropdown
                  value={observationsFilter}
                  options={observationsFilterOptions}
                  onChange={setObservationsFilter}
                  ariaLabel={tr('Filtrar observações', 'Filter notes')}
                  widthClassName="w-full"
                />
              </div>
            </div>

            {/* Manual date filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-surface-lighter pt-4">
              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-400 uppercase">
                  {tr('Último contato - período', 'Last contact - period')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tr('De', 'From')}:</label>
                    <input
                      type="date"
                      value={lastContactDateFrom}
                      onChange={(e) => setLastContactDateFrom(e.target.value)}
                      className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tr('Até', 'To')}:</label>
                    <input
                      type="date"
                      value={lastContactDateTo}
                      onChange={(e) => setLastContactDateTo(e.target.value)}
                      className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>
                {(lastContactDateFrom || lastContactDateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLastContactDateFrom('')
                      setLastContactDateTo('')
                    }}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3 mr-1" />
                    {tr('Limpar filtro de data', 'Clear date filter')}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-gray-400 uppercase">
                  {tr('Próximo contato - período', 'Next contact - period')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tr('De', 'From')}:</label>
                    <input
                      type="date"
                      value={nextContactDateFrom}
                      onChange={(e) => setNextContactDateFrom(e.target.value)}
                      className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tr('Até', 'To')}:</label>
                    <input
                      type="date"
                      value={nextContactDateTo}
                      onChange={(e) => setNextContactDateTo(e.target.value)}
                      className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-1.5 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>
                {(nextContactDateFrom || nextContactDateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNextContactDateFrom('')
                      setNextContactDateTo('')
                    }}
                    className="text-xs text-gray-400 hover:text-white"
                  >
                    <X className="w-3 h-3 mr-1" />
                    {tr('Limpar filtro de data', 'Clear date filter')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clients list */}
      <div
        ref={tableRef}
        className="bg-surface-light border border-surface-lighter rounded-2xl overflow-hidden shadow-xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed">
            <thead
              ref={tableHeaderRef}
              className={cn(
                isGuidedTargetActive('table') &&
                  'relative z-[210] ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
              )}
            >
              <tr className="bg-surface/50 border-b border-surface-lighter">
                <th className="px-3 py-4 w-[190px] text-xs font-bold text-gray-400 tracking-wider align-middle text-left">
                  <span>{tr('Cliente', 'Client')}</span>
                </th>
                <th className="px-3 py-4 w-[220px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">WhatsApp</th>
                <th className="px-4 py-4 w-[180px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">{tr('Status', 'Status')}</th>
                <th className="px-4 py-4 w-[170px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">
                  <button
                    onClick={() => toggleSort('totalValue')}
                    className="grid w-full grid-cols-[1fr_auto_1fr] items-center hover:text-white transition-colors whitespace-nowrap"
                  >
                    <span className="col-start-2 justify-self-center">{tr('Valor total', 'Total value')}</span>
                    <ArrowUpDown
                      className={cn(
                        "col-start-3 justify-self-end w-3 h-3",
                        sortBy === 'totalValue' ? "text-white" : "text-gray-500"
                      )}
                    />
                  </button>
                </th>
                <th className="px-4 py-4 w-[190px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">
                  <button
                    onClick={() => toggleSort('lastContact')}
                    className="grid w-full grid-cols-[1fr_auto_1fr] items-center hover:text-white transition-colors whitespace-nowrap"
                  >
                    <span className="col-start-2 justify-self-center">{tr('Último contato', 'Last contact')}</span>
                    <ArrowUpDown
                      className={cn(
                        "col-start-3 justify-self-end w-3 h-3",
                        sortBy === 'lastContact' ? "text-white" : "text-gray-500"
                      )}
                    />
                  </button>
                </th>
                <th className="px-4 py-4 w-[190px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">
                  <button
                    onClick={() => toggleSort('nextContact')}
                    className="grid w-full grid-cols-[1fr_auto_1fr] items-center hover:text-white transition-colors whitespace-nowrap"
                  >
                    <span className="col-start-2 justify-self-center">{tr('Próximo contato', 'Next contact')}</span>
                    <ArrowUpDown
                      className={cn(
                        "col-start-3 justify-self-end w-3 h-3",
                        sortBy === 'nextContact' ? "text-white" : "text-gray-500"
                      )}
                    />
                  </button>
                </th>
                <th className="px-4 py-4 w-[120px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">{tr('IA', 'AI')}</th>
                <th className="px-4 py-4 w-[220px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">{tr('Observações', 'Notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-lighter/30">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                    <p className="mt-2 text-gray-400">{tr('Carregando clientes...', 'Loading clients...')}</p>
                  </td>
                </tr>
              ) : displayClientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {tr('Nenhum cliente encontrado com os filtros atuais.', 'No client found with current filters.')}
                  </td>
                </tr>
              ) : (
                displayClientes.map((cliente, index) => {
                  const isDemoClient = cliente.id === GUIDED_DEMO_CLIENT_ID
                  return (
                  <tr
                    ref={index === 0 ? firstClientRowRef : undefined}
                    key={cliente.id}
                    className={cn(
                      'hover:bg-surface-lighter/20 transition-colors group',
                      index === 0 &&
                        isGuidedTargetActive('table') &&
                        'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                    )}
                  >
                    <td className="px-3 py-4 align-middle w-[190px] text-left">
                      <div className="min-w-0 max-w-[170px]">
                        <p
                          className="font-semibold text-white truncate"
                          title={cliente.name ?? tr('Sem nome', 'No name')}
                        >
                          {cliente.name || tr('Sem nome', 'No name')}
                        </p>
                        {isDemoClient ? (
                          <span className="mt-1 inline-flex rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {tr('Demo onboarding', 'Onboarding demo')}
                          </span>
                        ) : null}
                        <p className="text-xs text-gray-500 truncate">{cliente.lastMessage || tr('Sem mensagens', 'No messages')}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4 align-middle w-[220px] text-center">
                      <div className="mx-auto w-full max-w-[200px] text-center text-gray-300">
                        <span className="font-mono text-sm truncate block">{cliente.whatsapp ?? '-'}</span>
                      </div>
                    </td>
                    <td
                      ref={index === 0 ? statusColumnRef : undefined}
                      className={cn(
                        'px-4 py-4 align-middle w-[180px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('status_column') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        <ColorDropdown
                          value={cliente.status}
                          options={statusOptions}
                          onChange={(value) => {
                            if (isDemoClient) return
                            void handleUpdateStatus(cliente.id, value)
                          }}
                          ariaLabel={tr('Selecionar status', 'Select status')}
                        />
                      </div>
                    </td>
                    <td
                      ref={index === 0 ? valueTrackingRef : undefined}
                      className={cn(
                        'px-4 py-4 align-middle w-[170px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('value_tracking') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex min-h-[42px] w-full items-center justify-center text-center">
                        <span className="text-sm font-semibold text-white leading-none">{formatCurrency(cliente.totalValue)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle w-[190px] text-center">
                      <div className="flex min-h-[42px] w-full flex-col items-center justify-center text-center leading-tight">
                        <span className="text-sm text-gray-300">{formatDate(cliente.lastContactAt)}</span>
                        {cliente.source && (
                          <span className="mt-1 text-[10px] text-gray-500 uppercase">{cliente.source}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle w-[190px] text-center">
                      {editingNextContactClientId === cliente.id ? (
                        <div className="space-y-2">
                          <input
                            type="datetime-local"
                            value={inlineNextContactValue}
                            onChange={(e) => setInlineNextContactValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void handleSaveInlineNextContact(cliente.id)
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                handleCancelInlineNextContactEditor()
                              }
                            }}
                            className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-1 focus:ring-primary focus:border-primary"
                          />
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => void handleSaveInlineNextContact(cliente.id)}
                              disabled={savingNextContactClientId === cliente.id}
                              className="h-7 px-2 bg-primary hover:bg-primary/90"
                            >
                              {savingNextContactClientId === cliente.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelInlineNextContactEditor}
                              disabled={savingNextContactClientId === cliente.id}
                              className="h-7 px-2 bg-surface-lighter border-surface-lighter text-gray-200 hover:bg-surface-lighter/80"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (isDemoClient) return
                            handleOpenInlineNextContactEditor(cliente)
                          }}
                          className="flex w-full items-center justify-center rounded-lg px-2 py-1 transition-colors hover:bg-surface-lighter/40"
                          title={tr('Clique para editar dia e horário', 'Click to edit day and time')}
                        >
                          <div className="flex min-h-[42px] w-full flex-col items-center justify-center text-center leading-tight">
                            <div className="flex w-full items-center justify-center">
                              <span className={cn("text-sm font-medium", getNextContactStatus(cliente.nextContactAt).color)}>
                                {formatDateOnly(cliente.nextContactAt)}
                              </span>
                            </div>
                            <span className={cn("text-xs mt-1", getNextContactStatus(cliente.nextContactAt).color)}>
                              {getNextContactStatus(cliente.nextContactAt).label}
                            </span>
                          </div>
                        </button>
                      )}
                    </td>
                    <td
                      ref={index === 0 ? aiActionsRef : undefined}
                      className={cn(
                        'px-4 py-4 align-middle w-[120px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('ai_actions') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-primary hover:bg-primary/10"
                          onClick={() => {
                            if (isDemoClient) return
                            if (!cliente.chatId) return
                            setFollowUpTarget({ chatId: cliente.chatId, name: cliente.name })
                          }}
                          disabled={!cliente.chatId || isDemoClient}
                          title={cliente.chatId ? tr('Follow-up com IA', 'AI follow-up') : tr('Sem chat conectado', 'No connected chat')}
                        >
                          <Sparkles className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                    <td
                      ref={index === 0 ? notesColumnRef : undefined}
                      className={cn(
                        'px-4 py-4 align-middle w-[220px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('notes_column') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        <div className="w-full max-w-[180px] min-w-0">
                          {cliente.observations ? (
                            <>
                              <span className="text-sm text-gray-300 block truncate text-center" title={cliente.observations}>
                                {cliente.observations}
                              </span>
                              {cliente.observations.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openObservationPreview(cliente)}
                                  className="text-[11px] text-primary hover:text-primary/80 mt-0.5"
                                >
                                  {tr('Ver observação completa', 'View full note')}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-gray-500 italic text-sm">{tr('Sem observações', 'Without notes')}</span>
                              <button
                                type="button"
                                onClick={() => openObservationEditor(cliente)}
                                className="text-[11px] text-emerald-400 hover:text-emerald-300 mt-0.5"
                              >
                                {tr('Adicionar observação', 'Add note')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : activeTab === 'sugestoes' ? (
        <div className="space-y-4">
          <div
            ref={suggestionsDemoRef}
            className={cn(
              'rounded-2xl border border-surface-lighter bg-surface-light p-4',
              isGuidedTargetActive('suggestions_demo') &&
                'relative z-[210] ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
            )}
          >
            <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-5">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <div className="font-semibold text-white">
                    {tr('Cliente Demo', 'Demo client')}{' '}
                    <span className="font-normal text-gray-500">(+55 11 97777-6666)</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {tr(
                      'Atualizado: 09/03/2026, 21:04:18 • Motivo: cliente pediu confirmação de proposta.',
                      'Updated: 03/09/2026, 09:04:18 PM • Reason: client asked for proposal confirmation.'
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="bg-surface border-surface-lighter" disabled>
                    {tr('Editar', 'Edit')}
                  </Button>
                  <Button className="bg-primary hover:bg-primary/90 text-black" disabled>
                    {tr('Aprovar', 'Approve')}
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-surface border-surface-lighter text-red-300 hover:bg-red-500/10 hover:border-red-500/30"
                    disabled
                  >
                    {tr('Rejeitar', 'Reject')}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Status', 'Status')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-400">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Antes', 'Before')}:</span>{' '}
                      {tr('lead', 'lead')}
                    </div>
                    <div className="text-primary">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Depois', 'After')}:</span>{' '}
                      {tr('ativo', 'active')}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Próximo contato', 'Next contact')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-400">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Antes', 'Before')}:</span> -
                    </div>
                    <div className="text-primary">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Depois', 'After')}:</span>{' '}
                      10/03/2026 15:30
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Observações', 'Notes')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-400">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Antes', 'Before')}:</span>{' '}
                      {tr('Sem observações', 'No notes')}
                    </div>
                    <div className="text-primary">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Depois', 'After')}:</span>{' '}
                      {tr('Cliente pediu contato após o horário comercial.', 'Client requested contact after business hours.')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <AiFieldSuggestionsPanel
            targetType="client"
            fetchWithAuth={fetchWithAuth}
            buildSessionQuery={buildSessionQuery}
            onApplied={reloadClientes}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div
            ref={logsDemoRef}
            className={cn(
              'rounded-2xl border border-surface-lighter bg-surface-light p-4',
              isGuidedTargetActive('logs_demo') &&
                'relative z-[210] ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
            )}
          >
            <div className="space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-5">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <div className="font-semibold text-white">
                    {tr('Cliente Demo', 'Demo client')}{' '}
                    <span className="font-normal text-gray-500">(+55 11 97777-6666)</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {tr(
                      'Cliente • Atualizado: 09/03/2026, 21:06:02',
                      'Client • Updated: 03/09/2026, 09:06:02 PM'
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2 py-1 text-xs font-bold uppercase text-yellow-300">
                    {tr('editado', 'edited')}
                  </span>
                  <span className="rounded-full border border-surface-lighter px-2 py-1 text-xs text-gray-300">
                    {tr('Manual', 'Manual')}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 text-xs text-gray-400 md:grid-cols-3">
                <div>{tr('Ator: user (uid_demo)', 'Actor: user (uid_demo)')}</div>
                <div>{tr('Modelo: google/gemini-3.0', 'Model: google/gemini-3.0')}</div>
                <div>{tr('Status registro: accepted', 'Record status: accepted')}</div>
              </div>

              <div className="rounded-xl border border-surface-lighter bg-surface p-3 text-sm text-gray-200">
                {tr(
                  'Motivo da IA: cliente sinalizou interesse em manter contrato e pediu nova data para contato.',
                  'AI reason: client signaled interest in maintaining the contract and requested a new contact date.'
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Sugerido pela IA', 'Suggested by AI')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">status:</span> {tr('ativo', 'active')}
                    </div>
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">{tr('próximo_contato', 'next_contact')}:</span>{' '}
                      10/03/2026 15:00
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Aplicado', 'Applied')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">status:</span> {tr('ativo', 'active')}
                    </div>
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">{tr('próximo_contato', 'next_contact')}:</span>{' '}
                      10/03/2026 15:30
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <AiFieldSuggestionsLogsPanel
            targetType="client"
            fetchWithAuth={fetchWithAuth}
            buildSessionQuery={buildSessionQuery}
          />
        </div>
      )}

      {portalReady && guidedOpen
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[200] bg-black/90"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
              />

              <button
                type="button"
                onClick={closeGuidedOnboarding}
                className="fixed right-5 top-20 z-[230] flex h-11 w-11 items-center justify-center rounded-full border border-surface-lighter bg-surface-light text-gray-200 transition hover:bg-surface hover:text-white"
                aria-label={tr('Fechar onboarding', 'Close onboarding')}
              >
                <X className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToPreviousGuidedStep}
                disabled={guidedStep === 0 || guidedCompletionModalOpen}
                className={cn(
                  'fixed left-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  guidedStep === 0 || guidedCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Etapa anterior', 'Previous step')}
              >
                <ChevronDown className="h-5 w-5 rotate-90" />
              </button>

              <button
                type="button"
                onClick={goToNextGuidedStep}
                disabled={guidedStep === lastGuidedStepIndex || guidedCompletionModalOpen}
                className={cn(
                  'fixed right-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  guidedStep === lastGuidedStepIndex || guidedCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Próxima etapa', 'Next step')}
              >
                <ChevronDown className="h-5 w-5 -rotate-90" />
              </button>

              <div className="fixed bottom-5 left-1/2 z-[220] w-[min(720px,calc(100vw-2.5rem))] -translate-x-1/2 rounded-2xl border border-surface-lighter bg-surface-light p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary">
                      {tr('Onboarding guiado', 'Guided onboarding')}
                    </p>
                    <h3 className="text-sm font-bold text-white">{currentGuidedStep.title}</h3>
                  </div>
                  <span className="text-xs font-medium text-gray-300">
                    {tr('Etapa', 'Step')} {guidedStep + 1}/{guidedSteps.length}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-300">{currentGuidedStep.description}</p>
                {displayClientes[0]?.id === GUIDED_DEMO_CLIENT_ID ? (
                  <p className="mt-2 text-xs text-primary">
                    {tr(
                      'Cliente fictício temporário exibido apenas para demonstração do tutorial.',
                      'Temporary fictional client displayed only for tutorial demonstration.'
                    )}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {guidedSteps.map((step, index) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setGuidedStep(index)}
                        disabled={guidedCompletionModalOpen}
                        className={cn(
                          'h-2.5 rounded-full transition-all',
                          index === guidedStep ? 'w-8 bg-primary' : 'w-2.5 bg-gray-600 hover:bg-gray-500'
                        )}
                        aria-label={`${tr('Ir para etapa', 'Go to step')} ${index + 1}`}
                      />
                    ))}
                  </div>

                  {guidedStep === lastGuidedStepIndex ? (
                    <Button
                      type="button"
                      onClick={finishGuidedTutorial}
                      className="bg-primary text-black hover:bg-primary/90"
                    >
                      {tr('Concluir tópico', 'Complete topic')}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {tr('Use as setas na tela ou teclado para avançar.', 'Use on-screen or keyboard arrows to continue.')}
                    </span>
                  )}
                </div>
              </div>

              {guidedCompletionModalOpen ? (
                <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 px-4">
                  <div className="w-full max-w-md rounded-2xl border border-surface-lighter bg-surface-light p-5 shadow-2xl">
                    <h3 className="text-lg font-bold text-white">{tr('Tutorial concluído!', 'Tutorial completed!')}</h3>
                    <p className="mt-2 text-sm text-gray-300">
                      {nextGuidedTutorialKey
                        ? tr(
                            `Deseja ir para o próximo tutorial agora (${nextGuidedTutorialLabel})?`,
                            `Do you want to go to the next tutorial now (${nextGuidedTutorialLabel})?`
                          )
                        : tr(
                            'Você concluiu este fluxo. Deseja fechar o onboarding agora?',
                            'You completed this flow. Do you want to close onboarding now?'
                          )}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 text-gray-200 hover:bg-surface"
                        onClick={closeGuidedOnboarding}
                      >
                        {tr('Fechar', 'Close')}
                      </Button>
                      {nextGuidedTutorialKey ? (
                        <Button
                          type="button"
                          className="bg-primary text-black hover:bg-primary/90"
                          onClick={goToNextGuidedTutorial}
                        >
                          {tr('Ir para próximo tópico', 'Go to next topic')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="bg-primary text-black hover:bg-primary/90"
                          onClick={closeGuidedOnboarding}
                        >
                          {tr('Concluir onboarding', 'Finish onboarding')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}

      {observationPreview && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4"
          onClick={closeObservationPreview}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-surface-lighter bg-surface-light shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-lighter px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">{tr('Observação do cliente', 'Client note')}</h3>
                <p className="text-xs text-gray-400 truncate">{observationPreview.clientName}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-white hover:bg-surface-lighter"
                onClick={closeObservationPreview}
                title={tr('Fechar', 'Close')}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {editingObservationPreview ? (
                <Textarea
                  value={observationPreviewDraft}
                  onChange={(event) => setObservationPreviewDraft(event.target.value)}
                  placeholder={tr('Digite a observação do cliente...', 'Type the client note...')}
                  className="min-h-[180px] text-sm"
                />
              ) : (
                <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap break-words">
                  {observationPreview.text || tr('Sem observações', 'Without notes')}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-surface-lighter px-5 py-3">
              {!editingObservationPreview && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!observationPreview.chatId) return
                  setFollowUpTarget({
                    chatId: observationPreview.chatId,
                    name: observationPreview.clientName
                  })
                  closeObservationPreview()
                }}
                disabled={!observationPreview.chatId || savingObservationPreview}
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {tr('Follow Up com IA', 'AI follow-up')}
              </Button>
              )}
              {editingObservationPreview ? (
                <>
                  <Button
                    onClick={() => void handleSaveObservationPreview()}
                    disabled={savingObservationPreview}
                    className="bg-emerald-500 text-white hover:bg-emerald-500/90"
                  >
                    {savingObservationPreview ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    {tr('Salvar alterações', 'Save changes')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingObservationPreview(false)
                      setObservationPreviewDraft(observationPreview.text)
                    }}
                    disabled={savingObservationPreview}
                    className="border-white/20 text-gray-200 hover:bg-surface-lighter"
                  >
                    <X className="w-4 h-4 mr-2" />
                    {tr('Cancelar edição', 'Cancel edit')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingObservationPreview(true)
                    setObservationPreviewDraft(observationPreview.text)
                  }}
                  className="border-white/20 text-gray-200 hover:bg-surface-lighter"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  {tr('Editar observação', 'Edit note')}
                </Button>
              )}
              {!editingObservationPreview && (
                <Button
                  onClick={closeObservationPreview}
                  disabled={savingObservationPreview}
                  className="bg-primary hover:bg-primary/90"
                >
                  {tr('Pronto', 'Done')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {followUpTarget && (
        <FollowUpModal
          chatId={followUpTarget.chatId}
          sessionId={userId}
          contactName={followUpTarget.name}
          onClose={() => setFollowUpTarget(null)}
          onSuccess={() => {
            void reloadClientes()
          }}
        />
      )}
    </div>
  )
}
