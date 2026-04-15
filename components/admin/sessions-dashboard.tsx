'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  PauseCircle,
  Phone,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2
} from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import { getBackendUrl } from '@/lib/backendUrl'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore'

type SessionStatus =
  | 'idle'
  | 'starting'
  | 'waiting_qr'
  | 'connected'
  | 'stopped'
  | 'error'
  | 'backoff'

type SessionRow = {
  sessionId: string
  status: SessionStatus
  updatedAt: number
  reason?: string
  hasLock?: boolean
  backoffUntil?: number | null
  failureCount?: number
}

type StatusHistoryItem = {
  sessionId: string
  status: SessionStatus
  updatedAt: number
  reason?: string
}

type LogItem = {
  id: string
  status: SessionStatus
  reason?: string
  atMs: number
  source: 'history' | 'live'
}

type DiagnosticsPayload = {
  diagnostics?: {
    sessions?: {
      sessionsCount?: number
      statuses?: SessionRow[]
      locks?: { sessionId: string; hasLock: boolean }[]
      backoffs?: { sessionId: string; backoffUntil?: number | null; failureCount?: number }[]
    }
  }
}

const statusMeta: Record<SessionStatus, { label: string; className: string; icon: typeof Activity }> = {
  connected: {
    label: 'Conectada',
    className: 'border-emerald-400/30 text-emerald-300 bg-emerald-400/10',
    icon: CheckCircle2
  },
  waiting_qr: {
    label: 'Aguardando QR',
    className: 'border-sky-400/30 text-sky-300 bg-sky-400/10',
    icon: QrCode
  },
  starting: {
    label: 'Iniciando',
    className: 'border-amber-400/30 text-amber-300 bg-amber-400/10',
    icon: Clock
  },
  backoff: {
    label: 'Backoff',
    className: 'border-yellow-400/30 text-yellow-300 bg-yellow-400/10',
    icon: ShieldAlert
  },
  error: {
    label: 'Erro',
    className: 'border-red-400/30 text-red-300 bg-red-400/10',
    icon: AlertCircle
  },
  stopped: {
    label: 'Parada',
    className: 'border-gray-500/30 text-gray-300 bg-gray-500/10',
    icon: PauseCircle
  },
  idle: {
    label: 'Idle',
    className: 'border-gray-500/30 text-gray-300 bg-gray-500/10',
    icon: Activity
  }
}

const statusFilters: Array<'all' | SessionStatus> = [
  'all',
  'connected',
  'waiting_qr',
  'starting',
  'backoff',
  'error',
  'stopped',
  'idle'
]

