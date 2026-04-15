'use client'

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import {
  Users,
  Search,
  Phone,
  Calendar,
  Loader2,
  ArrowUpDown,
  Wallet,
  Edit3,
  AlertTriangle,
  Trash2,
  Check,
  X
} from 'lucide-react'
import { auth, db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { cn } from '@/lib/utils'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { normalizeLocale } from '@/lib/i18n/locales'

interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'user'
  whatsapp?: string
  locale?: string
  createdAt: string
}

type SessionStatus = 'idle' | 'starting' | 'waiting_qr' | 'connected' | 'stopped' | 'error' | 'backoff'

interface SessionStatusSnapshot {
  sessionId: string
  status: SessionStatus
  updatedAt: number
  reason?: string
}

interface DiagnosticsPayload {
  diagnostics?: {
    sessions?: {
      statuses?: SessionStatusSnapshot[]
    }
  }
}

type CreditBalance = {
  balanceBrl: number
  blockedAt: number | null
  blockedReason: string | null
  updatedAt: number
}

type CreditUpdateMode = 'set' | 'adjust'

type CreditsBatchResponse = {
  success?: boolean
  credits?: Record<string, CreditBalance>
}

type CreditsUpdateResponse = {
  success?: boolean
  credits?: CreditBalance
}

type UserPlan = 'pro_monthly' | 'pro_annual' | 'enterprise_annual' | 'free' | 'na'

type PlanSnapshot = {
  plan: UserPlan
  subscriptionStatus: string | null
  priceId: string | null
}

type BillingBatchResponse = {
  success?: boolean
  plans?: Record<string, PlanSnapshot>
  errors?: Record<string, string>
}

type AdminDeleteUserResponse = {
  success?: boolean
  sessionId?: string
  report?: {
    summary?: {
      postgresRowsDeleted?: number
      redisKeysDeleted?: number
      storageFilesDeleted?: number
    }
    backend?: {
      postgresRowsDeleted?: number
      redisKeysDeleted?: number
    }
    storage?: {
      deletedFiles?: number
    }
  }
  error?: string
}

type AiGlobalStatus = 'enabled' | 'disabled' | 'unknown'

type AiConfigResponse = {
  enabled?: boolean
}

