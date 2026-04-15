'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/providers/auth-provider'
import { storage } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { useI18n } from '@/lib/i18n/client'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey,
} from '@/lib/onboarding/guided-tutorials'
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  FileText,
  Info,
  Loader2,
  Megaphone,
  PauseCircle,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type BroadcastList = {
  id: string
  sessionId: string
  name: string
  contactsCount: number
  createdAt: number | null
  updatedAt: number | null
}

type BroadcastContact = {
  id: string
  sessionId: string
  listId: string
  name: string | null
  whatsapp: string
  createdAt: number | null
  updatedAt: number | null
}

type BroadcastJobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'

type BroadcastJob = {
  id: string
  sessionId: string
  listId: string
  status: BroadcastJobStatus
  pauseReason: string | null
  payload: any
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: number | null
  updatedAt: number | null
  startedAt: number | null
  completedAt: number | null
  nextSendAt: number | null
}

const MAX_FILE_SIZE_BYTES = 16 * 1024 * 1024
const CONTACTS_HARD_LIMIT_PER_JOB = 3000
const GUIDED_DEMO_LIST_ID = '__guided_demo_broadcast_list__'
const GUIDED_DEMO_CONTACT_ID = '__guided_demo_broadcast_contact__'
const GUIDED_DEMO_JOB_ID = '__guided_demo_broadcast_job__'

type GuidedStepTarget =
  | 'lists'
  | 'contacts'
  | 'add_import'
  | 'contacts_list'
  | 'message'
  | 'file'
  | 'toggle'
  | 'send_button'
  | 'history'

type GuidedStep = {
  id: string
  target: GuidedStepTarget
  title: string
  description: string
}

function formatDateTime(ms: number | null, locale: 'pt-BR' | 'en') {
  if (!ms) return '—'
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms))
  } catch {
    return '—'
  }
}

