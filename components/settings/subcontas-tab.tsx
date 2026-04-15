'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Pencil, Plus, Trash2, UserPlus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { useI18n } from '@/lib/i18n/client'
import { cn } from '@/lib/utils'

type Subaccount = {
  uid: string
  email: string
  nome?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type MessageState = {
  type: 'success' | 'error'
  text: string
}

type SubaccountSettings = {
  quickRepliesCrud: boolean
}

const MAX_SUBACCOUNTS = 10

function formatApiError(raw: string | undefined, tr: (pt: string, en: string) => string): string {
  const code = (raw ?? '').trim().toLowerCase()
  if (!code) {
    return 'Request failed.'
  }

  if (code === 'subaccounts_limit_reached') {
    return tr('Você atingiu o limite de 10 sub-contas.', 'You reached the 10 sub-accounts limit.')
  }
  if (code === 'email_required') {
    return tr('Informe o e-mail da sub-conta.', 'Enter sub-account email.')
  }
  if (code === 'password_required') {
    return tr('Informe a senha da sub-conta.', 'Enter sub-account password.')
  }
  if (code === 'password_too_short') {
    return tr('A senha precisa ter pelo menos 6 caracteres.', 'Password must have at least 6 characters.')
  }
  if (code === 'invalid_email') {
    return tr('E-mail inválido.', 'Invalid email.')
  }
  if (code === 'email_already_exists') {
    return tr('Já existe usuário com este e-mail.', 'A user with this email already exists.')
  }
  if (code === 'subaccount_not_found') {
    return tr('Sub-conta não encontrada.', 'Sub-account not found.')
  }
  if (code === 'subaccount_update_required') {
    return tr('Nenhum campo foi alterado.', 'No fields were changed.')
  }
  if (code === 'subaccount_forbidden') {
    return tr('Somente a conta principal pode gerenciar sub-contas.', 'Only the main account can manage sub-accounts.')
  }
  if (code === 'quick_replies_crud_invalid') {
    return tr('Valor inválido para a permissão de respostas rápidas.', 'Invalid value for quick replies permission.')
  }
  if (code === 'owner_uid_required') {
    return tr('Conta principal inválida para salvar permissões.', 'Invalid owner account to save permissions.')
  }
  if (code === 'subaccounts_settings_request_failed') {
    return tr('Falha ao salvar configurações de sub-contas.', 'Failed to save sub-account settings.')
  }

  return code.replace(/_/g, ' ')
}

function sortByCreatedAt(list: Subaccount[]): Subaccount[] {
  const copy = [...list]
  copy.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
    return aTime - bTime
  })
  return copy
}

