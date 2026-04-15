'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Brain, MessageSquare, Users, DollarSign, UserCheck, Calendar, Files, Megaphone } from 'lucide-react'
import { AdminUserLeads } from '@/components/admin/user-leads'
import { AdminUserClients } from '@/components/admin/user-clients'
import { AdminUserTraining } from '@/components/admin/user-training'
import { AdminUserConversations } from '@/components/admin/user-conversations'
import { AdminUserAgenda } from '@/components/admin/user-agenda'
import { AdminUserArquivos } from '@/components/admin/user-arquivos'
import { AdminUserTransmissao } from '@/components/admin/user-transmissao'
import { FinanceiroPanel } from '@/components/financeiro/financeiro-panel'
import { db } from '@/lib/firebase'
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore'

interface ClientOption {
  id: string
  name: string
  email?: string
}

const SEARCH_RESULTS_LIMIT = 20

const tabs = [
  {
    id: 'treinamento',
    label: 'Treinamento IA',
    icon: Brain,
    description: 'Inputs e configurações usadas no treinamento.'
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: UserCheck,
    description: 'Lista de clientes cadastrados por este usuário.'
  },
  {
    id: 'leads',
    label: 'Leads',
    icon: Users,
    description: 'Lista de leads gerados por este usuário.'
  },
  {
    id: 'conversas',
    label: 'Conversas',
    icon: MessageSquare,
    description: 'Histórico de conversas e interações.'
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    description: 'Agenda e agendamentos deste usuário.'
  },
  {
    id: 'arquivos',
    label: 'Arquivos',
    icon: Files,
    description: 'Biblioteca de arquivos e gatilhos da IA.'
  },
  {
    id: 'transmissao',
    label: 'Transmissão',
    icon: Megaphone,
    description: 'Listas, disparos e histórico de transmissões.'
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: DollarSign,
    description: 'Receitas, cobranças e movimentações financeiras.'
  }
]

const TAB_IDS = new Set(tabs.map((tab) => tab.id))

