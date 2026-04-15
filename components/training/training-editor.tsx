'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import {
  Brain,
  Sparkles,
  Save,
  Info,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  User,
  Building2,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/providers/auth-provider'
import { useI18n } from '@/lib/i18n/client'
import { syncAiConfig, type AiTrainingPayload } from '@/lib/aiConfigSync'
import { cn } from '@/lib/utils'
import { db } from '@/lib/firebase'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { TrainingHistoryModal } from '@/components/training/training-history-modal'
import {
  GUIDED_TUTORIAL_ROUTE_KEYS,
  GUIDED_TUTORIAL_TITLES,
  getGuidedTutorialNextKey,
  isGuidedTutorialKey,
  markGuidedTutorialCompleted,
  type GuidedTutorialKey
} from '@/lib/onboarding/guided-tutorials'
import {
  DEFAULT_TRAINING_INSTRUCTIONS,
  TRAINING_RECENT_HUMAN_DAYS_MAX,
  TRAINING_RECENT_HUMAN_DAYS_MIN,
  TRAINING_RECENT_HUMAN_MESSAGES_MAX,
  TRAINING_RECENT_HUMAN_MESSAGES_MIN,
  normalizeRecentHumanDays,
  normalizeRecentHumanMessages,
  normalizeTrainingInstructions,
  normalizeTrainingSnapshot as normalizeSharedTrainingSnapshot,
  normalizeFollowUpAutomaticConfig,
  type TrainingFollowUpAutomaticConfig
} from '@/lib/training/schema'
import {
  buildSnapshotKey,
  createTrainingVersion,
  listTrainingVersions,
  pruneTrainingVersions,
  type TrainingSnapshot,
  type TrainingVersionDoc,
  type TrainingVersionMeta,
  type TrainingVersionReason
} from '@/lib/training/versioning'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

type AIModel = 'openai' | 'google' | 'x'
type TrainingSection = 'company' | 'basic' | 'crm'
type TrainingGuideTarget =
  | 'tabs'
  | 'companyNameDescription'
  | 'companyHoursValues'
  | 'companyOtherInfo'
  | 'basicAiName'
  | 'basicPrimaryToggles'
  | 'basicHumanRecent'
  | 'basicFallbackAndHandoff'
  | 'basicGroups'
  | 'basicContext'
  | 'basicSecondaryToggles'
  | 'basicGuidanceAndStyle'
  | 'basicModelLanguage'
  | 'crmPrimaryToggles'
  | 'crmTextBlocks'
  | 'crmFollowUpToggles'
  | 'crmFollowUpTextBlocks'
  | 'trainingHistoryAction'
  | 'trainingSaveAction'

type TrainingGuideStep = {
  id: string
  section: TrainingSection
  target: TrainingGuideTarget
  title: string
  description: string
}

const MAX_VERSIONS = 50
const CHECKPOINT_IDLE_MS = 15_000
const CHECKPOINT_MIN_INTERVAL_MS = 60_000
const CONTEXT_MAX_MESSAGES_DEFAULT = 20
const CONTEXT_MAX_MESSAGES_MIN = 10
const CONTEXT_MAX_MESSAGES_MAX = 100
const RECENT_HUMAN_DAYS_MIN = TRAINING_RECENT_HUMAN_DAYS_MIN
const RECENT_HUMAN_DAYS_MAX = TRAINING_RECENT_HUMAN_DAYS_MAX
const RECENT_HUMAN_MESSAGES_MIN = TRAINING_RECENT_HUMAN_MESSAGES_MIN
const RECENT_HUMAN_MESSAGES_MAX = TRAINING_RECENT_HUMAN_MESSAGES_MAX

const FOLLOW_UP_FIRST_ENABLE_PRESET = normalizeFollowUpAutomaticConfig(
  DEFAULT_TRAINING_INSTRUCTIONS.followUpAutomatico
)

const normalizeContextMaxMessages = (value: unknown, fallback = CONTEXT_MAX_MESSAGES_DEFAULT): number => {
  if (typeof value === 'string' && !value.trim()) {
    return normalizeContextMaxMessages(fallback, CONTEXT_MAX_MESSAGES_DEFAULT)
  }

  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return Math.max(CONTEXT_MAX_MESSAGES_MIN, Math.min(CONTEXT_MAX_MESSAGES_MAX, fallback))
  }

  if (num < CONTEXT_MAX_MESSAGES_MIN) return CONTEXT_MAX_MESSAGES_MIN
  if (num > CONTEXT_MAX_MESSAGES_MAX) return CONTEXT_MAX_MESSAGES_MAX
  return num
}

const ToggleHelp = ({ text }: { text: string }) => (
  <span className="group relative ml-2 inline-flex shrink-0 items-center">
    <button
      type="button"
      tabIndex={-1}
      aria-label={text}
      className="inline-flex items-center"
    >
      <Info className="h-4 w-4 text-gray-400 transition-colors group-hover:text-white group-focus-within:text-white" />
    </button>
    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-surface-lighter px-3 py-2 text-xs text-white shadow-xl group-hover:block group-focus-within:block">
      {text}
    </span>
  </span>
)

type CollapsibleTextareaProps = {
  value: string
  placeholder: string
  onChange: (value: string) => void
  className?: string
  fixedHeight?: boolean
}

const firstLineFromText = (text: string): string => {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? ''
}

const CollapsibleTextarea = ({ value, placeholder, onChange, className, fixedHeight = false }: CollapsibleTextareaProps) => {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const [isExpanded, setIsExpanded] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const firstLine = firstLineFromText(value)
  const previewText = firstLine || placeholder

  const syncTextareaHeight = () => {
    if (fixedHeight) {
      return
    }
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (!isExpanded) return
    syncTextareaHeight()
  }, [isExpanded, value])

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-surface-lighter bg-surface px-3 py-2 text-left"
      >
        <span className={`min-w-0 w-0 flex-1 truncate text-sm ${firstLine ? 'text-white' : 'text-gray-500'}`}>
          {previewText}
        </span>
        <span className="ml-3 inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-gray-400">
          {isExpanded ? (isEn ? 'Hide' : 'Ocultar') : isEn ? 'Show more' : 'Ver mais'}
          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {isExpanded && (
        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onInput={syncTextareaHeight}
          className={`resize-none overflow-hidden ${className ?? ''}`}
        />
      )}
    </div>
  )
}

type TrainingEditorViewerMode = 'self' | 'admin'

export type TrainingEditorProps = {
  targetUserId: string
  viewerMode: TrainingEditorViewerMode
  userName?: string
  showHistory?: boolean
  showGuidedTutorial?: boolean
  showCopilotCta?: boolean
}

