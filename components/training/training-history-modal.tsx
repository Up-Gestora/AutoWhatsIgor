'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Loader2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { db } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { listTrainingVersions, type TrainingVersionDoc } from '@/lib/training/versioning'

export type TrainingHistoryModalProps = {
  userId: string
  currentSnapshotKey: string
  onRestore: (version: TrainingVersionDoc) => Promise<void>
  onClose: () => void
}

function formatDateTime(ms: number, locale: 'pt-BR' | 'en') {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString()
  }
}

function reasonLabel(reason: TrainingVersionDoc['reason'], isEn: boolean) {
  if (reason === 'baseline') return isEn ? 'Initial' : 'Inicial'
  if (reason === 'manual') return isEn ? 'Manual' : 'Manual'
  if (reason === 'autosave_checkpoint') return isEn ? 'Checkpoint' : 'Checkpoint'
  if (reason === 'revert') return isEn ? 'Restored' : 'Restaurado'
  return reason
}

export function TrainingHistoryModal({ userId, currentSnapshotKey, onRestore, onClose }: TrainingHistoryModalProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])

  const [loading, setLoading] = useState(true)
  const [versions, setVersions] = useState<TrainingVersionDoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<TrainingVersionDoc | null>(null)
  const [restoring, setRestoring] = useState(false)

  const canUseFirestore = Boolean(db && userId)

  const load = useCallback(async () => {
    if (!db) {
      setError(tr('Firestore não inicializado.', 'Firestore is not initialized.'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const list = await listTrainingVersions(db, userId, 50)
      setVersions(list)
    } catch (err: any) {
      console.error('Erro ao carregar histórico de treinamento:', err)
      setError(tr('Erro ao carregar histórico. Tente novamente.', 'Failed to load history. Please try again.'))
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [tr, userId])

  useEffect(() => {
    void load()
  }, [load])

  const currentId = useMemo(() => {
    const match = versions.find((item) => item.snapshotKey === currentSnapshotKey)
    return match?.id ?? null
  }, [currentSnapshotKey, versions])

  const handleConfirmRestore = useCallback(async () => {
    if (!confirming) return
    setRestoring(true)
    setError(null)
    try {
      await onRestore(confirming)
      onClose()
    } catch (err: any) {
      console.error('Erro ao restaurar versão:', err)
      setError(err?.message ? String(err.message) : tr('Erro ao restaurar versão. Tente novamente.', 'Failed to restore version. Please try again.'))
    } finally {
      setRestoring(false)
      setConfirming(null)
    }
  }, [confirming, onClose, onRestore, tr])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-surface-lighter bg-surface-light p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div>
            <h3 className="text-xl font-bold text-white">{tr('Histórico de treinamento', 'Training history')}</h3>
              <p className="text-xs text-gray-400">{tr('Restaure uma versão anterior do seu treinamento.', 'Restore a previous version of your training.')}</p>
            </div>
          </div>

          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label={tr('Fechar', 'Close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {!canUseFirestore && (
          <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
            {tr('Firestore não disponível.', 'Firestore unavailable.')}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {confirming && (
          <div className="mb-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
            <p className="font-semibold">{tr('Confirmar restauração', 'Confirm restore')}</p>
            <p className="mt-1 text-xs text-yellow-100/80">
              {tr(
                'Isso vai substituir seu treinamento atual e sincronizar com a IA. Continuar?',
                'This will replace your current training and sync with AI. Continue?'
              )}
            </p>
            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setConfirming(null)}
                className="border-surface-lighter bg-surface sm:flex-1"
                disabled={restoring}
              >
                {tr('Cancelar', 'Cancel')}
              </Button>
              <Button onClick={() => void handleConfirmRestore()} className="gap-2 sm:flex-1" disabled={restoring}>
                {restoring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tr('Restaurando...', 'Restoring...')}
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    {tr('Restaurar versão', 'Restore version')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">{loading ? tr('Carregando...', 'Loading...') : `${versions.length} ${tr('versão(oes)', 'version(s)')}`}</p>
          <Button
            variant="outline"
            onClick={() => void load()}
            className="border-surface-lighter bg-surface"
            disabled={loading || restoring || !canUseFirestore}
          >
            {tr('Atualizar', 'Refresh')}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr('Carregando histórico...', 'Loading history...')}
          </div>
        ) : versions.length === 0 ? (
          <div className="rounded-xl border border-surface-lighter bg-surface p-4 text-sm text-gray-400">
            {tr('Nenhuma versão encontrada. Use ', 'No version found. Use ')}
            <span className="text-gray-200">{tr('Salvar configurações', 'Save settings')}</span>
            {tr(' para criar uma versão.', ' to create a version.')}
          </div>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => {
              const isCurrent = version.snapshotKey === currentSnapshotKey || version.id === currentId
              return (
                <div
                  key={version.id}
                  className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                    isCurrent ? 'border-primary bg-primary/5' : 'border-surface-lighter bg-surface'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{formatDateTime(version.createdAtMs, locale)}</span>
                      <span className="rounded-full border border-white/10 bg-surface-lighter px-2 py-0.5 text-[10px] text-gray-300">
                        {reasonLabel(version.reason, isEn)}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                          {tr('Atual', 'Current')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {tr('Modelo', 'Model')}: <span className="text-gray-300">{version.model}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setConfirming(version)}
                      className="border-surface-lighter bg-surface"
                      disabled={restoring || loading || isCurrent || !canUseFirestore}
                    >
                      {tr('Restaurar', 'Restore')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
