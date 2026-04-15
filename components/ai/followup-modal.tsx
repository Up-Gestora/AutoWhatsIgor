'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { useI18n } from '@/lib/i18n/client'

type FollowUpBlockedPayload = {
  error?: string
  reason?: string
  message?: string
}

type FollowUpDraftPayload = {
  draft?: {
    text?: string
  }
}

type FollowUpSendPayload = {
  success?: boolean
}

export type FollowUpModalProps = {
  chatId: string
  sessionId?: string | null
  contactName?: string | null
  onClose: () => void
  onSuccess?: () => void | Promise<void>
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `followup_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

async function fetchWithFirebaseAuth(path: string, init: RequestInit) {
  if (!auth?.currentUser) {
    throw new Error('auth_unavailable')
  }

  const token = await auth.currentUser.getIdToken()
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`
    }
  })
}

export function FollowUpModal({
  chatId,
  sessionId,
  contactName,
  onClose,
  onSuccess
}: FollowUpModalProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey())
  const [text, setText] = useState('')
  const [loadingDraft, setLoadingDraft] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ reason?: string; message?: string } | null>(null)

  const sessionQuery = useMemo(() => {
    const safe = sessionId?.trim()
    return safe ? `?sessionId=${encodeURIComponent(safe)}` : ''
  }, [sessionId])

  const draftUrl = useMemo(() => {
    return `/api/conversations/chats/${encodeURIComponent(chatId)}/ai-followup/draft${sessionQuery}`
  }, [chatId, sessionQuery])

  const sendUrl = useMemo(() => {
    return `/api/conversations/chats/${encodeURIComponent(chatId)}/ai-followup/send${sessionQuery}`
  }, [chatId, sessionQuery])

  const loadDraft = useCallback(async () => {
    setLoadingDraft(true)
    setError(null)
    setBlocked(null)

    try {
      const response = await fetchWithFirebaseAuth(draftUrl, { method: 'POST', cache: 'no-store' })
      const { payload, rawText } = await parseResponsePayload<FollowUpDraftPayload | FollowUpBlockedPayload>(response)

      if (!response.ok) {
        if (response.status === 409 && payload && (payload as FollowUpBlockedPayload).error === 'followup_blocked') {
            const blockedPayload = payload as FollowUpBlockedPayload
            setBlocked({
              reason: blockedPayload.reason,
              message: blockedPayload.message || tr('Follow-up bloqueado.', 'Follow-up blocked.')
            })
            setText('')
            return
        }

        const message = buildHttpErrorMessage(response.status, payload, rawText)
        setError(message)
        return
      }

      const draftText = payload && typeof (payload as FollowUpDraftPayload).draft?.text === 'string'
        ? (payload as FollowUpDraftPayload).draft!.text!
        : ''
      setText(draftText)
    } catch (err: any) {
      console.error('Failed to generate follow-up draft:', err)
      setError(tr('Erro ao gerar rascunho. Tente novamente.', 'Failed to generate draft. Please try again.'))
    } finally {
      setLoadingDraft(false)
    }
  }, [draftUrl, tr])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) {
      setError(tr('A mensagem esta vazia.', 'Message is empty.'))
      return
    }

    setSending(true)
    setError(null)
    setBlocked(null)

    try {
      const response = await fetchWithFirebaseAuth(sendUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ text: trimmed, idempotencyKey }),
        cache: 'no-store'
      })

      const { payload, rawText } = await parseResponsePayload<FollowUpSendPayload | FollowUpBlockedPayload>(response)

      if (!response.ok) {
        if (response.status === 409 && payload && (payload as FollowUpBlockedPayload).error === 'followup_blocked') {
            const blockedPayload = payload as FollowUpBlockedPayload
            setBlocked({
              reason: blockedPayload.reason,
              message: blockedPayload.message || tr('Follow-up bloqueado.', 'Follow-up blocked.')
            })
            return
        }

        const message = buildHttpErrorMessage(response.status, payload, rawText)
        setError(message)
        return
      }

      try {
        await onSuccess?.()
      } catch (callbackError) {
        console.error('Error in follow-up success callback:', callbackError)
      }

      onClose()
    } catch (err: any) {
      console.error('Failed to send follow-up:', err)
      setError(tr('Erro ao enviar follow-up. Tente novamente.', 'Failed to send follow-up. Please try again.'))
    } finally {
      setSending(false)
    }
  }, [idempotencyKey, onClose, onSuccess, sendUrl, text, tr])

  const handleRegenerate = useCallback(async () => {
    setIdempotencyKey(createIdempotencyKey())
    await loadDraft()
  }, [loadDraft])

  const titleName = contactName?.trim()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface-light border border-surface-lighter rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {tr('Follow-up com IA', 'AI follow-up')}{titleName ? ` - ${titleName}` : ''}
              </h3>
              <p className="text-xs text-gray-400">
                {tr('Gere um rascunho, edite e envie pelo WhatsApp.', 'Generate a draft, edit it, and send it via WhatsApp.')}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label={tr('Fechar', 'Close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {blocked?.message && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-200 text-sm p-3 rounded-lg mb-4">
            <p className="font-semibold">{tr('Follow-up bloqueado', 'Follow-up blocked')}</p>
            <p className="mt-1 text-xs text-yellow-100/80">
              {blocked.message}
              {blocked.reason ? ` (${blocked.reason})` : ''}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">{tr('Mensagem', 'Message')}</label>
          {loadingDraft ? (
            <div className="flex items-center gap-2 text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              {tr('Gerando rascunho...', 'Generating draft...')}
            </div>
          ) : (
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={tr('Escreva aqui sua mensagem de follow-up...', 'Write your follow-up message here...')}
              className="min-h-[180px]"
              disabled={sending}
              autoFocus
            />
          )}
          <p className="text-[11px] text-gray-500">
            {tr('Dica: use ', 'Tip: use ')}
            <span className="text-gray-300">[SEPARAR]</span>
            {tr(' para dividir em varias mensagens.', ' to split into multiple messages.')}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="sm:flex-1 bg-surface border-surface-lighter"
            disabled={sending}
          >
            {tr('Cancelar', 'Cancel')}
          </Button>

          <Button
            variant="outline"
            onClick={handleRegenerate}
            className="sm:flex-1 bg-surface border-surface-lighter"
            disabled={loadingDraft || sending}
          >
            {loadingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('Gerar novamente', 'Regenerate')}
          </Button>

          <Button
            onClick={handleSend}
            className="sm:flex-1"
            disabled={loadingDraft || sending || !text.trim() || Boolean(blocked)}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : tr('Enviar', 'Send')}
          </Button>
        </div>
      </div>
    </div>
  )
}