function formatEstimate(count: number) {
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  const seconds = safe * 2
  if (seconds <= 0) return '—'
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `~${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return `~${hours}h ${rem.toString().padStart(2, '0')}m`
}

function mediaTypeFromFile(file: File): 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage' {
  const mime = (file.type || '').toLowerCase().trim()
  const name = (file.name || '').toLowerCase().trim()
  if (mime.startsWith('image/')) return 'imageMessage'
  if (mime.startsWith('video/')) return 'videoMessage'
  if (mime.startsWith('audio/')) return 'audioMessage'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'documentMessage'
  return 'documentMessage'
}

function sanitizeFilename(name: string) {
  const raw = (name || '').trim()
  if (!raw) return 'arquivo'
  return raw.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
}

type ParsedBulkContact = { name?: string | null; whatsapp: string }

function parseBulkContacts(text: string): { contacts: ParsedBulkContact[]; invalidLines: number } {
  const INVISIBLE_CHARS_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

  const normalizeLine = (value: string) => (value || '').replace(INVISIBLE_CHARS_RE, '').trim()

  const hasValidDigits = (value: string) => value.replace(/\D/g, '').length >= 7

  const parseDelimited = (line: string): ParsedBulkContact | null => {
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

  const parseInlinePhone = (line: string): ParsedBulkContact | null => {
    if (!hasValidDigits(line)) return null

    // If the line is only a number, treat it as whatsapp-only.
    const hasLetters = /[A-Za-zÀ-ÿ]/.test(line)
    if (!hasLetters) {
      return { whatsapp: line }
    }

    // Try to extract a phone-like substring (handles "Nome +55 11 99999-9999").
    const matches = Array.from(line.matchAll(/(\+?\d[\d\s().-]{5,}\d)/g)).map((match) => match[1] ?? '').filter(Boolean)
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

  const contacts: ParsedBulkContact[] = []
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
        // A name line without any phone before a complete contact line.
        invalidLines += 1
        pendingName = null
      }
      contacts.push(delimited)
      continue
    }

    const inline = parseInlinePhone(line)
    if (inline) {
      if (!inline.name && pendingName) {
        contacts.push({ whatsapp: inline.whatsapp, name: pendingName })
        pendingName = null
        continue
      }

      if (pendingName) {
        // A name line that didn't get a phone in the next non-note line.
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
      // Another non-phone, non-note line means the previous name is dangling.
      invalidLines += 1
    }
    pendingName = line
  }

  // If we ended with a dangling name (no phone after it), count as invalid line.
  if (pendingName) {
    invalidLines += 1
  }

  // Count as invalid any "whatsapp-only" rows that were too short (defensive; should be rare).
  const filtered = contacts.filter((contact) => {
    if (!contact.whatsapp || !hasValidDigits(contact.whatsapp)) {
      invalidLines += 1
      return false
    }
    return true
  })

  return { contacts: filtered, invalidLines }
}

function statusLabel(status: BroadcastJobStatus, tr: (pt: string, en: string) => string) {
  if (status === 'running') return tr('Rodando', 'Running')
  if (status === 'paused') return tr('Pausado', 'Paused')
  if (status === 'completed') return tr('Concluído', 'Completed')
  if (status === 'cancelled') return tr('Cancelado', 'Canceled')
  return tr('Falhou', 'Failed')
}

function statusBadgeClass(status: BroadcastJobStatus) {
  if (status === 'running') return 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  if (status === 'paused') return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
  if (status === 'completed') return 'bg-green-500/15 text-green-300 border-green-500/30'
  if (status === 'cancelled') return 'bg-gray-500/15 text-gray-300 border-gray-500/30'
  return 'bg-red-500/15 text-red-300 border-red-500/30'
}

interface TransmissaoPanelProps {
  sessionId: string | null
  detailsHrefBuilder?: (broadcastId: string) => string
}

export function TransmissaoPanel({ sessionId, detailsHrefBuilder }: TransmissaoPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const safeSessionId = sessionId?.trim() || null
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'broadcasts'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt, GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en)
    : null

  const [lists, setLists] = useState<BroadcastList[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [listsError, setListsError] = useState<string | null>(null)
  const [selectedListId, setSelectedListId] = useState<string>('')

  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const [contacts, setContacts] = useState<BroadcastContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [contactsVisible, setContactsVisible] = useState(200)

  const [contactName, setContactName] = useState('')
  const [contactWhatsapp, setContactWhatsapp] = useState('')
  const [addingContact, setAddingContact] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ inserted: number; updated: number; invalidLines: number } | null>(null)

  const [messageText, setMessageText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [removeContactIfLastMessageUndelivered, setRemoveContactIfLastMessageUndelivered] = useState(true)

  const [jobs, setJobs] = useState<BroadcastJob[]>([])
  const [jobsInitialLoading, setJobsInitialLoading] = useState(false)
  const [jobsRefreshing, setJobsRefreshing] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const jobsRefreshInFlightRef = useRef(false)
  const guidedSuppressAutoOpenRef = useRef(false)
  const guidedSnapshotRef = useRef<{
    selectedListId: string
    contactSearch: string
    contactsVisible: number
  } | null>(null)

  const listsRef = useRef<HTMLDivElement | null>(null)
  const contactsRef = useRef<HTMLDivElement | null>(null)
  const addImportRef = useRef<HTMLDivElement | null>(null)
  const contactsListRef = useRef<HTMLDivElement | null>(null)
  const messageRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<HTMLLabelElement | null>(null)
  const sendButtonRef = useRef<HTMLButtonElement | null>(null)
  const historyRef = useRef<HTMLDivElement | null>(null)

  const buildSessionQuery = useCallback(
    (entries: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams()
      if (safeSessionId) {
        params.set('sessionId', safeSessionId)
      }
      Object.entries(entries).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.set(key, String(value))
        }
      })
      const query = params.toString()
      return query ? `?${query}` : ''
    },
    [safeSessionId]
  )

  const fetchWithAuth = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!user) {
        throw new Error('auth_unavailable')
      }

      const token = await user.getIdToken()
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
    },
    [user]
  )

  const buildDetailsHref = useCallback(
    (broadcastId: string) => {
      if (detailsHrefBuilder) {
        return detailsHrefBuilder(broadcastId)
      }
      return `/dashboard/transmissao/${encodeURIComponent(broadcastId)}`
    },
    [detailsHrefBuilder]
  )

  const guidedSteps = useMemo<GuidedStep[]>(
    () => [
      {
        id: 'lists',
        target: 'lists',
        title: tr('Etapa 1: Listas de transmissão', 'Step 1: Broadcast lists'),
        description: tr(
          'Comece criando as listas. Cada lista organiza um público para envio em massa.',
          'Start by creating lists. Each list organizes an audience for bulk sends.'
        )
      },
      {
        id: 'contacts',
        target: 'contacts',
        title: tr('Etapa 2: Área de contatos', 'Step 2: Contacts area'),
        description: tr(
          'Aqui você seleciona a lista e visualiza os contatos que receberão a transmissão.',
          'Here you select a list and view the contacts that will receive the broadcast.'
        )
      },
      {
        id: 'add_import',
        target: 'add_import',
        title: tr('Etapa 3: Adição individual e importação em massa', 'Step 3: Individual add and bulk import'),
        description: tr(
          'Você pode adicionar um contato por vez ou importar muitos de uma só vez colando a lista.',
          'You can add one contact at a time or import many at once by pasting a list.'
        )
      },
      {
        id: 'contacts_list',
        target: 'contacts_list',
        title: tr('Etapa 4: Lista de contatos', 'Step 4: Contacts list'),
        description: tr(
          'Os contatos aparecem nesta seção. No onboarding, mostramos um contato demo temporário.',
          'Contacts appear in this section. In onboarding, we show a temporary demo contact.'
        )
      },
      {
        id: 'message',
        target: 'message',
        title: tr('Etapa 5: Mensagem de transmissão', 'Step 5: Broadcast message'),
        description: tr(
          'Digite o texto principal que será enviado para todos os contatos da lista.',
          'Type the main message text that will be sent to all contacts in the list.'
        )
      },
      {
        id: 'file',
        target: 'file',
        title: tr('Etapa 6: Envio de arquivo', 'Step 6: File attachment'),
        description: tr(
          'Opcionalmente, anexe imagem, vídeo, áudio ou documento para enviar junto com a mensagem.',
          'Optionally attach an image, video, audio, or document to send with the message.'
        )
      },
      {
        id: 'toggle',
        target: 'toggle',
        title: tr('Etapa 7: Toggle de proteção', 'Step 7: Safety toggle'),
        description: tr(
          'Este toggle remove contatos da lista quando a última mensagem não foi recebida, evitando insistência indevida.',
          'This toggle removes contacts from the list when the last message was not delivered, preventing over-messaging.'
        )
      },
      {
        id: 'send_button',
        target: 'send_button',
        title: tr('Etapa 8: Iniciar transmissão', 'Step 8: Start broadcast'),
        description: tr(
          'Depois de revisar mensagem e arquivo, clique aqui para iniciar o envio da transmissão.',
          'After reviewing message and file, click here to start sending the broadcast.'
        )
      },
      {
        id: 'history',
        target: 'history',
        title: tr('Etapa 9: Histórico de transmissões', 'Step 9: Broadcast history'),
        description: tr(
          'Acompanhe status, progresso e resultados das transmissões. O tutorial também mostra um histórico demo.',
          'Track statuses, progress, and results of broadcasts. The tutorial also shows a demo history item.'
        )
      }
    ],
    [tr]
  )
  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

  useEffect(() => {
    setPortalReady(true)
  }, [])

  const resolveGuidedTargetElement = useCallback((target: GuidedStepTarget) => {
    if (target === 'lists') return listsRef.current
    if (target === 'contacts') return contactsRef.current
    if (target === 'add_import') return addImportRef.current
    if (target === 'contacts_list') return contactsListRef.current
    if (target === 'message') return messageRef.current
    if (target === 'file') return fileRef.current
    if (target === 'toggle') return toggleRef.current
    if (target === 'send_button') return sendButtonRef.current
    return historyRef.current
  }, [])

  const isGuidedTargetActive = useCallback(
    (target: GuidedStepTarget) => guidedOpen && currentGuidedStep?.target === target,
    [currentGuidedStep?.target, guidedOpen]
  )

  const closeGuidedOnboarding = useCallback(() => {
    guidedSuppressAutoOpenRef.current = true
    const snapshot = guidedSnapshotRef.current
    if (snapshot) {
      setSelectedListId(snapshot.selectedListId)
      setContactSearch(snapshot.contactSearch)
      setContactsVisible(snapshot.contactsVisible)
    }
    guidedSnapshotRef.current = null
    setGuidedOpen(false)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)

    const query = new URLSearchParams(searchParams.toString())
    if (query.has('guidedOnboarding')) query.delete('guidedOnboarding')
    if (query.has('guidedTutorial')) query.delete('guidedTutorial')
    const queryString = query.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname)
  }, [pathname, router, searchParams])

  const goToPreviousGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.max(0, current - 1))
  }, [])

  const goToNextGuidedStep = useCallback(() => {
    setGuidedStep((current) => Math.min(lastGuidedStepIndex, current + 1))
  }, [lastGuidedStepIndex])

  const finishGuidedTutorial = useCallback(() => {
    if (user?.uid) {
      markGuidedTutorialCompleted(user.uid, currentGuidedTutorialKey)
    }
    setGuidedCompletionModalOpen(true)
  }, [currentGuidedTutorialKey, user?.uid])

  const goToNextGuidedTutorial = useCallback(() => {
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
          guidedTutorial: nextGuidedTutorialKey,
        },
      })
    )
  }, [closeGuidedOnboarding, nextGuidedTutorialKey, router, toRoute])

  useEffect(() => {
    const shouldOpen =
      searchParams.get('guidedOnboarding') === '1' &&
      (!searchParams.get('guidedTutorial') || currentGuidedTutorialKey === 'broadcasts')
    if (!shouldOpen) {
      guidedSuppressAutoOpenRef.current = false
      return
    }

    if (guidedSuppressAutoOpenRef.current || guidedOpen) {
      return
    }

    if (!guidedSnapshotRef.current) {
      guidedSnapshotRef.current = {
        selectedListId,
        contactSearch,
        contactsVisible,
      }
    }

    setSelectedListId(GUIDED_DEMO_LIST_ID)
    setContactSearch('')
    setContactsVisible(200)
    setGuidedOpen(true)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
  }, [contactSearch, contactsVisible, currentGuidedTutorialKey, guidedOpen, searchParams, selectedListId])

  useEffect(() => {
    if (!guidedOpen) return
    if (selectedListId === GUIDED_DEMO_LIST_ID) return
    setSelectedListId(GUIDED_DEMO_LIST_ID)
  }, [guidedOpen, selectedListId])

  useEffect(() => {
    if (!guidedOpen) return
    const activeElement = resolveGuidedTargetElement(currentGuidedStep.target)
    if (!activeElement) return

    const scrollToTarget = () => {
      const target = resolveGuidedTargetElement(currentGuidedStep.target)
      if (!target) return
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    }

    const timeoutA = window.setTimeout(scrollToTarget, 90)
    const timeoutB = window.setTimeout(scrollToTarget, 220)
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
    lastGuidedStepIndex,
  ])

  useEffect(() => {
    setLists([])
    setSelectedListId('')
    setContacts([])
    setJobs([])
    setListsError(null)
    setContactsError(null)
    setJobsError(null)
    setSendError(null)
    setUploadProgress(null)
    setSelectedFile(null)
    setBulkResult(null)
  }, [safeSessionId])

  const guidedDemoList = useMemo<BroadcastList>(
    () => ({
      id: GUIDED_DEMO_LIST_ID,
      sessionId: safeSessionId ?? 'demo-session',
      name: tr('Lista demo onboarding', 'Onboarding demo list'),
      contactsCount: 1,
      createdAt: Date.now() - 30 * 60 * 1000,
      updatedAt: Date.now() - 2 * 60 * 1000,
    }),
    [safeSessionId, tr]
  )

  const displayLists = useMemo(() => {
    if (!guidedOpen) return lists
    const withoutDemo = lists.filter((list) => list.id !== GUIDED_DEMO_LIST_ID)
    return [guidedDemoList, ...withoutDemo]
  }, [guidedDemoList, guidedOpen, lists])

  const selectedList = useMemo(
    () => displayLists.find((list) => list.id === selectedListId) ?? null,
    [displayLists, selectedListId]
  )
  const isDemoListSelected = guidedOpen && selectedListId === GUIDED_DEMO_LIST_ID

  const guidedDemoContact = useMemo<BroadcastContact>(
    () => ({
      id: GUIDED_DEMO_CONTACT_ID,
      sessionId: safeSessionId ?? 'demo-session',
      listId: GUIDED_DEMO_LIST_ID,
      name: tr('Contato demo', 'Demo contact'),
      whatsapp: '+55 11 98888-7777',
      createdAt: Date.now() - 20 * 60 * 1000,
      updatedAt: Date.now() - 2 * 60 * 1000,
    }),
    [safeSessionId, tr]
  )

  const displayContacts = useMemo(() => {
    if (guidedOpen && selectedListId === GUIDED_DEMO_LIST_ID) {
      return [guidedDemoContact]
    }
    return contacts
  }, [contacts, guidedDemoContact, guidedOpen, selectedListId])

  const guidedDemoJob = useMemo<BroadcastJob>(
    () => ({
      id: GUIDED_DEMO_JOB_ID,
      sessionId: safeSessionId ?? 'demo-session',
      listId: GUIDED_DEMO_LIST_ID,
      status: 'completed',
      pauseReason: null,
      payload: null,
      totalCount: 1,
      sentCount: 1,
      failedCount: 0,
      createdAt: Date.now() - 10 * 60 * 1000,
      updatedAt: Date.now() - 5 * 60 * 1000,
      startedAt: Date.now() - 9 * 60 * 1000,
      completedAt: Date.now() - 5 * 60 * 1000,
      nextSendAt: null,
    }),
    [safeSessionId]
  )

  const displayJobs = useMemo(() => {
    if (!guidedOpen) return jobs
    const withoutDemo = jobs.filter((job) => job.id !== GUIDED_DEMO_JOB_ID)
    return [guidedDemoJob, ...withoutDemo]
  }, [guidedDemoJob, guidedOpen, jobs])

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase()
    if (!term) {
      return displayContacts
    }
    return displayContacts.filter((contact) => {
      const name = (contact.name ?? '').toLowerCase()
      const whatsapp = (contact.whatsapp ?? '').toLowerCase()
      return name.includes(term) || whatsapp.includes(term)
    })
  }, [contactSearch, displayContacts])

  const visibleContacts = useMemo(
    () => filteredContacts.slice(0, Math.max(10, contactsVisible)),
    [contactsVisible, filteredContacts]
  )

  const loadLists = useCallback(async () => {
    if (!user || !safeSessionId) return

    setListsLoading(true)
    setListsError(null)
    try {
      const payload = await fetchWithAuth<{ lists?: BroadcastList[] }>(`/api/broadcast-lists${buildSessionQuery({})}`)
      const next = Array.isArray(payload.lists) ? payload.lists : []
      setLists(next)
      setSelectedListId((current) => {
        if (guidedOpen && current === GUIDED_DEMO_LIST_ID) {
          return current
        }
        const keep = next.some((list) => list.id === current)
        if (keep) return current
        return next[0]?.id ?? ''
      })
    } catch (error) {
      setListsError((error as Error).message)
    } finally {
      setListsLoading(false)
    }
  }, [buildSessionQuery, fetchWithAuth, guidedOpen, safeSessionId, user])

  const loadContacts = useCallback(
    async (listId: string) => {
      if (!user || !safeSessionId) return

      const safeId = (listId || '').trim()
      if (!safeId) {
        setContacts([])
        return
      }

      setContactsLoading(true)
      setContactsError(null)
      try {
        const payload = await fetchWithAuth<{ contacts?: BroadcastContact[] }>(
          `/api/broadcast-lists/${encodeURIComponent(safeId)}/contacts${buildSessionQuery({ limit: 5000 })}`
        )
        setContacts(Array.isArray(payload.contacts) ? payload.contacts : [])
        setContactsVisible(200)
      } catch (error) {
        setContactsError((error as Error).message)
      } finally {
        setContactsLoading(false)
      }
    },
    [buildSessionQuery, fetchWithAuth, safeSessionId, user]
  )

  const loadJobs = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (!user || !safeSessionId) return

    const isInitial = mode === 'initial'
    if (isInitial) {
      setJobsInitialLoading(true)
    } else {
      if (jobsRefreshInFlightRef.current) {
        return
      }
      jobsRefreshInFlightRef.current = true
      setJobsRefreshing(true)
    }
    try {
      const payload = await fetchWithAuth<{ jobs?: BroadcastJob[] }>(`/api/broadcasts${buildSessionQuery({ limit: 25 })}`)
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : [])
      setJobsError(null)
    } catch (error) {
      setJobsError((error as Error).message)
      if (isInitial) {
        setJobs([])
      }
    } finally {
      if (isInitial) {
        setJobsInitialLoading(false)
      } else {
        jobsRefreshInFlightRef.current = false
        setJobsRefreshing(false)
      }
    }
  }, [buildSessionQuery, fetchWithAuth, safeSessionId, user])

  useEffect(() => {
    if (!user || !safeSessionId) return
    void loadLists()
    void loadJobs('initial')
  }, [loadJobs, loadLists, safeSessionId, user])

  useEffect(() => {
    if (!user || !safeSessionId || !selectedListId || selectedListId === GUIDED_DEMO_LIST_ID) {
      setContacts([])
      return
    }
    void loadContacts(selectedListId)
  }, [loadContacts, safeSessionId, selectedListId, user])

  useEffect(() => {
    if (!user || !safeSessionId) return
    const hasRunning = jobs.some((job) => job.status === 'running')
    if (!hasRunning) return
    const timer = setInterval(() => {
      void loadJobs('refresh')
    }, 2000)
    return () => clearInterval(timer)
  }, [jobs, loadJobs, safeSessionId, user])

  const handleCreateList = async () => {
    if (!user || !safeSessionId) return

    const name = newListName.trim()
    if (!name) return

    setCreatingList(true)
    setListsError(null)
    try {
      const payload = await fetchWithAuth<{ list?: BroadcastList }>(`/api/broadcast-lists${buildSessionQuery({})}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ name })
      })
      const created = payload.list
      setNewListName('')
      await loadLists()
      if (created?.id) {
        setSelectedListId(created.id)
      }
    } catch (error) {
      setListsError((error as Error).message)
    } finally {
      setCreatingList(false)
    }
  }

  const handleRenameList = async (listId: string, currentName: string) => {
    if (!user || !safeSessionId) return
    if (listId === GUIDED_DEMO_LIST_ID) return

    const nextName = window.prompt(tr('Novo nome da lista:', 'New list name:'), currentName)?.trim() ?? ''
    if (!nextName || nextName === currentName.trim()) {
      return
    }

    setListsError(null)
    try {
      await fetchWithAuth(`/api/broadcast-lists/${encodeURIComponent(listId)}${buildSessionQuery({})}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ name: nextName })
      })
      await loadLists()
    } catch (error) {
      setListsError((error as Error).message)
    }
  }

  const handleDeleteList = async (listId: string) => {
    if (!user || !safeSessionId) return
    if (listId === GUIDED_DEMO_LIST_ID) return
    const list = lists.find((entry) => entry.id === listId)
    const label = list?.name ?? tr('esta lista', 'this list')
    const ok = window.confirm(
      isEn
        ? `Delete ${label}? This removes all contacts from the list.`
        : `Excluir ${label}? Isso remove todos os contatos da lista.`
    )
    if (!ok) return

    setListsError(null)
    try {
      await fetchWithAuth(`/api/broadcast-lists/${encodeURIComponent(listId)}${buildSessionQuery({})}`, {
        method: 'DELETE'
      })
      await loadLists()
      if (selectedListId === listId) {
        setSelectedListId('')
        setContacts([])
      }
    } catch (error) {
      setListsError((error as Error).message)
    }
  }

  const handleEditContact = async (contact: BroadcastContact) => {
    if (!user || !safeSessionId) return
    if (contact.id === GUIDED_DEMO_CONTACT_ID) return

    const currentName = contact.name ?? ''
    const nextNamePrompt = window.prompt(tr('Nome (opcional):', 'Name (optional):'), currentName)
    if (nextNamePrompt === null) {
      return
    }

    const nextWhatsappPrompt = window.prompt('WhatsApp:', contact.whatsapp)
    if (nextWhatsappPrompt === null) {
      return
    }

    const nextName = nextNamePrompt.trim()
    const nextWhatsapp = nextWhatsappPrompt.trim()

    const payload: { name?: string | null; whatsapp?: string } = {}
    if (nextName !== currentName.trim()) {
      payload.name = nextName ? nextName : null
    }
    if (nextWhatsapp && nextWhatsapp !== contact.whatsapp) {
      payload.whatsapp = nextWhatsapp
    }

    if (Object.keys(payload).length === 0) {
      return
    }

    setContactsError(null)
    try {
      await fetchWithAuth(
        `/api/broadcast-lists/${encodeURIComponent(contact.listId)}/contacts/${encodeURIComponent(contact.id)}${buildSessionQuery({})}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      )
      await loadContacts(contact.listId)
    } catch (error) {
      setContactsError((error as Error).message)
    }
  }

  const handleDeleteContact = async (contact: BroadcastContact) => {
    if (!user || !safeSessionId) return
    if (contact.id === GUIDED_DEMO_CONTACT_ID) return

    const label = contact.name || contact.whatsapp
    const ok = window.confirm(isEn ? `Remove ${label} from list?` : `Remover ${label} da lista?`)
    if (!ok) {
      return
    }

    setContactsError(null)
    try {
      await fetchWithAuth(
        `/api/broadcast-lists/${encodeURIComponent(contact.listId)}/contacts/${encodeURIComponent(contact.id)}${buildSessionQuery({})}`,
        { method: 'DELETE' }
      )
      await loadContacts(contact.listId)
      await loadLists()
    } catch (error) {
      setContactsError((error as Error).message)
    }
  }

  const handleAddContact = async () => {
    if (!user || !safeSessionId || !selectedListId) return
    if (selectedListId === GUIDED_DEMO_LIST_ID) return

    const whatsapp = contactWhatsapp.trim()
    if (!whatsapp) return

    setAddingContact(true)
    setContactsError(null)
    try {
      await fetchWithAuth(`/api/broadcast-lists/${encodeURIComponent(selectedListId)}/contacts${buildSessionQuery({})}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: contactName.trim() || null,
          whatsapp
        })
      })
      setContactName('')
      setContactWhatsapp('')
      await loadContacts(selectedListId)
      await loadLists()
    } catch (error) {
      setContactsError((error as Error).message)
    } finally {
      setAddingContact(false)
    }
  }

  const handleBulkImport = async () => {
    if (!user || !safeSessionId || !selectedListId) return
    if (selectedListId === GUIDED_DEMO_LIST_ID) return

    const { contacts: parsed, invalidLines } = parseBulkContacts(bulkText)
    if (parsed.length === 0) {
      setBulkResult({ inserted: 0, updated: 0, invalidLines })
      return
    }

    setBulkImporting(true)
    setContactsError(null)
    setBulkResult(null)
    try {
      const payload = await fetchWithAuth<{ inserted?: number; updated?: number }>(
        `/api/broadcast-lists/${encodeURIComponent(selectedListId)}/contacts/bulk${buildSessionQuery({})}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            contacts: parsed.map((contact) => ({
              ...(contact.name ? { name: contact.name } : {}),
              whatsapp: contact.whatsapp
            }))
          })
        }
      )

      setBulkResult({
        inserted: Number(payload.inserted ?? 0),
        updated: Number(payload.updated ?? 0),
        invalidLines
      })
      await loadContacts(selectedListId)
      await loadLists()
    } catch (error) {
      setContactsError((error as Error).message)
    } finally {
      setBulkImporting(false)
    }
  }

  const canSend = useMemo(() => {
    if (!selectedList) return false
    if (selectedList.id === GUIDED_DEMO_LIST_ID) return false
    if (selectedList.contactsCount <= 0) return false
    if (selectedList.contactsCount > CONTACTS_HARD_LIMIT_PER_JOB) return false
    const hasText = Boolean(messageText.trim())
    const hasFile = Boolean(selectedFile)
    return hasText || hasFile
  }, [messageText, selectedFile, selectedList])

  const handleSendBroadcast = async () => {
    if (!user || !safeSessionId || !selectedList) return
    if (selectedList.id === GUIDED_DEMO_LIST_ID) return

    setSendError(null)
    if (!canSend) return

    if (selectedFile && selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setSendError(
        tr(
          `Arquivo muito grande (max ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB).`,
          `File is too large (max ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB).`
        )
      )
      return
    }

    setSending(true)
    setUploadProgress(null)
    try {
      let media: undefined | { url: string; mediaType: string; mimeType?: string; fileName?: string; caption?: string }

      if (selectedFile) {
        if (!storage) {
          throw new Error('storage_unavailable')
        }
        const filename = sanitizeFilename(selectedFile.name)
        const path = `users/${safeSessionId}/transmissoes/${Date.now()}-${filename}`
        const uploadRef = storageRef(storage, path)
        const task = uploadBytesResumable(uploadRef, selectedFile)

        const url = await new Promise<string>((resolve, reject) => {
          task.on(
            'state_changed',
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              setUploadProgress(progress)
            },
            (error) => reject(error),
            async () => {
              try {
                const downloadUrl = await getDownloadURL(task.snapshot.ref)
                resolve(downloadUrl)
              } catch (error) {
                reject(error)
              }
            }
          )
        })

        const mediaType = mediaTypeFromFile(selectedFile)
        const mimeType = selectedFile.type || undefined
        const caption = messageText.trim() || undefined

        media = {
          url,
          mediaType,
          ...(mimeType ? { mimeType } : {}),
          ...(selectedFile.name ? { fileName: selectedFile.name } : {}),
          ...(caption ? { caption } : {})
        }
      }

      const payload = await fetchWithAuth<{ job?: BroadcastJob }>(`/api/broadcasts${buildSessionQuery({})}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          listId: selectedList.id,
          removeContactIfLastMessageUndelivered,
          ...(messageText.trim() ? { text: messageText.trim() } : {}),
          ...(media ? { media } : {})
        })
      })

      const job = payload.job
      setMessageText('')
      setSelectedFile(null)
      setUploadProgress(null)
      await loadJobs('refresh')
      if (job?.id) {
        router.push(buildDetailsHref(job.id))
      }
    } catch (error) {
      setSendError((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Megaphone className="w-5 h-5" />
            </span>
            <span className="inline-flex items-center gap-2">
              {tr('Transmissão', 'Broadcasts')}
              <span className="relative inline-flex group">
                <button
                  type="button"
                  aria-label={tr('Informações sobre custo da transmissão', 'Broadcast cost info')}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-surface-lighter text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-72 rounded-xl border border-white/10 bg-surface-lighter px-3 py-2 text-xs font-medium text-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-20 shadow-xl pointer-events-none">
                  {tr(
                    'R$ 0,01 a cada 10 mensagens enviadas via transmissão (cobrança em blocos completos de 10).',
                    'R$ 0.01 per 10 messages sent via broadcast (charged in full blocks of 10).'
                  )}
                </span>
              </span>
            </span>
          </h1>
          <p className="text-gray-400 mt-1">
            {tr(
              'Envie mensagens em massa (1 a 1, com intervalo aleatorio), sem prejudicar a IA.',
              'Send bulk messages (1-by-1, with random interval) without hurting AI flows.'
            )}
          </p>
        </div>

        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-3 flex items-start gap-3">
          <PauseCircle className="w-5 h-5 text-yellow-300 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-semibold text-white">{tr('Prioridade para IA', 'AI priority')}</p>
            <p className="text-gray-400">
              {tr(
                'Durante conversas, a transmissão reduz o ritmo para a IA responder primeiro.',
                'During active chats, broadcasts slow down so AI can reply first.'
              )}
            </p>
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
              'Sending messages to people who block or report spam can get your number blocked/restricted on WhatsApp.'
            )}
          </p>
        </div>
      </div>

      {(listsError || contactsError || sendError) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">{tr('Erro', 'Error')}</p>
            <p className="text-red-200/90 break-words">{listsError || contactsError || sendError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 space-y-6">
          {/* Listas */}
          <div
            ref={listsRef}
            className={cn(
              'relative bg-surface-light border border-surface-lighter rounded-2xl p-4 transition-all',
              isGuidedTargetActive('lists') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-white font-bold">{tr('Listas', 'Lists')}</h2>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder={tr('Nome da lista', 'List name')}
                  className="h-10"
                />
                <Button
                  onClick={handleCreateList}
                  disabled={guidedOpen || creatingList || !newListName.trim()}
                  className="h-10 px-4 shrink-0"
                  title={tr('Criar lista', 'Create list')}
                >
                  {creatingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {listsLoading ? (
                <div className="py-6 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  <p className="mt-2 text-sm">{tr('Carregando listas...', 'Loading lists...')}</p>
                </div>
              ) : displayLists.length === 0 ? (
                <div className="py-6 text-center text-gray-500 text-sm">
                  {tr('Crie sua primeira lista para começar.', 'Create your first list to get started.')}
                </div>
              ) : (
                displayLists.map((list) => {
                  const active = list.id === selectedListId
                  const isDemoList = list.id === GUIDED_DEMO_LIST_ID
                  return (
                    <div
                      key={list.id}
                      className={cn(
                        'border rounded-2xl p-3 transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-surface-lighter bg-surface hover:bg-surface-lighter/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedListId(list.id)}
                          className="text-left flex-1 min-w-0"
                        >
                          <p className="font-semibold text-white truncate">{list.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {list.contactsCount} {tr('contatos', 'contacts')} · {tr('Atualizado', 'Updated')} {formatDateTime(list.updatedAt, locale)}
                          </p>
                          {list.contactsCount > CONTACTS_HARD_LIMIT_PER_JOB && (
                            <p className="text-xs text-yellow-300 mt-1">
                              {tr('Limite de', 'Limit of')} {CONTACTS_HARD_LIMIT_PER_JOB} {tr('por transmissão.', 'per broadcast.')}
                            </p>
                          )}
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleRenameList(list.id, list.name)}
                            title={tr('Renomear', 'Rename')}
                            disabled={guidedOpen || isDemoList}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDeleteList(list.id)}
                            title={tr('Excluir', 'Delete')}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            disabled={guidedOpen || isDemoList}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <ChevronRight className={cn('w-4 h-4 text-gray-500', active && 'text-primary')} />
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Contatos */}
          <div
            ref={contactsRef}
            className={cn(
              'relative bg-surface-light border border-surface-lighter rounded-2xl p-4 transition-all',
              isGuidedTargetActive('contacts') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-white font-bold">{tr('Contatos', 'Contacts')}</h2>
                <p className="text-gray-400 text-sm">
                  {selectedList
                    ? `${tr('Lista', 'List')}: ${selectedList.name}`
                    : tr('Selecione uma lista para ver os contatos.', 'Select a list to view contacts.')}
                </p>
              </div>
              <div className="w-full md:w-64">
                <Input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder={tr('Buscar nome ou WhatsApp', 'Search name or WhatsApp')}
                  className="h-10"
                  disabled={!selectedListId}
                />
              </div>
            </div>

            <div
              ref={addImportRef}
              className={cn(
                'relative mt-4 transition-all',
                isGuidedTargetActive('add_import') && 'z-[210] rounded-2xl border border-primary/80 p-2 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
              )}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={tr('Nome (opcional)', 'Name (optional)')}
                className="h-10"
                disabled={!selectedListId || isDemoListSelected}
              />
              <div className="flex items-center gap-2">
                <Input
                  value={contactWhatsapp}
                  onChange={(e) => setContactWhatsapp(e.target.value)}
                  placeholder="WhatsApp (ex: +55 11 99999-9999)"
                  className="h-10"
                  disabled={!selectedListId || isDemoListSelected}
                />
                <Button
                  onClick={handleAddContact}
                  disabled={addingContact || !selectedListId || !contactWhatsapp.trim() || isDemoListSelected}
                  className="h-10 px-4 shrink-0"
                  title={tr('Adicionar contato', 'Add contact')}
                >
                  {addingContact ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              </div>

              <div className="mt-4">
              <label className="text-sm font-semibold text-white">{tr('Importar em massa', 'Bulk import')}</label>
              <p className="text-xs text-gray-400 mt-1">
                {tr(
                  'Cole uma lista (1 por linha) ou em pares (nome em cima, WhatsApp embaixo). Formatos aceitos: `whatsapp` ou `nome;whatsapp` ou `nome,whatsapp`.',
                  'Paste a list (1 per line) or in pairs (name above, WhatsApp below). Accepted formats: `whatsapp`, `name;whatsapp`, or `name,whatsapp`.'
                )}
              </p>
              <Textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  selectedListId
                    ? 'Ex:\nTania Santiago\n+55 21 96418-3539\nMaria;+55 11 99999-9999\n+55 11 98888-7777'
                    : tr('Selecione uma lista primeiro.', 'Select a list first.')
                }
                className="mt-2 min-h-[110px]"
                disabled={!selectedListId || isDemoListSelected}
              />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-gray-400">
                  {bulkResult ? (
                    <span>
                      <span className="text-white font-semibold">{bulkResult.inserted}</span> {tr('inseridos', 'inserted')} ·{' '}
                      <span className="text-white font-semibold">{bulkResult.updated}</span> {tr('atualizados', 'updated')} ·{' '}
                      <span className="text-white font-semibold">{bulkResult.invalidLines}</span> {tr('linhas inválidas', 'invalid lines')}
                    </span>
                  ) : (
                    <span>{tr('Até 5000 linhas por importação.', 'Up to 5000 lines per import.')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBulkText('')
                      setBulkResult(null)
                    }}
                    disabled={!bulkText.trim() && !bulkResult}
                  >
                    {tr('Limpar', 'Clear')}
                  </Button>
                  <Button
                    onClick={handleBulkImport}
                    disabled={bulkImporting || !selectedListId || !bulkText.trim() || isDemoListSelected}
                    size="sm"
                  >
                    {bulkImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <UploadCloud className="w-4 h-4 mr-2" />
                    )}
                    {tr('Importar', 'Import')}
                  </Button>
                </div>
              </div>
            </div>
            </div>

            <div
              ref={contactsListRef}
              className={cn(
                'relative mt-4 border-t border-surface-lighter pt-4 transition-all',
                isGuidedTargetActive('contacts_list') && 'z-[210] rounded-2xl border border-primary/80 p-3 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
              )}
            >
              {contactsLoading ? (
                <div className="py-6 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  <p className="mt-2 text-sm">{tr('Carregando contatos...', 'Loading contacts...')}</p>
                </div>
              ) : !selectedListId ? (
                <div className="py-6 text-center text-gray-500 text-sm">{tr('Selecione uma lista.', 'Select a list.')}</div>
              ) : filteredContacts.length === 0 ? (
                <div className="py-6 text-center text-gray-500 text-sm">{tr('Nenhum contato na lista.', 'No contacts in this list.')}</div>
              ) : (
                <>
                  <div className="text-xs text-gray-400 mb-2">
                    {tr('Mostrando', 'Showing')} <span className="text-white font-semibold">{visibleContacts.length}</span> {tr('de', 'of')}{' '}
                    <span className="text-white font-semibold">{filteredContacts.length}</span>
                  </div>
                  <div className="space-y-2">
                    {visibleContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="border border-surface-lighter rounded-2xl p-3 bg-surface flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-white font-semibold truncate">{contact.name || tr('Sem nome', 'No name')}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{contact.whatsapp}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleEditContact(contact)}
                            title={tr('Editar', 'Edit')}
                            disabled={guidedOpen || contact.id === GUIDED_DEMO_CONTACT_ID}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleDeleteContact(contact)}
                            title={tr('Remover', 'Remove')}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            disabled={guidedOpen || contact.id === GUIDED_DEMO_CONTACT_ID}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {visibleContacts.length < filteredContacts.length && (
                    <div className="mt-3 flex justify-center">
                      <Button variant="ghost" onClick={() => setContactsVisible((v) => v + 200)}>
                        {tr('Carregar mais', 'Load more')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="xl:col-span-7 space-y-6">
          {/* Enviar */}
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-white font-bold">{tr('Enviar transmissão', 'Send broadcast')}</h2>
              {selectedList && (
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {tr('Estimativa', 'Estimate')}:{' '}
                  <span className="text-white font-semibold">{formatEstimate(selectedList.contactsCount)}</span>
                </div>
              )}
            </div>

            <div
              ref={messageRef}
              className={cn(
                'relative mt-4 transition-all',
                isGuidedTargetActive('message') && 'z-[210] rounded-2xl border border-primary/80 p-2 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
              )}
            >
              <label className="text-sm font-semibold text-white">{tr('Mensagem', 'Message')}</label>
              <Textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={tr('Digite a mensagem...', 'Type your message...')}
                className="mt-2 min-h-[120px]"
              />
            </div>

            <div
              ref={fileRef}
              className={cn(
                'relative mt-4 transition-all',
                isGuidedTargetActive('file') && 'z-[210] rounded-2xl border border-primary/80 p-2 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
              )}
            >
              <label className="text-sm font-semibold text-white">{tr('Arquivo (opcional)', 'File (optional)')}</label>
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="h-11"
                />
                {selectedFile ? (
                  <div className="text-xs text-gray-400">
                    {tr('Selecionado', 'Selected')}: <span className="text-white font-semibold">{selectedFile.name}</span>
                    {selectedFile.size ? (
                      <span className="text-gray-500"> · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">{tr('PNG/JPG, video, audio ou documento (ex: PDF).', 'PNG/JPG, video, audio, or document (e.g. PDF).')}</div>
                )}
              </div>

              {uploadProgress !== null && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Upload</span>
                    <span className="text-white font-semibold">{uploadProgress}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface overflow-hidden border border-surface-lighter">
                    <div
                      className="h-full bg-primary origin-left"
                      style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {selectedList && selectedList.contactsCount > CONTACTS_HARD_LIMIT_PER_JOB && (
              <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 text-yellow-200 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <div>
                  <p className="font-semibold">{tr('Lista acima do limite', 'List exceeds limit')}</p>
                  <p className="text-yellow-200/90">
                    {tr('Esta lista tem', 'This list has')} {selectedList.contactsCount} {tr('contatos. O limite por transmissão é', 'contacts. Broadcast limit is')}{' '}
                    {CONTACTS_HARD_LIMIT_PER_JOB}.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label
                ref={toggleRef}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl border border-surface-lighter bg-surface px-3 py-2 text-sm transition-all',
                  isGuidedTargetActive('toggle') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
                )}
              >
                <Switch
                  checked={removeContactIfLastMessageUndelivered}
                  onCheckedChange={setRemoveContactIfLastMessageUndelivered}
                  aria-label={tr(
                    'Tirar contato da lista se a última mensagem enviada não foi recebida?',
                    'Remove contact from the list if the last sent message was not received?'
                  )}
                />
                <span className="text-gray-200">
                  {tr(
                    'Tirar contato da lista se a última mensagem enviada não foi recebida?',
                    'Remove contact from the list if the last sent message was not received?'
                  )}
                </span>
              </label>
              <div className="text-xs text-gray-400">
                {tr(
                  'Envio 1 a 1 com delay aleatório de 1 a 3s. Pode demorar mais se houver conversa/IA ativa na sessão.',
                  '1-by-1 send with random delay of 1-3s. It can take longer if there are active conversation/AI flows in this session.'
                )}
              </div>
              <Button
                ref={sendButtonRef}
                onClick={handleSendBroadcast}
                disabled={guidedOpen || sending || !selectedListId || !canSend}
                className={cn(
                  'relative w-full sm:w-auto',
                  isGuidedTargetActive('send_button') && 'z-[210] border border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
                )}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                {tr('Iniciar transmissão', 'Start broadcast')}
              </Button>
            </div>
          </div>

          {/* Histórico */}
          <div
            ref={historyRef}
            className={cn(
              'relative bg-surface-light border border-surface-lighter rounded-2xl p-4 transition-all',
              isGuidedTargetActive('history') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-white font-bold">{tr('Histórico', 'History')}</h2>
              <Button variant="ghost" size="sm" onClick={() => void loadJobs('refresh')} disabled={jobsRefreshing}>
                {jobsRefreshing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                {tr('Atualizar', 'Refresh')}
              </Button>
            </div>

            {jobsError ? <p className="mt-3 text-xs text-red-300">{tr('Falha ao atualizar', 'Failed to refresh')}: {jobsError}</p> : null}

            <div className="mt-4 space-y-2">
              {jobsInitialLoading && displayJobs.length === 0 ? (
                <div className="py-6 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  <p className="mt-2 text-sm">{tr('Carregando transmissoes...', 'Loading broadcasts...')}</p>
                </div>
              ) : displayJobs.length === 0 ? (
                <div className="py-6 text-center text-gray-500 text-sm">{tr('Nenhuma transmissão ainda.', 'No broadcasts yet.')}</div>
              ) : (
                displayJobs.map((job) => {
                  const listName = displayLists.find((l) => l.id === job.listId)?.name ?? job.listId
                  const processed = Math.max(0, job.sentCount + job.failedCount)
                  const total = Math.max(0, job.totalCount)
                  const percent = total > 0 ? Math.round((processed / total) * 100) : 0
                  const isDemoJob = job.id === GUIDED_DEMO_JOB_ID
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => {
                        if (!isDemoJob) {
                          router.push(buildDetailsHref(job.id))
                        }
                      }}
                      className={cn(
                        'w-full text-left border border-surface-lighter rounded-2xl p-3 bg-surface transition-colors',
                        isDemoJob ? 'cursor-default' : 'hover:bg-surface-lighter/40'
                      )}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-semibold px-2 py-1 rounded-full border', statusBadgeClass(job.status))}>
                              {statusLabel(job.status, tr)}
                            </span>
                            <span className="text-sm font-semibold text-white truncate">{listName}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {processed}/{total} · {job.failedCount} {tr('falhas', 'failures')} · {tr('Criado', 'Created')} {formatDateTime(job.createdAt, locale)}
                            {job.pauseReason ? ` · ${tr('Motivo', 'Reason')}: ${job.pauseReason}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-36 h-2 rounded-full bg-surface border border-surface-lighter overflow-hidden">
                            <div className="h-full bg-primary origin-left" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right">{percent}%</span>
                          <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                        </div>
                      </div>

                      {job.status === 'completed' && job.failedCount === 0 && (
                        <div className="mt-2 text-xs text-green-300 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          {tr('Concluído sem falhas', 'Completed without failures')}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

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
                <ChevronLeft className="h-5 w-5" />
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
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="fixed bottom-5 left-1/2 z-[220] w-[min(680px,calc(100vw-2.5rem))] -translate-x-1/2 rounded-2xl border border-surface-lighter bg-surface-light p-4 shadow-2xl">
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
                    <h3 className="text-lg font-bold text-white">
                      {tr('Tutorial concluído!', 'Tutorial completed!')}
                    </h3>
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
