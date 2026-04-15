'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage } from '@/lib/http-error'
import { onAuthStateChanged } from 'firebase/auth'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  MessageCircle, 
  Trash2, 
  UserPlus,
  Clock,
  AlertCircle,
  Loader2,
  ArrowUpDown,
  ChevronDown,
  X,
  Edit2,
  Save,
  UserCheck,
  Sparkles,
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

interface Lead {
  id: string
  name: string | null
  whatsapp: string | null
  chatId: string | null
  aiTag: string | null
  status: 'novo' | 'inativo' | 'aguardando' | 'em_processo' | 'cliente'
  lastContact: number | null
  nextContact: number | null
  observations?: string | null
  createdAt: number | null
  lastMessage?: string | null
  source?: string | null
}

type LeadImportContact = {
  name?: string | null
  whatsapp?: string | null
}

const LEAD_TAG_OPTIONS = ['P. Ativa', 'P. Passiva'] as const
type LeadTagOption = (typeof LEAD_TAG_OPTIONS)[number]
type LeadsTagFilter = 'todos' | LeadTagOption
type GuidedStepTarget =
  | 'tabs'
  | 'top_actions'
  | 'import_panel'
  | 'filters'
  | 'advanced_filters'
  | 'table'
  | 'status_tag'
  | 'next_contact'
  | 'observations'
  | 'actions'
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

type LeadImportSummary = {
  total: number
  created: number
  updated: number
  skipped: number
  invalid: number
}

type LeadsListResponse = {
  leads?: Lead[]
  total?: number
  matchedTotal?: number
  search?: string | null
}

const GUIDED_DEMO_LEAD_ID = '__guided_demo_lead__'

type ColorSelectOption<T extends string> = {
  value: T
  label: string
  toneClass: string
}

const parseLeadImportText = (text: string): { contacts: LeadImportContact[]; invalidLines: number } => {
  const INVISIBLE_CHARS_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

  const normalizeLine = (value: string) => (value || '').replace(INVISIBLE_CHARS_RE, '').trim()

  const hasValidDigits = (value: string) => value.replace(/\D/g, '').length >= 7

  const parseDelimited = (line: string): LeadImportContact | null => {
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

  const parseInlinePhone = (line: string): LeadImportContact | null => {
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
  const contacts: LeadImportContact[] = []
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

const countUsefulLeadSearchChars = (value: string) =>
  value.replace(/[^0-9A-Za-z\u00C0-\u00FF]+/g, '').length

const normalizeLeadStatus = (value: unknown): Lead['status'] => {
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

const normalizeLeadTag = (value: unknown): LeadTagOption => {
  if (value === 'P. Ativa') return 'P. Ativa'
  return 'P. Passiva'
}

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
          </div>
          ,
          document.body
        )}
    </div>
  )
}

type LeadsPageProps = {
  sessionIdOverride?: string | null
  disableGuidedOnboarding?: boolean
}

