'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Files, Loader2, Trash2, Edit2, Save, X, UploadCloud } from 'lucide-react'
import { db, storage } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/client'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey,
} from '@/lib/onboarding/guided-tutorials'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'

type ArquivoTipo = 'image' | 'video' | 'audio' | 'document'

type ArquivoRecord = {
  id: string
  nome: string
  descricao: string
  quandoUsar: string
  tipo: ArquivoTipo
  mimeType: string
  sizeBytes: number
  storagePath: string
  downloadUrl: string
  createdAtMs: number | null
  updatedAtMs: number | null
}

const MAX_FILE_SIZE_BYTES = 16 * 1024 * 1024
const GUIDED_DEMO_FILE_ID = '__guided_demo_file__'

type GuidedStepTarget = 'upload_fields' | 'when_to_use' | 'upload_button' | 'library'

type GuidedStep = {
  id: string
  target: GuidedStepTarget
  title: string
  description: string
}

function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (typeof value === 'object') {
    const asAny = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number }
    if (typeof asAny.toMillis === 'function') return asAny.toMillis()
    if (typeof asAny.seconds === 'number') {
      const nanos = typeof asAny.nanoseconds === 'number' ? asAny.nanoseconds : 0
      return asAny.seconds * 1000 + Math.floor(nanos / 1e6)
    }
  }
  return null
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = value
  let unit = 0
  while (v >= 1024 && unit < units.length - 1) {
    v /= 1024
    unit += 1
  }
  return `${v.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatDateTime(ms: number | null, locale: 'pt-BR' | 'en-US') {
  if (!ms) return '--'
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms))
  } catch {
    return '--'
  }
}

function resolveTipoFromMime(mime: string, filename?: string): ArquivoTipo | null {
  const normalized = (mime || '').toLowerCase().trim()
  if (normalized === 'application/pdf') return 'document'
  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('video/')) return 'video'
  if (normalized.startsWith('audio/')) return 'audio'
  if (!normalized && (filename || '').toLowerCase().trim().endsWith('.pdf')) return 'document'
  return null
}

function stripExtension(filename: string) {
  const idx = filename.lastIndexOf('.')
  if (idx <= 0) return filename
  return filename.slice(0, idx)
}

interface ArquivosPanelProps {
  sessionId: string | null
}

export function ArquivosPanel({ sessionId }: ArquivosPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const safeSessionId = sessionId?.trim() || null
  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'files'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt, GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en)
    : null

  const [arquivos, setArquivos] = useState<ArquivoRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [quandoUsar, setQuandoUsar] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editDescricao, setEditDescricao] = useState('')
  const [editQuandoUsar, setEditQuandoUsar] = useState('')
  const [editingBusy, setEditingBusy] = useState(false)
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [guidedStep, setGuidedStep] = useState(0)
  const [guidedCompletionModalOpen, setGuidedCompletionModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)

  const canUseFirebase = Boolean(safeSessionId && db && storage)
  const guidedSuppressAutoOpenRef = useRef(false)
  const guidedSnapshotRef = useRef<{
    nome: string
    descricao: string
    quandoUsar: string
    selectedFile: File | null
  } | null>(null)
  const uploadFieldsRef = useRef<HTMLDivElement | null>(null)
  const whenToUseRef = useRef<HTMLDivElement | null>(null)
  const uploadButtonRef = useRef<HTMLButtonElement | null>(null)
  const libraryRef = useRef<HTMLDivElement | null>(null)

  const guidedSteps = useMemo<GuidedStep[]>(
    () => [
      {
        id: 'upload_fields',
        target: 'upload_fields',
        title: tr('Etapa 1: Dados do arquivo', 'Step 1: File details'),
        description: tr(
          'Nesta área você escolhe o arquivo e preenche Nome e Descrição para organizar sua biblioteca.',
          'In this area you select the file and fill Name and Description to organize your library.'
        ),
      },
      {
        id: 'when_to_use',
        target: 'when_to_use',
        title: tr('Etapa 2: Quando a IA vai usar', 'Step 2: When AI should use it'),
        description: tr(
          'Defina claramente em quais situações a IA deve enviar este arquivo ao cliente.',
          'Clearly define in which situations AI should send this file to the customer.'
        ),
      },
      {
        id: 'upload_button',
        target: 'upload_button',
        title: tr('Etapa 3: Botão Enviar', 'Step 3: Upload button'),
        description: tr(
          'Ao clicar em Enviar, o arquivo é salvo e passa a aparecer na biblioteca de "Meus arquivos".',
          'When you click Upload, the file is saved and appears in the "My files" library.'
        ),
      },
      {
        id: 'library',
        target: 'library',
        title: tr('Etapa 4: Biblioteca de arquivos', 'Step 4: Files library'),
        description: tr(
          'Aqui ficam os arquivos salvos para uso da operação e da IA. Neste tutorial mostramos um arquivo demo temporário.',
          'Saved files for operations and AI usage appear here. In this tutorial we show a temporary demo file.'
        ),
      },
    ],
    [tr]
  )
  const lastGuidedStepIndex = guidedSteps.length - 1
  const currentGuidedStep = guidedSteps[guidedStep] ?? guidedSteps[0]

  const guidedDemoFile = useMemo<ArquivoRecord>(
    () => ({
      id: GUIDED_DEMO_FILE_ID,
      nome: tr('Catálogo Demo', 'Demo Catalog'),
      descricao: tr(
        'Arquivo fictício para demonstração do onboarding. Não é salvo no banco.',
        'Mock file for onboarding demonstration. It is not stored in the database.'
      ),
      quandoUsar: tr(
        'Usar quando o cliente pedir catálogo, preços, planos ou tabela comparativa.',
        'Use when the customer asks for catalog, prices, plans, or a comparison table.'
      ),
      tipo: 'document',
      mimeType: 'application/pdf',
      sizeBytes: 312_000,
      storagePath: '',
      downloadUrl: '',
      createdAtMs: Date.now() - 20 * 60 * 1000,
      updatedAtMs: Date.now() - 5 * 60 * 1000,
    }),
    [tr]
  )

  const displayArquivos = useMemo(() => {
    if (!guidedOpen) return arquivos
    const withoutDemo = arquivos.filter((arquivo) => arquivo.id !== GUIDED_DEMO_FILE_ID)
    return [guidedDemoFile, ...withoutDemo]
  }, [arquivos, guidedDemoFile, guidedOpen])

  useEffect(() => {
    setPortalReady(true)
  }, [])

  const resolveGuidedTargetElement = useCallback((target: GuidedStepTarget) => {
    if (target === 'upload_fields') return uploadFieldsRef.current
    if (target === 'when_to_use') return whenToUseRef.current
    if (target === 'upload_button') return uploadButtonRef.current
    return libraryRef.current
  }, [])

  const isGuidedTargetActive = useCallback(
    (target: GuidedStepTarget) => guidedOpen && currentGuidedStep?.target === target,
    [currentGuidedStep?.target, guidedOpen]
  )

  const closeGuidedOnboarding = useCallback(() => {
    guidedSuppressAutoOpenRef.current = true
    const snapshot = guidedSnapshotRef.current
    if (snapshot) {
      setNome(snapshot.nome)
      setDescricao(snapshot.descricao)
      setQuandoUsar(snapshot.quandoUsar)
      setSelectedFile(snapshot.selectedFile)
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
    if (safeSessionId) {
      markGuidedTutorialCompleted(safeSessionId, currentGuidedTutorialKey)
    }
    setGuidedCompletionModalOpen(true)
  }, [currentGuidedTutorialKey, safeSessionId])

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
      (!searchParams.get('guidedTutorial') || currentGuidedTutorialKey === 'files')
    if (!shouldOpen) {
      guidedSuppressAutoOpenRef.current = false
      return
    }
    if (guidedSuppressAutoOpenRef.current || guidedOpen) return

    if (!guidedSnapshotRef.current) {
      guidedSnapshotRef.current = {
        nome,
        descricao,
        quandoUsar,
        selectedFile,
      }
    }

    setGuidedOpen(true)
    setGuidedStep(0)
    setGuidedCompletionModalOpen(false)
  }, [currentGuidedTutorialKey, descricao, guidedOpen, nome, quandoUsar, searchParams, selectedFile])

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
    setArquivos([])
    setLoading(Boolean(safeSessionId))
    setEditingId(null)
    setEditNome('')
    setEditDescricao('')
    setEditQuandoUsar('')
    setUploadError(null)
    setUploadSuccess(null)
  }, [safeSessionId, isEn, tr])

  useEffect(() => {
    if (!safeSessionId || !db) {
      setArquivos([])
      setLoading(false)
      return
    }

    setLoading(true)
    const colRef = collection(db, 'users', safeSessionId, 'arquivos')
    const q = query(colRef)
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next: ArquivoRecord[] = []
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>
          const tipo = data.tipo
          if (tipo !== 'image' && tipo !== 'video' && tipo !== 'audio' && tipo !== 'document') {
            return
          }
          next.push({
            id: docSnap.id,
            nome: typeof data.nome === 'string' ? data.nome : '',
            descricao: typeof data.descricao === 'string' ? data.descricao : '',
            quandoUsar: typeof data.quandoUsar === 'string' ? data.quandoUsar : '',
            tipo,
            mimeType: typeof data.mimeType === 'string' ? data.mimeType : '',
            sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
            storagePath: typeof data.storagePath === 'string' ? data.storagePath : '',
            downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : '',
            createdAtMs: toMillis(data.createdAt),
            updatedAtMs: toMillis(data.updatedAt)
          })
        })

        next.sort((a, b) => (b.updatedAtMs ?? b.createdAtMs ?? 0) - (a.updatedAtMs ?? a.createdAtMs ?? 0))
        setArquivos(next)
        setLoading(false)
      },
      (error) => {
        console.error('Failed to load files:', error)
        setArquivos([])
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [safeSessionId, isEn, tr])

  const handleSelectFile = useCallback((file: File | null) => {
    setUploadError(null)
    setUploadSuccess(null)
    setUploadProgress(null)
    setSelectedFile(file)

    if (!file) {
      return
    }

    const tipo = resolveTipoFromMime(file.type, file.name)
    if (!tipo) {
      setUploadError(tr('Tipo de arquivo não suportado. Envie imagem, video, audio ou PDF.', 'Unsupported file type. Send image, video, audio, or PDF.'))
      setSelectedFile(null)
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        tr(
          `Arquivo muito grande (${formatBytes(file.size)}). Limite: ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
          `File is too large (${formatBytes(file.size)}). Limit: ${formatBytes(MAX_FILE_SIZE_BYTES)}.`
        )
      )
      setSelectedFile(null)
      return
    }

    setNome((prev) => (prev.trim() ? prev : stripExtension(file.name)))
  }, [tr])

  const handleUpload = useCallback(async () => {
    if (!safeSessionId || !db || !storage) {
      setUploadError(tr('Firebase não configurado. Verifique o .env.local.', 'Firebase is not configured. Check .env.local.'))
      return
    }
    if (!selectedFile) {
      setUploadError(tr('Selecione um arquivo para enviar.', 'Select a file to upload.'))
      return
    }

    const safeNome = nome.trim()
    const safeQuandoUsar = quandoUsar.trim()
    const safeDescricao = descricao.trim()

    if (!safeNome) {
      setUploadError(tr('Informe um nome para o arquivo.', 'Provide a file name.'))
      return
    }
    if (!safeQuandoUsar) {
      setUploadError(tr('Preencha o campo "quando usar/enviar".', 'Fill the "when to use/send" field.'))
      return
    }

    const tipo = resolveTipoFromMime(selectedFile.type, selectedFile.name)
    if (!tipo) {
      setUploadError(tr('Tipo de arquivo não suportado. Envie imagem, video, audio ou PDF.', 'Unsupported file type. Send image, video, audio, or PDF.'))
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        tr(
          `Arquivo muito grande (${formatBytes(selectedFile.size)}). Limite: ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
          `File is too large (${formatBytes(selectedFile.size)}). Limit: ${formatBytes(MAX_FILE_SIZE_BYTES)}.`
        )
      )
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    setUploadProgress(0)

    try {
      const colRef = collection(db, 'users', safeSessionId, 'arquivos')
      const docRef = doc(colRef)
      const arquivoId = docRef.id
      const storagePath = `users/${safeSessionId}/arquivos/${arquivoId}`
      const storageRef = ref(storage, storagePath)

      const task = uploadBytesResumable(storageRef, selectedFile, {
        contentType: selectedFile.type
      })

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              setUploadProgress(pct)
            }
          },
          (error) => reject(error),
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref)
              resolve(url)
            } catch (error) {
              reject(error)
            }
          }
        )
      })

      await setDoc(docRef, {
        nome: safeNome,
        descricao: safeDescricao,
        quandoUsar: safeQuandoUsar,
        tipo,
        mimeType: selectedFile.type,
        sizeBytes: selectedFile.size,
        storagePath,
        downloadUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      setSelectedFile(null)
      setNome('')
      setDescricao('')
      setQuandoUsar('')
      setUploadProgress(null)
      setUploadSuccess(tr('Arquivo enviado com sucesso.', 'File uploaded successfully.'))
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError(tr('Erro ao enviar arquivo. Tente novamente.', 'Failed to upload file. Please try again.'))
    } finally {
      setUploading(false)
    }
  }, [descricao, nome, quandoUsar, selectedFile, safeSessionId, tr])

  const startEdit = useCallback((arquivo: ArquivoRecord) => {
    setEditingId(arquivo.id)
    setEditNome(arquivo.nome)
    setEditDescricao(arquivo.descricao)
    setEditQuandoUsar(arquivo.quandoUsar)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditNome('')
    setEditDescricao('')
    setEditQuandoUsar('')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!safeSessionId || !db || !editingId) return

    const safeNome = editNome.trim()
    const safeQuandoUsar = editQuandoUsar.trim()
    const safeDescricao = editDescricao.trim()

    if (!safeNome) {
      return
    }
    if (!safeQuandoUsar) {
      return
    }

    setEditingBusy(true)
    try {
      const refDoc = doc(db, 'users', safeSessionId, 'arquivos', editingId)
      await updateDoc(refDoc, {
        nome: safeNome,
        descricao: safeDescricao,
        quandoUsar: safeQuandoUsar,
        updatedAt: serverTimestamp()
      })
      cancelEdit()
    } catch (error) {
      console.error('Failed to update file:', error)
    } finally {
      setEditingBusy(false)
    }
  }, [cancelEdit, editDescricao, editNome, editQuandoUsar, editingId, safeSessionId])

  const handleDelete = useCallback(async (arquivo: ArquivoRecord) => {
    if (!safeSessionId || !db || !storage) return
    if (!arquivo.id) return

    const confirmed = window.confirm(
      isEn
        ? `Delete file "${arquivo.nome || 'No name'}"?`
        : `Excluir o arquivo "${arquivo.nome || tr('Sem nome', 'No name')}"?`
    )
    if (!confirmed) return

    try {
      if (arquivo.storagePath) {
        await deleteObject(ref(storage, arquivo.storagePath)).catch(() => null)
      }
      await deleteDoc(doc(db, 'users', safeSessionId, 'arquivos', arquivo.id))
    } catch (error) {
      console.error('Failed to delete file:', error)
    }
  }, [safeSessionId, isEn, tr])

  const uploadDisabledReason = useMemo(() => {
    if (!safeSessionId) return tr('Selecione um usuario para enviar arquivos.', 'Select a user to upload files.')
    if (!db || !storage) return tr('Firebase não configurado.', 'Firebase is not configured.')
    if (uploading) return tr('Enviando...', 'Uploading...')
    return null
  }, [uploading, safeSessionId, tr])

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Files className="w-8 h-8 text-primary" />
          {tr('Arquivos', 'Files')}
        </h1>
        <p className="text-gray-400">
          {tr('Envie e gerencie arquivos (imagens, videos, áudios e PDFs). A IA pode usar o campo "quando usar/enviar" como gatilho para mandar esses arquivos aos clientes.', 'Upload and manage files (images, videos, áudios, and PDFs). AI can use the "when to use/send" field as a trigger to send these files to clients.')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div
          ref={uploadFieldsRef}
          className={cn(
            'relative lg:col-span-2 bg-surface-light border border-surface-lighter rounded-2xl p-6 shadow-sm space-y-5 transition-all',
            isGuidedTargetActive('upload_fields') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{tr('Enviar arquivo', 'Upload file')}</h2>
              <p className="text-xs text-gray-400">
                {tr('Limite', 'Limit')}: {formatBytes(MAX_FILE_SIZE_BYTES)}
              </p>
            </div>
          </div>

          {!canUseFirebase && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              {tr('Firebase Storage não esta disponível (verifique o `.env.local`).', 'Firebase Storage is unavailable (check `.env.local`).')}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{tr('Arquivo', 'File')}</label>
              <Input
                type="file"
                accept="image/*,video/*,audio/*,application/pdf,.pdf"
                disabled={!canUseFirebase || uploading || guidedOpen}
                onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
              />
            {selectedFile && (
              <p className="text-xs text-gray-400">
                {tr('Selecionado', 'Selected')}: <span className="text-gray-200 font-medium">{selectedFile.name}</span> ({formatBytes(selectedFile.size)})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{tr('Nome', 'Name')}</label>
            <Input
              placeholder={tr('Ex: Catalogo 2026', 'E.g.: Catalog 2026')}
              value={nome}
              disabled={!canUseFirebase || uploading || guidedOpen}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">{tr('Descricao (opcional)', 'Description (optional)')}</label>
            <Textarea
              placeholder={tr('Ex: PDF com precos e planos', 'E.g.: PDF with prices and plans')}
              value={descricao}
              disabled={!canUseFirebase || uploading || guidedOpen}
              onChange={(e) => setDescricao(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div
            ref={whenToUseRef}
            className={cn(
              'relative space-y-2 transition-all',
              isGuidedTargetActive('when_to_use') && 'z-[210] rounded-xl border border-primary/80 p-2 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
          >
            <label className="text-sm font-medium text-gray-300">{tr('Quando usar/enviar', 'When to use/send')}</label>
            <Textarea
              placeholder={tr('Ex: Enviar quando pedirem catalogo, precos, planos, tabela ou valores.', 'E.g.: Send when they ask for catalog, prices, plans, table, or values.')}
              value={quandoUsar}
              disabled={!canUseFirebase || uploading || guidedOpen}
              onChange={(e) => setQuandoUsar(e.target.value)}
              className="min-h-[90px]"
            />
          </div>

          {uploadError && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              {uploadError}
            </div>
          )}
          {uploadSuccess && (
            <div className="rounded-xl border border-green-400/30 bg-green-500/10 p-4 text-sm text-green-200">
              {uploadSuccess}
            </div>
          )}

          {uploadProgress !== null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Upload</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface overflow-hidden border border-surface-lighter">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                />
              </div>
            </div>
          )}

          <Button
            ref={uploadButtonRef}
            className={cn(
              'relative w-full',
              isGuidedTargetActive('upload_button') && 'z-[210] border border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
            )}
            onClick={handleUpload}
            disabled={!canUseFirebase || uploading || guidedOpen}
            title={uploadDisabledReason ?? undefined}
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {tr('Enviando...','Uploading...')}
              </span>
            ) : (
              tr('Enviar', 'Upload')
            )}
          </Button>
        </div>

        <div
          ref={libraryRef}
          className={cn(
            'relative lg:col-span-3 bg-surface-light border border-surface-lighter rounded-2xl p-6 shadow-sm space-y-5 transition-all',
            isGuidedTargetActive('library') && 'z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{tr('Meus arquivos', 'My files')}</h2>
              <p className="text-xs text-gray-400">{displayArquivos.length} {tr('item(ns)', 'item(s)')}</p>
            </div>
          </div>

          {loading && !guidedOpen ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : displayArquivos.length === 0 ? (
            <div className="rounded-xl border border-surface-lighter bg-surface p-6 text-sm text-gray-400">
              {tr('Nenhum arquivo enviado ainda.', 'No files uploaded yet.')}
            </div>
          ) : (
            <div className="space-y-4">
              {displayArquivos.map((arquivo) => {
                const isEditing = editingId === arquivo.id
                const isDemoFile = arquivo.id === GUIDED_DEMO_FILE_ID
                return (
                  <div
                    key={arquivo.id}
                    className="rounded-2xl border border-surface-lighter bg-surface p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-bold truncate">
                            {arquivo.nome || tr('Sem nome', 'No name')}
                          </h3>
                          <span className="text-[10px] uppercase tracking-wider text-gray-400 bg-surface-lighter px-2 py-1 rounded-full">
                            {arquivo.tipo === 'document' ? 'pdf' : arquivo.tipo}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                          <span>{formatBytes(arquivo.sizeBytes)}</span>
                          <span>{tr('Atualizado', 'Updated')}: {formatDateTime(arquivo.updatedAtMs ?? arquivo.createdAtMs, locale === 'en' ? 'en-US' : 'pt-BR')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isEditing ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancelEdit}
                              disabled={editingBusy}
                            >
                              <X className="w-4 h-4 mr-2" />
                              {tr('Cancelar', 'Cancel')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={editingBusy || !editNome.trim() || !editQuandoUsar.trim()}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {tr('Salvar', 'Save')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEdit(arquivo)}
                              disabled={guidedOpen || isDemoFile}
                            >
                              <Edit2 className="w-4 h-4 mr-2" />
                              {tr('Editar', 'Edit')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-300 border-red-400/30 hover:bg-red-500/10"
                              onClick={() => handleDelete(arquivo)}
                              disabled={guidedOpen || isDemoFile}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {tr('Excluir', 'Delete')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {arquivo.downloadUrl && (
                      <div
                        className={cn(
                          'rounded-xl border border-surface-lighter bg-surface-lighter/20 overflow-hidden',
                          arquivo.tipo === 'audio' || arquivo.tipo === 'document' ? 'p-4' : ''
                        )}
                      >
                        {arquivo.tipo === 'image' && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={arquivo.downloadUrl} alt={arquivo.nome} className="w-full max-h-[260px] object-cover" />
                        )}
                        {arquivo.tipo === 'video' && (
                          <video src={arquivo.downloadUrl} controls className="w-full max-h-[260px]" />
                        )}
                        {arquivo.tipo === 'audio' && (
                          <audio src={arquivo.downloadUrl} controls className="w-full" />
                        )}
                        {arquivo.tipo === 'document' && (
                          <a
                            href={arquivo.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg border border-surface-lighter bg-surface px-4 py-3 text-sm text-gray-200 hover:bg-surface-lighter/30"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate font-medium">{arquivo.nome || tr('Documento', 'Document')}</span>
                              <span className="shrink-0 text-xs text-primary underline">{tr('Abrir PDF', 'Open PDF')}</span>
                            </div>
                          </a>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">{tr('Nome', 'Name')}</label>
                          <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">{tr('Descricao', 'Description')}</label>
                          <Textarea
                            value={editDescricao}
                            onChange={(e) => setEditDescricao(e.target.value)}
                            className="min-h-[70px]"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">{tr('Quando usar/enviar', 'When to use/send')}</label>
                          <Textarea
                            value={editQuandoUsar}
                            onChange={(e) => setEditQuandoUsar(e.target.value)}
                            className="min-h-[80px]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {arquivo.descricao?.trim() && (
                          <div>
                            <p className="text-xs font-semibold text-gray-300 mb-1">{tr('Descricao', 'Description')}</p>
                            <p className="text-sm text-gray-200 whitespace-pre-wrap">{arquivo.descricao}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-300 mb-1">{tr('Quando usar/enviar', 'When to use/send')}</p>
                          <p className="text-sm text-gray-200 whitespace-pre-wrap">{arquivo.quandoUsar || '--'}</p>
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