const ACTIVE_SESSION_STATUSES = new Set<SessionStatus>(['connected', 'starting', 'waiting_qr'])

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [sortBy, setSortBy] = useState<'none' | 'connection'>('none')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [statusByUserId, setStatusByUserId] = useState<Record<string, SessionStatusSnapshot>>({})
  const [authUserId, setAuthUserId] = useState<string | null>(auth?.currentUser?.uid ?? null)
  const [creditsByUser, setCreditsByUser] = useState<Record<string, CreditBalance>>({})
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [creditsError, setCreditsError] = useState<string | null>(null)
  const [aiGlobalByUserId, setAiGlobalByUserId] = useState<Record<string, AiGlobalStatus>>({})
  const [aiGlobalLoading, setAiGlobalLoading] = useState(false)
  const [plansByUserId, setPlansByUserId] = useState<Record<string, PlanSnapshot>>({})
  const [plansLoading, setPlansLoading] = useState(false)
  const [plansError, setPlansError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<CreditUpdateMode>('set')
  const [editAmount, setEditAmount] = useState('')
  const [editReason, setEditReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null)

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

  useEffect(() => {
    if (!auth) {
      return
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUserId(user?.uid ?? null)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!db) return

    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData: UserProfile[] = []
      snapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() } as UserProfile)
      })
      setUsers(usersData)
      setLoading(false)
    }, (error) => {
      console.error('Erro ao buscar usuários:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchStatuses = async () => {
      try {
        if (!auth?.currentUser) {
          return
        }
        const token = await auth.currentUser.getIdToken()
        const response = await fetch('/api/admin/sessions', {
          headers: { authorization: `Bearer ${token}` }
        })
        if (!response.ok) {
          return
        }
        const data = (await response.json().catch(() => null)) as DiagnosticsPayload | null
        const statuses = data?.diagnostics?.sessions?.statuses ?? []
        if (isMounted) {
          const next: Record<string, SessionStatusSnapshot> = {}
          statuses.forEach((status) => {
            if (!status?.sessionId) return
            next[status.sessionId] = status
          })
          setStatusByUserId(next)
        }
      } catch (error) {
        console.warn('[Admin Users] Erro ao buscar status:', error)
      }
    }

    const unsubscribe = auth
      ? onAuthStateChanged(auth, (user) => {
        if (user) {
          void fetchStatuses()
        }
      })
      : undefined

    void fetchStatuses()
    const intervalId = setInterval(fetchStatuses, 5 * 60 * 1000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    if (!users.length || !authUserId) {
      setCreditsByUser({})
      setCreditsLoading(false)
      setCreditsError(null)
      return
    }

    let cancelled = false
    const loadCredits = async () => {
      setCreditsLoading(true)
      setCreditsError(null)
      try {
        const sessionIds = users.map((user) => user.id)
        const payload = await fetchWithAuth<CreditsBatchResponse>('/api/admin/credits/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionIds })
        })
        if (cancelled) return
        setCreditsByUser(payload.credits ?? {})
      } catch (error) {
        if (!cancelled) {
          setCreditsError(error instanceof Error ? error.message : 'Erro ao carregar créditos')
        }
      } finally {
        if (!cancelled) {
          setCreditsLoading(false)
        }
      }
    }

    void loadCredits()
    return () => {
      cancelled = true
    }
  }, [users, authUserId, fetchWithAuth])

  useEffect(() => {
    if (!users.length || !authUserId) {
      setAiGlobalByUserId({})
      setAiGlobalLoading(false)
      return
    }

    let cancelled = false
    const loadAiGlobal = async () => {
      setAiGlobalLoading(true)
      try {
        const userIds = users.map((user) => user.id).filter(Boolean)
        const results = await Promise.all(
          userIds.map(async (userId) => {
            try {
              const payload = await fetchWithAuth<AiConfigResponse>(`/api/ai-config?sessionId=${encodeURIComponent(userId)}`)
              return [userId, payload.enabled === true ? 'enabled' : 'disabled'] as const
            } catch {
              return [userId, 'unknown'] as const
            }
          })
        )

        if (cancelled) return

        const next: Record<string, AiGlobalStatus> = {}
        results.forEach(([userId, status]) => {
          next[userId] = status
        })
        setAiGlobalByUserId(next)
      } catch (error) {
        if (!cancelled) {
          console.warn('[Admin Users] Erro ao carregar IA Global:', error)
          setAiGlobalByUserId({})
        }
      } finally {
        if (!cancelled) {
          setAiGlobalLoading(false)
        }
      }
    }

    void loadAiGlobal()
    return () => {
      cancelled = true
    }
  }, [users, authUserId, fetchWithAuth])

  useEffect(() => {
    if (!users.length || !authUserId) {
      setPlansByUserId({})
      setPlansLoading(false)
      setPlansError(null)
      return
    }

    let cancelled = false
    const loadPlans = async () => {
      setPlansLoading(true)
      setPlansError(null)
      try {
        const sessionIds = users.map((user) => user.id)
        const payload = await fetchWithAuth<BillingBatchResponse>('/api/admin/billing/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionIds })
        })
        if (cancelled) return
        setPlansByUserId(payload.plans ?? {})
        if (payload.errors && Object.keys(payload.errors).length > 0) {
          setPlansError(`Falha em ${Object.keys(payload.errors).length} usuário(s)`)
        }
      } catch (error) {
        if (!cancelled) {
          setPlansError(error instanceof Error ? error.message : 'Erro ao carregar planos')
        }
      } finally {
        if (!cancelled) {
          setPlansLoading(false)
        }
      }
    }

    void loadPlans()
    return () => {
      cancelled = true
    }
  }, [users, authUserId, fetchWithAuth])

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(date)
    } catch {
      return dateStr
    }
  }

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }, [])

  const formatWhatsApp = (phone?: string) => {
    if (!phone) return 'N/A'
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 11) {
      return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`
    }
    return phone
  }

  const isUserSessionActive = useCallback((userId: string) => {
    const status = statusByUserId[userId]?.status
    return status ? ACTIVE_SESSION_STATUSES.has(status) : false
  }, [statusByUserId])

  const getPlanLabel = useCallback((plan: UserPlan) => {
    if (plan === 'pro_monthly') return 'Pro mensal'
    if (plan === 'pro_annual') return 'Pro anual'
    if (plan === 'enterprise_annual') return 'Enterprise anual'
    if (plan === 'free') return 'Free'
    return 'N/A'
  }, [])

  const getLocaleLabel = useCallback((locale?: string) => {
    return normalizeLocale(locale) === 'en' ? 'EN' : 'BR'
  }, [])

  const toggleSort = (field: 'connection') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const filteredUsers = useMemo(() => {
    const nextUsers = users.filter((user) => {
      const matchesSearch =
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.whatsapp && user.whatsapp.includes(searchTerm))

      const matchesRole = roleFilter === 'all' || user.role === roleFilter
      return matchesSearch && matchesRole
    })

    if (sortBy !== 'connection') {
      return nextUsers
    }

    return [...nextUsers].sort((a, b) => {
      const rankA = isUserSessionActive(a.id) ? 1 : 0
      const rankB = isUserSessionActive(b.id) ? 1 : 0
      const comparison = rankA - rankB
      return sortOrder === 'desc' ? -comparison : comparison
    })
  }, [users, searchTerm, roleFilter, sortBy, sortOrder, isUserSessionActive])

  const openEditor = useCallback((userId: string, currentBalance: number) => {
    setEditingId(userId)
    setEditMode('set')
    setEditAmount(String(currentBalance))
    setEditReason('')
    setActionError(null)
  }, [])

  const closeEditor = useCallback(() => {
    setEditingId(null)
    setEditAmount('')
    setEditReason('')
    setActionError(null)
  }, [])

  const startDeleteFlow = useCallback((userId: string) => {
    setDeleteCandidateId(userId)
    setDeleteError(null)
    setDeleteSuccess(null)
  }, [])

  const cancelDeleteFlow = useCallback(() => {
    if (!deletingId) {
      setDeleteCandidateId(null)
    }
  }, [deletingId])

  const confirmDeleteUser = useCallback(async (userId: string) => {
    if (deletingId) return

    const confirmed = window.confirm(
      'Confirmação final: deseja realmente excluir esta conta? Esta ação executa hard delete completo (Auth, Firestore, Storage e dados de sessão no Railway).'
    )
    if (!confirmed) {
      return
    }

    setDeletingId(userId)
    setDeleteError(null)
    setDeleteSuccess(null)
    try {
      const payload = await fetchWithAuth<AdminDeleteUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE'
      })
      if (payload.success === false) {
        throw new Error(payload.error || 'hard_delete_failed')
      }

      const postgresRows =
        Number(payload.report?.summary?.postgresRowsDeleted) ||
        Number(payload.report?.backend?.postgresRowsDeleted) ||
        0
      const redisKeys =
        Number(payload.report?.summary?.redisKeysDeleted) ||
        Number(payload.report?.backend?.redisKeysDeleted) ||
        0
      const storageFiles =
        Number(payload.report?.summary?.storageFilesDeleted) ||
        Number(payload.report?.storage?.deletedFiles) ||
        0

      setUsers((prev) => prev.filter((user) => user.id !== userId))
      setCreditsByUser((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setPlansByUserId((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setAiGlobalByUserId((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setStatusByUserId((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      setEditingId((prev) => (prev === userId ? null : prev))
      setDeleteCandidateId(null)
      setDeleteSuccess(`Hard delete concluido. Postgres: ${postgresRows}, Redis: ${redisKeys}, Storage: ${storageFiles}.`)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Erro ao excluir usuário')
    } finally {
      setDeletingId(null)
    }
  }, [deletingId, fetchWithAuth])

  const handleSave = useCallback(async () => {
    if (!editingId) return

    const parsedAmount = parseAmount(editAmount)
    if (parsedAmount === null) {
      setActionError('Valor invalido')
      return
    }
    if (editMode === 'set' && parsedAmount < 0) {
      setActionError('Valor não pode ser negativo no modo definir')
      return
    }

    setSaving(true)
    setActionError(null)
    try {
      const payload = await fetchWithAuth<CreditsUpdateResponse>(`/api/admin/credits/${editingId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: editMode,
          amountBrl: parsedAmount,
          reason: editReason || null
        })
      })
      if (payload?.credits) {
        setCreditsByUser((prev) => ({ ...prev, [editingId]: payload.credits! }))
      }
      closeEditor()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }, [editingId, editAmount, editMode, editReason, fetchWithAuth, closeEditor])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-gray-400 animate-pulse">Carregando usuários...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" /> Usuários da Plataforma
            </h1>
            <p className="text-gray-400 mt-1">
              Total de {users.length} usuários cadastrados no sistema.
            </p>
          </div>
          {creditsLoading || plansLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {creditsLoading && plansLoading
                ? 'Atualizando créditos e planos...'
                : creditsLoading
                  ? 'Atualizando créditos...'
                  : 'Atualizando planos...'}
            </div>
          ) : null}
        </div>

        {creditsError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <AlertTriangle className="w-5 h-5 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Falha ao carregar créditos</p>
              <p className="text-xs text-red-200/80">{creditsError}</p>
            </div>
          </div>
        ) : null}
        {plansError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-100">
            <AlertTriangle className="w-5 h-5 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Falha parcial ao carregar planos</p>
              <p className="text-xs text-yellow-100/80">{plansError}</p>
            </div>
          </div>
        ) : null}
        {deleteError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <AlertTriangle className="w-5 h-5 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Falha ao excluir usuário</p>
              <p className="text-xs text-red-200/80">{deleteError}</p>
            </div>
          </div>
        ) : null}
        {deleteSuccess ? (
          <div className="flex items-start gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-200">
            <Check className="w-5 h-5 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Usuário excluido com hard delete</p>
              <p className="text-xs text-green-200/80">{deleteSuccess}</p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por email ou WhatsApp..."
              className="w-full bg-surface-light border border-surface-lighter rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-surface-light border border-surface-lighter p-1 rounded-xl">
            <button
              onClick={() => setRoleFilter('all')}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                roleFilter === 'all' ? 'bg-surface-lighter text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              Todos
            </button>
            <button
              onClick={() => setRoleFilter('admin')}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                roleFilter === 'admin' ? 'bg-primary/20 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              Admins
            </button>
            <button
              onClick={() => setRoleFilter('user')}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                roleFilter === 'user' ? 'bg-surface-lighter text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              Usuários
            </button>
          </div>
        </div>

        <div className="bg-surface-light border border-surface-lighter rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-lighter bg-surface-lighter/30">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">Usuário</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">Plano</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">EN/BR</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">WhatsApp</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">Saldo</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">
                    <button onClick={() => toggleSort('connection')} className="flex items-center gap-1 hover:text-white transition-colors">
                      <span>Conexão</span>
                      <ArrowUpDown
                        className={cn(
                          'w-3 h-3',
                          sortBy === 'connection' ? 'text-white' : 'text-gray-500'
                        )}
                      />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">IA Global</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-300">Cadastro</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-lighter">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const isActive = isUserSessionActive(user.id)
                    const credits = creditsByUser[user.id]
                    const balance = credits?.balanceBrl ?? 0
                    const planLabel = getPlanLabel(plansByUserId[user.id]?.plan ?? 'na')
                    const localeLabel = getLocaleLabel(user.locale)
                    const aiGlobal = aiGlobalByUserId[user.id]
                    const isAiGlobalEnabled = aiGlobal === 'enabled'
                    return (
                      <Fragment key={user.id}>
                        <tr className="group hover:bg-surface-lighter/20 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'w-10 h-10 rounded-full flex items-center justify-center font-bold border',
                                user.role === 'admin'
                                  ? 'bg-primary/10 text-primary border-primary/20'
                                  : 'bg-surface-lighter text-gray-400 border-surface-lighter'
                              )}>
                                {user.email.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-white font-medium group-hover:text-primary transition-colors flex items-center gap-2">
                                  {user.email}
                                </p>
                                <p className="text-xs text-gray-500">UID: {user.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              {planLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {localeLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Phone className="w-4 h-4 text-gray-500" />
                              {formatWhatsApp(user.whatsapp)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Wallet className="w-4 h-4 text-gray-500" />
                              {formatCurrency(balance)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm">
                              <span
                                className={cn(
                                  'w-2.5 h-2.5 rounded-full',
                                  isActive ? 'bg-green-500' : 'bg-gray-500'
                                )}
                              />
                              <span
                                className={cn(
                                  isActive ? 'text-green-400' : 'text-gray-400'
                                )}
                              >
                                {isActive ? 'On' : 'Off'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {!aiGlobal && aiGlobalLoading ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Carregando
                              </div>
                            ) : aiGlobal === 'unknown' || !aiGlobal ? (
                              <span className="text-sm text-gray-500">Indisponivel</span>
                            ) : (
                              <div className="flex items-center gap-2 text-sm">
                                <span
                                  className={cn(
                                    'w-2.5 h-2.5 rounded-full',
                                    isAiGlobalEnabled ? 'bg-primary' : 'bg-gray-500'
                                  )}
                                />
                                <span className={cn(isAiGlobalEnabled ? 'text-primary' : 'text-gray-400')}>
                                  {isAiGlobalEnabled ? 'Ligada' : 'Desligada'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <Calendar className="w-4 h-4" />
                              {formatDate(user.createdAt)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                className="p-2 text-primary border border-primary/30 hover:bg-primary/10 rounded-lg transition-all disabled:opacity-60"
                                onClick={() => openEditor(user.id, balance)}
                                title="Editar saldo"
                                aria-label={`Editar saldo de ${user.email}`}
                                disabled={deletingId === user.id}
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              {deleteCandidateId === user.id ? (
                                <>
                                  <button
                                    className="p-2 text-red-300 border border-red-400/40 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-60"
                                    onClick={() => {
                                      void confirmDeleteUser(user.id)
                                    }}
                                    title="Confirmar exclusao"
                                    aria-label={`Confirmar exclusao de ${user.email}`}
                                    disabled={deletingId === user.id}
                                  >
                                    {deletingId === user.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Check className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    className="p-2 text-gray-300 border border-surface-lighter hover:bg-surface-lighter rounded-lg transition-all disabled:opacity-60"
                                    onClick={cancelDeleteFlow}
                                    title="Cancelar exclusao"
                                    aria-label={`Cancelar exclusao de ${user.email}`}
                                    disabled={deletingId === user.id}
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="p-2 text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-60"
                                  onClick={() => startDeleteFlow(user.id)}
                                  title="Excluir conta"
                                  aria-label={`Excluir conta de ${user.email}`}
                                  disabled={deletingId === user.id}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editingId === user.id ? (
                          <tr>
                            <td colSpan={9} className="px-6 py-4 bg-surface-lighter/20">
                              <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
                                <div className="flex items-center gap-2 bg-surface-light border border-surface-lighter p-1 rounded-xl">
                                  <button
                                    className={cn(
                                      'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                                      editMode === 'set'
                                        ? 'bg-primary/20 text-primary shadow-sm'
                                        : 'text-gray-500 hover:text-gray-300'
                                    )}
                                    onClick={() => setEditMode('set')}
                                  >
                                    Definir saldo
                                  </button>
                                  <button
                                    className={cn(
                                      'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                                      editMode === 'adjust'
                                        ? 'bg-surface-lighter text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-300'
                                    )}
                                    onClick={() => setEditMode('adjust')}
                                  >
                                    Ajustar
                                  </button>
                                </div>

                                <div className="flex flex-col">
                                  <label className="text-xs text-gray-400 mb-1">Valor (BRL)</label>
                                  <input
                                    value={editAmount}
                                    onChange={(event) => setEditAmount(event.target.value)}
                                    placeholder={editMode === 'adjust' ? 'Ex: 10 ou -5' : 'Ex: 50'}
                                    className="w-40 bg-surface-light border border-surface-lighter rounded-xl py-2 px-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                </div>

                                <div className="flex-1 flex flex-col">
                                  <label className="text-xs text-gray-400 mb-1">Motivo (opcional)</label>
                                  <input
                                    value={editReason}
                                    onChange={(event) => setEditReason(event.target.value)}
                                    placeholder="Ex: ajuste manual"
                                    className="w-full bg-surface-light border border-surface-lighter rounded-xl py-2 px-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                  />
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 border border-surface-lighter hover:bg-surface-light"
                                    onClick={closeEditor}
                                    disabled={saving}
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    className="px-4 py-2 rounded-xl text-sm font-medium text-black bg-primary hover:bg-primary/90 disabled:opacity-70"
                                    onClick={handleSave}
                                    disabled={saving}
                                  >
                                    {saving ? 'Salvando...' : 'Salvar'}
                                  </button>
                                </div>
                              </div>
                              {actionError ? (
                                <p className="mt-2 text-xs text-red-400">{actionError}</p>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <Users className="w-12 h-12 text-gray-600 mb-2" />
                        <p className="text-lg font-medium text-white">Nenhum usuário encontrado</p>
                        <p className="text-gray-500 max-w-xs mx-auto">
                          Tente ajustar sua busca ou filtros para encontrar o que procura.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

function parseAmount(raw: string): number | null {
  if (!raw || !raw.trim()) {
    return null
  }
  const normalized = raw.replace(',', '.').replace(/[^0-9.\-]/g, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}