export default function LeadsPage({
  sessionIdOverride = null,
  disableGuidedOnboarding = false
}: LeadsPageProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'leads'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt, GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en)
    : null
  const statusConfig = useMemo(() => ({
    novo: {
      label: tr('Novo', 'New'),
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
      bgColor: 'bg-blue-500',
      icon: Clock
    },
    inativo: {
      label: tr('Inativo', 'Inactive'),
      color: 'bg-gray-500/20 text-gray-300 border-gray-500/40',
      bgColor: 'bg-gray-500',
      icon: AlertCircle
    },
    aguardando: {
      label: tr('Aguardando', 'Waiting'),
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
      bgColor: 'bg-yellow-500',
      icon: Clock
    },
    em_processo: {
      label: tr('Em processo', 'In progress'),
      color: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      bgColor: 'bg-orange-500',
      icon: MessageCircle
    },
    cliente: {
      label: tr('Cliente', 'Client'),
      color: 'bg-green-500/20 text-green-400 border-green-500/40',
      bgColor: 'bg-green-500',
      icon: UserCheck
    }
  }), [tr])

  const tagOptions = useMemo<Array<ColorSelectOption<LeadTagOption>>>(() => ([
    {
      value: 'P. Ativa',
      label: 'P. Ativa',
      toneClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    },
    {
      value: 'P. Passiva',
      label: 'P. Passiva',
      toneClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
    }
  ]), [])

  const statusOptions = useMemo<Array<ColorSelectOption<Lead['status']>>>(() => ([
    { value: 'novo', label: tr('Novo', 'New'), toneClass: statusConfig.novo.color },
    { value: 'inativo', label: tr('Inativo', 'Inactive'), toneClass: statusConfig.inativo.color },
    { value: 'aguardando', label: tr('Aguardando', 'Waiting'), toneClass: statusConfig.aguardando.color },
    { value: 'em_processo', label: tr('Em processo', 'In progress'), toneClass: statusConfig.em_processo.color },
    { value: 'cliente', label: tr('Cliente', 'Client'), toneClass: statusConfig.cliente.color }
  ]), [statusConfig, tr])

  const statusFilterOptions = useMemo<Array<ColorSelectOption<string>>>(() => ([
    {
      value: 'todos',
      label: tr('Todos os status', 'All statuses'),
      toneClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
    },
    ...statusOptions.map((option) => ({ ...option, value: option.value as string }))
  ]), [statusOptions, tr])

  const tagFilterOptions = useMemo<Array<ColorSelectOption<LeadsTagFilter>>>(() => ([
    {
      value: 'todos',
      label: tr('Todas TAGs', 'All tags'),
      toneClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40'
    },
    {
      value: 'P. Passiva',
      label: 'P. Passiva',
      toneClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
    },
    {
      value: 'P. Ativa',
      label: 'P. Ativa',
      toneClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
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
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [matchedLeadsTotal, setMatchedLeadsTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'lista' | 'sugestoes' | 'logs'>('lista')
  const [searchDraft, setSearchDraft] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [leadsError, setLeadsError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [aiTagFilter, setAiTagFilter] = useState<LeadsTagFilter>('todos')
  const [sortBy, setSortBy] = useState<'lastContact' | 'name' | 'nextContact' | 'status'>('lastContact')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  const [observationsFilter, setObservationsFilter] = useState<string>('todos')
  const [editingLead, setEditingLead] = useState<string | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editWhatsapp, setEditWhatsapp] = useState<string>('')
  const [editNextContact, setEditNextContact] = useState<string>('')
  const [editObservations, setEditObservations] = useState<string>('')
  const [editingNextContactLeadId, setEditingNextContactLeadId] = useState<string | null>(null)
  const [inlineNextContactValue, setInlineNextContactValue] = useState<string>('')
  const [savingNextContactLeadId, setSavingNextContactLeadId] = useState<string | null>(null)
  const [showCreateLead, setShowCreateLead] = useState(false)
  const [showImportLeads, setShowImportLeads] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createWhatsapp, setCreateWhatsapp] = useState('')
  const [createAiTag, setCreateAiTag] = useState<LeadTagOption>('P. Ativa')
  const [createStatus, setCreateStatus] = useState<Lead['status']>('novo')
  const [createNextContact, setCreateNextContact] = useState<string>('')
  const [createObservations, setCreateObservations] = useState<string>('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creatingLead, setCreatingLead] = useState(false)
  const [importInput, setImportInput] = useState('')
  const [importTag, setImportTag] = useState<LeadTagOption>('P. Ativa')
  const [importingLeads, setImportingLeads] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<LeadImportSummary | null>(null)
  const [observationPreview, setObservationPreview] = useState<{
    leadId: string
    leadName: string
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
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const guidedSnapshotRef = useRef<{
    activeTab: 'lista' | 'sugestoes' | 'logs'
    showCreateLead: boolean
    showImportLeads: boolean
    showFilters: boolean
  } | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const topActionsRef = useRef<HTMLDivElement | null>(null)
  const importPanelRef = useRef<HTMLDivElement | null>(null)
  const filtersRef = useRef<HTMLDivElement | null>(null)
  const advancedFiltersRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLDivElement | null>(null)
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const firstLeadRowRef = useRef<HTMLTableRowElement | null>(null)
  const statusTagRef = useRef<HTMLTableCellElement | null>(null)
  const nextContactRef = useRef<HTMLTableCellElement | null>(null)
  const observationsRef = useRef<HTMLTableCellElement | null>(null)
  const actionsRef = useRef<HTMLTableCellElement | null>(null)
  const suggestionsDemoRef = useRef<HTMLDivElement | null>(null)
  const logsDemoRef = useRef<HTMLDivElement | null>(null)
  const guidedSuppressAutoOpenRef = useRef(false)

  const guidedSteps = useMemo<GuidedStep[]>(
    () => [
      {
        id: 'tabs',
        target: 'tabs',
        title: tr('Etapa 1: Navegação da aba Leads', 'Step 1: Leads tab navigation'),
        description: tr(
          'Aqui você alterna entre Lista, Sugestões da IA e Logs para acompanhar o ciclo completo dos leads.',
          'Here you switch between List, AI suggestions, and Logs to track the full lead lifecycle.'
        )
      },
      {
        id: 'top_actions',
        target: 'top_actions',
        title: tr('Etapa 2: Ações rápidas', 'Step 2: Quick actions'),
        description: tr(
          'Use estes botões para criar um lead manualmente ou importar contatos em massa.',
          'Use these buttons to create a lead manually or import contacts in bulk.'
        )
      },
      {
        id: 'import_panel',
        target: 'import_panel',
        title: tr('Etapa 3: Importação em massa', 'Step 3: Bulk import'),
        description: tr(
          'Neste bloco você cola a lista, escolhe a Tag IA e importa vários leads de uma vez.',
          'In this section you paste the list, choose the AI tag, and import many leads at once.'
        )
      },
      {
        id: 'filters',
        target: 'filters',
        title: tr('Etapa 4: Busca e filtros principais', 'Step 4: Search and primary filters'),
        description: tr(
          'Filtre por texto, Tag IA e Status para localizar os contatos certos rápidamente.',
          'Filter by text, AI tag, and status to quickly find the right contacts.'
        )
      },
      {
        id: 'advanced_filters',
        target: 'advanced_filters',
        title: tr('Etapa 5: Filtros avançados', 'Step 5: Advanced filters'),
        description: tr(
          'Refine por período de último contato e presença de observações para operação diária.',
          'Refine by last-contact period and notes presence for daily operation.'
        )
      },
      {
        id: 'table',
        target: 'table',
        title: tr('Etapa 6: Tabela de leads', 'Step 6: Leads table'),
        description: tr(
          'A tabela concentra nome, WhatsApp, tag, status, contatos e ações em um único lugar.',
          'The table centralizes name, WhatsApp, tag, status, contacts, and actions in one place.'
        )
      },
      {
        id: 'status_tag',
        target: 'status_tag',
        title: tr('Etapa 7: Tag IA e Status', 'Step 7: AI tag and status'),
        description: tr(
          'Ajuste Tag IA e Status direto na linha para manter a qualificação do lead atualizada.',
          'Adjust AI tag and status directly in-row to keep lead qualification up to date.'
        )
      },
      {
        id: 'next_contact',
        target: 'next_contact',
        title: tr('Etapa 8: Próximo contato', 'Step 8: Next contact'),
        description: tr(
          'Clique no campo para definir ou editar data e horário do próximo follow-up.',
          'Click the field to define or edit the next follow-up date and time.'
        )
      },
      {
        id: 'observations',
        target: 'observations',
        title: tr('Etapa 9: Observações', 'Step 9: Notes'),
        description: tr(
          'As observações guardam contexto do lead e ajudam a IA e o time humano no atendimento.',
          'Notes preserve lead context and help both AI and human team during support.'
        )
      },
      {
        id: 'actions',
        target: 'actions',
        title: tr('Etapa 10: Ações por lead', 'Step 10: Per-lead actions'),
        description: tr(
          'Aqui você executa follow-up com IA, edição e remoção de cada lead.',
          'Here you run AI follow-up, editing, and deletion for each lead.'
        )
      },
      {
        id: 'suggestions_tab',
        target: 'suggestions_tab',
        title: tr('Etapa 11: Abrir Sugestões IA', 'Step 11: Open AI suggestions'),
        description: tr(
          'Agora vamos para a aba de sugestões para revisar mudanças antes de aplicar no CRM.',
          'Now we move to the suggestions tab to review changes before applying them to the CRM.'
        )
      },
      {
        id: 'suggestions_demo',
        target: 'suggestions_demo',
        title: tr('Etapa 12: Como usar Sugestões IA', 'Step 12: How to use AI suggestions'),
        description: tr(
          'Nesta caixa demo você vê o fluxo recomendado para revisar, editar e aprovar sugestões da IA.',
          'In this demo box you can see the recommended flow to review, edit, and approve AI suggestions.'
        )
      },
      {
        id: 'logs_tab',
        target: 'logs_tab',
        title: tr('Etapa 13: Abrir Logs', 'Step 13: Open logs'),
        description: tr(
          'Agora vamos para a aba de logs para auditar o histórico de alterações.',
          'Now we move to the logs tab to audit the history of changes.'
        )
      },
      {
        id: 'logs_demo',
        target: 'logs_demo',
        title: tr('Etapa 14: Como ler os Logs', 'Step 14: How to read logs'),
        description: tr(
          'Nesta caixa demo você entende como filtrar eventos e rastrear o que foi aplicado.',
          'In this demo box you learn how to filter events and track what was applied.'
        )
      }
    ],
    [tr]
  )
  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

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
    const isLeadsListRequest = requestMethod === 'GET' && /^\/api\/leads(?:\?|$)/.test(path)
    const leadsListSearch =
      isLeadsListRequest
        ? new URLSearchParams(path.split('?')[1] ?? '').get('search')?.trim() ?? ''
        : ''
    const isDefaultLeadsListRequest = isLeadsListRequest && !leadsListSearch
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
      if (isDefaultLeadsListRequest) {
        return ({ leads: [] } as unknown) as T
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

      if (isDefaultLeadsListRequest) {
        const normalized = message.toLowerCase()
        if (
          normalized.includes('proxy_failed') ||
          normalized.includes('fetch failed') ||
          normalized.includes('backend_request_failed') ||
          normalized.includes('backend_unreachable')
        ) {
          return ({ leads: [] } as unknown) as T
        }
      }

      throw new Error(message)
    }

    return (payload ?? {}) as T
  }, [])

  const resolveGuidedTargetElement = useCallback((target: GuidedStepTarget) => {
    if (target === 'tabs') return tabsRef.current
    if (target === 'top_actions') return topActionsRef.current
    if (target === 'import_panel') return importPanelRef.current
    if (target === 'filters') return filtersRef.current
    if (target === 'advanced_filters') return advancedFiltersRef.current
    if (target === 'table') return firstLeadRowRef.current ?? tableHeaderRef.current ?? tableRef.current
    if (target === 'status_tag') return statusTagRef.current
    if (target === 'next_contact') return nextContactRef.current
    if (target === 'observations') return observationsRef.current
    if (target === 'actions') return actionsRef.current
    if (target === 'suggestions_tab') return tabsRef.current
    if (target === 'suggestions_demo') return suggestionsDemoRef.current ?? tabsRef.current
    if (target === 'logs_tab') return tabsRef.current
    return logsDemoRef.current ?? tabsRef.current
  }, [])

  const restoreGuidedSnapshot = useCallback(() => {
    const snapshot = guidedSnapshotRef.current
    if (!snapshot) return
    setActiveTab(snapshot.activeTab)
    setShowCreateLead(snapshot.showCreateLead)
    setShowImportLeads(snapshot.showImportLeads)
    setShowFilters(snapshot.showFilters)
    guidedSnapshotRef.current = null
  }, [])

  const closeGuidedOnboarding = useCallback(() => {
    guidedSuppressAutoOpenRef.current = true
    setGuidedOpen(false)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
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
      (!searchParams.get('guidedTutorial') || currentGuidedTutorialKey === 'leads')

    if (!shouldOpen) {
      guidedSuppressAutoOpenRef.current = false
      return
    }
    if (guidedSuppressAutoOpenRef.current) return
    if (guidedOpen) return

    if (!guidedSnapshotRef.current) {
      guidedSnapshotRef.current = {
        activeTab,
        showCreateLead,
        showImportLeads,
        showFilters
      }
    }

    setActiveTab('lista')
    setShowCreateLead(false)
    setShowImportLeads(false)
    setShowFilters(false)
    setObservationPreview(null)
    setFollowUpTarget(null)
    setEditingLead(null)
    setEditingNextContactLeadId(null)
    setGuidedOpen(true)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
  }, [
    activeTab,
    currentGuidedTutorialKey,
    guidedOpen,
    isGuidedOnboardingEnabled,
    searchParams,
    showCreateLead,
    showFilters,
    showImportLeads
  ])

  useEffect(() => {
    if (!guidedOpen) return

    setShowCreateLead(false)
    setObservationPreview(null)
    setFollowUpTarget(null)
    setEditingLead(null)
    setEditingNextContactLeadId(null)

    if (currentGuidedStep.target === 'suggestions_tab' || currentGuidedStep.target === 'suggestions_demo') {
      setActiveTab('sugestoes')
      setShowImportLeads(false)
      setShowFilters(false)
      return
    }

    if (currentGuidedStep.target === 'logs_tab' || currentGuidedStep.target === 'logs_demo') {
      setActiveTab('logs')
      setShowImportLeads(false)
      setShowFilters(false)
      return
    }

    setActiveTab('lista')

    if (currentGuidedStep.target === 'import_panel') {
      setShowImportLeads(true)
      setShowFilters(false)
    } else if (currentGuidedStep.target === 'advanced_filters') {
      setShowImportLeads(false)
      setShowFilters(true)
    } else {
      setShowImportLeads(false)
      setShowFilters(false)
    }
  }, [currentGuidedStep.target, guidedOpen])

  useEffect(() => {
    if (!guidedOpen) return

    const scrollToTarget = () => {
      const target = resolveGuidedTargetElement(currentGuidedStep.target)
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }

    const timeoutA = window.setTimeout(scrollToTarget, 120)
    const timeoutB = window.setTimeout(scrollToTarget, 320)
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
        if (guidedStep === lastGuidedStepIndex) return
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

  const loadLeads = useCallback(async (options?: { search?: string | null; syncSearchState?: boolean }) => {
    if (!userId) return
    const requestedSearch = typeof options?.search === 'string' ? options.search.trim() : ''
    const hasSearch = requestedSearch.length > 0
    const syncSearchState = options?.syncSearchState ?? false
    setLoading(true)
    setLeadsError(null)
    try {
      const payload = await fetchWithAuth<LeadsListResponse>(
        `/api/leads${buildSessionQuery(hasSearch ? { search: requestedSearch } : {})}`
      )
      const leadsData = Array.isArray(payload.leads) ? payload.leads : []
      const normalizedPayloadSearch =
        typeof payload.search === 'string' ? payload.search.trim() : requestedSearch
      setTotalLeads(
        typeof payload.total === 'number' && Number.isFinite(payload.total)
          ? payload.total
          : leadsData.length
      )
      setMatchedLeadsTotal(
        hasSearch
          ? typeof payload.matchedTotal === 'number' && Number.isFinite(payload.matchedTotal)
            ? payload.matchedTotal
            : leadsData.length
          : null
      )
      setLeads(
        leadsData.map((lead) => ({
          ...lead,
          status: normalizeLeadStatus((lead as any)?.status),
          aiTag: normalizeLeadTag((lead as any)?.aiTag)
        }))
      )
      if (syncSearchState) {
        setAppliedSearch(hasSearch ? normalizedPayloadSearch : '')
        setSearchDraft(hasSearch ? normalizedPayloadSearch : '')
      }
    } catch (error) {
      console.error('Failed to fetch leads:', error)
      const message = error instanceof Error ? error.message : 'unknown_error'
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('lead_search_too_short')) {
        setLeadsError(tr('Digite ao menos 2 caracteres úteis para pesquisar.', 'Enter at least 2 useful characters to search.'))
      } else if (hasSearch && normalizedMessage.includes('lead_search_unavailable_in_fallback')) {
        setLeadsError(
          tr(
            'A busca global está indisponível no momento. Tente novamente em instantes.',
            'Global search is currently unavailable right now. Please try again shortly.'
          )
        )
      } else if (hasSearch) {
        setLeadsError(
          tr(
            'Não foi possível pesquisar na base inteira de leads.',
            'Could not search the full lead database.'
          )
        )
      } else {
        setLeadsError(tr('Não foi possível carregar os leads.', 'Could not load leads.'))
      }
    } finally {
      setLoading(false)
    }
  }, [buildSessionQuery, fetchWithAuth, tr, userId])

  const reloadLeads = useCallback(async () => {
    await loadLeads({ search: appliedSearch, syncSearchState: false })
  }, [appliedSearch, loadLeads])

  // Fetch leads
  useEffect(() => {
    if (!userId) return
    void loadLeads({ search: null, syncSearchState: false })
  }, [userId, loadLeads])

  // Handlers
  const handleUpdateStatus = async (leadId: string, newStatus: Lead['status']) => {
    if (!userId) return

    try {
      if (newStatus === 'cliente') {
        await fetchWithAuth(
          `/api/leads/${encodeURIComponent(leadId)}/convert${buildSessionQuery({})}`,
          { method: 'POST' }
        )
      } else {
        await fetchWithAuth(
          `/api/leads/${encodeURIComponent(leadId)}${buildSessionQuery({})}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
          }
        )
      }

      await reloadLeads()
    } catch (error) {
      console.error('Failed to update lead status:', error)
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    if (!userId || !confirm(tr('Tem certeza que deseja remover este lead?', 'Are you sure you want to remove this lead?'))) return
    try {
      await fetchWithAuth(
        `/api/leads/${encodeURIComponent(leadId)}${buildSessionQuery({})}`,
        { method: 'DELETE' }
      )
      await reloadLeads()
    } catch (error) {
      console.error('Failed to delete lead:', error)
    }
  }

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead.id)
    setEditingNextContactLeadId(null)
    setInlineNextContactValue('')
    setEditName(lead.name ?? '')
    setEditWhatsapp(lead.whatsapp ?? '')
    setEditNextContact(lead.nextContact ? new Date(lead.nextContact).toISOString().slice(0, 16) : '')
    setEditObservations(lead.observations ?? '')
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

  const handleOpenInlineNextContactEditor = (lead: Lead) => {
    setEditingLead(null)
    setEditingNextContactLeadId(lead.id)
    setInlineNextContactValue(toDateTimeLocalInput(lead.nextContact))
  }

  const handleCancelInlineNextContactEditor = () => {
    setEditingNextContactLeadId(null)
    setInlineNextContactValue('')
  }

  const handleSaveInlineNextContact = async (leadId: string) => {
    if (!userId) return
    setSavingNextContactLeadId(leadId)
    try {
      const nextContactAt = inlineNextContactValue ? new Date(inlineNextContactValue).getTime() : null
      await fetchWithAuth(
        `/api/leads/${encodeURIComponent(leadId)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ nextContactAt })
        }
      )

      setLeads((previous) =>
        previous.map((lead) => (lead.id === leadId ? { ...lead, nextContact: nextContactAt } : lead))
      )
      setEditingNextContactLeadId(null)
      setInlineNextContactValue('')
    } catch (error) {
      console.error('Failed to update next contact:', error)
    } finally {
      setSavingNextContactLeadId(null)
    }
  }

  const handleUpdateTag = async (leadId: string, newTag: LeadTagOption) => {
    if (!userId) return
    try {
      await fetchWithAuth(
        `/api/leads/${encodeURIComponent(leadId)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ aiTag: newTag })
        }
      )
      setLeads((previous) =>
        previous.map((lead) => (lead.id === leadId ? { ...lead, aiTag: newTag } : lead))
      )
    } catch (error) {
      console.error('Failed to update lead tag:', error)
    }
  }

  const handleSaveLead = async (leadId: string) => {
    if (!userId) return
    try {
      const name = editName.trim() ? editName.trim() : null
      const whatsapp = editWhatsapp.trim() ? editWhatsapp.trim() : null
      const nextContactAt = editNextContact ? new Date(editNextContact).getTime() : null
      const observations = editObservations.trim() ? editObservations.trim() : null

      await fetchWithAuth(
        `/api/leads/${encodeURIComponent(leadId)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ name, whatsapp, nextContactAt, observations })
        }
      )

      setEditingLead(null)
      setEditName('')
      setEditWhatsapp('')
      setEditNextContact('')
      setEditObservations('')
      await reloadLeads()
    } catch (error) {
      console.error('Failed to update lead:', error)
    }
  }

  const handleCancelEdit = () => {
    setEditingLead(null)
    setEditName('')
    setEditWhatsapp('')
    setEditNextContact('')
    setEditObservations('')
    setEditingNextContactLeadId(null)
    setInlineNextContactValue('')
  }

  const openObservationPreview = (lead: Lead) => {
    const text = lead.observations ?? ''
    setObservationPreview({
      leadId: lead.id,
      leadName: lead.name || tr('Sem nome', 'No name'),
      text,
      chatId: lead.chatId ?? null
    })
    setEditingObservationPreview(false)
    setObservationPreviewDraft(text)
  }

  const openObservationEditor = (lead: Lead) => {
    openObservationPreview(lead)
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
        `/api/leads/${encodeURIComponent(observationPreview.leadId)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ observations: nextObservation })
        }
      )

      setLeads((previous) =>
        previous.map((lead) =>
          lead.id === observationPreview.leadId
            ? { ...lead, observations: nextObservation }
            : lead
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
      console.error('Failed to update lead observation from preview:', error)
    } finally {
      setSavingObservationPreview(false)
    }
  }

  const resetCreateLeadForm = () => {
    setCreateName('')
    setCreateWhatsapp('')
    setCreateAiTag('P. Ativa')
    setCreateStatus('novo')
    setCreateNextContact('')
    setCreateObservations('')
    setCreateError(null)
  }

  const handleCreateLead = async () => {
    if (!userId) return

    const name = createName.trim() ? createName.trim() : null
    const whatsapp = createWhatsapp.trim() ? createWhatsapp.trim() : null
    const aiTag = createAiTag
    const nextContactAt = createNextContact ? new Date(createNextContact).getTime() : null
    const observations = createObservations.trim() ? createObservations.trim() : null

    if (!name && !whatsapp) {
      setCreateError(tr('Informe nome ou WhatsApp.', 'Provide name or WhatsApp.'))
      return
    }
    if (createStatus === 'cliente') {
      setCreateError(tr('Para criar um cliente, use a tela de Clientes.', 'To create a client, use the Clients screen.'))
      return
    }

    setCreatingLead(true)
    setCreateError(null)
    try {
      await fetchWithAuth(
        `/api/leads${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            name,
            whatsapp,
            aiTag,
            status: createStatus,
            nextContactAt,
            observations
          })
        }
      )

      resetCreateLeadForm()
      setShowCreateLead(false)
      await reloadLeads()
    } catch (error) {
      console.error('Failed to create lead:', error)
      setCreateError(tr('Não foi possível criar o lead.', 'Could not create the lead.'))
    } finally {
      setCreatingLead(false)
    }
  }

  const handleImportLeads = async () => {
    if (!userId) return

    const { contacts, invalidLines } = parseLeadImportText(importInput)
    if (contacts.length === 0) {
      setImportError(
        tr(
          'Cole uma lista (1 por linha) ou em pares (nome em cima, WhatsApp embaixo). Formatos aceitos: `whatsapp` ou `nome;whatsapp` ou `nome,whatsapp`.',
          'Paste a list (1 per line) or in pairs (name above, WhatsApp below). Accepted formats: `whatsapp`, `name;whatsapp`, or `name,whatsapp`.'
        )
      )
      return
    }

    setImportingLeads(true)
    setImportError(null)
    setImportSummary(null)
    try {
      const payload = await fetchWithAuth<{ summary?: LeadImportSummary }>(
        `/api/leads/import${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            contacts,
            applyTag: importTag,
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
      await reloadLeads()
    } catch (error) {
      console.error('Failed to import leads:', error)
      setImportError(tr('Não foi possível importar os leads.', 'Could not import leads.'))
    } finally {
      setImportingLeads(false)
    }
  }

  const toggleSort = (field: 'lastContact' | 'name' | 'nextContact' | 'status') => {
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
      setLeadsError(null)
      setAppliedSearch('')
      setMatchedLeadsTotal(null)
      setSearchDraft('')
      await loadLeads({ search: null, syncSearchState: false })
      return
    }

    if (countUsefulLeadSearchChars(nextSearch) < 2) {
      setLeadsError(tr('Digite ao menos 2 caracteres úteis para pesquisar.', 'Enter at least 2 useful characters to search.'))
      return
    }

    setLeadsError(null)
    await loadLeads({ search: nextSearch, syncSearchState: true })
  }, [loadLeads, loading, searchDraft, tr])

  // Filtered and sorted leads
  const filteredLeads = useMemo(() => {
    return leads
      .filter(lead => {
        const matchesStatus = statusFilter === 'todos' || lead.status === statusFilter
        const leadTagValue = normalizeLeadTag(lead.aiTag)
        const matchesAiTag = aiTagFilter === 'todos' || leadTagValue === aiTagFilter
        
        // Filtro de último contato por data manual
        let matchesLastContact = true
        if (lastContactDateFrom || lastContactDateTo) {
          if (lead.lastContact) {
            const leadDate = lead.lastContact
            const fromDate = lastContactDateFrom ? new Date(lastContactDateFrom).getTime() : 0
            const toDate = lastContactDateTo ? new Date(lastContactDateTo + 'T23:59:59').getTime() : Date.now()
            matchesLastContact = leadDate >= fromDate && leadDate <= toDate
          } else {
            matchesLastContact = false
          }
        }
        
        // Filtro de observações
        let matchesObservations = true
        if (observationsFilter === 'com_observacoes') {
          matchesObservations = lead.observations !== null && lead.observations !== undefined && lead.observations.trim() !== ''
        } else if (observationsFilter === 'sem_observacoes') {
          matchesObservations = !lead.observations || lead.observations.trim() === ''
        }
        
        return matchesStatus && matchesAiTag && matchesLastContact && matchesObservations
      })
      .sort((a, b) => {
        let comparison = 0
        if (sortBy === 'lastContact') {
          const timeA = a.lastContact ?? 0
          const timeB = b.lastContact ?? 0
          comparison = timeA - timeB
        } else if (sortBy === 'nextContact') {
          const timeA = a.nextContact ?? 0
          const timeB = b.nextContact ?? 0
          comparison = timeA - timeB
        } else if (sortBy === 'status') {
          const statusRankA = a.status === 'inativo' ? 0 : 1
          const statusRankB = b.status === 'inativo' ? 0 : 1
          comparison = statusRankA - statusRankB
        } else {
          const nameA = a.name ?? ''
          const nameB = b.name ?? ''
          comparison = nameA.localeCompare(nameB)
        }
        return sortOrder === 'desc' ? -comparison : comparison
      })
  }, [leads, statusFilter, aiTagFilter, observationsFilter, lastContactDateFrom, lastContactDateTo, sortBy, sortOrder])

  const guidedDemoLead = useMemo<Lead>(() => {
    const now = Date.now()
    return {
      id: GUIDED_DEMO_LEAD_ID,
      name: tr('Lead de demonstração', 'Demo lead'),
      whatsapp: '+55 11 99999-9999',
      chatId: '5511999999999@s.whatsapp.net',
      aiTag: 'P. Ativa',
      status: 'aguardando',
      lastContact: now - 1000 * 60 * 90,
      nextContact: now + 1000 * 60 * 60 * 18,
      observations: tr(
        'Lead criado temporariamente para demonstração do onboarding. Não é salvo no banco.',
        'Lead created temporarily for onboarding demonstration. It is not stored in the database.'
      ),
      createdAt: now - 1000 * 60 * 60 * 24,
      lastMessage: tr('Quero entender melhor os planos.', 'I want to understand plans better.'),
      source: 'whatsapp'
    }
  }, [tr])

  const displayLeads = useMemo(() => {
    if (guidedOpen && activeTab === 'lista') {
      const withoutDemo = filteredLeads.filter((lead) => lead.id !== GUIDED_DEMO_LEAD_ID)
      return [guidedDemoLead, ...withoutDemo]
    }
    return filteredLeads
  }, [activeTab, filteredLeads, guidedDemoLead, guidedOpen])

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
      return tr('Amanhã', 'Tomorrow')
    }

    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
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
      return { label: tr('Amanhã', 'Tomorrow'), color: 'text-blue-500' }
    } else if (days <= 7) {
      return { label: isEn ? `In ${days} days` : `Em ${days} dias`, color: 'text-green-500' }
    } else {
      return { label: formatDateOnly(timestamp), color: 'text-gray-400' }
    }
  }

  const clearAllFilters = useCallback(() => {
    setStatusFilter('todos')
    setAiTagFilter('todos')
    setObservationsFilter('todos')
    setSearchDraft('')
    setAppliedSearch('')
    setMatchedLeadsTotal(null)
    setLastContactDateFrom('')
    setLastContactDateTo('')
    setLeadsError(null)
    void loadLeads({ search: null, syncSearchState: false })
  }, [loadLeads])

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (statusFilter !== 'todos') count++
    if (aiTagFilter !== 'todos') count++
    if (observationsFilter !== 'todos') count++
    if (appliedSearch) count++
    if (lastContactDateFrom || lastContactDateTo) count++
    return count
  }, [statusFilter, aiTagFilter, observationsFilter, appliedSearch, lastContactDateFrom, lastContactDateTo])

  const searchResultsTotal =
    appliedSearch && typeof matchedLeadsTotal === 'number' && Number.isFinite(matchedLeadsTotal)
      ? matchedLeadsTotal
      : appliedSearch
        ? leads.length
        : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            {tr('Gestão de leads', 'Lead management')}
          </h1>
          <p className="text-gray-400 text-sm">
            {tr('Acompanhe e gerencie as pessoas que entraram em contato.', 'Track and manage people who contacted you.')}
          </p>
        </div>
        
        <div
          ref={topActionsRef}
          className={cn(
            'flex items-center gap-2',
            isGuidedTargetActive('top_actions') &&
              'relative z-[210] rounded-2xl ring-2 ring-inset ring-primary/70 bg-primary/10 p-1 pointer-events-none'
          )}
        >
          <Button
            onClick={() => {
              setShowCreateLead((prev) => !prev)
              setCreateError(null)
            }}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {tr('Novo lead', 'New lead')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowImportLeads((prev) => !prev)
              setImportError(null)
              setImportSummary(null)
            }}
          >
            <FileUp className="w-4 h-4 mr-2" />
            {tr('Importar em massa', 'Bulk import')}
          </Button>
          <div className="bg-surface-light border border-surface-lighter px-4 py-2 rounded-xl">
            <span className="text-xs text-gray-400 block uppercase font-bold">{tr('Total de leads', 'Total leads')}</span>
            <span className="text-xl font-bold text-white">{totalLeads}</span>
          </div>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 text-yellow-200 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 mt-0.5 text-yellow-300" />
        <div className="text-sm">
          <p className="font-semibold text-white">{tr('Atenção', 'Attention')}</p>
          <p className="text-yellow-200/90">
            {tr(
              'Enviar mensagens para pessoas que bloquearem você ou denunciarem spam pode fazer seu número ser bloqueado/restrito no WhatsApp.',
              'Sending messages to people who blocked you or reported spam may cause your number to be restricted on WhatsApp.'
            )}
          </p>
        </div>
      </div>

      <div
        ref={tabsRef}
        className={cn(
          'flex w-fit items-center gap-2 rounded-2xl border border-surface-lighter bg-surface-light p-2',
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
          {showCreateLead && (
            <div className="bg-surface-light border border-surface-lighter p-4 rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white">{tr('Criar lead manual', 'Create lead manually')}</h2>
                  <p className="text-gray-400 text-xs">{tr('Informe nome e/ou WhatsApp.', 'Provide name and/or WhatsApp.')}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCreateLead(false)
                    resetCreateLeadForm()
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    {tr('Status', 'Status')}
                  </label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as Lead['status'])}
                    className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
                  >
                    <option value="novo">{tr('Novo', 'New')}</option>
                    <option value="inativo">{tr('Inativo', 'Inactive')}</option>
                    <option value="aguardando">{tr('Aguardando', 'Waiting')}</option>
                    <option value="em_processo">{tr('Em processo', 'In progress')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    {tr('Tag IA', 'AI tag')}
                  </label>
                  <select
                    value={createAiTag}
                    onChange={(e) => setCreateAiTag(normalizeLeadTag(e.target.value))}
                    className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block p-2.5"
                  >
                    {LEAD_TAG_OPTIONS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {tr(
                      'P. Ativa = Prospecção Ativa (nós iniciamos). P. Passiva = Prospecção Passiva (lead inicia).',
                      'P. Ativa = Active prospecting (we start). P. Passiva = Passive prospecting (lead starts).'
                    )}
                  </p>
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
                  placeholder={tr('Anotações sobre esse lead...', 'Notes about this lead...')}
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
                  onClick={() => void handleCreateLead()}
                  disabled={creatingLead}
                >
                  {creatingLead && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {tr('Criar', 'Create')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateLead(false)
                    resetCreateLeadForm()
                  }}
                  disabled={creatingLead}
                >
                  {tr('Cancelar', 'Cancel')}
                </Button>
              </div>
            </div>
          )}
          {showImportLeads && (
            <div
              ref={importPanelRef}
              className={cn(
                'space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4',
                isGuidedTargetActive('import_panel') &&
                  'relative z-[210] ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
              )}
            >
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
                    setShowImportLeads(false)
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
                    {tr('Tag para IA', 'AI tag')}
                  </label>
                  <select
                    value={importTag}
                    onChange={(e) => setImportTag(normalizeLeadTag(e.target.value))}
                    className="w-full h-10 bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg focus:ring-primary focus:border-primary block px-3"
                  >
                    {LEAD_TAG_OPTIONS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 rounded-xl border border-surface-lighter bg-surface/60 p-3 md:p-4">
                  <p className="text-sm font-semibold text-gray-200">
                    {tr('Como escolher a tag corretamente', 'How to choose the right tag')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">
                    {tr('Use P. Ativa quando sua equipe iniciou o contato (prospecção ativa). Nesse cenário, a IA tende a conduzir a conversa para gerar interesse, quebrar objeções e avançar para resposta do lead.', 'Use P. Ativa when your team started the conversation (active prospecting). In this scenario, the AI should guide the chat to create interest, handle objections, and move the lead toward a reply.')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">
                    {tr('Use P. Passiva quando o lead iniciou o contato por conta própria. Nesse caso, a IA pode responder de forma mais direta, aproveitando a intenção já existente para qualificar e encaminhar o atendimento.', 'Use P. Passiva when the lead started the conversation on their own. In this case, the AI can respond more directly, leveraging existing intent to qualify and move the interaction forward.')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-primary">
                    {tr('Importante: nesta importação, leads já existentes com o mesmo WhatsApp sempre serão atualizados automaticamente.', 'Important: in this import flow, existing leads with the same WhatsApp are always updated automatically.')}
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
                  onClick={() => void handleImportLeads()}
                  disabled={importingLeads}
                >
                  {importingLeads && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <FileUp className="w-4 h-4 mr-2" />
                  {tr('Importar', 'Import')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportLeads(false)
                    setImportError(null)
                    setImportSummary(null)
                  }}
                  disabled={importingLeads}
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
              'space-y-4 rounded-2xl border border-surface-lighter bg-surface-light p-4',
              isGuidedTargetActive('filters') &&
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
                  if (leadsError) {
                    setLeadsError(null)
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
                value={aiTagFilter}
                options={tagFilterOptions}
                onChange={setAiTagFilter}
                ariaLabel={tr('Filtrar por tag IA', 'Filter by AI tag')}
                widthClassName="w-full sm:w-[190px]"
              />
            </div>

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

        {leadsError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {leadsError}
          </div>
        )}

        {activeTab === 'lista' && appliedSearch && searchResultsTotal !== null && (
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-gray-200">
            <div>
              {tr(
                `Exibindo ${filteredLeads.length} de ${searchResultsTotal} resultados para "${appliedSearch}".`,
                `Showing ${filteredLeads.length} of ${searchResultsTotal} results for "${appliedSearch}".`
              )}
            </div>
            {searchResultsTotal > 50 && (
              <div className="mt-1 text-xs text-primary-100">
                {tr('A v1 mostra apenas os primeiros 50.', 'Version 1 only shows the first 50.')}
              </div>
            )}
          </div>
        )}

        {/* Painel de Filtros Avançados */}
        {showFilters && (
          <div
            ref={advancedFiltersRef}
            className={cn(
              'space-y-4 border-t border-surface-lighter pt-4',
              isGuidedTargetActive('advanced_filters') &&
                'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 p-3 pointer-events-none'
            )}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <p className="text-xs text-gray-500">
                  {tr(
                    'Escolha se quer ver todos os leads, apenas com observações ou sem observações.',
                    'Choose whether to see all leads, only with notes, or without notes.'
                  )}
                </p>
              </div>

              <div className="rounded-xl border border-surface-lighter bg-surface/40 p-4 space-y-3">
                <label className="block text-xs font-bold text-gray-400 uppercase">
                  {tr('Último contato - período', 'Last contact - period')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tr('De', 'From')}:</label>
                    <input
                      type="date"
                      value={lastContactDateFrom}
                      onChange={(e) => setLastContactDateFrom(e.target.value)}
                      className="h-10 w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-3 focus:ring-primary focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{tr('Até', 'To')}:</label>
                    <input
                      type="date"
                      value={lastContactDateTo}
                      onChange={(e) => setLastContactDateTo(e.target.value)}
                      className="h-10 w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-3 focus:ring-primary focus:border-primary"
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
            </div>
          </div>
        )}
      </div>

      {/* Lista de Leads */}
      <div
        ref={tableRef}
        className="overflow-hidden rounded-2xl border border-surface-lighter bg-surface-light shadow-xl"
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
                <th className="px-3 py-4 w-[170px] text-xs font-bold text-gray-400 tracking-wider align-middle text-left">
                  <span className="block w-full text-left">Lead</span>
                </th>
                <th className="px-3 py-4 w-[220px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">WhatsApp</th>
                <th className="px-4 py-4 w-[200px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">
                  <span className="block w-full text-center">{tr('Tag IA', 'AI tag')}</span>
                </th>
                <th className="px-4 py-4 w-[180px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center">
                  <span className="block w-full text-center">{tr('Status', 'Status')}</span>
                </th>
                <th className="px-4 py-4 w-[200px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">
                  <button onClick={() => toggleSort('lastContact')} className="flex w-full items-center justify-center gap-1 hover:text-white transition-colors whitespace-nowrap">
                    <span>{tr('Último contato', 'Last contact')}</span>
                    <ArrowUpDown
                      className={cn(
                        "w-3 h-3",
                        sortBy === 'lastContact' ? "text-white" : "text-gray-500"
                      )}
                    />
                  </button>
                </th>
                <th className="px-4 py-4 w-[200px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">
                  <button onClick={() => toggleSort('nextContact')} className="flex w-full items-center justify-center gap-1 hover:text-white transition-colors whitespace-nowrap">
                    <span>{tr('Próximo contato', 'Next contact')}</span>
                    <ArrowUpDown
                      className={cn(
                        "w-3 h-3",
                        sortBy === 'nextContact' ? "text-white" : "text-gray-500"
                      )}
                    />
                  </button>
                </th>
                <th className="px-4 py-4 w-[210px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">{tr('Observações', 'Notes')}</th>
                <th className="px-4 py-4 w-[150px] text-xs font-bold text-gray-400 tracking-wider align-middle text-center whitespace-nowrap">{tr('Ações', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-lighter/30">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                    <p className="mt-2 text-gray-400">{tr('Carregando leads...', 'Loading leads...')}</p>
                  </td>
                </tr>
              ) : displayLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {tr('Nenhum lead encontrado com os filtros atuais.', 'No lead found with current filters.')}
                  </td>
                </tr>
              ) : (
                displayLeads.map((lead, index) => {
                  const isDemoLead = lead.id === GUIDED_DEMO_LEAD_ID
                  return (
                  <tr
                    ref={index === 0 ? firstLeadRowRef : undefined}
                    key={lead.id}
                    className={cn(
                      'group transition-colors hover:bg-surface-lighter/20',
                      index === 0 &&
                        isGuidedTargetActive('table') &&
                        'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                    )}
                  >
                    <td className="px-3 py-4 align-top w-[170px] text-left">
                      <div className="min-w-0 max-w-[145px]">
                        {editingLead === lead.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={tr('Nome do lead', 'Lead name')}
                            className="h-9 px-3 py-1.5 bg-surface border-surface-lighter text-left"
                          />
                        ) : (
                          <p
                            className="font-semibold text-white truncate"
                            title={lead.name ?? tr('Sem nome', 'No name')}
                          >
                            {lead.name || tr('Sem nome', 'No name')}
                          </p>
                        )}
                        {isDemoLead ? (
                          <span className="mt-1 inline-flex rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {tr('Demo onboarding', 'Onboarding demo')}
                          </span>
                        ) : null}
                        <p className="text-xs text-gray-500 truncate">{lead.lastMessage || tr('Sem mensagens', 'No messages')}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4 align-middle w-[220px] text-center">
                      {editingLead === lead.id ? (
                        <div className="flex items-center justify-center gap-2">
                          <Input
                            value={editWhatsapp}
                            onChange={(e) => setEditWhatsapp(e.target.value)}
                            placeholder="WhatsApp"
                            className="h-9 px-3 py-1.5 bg-surface border-surface-lighter"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-gray-300 relative min-w-0">
                          {lead.whatsapp ? (
                            <span className="font-mono text-sm truncate max-w-[200px]">{lead.whatsapp}</span>
                          ) : lead.chatId ? (
                            <>
                              <span className="peer text-xs text-gray-500 italic cursor-help">
                                {tr('Número oculto', 'Hidden number')}
                              </span>

                              <div className="absolute left-0 top-full mt-2 px-3 py-2 bg-surface-lighter text-white text-xs font-medium rounded-lg opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 z-50 shadow-xl border border-white/10 pointer-events-none max-w-[340px]">
                                <div className="text-[11px] leading-snug text-gray-200">
                                  <div className="font-semibold text-gray-100 mb-1">chatId</div>
                                  <div className="font-mono text-gray-300 break-all">
                                    {lead.chatId ?? tr('indisponível', 'unavailable')}
                                  </div>
                                  {lead.chatId?.toLowerCase().endsWith('@lid') && (
                                    <div className="mt-2 text-gray-400">
                                      {tr(
                                        'Contato pode estar com número oculto pelo WhatsApp (LID).',
                                        'Contact may have a hidden number in WhatsApp (LID).'
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="absolute left-4 -top-2 border-8 border-transparent border-b-surface-lighter" />
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-gray-500 italic">
                              {tr('Sem WhatsApp', 'No WhatsApp')}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-4 align-middle w-[200px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('status_tag') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        {(() => {
                          const currentTag = normalizeLeadTag(lead.aiTag)
                          return (
                            <ColorDropdown
                              value={currentTag}
                              options={tagOptions}
                              onChange={(value) => {
                                if (isDemoLead) return
                                void handleUpdateTag(lead.id, value)
                              }}
                              ariaLabel={tr('Selecionar tag IA', 'Select AI tag')}
                            />
                          )
                        })()}
                      </div>
                    </td>
                    <td
                      ref={index === 0 ? statusTagRef : undefined}
                      className={cn(
                        'px-4 py-4 align-middle w-[180px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('status_tag') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        <ColorDropdown
                          value={lead.status}
                          options={statusOptions}
                          onChange={(value) => {
                            if (isDemoLead) return
                            void handleUpdateStatus(lead.id, value)
                          }}
                          ariaLabel={tr('Selecionar status', 'Select status')}
                        />
                      </div>
                    </td>
                    <td
                      ref={index === 0 ? nextContactRef : undefined}
                      className={cn(
                        'px-4 py-4 align-middle w-[200px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('next_contact') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex flex-col items-center">
                        <div className="flex items-center justify-center">
                          <span className="text-sm text-gray-300">{formatDate(lead.lastContact)}</span>
                        </div>
                        {lead.source && (
                          <span className="text-[10px] text-gray-500 uppercase mt-1 text-center">{lead.source}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle w-[200px] text-center">
                      {editingLead === lead.id ? (
                        <div className="space-y-2">
                          <input
                            type="datetime-local"
                            value={editNextContact}
                            onChange={(e) => setEditNextContact(e.target.value)}
                            className="w-full bg-surface border border-surface-lighter text-gray-300 text-sm rounded-lg px-2 py-1 focus:ring-primary focus:border-primary"
                          />
                        </div>
                      ) : editingNextContactLeadId === lead.id ? (
                        <div className="space-y-2">
                          <input
                            type="datetime-local"
                            value={inlineNextContactValue}
                            onChange={(e) => setInlineNextContactValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void handleSaveInlineNextContact(lead.id)
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
                              onClick={() => void handleSaveInlineNextContact(lead.id)}
                              disabled={savingNextContactLeadId === lead.id}
                              className="h-7 px-2 bg-primary hover:bg-primary/90"
                            >
                              {savingNextContactLeadId === lead.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelInlineNextContactEditor}
                              disabled={savingNextContactLeadId === lead.id}
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
                            if (isDemoLead) return
                            handleOpenInlineNextContactEditor(lead)
                          }}
                          className="flex w-full items-start justify-center rounded-lg px-2 py-1 transition-colors hover:bg-surface-lighter/40"
                          title={tr('Clique para editar dia e horário', 'Click to edit day and time')}
                        >
                          <div className="flex flex-col flex-1 items-center">
                            <div className="flex items-center justify-center">
                              <span className={cn("text-sm font-medium", getNextContactStatus(lead.nextContact).color)}>
                                {formatDateOnly(lead.nextContact)}
                              </span>
                            </div>
                            <span className={cn("text-xs mt-1", getNextContactStatus(lead.nextContact).color)}>
                              {getNextContactStatus(lead.nextContact).label}
                            </span>
                          </div>
                        </button>
                      )}
                    </td>
                    <td
                      ref={index === 0 ? observationsRef : undefined}
                      className={cn(
                        'px-4 py-4 align-top w-[210px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('observations') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      {editingLead === lead.id ? (
                        <Textarea
                          value={editObservations}
                          onChange={(e) => setEditObservations(e.target.value)}
                          placeholder={tr('Adicione observações sobre este lead...', 'Add notes about this lead...')}
                          className="min-h-[60px] text-sm"
                        />
                      ) : (
                        <div className="flex items-start justify-center">
                          <div className="flex-1 min-w-0 max-w-[170px]">
                            {lead.observations ? (
                              <>
                                <span className="text-sm text-gray-300 block truncate text-center" title={lead.observations}>
                                  {lead.observations}
                                </span>
                                {lead.observations.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openObservationPreview(lead)}
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
                                  onClick={() => openObservationEditor(lead)}
                                  className="text-[11px] text-emerald-400 hover:text-emerald-300 mt-0.5"
                                >
                                  {tr('Adicionar observação', 'Add note')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td
                      ref={index === 0 ? actionsRef : undefined}
                      className={cn(
                        'px-4 py-4 align-top w-[150px] text-center',
                        index === 0 &&
                          isGuidedTargetActive('actions') &&
                          'relative z-[210] rounded-xl ring-2 ring-inset ring-primary/70 bg-primary/10 pointer-events-none'
                      )}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-gray-400 hover:text-primary hover:bg-primary/10"
                          onClick={() => {
                            if (!lead.chatId || isDemoLead) return
                            setFollowUpTarget({ chatId: lead.chatId, name: lead.name })
                          }}
                          disabled={!lead.chatId || isDemoLead}
                          title={lead.chatId ? tr('Follow-up com IA', 'AI follow-up') : tr('Sem chat conectado', 'No connected chat')}
                        >
                          <Sparkles className="w-4 h-4" />
                        </Button>

                        {editingLead === lead.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => void handleSaveLead(lead.id)}
                              className="bg-primary hover:bg-primary/90"
                            >
                              <Save className="w-3 h-3 mr-1" />
                              {tr('Salvar', 'Save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="bg-surface-lighter border-none"
                            >
                              <X className="w-3 h-3 mr-1" />
                              {tr('Cancelar', 'Cancel')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-400 hover:text-primary hover:bg-primary/10"
                              onClick={() => {
                                if (isDemoLead) return
                                handleEditLead(lead)
                              }}
                              title={tr('Editar', 'Edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => {
                                if (isDemoLead) return
                                handleDeleteLead(lead.id)
                              }}
                              title={tr('Excluir', 'Delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })
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
                    {tr('Lead Demo', 'Demo lead')}{' '}
                    <span className="font-normal text-gray-500">(+55 11 98888-7777)</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {tr(
                      'Atualizado: 09/03/2026, 20:55:36 • Motivo: lead sem resposta após primeiro contato.',
                      'Updated: 03/09/2026, 08:55:36 PM • Reason: lead without response after first contact.'
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
                      {tr('novo', 'new')}
                    </div>
                    <div className="text-primary">
                      <span className="text-[11px] uppercase text-gray-500">{tr('Depois', 'After')}:</span>{' '}
                      {tr('aguardando', 'waiting')}
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
                      10/03/2026 10:00
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
                      {tr('Lead pediu retorno no período da manhã.', 'Lead requested a follow-up in the morning period.')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <AiFieldSuggestionsPanel
            targetType="lead"
            fetchWithAuth={fetchWithAuth}
            buildSessionQuery={buildSessionQuery}
            onApplied={reloadLeads}
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
                    {tr('Lead Demo', 'Demo lead')}{' '}
                    <span className="font-normal text-gray-500">(+55 11 98888-7777)</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {tr('Lead • Atualizado: 09/03/2026, 20:57:12', 'Lead • Updated: 03/09/2026, 08:57:12 PM')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-green-500/30 bg-green-500/15 px-2 py-1 text-xs font-bold uppercase text-green-300">
                    {tr('aprovado', 'approved')}
                  </span>
                  <span className="rounded-full border border-surface-lighter px-2 py-1 text-xs text-gray-300">
                    {tr('Manual', 'Manual')}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 text-xs text-gray-400 md:grid-cols-3">
                <div>{tr('Ator: admin (uid_demo)', 'Actor: admin (uid_demo)')}</div>
                <div>{tr('Modelo: google/gemini-3.0', 'Model: google/gemini-3.0')}</div>
                <div>{tr('Status registro: accepted', 'Record status: accepted')}</div>
              </div>

              <div className="rounded-xl border border-surface-lighter bg-surface p-3 text-sm text-gray-200">
                {tr(
                  'Motivo da IA: lead demonstrou interesse e pediu retorno para fechar proposta.',
                  'AI reason: lead showed interest and requested a follow-up to close the proposal.'
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Sugerido pela IA', 'Suggested by AI')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">status:</span> {tr('aguardando', 'waiting')}
                    </div>
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">{tr('próximo_contato', 'next_contact')}:</span>{' '}
                      10/03/2026 10:00
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-surface-lighter bg-surface p-4">
                  <div className="text-xs font-bold uppercase text-gray-400">{tr('Aplicado', 'Applied')}</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">status:</span> {tr('aguardando', 'waiting')}
                    </div>
                    <div className="text-gray-200">
                      <span className="text-xs uppercase text-gray-500">{tr('próximo_contato', 'next_contact')}:</span>{' '}
                      10/03/2026 10:00
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <AiFieldSuggestionsLogsPanel
            targetType="lead"
            fetchWithAuth={fetchWithAuth}
            buildSessionQuery={buildSessionQuery}
          />
        </div>
      )}

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
                <h3 className="text-sm font-semibold text-white">{tr('Observação do lead', 'Lead note')}</h3>
                <p className="text-xs text-gray-400 truncate">{observationPreview.leadName}</p>
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
                  placeholder={tr('Digite a observação do lead...', 'Type the lead note...')}
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
                    name: observationPreview.leadName
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
            void reloadLeads()
          }}
        />
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
                {displayLeads[0]?.id === GUIDED_DEMO_LEAD_ID ? (
                  <p className="mt-2 text-xs text-primary">
                    {tr(
                      'Lead fictício temporário exibido apenas para demonstração do tutorial.',
                      'Temporary fictional lead displayed only for tutorial demonstration.'
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
                        className="border-surface-lighter bg-surface text-gray-200"
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
                          {tr('Ir para próximo', 'Go to next')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="bg-primary text-black hover:bg-primary/90"
                          onClick={closeGuidedOnboarding}
                        >
                          {tr('Finalizar', 'Finish')}
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
    </div>
  )
}