export function ClientDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get('tab')?.trim() ?? ''
  const userIdParam = searchParams.get('userId')?.trim() ?? ''

  const [clientOptions, setClientOptions] = useState<ClientOption[]>([])
  const [selectedClientId, setSelectedClientId] = useState(userIdParam)
  const [isLoadingClients, setIsLoadingClients] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [activeTabId, setActiveTabId] = useState(() => {
    if (tabParam && TAB_IDS.has(tabParam)) {
      return tabParam
    }
    return tabs[0]?.id ?? ''
  })

  const selectedClient = useMemo(
    () => clientOptions.find((client) => client.id === selectedClientId),
    [clientOptions, selectedClientId]
  )

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []

    const score = (client: ClientOption) => {
      const name = client.name.toLowerCase()
      const email = (client.email ?? '').toLowerCase()
      const id = client.id.toLowerCase()

      if (email === q || id === q) return 0
      if (email.startsWith(q)) return 1
      if (name.startsWith(q)) return 2
      if (email.includes(q)) return 3
      if (name.includes(q)) return 4
      if (id.includes(q)) return 5
      return 999
    }

    return clientOptions
      .map((client) => ({ client, score: score(client) }))
      .filter((item) => item.score < 999)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score
        return a.client.name.localeCompare(b.client.name)
      })
      .map((item) => item.client)
  }, [clientOptions, searchQuery])

  useEffect(() => {
    if (!db) {
      setIsLoadingClients(false)
      return
    }

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      async (snapshot) => {
        const users = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...(docItem.data() as { email?: string; empresa?: string })
        }))

        const options = await Promise.all(
          users.map(async (user) => {
            let companyName = user.empresa

            try {
              const trainingRef = doc(db!, 'users', user.id, 'settings', 'ai_training')
              const trainingSnap = await getDoc(trainingRef)
              if (trainingSnap.exists()) {
                const trainingData = trainingSnap.data() as {
                  instructions?: { nomeEmpresa?: string; empresa?: string }
                }
                companyName =
                  trainingData.instructions?.nomeEmpresa ||
                  trainingData.instructions?.empresa ||
                  companyName
              }
            } catch (error) {
              console.error('Erro ao buscar treinamento do usuário:', error)
            }

            const displayName = companyName || user.email || `Usuário ${user.id.slice(0, 6)}`

            return {
              id: user.id,
              name: displayName,
              email: user.email
            }
          })
        )

        setClientOptions(options as ClientOption[])
        setIsLoadingClients(false)
      },
      (error) => {
        console.error('Erro ao buscar usuários:', error)
        setIsLoadingClients(false)
      }
    )

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (clientOptions.length === 0) return

    const currentIsValid = selectedClientId
      ? clientOptions.some((client) => client.id === selectedClientId)
      : false

    if (currentIsValid) return

    if (userIdParam && clientOptions.some((client) => client.id === userIdParam)) {
      setSelectedClientId(userIdParam)
      return
    }

    setSelectedClientId(clientOptions[0].id)
  }, [clientOptions, selectedClientId, userIdParam])

  useEffect(() => {
    if (tabParam === activeTabId && userIdParam === selectedClientId) return

    const next = new URLSearchParams(searchParams.toString())

    if (activeTabId) {
      next.set('tab', activeTabId)
    } else {
      next.delete('tab')
    }

    if (selectedClientId) {
      next.set('userId', selectedClientId)
    } else {
      next.delete('userId')
    }

    const currentQuery = searchParams.toString()
    const nextQuery = next.toString()

    if (currentQuery === nextQuery) return

    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname
    router.replace(nextHref, { scroll: false })
  }, [activeTabId, pathname, router, searchParams, selectedClientId, tabParam, userIdParam])

  useEffect(() => {
    if (!hasSearched) return
    if (!searchQuery.trim()) return
    if (searchResults.length !== 1) return

    const only = searchResults[0]
    if (only && only.id !== selectedClientId) {
      setSelectedClientId(only.id)
    }
  }, [hasSearched, searchQuery, searchResults, selectedClientId])

  const runSearch = () => {
    if (isLoadingClients) return

    const q = searchInput.trim()
    setHasSearched(true)

    if (!q) {
      setSearchQuery('')
      setSearchError('Digite um termo para pesquisar.')
      return
    }

    setSearchError(null)
    setSearchQuery(q)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    setHasSearched(false)
    setSearchError(null)
  }

  return (
    <div className="space-y-8">
      <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-2">Pesquisar usuário</h2>
        <p className="text-gray-400 text-sm mb-4">
          Busque por nome, email ou UID para visualizar as informações em cada aba.
        </p>
        <div className="max-w-md">
          <label className="block text-sm text-gray-300 mb-2" htmlFor="admin-user-search">
            Usuário
          </label>
          <div className="flex items-center gap-2">
            <input
              id="admin-user-search"
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  runSearch()
                }
              }}
              placeholder="Nome, email ou UID..."
              disabled={isLoadingClients || clientOptions.length === 0}
              className="flex-1 bg-surface border border-surface-lighter text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={isLoadingClients || clientOptions.length === 0}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:hover:bg-primary"
            >
              Pesquisar
            </button>
            <button
              type="button"
              onClick={clearSearch}
              disabled={isLoadingClients || (!searchInput && !hasSearched)}
              className="bg-surface border border-surface-lighter text-gray-200 rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-lighter transition-colors disabled:opacity-60"
            >
              Limpar
            </button>
          </div>

          {isLoadingClients && (
            <div className="mt-3 w-full bg-surface border border-surface-lighter text-gray-400 rounded-lg px-3 py-2">
              Carregando usuários...
            </div>
          )}

          {!isLoadingClients && clientOptions.length === 0 && (
            <div className="mt-3 w-full bg-surface border border-surface-lighter text-gray-400 rounded-lg px-3 py-2">
              Nenhum usuário encontrado
            </div>
          )}

          {searchError && <p className="mt-2 text-sm text-red-400">{searchError}</p>}

          {hasSearched && !searchError && searchQuery.trim() && (
            <div className="mt-4 space-y-2">
              <div className="text-sm text-gray-400">
                {searchResults.length === 0
                  ? `Nenhum usuário encontrado para "${searchQuery.trim()}".`
                  : `Resultados: ${Math.min(searchResults.length, SEARCH_RESULTS_LIMIT)} de ${searchResults.length}`}
              </div>
              {searchResults.length > 0 && (
                <div className="w-full bg-surface border border-surface-lighter rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  {searchResults.slice(0, SEARCH_RESULTS_LIMIT).map((client) => {
                    const isSelected = client.id === selectedClientId
                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          if (!isSelected) {
                            setSelectedClientId(client.id)
                          }
                        }}
                        className={`w-full text-left px-3 py-2 border-b border-surface-lighter last:border-b-0 transition-colors ${
                          isSelected
                            ? 'bg-primary/10 text-white'
                            : 'text-gray-200 hover:bg-surface-lighter/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{client.name}</div>
                            <div className="text-xs text-gray-400 truncate">
                              {client.email ? client.email : `UID: ${client.id}`}
                            </div>
                          </div>
                          {isSelected && (
                            <span className="text-xs font-medium text-primary">Selecionado</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {selectedClient && (
          <div className="mt-4 text-sm text-gray-400">
            Usuário selecionado: <span className="text-white font-medium">{selectedClient.name}</span>
          </div>
        )}
      </div>

      {clientOptions.length > 0 && (
        <>
          <div className="bg-surface-light border border-surface-lighter rounded-2xl p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-2">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (!isActive) {
                      setActiveTabId(tab.id)
                    }
                  }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-300 hover:text-white hover:bg-surface'
                  }`}
                >
                  <tab.icon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {activeTabId === 'treinamento' && selectedClientId && (
            <AdminUserTraining userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'leads' && selectedClientId && (
            <AdminUserLeads userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'clientes' && selectedClientId && (
            <AdminUserClients userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'conversas' && selectedClientId && (
            <AdminUserConversations userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'agenda' && selectedClientId && (
            <AdminUserAgenda userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'arquivos' && selectedClientId && (
            <AdminUserArquivos userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'transmissao' && selectedClientId && (
            <AdminUserTransmissao userId={selectedClientId} userName={selectedClient?.name} />
          )}
          {activeTabId === 'financeiro' && selectedClientId && (
            <FinanceiroPanel
              sessionId={selectedClientId}
              title={`Financeiro - ${selectedClient?.name ?? 'Usuario'}`}
              subtitle="Acompanhe o consumo de tokens, custos e métricas do usuário selecionado."
            />
          )}
        </>
      )}
    </div>
  )
}