export function SessionsDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SessionStatus>('all')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyNonce, setHistoryNonce] = useState(0)
  const [actionPending, setActionPending] = useState<{ sessionId: string; action: string } | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [whatsappBySessionId, setWhatsappBySessionId] = useState<Record<string, string | undefined>>({})
  const [companyBySessionId, setCompanyBySessionId] = useState<Record<string, string | undefined>>({})
  const [trainingCompanyBySessionId, setTrainingCompanyBySessionId] = useState<Record<string, string | undefined>>({})

  const socketRef = useRef<Socket | null>(null)
  const previousSessionRef = useRef<string | null>(null)
  const trainingFetchedRef = useRef<Set<string>>(new Set())

  const fetchAdmin = async <T,>(path: string, init?: RequestInit): Promise<T> => {
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
  }

  const normalizeSessions = (payload: DiagnosticsPayload): SessionRow[] => {
    const diagnostics = payload?.diagnostics?.sessions
    const statuses = diagnostics?.statuses ?? []
    const locks = diagnostics?.locks ?? []
    const backoffs = diagnostics?.backoffs ?? []
    const lockBySession = new Map(locks.map((lock) => [lock.sessionId, lock.hasLock]))
    const backoffBySession = new Map(
      backoffs.map((backoff) => [
        backoff.sessionId,
        {
          backoffUntil: backoff.backoffUntil ?? null,
          failureCount: backoff.failureCount ?? 0
        }
      ])
    )

    return statuses.map((status) => ({
      ...status,
      hasLock: lockBySession.get(status.sessionId) ?? false,
      backoffUntil: backoffBySession.get(status.sessionId)?.backoffUntil ?? null,
      failureCount: backoffBySession.get(status.sessionId)?.failureCount ?? 0
    }))
  }

  const loadSessions = async () => {
    try {
      const payload = await fetchAdmin<DiagnosticsPayload>('/api/admin/sessions')
      const rows = normalizeSessions(payload)
      setSessions(rows)
      setLoading(false)
      setError(null)
      if (!selectedSessionId && rows.length > 0) {
        setSelectedSessionId(rows[0].sessionId)
      }
    } catch (loadError) {
      setLoading(false)
      setError((loadError as Error).message)
    }
  }

  useEffect(() => {
    let active = true
    const refresh = async () => {
      if (!active) return
      await loadSessions()
    }

    void refresh()
    const interval = setInterval(refresh, 10000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!db) return

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const next: Record<string, string | undefined> = {}
        const nextCompany: Record<string, string | undefined> = {}
        snapshot.forEach((doc) => {
          const data = doc.data() as { whatsapp?: string; empresa?: string }
          next[doc.id] = data?.whatsapp
          nextCompany[doc.id] = data?.empresa
        })
        setWhatsappBySessionId(next)
        setCompanyBySessionId(nextCompany)
      },
      (error) => {
        console.warn('[Admin Sessions] Erro ao buscar WhatsApp:', error)
      }
    )

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!db) return
    const firestore = db

    const missing = sessions
      .map((session) => session.sessionId)
      .filter((sessionId) => sessionId && !trainingFetchedRef.current.has(sessionId))

    if (missing.length === 0) {
      return
    }

    missing.forEach((sessionId) => {
      trainingFetchedRef.current.add(sessionId)

      ;(async () => {
        try {
          const trainingRef = doc(firestore, 'users', sessionId, 'settings', 'ai_training')
          const trainingSnap = await getDoc(trainingRef)
          if (!trainingSnap.exists()) return

          const trainingData = trainingSnap.data() as {
            instructions?: { nomeEmpresa?: string; empresa?: string }
          }
          const companyName =
            trainingData.instructions?.nomeEmpresa ||
            trainingData.instructions?.empresa ||
            undefined

          if (companyName) {
            setTrainingCompanyBySessionId((prev) => ({ ...prev, [sessionId]: companyName }))
          }
        } catch (error) {
          console.warn('[Admin Sessions] Erro ao buscar nome da empresa:', error)
        }
      })()
    })
  }, [sessions])

  useEffect(() => {
    if (!selectedSessionId) {
      return
    }

    if (previousSessionRef.current !== selectedSessionId) {
      setLogs([])
      previousSessionRef.current = selectedSessionId
    }

    const loadHistory = async () => {
      setHistoryLoading(true)
      try {
        const payload = await fetchAdmin<{ history?: StatusHistoryItem[] }>(
          `/api/admin/sessions/${encodeURIComponent(selectedSessionId)}/history?limit=30`
        )
        const historyItems = (payload?.history ?? []).map((item) => ({
          id: `history-${item.updatedAt}-${item.status}`,
          status: item.status,
          reason: item.reason,
          atMs: item.updatedAt,
          source: 'history' as const
        }))
        setLogs(historyItems)
      } catch (historyError) {
        setNotice({ type: 'error', message: (historyError as Error).message })
      } finally {
        setHistoryLoading(false)
      }
    }

    void loadHistory()
  }, [selectedSessionId, historyNonce])

  useEffect(() => {
    if (!selectedSessionId) {
      return
    }

    setQrCode(null)
    setNotice(null)

    const backendUrl = getBackendUrl({
      productionFallback: 'https://backend-b-production.up.railway.app',
      developmentFallback: 'http://localhost:3002'
    })

    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }

    const socket = io(backendUrl, {
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      query: { userId: selectedSessionId },
      transports: ['websocket'],
      withCredentials: true,
      timeout: 20000,
      forceNew: true
    })

    const pushLog = (status: SessionStatus, reason?: string) => {
      const atMs = Date.now()
      const entry: LogItem = {
        id: `live-${atMs}-${status}`,
        status,
        reason,
        atMs,
        source: 'live'
      }
      setLogs((prev) => [
        entry,
        ...prev
      ].slice(0, 50))
    }

    const updateSessionStatus = (status: SessionStatus, reason?: string) => {
      setSessions((prev) => {
        const updatedAt = Date.now()
        const next = prev.map((session) =>
          session.sessionId === selectedSessionId
            ? { ...session, status, reason, updatedAt }
            : session
        )
        if (!next.find((session) => session.sessionId === selectedSessionId)) {
          next.unshift({
            sessionId: selectedSessionId,
            status,
            reason,
            updatedAt
          })
        }
        return next
      })
      pushLog(status, reason)
    }

    socket.on('qr', (dataUrl: string) => {
      setQrCode(dataUrl)
      updateSessionStatus('waiting_qr')
    })

    socket.on('logging-in', () => {
      updateSessionStatus('starting', 'restart-required')
    })

    socket.on('connected', () => {
      setQrCode(null)
      updateSessionStatus('connected')
    })

    socket.on('disconnected', () => {
      setQrCode(null)
      updateSessionStatus('stopped', 'socket-disconnected')
    })

    socket.on('error', (err: Error | string) => {
      const message = typeof err === 'string' ? err : err.message || 'socket-error'
      setNotice({ type: 'error', message })
      updateSessionStatus('error', message)
    })

    socketRef.current = socket

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [selectedSessionId])

  const handleAction = async (sessionId: string, action: 'start' | 'stop' | 'purge' | 'restart') => {
    setActionPending({ sessionId, action })
    setNotice(null)
    try {
      if (action === 'restart') {
        await fetchAdmin(`/api/admin/sessions/${encodeURIComponent(sessionId)}/stop`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'restart' })
        })
        const response = await fetchAdmin<{ status?: SessionRow }>(
          `/api/admin/sessions/${encodeURIComponent(sessionId)}/start`,
          { method: 'POST' }
        )
        if (response?.status) {
          setSessions((prev) =>
            prev.map((session) =>
              session.sessionId === sessionId ? { ...session, ...response.status } : session
            )
          )
        }
      } else {
        const response = await fetchAdmin<{ status?: SessionRow }>(
          `/api/admin/sessions/${encodeURIComponent(sessionId)}/${action}`,
          { method: 'POST' }
        )
        if (response?.status) {
          setSessions((prev) =>
            prev.map((session) =>
              session.sessionId === sessionId ? { ...session, ...response.status } : session
            )
          )
        }
      }
      setNotice({ type: 'success', message: `Acao ${action} enviada.` })
    } catch (actionError) {
      setNotice({ type: 'error', message: (actionError as Error).message })
    } finally {
      setActionPending(null)
    }
  }

  const filteredSessions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return sessions.filter((session) => {
      const whatsapp = whatsappBySessionId[session.sessionId]
      const companyName =
        trainingCompanyBySessionId[session.sessionId] ||
        companyBySessionId[session.sessionId]
      const matchesSearch =
        term.length === 0 ||
        session.sessionId.toLowerCase().includes(term) ||
        (whatsapp && whatsapp.toLowerCase().includes(term)) ||
        (companyName && companyName.toLowerCase().includes(term))
      const matchesStatus = statusFilter === 'all' || session.status === statusFilter
      const hasIssue = session.status === 'error' || session.status === 'backoff'
      const matchesIssue = !onlyIssues || hasIssue
      return matchesSearch && matchesStatus && matchesIssue
    })
  }, [
    sessions,
    searchTerm,
    statusFilter,
    onlyIssues,
    whatsappBySessionId,
    companyBySessionId,
    trainingCompanyBySessionId
  ])

  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.sessionId === selectedSessionId) ?? null
    : null

  const stats = useMemo(() => {
    const total = sessions.length
    const connected = sessions.filter((session) => session.status === 'connected').length
    const waiting = sessions.filter((session) => session.status === 'waiting_qr').length
    const issues = sessions.filter((session) => session.status === 'error' || session.status === 'backoff').length
    return { total, connected, waiting, issues }
  }, [sessions])

  const formatAgo = (timestamp?: number) => {
    if (!timestamp) return '--'
    const diffMs = Date.now() - timestamp
    if (diffMs < 0) {
      const aheadMin = Math.ceil(Math.abs(diffMs) / 60000)
      if (aheadMin < 60) return `em ${aheadMin}m`
      const aheadHr = Math.ceil(aheadMin / 60)
      if (aheadHr < 24) return `em ${aheadHr}h`
      const aheadDay = Math.ceil(aheadHr / 24)
      return `em ${aheadDay}d`
    }
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'agora'
    if (diffMin < 60) return `${diffMin}m`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay}d`
  }

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '--'
    const date = new Date(timestamp)
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatWhatsApp = (phone?: string) => {
    if (!phone) return '---'
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 11) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`
    }
    return phone
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" /> Sessoes e QR
          </h1>
          <p className="text-gray-400 mt-1">
            Acompanhe status, QR e eventos recentes das sessoes ativas.
          </p>
        </div>
        <Button
          onClick={loadSessions}
          variant="outline"
          className="border-surface-lighter text-gray-300"
          disabled={loading}
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase">Total</p>
          <p className="text-2xl font-semibold text-white">{stats.total}</p>
        </div>
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase">Conectadas</p>
          <p className="text-2xl font-semibold text-emerald-300">{stats.connected}</p>
        </div>
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase">Aguardando QR</p>
          <p className="text-2xl font-semibold text-sky-300">{stats.waiting}</p>
        </div>
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase">Com problema</p>
          <p className="text-2xl font-semibold text-red-300">{stats.issues}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar sessionId ou WhatsApp..."
                className="pl-10 bg-surface-light border-surface-lighter"
              />
            </div>
            <div className="flex items-center gap-3 bg-surface-light border border-surface-lighter rounded-xl px-3 py-2">
              <span className="text-xs text-gray-400 uppercase">Somente erros</span>
              <Switch checked={onlyIssues} onCheckedChange={setOnlyIssues} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusFilters.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-all border',
                  statusFilter === status
                    ? 'bg-primary/20 border-primary/30 text-primary'
                    : 'bg-surface-light border-surface-lighter text-gray-400 hover:text-gray-200'
                )}
              >
                {status === 'all' ? 'Todos' : statusMeta[status].label}
              </button>
            ))}
          </div>

          <div className="bg-surface-light border border-surface-lighter rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-lighter bg-surface-lighter/30">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">Sessão</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">Nome da empresa</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">WhatsApp</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">Atualização</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">Lock</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300">Backoff</th>
                    <th className="px-5 py-3 text-xs font-semibold text-gray-300 text-right">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-lighter">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                        Carregando sessoes...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-red-400">
                        {error}
                      </td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                        Nenhuma sessão encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredSessions.map((session) => {
                      const meta = statusMeta[session.status]
                      const StatusIcon = meta.icon
                      const companyName =
                        trainingCompanyBySessionId[session.sessionId] ||
                        companyBySessionId[session.sessionId] ||
                        '---'
                      return (
                        <tr
                          key={session.sessionId}
                          className={cn(
                            'group hover:bg-surface-lighter/30 transition-colors',
                            selectedSessionId === session.sessionId && 'bg-surface-lighter/40'
                          )}
                          onClick={() => setSelectedSessionId(session.sessionId)}
                        >
                          <td className="px-5 py-4 text-sm text-white font-medium">
                            {session.sessionId}
                          </td>
                          <td className="px-5 py-4 text-sm text-gray-200">
                            <span className="block max-w-[260px] truncate" title={companyName}>
                              {companyName}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <Phone className="w-3.5 h-3.5 text-gray-500" />
                              {formatWhatsApp(whatsappBySessionId[session.sessionId])}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={cn(
                                'inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border',
                                meta.className
                              )}
                            >
                              <StatusIcon className="w-3.5 h-3.5" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-400">
                            {formatAgo(session.updatedAt)}
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-400">
                            {session.hasLock ? 'ativo' : '---'}
                          </td>
                          <td className="px-5 py-4 text-xs text-gray-400">
                            {session.backoffUntil ? formatAgo(session.backoffUntil) : '---'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-400 hover:text-white"
                              onClick={() => setSelectedSessionId(session.sessionId)}
                            >
                              Ver
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">Sessão selecionada</p>
                <h2 className="text-lg font-semibold text-white truncate">
                  {selectedSessionId ?? '---'}
                </h2>
              </div>
              {selectedSession?.status && (
                <span
                  className={cn(
                    'inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border',
                    statusMeta[selectedSession.status].className
                  )}
                >
                  {statusMeta[selectedSession.status].label}
                </span>
              )}
            </div>

            {notice && (
              <div
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs',
                  notice.type === 'success'
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-red-400/30 bg-red-400/10 text-red-200'
                )}
              >
                {notice.message}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                className="w-full"
                variant="outline"
                disabled={!selectedSessionId || actionPending?.sessionId === selectedSessionId}
                onClick={() => selectedSessionId && handleAction(selectedSessionId, 'start')}
              >
                <Play className="w-4 h-4 mr-2" /> Start
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={!selectedSessionId || actionPending?.sessionId === selectedSessionId}
                onClick={() => selectedSessionId && handleAction(selectedSessionId, 'restart')}
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Restart
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={!selectedSessionId || actionPending?.sessionId === selectedSessionId}
                onClick={() => selectedSessionId && handleAction(selectedSessionId, 'stop')}
              >
                <PauseCircle className="w-4 h-4 mr-2" /> Stop
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={!selectedSessionId || actionPending?.sessionId === selectedSessionId}
                onClick={() => selectedSessionId && handleAction(selectedSessionId, 'purge')}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Purge
              </Button>
            </div>

            <div className="bg-surface border border-surface-lighter rounded-2xl p-4 text-center">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <QrCode className="w-4 h-4 text-primary" />
                  QR Code
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-gray-400"
                  onClick={() => setQrCode(null)}
                >
                  Limpar
                </Button>
              </div>
              {qrCode ? (
                <div className="bg-white p-3 rounded-xl inline-flex">
                  <img src={qrCode} alt="QR code" className="w-48 h-48" />
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-10">
                  Nenhum QR recebido ainda. Inicie ou reinicie a sessão.
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Clock className="w-4 h-4 text-primary" />
                Logs recentes
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-400"
                disabled={historyLoading || !selectedSessionId}
                onClick={() => setHistoryNonce((prev) => prev + 1)}
              >
                <RefreshCw className={cn('w-4 h-4', historyLoading && 'animate-spin')} />
              </Button>
            </div>
            {historyLoading && logs.length === 0 ? (
              <div className="text-xs text-gray-500">Carregando logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-xs text-gray-500">Nenhum evento registrado.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 bg-surface border border-surface-lighter rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border',
                          statusMeta[log.status]?.className ?? 'border-gray-500/30 text-gray-400'
                        )}
                      >
                        {statusMeta[log.status]?.label ?? log.status}
                      </span>
                      <span className="text-xs text-gray-400">
                        {log.reason ? log.reason : 'sem detalhe'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {formatTimestamp(log.atMs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