export function SubcontasTab() {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const [subaccounts, setSubaccounts] = useState<Subaccount[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingUid, setDeletingUid] = useState<string | null>(null)
  const [message, setMessage] = useState<MessageState | null>(null)
  const [quickRepliesCrudEnabled, setQuickRepliesCrudEnabled] = useState(false)
  const [loadingQuickRepliesCrudSetting, setLoadingQuickRepliesCrudSetting] = useState(true)
  const [savingQuickRepliesCrudSetting, setSavingQuickRepliesCrudSetting] = useState(false)

  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    nome: ''
  })

  const [editForm, setEditForm] = useState({
    email: '',
    password: '',
    nome: ''
  })

  const count = subaccounts.length
  const canCreate = count < MAX_SUBACCOUNTS

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
      },
      cache: 'no-store'
    })

    const { payload, rawText } = await parseResponsePayload<T>(response)
    if (!response.ok) {
      const code = buildHttpErrorMessage(response.status, payload, rawText)
      throw new Error(code)
    }

    return (payload ?? ({} as T)) as T
  }, [])

  const loadSubaccounts = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const payload = await fetchWithAuth<{ subaccounts?: Subaccount[] }>('/api/subaccounts')
      const list = Array.isArray(payload?.subaccounts) ? payload.subaccounts : []
      setSubaccounts(sortByCreatedAt(list))
    } catch (error) {
      setMessage({
        type: 'error',
        text: formatApiError(error instanceof Error ? error.message : 'subaccounts_load_failed', tr)
      })
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, tr])

  const loadSubaccountSettings = useCallback(async () => {
    setLoadingQuickRepliesCrudSetting(true)
    try {
      const payload = await fetchWithAuth<{ settings?: SubaccountSettings }>('/api/subaccounts/settings')
      setQuickRepliesCrudEnabled(payload?.settings?.quickRepliesCrud === true)
    } catch (error) {
      setQuickRepliesCrudEnabled(false)
      setMessage({
        type: 'error',
        text: formatApiError(error instanceof Error ? error.message : 'subaccounts_settings_request_failed', tr)
      })
    } finally {
      setLoadingQuickRepliesCrudSetting(false)
    }
  }, [fetchWithAuth, tr])

  useEffect(() => {
    void loadSubaccounts()
    void loadSubaccountSettings()
  }, [loadSubaccountSettings, loadSubaccounts])

  const handleQuickRepliesCrudToggle = async (checked: boolean) => {
    const previous = quickRepliesCrudEnabled
    setQuickRepliesCrudEnabled(checked)
    setSavingQuickRepliesCrudSetting(true)
    setMessage(null)

    try {
      const payload = await fetchWithAuth<{ settings?: SubaccountSettings }>('/api/subaccounts/settings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          quickRepliesCrud: checked
        })
      })
      const persisted = payload?.settings?.quickRepliesCrud === true
      setQuickRepliesCrudEnabled(persisted)
      setMessage({
        type: 'success',
        text: persisted
          ? tr(
              'Sub-contas agora podem criar, editar e excluir respostas rápidas.',
              'Sub-accounts can now create, edit, and delete quick replies.'
            )
          : tr(
              'Sub-contas não podem mais criar, editar e excluir respostas rápidas.',
              'Sub-accounts can no longer create, edit, and delete quick replies.'
            )
      })
    } catch (error) {
      setQuickRepliesCrudEnabled(previous)
      setMessage({
        type: 'error',
        text: formatApiError(error instanceof Error ? error.message : 'subaccounts_settings_request_failed', tr)
      })
    } finally {
      setSavingQuickRepliesCrudSetting(false)
    }
  }

  const resetCreateForm = () => {
    setCreateForm({
      email: '',
      password: '',
      nome: ''
    })
  }

  const handleCreate = async () => {
    const email = createForm.email.trim().toLowerCase()
    const password = createForm.password.trim()
    const nome = createForm.nome.trim()

    if (!email) {
      setMessage({ type: 'error', text: tr('Informe o e-mail da sub-conta.', 'Enter sub-account email.') })
      return
    }
    if (!password) {
      setMessage({ type: 'error', text: tr('Informe a senha da sub-conta.', 'Enter sub-account password.') })
      return
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: tr('A senha precisa ter pelo menos 6 caracteres.', 'Password must have at least 6 characters.') })
      return
    }

    setCreating(true)
    setMessage(null)
    try {
      const payload = await fetchWithAuth<{ subaccount?: Subaccount }>('/api/subaccounts', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          ...(nome ? { nome } : {})
        })
      })

      const created = payload?.subaccount
      if (created) {
        setSubaccounts((prev) => sortByCreatedAt([...prev, created]))
      } else {
        await loadSubaccounts()
      }

      resetCreateForm()
      setMessage({ type: 'success', text: tr('Sub-conta criada com sucesso.', 'Sub-account created successfully.') })
    } catch (error) {
      setMessage({
        type: 'error',
        text: formatApiError(error instanceof Error ? error.message : 'subaccount_create_failed', tr)
      })
    } finally {
      setCreating(false)
    }
  }

  const beginEdit = (subaccount: Subaccount) => {
    setEditingUid(subaccount.uid)
    setEditForm({
      email: subaccount.email,
      password: '',
      nome: subaccount.nome ?? ''
    })
    setMessage(null)
  }

  const cancelEdit = () => {
    setEditingUid(null)
    setEditForm({ email: '', password: '', nome: '' })
  }

  const handleSaveEdit = async (subaccount: Subaccount) => {
    const email = editForm.email.trim().toLowerCase()
    const password = editForm.password.trim()
    const nome = editForm.nome.trim()

    if (!email) {
      setMessage({ type: 'error', text: tr('Informe o e-mail da sub-conta.', 'Enter sub-account email.') })
      return
    }
    if (password && password.length < 6) {
      setMessage({ type: 'error', text: tr('A senha precisa ter pelo menos 6 caracteres.', 'Password must have at least 6 characters.') })
      return
    }

    const sameEmail = email === subaccount.email
    const currentNome = (subaccount.nome ?? '').trim()
    const sameNome = nome === currentNome
    const hasPassword = Boolean(password)

    if (sameEmail && sameNome && !hasPassword) {
      cancelEdit()
      return
    }

    setSavingEdit(true)
    setMessage(null)

    try {
      const payload = await fetchWithAuth<{ subaccount?: Subaccount }>(
        `/api/subaccounts/${encodeURIComponent(subaccount.uid)}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            email,
            ...(hasPassword ? { password } : {}),
            nome: nome || null
          })
        }
      )

      const updated = payload?.subaccount
      setSubaccounts((prev) =>
        prev.map((entry) => {
          if (entry.uid !== subaccount.uid) {
            return entry
          }

          if (updated) {
            return {
              ...entry,
              ...updated,
              email: updated.email ?? email,
              nome: updated.nome ?? null
            }
          }

          return {
            ...entry,
            email,
            nome: nome || null
          }
        })
      )

      cancelEdit()
      setMessage({ type: 'success', text: tr('Sub-conta atualizada com sucesso.', 'Sub-account updated successfully.') })
    } catch (error) {
      setMessage({
        type: 'error',
        text: formatApiError(error instanceof Error ? error.message : 'subaccount_update_failed', tr)
      })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async (subaccount: Subaccount) => {
    const confirmed = confirm(
      isEn ? `Delete sub-account ${subaccount.email}?` : `Excluir a sub-conta ${subaccount.email}?`
    )
    if (!confirmed) {
      return
    }

    setDeletingUid(subaccount.uid)
    setMessage(null)

    try {
      await fetchWithAuth(`/api/subaccounts/${encodeURIComponent(subaccount.uid)}`, {
        method: 'DELETE'
      })

      setSubaccounts((prev) => prev.filter((entry) => entry.uid !== subaccount.uid))
      if (editingUid === subaccount.uid) {
        cancelEdit()
      }
      setMessage({ type: 'success', text: tr('Sub-conta excluída com sucesso.', 'Sub-account deleted successfully.') })
    } catch (error) {
      setMessage({
        type: 'error',
        text: formatApiError(error instanceof Error ? error.message : 'subaccount_delete_failed', tr)
      })
    } finally {
      setDeletingUid(null)
    }
  }

  const sortedSubaccounts = useMemo(() => sortByCreatedAt(subaccounts), [subaccounts])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            {tr('Sub-contas', 'Sub-accounts')}
          </h2>
          <p className="text-sm text-gray-400">
            {tr(
              'Crie acessos para colaboradores com permissão somente em Conversas.',
              'Create access for teammates with Conversations-only permission.'
            )}
          </p>
        </div>

        <div className="inline-flex items-center rounded-xl border border-surface-lighter bg-surface px-3 py-2 text-sm text-gray-300">
          {count}/{MAX_SUBACCOUNTS}
        </div>
      </div>

      {message ? (
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl px-4 py-3 text-sm',
            message.type === 'success' ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-300'
          )}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {message.text}
        </div>
      ) : null}

      <div className="rounded-2xl border border-surface-lighter bg-surface p-4 space-y-3">
        <p className="text-sm font-semibold text-white">{tr('Criar sub-conta', 'Create sub-account')}</p>

        <div className="grid gap-3 md:grid-cols-3">
          <Input
            value={createForm.nome}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, nome: event.target.value }))}
            placeholder={tr('Nome (opcional)', 'Name (optional)')}
            disabled={!canCreate || creating}
          />
          <Input
            type="email"
            value={createForm.email}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="email@empresa.com"
            disabled={!canCreate || creating}
          />
          <Input
            type="password"
            value={createForm.password}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder={tr('Senha (min. 6)', 'Password (min. 6)')}
            disabled={!canCreate || creating}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
              {tr(
              'A sub-conta poderá acessar apenas /dashboard/conversas e somente chats atribuídos.',
              'Sub-account can only access /dashboard/conversations and assigned chats.'
            )}
          </p>
          <Button type="button" onClick={() => void handleCreate()} disabled={!canCreate || creating}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            {tr('Criar', 'Create')}
          </Button>
        </div>

        {!canCreate ? (
          <p className="text-xs text-yellow-300">{tr('Limite de 10 sub-contas atingido.', '10 sub-account limit reached.')}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">{tr('Permissões de respostas rápidas', 'Quick replies permissions')}</p>
            <p className="text-xs text-gray-400">
              {tr(
                'Permitir que as sub-contas criem, editem e excluam respostas rápidas?',
                'Allow sub-accounts to create, edit, and delete quick replies?'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loadingQuickRepliesCrudSetting || savingQuickRepliesCrudSetting ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : null}
            <Switch
              checked={quickRepliesCrudEnabled}
              onCheckedChange={(checked) => {
                void handleQuickRepliesCrudToggle(checked)
              }}
              disabled={loadingQuickRepliesCrudSetting || savingQuickRepliesCrudSetting}
              aria-label={tr(
                'Permitir CRUD de respostas rápidas para sub-contas',
                'Allow quick replies CRUD for sub-accounts'
              )}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-lighter bg-surface-light">
        <div className="grid grid-cols-12 gap-3 border-b border-surface-lighter px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
          <span className="col-span-4">{tr('Nome', 'Name')}</span>
          <span className="col-span-4">Email</span>
          <span className="col-span-2">{tr('Atualizado', 'Updated')}</span>
                <span className="col-span-2 text-right">{tr('Ações', 'Actions')}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {tr('Carregando sub-contas...', 'Loading sub-accounts...')}
          </div>
        ) : sortedSubaccounts.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">{tr('Nenhuma sub-conta criada.', 'No sub-account created.')}</div>
        ) : (
          <div className="divide-y divide-surface-lighter">
            {sortedSubaccounts.map((subaccount) => {
              const isEditing = editingUid === subaccount.uid
              const isDeleting = deletingUid === subaccount.uid
              const updatedLabel = subaccount.updatedAt
                ? new Date(subaccount.updatedAt).toLocaleDateString(isEn ? 'en-US' : 'pt-BR')
                : '--'

              return (
                <div key={subaccount.uid} className="px-4 py-3">
                  {isEditing ? (
                    <div className="grid gap-3 md:grid-cols-12 md:items-center">
                      <Input
                        value={editForm.nome}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, nome: event.target.value }))}
                        placeholder={tr('Nome (opcional)', 'Name (optional)')}
                        className="md:col-span-3"
                        disabled={savingEdit}
                      />
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="Email"
                        className="md:col-span-4"
                        disabled={savingEdit}
                      />
                      <Input
                        type="password"
                        value={editForm.password}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
                        placeholder={tr('Nova senha (opcional)', 'New password (optional)')}
                        className="md:col-span-3"
                        disabled={savingEdit}
                      />
                      <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleSaveEdit(subaccount)}
                          disabled={savingEdit}
                        >
                          {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('Salvar', 'Save')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                        >
                          {tr('Cancelar', 'Cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-4 min-w-0">
                        <p className="truncate text-sm font-medium text-white">{subaccount.nome || '--'}</p>
                      </div>
                      <div className="col-span-4 min-w-0">
                        <p className="truncate text-sm text-gray-300">{subaccount.email}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">{updatedLabel}</p>
                      </div>
                      <div className="col-span-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => beginEdit(subaccount)}
                          disabled={Boolean(editingUid) || isDeleting}
                          className="gap-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {tr('Editar', 'Edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(subaccount)}
                          disabled={isDeleting || savingEdit}
                          className="gap-1 border-red-500/40 text-red-300 hover:bg-red-500/10"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          {tr('Excluir', 'Delete')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