export function TrainingEditor({
  targetUserId,
  viewerMode,
  userName,
  showHistory: allowHistory = true,
  showGuidedTutorial = viewerMode === 'self',
  showCopilotCta = viewerMode === 'self'
}: TrainingEditorProps) {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const isAdminViewer = viewerMode === 'admin'
  const shouldShowGuidedTutorial = showGuidedTutorial && !isAdminViewer
  const shouldShowCopilotCta = showCopilotCta && !isAdminViewer
  const tr = (pt: string, en: string) => (isEn ? en : pt)
  const [activeModel, setActiveModel] = useState<AIModel>('google')
  const [instructions, setInstructions] = useState(() =>
    normalizeTrainingInstructions({ language: isAdminViewer ? 'pt-BR' : locale })
  )
  const [contextMaxMessages, setContextMaxMessages] = useState<number>(CONTEXT_MAX_MESSAGES_DEFAULT)
  const [contextMaxMessagesDraft, setContextMaxMessagesDraft] = useState<string>(String(CONTEXT_MAX_MESSAGES_DEFAULT))
  const [trainingSection, setTrainingSection] = useState<TrainingSection>('company')
  const [isModelLanguageOpen, setIsModelLanguageOpen] = useState(false)
  const SectionHeaderIcon =
    trainingSection === 'company' ? Building2 : trainingSection === 'basic' ? Info : MessageSquare
  const sectionInstructionHeader =
    trainingSection === 'company'
      ? {
          title: tr('Descrição da empresa', 'Company description'),
          description: tr(
            'Preencha os dados da empresa, descrição comercial e horários para orientar a IA com precisão.',
            'Fill in company data, commercial description, and business hours to guide AI accurately.'
          )
        }
      : trainingSection === 'basic'
        ? {
            title: tr('Configurações básicas', 'Basic settings'),
            description: tr(
              'Defina comportamento geral, contexto, permissões e modelo de linguagem.',
              'Set general behavior, context, permissions, and language model.'
            )
          }
        : {
            title: tr('Follow-up, CRM e Leads/Clientes', 'Follow-up, CRM and Leads/Clients'),
            description: tr(
              'Configure automação de follow-up, classificação e regras de atualização no CRM.',
              'Configure follow-up automation, classification, and CRM update rules.'
            )
          }
  
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [trainingGuideOpen, setTrainingGuideOpen] = useState(false)
  const [trainingGuideStepIndex, setTrainingGuideStepIndex] = useState(0)
  const [trainingGuideCompletionModalOpen, setTrainingGuideCompletionModalOpen] = useState(false)
  const [guidePortalReady, setGuidePortalReady] = useState(false)

  const tabsRef = useRef<HTMLDivElement | null>(null)
  const companyNameRef = useRef<HTMLDivElement | null>(null)
  const companyDescriptionRef = useRef<HTMLDivElement | null>(null)
  const companyHoursValuesRef = useRef<HTMLDivElement | null>(null)
  const companyOtherInfoRef = useRef<HTMLDivElement | null>(null)
  const basicAiNameRef = useRef<HTMLDivElement | null>(null)
  const basicPrimaryTogglesRef = useRef<HTMLDivElement | null>(null)
  const basicHumanRecentRef = useRef<HTMLDivElement | null>(null)
  const basicFallbackAndHandoffRef = useRef<HTMLDivElement | null>(null)
  const basicGroupsRef = useRef<HTMLDivElement | null>(null)
  const basicContextRef = useRef<HTMLDivElement | null>(null)
  const basicSecondaryTogglesRef = useRef<HTMLDivElement | null>(null)
  const basicGuidanceAndStyleRef = useRef<HTMLDivElement | null>(null)
  const basicModelLanguageRef = useRef<HTMLDivElement | null>(null)
  const crmPrimaryTogglesRef = useRef<HTMLDivElement | null>(null)
  const crmTextBlocksRef = useRef<HTMLDivElement | null>(null)
  const crmFollowUpTogglesRef = useRef<HTMLDivElement | null>(null)
  const crmFollowUpTextBlocksRef = useRef<HTMLDivElement | null>(null)
  const trainingHistoryActionRef = useRef<HTMLDivElement | null>(null)
  const trainingSaveActionRef = useRef<HTMLDivElement | null>(null)
  const tutorialRestoreStateRef = useRef<{
    trainingSection: TrainingSection
    isModelLanguageOpen: boolean
    permitirSugestoesCamposLeadsClientes: boolean
    aprovarAutomaticamenteSugestoesLeadsClientes: boolean
    followUpAutomatico: TrainingFollowUpAutomaticConfig
  } | null>(null)
  const trainingGuideSuppressAutoOpenRef = useRef(false)
  const skipAutoSaveRef = useRef(true)
  const hasLocalEditsRef = useRef(false)
  const isSavingRef = useRef(false)
  const editVersionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const pendingSaveRef = useRef(false)
  const ignoreSnapshotUntilRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const lastLoadedUserIdRef = useRef<string | null>(null)
  const lastEditAtRef = useRef(0)
  const lastSuccessfulSaveSnapshotKeyRef = useRef<string>('')
  const lastVersionSnapshotKeyRef = useRef<string>('')
  const lastVersionCreatedAtMsRef = useRef<number>(0)
  const baselineUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    setInstructions((prev) => {
      if (isAdminViewer || prev.language === locale) {
        return prev
      }
      return {
        ...prev,
        language: locale
      }
    })
  }, [isAdminViewer, locale])

  useEffect(() => {
    if (!targetUserId) return

    setActiveModel('google')
    setInstructions(normalizeTrainingInstructions({ language: isAdminViewer ? 'pt-BR' : locale }))
    setContextMaxMessages(CONTEXT_MAX_MESSAGES_DEFAULT)
    setContextMaxMessagesDraft(String(CONTEXT_MAX_MESSAGES_DEFAULT))
    setTrainingSection('company')
    setIsModelLanguageOpen(false)
    setIsInitialLoading(true)
    setIsSaving(false)
    setSaveStatus('idle')
    setHistoryNotice(null)
    setIsHistoryOpen(false)
    setTrainingGuideOpen(false)
    setTrainingGuideStepIndex(0)
    setTrainingGuideCompletionModalOpen(false)
    hasLocalEditsRef.current = false
    isSavingRef.current = false
    editVersionRef.current = 0
    savedVersionRef.current = 0
    pendingSaveRef.current = false
    ignoreSnapshotUntilRef.current = 0
    hasLoadedRef.current = false
    lastLoadedUserIdRef.current = null
    lastEditAtRef.current = 0
    lastSuccessfulSaveSnapshotKeyRef.current = ''
    lastVersionSnapshotKeyRef.current = ''
    lastVersionCreatedAtMsRef.current = 0
    baselineUserIdRef.current = null
    skipAutoSaveRef.current = true
  }, [isAdminViewer, locale, targetUserId])

  // Carregar dados iniciais
  useEffect(() => {
    if (!user || !db || !targetUserId) return
    if (hasLoadedRef.current && lastLoadedUserIdRef.current === targetUserId) {
      return
    }

    setIsInitialLoading(true)
    const docRef = doc(db, 'users', targetUserId, 'settings', 'ai_training')
    let isMounted = true
    getDoc(docRef).then((docSnap) => {
      if (!isMounted) return
      if (hasLocalEditsRef.current) {
        hasLoadedRef.current = true
        lastLoadedUserIdRef.current = targetUserId
        setIsInitialLoading(false)
        return
      }
      if (docSnap.exists()) {
        const data = docSnap.data()
        const snapshot = normalizeSharedTrainingSnapshot({
          model: data.model,
          instructions: data.instructions,
          contextMaxMessages: (data as any).contextMaxMessages
        })
        setActiveModel(snapshot.model)
        setInstructions(snapshot.instructions)
        setContextMaxMessages(snapshot.contextMaxMessages)
        setContextMaxMessagesDraft(String(snapshot.contextMaxMessages))
      }
      hasLoadedRef.current = true
      lastLoadedUserIdRef.current = targetUserId
      setIsInitialLoading(false)
    }).catch((error) => {
      console.error("Erro ao carregar configurações:", error)
      if (isMounted) {
        setIsInitialLoading(false)
      }
    })

    return () => {
      isMounted = false
    }
  }, [targetUserId, user])

  useEffect(() => {
    isSavingRef.current = isSaving
  }, [isSaving])

  const recordTrainingVersion = async (snapshot: TrainingSnapshot, reason: TrainingVersionReason, meta?: TrainingVersionMeta) => {
    if (!user || !db || !targetUserId) {
      return false
    }

    const snapshotKey = buildSnapshotKey(snapshot.model, snapshot.instructions, snapshot.contextMaxMessages)
    if (lastVersionSnapshotKeyRef.current && snapshotKey === lastVersionSnapshotKeyRef.current) {
      return true
    }

    const created = await createTrainingVersion(db, targetUserId, snapshot, { reason, meta })
    lastVersionSnapshotKeyRef.current = created.snapshotKey
    lastVersionCreatedAtMsRef.current = created.createdAtMs
    await pruneTrainingVersions(db, targetUserId, MAX_VERSIONS)
    return true
  }

  type SaveSource = 'autosave' | 'manual' | 'revert'

  const handleSave = async (options: {
    source: SaveSource
    snapshot?: TrainingSnapshot
    createVersion?: boolean
    versionReason?: TrainingVersionReason
    versionMeta?: TrainingVersionMeta
  }): Promise<boolean> => {
    if (!user || !db || !targetUserId) return false
    if (isSavingRef.current) return false

    isSavingRef.current = true
    const saveVersion = editVersionRef.current
    const fallbackContextMaxMessages = normalizeContextMaxMessages(contextMaxMessagesDraft, contextMaxMessages)
    const snapshotInput: TrainingSnapshot =
      options.snapshot ?? { model: activeModel, instructions, contextMaxMessages: fallbackContextMaxMessages }
    const snapshot: TrainingSnapshot = {
      ...snapshotInput,
      contextMaxMessages: normalizeContextMaxMessages(snapshotInput.contextMaxMessages, CONTEXT_MAX_MESSAGES_DEFAULT)
    }
    const normalizedInstructions = normalizeTrainingInstructions(snapshot.instructions)
    const normalizedSnapshot: TrainingSnapshot = {
      ...snapshot,
      instructions: normalizedInstructions
    }
    const snapshotKey = buildSnapshotKey(
      normalizedSnapshot.model,
      normalizedSnapshot.instructions,
      normalizedSnapshot.contextMaxMessages
    )

    setIsSaving(true)
    setSaveStatus('idle')
    if (options.createVersion) {
      setHistoryNotice(null)
    }

    try {
      const docRef = doc(db, 'users', targetUserId, 'settings', 'ai_training')
      await setDoc(docRef, {
        model: normalizedSnapshot.model,
        instructions: normalizedSnapshot.instructions,
        contextMaxMessages: normalizedSnapshot.contextMaxMessages,
        updatedAt: serverTimestamp()
      }, { mergeFields: ['model', 'instructions', 'contextMaxMessages', 'updatedAt'] })

      const trainingPayload: AiTrainingPayload = {
        language: normalizedSnapshot.instructions.language,
        nomeEmpresa: normalizedSnapshot.instructions.nomeEmpresa,
        nomeIA: normalizedSnapshot.instructions.nomeIA,
        seApresentarComoIA: normalizedSnapshot.instructions.seApresentarComoIA,
        permitirIATextoPersonalizadoAoEncaminharHumano:
          normalizedSnapshot.instructions.permitirIATextoPersonalizadoAoEncaminharHumano,
        usarEmojis: normalizedSnapshot.instructions.usarEmojis,
        usarAgendaAutomatica: normalizedSnapshot.instructions.usarAgendaAutomatica,
        orientacoesFollowUp: normalizedSnapshot.instructions.orientacoesFollowUp,
        instrucoesLeadsTagPassiva: normalizedSnapshot.instructions.instrucoesLeadsTagPassiva,
        instrucoesLeadsTagAtiva: normalizedSnapshot.instructions.instrucoesLeadsTagAtiva,
        instrucoesFollowUpTagPassiva: normalizedSnapshot.instructions.instrucoesFollowUpTagPassiva,
        instrucoesFollowUpTagAtiva: normalizedSnapshot.instructions.instrucoesFollowUpTagAtiva,
        desligarMensagemForaContexto: normalizedSnapshot.instructions.desligarMensagemForaContexto,
        desligarIASeUltimasDuasMensagensNãoRecebidas:
          normalizedSnapshot.instructions.desligarIASeUltimasDuasMensagensNãoRecebidas,
        desligarIASeHumanoRecente: normalizedSnapshot.instructions.desligarIASeHumanoRecente,
        desligarIASeHumanoRecenteUsarDias:
          normalizedSnapshot.instructions.desligarIASeHumanoRecenteUsarDias,
        desligarIASeHumanoRecenteUsarMensagens:
          normalizedSnapshot.instructions.desligarIASeHumanoRecenteUsarMensagens,
        desligarIASeHumanoRecenteDias: normalizedSnapshot.instructions.desligarIASeHumanoRecenteDias,
        desligarIASeHumanoRecenteMensagens:
          normalizedSnapshot.instructions.desligarIASeHumanoRecenteMensagens,
        responderClientes: normalizedSnapshot.instructions.responderClientes,
        autoClassificarLeadComoCliente: normalizedSnapshot.instructions.autoClassificarLeadComoCliente,
        permitirSugestoesCamposLeadsClientes: normalizedSnapshot.instructions.permitirSugestoesCamposLeadsClientes,
        aprovarAutomaticamenteSugestoesLeadsClientes:
          normalizedSnapshot.instructions.aprovarAutomaticamenteSugestoesLeadsClientes,
        instrucoesSugestoesLeadsClientes: normalizedSnapshot.instructions.instrucoesSugestoesLeadsClientes,
        permitirIAEnviarArquivos: normalizedSnapshot.instructions.permitirIAEnviarArquivos,
        permitirIAOuvirAudios: normalizedSnapshot.instructions.permitirIAOuvirAudios,
        permitirIALerImagensEPdfs: normalizedSnapshot.instructions.permitirIALerImagensEPdfs,
        responderGrupos: normalizedSnapshot.instructions.responderGrupos,
        esconderGrupos: normalizedSnapshot.instructions.esconderGrupos,
        comportamentoNãoSabe:
          normalizedSnapshot.instructions.comportamentoNãoSabe === 'silêncio' ? 'silencio' : 'encaminhar',
        mensagemEncaminharHumano: normalizedSnapshot.instructions.mensagemEncaminharHumano,
        tipoResposta: normalizedSnapshot.instructions.tipoResposta,
        orientacoesGerais: normalizedSnapshot.instructions.orientacoesGerais,
        empresa: normalizedSnapshot.instructions.empresa,
        descricaoServicosProdutosVendidos:
          normalizedSnapshot.instructions.descricaoServicosProdutosVendidos,
        horarios: normalizedSnapshot.instructions.horarios,
        outros: normalizedSnapshot.instructions.outros,
        followUpAutomatico: normalizedSnapshot.instructions.followUpAutomatico
      }

      const provider = normalizedSnapshot.model === 'google' ? 'google' : 'openai'
      const model = normalizedSnapshot.model === 'google' ? 'gemini-3-flash-preview' : 'gpt-5.2'

      await syncAiConfig({
        ...(isAdminViewer ? { sessionId: targetUserId } : {}),
        responderGrupos:
          normalizedSnapshot.instructions.esconderGrupos
            ? false
            : normalizedSnapshot.instructions.responderGrupos,
        training: trainingPayload,
        provider,
        model,
        contextMaxMessages: normalizedSnapshot.contextMaxMessages
      })

      setContextMaxMessages(normalizedSnapshot.contextMaxMessages)
      setContextMaxMessagesDraft(String(normalizedSnapshot.contextMaxMessages))
      
      lastSuccessfulSaveSnapshotKeyRef.current = snapshotKey

      if (options.createVersion) {
        try {
          const reason = options.versionReason ?? (options.source === 'revert' ? 'revert' : 'manual')
          const ok = await recordTrainingVersion(normalizedSnapshot, reason, options.versionMeta)
          if (!ok) {
            setHistoryNotice(tr('Falha ao registrar no histórico.', 'Failed to register history entry.'))
          }
        } catch (versionError) {
          console.error('Erro ao salvar versão do treinamento:', versionError)
          setHistoryNotice(tr('Falha ao registrar no histórico.', 'Failed to register history entry.'))
        }
      }

      savedVersionRef.current = saveVersion
      if (editVersionRef.current === saveVersion) {
        hasLocalEditsRef.current = false
      } else {
        hasLocalEditsRef.current = true
        pendingSaveRef.current = true
      }
      setSaveStatus('success')
      // Reset status após 3 segundos
      setTimeout(() => setSaveStatus('idle'), 3000)
      return true
    } catch (error) {
      console.error("Erro ao salvar configurações:", error)
      setSaveStatus('error')
      return false
    } finally {
      setIsSaving(false)
      isSavingRef.current = false
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        setTimeout(() => {
          if (!isSavingRef.current) {
            void handleSave({ source: 'autosave' })
          } else {
            pendingSaveRef.current = true
          }
        }, 0)
      }
    }
  }

  // Auto-save após 3s sem alterações
  useEffect(() => {
    if (!user || !db || !targetUserId || isInitialLoading) return
    if (shouldShowGuidedTutorial && trainingGuideOpen) return
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false
      return
    }

    const timer = setTimeout(() => {
      if (isSaving) return
      void handleSave({ source: 'autosave' })
    }, 3000)

    return () => clearTimeout(timer)
  }, [instructions, activeModel, contextMaxMessagesDraft, user, db, targetUserId, isInitialLoading, isSaving, trainingGuideOpen, shouldShowGuidedTutorial])

  // Baseline: criar primeira versão se o usuário ainda não tiver histórico
  useEffect(() => {
    if (!user || !db || !targetUserId || isInitialLoading) return
    if (baselineUserIdRef.current === targetUserId) return
    baselineUserIdRef.current = targetUserId

    void (async () => {
      try {
        const latest = await listTrainingVersions(db, targetUserId, 1)
        if (latest.length > 0) {
          lastVersionSnapshotKeyRef.current = latest[0].snapshotKey
          lastVersionCreatedAtMsRef.current = latest[0].createdAtMs
          return
        }

        const snapshot: TrainingSnapshot = {
          model: activeModel,
          instructions,
          contextMaxMessages: normalizeContextMaxMessages(contextMaxMessagesDraft, contextMaxMessages)
        }
        await recordTrainingVersion(snapshot, 'baseline', {
          client: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' }
        })
      } catch (err) {
        console.error('Erro ao inicializar histórico do treinamento:', err)
      }
    })()
  }, [activeModel, contextMaxMessages, contextMaxMessagesDraft, instructions, isInitialLoading, targetUserId, user])

  // Checkpoint automático: apenas quando o usuário estiver idle e o estado atual estiver salvo com sucesso
  useEffect(() => {
    if (!user || !db || !targetUserId || isInitialLoading) return

    const resolvedContextMaxMessages = normalizeContextMaxMessages(contextMaxMessagesDraft, contextMaxMessages)
    const currentKey = buildSnapshotKey(activeModel, instructions, resolvedContextMaxMessages)
    const timer = setTimeout(() => {
      const now = Date.now()
      if (now - lastEditAtRef.current < CHECKPOINT_IDLE_MS) return
      if (isSavingRef.current) return
      if (hasLocalEditsRef.current) return
      if (now - lastVersionCreatedAtMsRef.current < CHECKPOINT_MIN_INTERVAL_MS) return
      if (lastSuccessfulSaveSnapshotKeyRef.current !== currentKey) return
      if (lastVersionSnapshotKeyRef.current === currentKey) return

      const snapshot: TrainingSnapshot = { model: activeModel, instructions, contextMaxMessages: resolvedContextMaxMessages }
      void recordTrainingVersion(snapshot, 'autosave_checkpoint', {
        client: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' }
      }).catch((err) => console.error('Erro ao criar checkpoint do treinamento:', err))
    }, CHECKPOINT_IDLE_MS)

    return () => clearTimeout(timer)
  }, [activeModel, contextMaxMessages, contextMaxMessagesDraft, instructions, isInitialLoading, targetUserId, user])

  const handleModelToggle = async (model: AIModel) => {
    if (activeModel === model) return // Não faz nada se já for o modelo ativo
    
    setActiveModel(model)
    
    if (!user || !db || !targetUserId) return

    setIsSaving(true)
    try {
      const docRef = doc(db, 'users', targetUserId, 'settings', 'ai_training')
      await setDoc(docRef, {
        model: model,
        updatedAt: serverTimestamp()
      }, { merge: true })
      
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (error) {
      console.error("Erro ao salvar modelo:", error)
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  const markLocalEdit = () => {
    editVersionRef.current += 1
    hasLocalEditsRef.current = true
    lastEditAtRef.current = Date.now()
    ignoreSnapshotUntilRef.current = Date.now() + 5000
  }

  const handleInputChange = (
    field: Exclude<keyof typeof instructions, 'followUpAutomatico'>,
    value: string | boolean | number
  ) => {
    markLocalEdit()
    setInstructions((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'esconderGrupos' && value === true) {
        next.responderGrupos = false
      }
      if (field === 'responderGrupos' && value === true) {
        next.esconderGrupos = false
      }
      if (field === 'permitirSugestoesCamposLeadsClientes' && value === false) {
        next.aprovarAutomaticamenteSugestoesLeadsClientes = false
      }
      if (
        field === 'aprovarAutomaticamenteSugestoesLeadsClientes' &&
        value === true &&
        next.permitirSugestoesCamposLeadsClientes !== true
      ) {
        next.aprovarAutomaticamenteSugestoesLeadsClientes = false
      }
      return next
    })
  }

  const handleRecentHumanGuardChange = (checked: boolean) => {
    markLocalEdit()
    setInstructions((prev) => {
      const next = {
        ...prev,
        desligarIASeHumanoRecente: checked
      }
      if (
        checked &&
        prev.desligarIASeHumanoRecenteUsarDias !== true &&
        prev.desligarIASeHumanoRecenteUsarMensagens !== true
      ) {
        next.desligarIASeHumanoRecenteUsarDias = true
        next.desligarIASeHumanoRecenteUsarMensagens = true
      }
      return next
    })
  }

  const handleRecentHumanCriterionToggle = (
    field: 'desligarIASeHumanoRecenteUsarDias' | 'desligarIASeHumanoRecenteUsarMensagens',
    checked: boolean
  ) => {
    markLocalEdit()
    setInstructions((prev) => {
      const next = {
        ...prev,
        [field]: checked
      } as typeof prev
      const useDays =
        field === 'desligarIASeHumanoRecenteUsarDias' ? checked : prev.desligarIASeHumanoRecenteUsarDias
      const useMessages =
        field === 'desligarIASeHumanoRecenteUsarMensagens'
          ? checked
          : prev.desligarIASeHumanoRecenteUsarMensagens
      if (!useDays && !useMessages) {
        next.desligarIASeHumanoRecente = false
      }
      return next
    })
  }

  const updateFollowUpAutomatic = (
    updater:
      | Partial<TrainingFollowUpAutomaticConfig>
      | ((current: TrainingFollowUpAutomaticConfig) => TrainingFollowUpAutomaticConfig)
  ) => {
    markLocalEdit()
    setInstructions((prev) => {
      const current = normalizeFollowUpAutomaticConfig(prev.followUpAutomatico)
      const nextRaw =
        typeof updater === 'function'
          ? updater(current)
          : {
              ...current,
              ...updater
            }
      return {
        ...prev,
        followUpAutomatico: normalizeFollowUpAutomaticConfig(nextRaw, current)
      }
    })
  }

  const handleFollowUpEnabledChange = (enabled: boolean) => {
    updateFollowUpAutomatic((current) => {
      if (!enabled) {
        return {
          ...current,
          enabled: false,
          allowClients: false
        }
      }

      if (!current.enabled) {
        return {
          ...FOLLOW_UP_FIRST_ENABLE_PRESET,
          enabled: true,
          allowClients: current.allowClients
        }
      }

      return {
        ...current,
        enabled: true
      }
    })
  }

  const handleContextMaxMessagesChange = (raw: string) => {
    markLocalEdit()
    setContextMaxMessagesDraft(raw)

    const trimmed = raw.trim()
    if (!trimmed) {
      return
    }

    const num = Number(trimmed)
    if (Number.isFinite(num) && Number.isInteger(num)) {
      setContextMaxMessages(num)
    }
  }

  const handleContextMaxMessagesBlur = () => {
    const normalized = normalizeContextMaxMessages(contextMaxMessagesDraft, contextMaxMessages)
    setContextMaxMessages(normalized)
    setContextMaxMessagesDraft(String(normalized))
  }

  const handleRecentHumanDaysChange = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return
    }

    const normalized = normalizeRecentHumanDays(parsed, instructions.desligarIASeHumanoRecenteDias)
    if (normalized !== instructions.desligarIASeHumanoRecenteDias) {
      handleInputChange('desligarIASeHumanoRecenteDias', normalized)
    }
  }

  const handleRecentHumanMessagesChange = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return
    }

    const normalized = normalizeRecentHumanMessages(
      parsed,
      instructions.desligarIASeHumanoRecenteMensagens
    )
    if (normalized !== instructions.desligarIASeHumanoRecenteMensagens) {
      handleInputChange('desligarIASeHumanoRecenteMensagens', normalized)
    }
  }

  const followUpAutomatic = normalizeFollowUpAutomaticConfig(instructions.followUpAutomatico)

  const currentSnapshotKey = buildSnapshotKey(
    activeModel,
    instructions,
    normalizeContextMaxMessages(contextMaxMessagesDraft, contextMaxMessages)
  )

  const handleRestoreVersion = async (version: TrainingVersionDoc) => {
    if (!user || !db || !targetUserId) {
      throw new Error('auth_unavailable')
    }

    const currentSnapshot: TrainingSnapshot = {
      model: activeModel,
      instructions,
      contextMaxMessages: normalizeContextMaxMessages(contextMaxMessagesDraft, contextMaxMessages)
    }

    // Salvar um "pre-revert" para permitir desfazer restauração.
    try {
      await recordTrainingVersion(currentSnapshot, 'manual', {
        action: 'pre_revert',
        targetVersionId: version.id,
        client: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' }
      })
    } catch (err) {
      console.error('Erro ao salvar versão pre-revert:', err)
    }

    const mergedInstructions = { ...instructions, ...version.instructions }
    const nextInstructions = normalizeTrainingInstructions(mergedInstructions)
    const nextContextMaxMessages = normalizeContextMaxMessages(version.contextMaxMessages, CONTEXT_MAX_MESSAGES_DEFAULT)
    const nextSnapshot: TrainingSnapshot = {
      model: version.model,
      instructions: nextInstructions as any,
      contextMaxMessages: nextContextMaxMessages
    }

    // Evita um autosave duplicado causado pelo setState do restore.
    skipAutoSaveRef.current = true
    setActiveModel(version.model)
    setInstructions(nextInstructions)
    setContextMaxMessages(nextContextMaxMessages)
    setContextMaxMessagesDraft(String(nextContextMaxMessages))

    const ok = await handleSave({
      source: 'revert',
      snapshot: nextSnapshot,
      createVersion: true,
      versionReason: 'revert',
      versionMeta: {
        revertedFromVersionId: version.id,
        client: { userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' }
      }
    })

    if (!ok) {
      throw new Error('restore_failed')
    }
  }

  const guidedTutorialFromQuery = searchParams.get('guidedTutorial')
  const currentGuidedTutorialKey: GuidedTutorialKey = isGuidedTutorialKey(guidedTutorialFromQuery)
    ? guidedTutorialFromQuery
    : 'training'
  const nextGuidedTutorialKey = getGuidedTutorialNextKey(currentGuidedTutorialKey)
  const nextGuidedTutorialLabel = nextGuidedTutorialKey
    ? tr(
        GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].pt,
        GUIDED_TUTORIAL_TITLES[nextGuidedTutorialKey].en
      )
    : null

  const trainingGuideSteps: TrainingGuideStep[] = [
    {
      id: 'training-tabs',
      section: 'company',
      target: 'tabs',
      title: tr('Etapa 1: Abas de Treinamento', 'Step 1: Training tabs'),
      description: tr(
        'Visão geral das 3 abas: Descrição da Empresa, Configurações Básicas e Follow-up, CRM e Leads/Clientes.',
        'Overview of the 3 tabs: Company Description, Basic Settings, and Follow-up, CRM and Leads/Clients.'
      )
    },
    {
      id: 'company-section-intro',
      section: 'company',
      target: 'tabs',
      title: tr('Etapa 2: Descrição da Empresa', 'Step 2: Company Description'),
      description: tr(
        'Agora vamos para a aba Descrição da Empresa para preencher a base de conhecimento da IA.',
        'Now we are moving to the Company Description tab to fill AI knowledge base.'
      )
    },
    {
      id: 'company-name-description',
      section: 'company',
      target: 'companyNameDescription',
      title: tr('Etapa 3: Nome e descrição da empresa', 'Step 3: Company name and description'),
      description: tr(
        'Preencha nome da empresa e descrição do negócio para orientar a IA com contexto institucional.',
        'Fill company name and business description to guide AI with institutional context.'
      )
    },
    {
      id: 'company-hours-pricing',
      section: 'company',
      target: 'companyHoursValues',
      title: tr(
        'Etapa 4: Horários e descrição comercial',
        'Step 4: Business hours and commercial description'
      ),
      description: tr(
        'Defina horários e a descrição dos serviços/produtos vendidos para respostas comerciais consistentes.',
        'Define business hours and the sold services/products description for consistent commercial responses.'
      )
    },
    {
      id: 'company-other-info',
      section: 'company',
      target: 'companyOtherInfo',
      title: tr('Etapa 5: Outras informações importantes', 'Step 5: Other important information'),
      description: tr(
        'Inclua regras, observações e detalhes complementares relevantes para o atendimento.',
        'Include rules, notes, and complementary details relevant to support.'
      )
    },
    {
      id: 'basic-section-intro',
      section: 'basic',
      target: 'tabs',
      title: tr('Etapa 6: Configurações básicas', 'Step 6: Basic settings'),
      description: tr(
        'Agora vamos para a aba Configurações Básicas para ajustar comportamento, contexto e permissões da IA.',
        'Now we are moving to the Basic Settings tab to configure AI behavior, context and permissions.'
      )
    },
    {
      id: 'basic-ai-name',
      section: 'basic',
      target: 'basicAiName',
      title: tr('Etapa 7: Nome da IA', 'Step 7: AI name'),
      description: tr(
        'Defina a identidade da IA para padronizar o atendimento.',
        'Define AI identity to standardize customer support.'
      )
    },
    {
      id: 'basic-primary-toggles',
      section: 'basic',
      target: 'basicPrimaryToggles',
      title: tr('Etapa 8: 4 toggles principais', 'Step 8: 4 primary toggles'),
      description: tr(
        'Revise: Se apresentar como IA, Usar emojis, Desligar mensagem fora de contexto e Desligar IA se as últimas 2 mensagens não foram recebidas.',
        'Review: Introduce as AI, Use emojis, Disable out-of-context replies, and Disable AI if last 2 sent messages were not received.'
      )
    },
    {
      id: 'basic-human-recent',
      section: 'basic',
      target: 'basicHumanRecent',
      title: tr('Etapa 9: Humano recente', 'Step 9: Recent human message'),
      description: tr(
        'Configuração de segurança para desligar IA quando houver mensagem humana recente.',
        'Safety setting to disable AI when a recent human message exists.'
      )
    },
    {
      id: 'basic-fallback-handoff',
      section: 'basic',
      target: 'basicFallbackAndHandoff',
      title: tr('Etapa 10: Fallback e encaminhamento', 'Step 10: Fallback and handoff'),
      description: tr(
        'Ajuste o comportamento "Quando não souber responder" e a mensagem de encaminhamento para humano.',
        'Adjust "When it does not know how to answer" and the handoff message.'
      )
    },
    {
      id: 'basic-groups',
      section: 'basic',
      target: 'basicGroups',
      title: tr('Etapa 11: Grupos', 'Step 11: Groups'),
      description: tr(
        'Configure Responder também grupos e Esconder grupos (são opções mutuamente excludentes).',
        'Configure Reply in groups and Hide groups (mutually exclusive options).'
      )
    },
    {
      id: 'basic-context',
      section: 'basic',
      target: 'basicContext',
      title: tr('Etapa 12: Mensagens de contexto', 'Step 12: Context messages'),
      description: tr(
        'Defina quantas mensagens de histórico serão enviadas para a IA antes de cada resposta.',
        'Define how many history messages are sent to AI before each answer.'
      )
    },
    {
      id: 'basic-secondary-toggles',
      section: 'basic',
      target: 'basicSecondaryToggles',
      title: tr('Etapa 13: Outros 4 toggles', 'Step 13: Other 4 toggles'),
      description: tr(
        'Revise permissões de arquivos/contatos, áudios, leitura de imagens/PDF e agenda automática.',
        'Review permissions for files/contacts, audio, image/PDF reading, and automatic scheduling.'
      )
    },
    {
      id: 'basic-guidance-style',
      section: 'basic',
      target: 'basicGuidanceAndStyle',
      title: tr('Etapa 14: Orientações gerais e estilo', 'Step 14: General guidance and style'),
      description: tr(
        'Ajuste Orientações gerais e Tipo de resposta da IA para padronizar tom e qualidade.',
        'Adjust General guidance and AI response style to standardize tone and quality.'
      )
    },
    {
      id: 'basic-model-language',
      section: 'basic',
      target: 'basicModelLanguage',
      title: tr('Etapa 15: Modelo de linguagem', 'Step 15: Language model'),
      description: tr(
        'Abra o seletor e escolha o provedor de IA utilizado no atendimento.',
        'Open the selector and choose the AI provider used in support.'
      )
    },
    {
      id: 'crm-section-intro',
      section: 'crm',
      target: 'tabs',
      title: tr('Etapa 16: Follow-up, CRM e Leads/Clientes', 'Step 16: Follow-up, CRM and Leads/Clients'),
      description: tr(
        'Agora vamos para a aba de Follow-up, CRM e Leads/Clientes para configurar classificação e automações.',
        'Now we are moving to the Follow-up, CRM and Leads/Clients tab to configure classification and automations.'
      )
    },
    {
      id: 'crm-primary-toggles',
      section: 'crm',
      target: 'crmPrimaryToggles',
      title: tr('Etapa 17: 4 toggles de CRM', 'Step 17: 4 CRM toggles'),
      description: tr(
        'Revise: Responder clientes, Classificar leads, Diretrizes de observação/classificação e Autoaprovação.',
        'Review: Reply to clients, Classify leads, Notes/classification guidelines, and Auto-approval.'
      )
    },
    {
      id: 'crm-text-blocks',
      section: 'crm',
      target: 'crmTextBlocks',
      title: tr('Etapa 18: Blocos de texto de CRM', 'Step 18: CRM text blocks'),
      description: tr(
        'Diretrizes de classificação e instruções por tag (P. Passiva e P. Ativa). Conteúdo condicional: o toggle de diretrizes é ligado temporariamente durante o tutorial.',
        'Classification guidelines and tag instructions (P. Passiva and P. Ativa). Conditional content: the guidelines toggle is temporarily enabled during the tutorial.'
      )
    },
    {
      id: 'crm-followup-toggles',
      section: 'crm',
      target: 'crmFollowUpToggles',
      title: tr('Etapa 19: Toggles de follow-up', 'Step 19: Follow-up toggles'),
      description: tr(
        'Revise Permitir follow-up automático e Permitir follow-up automático para clientes.',
        'Review Allow automatic follow-up and Allow automatic follow-up for clients.'
      )
    },
    {
      id: 'crm-followup-texts',
      section: 'crm',
      target: 'crmFollowUpTextBlocks',
      title: tr('Etapa 20: Blocos de follow-up', 'Step 20: Follow-up text blocks'),
      description: tr(
        'Revise Orientações Gerais de Follow-up e instruções por tag de follow-up (P. Passiva/P. Ativa). Conteúdo condicional: o toggle de follow-up automático é ligado temporariamente durante o tutorial.',
        'Review General Follow-up Guidance and follow-up instructions by tag (P. Passiva/P. Ativa). Conditional content: automatic follow-up toggle is temporarily enabled during the tutorial.'
      )
    },
    {
      id: 'training-history',
      section: 'crm',
      target: 'trainingHistoryAction',
      title: tr('Etapa 21: Histórico', 'Step 21: History'),
      description: tr(
        'Use Histórico para revisar versões e restaurações de treinamento.',
        'Use History to review training versions and restores.'
      )
    },
    {
      id: 'training-save',
      section: 'crm',
      target: 'trainingSaveAction',
      title: tr('Etapa 22: Salvar configurações', 'Step 22: Save settings'),
      description: tr(
        'Depois da revisão, clique em Salvar configurações para aplicar as alterações.',
        'After reviewing, click Save settings to apply your changes.'
      )
    }
  ]
  const lastTrainingGuideStepIndex = trainingGuideSteps.length - 1
  const currentTrainingGuideStep = trainingGuideSteps[trainingGuideStepIndex] ?? trainingGuideSteps[0]

  const resolveTrainingGuideTarget = useCallback((target: TrainingGuideTarget) => {
    if (target === 'tabs') return tabsRef.current
    if (target === 'companyNameDescription') return companyNameRef.current ?? companyDescriptionRef.current
    if (target === 'companyHoursValues') return companyHoursValuesRef.current
    if (target === 'companyOtherInfo') return companyOtherInfoRef.current
    if (target === 'basicAiName') return basicAiNameRef.current
    if (target === 'basicPrimaryToggles') return basicPrimaryTogglesRef.current
    if (target === 'basicHumanRecent') return basicHumanRecentRef.current
    if (target === 'basicFallbackAndHandoff') return basicFallbackAndHandoffRef.current
    if (target === 'basicGroups') return basicGroupsRef.current
    if (target === 'basicContext') return basicContextRef.current
    if (target === 'basicSecondaryToggles') return basicSecondaryTogglesRef.current
    if (target === 'basicGuidanceAndStyle') return basicGuidanceAndStyleRef.current
    if (target === 'basicModelLanguage') return basicModelLanguageRef.current
    if (target === 'crmPrimaryToggles') return crmPrimaryTogglesRef.current
    if (target === 'crmTextBlocks') return crmTextBlocksRef.current
    if (target === 'crmFollowUpToggles') return crmFollowUpTogglesRef.current
    if (target === 'crmFollowUpTextBlocks') return crmFollowUpTextBlocksRef.current
    if (target === 'trainingHistoryAction') return trainingHistoryActionRef.current
    return trainingSaveActionRef.current
  }, [])

  const isTrainingGuideTargetActive = useCallback(
    (target: TrainingGuideTarget) => trainingGuideOpen && currentTrainingGuideStep.target === target,
    [currentTrainingGuideStep.target, trainingGuideOpen]
  )
  const trainingGuideHighlightClass =
    'relative z-[210] border-primary/80 shadow-[0_0_0_2px_rgba(34,197,94,0.55)] pointer-events-none'

  const restoreTrainingGuideTransientState = useCallback(() => {
    const restore = tutorialRestoreStateRef.current
    if (!restore) return

    setTrainingSection(restore.trainingSection)
    setIsModelLanguageOpen(restore.isModelLanguageOpen)
    setInstructions((prev) => ({
      ...prev,
      permitirSugestoesCamposLeadsClientes: restore.permitirSugestoesCamposLeadsClientes,
      aprovarAutomaticamenteSugestoesLeadsClientes: restore.aprovarAutomaticamenteSugestoesLeadsClientes,
      followUpAutomatico: normalizeFollowUpAutomaticConfig(
        restore.followUpAutomatico,
        normalizeFollowUpAutomaticConfig(prev.followUpAutomatico)
      )
    }))
    tutorialRestoreStateRef.current = null
  }, [])

  const closeTrainingGuide = useCallback(() => {
    trainingGuideSuppressAutoOpenRef.current = true
    setTrainingGuideOpen(false)
    setTrainingGuideStepIndex(0)
    setTrainingGuideCompletionModalOpen(false)

    const query = new URLSearchParams(searchParams.toString())
    if (query.has('guidedOnboarding')) {
      query.delete('guidedOnboarding')
    }
    if (query.has('guidedTutorial')) {
      query.delete('guidedTutorial')
    }
    const queryString = query.toString()
    router.replace(queryString ? `${pathname}?${queryString}` : pathname)

    restoreTrainingGuideTransientState()
  }, [pathname, restoreTrainingGuideTransientState, router, searchParams])

  const goToPreviousTrainingGuideStep = useCallback(() => {
    setTrainingGuideStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const goToNextTrainingGuideStep = useCallback(() => {
    setTrainingGuideStepIndex((current) => Math.min(lastTrainingGuideStepIndex, current + 1))
  }, [lastTrainingGuideStepIndex])

  const finishTrainingGuide = useCallback(() => {
    if (shouldShowGuidedTutorial && user?.uid) {
      markGuidedTutorialCompleted(user.uid, 'training')
    }
    setTrainingGuideCompletionModalOpen(true)
  }, [shouldShowGuidedTutorial, user?.uid])

  const goToNextGuidedTutorial = useCallback(() => {
    if (!nextGuidedTutorialKey) {
      closeTrainingGuide()
      return
    }

    restoreTrainingGuideTransientState()
    setTrainingGuideCompletionModalOpen(false)
    setTrainingGuideOpen(false)
    setTrainingGuideStepIndex(0)
    const nextRouteKey = GUIDED_TUTORIAL_ROUTE_KEYS[nextGuidedTutorialKey]
    router.push(
      toRoute(nextRouteKey, {
        query: {
          guidedOnboarding: '1',
          guidedTutorial: nextGuidedTutorialKey
        }
      })
    )
  }, [closeTrainingGuide, nextGuidedTutorialKey, restoreTrainingGuideTransientState, router, toRoute])

  useEffect(() => {
    setGuidePortalReady(true)
  }, [])

  useEffect(() => {
    const shouldOpen =
      shouldShowGuidedTutorial &&
      searchParams.get('guidedOnboarding') === '1' &&
      currentGuidedTutorialKey === 'training'

    if (!shouldOpen) {
      trainingGuideSuppressAutoOpenRef.current = false
      return
    }
    if (trainingGuideSuppressAutoOpenRef.current) return
    if (trainingGuideOpen) return

    setTrainingGuideOpen(true)
    setTrainingGuideStepIndex(0)
    setTrainingGuideCompletionModalOpen(false)
  }, [currentGuidedTutorialKey, searchParams, shouldShowGuidedTutorial, trainingGuideOpen])

  useEffect(() => {
    if (!trainingGuideOpen || tutorialRestoreStateRef.current) {
      return
    }

    const currentFollowUp = normalizeFollowUpAutomaticConfig(instructions.followUpAutomatico)
    tutorialRestoreStateRef.current = {
      trainingSection,
      isModelLanguageOpen,
      permitirSugestoesCamposLeadsClientes: instructions.permitirSugestoesCamposLeadsClientes,
      aprovarAutomaticamenteSugestoesLeadsClientes: instructions.aprovarAutomaticamenteSugestoesLeadsClientes,
      followUpAutomatico: currentFollowUp
    }

    setInstructions((prev) => {
      const followUpCurrent = normalizeFollowUpAutomaticConfig(prev.followUpAutomatico)
      return {
        ...prev,
        permitirSugestoesCamposLeadsClientes: true,
        followUpAutomatico: normalizeFollowUpAutomaticConfig(
          {
            ...followUpCurrent,
            enabled: true
          },
          followUpCurrent
        )
      }
    })
  }, [
    instructions.aprovarAutomaticamenteSugestoesLeadsClientes,
    instructions.followUpAutomatico,
    instructions.permitirSugestoesCamposLeadsClientes,
    isModelLanguageOpen,
    trainingGuideOpen,
    trainingSection
  ])

  useEffect(() => {
    if (!trainingGuideOpen) {
      return
    }

    const step = currentTrainingGuideStep
    if (trainingSection !== step.section) {
      setTrainingSection(step.section)
    }

    if (step.target === 'basicModelLanguage' && !isModelLanguageOpen) {
      setIsModelLanguageOpen(true)
    }
  }, [currentTrainingGuideStep, isModelLanguageOpen, trainingGuideOpen, trainingSection])

  useEffect(() => {
    if (!trainingGuideOpen) {
      return
    }

    const stepTarget = currentTrainingGuideStep.target
    if (
      stepTarget === 'crmTextBlocks' &&
      !instructions.permitirSugestoesCamposLeadsClientes
    ) {
      setInstructions((prev) => {
        if (prev.permitirSugestoesCamposLeadsClientes) {
          return prev
        }
        return {
          ...prev,
          permitirSugestoesCamposLeadsClientes: true
        }
      })
    }

    if (stepTarget === 'crmFollowUpToggles' || stepTarget === 'crmFollowUpTextBlocks') {
      const currentFollowUp = normalizeFollowUpAutomaticConfig(instructions.followUpAutomatico)
      if (!currentFollowUp.enabled) {
        setInstructions((prev) => {
          const followUpCurrent = normalizeFollowUpAutomaticConfig(prev.followUpAutomatico)
          if (followUpCurrent.enabled) {
            return prev
          }
          return {
            ...prev,
            followUpAutomatico: normalizeFollowUpAutomaticConfig(
              {
                ...followUpCurrent,
                enabled: true
              },
              followUpCurrent
            )
          }
        })
      }
    }
  }, [
    currentTrainingGuideStep.target,
    instructions.followUpAutomatico,
    instructions.permitirSugestoesCamposLeadsClientes,
    trainingGuideOpen
  ])

  useEffect(() => {
    if (!trainingGuideOpen) {
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [trainingGuideOpen])

  useEffect(() => {
    if (!trainingGuideOpen) {
      return
    }

    const scrollToTarget = () => {
      const target = resolveTrainingGuideTarget(currentTrainingGuideStep.target)
      if (!target) {
        return
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }

    const timeoutA = window.setTimeout(scrollToTarget, 120)
    const timeoutB = window.setTimeout(scrollToTarget, 420)
    return () => {
      window.clearTimeout(timeoutA)
      window.clearTimeout(timeoutB)
    }
  }, [currentTrainingGuideStep, resolveTrainingGuideTarget, trainingGuideOpen, trainingSection, isModelLanguageOpen])

  useEffect(() => {
    if (!trainingGuideOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (trainingGuideCompletionModalOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeTrainingGuide()
        }
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeTrainingGuide()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPreviousTrainingGuideStep()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (trainingGuideStepIndex < lastTrainingGuideStepIndex) {
          goToNextTrainingGuideStep()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    closeTrainingGuide,
    goToNextTrainingGuideStep,
    goToPreviousTrainingGuideStep,
    lastTrainingGuideStepIndex,
    trainingGuideCompletionModalOpen,
    trainingGuideOpen,
    trainingGuideStepIndex
  ])

  if (isInitialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-gray-400">{tr('Carregando suas configurações...', 'Loading your settings...')}</p>
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Brain className="w-8 h-8 text-primary" />
            {tr('Treinamento da IA', 'AI Training')}
          </h1>
          <p className="text-gray-400">
            {isAdminViewer
              ? userName
                ? `Usuário: ${userName}`
                : 'Edite as configurações de treinamento do usuário selecionado.'
              : tr(
                  'Configure como a inteligência artificial deve se comportar e quais informações ela deve usar para responder seus clientes.',
                  'Configure how AI should behave and what information it should use to answer your clients.'
                )}
          </p>
        </div>
        {shouldShowCopilotCta ? (
          <Link
            href={toRoute('training_copilot')}
            className={cn(buttonVariants({ variant: 'outline' }), 'bg-surface border-surface-lighter')}
          >
            {tr('Treinar com IA', 'Train with AI')}
          </Link>
        ) : null}
      </div>

      <div className="flex justify-center">
        <div
          ref={tabsRef}
          className={cn(
            'w-full max-w-5xl rounded-2xl border border-surface-lighter bg-surface-light p-2 shadow-sm',
            isTrainingGuideTargetActive('tabs') && trainingGuideHighlightClass
          )}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setTrainingSection('company')}
              className={cn(
                'group rounded-xl border px-4 py-3 text-left transition-all',
                trainingSection === 'company'
                  ? 'border-primary/70 bg-gradient-to-r from-primary/20 to-primary/5 text-white shadow-[0_0_0_1px_rgba(34,197,94,0.25)]'
                  : 'border-surface-lighter bg-surface text-gray-300 hover:border-primary/40 hover:text-white'
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{tr('Descrição da empresa', 'Company description')}</span>
              </div>
              <div className="text-[11px] text-gray-400">
                {tr(
                  'Dados da empresa, descrição comercial e horários.',
                  'Company data, commercial description, and business hours.'
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTrainingSection('basic')}
              className={cn(
                'group rounded-xl border px-4 py-3 text-left transition-all',
                trainingSection === 'basic'
                  ? 'border-primary/70 bg-gradient-to-r from-primary/20 to-primary/5 text-white shadow-[0_0_0_1px_rgba(34,197,94,0.25)]'
                  : 'border-surface-lighter bg-surface text-gray-300 hover:border-primary/40 hover:text-white'
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{tr('Configurações básicas', 'Basic settings')}</span>
              </div>
              <div className="text-[11px] text-gray-400">
                {tr('Comportamento geral, contexto, mídia e agenda.', 'General behavior, context, media, and scheduling.')}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTrainingSection('crm')}
              className={cn(
                'group rounded-xl border px-4 py-3 text-left transition-all',
                trainingSection === 'crm'
                  ? 'border-primary/70 bg-gradient-to-r from-primary/20 to-primary/5 text-white shadow-[0_0_0_1px_rgba(34,197,94,0.25)]'
                  : 'border-surface-lighter bg-surface text-gray-300 hover:border-primary/40 hover:text-white'
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{tr('Follow-up, CRM e Leads/Clientes', 'Follow-up, CRM and Leads/Clients')}</span>
              </div>
              <div className="text-[11px] text-gray-400">
                {tr('Automação de follow-up, classificação e regras do CRM.', 'Follow-up automation, classification, and CRM rules.')}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Instructions Form */}
      <div className="bg-surface-light border border-surface-lighter rounded-2xl p-4 shadow-sm space-y-6 sm:p-6 md:p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <SectionHeaderIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{sectionInstructionHeader.title}</h2>
            <p className="text-sm text-gray-400">{sectionInstructionHeader.description}</p>
          </div>
        </div>

        <div className="grid gap-6 [&>*]:min-w-0">
          {trainingSection !== 'crm' && (
            <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
              {trainingSection === 'company' && (
                <div
                  ref={companyNameRef}
                  className={cn(
                    'space-y-2 rounded-xl border border-transparent p-1',
                    isTrainingGuideTargetActive('companyNameDescription') && trainingGuideHighlightClass
                  )}
                >
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    {tr('Nome da empresa', 'Company name')}
                    <ToggleHelp
                      text={tr(
                        'Este nome é usado pela IA para se referir ao seu negócio durante o atendimento.',
                        'This name is used by AI to refer to your business during support.'
                      )}
                    />
                  </label>
                  <Input 
                    placeholder={tr('Ex: UP Gestão de Recursos', 'Ex: UP Resource Management')}
                    value={instructions.nomeEmpresa}
                    onChange={(e) => handleInputChange('nomeEmpresa', e.target.value)}
                  />
                </div>
              )}
              {trainingSection === 'basic' && (
                <div
                  ref={basicAiNameRef}
                  className={cn(
                    'space-y-2 rounded-xl border border-transparent p-1',
                    isTrainingGuideTargetActive('basicAiName') && trainingGuideHighlightClass
                  )}
                >
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    {tr('Nome da IA', 'AI name')}
                    <ToggleHelp
                      text={tr(
                        'Define como a assistente será chamada nas conversas quando esse nome for utilizado.',
                        'Defines how the assistant will be called in conversations when this name is used.'
                      )}
                    />
                  </label>
                  <Input 
                    placeholder={tr('Ex: Mario', 'Ex: Maya')}
                    value={instructions.nomeIA}
                    onChange={(e) => handleInputChange('nomeIA', e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {trainingSection === 'basic' && (
          <>
          <div
            className={cn(
              'grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0'
            )}
          >
            <div
              ref={basicPrimaryTogglesRef}
              className={cn(
                'flex min-w-0 flex-col items-start gap-3 rounded-xl border border-surface-lighter bg-surface p-4 md:flex-row md:items-center md:justify-between',
                isTrainingGuideTargetActive('basicPrimaryToggles') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Se apresentar como IA', 'Introduce as AI')}</label>
                  <ToggleHelp
                    text={tr(
                      'Quando ativado, a IA se identifica como assistente virtual nas mensagens de apresentação. Quando desativado, ela não se identifica como IA.',
                      'When enabled, AI introduces itself as a virtual assistant. When disabled, it does not identify itself as AI.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">{tr('A IA dirá que é um assistente virtual', 'AI will say it is a virtual assistant')}</p>
              </div>
              <Switch 
                checked={instructions.seApresentarComoIA}
                onCheckedChange={(checked) => handleInputChange('seApresentarComoIA', checked)}
              />
            </div>

            <div
              className={cn(
                'flex min-w-0 flex-col items-start gap-3 rounded-xl border border-surface-lighter bg-surface p-4 md:flex-row md:items-center md:justify-between',
                isTrainingGuideTargetActive('basicPrimaryToggles') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Usar emojis ocasionalmente', 'Use emojis occasionally')}</label>
                  <ToggleHelp
                    text={tr(
                      'Ative para permitir uma linguagem mais descontraída. Desative para manter comunicação mais neutra e profissional.',
                      'Enable to allow a more casual tone. Disable to keep communication more neutral and professional.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">{tr('Torna a conversa mais amigavel', 'Makes the conversation friendlier')}</p>
              </div>
              <Switch 
                checked={instructions.usarEmojis}
                onCheckedChange={(checked) => handleInputChange('usarEmojis', checked)}
              />
            </div>

            <div
              className={cn(
                'flex min-w-0 flex-col items-start gap-3 rounded-xl border border-surface-lighter bg-surface p-4 md:flex-row md:items-center md:justify-between',
                isTrainingGuideTargetActive('basicPrimaryToggles') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Desligar mensagem fora de contexto', 'Disable out-of-context replies')}</label>
                  <ToggleHelp
                    text={tr(
                      'Se a IA responder N/A, o chat é desativado. Se o modo Encaminhar estiver ativo, uma última mensagem é enviada.',
                      'If AI returns N/A, the chat is disabled. If Handoff mode is enabled, one final message is sent.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">{tr('Evita respostas quando a mensagem não é relevante', 'Avoids replies when the message is not relevant')}</p>
              </div>
              <Switch 
                checked={instructions.desligarMensagemForaContexto}
                onCheckedChange={(checked) => handleInputChange('desligarMensagemForaContexto', checked)}
              />
            </div>

            <div
              className={cn(
                'flex min-w-0 flex-col items-start gap-3 rounded-xl border border-surface-lighter bg-surface p-4 md:flex-row md:items-center md:justify-between',
                isTrainingGuideTargetActive('basicPrimaryToggles') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">
                    {tr(
                      'Desligar IA se as últimas 2 mensagens enviadas não foram recebidas',
                      'Disable AI if the last 2 sent messages were not received'
                    )}
                  </label>
                  <ToggleHelp
                    text={tr(
                      'Quando ativado, a IA desliga automaticamente nesta conversa se as 2 últimas mensagens enviadas permanecerem sem entrega. Em "failed", bloqueia na hora. Em "sent", aguarda 5 minutos.',
                      'When enabled, AI is automatically turned off in this chat if the 2 latest sent messages remain undelivered. For "failed", it blocks immediately. For "sent", it waits 5 minutes.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {instructions.desligarIASeUltimasDuasMensagensNãoRecebidas
                    ? tr('Proteção de entregabilidade ativa', 'Deliverability safety guard enabled')
                    : tr('Proteção de entregabilidade desativada', 'Deliverability safety guard disabled')}
                </p>
              </div>
              <Switch
                checked={instructions.desligarIASeUltimasDuasMensagensNãoRecebidas}
                onCheckedChange={(checked) =>
                  handleInputChange('desligarIASeUltimasDuasMensagensNãoRecebidas', checked)
                }
              />
            </div>

            <div
              ref={basicHumanRecentRef}
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-4 lg:col-span-2',
                isTrainingGuideTargetActive('basicHumanRecent') && trainingGuideHighlightClass
              )}
            >
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">
                      {tr(
                        'Desligar IA se humano mandou mensagem recentemente',
                        'Disable AI if a human sent a message recently'
                      )}
                    </label>
                    <ToggleHelp
                      text={tr(
                        'Quando ativado, a IA desliga nesta conversa se encontrar mensagem humana recente enviada no painel/celular/web. A regra usa OU entre os critérios ativos abaixo.',
                        'When enabled, AI is disabled in this chat if a recent human message is found from dashboard/mobile/web. The rule uses OR across the active criteria below.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {instructions.desligarIASeHumanoRecente
                      ? tr('Bloqueio por atividade humana recente ativo', 'Recent human activity guard enabled')
                      : tr('Bloqueio por atividade humana recente desativado', 'Recent human activity guard disabled')}
                  </p>
                </div>
                <Switch
                  checked={instructions.desligarIASeHumanoRecente}
                  onCheckedChange={handleRecentHumanGuardChange}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-surface-lighter bg-surface-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-300">
                        {tr('Considerar janela de dias', 'Use day window')}
                      </label>
                      <p className="text-[11px] text-gray-500">
                        {tr(
                          'Bloqueia se houver mensagem humana enviada dentro dos últimos X dias.',
                          'Blocks if a human message was sent within the last X days.'
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={instructions.desligarIASeHumanoRecenteUsarDias}
                      disabled={!instructions.desligarIASeHumanoRecente}
                      onCheckedChange={(checked) =>
                        handleRecentHumanCriterionToggle('desligarIASeHumanoRecenteUsarDias', checked)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      {tr('Janela de dias (X)', 'Day window (X)')}
                    </label>
                    <Input
                      type="number"
                      min={RECENT_HUMAN_DAYS_MIN}
                      max={RECENT_HUMAN_DAYS_MAX}
                      step={1}
                      disabled={
                        !instructions.desligarIASeHumanoRecente ||
                        !instructions.desligarIASeHumanoRecenteUsarDias
                      }
                      value={instructions.desligarIASeHumanoRecenteDias}
                      onChange={(e) => handleRecentHumanDaysChange(e.target.value)}
                    />
                    <p className="text-[11px] text-gray-500">
                      {tr(
                        `Entre ${RECENT_HUMAN_DAYS_MIN} e ${RECENT_HUMAN_DAYS_MAX} dias.`,
                        `Between ${RECENT_HUMAN_DAYS_MIN} and ${RECENT_HUMAN_DAYS_MAX} days.`
                      )}
                    </p>
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-surface-lighter bg-surface-light p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-300">
                        {tr('Considerar últimas mensagens', 'Use latest messages')}
                      </label>
                      <p className="text-[11px] text-gray-500">
                        {tr(
                          'Bloqueia se houver mensagem humana entre as últimas Y mensagens da conversa.',
                          'Blocks if a human message exists within the latest Y messages in the chat.'
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={instructions.desligarIASeHumanoRecenteUsarMensagens}
                      disabled={!instructions.desligarIASeHumanoRecente}
                      onCheckedChange={(checked) =>
                        handleRecentHumanCriterionToggle(
                          'desligarIASeHumanoRecenteUsarMensagens',
                          checked
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      {tr('Últimas mensagens (Y)', 'Latest messages (Y)')}
                    </label>
                    <Input
                      type="number"
                      min={RECENT_HUMAN_MESSAGES_MIN}
                      max={RECENT_HUMAN_MESSAGES_MAX}
                      step={1}
                      disabled={
                        !instructions.desligarIASeHumanoRecente ||
                        !instructions.desligarIASeHumanoRecenteUsarMensagens
                      }
                      value={instructions.desligarIASeHumanoRecenteMensagens}
                      onChange={(e) => handleRecentHumanMessagesChange(e.target.value)}
                    />
                    <p className="text-[11px] text-gray-500">
                      {tr(
                        `Entre ${RECENT_HUMAN_MESSAGES_MIN} e ${RECENT_HUMAN_MESSAGES_MAX} mensagens.`,
                        `Between ${RECENT_HUMAN_MESSAGES_MIN} and ${RECENT_HUMAN_MESSAGES_MAX} messages.`
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div
            className={cn(
              'grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0'
            )}
          >
            <div
              ref={basicFallbackAndHandoffRef}
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-3 lg:col-span-2',
                isTrainingGuideTargetActive('basicFallbackAndHandoff') && trainingGuideHighlightClass
              )}
            >
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">{tr('Quando não souber responder', 'When it does not know how to answer')}</label>
                    <ToggleHelp
                      text={tr(
                        "Define o que acontece quando a IA retorna N/A: Silêncio não responde; Encaminhar envia uma mensagem informando que um humano responderá. Se 'Desligar mensagem fora de contexto' estiver ativo, a mensagem é enviada e o chat é desativado.",
                        "Defines what happens when AI returns N/A: Silence sends no reply; Handoff sends a message saying a human will reply. If 'Disable out-of-context replies' is enabled, the message is sent and the chat is disabled."
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {instructions.comportamentoNãoSabe === 'encaminhar'
                      ? tr('Avisara que vai encaminhar para um humano', 'Will notify that it is handing off to a human')
                      : tr('A IA ficará em silêncio e não responderá', 'AI will stay silent and not reply')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{tr('Silêncio', 'Silence')}</span>
                  <Switch
                    checked={instructions.comportamentoNãoSabe === 'encaminhar'}
                    onCheckedChange={(checked) => handleInputChange('comportamentoNãoSabe', checked ? 'encaminhar' : 'silêncio')}
                  />
                  <span className="text-xs text-gray-400">{tr('Encaminhar', 'Handoff')}</span>
                </div>
              </div>
            </div>

            <div
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-3 lg:col-span-2',
                isTrainingGuideTargetActive('basicFallbackAndHandoff') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">
                    {instructions.permitirIATextoPersonalizadoAoEncaminharHumano
                      ? tr(
                          'Mensagem fixa de fallback ao encaminhar para um humano',
                          'Fixed fallback message when handing off to a human'
                        )
                      : tr('Mensagem ao encaminhar para um humano', 'Message when handing off to a human')}
                  </label>
                  <ToggleHelp
                    text={tr(
                      instructions.permitirIATextoPersonalizadoAoEncaminharHumano
                        ? 'Usada como fallback quando a IA não conseguir gerar uma mensagem personalizada de encaminhamento. Se estiver vazio, usa o texto padrão.'
                        : 'Enviada quando a IA retornar N/A e o modo Encaminhar estiver ativo. Se estiver vazio, usa o texto padrão.',
                      instructions.permitirIATextoPersonalizadoAoEncaminharHumano
                        ? 'Used as fallback when the AI cannot generate a personalized handoff message. If empty, the default text is used.'
                        : 'Sent when AI returns N/A and Handoff mode is enabled. If empty, the default text is used.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {instructions.comportamentoNãoSabe === 'encaminhar'
                    ? instructions.permitirIATextoPersonalizadoAoEncaminharHumano
                      ? tr(
                          'A IA tentará gerar uma mensagem curta e contextual antes do handoff. Se falhar, este texto será usado.',
                          'The AI will try to generate a short contextual message before handoff. If it fails, this text will be used.'
                        )
                      : tr(
                          'Enviada quando a IA retornar N/A e o modo Encaminhar estiver ativo.',
                          'Sent when AI returns N/A and Handoff mode is enabled.'
                        )
                    : tr('Não será usada enquanto estiver em modo Silêncio.', 'It will not be used while Silence mode is active.')}
                </p>
              </div>
              <CollapsibleTextarea
                placeholder={tr('Ex: Vou passar o seu atendimento para um humano.', 'Ex: I will transfer your request to a human specialist.')}
                value={instructions.mensagemEncaminharHumano}
                onChange={(value) => handleInputChange('mensagemEncaminharHumano', value)}
                className="min-h-[90px]"
              />
              {instructions.comportamentoNãoSabe === 'encaminhar' ? (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-surface-lighter bg-surface-light/40 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-0.5 min-w-0 break-words">
                    <div className="flex items-start gap-2">
                      <label className="text-sm font-medium text-white">
                        {tr(
                          'Permitir que a IA envie textos personalizados ao encaminhar uma conversa para um humano',
                          'Allow the AI to send personalized text when handing a conversation off to a human'
                        )}
                      </label>
                      <ToggleHelp
                        text={tr(
                          'Quando ativado, a IA tenta gerar uma mensagem curta e contextual antes de encaminhar a conversa. Se a geração falhar, o sistema usa a mensagem fixa acima. Em modo Silêncio, esta opção não tem efeito.',
                          'When enabled, the AI tries to generate a short contextual message before handing off the conversation. If generation fails, the system uses the fixed fallback message above. In Silence mode, this option has no effect.'
                        )}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {instructions.permitirIATextoPersonalizadoAoEncaminharHumano
                        ? tr(
                            'A IA poderá contextualizar o handoff sem responder a dúvida pendente.',
                            'The AI may contextualize the handoff without answering the pending question.'
                          )
                        : tr(
                            'Desligado: o sistema usará apenas a mensagem fixa de handoff.',
                            'Disabled: the system will use only the fixed handoff message.'
                          )}
                    </p>
                  </div>
                  <Switch
                    checked={instructions.permitirIATextoPersonalizadoAoEncaminharHumano}
                    onCheckedChange={(checked) =>
                      handleInputChange('permitirIATextoPersonalizadoAoEncaminharHumano', checked)
                    }
                  />
                </div>
              ) : null}
            </div>

            <div
              ref={basicGroupsRef}
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-3',
                isTrainingGuideTargetActive('basicGroups') && trainingGuideHighlightClass
              )}
            >
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">{tr('Responder também em grupos', 'Reply in groups too')}</label>
                    <ToggleHelp
                      text={tr(
                        'Quando ativado, a IA pode responder mensagens recebidas em grupos. Se desligado, grupos serão ignorados pela IA.',
                        'When enabled, AI may reply to messages received in groups. If disabled, groups are ignored by AI.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {instructions.responderGrupos
                      ? tr('A IA responderá mensagens em grupos', 'AI will reply to group messages')
                      : tr('A IA ignorará mensagens enviadas em grupos', 'AI will ignore messages sent in groups')}
                  </p>
                </div>
                <Switch 
                  checked={instructions.responderGrupos}
                  onCheckedChange={(checked) => handleInputChange('responderGrupos', checked)}
                />
              </div>
            </div>

            <div
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-3',
                isTrainingGuideTargetActive('basicGroups') && trainingGuideHighlightClass
              )}
            >
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">{tr('Esconder grupos', 'Hide groups')}</label>
                    <ToggleHelp
                      text={tr(
                        'Oculta grupos na aba Conversas e desliga automaticamente a resposta em grupos para evitar conflito de configuração.',
                        'Hides groups in the Conversations tab and automatically disables group replies to avoid configuration conflicts.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {instructions.esconderGrupos
                      ? tr(
                          'Grupos ficam ocultos na aba de conversas e a IA para de responder grupos',
                          'Groups are hidden in the conversations tab and AI stops replying in groups'
                        )
                      : tr(
                          'Grupos continuam visíveis na aba de conversas',
                          'Groups remain visible in the conversations tab'
                        )}
                  </p>
                </div>
                <Switch
                  checked={instructions.esconderGrupos}
                  onCheckedChange={(checked) => handleInputChange('esconderGrupos', checked)}
                />
              </div>
            </div>

            <div
              ref={basicContextRef}
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-3 lg:col-span-2',
                isTrainingGuideTargetActive('basicContext') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Mensagens de contexto (histórico)', 'Context messages (history)')}</label>
                  <ToggleHelp
                    text={tr(
                      'Quantas mensagens mais recentes vão para a IA como contexto. Min 10, max 100. Valores maiores podem aumentar o consumo de créditos.',
                      'How many recent messages are sent to AI as context. Min 10, max 100. Higher values may increase credit usage.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {tr(
                    `Quantas mensagens mais recentes vão para a IA. Min ${CONTEXT_MAX_MESSAGES_MIN}, max ${CONTEXT_MAX_MESSAGES_MAX}.`,
                    `How many recent messages go to AI. Min ${CONTEXT_MAX_MESSAGES_MIN}, max ${CONTEXT_MAX_MESSAGES_MAX}.`
                  )}
                </p>
              </div>
              <Input
                type="number"
                min={CONTEXT_MAX_MESSAGES_MIN}
                max={CONTEXT_MAX_MESSAGES_MAX}
                step={1}
                value={contextMaxMessagesDraft}
                onChange={(e) => handleContextMaxMessagesChange(e.target.value)}
                onBlur={handleContextMaxMessagesBlur}
              />
            </div>
          </div>
          </>
          )}

          {trainingSection === 'crm' && (
          <>
          <div
            ref={crmPrimaryTogglesRef}
            className={cn(
              'grid grid-cols-1 gap-3 rounded-xl border border-transparent p-1 md:grid-cols-2 [&>*]:min-w-0',
              isTrainingGuideTargetActive('crmPrimaryToggles') && trainingGuideHighlightClass
            )}
          >
            <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">{tr('Responder clientes', 'Reply to clients')}</label>
                    <ToggleHelp
                      text={tr(
                        'Controla se a IA responderá automaticamente contatos já classificados como cliente no CRM.',
                        'Controls whether AI will automatically reply to contacts already classified as clients in CRM.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {instructions.responderClientes
                      ? tr('A IA responderá clientes cadastrados', 'AI will reply to registered clients')
                      : tr('A IA ignorará mensagens de clientes cadastrados', 'AI will ignore messages from registered clients')}
                  </p>
                </div>
                <Switch 
                  checked={instructions.responderClientes}
                  onCheckedChange={(checked) => handleInputChange('responderClientes', checked)}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">{tr('Classificar leads como clientes automaticamente', 'Auto-classify leads as clients')}</label>
                    <ToggleHelp
                      text={tr(
                        "Quando ativado, a IA identifica se um lead já é cliente e converte automaticamente. Se 'Responder clientes' estiver desativado, a IA não responderá após a conversão.",
                        "When enabled, AI identifies if a lead is already a client and converts automatically. If 'Reply to clients' is disabled, AI will not respond after conversion."
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {instructions.autoClassificarLeadComoCliente
                      ? tr('A IA vai converter leads identificados como clientes', 'AI will convert leads identified as clients')
                      : tr('A IA não fará conversão automática de leads', 'AI will not auto-convert leads')}
                  </p>
                </div>
                <Switch
                  checked={instructions.autoClassificarLeadComoCliente}
                  onCheckedChange={(checked) => handleInputChange('autoClassificarLeadComoCliente', checked)}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">
                      {tr(
                        'Diretrizes para Observação e Classificação de Leads e Clientes',
                        'Guidelines for lead/client notes and classification'
                      )}
                    </label>
                    <ToggleHelp
                      text={tr(
                        'Gera sugestões após cada resposta da IA e praticamente dobra o consumo de créditos; revise em Leads/Clientes.',
                        'Generates suggestions after each AI response and can nearly double credit usage; review in Leads/Clients.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {tr(
                      'A IA passa a usar suas regras para decidir observações, status e próximo contato de cada lead/cliente.',
                      'AI starts using your rules to decide notes, status, and next contact for each lead/client.'
                    )}
                  </p>
                </div>
                <Switch
                  checked={instructions.permitirSugestoesCamposLeadsClientes}
                  onCheckedChange={(checked) => handleInputChange('permitirSugestoesCamposLeadsClientes', checked)}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
              <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">
                      {tr(
                        'Aprovar automaticamente as sugestões/alterações da IA nos leads e clientes',
                        'Automatically approve AI suggestions/changes for leads and clients'
                      )}
                    </label>
                    <ToggleHelp
                      text={tr(
                        'Quando ativado, a IA aplica automaticamente status, observações e próximo contato em Leads/Clientes, sem revisão manual.',
                        'When enabled, AI automatically applies status, notes and next contact in Leads/Clients without manual review.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {!instructions.permitirSugestoesCamposLeadsClientes
                      ? tr('Ative o toggle de sugestões para habilitar a autoaprovação.', 'Enable the suggestions toggle to allow auto-approval.')
                      : instructions.aprovarAutomaticamenteSugestoesLeadsClientes
                        ? tr('A IA aplicará automaticamente as alterações sugeridas.', 'AI will automatically apply the suggested changes.')
                        : tr('As alterações continuarão pendentes para revisão manual.', 'Changes will remain pending for manual review.')}
                  </p>
                </div>
                <Switch
                  checked={instructions.aprovarAutomaticamenteSugestoesLeadsClientes}
                  disabled={!instructions.permitirSugestoesCamposLeadsClientes}
                  onCheckedChange={(checked) => handleInputChange('aprovarAutomaticamenteSugestoesLeadsClientes', checked)}
                />
              </div>
            </div>
          </div>

          {instructions.permitirSugestoesCamposLeadsClientes && (
            <div
              ref={crmTextBlocksRef}
              className={cn(
                'p-4 rounded-xl border border-surface-lighter bg-surface space-y-3',
                isTrainingGuideTargetActive('crmTextBlocks') && trainingGuideHighlightClass
              )}
            >
              <div className="space-y-0.5 min-w-0 break-words">
                <label className="text-sm font-medium text-white">
                  {tr(
                    'Diretrizes da IA para Classificação de Leads e Clientes.',
                    'AI guidelines for lead and client classification.'
                  )}
                </label>
                <p className="text-xs text-gray-400">
                  {tr(
                    'Defina como a IA deve classificar leads e clientes e em quais cenários pode sugerir ou aplicar alterações em observações, status e próximo contato no CRM.',
                    'Define how AI should classify leads and clients, and when it may suggest or apply updates to notes, status, and next contact in CRM.'
                  )}
                </p>
              </div>
              <CollapsibleTextarea
                placeholder={tr(
                  'Descreva as regras que a IA deve seguir para sugerir alterações no CRM.',
                  'Describe the rules AI should follow to suggest CRM updates.'
                )}
                value={instructions.instrucoesSugestoesLeadsClientes}
                onChange={(value) => handleInputChange('instrucoesSugestoesLeadsClientes', value)}
                className="min-h-[140px]"
              />
            </div>
          )}

          <div
            className={cn(
              'grid grid-cols-1 gap-4 rounded-xl border border-transparent p-1 xl:grid-cols-2 [&>*]:min-w-0',
              isTrainingGuideTargetActive('crmTextBlocks') && trainingGuideHighlightClass
            )}
          >
            <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-2">
              <label className="text-sm font-medium text-gray-300">
                {tr('Instruções para leads com tag P. Passiva', 'Instructions for leads with tag P. Passiva')}
              </label>
              <p className="text-xs text-gray-400">
                {tr(
                  'Use este campo para orientar a IA quando o lead iniciou a conversa e já demonstra interesse.',
                  'Use this field to guide AI when the lead started the conversation and already shows interest.'
                )}
              </p>
              <CollapsibleTextarea
                placeholder={tr(
                  'Ex: Responda de forma objetiva, avance para qualificação e conduza para oferta ou agendamento.',
                  'Ex: Reply objectively, move to qualification, and guide toward offer or scheduling.'
                )}
                value={instructions.instrucoesLeadsTagPassiva}
                onChange={(value) => handleInputChange('instrucoesLeadsTagPassiva', value)}
                className="min-h-[120px]"
              />
            </div>

            <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-2">
              <label className="text-sm font-medium text-gray-300">
                {tr('Instruções para leads com tag P. Ativa', 'Instructions for leads with tag P. Ativa')}
              </label>
              <p className="text-xs text-gray-400">
                {tr(
                  'Use este campo para orientar a IA quando o contato veio de prospecção ativa e ainda não está interessado.',
                  'Use this field to guide AI when the contact came from outbound outreach and is not yet interested.'
                )}
              </p>
              <CollapsibleTextarea
                placeholder={tr(
                  'Ex: Não assuma interesse imediato, gere curiosidade e valide interesse antes de ofertar.',
                  'Ex: Do not assume immediate intent, build curiosity, and validate interest before pitching.'
                )}
                value={instructions.instrucoesLeadsTagAtiva}
                onChange={(value) => handleInputChange('instrucoesLeadsTagAtiva', value)}
                className="min-h-[120px]"
              />
            </div>
          </div>

          <div
            ref={crmFollowUpTogglesRef}
            className={cn(
              'space-y-3 rounded-xl border border-transparent p-1 [&>*]:min-w-0',
              isTrainingGuideTargetActive('crmFollowUpToggles') && trainingGuideHighlightClass
            )}
          >
            <div className="w-full min-w-0 rounded-xl border border-surface-lighter bg-surface p-4 overflow-hidden">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="space-y-0.5 min-w-0 break-words">
                  <div className="flex items-start gap-2">
                    <label className="text-sm font-medium text-white">{tr('Permitir follow-up automático', 'Allow automatic follow-up')}</label>
                    <ToggleHelp
                      text={tr(
                        'Quando ativado, o sistema envia follow-ups automaticamente usando o campo de próximo contato como gatilho.',
                        'When enabled, the system sends follow-ups automatically using the next contact field as trigger.'
                      )}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {followUpAutomatic.enabled
                      ? tr('Follow-up automático ativo para contatos elegíveis.', 'Automatic follow-up active for eligible contacts.')
                      : tr('Follow-up automático desativado.', 'Automatic follow-up disabled.')}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Switch
                    checked={followUpAutomatic.enabled}
                    onCheckedChange={handleFollowUpEnabledChange}
                  />
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-surface-lighter/80 bg-surface-light/40 p-3 overflow-hidden">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="space-y-0.5 min-w-0 break-words">
                    <div className="flex items-start gap-2">
                      <label className="text-sm font-medium text-white">{tr('Permitir follow-up automático para clientes', 'Allow automatic follow-up for clients')}</label>
                      <ToggleHelp
                        text={tr(
                          'Se ligado, clientes também entram no fluxo automático de follow-up. Se desligado, apenas leads recebem follow-up.',
                          'If enabled, clients are also included in the automatic follow-up flow. If disabled, only leads receive follow-up.'
                        )}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {followUpAutomatic.allowClients
                        ? tr('Clientes entram no fluxo automático.', 'Clients are included in the automatic flow.')
                        : tr('Somente leads entram no fluxo automático.', 'Only leads are included in the automatic flow.')}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Switch
                      checked={followUpAutomatic.allowClients}
                      disabled={!followUpAutomatic.enabled}
                      onCheckedChange={(checked) => updateFollowUpAutomatic({ allowClients: checked })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {followUpAutomatic.enabled && (
              <div
                ref={crmFollowUpTextBlocksRef}
                className={cn(
                  'w-full min-w-0 rounded-xl border border-surface-lighter bg-surface p-4 overflow-hidden',
                  isTrainingGuideTargetActive('crmFollowUpTextBlocks') && trainingGuideHighlightClass
                )}
              >
                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  {tr('Orientações Gerais de Follow-up', 'General follow-up guidelines')}
                  <ToggleHelp
                    text={tr(
                      'Essas regras guiam o comportamento geral do follow-up automático: frequência, tom, limites e quando pausar ou encaminhar.',
                      'These rules guide the overall behavior of automatic follow-up: cadence, tone, limits, and when to pause or hand off.'
                    )}
                  />
                </label>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  {tr(
                    'Defina orientações amplas para os follow-ups automáticos: tom de voz, cadência de retomada, limite de tentativas, objetivos por etapa, sinais para pausar o contato e critérios para encaminhar a um humano.',
                    'Define broad guidance for automatic follow-ups: tone of voice, retry cadence, attempt limits, goals by stage, signals to pause contact, and criteria to hand off to a human.'
                  )}
                </p>
                <div className="mt-3">
                  <CollapsibleTextarea
                    placeholder={tr(
                      'Ex: 1) retome em até 24h, 72h e 7 dias; 2) use mensagens curtas e consultivas; 3) após 3 tentativas sem resposta, pausar; 4) se houver objeção de preço, reforçar valor antes de ofertar desconto.',
                      'Ex: 1) resume within 24h, 72h, and 7 days; 2) keep messages short and consultative; 3) pause after 3 unanswered attempts; 4) if price objection appears, reinforce value before discounting.'
                    )}
                    value={instructions.orientacoesFollowUp}
                    onChange={(value) => handleInputChange('orientacoesFollowUp', value)}
                    className="min-h-[160px]"
                  />
                </div>
              </div>
            )}
          </div>

          {followUpAutomatic.enabled && (
            <div
              className={cn(
                'grid grid-cols-1 gap-4 rounded-xl border border-transparent p-1 xl:grid-cols-2 [&>*]:min-w-0',
                isTrainingGuideTargetActive('crmFollowUpTextBlocks') && trainingGuideHighlightClass
              )}
            >
              <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  {tr(
                    'Instruções de follow-up para leads com tag P. Passiva',
                    'Follow-up instructions for leads with tag P. Passiva'
                  )}
                </label>
                <p className="text-xs text-gray-400">
                  {tr(
                    'Defina como a IA deve retomar conversas de leads já interessados.',
                    'Define how AI should resume conversations with already interested leads.'
                  )}
                </p>
                <CollapsibleTextarea
                  placeholder={tr(
                    'Ex: Retome o contexto da última conversa, remova objeções e avance para fechamento.',
                    'Ex: Resume prior context, remove objections, and move toward closing.'
                  )}
                  value={instructions.instrucoesFollowUpTagPassiva}
                  onChange={(value) => handleInputChange('instrucoesFollowUpTagPassiva', value)}
                  className="min-h-[120px]"
                />
              </div>

              <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  {tr(
                    'Instruções de follow-up para leads com tag P. Ativa',
                    'Follow-up instructions for leads with tag P. Ativa'
                  )}
                </label>
                <p className="text-xs text-gray-400">
                  {tr(
                    'Defina como a IA deve reengajar leads frios de prospecção ativa sem parecer insistente.',
                    'Define how AI should re-engage cold outbound leads without sounding pushy.'
                  )}
                </p>
                <CollapsibleTextarea
                  placeholder={tr(
                    'Ex: Mensagem curta, valor prático e pergunta simples para reabrir o diálogo.',
                    'Ex: Short message, practical value, and one simple question to reopen dialog.'
                  )}
                  value={instructions.instrucoesFollowUpTagAtiva}
                  onChange={(value) => handleInputChange('instrucoesFollowUpTagAtiva', value)}
                  className="min-h-[120px]"
                />
              </div>
            </div>
          )}
          </>
          )}

          {trainingSection === 'basic' && (
          <>
          <div
            ref={basicSecondaryTogglesRef}
            className={cn(
              'grid grid-cols-1 gap-6 rounded-xl border border-transparent p-1 md:grid-cols-2 [&>*]:min-w-0',
              isTrainingGuideTargetActive('basicSecondaryToggles') && trainingGuideHighlightClass
            )}
          >
          <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Permitir que a IA envie arquivos e contatos', 'Allow AI to send files and contacts')}</label>
                  <ToggleHelp
                    text={tr(
                      'Quando ativado, a IA pode enviar arquivos cadastrados na página Arquivos e contatos nativos do WhatsApp (vCard).',
                      'When enabled, AI can send files registered in the Files page and native WhatsApp contacts (vCard).'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {instructions.permitirIAEnviarArquivos
                    ? tr('A IA poderá anexar arquivos da biblioteca e enviar contatos nativos', 'AI can attach files from the library and send native contacts')
                    : tr('A IA não enviará arquivos nem contatos automaticamente', 'AI will not send files or contacts automatically')}
                </p>
              </div>
              <Switch
                checked={instructions.permitirIAEnviarArquivos}
                onCheckedChange={(checked) => handleInputChange('permitirIAEnviarArquivos', checked)}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Permitir que a IA ouça e responda áudios', 'Allow AI to process and reply to audio')}</label>
                  <ToggleHelp
                    text={tr(
                      'Quando ativado, a IA transcreve áudios recebidos (voice notes) e responde em texto. Pode consumir mais créditos (transcrição + tokens).',
                      'When enabled, AI transcribes received audio (voice notes) and replies in text. It may consume more credits (transcription + tokens).'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {instructions.permitirIAOuvirAudios
                    ? tr('A IA poderá transcrever e responder áudios', 'AI can transcribe and reply to audio')
                    : tr('A IA não responderá áudios automaticamente', 'AI will not reply to audio automatically')}
                </p>
              </div>
              <Switch
                checked={instructions.permitirIAOuvirAudios}
                onCheckedChange={(checked) => handleInputChange('permitirIAOuvirAudios', checked)}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Permitir que a IA leia imagens e PDFs', 'Allow AI to read images and PDFs')}</label>
                  <ToggleHelp
                    text={tr(
                      'Quando ativado, a IA analisa imagens e PDFs recebidos e responde usando o conteúdo desses arquivos no contexto da conversa.',
                      'When enabled, AI analyzes received images and PDFs and responds using the content of those files in context.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {instructions.permitirIALerImagensEPdfs
                    ? tr('A IA poderá analisar imagens e PDFs recebidos', 'AI can analyze received images and PDFs')
                    : tr('A IA não analisará imagens e PDFs automaticamente', 'AI will not analyze images and PDFs automatically')}
                </p>
              </div>
              <Switch
                checked={instructions.permitirIALerImagensEPdfs}
                onCheckedChange={(checked) => handleInputChange('permitirIALerImagensEPdfs', checked)}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-surface-lighter bg-surface space-y-3">
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-0.5 min-w-0 break-words">
                <div className="flex items-start gap-2">
                  <label className="text-sm font-medium text-white">{tr('Usar função de agenda automática', 'Use automatic scheduling')}</label>
                  <ToggleHelp
                    text={tr(
                      'Quando ativado, a IA pode consultar sua Agenda e criar agendamentos automaticamente. Requer horários configurados nas Agendas.',
                      'When enabled, AI can check your calendar and create appointments automatically. Requires configured schedule availability.'
                    )}
                  />
                </div>
                <p className="text-xs text-gray-400">
                  {instructions.usarAgendaAutomatica
                    ? tr('A IA poderá consultar agendas e criar agendamentos', 'AI can check calendars and create appointments')
                    : tr('A IA não fará agendamentos automaticamente', 'AI will not create appointments automatically')}
                </p>
              </div>
              <Switch
                checked={instructions.usarAgendaAutomatica}
                onCheckedChange={(checked) => handleInputChange('usarAgendaAutomatica', checked)}
              />
            </div>
          </div>
          </div>
          </>
          )}

          {trainingSection === 'basic' && (
          <div
            ref={basicGuidanceAndStyleRef}
            className={cn(
              'space-y-2 rounded-xl border border-transparent p-1',
              isTrainingGuideTargetActive('basicGuidanceAndStyle') && trainingGuideHighlightClass
            )}
          >
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              {tr('Orientações gerais', 'General guidance')}
              <ToggleHelp
                text={tr(
                  'Campo base com regras amplas de atendimento. A IA usa isso como diretriz principal em todas as respostas.',
                  'Base field with broad support rules. AI uses this as the main guideline across all replies.'
                )}
              />
            </label>
            <CollapsibleTextarea
              placeholder={tr('Ex: Seja direto, evite promessas, use linguagem simples...', 'Ex: Be direct, avoid promises, use simple language...')}
              value={instructions.orientacoesGerais}
              onChange={(value) => handleInputChange('orientacoesGerais', value)}
              className="min-h-[100px]"
            />
          </div>
          )}

          {trainingSection === 'basic' && (
          <div
            className={cn(
              'space-y-2 rounded-xl border border-transparent p-1',
              isTrainingGuideTargetActive('basicGuidanceAndStyle') && trainingGuideHighlightClass
            )}
          >
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              {tr('Tipo de resposta da IA', 'AI response style')}
              <ToggleHelp
                text={tr(
                  'Define o estilo da escrita da IA: formalidade, objetividade, empatia e profundidade das respostas.',
                  'Defines AI writing style: formality, directness, empathy, and response depth.'
                )}
              />
            </label>
            <CollapsibleTextarea
              placeholder={tr('Ex: Seja amigável e formal...', 'Ex: Be friendly and professional...')}
              value={instructions.tipoResposta}
              onChange={(value) => handleInputChange('tipoResposta', value)}
              className="min-h-[100px]"
            />
          </div>
          )}

          {trainingSection === 'basic' && (
          <div
            ref={basicModelLanguageRef}
            className={cn(
              'rounded-xl border border-surface-lighter bg-surface p-4 space-y-4',
              isTrainingGuideTargetActive('basicModelLanguage') && trainingGuideHighlightClass
            )}
          >
            <button
              type="button"
              onClick={() => setIsModelLanguageOpen((prev) => !prev)}
              aria-expanded={isModelLanguageOpen}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <h3 className="text-sm font-semibold text-white">{tr('Modelo de linguagem', 'Language model')}</h3>
              <ChevronDown className={cn('h-4 w-4 text-gray-300 transition-transform', isModelLanguageOpen ? 'rotate-180' : '')} />
            </button>
            {isModelLanguageOpen && (
            <>
              <p className="text-xs text-gray-400">
                {tr('Escolha o provedor de IA usado no atendimento.', 'Choose the AI provider used for customer replies.')}
              </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
              <div className={`min-w-0 rounded-xl border p-4 transition-all ${activeModel === 'openai' ? 'border-primary bg-primary/5' : 'border-surface-lighter bg-surface-light'}`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="font-bold text-white break-words">Open AI</span>
                  <Switch
                    checked={activeModel === 'openai'}
                    onCheckedChange={() => handleModelToggle('openai')}
                  />
                </div>
                <p className="text-xs text-gray-400">GPT 5.2</p>
              </div>

              <div className={`min-w-0 rounded-xl border p-4 transition-all ${activeModel === 'google' ? 'border-primary bg-primary/5' : 'border-surface-lighter bg-surface-light'}`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="font-bold text-white break-words">Google</span>
                  <Switch
                    checked={activeModel === 'google'}
                    onCheckedChange={() => handleModelToggle('google')}
                  />
                </div>
                <p className="text-xs text-gray-400">Gemini 3.0 Flash</p>
              </div>

              <div className={`min-w-0 rounded-xl border p-4 transition-all opacity-60 ${activeModel === 'x' ? 'border-primary bg-primary/5' : 'border-surface-lighter bg-surface-light'}`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="font-bold text-white break-words">X (Grok)</span>
                  <Switch
                    checked={false}
                    disabled
                    onCheckedChange={() => {}}
                  />
                </div>
                <p className="text-xs text-gray-400">{tr('Em breve', 'Coming soon')}</p>
              </div>
            </div>
            </>
            )}
          </div>
          )}

          {trainingSection === 'company' && (
          <>
          <div
            ref={companyDescriptionRef}
            className={cn(
              'space-y-2 rounded-xl border border-transparent p-1',
              isTrainingGuideTargetActive('companyNameDescription') && trainingGuideHighlightClass
            )}
          >
            <label className="text-sm font-medium text-gray-300">{tr('Descrição da empresa', 'Company description')}</label>
            <CollapsibleTextarea
              placeholder={tr(
                'Ex: Somos uma clínica de estética especializada em tratamentos faciais e corporais...',
                'Ex: We are an aesthetics clinic specialized in facial and body treatments...'
              )}
              value={instructions.empresa}
              onChange={(value) => handleInputChange('empresa', value)}
              className="min-h-[125px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <label className="text-sm font-medium text-gray-300">
                {tr(
                  'Descrição dos serviços/produtos vendidos',
                  'Description of sold services/products'
                )}
              </label>
              <span className="max-w-full text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {tr('Dica: Use [Agendável] para serviços que requerem agenda', 'Tip: Use [Schedulable] for services that require scheduling')}
              </span>
            </div>
            <CollapsibleTextarea
              placeholder={tr(
                'Ex: Consulta Médica [Agendável] - avaliação inicial, retorno em 7 dias, pagamento via PIX/cartão, valor a partir de R$ 200,00&#10;&#10;E-book de Receitas - entrega imediata, acesso digital, R$ 29,90',
                'Ex: Medical consultation [Schedulable] - initial assessment, 7-day follow-up, PIX/card payment, starting at R$ 200.00&#10;&#10;Recipe e-book - instant delivery, digital access, R$ 29.90'
              )}
              value={instructions.descricaoServicosProdutosVendidos}
              onChange={(value) => handleInputChange('descricaoServicosProdutosVendidos', value)}
              className="min-h-[125px]"
            />
          </div>

          <div
            ref={companyHoursValuesRef}
            className={cn(
              'grid gap-6 rounded-xl border border-transparent p-1 [&>*]:min-w-0',
              isTrainingGuideTargetActive('companyHoursValues') && trainingGuideHighlightClass
            )}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">{tr('Horários de atendimento', 'Business hours')}</label>
              <CollapsibleTextarea
                placeholder={tr('Segunda a Sexta das 08h às 18h...', 'Monday to Friday from 08:00 to 18:00...')}
                value={instructions.horarios}
                onChange={(value) => handleInputChange('horarios', value)}
                className="min-h-[125px]"
              />
            </div>
            <div className="space-y-2">
              <div className="rounded-xl border border-dashed border-surface-lighter bg-surface px-4 py-3 text-xs text-gray-400">
                {tr(
                  'Inclua preços, faixas, formas de pagamento e condições diretamente na descrição comercial acima.',
                  'Include pricing, ranges, payment methods, and conditions directly in the commercial description above.'
                )}
              </div>
            </div>
          </div>

          <div
            ref={companyOtherInfoRef}
            className={cn(
              'space-y-2 rounded-xl border border-transparent p-1',
              isTrainingGuideTargetActive('companyOtherInfo') && trainingGuideHighlightClass
            )}
          >
            <label className="text-sm font-medium text-gray-300">{tr('Outras informações importantes', 'Other important information')}</label>
            <CollapsibleTextarea
              placeholder={tr(
                'Regras de cancelamento, localização, links úteis etc...',
                'Cancellation rules, location, useful links, and so on...'
              )}
              value={instructions.outros}
              onChange={(value) => handleInputChange('outros', value)}
              className="min-h-[125px]"
            />
          </div>
          </>
          )}
        </div>

        <div className="pt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {saveStatus === 'success' && (
            <span className="text-green-500 flex items-center gap-2 text-sm animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              {tr('Configurações salvas!', 'Settings saved!')}
            </span>
          )}
          {historyNotice && (
            <span className="text-red-500 flex items-center gap-2 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4" />
              {historyNotice}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-500 flex items-center gap-2 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4" />
              {tr('Erro ao salvar.', 'Failed to save.')}
            </span>
          )}
          {allowHistory ? (
            <div
              ref={trainingHistoryActionRef}
              className={cn(
                'rounded-xl border border-transparent',
                isTrainingGuideTargetActive('trainingHistoryAction') && trainingGuideHighlightClass
              )}
            >
              <Button
                variant="outline"
                onClick={() => setIsHistoryOpen(true)}
                disabled={!user || !db || !targetUserId || isSaving}
                className="w-full gap-2 bg-surface border-surface-lighter sm:w-auto"
              >
                <Clock className="w-4 h-4" />
                {tr('Histórico', 'History')}
              </Button>
            </div>
          ) : null}
          <div
            ref={trainingSaveActionRef}
            className={cn(
              'rounded-xl border border-transparent',
              isTrainingGuideTargetActive('trainingSaveAction') && trainingGuideHighlightClass
            )}
          >
            <Button
              onClick={() => void handleSave({ source: 'manual', createVersion: true })}
              disabled={isSaving}
              className="w-full gap-2 px-8 sm:w-auto sm:min-w-[180px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {tr('Salvando...', 'Saving...')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {tr('Salvar configurações', 'Save settings')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      {allowHistory && isHistoryOpen && targetUserId && (
        <TrainingHistoryModal
          userId={targetUserId}
          currentSnapshotKey={currentSnapshotKey}
          onRestore={handleRestoreVersion}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {shouldShowGuidedTutorial && guidePortalReady && trainingGuideOpen
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[200] bg-black/90"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}
              />

              <button
                type="button"
                onClick={closeTrainingGuide}
                className="fixed right-5 top-20 z-[230] flex h-11 w-11 items-center justify-center rounded-full border border-surface-lighter bg-surface-light text-gray-200 transition hover:bg-surface hover:text-white"
                aria-label={tr('Fechar tutorial', 'Close tutorial')}
              >
                <X className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToPreviousTrainingGuideStep}
                disabled={trainingGuideStepIndex === 0 || trainingGuideCompletionModalOpen}
                className={cn(
                  'fixed left-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  trainingGuideStepIndex === 0 || trainingGuideCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Etapa anterior', 'Previous step')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={goToNextTrainingGuideStep}
                disabled={trainingGuideStepIndex === lastTrainingGuideStepIndex || trainingGuideCompletionModalOpen}
                className={cn(
                  'fixed right-5 top-1/2 z-[220] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-surface-lighter bg-surface-light transition',
                  trainingGuideStepIndex === lastTrainingGuideStepIndex || trainingGuideCompletionModalOpen
                    ? 'cursor-not-allowed text-gray-600'
                    : 'text-gray-200 hover:bg-surface hover:text-white'
                )}
                aria-label={tr('Próxima etapa', 'Next step')}
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="fixed bottom-5 left-1/2 z-[220] w-[min(760px,calc(100vw-2.5rem))] -translate-x-1/2 rounded-2xl border border-surface-lighter bg-surface-light p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary">
                      {tr('Tutorial guiado', 'Guided tutorial')}
                    </p>
                    <h3 className="text-sm font-bold text-white">{currentTrainingGuideStep.title}</h3>
                  </div>
                  <span className="text-xs font-medium text-gray-300">
                    {tr('Etapa', 'Step')} {trainingGuideStepIndex + 1}/{trainingGuideSteps.length}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-300">{currentTrainingGuideStep.description}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {trainingGuideSteps.map((step, index) => (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setTrainingGuideStepIndex(index)}
                        disabled={trainingGuideCompletionModalOpen}
                        className={cn(
                          'h-2.5 rounded-full transition-all',
                          index === trainingGuideStepIndex ? 'w-8 bg-primary' : 'w-2.5 bg-gray-600 hover:bg-gray-500'
                        )}
                        aria-label={`${tr('Ir para etapa', 'Go to step')} ${index + 1}`}
                      />
                    ))}
                  </div>

                  {trainingGuideStepIndex === lastTrainingGuideStepIndex ? (
                    <Button
                      type="button"
                      onClick={finishTrainingGuide}
                      className="bg-primary text-black hover:bg-primary/90"
                    >
                      {tr('Concluir tópico', 'Complete topic')}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {tr(
                        'Use as setas na tela ou do teclado para navegar.',
                        'Use on-screen or keyboard arrows to navigate.'
                      )}
                    </span>
                  )}
                </div>
              </div>

              {trainingGuideCompletionModalOpen ? (
                <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 px-4">
                  <div className="w-full max-w-md rounded-2xl border border-surface-lighter bg-surface-light p-5 shadow-2xl">
                    <h3 className="text-lg font-bold text-white">
                      {tr('Tutorial concluído!', 'Tutorial completed!')}
                    </h3>
                    <p className="mt-2 text-sm text-gray-300">
                      {nextGuidedTutorialKey
                        ? tr(
                            `Deseja ir para o próximo tutorial agora (${nextGuidedTutorialLabel})`,
                            `Do you want to go to the next tutorial now (${nextGuidedTutorialLabel})`
                          )
                        : tr(
                            'Você concluiu este fluxo. Deseja fechar o tutorial agora',
                            'You completed this flow. Do you want to close the tutorial now'
                          )}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-surface-lighter bg-surface text-gray-200"
                        onClick={closeTrainingGuide}
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
                          onClick={closeTrainingGuide}
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
