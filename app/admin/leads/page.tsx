'use client'

import { useState, useEffect } from 'react'
import { 
  Target, 
  Search, 
  Filter, 
  Download, 
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Mail,
  Phone,
  Calendar,
  ExternalLink,
  Loader2
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { 
  collection, 
  addDoc,
  query, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore'
import { cn } from '@/lib/utils'

interface Lead {
  id: string
  name: string
  email?: string
  whatsapp?: string
  source: string
  createdAt: Timestamp | any
}

type LeadDraft = {
  name: string
  email: string
  whatsapp: string
  source: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createDraft, setCreateDraft] = useState<LeadDraft>({
    name: '',
    email: '',
    whatsapp: '',
    source: 'manual'
  })

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<LeadDraft>({
    name: '',
    email: '',
    whatsapp: '',
    source: ''
  })

  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null)

  useEffect(() => {
    if (!db) return

    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData: Lead[] = []
      snapshot.forEach((doc) => {
        leadsData.push({ id: doc.id, ...doc.data() } as Lead)
      })
      setLeads(leadsData)
      setLoading(false)
    }, (error) => {
      console.error("Erro ao buscar leads:", error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

  const normalizeBrazilWhatsapp = (raw: string): string | undefined => {
    const digits = clean(raw).replace(/\D/g, '')
    if (!digits) return undefined

    // Assume Brazil for 10/11-digit local numbers.
    if (digits.startsWith('55')) return digits
    if (digits.length === 10 || digits.length === 11) return `55${digits}`

    // Fallback: keep digits as-is (may already contain a country code).
    return digits
  }

  const validateDraft = (draft: LeadDraft) => {
    const name = clean(draft.name)
    if (name.length < 2 || name.length > 80) {
      return { ok: false as const, error: 'Nome invalido (2-80 caracteres).' }
    }

    const email = clean(draft.email)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false as const, error: 'Email invalido.' }
    }

    const source = clean(draft.source) || 'manual'
    const whatsapp = normalizeBrazilWhatsapp(draft.whatsapp)

    return { ok: true as const, value: { name, email, whatsapp, source } }
  }

  const handleCreateLead = async () => {
    if (!db) return

    setCreateError(null)
    const validated = validateDraft(createDraft)
    if (!validated.ok) {
      setCreateError(validated.error)
      return
    }

    const { name, email, whatsapp, source } = validated.value

    setCreating(true)
    try {
      await addDoc(collection(db, 'leads'), {
        name,
        // Firestore rules require `email != null` on create.
        email: email ?? '',
        ...(whatsapp ? { whatsapp } : {}),
        source,
        createdAt: serverTimestamp()
      })

      setCreateDraft({ name: '', email: '', whatsapp: '', source: 'manual' })
      setCreateOpen(false)
    } catch (error) {
      console.error('Erro ao criar lead:', error)
      setCreateError('Falha ao criar lead. Verifique permissão e tente novamente.')
    } finally {
      setCreating(false)
    }
  }

  const handleStartEdit = (lead: Lead) => {
    setEditError(null)
    setEditingLeadId(lead.id)
    setEditDraft({
      name: clean(lead.name),
      email: clean(lead.email),
      whatsapp: clean(lead.whatsapp),
      source: clean(lead.source) || 'manual'
    })
  }

  const handleCancelEdit = () => {
    setEditingLeadId(null)
    setSavingEdit(false)
    setEditError(null)
    setEditDraft({ name: '', email: '', whatsapp: '', source: '' })
  }

  const handleSaveEdit = async (leadId: string) => {
    if (!db) return

    setEditError(null)
    const validated = validateDraft(editDraft)
    if (!validated.ok) {
      setEditError(validated.error)
      return
    }

    const { name, email, whatsapp, source } = validated.value

    setSavingEdit(true)
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        name,
        email: email ?? '',
        whatsapp: whatsapp ?? null,
        source
      })
      handleCancelEdit()
    } catch (error) {
      console.error('Erro ao atualizar lead:', error)
      setEditError('Falha ao salvar alteracoes.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    if (!db) return

    const confirmed = window.confirm('Excluir este lead? Esta ação não pode ser desfeita.')
    if (!confirmed) return

    setDeletingLeadId(leadId)
    try {
      await deleteDoc(doc(db, 'leads', leadId))
    } catch (error) {
      console.error('Erro ao excluir lead:', error)
      window.alert('Falha ao excluir lead.')
    } finally {
      setDeletingLeadId(null)
    }
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp)
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  const formatWhatsApp = (phone?: string) => {
    if (!phone) return 'N/A'
    const cleaned = phone.replace(/\D/g, '')
    const br = cleaned.startsWith('55') ? cleaned.slice(2) : cleaned
    if (br.length === 11) {
      return `(${br.substring(0, 2)}) ${br.substring(2, 7)}-${br.substring(7)}`
    }
    if (br.length === 10) {
      return `(${br.substring(0, 2)}) ${br.substring(2, 6)}-${br.substring(6)}`
    }
    return cleaned || phone
  }

  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lead.email ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (lead.whatsapp && lead.whatsapp.includes(searchTerm))
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-gray-400 animate-pulse">Carregando leads...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Target className="w-8 h-8 text-primary" /> CRM de Leads
          </h1>
          <p className="text-gray-400 mt-1">
            Total de {leads.length} leads capturados na Landing Page.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCreateError(null)
              setCreateOpen((prev) => !prev)
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border rounded-lg transition-all",
              createOpen
                ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary/25"
                : "bg-surface-light border-surface-lighter text-gray-300 hover:text-white hover:bg-surface-lighter"
            )}
          >
            <Plus className="w-4 h-4" /> Novo lead
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-surface-light border border-surface-lighter rounded-lg text-gray-300 hover:text-white hover:bg-surface-lighter transition-all">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Create */}
      {createOpen && (
        <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Criar lead manualmente
            </h2>
            <button
              onClick={() => {
                setCreateOpen(false)
                setCreateError(null)
              }}
              className="p-2 text-gray-400 hover:text-white hover:bg-surface-lighter rounded-lg transition-all"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Nome</label>
              <input
                type="text"
                value={createDraft.name}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-surface border border-surface-lighter rounded-xl py-2 px-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                placeholder="Ex: Joao Silva"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Email (opcional)</label>
              <input
                type="email"
                value={createDraft.email}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full bg-surface border border-surface-lighter rounded-xl py-2 px-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                placeholder="Ex: joao@empresa.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">WhatsApp (opcional)</label>
              <input
                type="text"
                value={createDraft.whatsapp}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, whatsapp: e.target.value }))}
                className="w-full bg-surface border border-surface-lighter rounded-xl py-2 px-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                placeholder="Ex: (11) 99999-9999"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-500">Origem</label>
              <input
                type="text"
                value={createDraft.source}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, source: e.target.value }))}
                className="w-full bg-surface border border-surface-lighter rounded-xl py-2 px-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                placeholder="manual"
              />
            </div>
          </div>

          {createError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {createError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setCreateOpen(false)
                setCreateError(null)
              }}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 bg-surface border border-surface-lighter rounded-xl text-gray-300 hover:text-white hover:bg-surface-lighter transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button
              onClick={handleCreateLead}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 bg-primary/90 border border-primary/40 rounded-xl text-black hover:bg-primary transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Filters/Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text"
            placeholder="Buscar por nome, email ou WhatsApp..."
            className="w-full bg-surface-light border border-surface-lighter rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-surface-light border border-surface-lighter rounded-xl text-gray-400 hover:text-white transition-all">
          <Filter className="w-4 h-4" /> Filtros
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-surface-light border border-surface-lighter rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-lighter bg-surface-lighter/30">
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Lead</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Contato</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Origem</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300">Data de Captura</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-300 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-lighter">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="group hover:bg-surface-lighter/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/20">
                          {lead.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          {editingLeadId === lead.id ? (
                            <input
                              type="text"
                              value={editDraft.name}
                              onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                              className="w-full bg-surface border border-surface-lighter rounded-lg py-1.5 px-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                              placeholder="Nome"
                            />
                          ) : (
                            <p className="text-white font-medium group-hover:text-primary transition-colors">{lead.name}</p>
                          )}
                          <p className="text-xs text-gray-500">ID: {lead.id.substring(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-1">
                      {editingLeadId === lead.id ? (
                        <div className="space-y-2">
                          <input
                            type="email"
                            value={editDraft.email}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, email: e.target.value }))}
                            className="w-full bg-surface border border-surface-lighter rounded-lg py-1.5 px-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="Email"
                          />
                          <input
                            type="text"
                            value={editDraft.whatsapp}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, whatsapp: e.target.value }))}
                            className="w-full bg-surface border border-surface-lighter rounded-lg py-1.5 px-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            placeholder="WhatsApp"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <Mail className="w-3.5 h-3.5 text-gray-500" />
                            {(lead.email ?? '').trim() ? lead.email : 'Sem email'}
                          </div>
                          {lead.whatsapp && (
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Phone className="w-3.5 h-3.5 text-gray-500" />
                              {formatWhatsApp(lead.whatsapp)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingLeadId === lead.id ? (
                        <input
                          type="text"
                          value={editDraft.source}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, source: e.target.value }))}
                          className="w-full bg-surface border border-surface-lighter rounded-lg py-1.5 px-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                          placeholder="Origem"
                        />
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {lead.source === 'landing_page'
                            ? 'Landing Page'
                            : lead.source === 'landing_v2'
                              ? 'Landing V2'
                              : lead.source}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Calendar className="w-4 h-4" />
                        {formatDate(lead.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center justify-end gap-2">
                          {editingLeadId === lead.id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(lead.id)}
                                disabled={savingEdit}
                                className="p-2 text-gray-300 hover:text-white hover:bg-surface-lighter rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                                title="Salvar"
                              >
                                {savingEdit ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Save className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={savingEdit}
                                className="p-2 text-gray-400 hover:text-white hover:bg-surface-lighter rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                                title="Cancelar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              {lead.whatsapp && (
                                <a 
                                  href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-400/10 rounded-lg transition-all"
                                  title="Abrir no WhatsApp"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => handleStartEdit(lead)}
                                className="p-2 text-gray-400 hover:text-white hover:bg-surface-lighter rounded-lg transition-all"
                                title="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLead(lead.id)}
                                disabled={deletingLeadId === lead.id}
                                className={cn(
                                  "p-2 rounded-lg transition-all",
                                  deletingLeadId === lead.id
                                    ? "text-gray-600 pointer-events-none"
                                    : "text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                                )}
                                title="Excluir"
                              >
                                {deletingLeadId === lead.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </>
                          )}
                        </div>

                        {editingLeadId === lead.id && editError && (
                          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 max-w-[260px] text-left">
                            {editError}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Target className="w-12 h-12 text-gray-600 mb-2" />
                      <p className="text-lg font-medium text-white">Nenhum lead encontrado</p>
                      <p className="text-gray-500 max-w-xs mx-auto">
                        Tente ajustar seus filtros ou aguarde novas capturas na sua landing page.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer info */}
        <div className="px-6 py-4 border-t border-surface-lighter bg-surface-lighter/10">
          <p className="text-xs text-gray-500">
            * Dados atualizados em tempo real via Firestore Sync.
          </p>
        </div>
      </div>
    </div>
  )
}
