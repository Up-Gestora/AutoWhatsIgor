'use client'

import Link from 'next/link'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  Wand2,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmbeddedWhatsappConnection } from '@/components/onboarding/embedded-whatsapp-connection'
import {
  getBehaviorFields,
  getDefaultScenarios,
  getLocalizedTemplateView,
  getPrimaryFields,
  getReadinessHintLabel,
  getStepLabels,
  localizeDraftDefaults,
  translateOnboardingError,
  WhatsAppPreviewText,
  type LocalizedTemplateView,
  type StepField
} from '@/components/onboarding/hidden-onboarding-flow'
import { auth } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { emitOnboardingEventSafe } from '@/lib/onboarding/events'
import { isOnboardingGuidedTestEnabled, isOnboardingWizardEnabled } from '@/lib/onboarding/flags'
import { TRAINING_VERTICAL_TEMPLATES } from '@/lib/onboarding/templates'
import type {
  OnboardingDraftPayload,
  OnboardingGuidedTestChangeProposal,
  OnboardingPublishResult,
  OnboardingState,
  TrainingVerticalTemplateId
} from '@/lib/onboarding/types'
import {
  TRAINING_COMMERCIAL_DESCRIPTION_FIELD,
  normalizeTrainingInstructions,
  type TrainingLanguage
} from '@/lib/training/schema'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'

type DraftResponse = OnboardingDraftPayload & { success?: boolean }
type StateResponse = { success?: boolean; state?: OnboardingState }
type GuidedMessageResponse = {
  success?: boolean
  testSessionId: string
  assistantMessage: string
  assistantParts: string[]
  remainingCredits: number
  readiness: OnboardingDraftPayload['readiness']
}
type GuidedChangeResponse = { success?: boolean; proposal?: OnboardingGuidedTestChangeProposal }
type GuidedValidationResponse = {
  success?: boolean
  guidedValidation?: OnboardingDraftPayload['guidedValidation']
}
type PublishResponse = OnboardingPublishResult & { success?: boolean }
type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'
type SaveReason = 'autosave' | 'step' | 'template' | 'validation' | 'publish'
type DraftSnapshot = {
  currentStep: number
  selectedTemplateId: string | null
  training: Record<string, unknown>
}

class ApiRequestError extends Error {
  readonly status: number
  readonly payload: Record<string, unknown> | null

  constructor(message: string, status: number, payload: Record<string, unknown> | null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.payload = payload
  }
}

export function HiddenOnboardingFlowV2() {
  const { user } = useAuth()
  const { locale, toRoute } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const targetLanguage: TrainingLanguage = isEn ? 'en' : 'pt-BR'
  const stepLabels = getStepLabels(tr)
  const primaryFields = getPrimaryFields(tr)
  const behaviorFields = getBehaviorFields(tr)
  const wizardEnabled = isOnboardingWizardEnabled()
  const guidedEnabled = isOnboardingGuidedTestEnabled()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftPayload, setDraftPayload] = useState<OnboardingDraftPayload | null>(null)
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null)
  const [draftTraining, setDraftTraining] = useState<Record<string, unknown>>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState<TrainingVerticalTemplateId | ''>('')
  const [activeStep, setActiveStep] = useState(1)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [guidedInput, setGuidedInput] = useState('')
  const [guidedBusy, setGuidedBusy] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeText, setChangeText] = useState('')
  const [changeBusy, setChangeBusy] = useState(false)
  const [proposal, setProposal] = useState<OnboardingGuidedTestChangeProposal | null>(null)
  const [validationBusy, setValidationBusy] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [enableAiOnPublish, setEnableAiOnPublish] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<OnboardingPublishResult | null>(null)
  const [templateNotice, setTemplateNotice] = useState<string | null>(null)
  const [savedFingerprint, setSavedFingerprint] = useState('')

  const hydratingRef = useRef(false)
  const draftPayloadRef = useRef<OnboardingDraftPayload | null>(null)
  const draftTrainingRef = useRef<Record<string, unknown>>({})
  const selectedTemplateIdRef = useRef<TrainingVerticalTemplateId | ''>('')
  const activeStepRef = useRef(1)
  const savedFingerprintRef = useRef('')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ snapshot: DraftSnapshot; force: boolean; reason: SaveReason } | null>(null)
  const saveLoopRef = useRef<Promise<void> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const proposalCardRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const changeTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingComposerFocusRef = useRef(false)
  const pendingRetestFocusRef = useRef(false)
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({})

  const formatCurrency = useCallback(
    (value: number) =>
      new Intl.NumberFormat(isEn ? 'en-US' : 'pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value),
    [isEn]
  )

  const fetchWithAuth = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!auth?.currentUser) throw new Error('auth_unavailable')
    const token = await auth.currentUser.getIdToken()
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    })
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!response.ok) {
      throw new ApiRequestError(
        payload?.error ? String(payload.error) : `request_failed_${response.status}`,
        response.status,
        payload
      )
    }
    return payload as T
  }, [])

  const hydrate = useCallback((payload: OnboardingDraftPayload) => {
    const nextSavedFingerprint = serializeDraftSnapshot(snapshotFromPayload(payload))
    hydratingRef.current = true
    draftPayloadRef.current = payload
    draftTrainingRef.current = payload.draft.training ?? {}
    selectedTemplateIdRef.current = (payload.selectedTemplateId ?? '') as TrainingVerticalTemplateId | ''
    activeStepRef.current = payload.currentStep
    setDraftPayload(payload)
    setDraftTraining(payload.draft.training ?? {})
    setSelectedTemplateId((payload.selectedTemplateId ?? '') as TrainingVerticalTemplateId | '')
    setActiveStep(payload.currentStep)
    setSavedFingerprint(nextSavedFingerprint)
    savedFingerprintRef.current = nextSavedFingerprint
    window.setTimeout(() => {
      hydratingRef.current = false
    }, 0)
  }, [])

  const syncSavedSnapshot = useCallback((payload: OnboardingDraftPayload, snapshot: DraftSnapshot) => {
    const nextSavedFingerprint = serializeDraftSnapshot(snapshot)
    draftPayloadRef.current = payload
    draftTrainingRef.current = snapshot.training
    selectedTemplateIdRef.current = (snapshot.selectedTemplateId ?? '') as TrainingVerticalTemplateId | ''
    activeStepRef.current = snapshot.currentStep
    setDraftPayload(payload)
    setSavedFingerprint(nextSavedFingerprint)
    savedFingerprintRef.current = nextSavedFingerprint
  }, [])

  const currentFingerprint = useMemo(
    () =>
      serializeDraftSnapshot({
        currentStep: activeStep,
        selectedTemplateId: selectedTemplateId || null,
        training: draftTraining
      }),
    [activeStep, draftTraining, selectedTemplateId]
  )
  const hasUnsavedChanges = Boolean(draftPayload) && currentFingerprint !== savedFingerprint

  const buildSnapshot = useCallback(
    (overrides?: Partial<DraftSnapshot>): DraftSnapshot => ({
      currentStep: overrides?.currentStep ?? activeStepRef.current,
      selectedTemplateId: overrides?.selectedTemplateId ?? (selectedTemplateIdRef.current || null),
      training: normalizeTrainingInstructions(overrides?.training ?? draftTrainingRef.current)
    }),
    []
  )

  const registerFieldRef = useCallback(
    (field: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      fieldRefs.current[field] = node
    },
    []
  )

  const focusField = useCallback((field: string) => {
    const node = fieldRefs.current[field]
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.focus()
  }, [])

  const handleConflict = useCallback(
    (requestError: unknown, fallbackMessage: string) => {
      const conflictDraft = extractConflictDraftPayload(requestError)
      if (conflictDraft) {
        hydrate(conflictDraft)
        setSaveStatus('conflict')
        setError(
          tr(
            'O rascunho foi atualizado para a versão mais recente. Revise os dados antes de continuar.',
            'The draft was refreshed to the latest version. Review the data before continuing.'
          )
        )
        return true
      }
      setSaveStatus('error')
      setError(
        requestError instanceof Error
          ? translateOnboardingError(requestError.message, tr)
          : fallbackMessage
      )
      return false
    },
    [hydrate, tr]
  )

  const flushSaveQueue = useCallback(async () => {
    if (saveLoopRef.current) {
      await saveLoopRef.current
      return
    }

    saveLoopRef.current = (async () => {
      while (pendingSaveRef.current) {
        const nextSave = pendingSaveRef.current
        pendingSaveRef.current = null
        const currentPayload = draftPayloadRef.current
        if (!currentPayload) {
          return
        }

        const nextFingerprint = serializeDraftSnapshot(nextSave.snapshot)
        if (!nextSave.force && nextFingerprint === savedFingerprintRef.current) {
          continue
        }

        setSaveStatus('saving')
        try {
          const payload = await fetchWithAuth<DraftResponse>('/api/onboarding/draft', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              expectedVersion: currentPayload.draft.version,
              currentStep: nextSave.snapshot.currentStep,
              selectedTemplateId: nextSave.snapshot.selectedTemplateId,
              trainingPatch: nextSave.snapshot.training
            })
          })
          syncSavedSnapshot(payload, nextSave.snapshot)
          setError(null)
          setSaveStatus('saved')
        } catch (saveError) {
          handleConflict(saveError, tr('Falha ao salvar rascunho', 'Failed to save draft'))
          pendingSaveRef.current = null
          break
        }
      }
    })().finally(() => {
      saveLoopRef.current = null
    })

    await saveLoopRef.current
  }, [fetchWithAuth, handleConflict, syncSavedSnapshot, tr])

  const queueSave = useCallback(
    async (snapshot: DraftSnapshot, options?: { force?: boolean; reason?: SaveReason }) => {
      pendingSaveRef.current = {
        snapshot,
        force: options?.force === true,
        reason: options?.reason ?? 'autosave'
      }
      await flushSaveQueue()
      return savedFingerprintRef.current === serializeDraftSnapshot(snapshot)
    },
    [flushSaveQueue]
  )

  const waitForSave = useCallback(async () => {
    if (saveLoopRef.current) {
      await saveLoopRef.current
    }
  }, [])

  const loadContext = useCallback(async () => {
    if (!user?.uid) return
    setLoading(true)
    setError(null)
    try {
      const [draft, onboarding] = await Promise.all([
        fetchWithAuth<DraftResponse>('/api/onboarding/draft'),
        fetchWithAuth<StateResponse>('/api/onboarding/state')
      ])
      hydrate(draft)
      setOnboardingState(onboarding.state ?? null)
      setEnableAiOnPublish(onboarding.state?.milestones.whatsapp_connected.reached === true)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? translateOnboardingError(loadError.message, tr)
          : tr('Erro ao carregar onboarding', 'Failed to load onboarding')
      )
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, hydrate, tr, user?.uid])

  useEffect(() => {
    if (wizardEnabled) void loadContext()
  }, [loadContext, wizardEnabled])

  useEffect(() => {
    draftPayloadRef.current = draftPayload
  }, [draftPayload])

  useEffect(() => {
    draftTrainingRef.current = draftTraining
  }, [draftTraining])

  useEffect(() => {
    selectedTemplateIdRef.current = selectedTemplateId
  }, [selectedTemplateId])

  useEffect(() => {
    activeStepRef.current = activeStep
  }, [activeStep])

  useEffect(() => {
    savedFingerprintRef.current = savedFingerprint
  }, [savedFingerprint])

  useEffect(() => {
    if (!draftPayload) return
    setDraftTraining((current) => {
      const localized = localizeDraftDefaults(current, targetLanguage)
      return JSON.stringify(localized) === JSON.stringify(current) ? current : localized
    })
  }, [draftPayload, targetLanguage])

  useEffect(() => {
    if (!draftPayload || hydratingRef.current) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    if (!hasUnsavedChanges) {
      if (saveStatus === 'dirty') {
        setSaveStatus('saved')
      }
      return
    }
    if (saveStatus !== 'saving' && saveStatus !== 'conflict') {
      setSaveStatus('dirty')
    }
    saveTimeoutRef.current = setTimeout(() => {
      void queueSave(buildSnapshot(), { reason: 'autosave' })
    }, 700)
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [buildSnapshot, draftPayload, hasUnsavedChanges, queueSave, saveStatus])

  const selectedTemplate = getLocalizedTemplateView(selectedTemplateId, isEn)
  const templateOptions = TRAINING_VERTICAL_TEMPLATES.map((template) => ({
    id: template.id,
    label: getLocalizedTemplateView(template.id, isEn)?.label ?? template.label
  }))
  const currentSession = draftPayload?.guidedTestSession ?? null
  const lastUserMessage =
    [...(currentSession?.transcript ?? [])].reverse().find((entry) => entry.role === 'user')?.text ?? ''
  const creditsBlocked = draftPayload?.credits
    ? (draftPayload.credits.balanceBrl ?? 0) <= 0 || Boolean(draftPayload.credits.blockedReason)
    : false
  const trainingScore = draftPayload?.readiness.score ?? onboardingState?.trainingScore ?? 0
  const whatsappConnected = onboardingState?.milestones.whatsapp_connected.reached === true
  const readinessHints = (draftPayload?.readiness.hints ?? []).map((hint) => ({
    ...hint,
    label: getReadinessHintLabel(hint.field, tr)
  }))
  const scenarios = selectedTemplate?.scenarios ?? getDefaultScenarios(isEn)
  const hasAssistantReply = currentSession?.transcript.some((entry) => entry.role === 'assistant') ?? false
  const validationStale =
    !draftPayload ||
    hasUnsavedChanges ||
    draftPayload.guidedValidation.status === 'idle' ||
    draftPayload.guidedValidation.draftVersion !== draftPayload.draft.version
  const publishBlocked =
    publishing || saveStatus === 'saving' || saveStatus === 'conflict' || hasUnsavedChanges

  const moveToStep = useCallback(
    async (step: number) => {
      const nextStep = Math.max(1, Math.min(5, Math.round(step)))
      const currentStep = activeStepRef.current
      if (nextStep === currentStep) {
        if (hasUnsavedChanges) {
          await queueSave(buildSnapshot({ currentStep: nextStep }), {
            force: true,
            reason: 'step'
          })
        }
        return true
      }
      if (nextStep < currentStep) {
        setActiveStep(nextStep)
        void queueSave(buildSnapshot({ currentStep: nextStep }), {
          force: true,
          reason: 'step'
        })
        return true
      }
      const saved = await queueSave(buildSnapshot({ currentStep: nextStep }), {
        force: true,
        reason: 'step'
      })
      if (!saved) return false
      setActiveStep(nextStep)
      return true
    },
    [buildSnapshot, hasUnsavedChanges, queueSave]
  )

  const handleStepSelection = useCallback(
    async (step: number) => {
      const currentStep = activeStepRef.current
      if (step === currentStep) return
      if (step < currentStep) {
        await moveToStep(step)
        return
      }
      if (step === currentStep + 1) {
        if (step === 4 && !hasAssistantReply) return
        if (step === 5 && currentStep !== 4 && draftPayloadRef.current?.currentStep !== 5) return
        await moveToStep(step)
        return
      }
      const persistedStep = draftPayloadRef.current?.currentStep ?? 1
      if (step <= persistedStep) {
        await moveToStep(step)
      }
    },
    [hasAssistantReply, moveToStep]
  )

  const applyTemplate = useCallback(async () => {
    if (!selectedTemplate) return
    await waitForSave()
    const currentTraining = draftTrainingRef.current
    const nextTraining = {
      ...currentTraining,
      nomeEmpresa: currentTraining.nomeEmpresa || selectedTemplate.label,
      language: targetLanguage,
      empresa: selectedTemplate.values.empresa,
      [TRAINING_COMMERCIAL_DESCRIPTION_FIELD]:
        selectedTemplate.values.descricaoServicosProdutosVendidos,
      horarios: selectedTemplate.values.horarios,
      orientacoesGerais: selectedTemplate.values.orientacoesGerais,
      orientacoesFollowUp: selectedTemplate.values.orientacoesFollowUp,
      instrucoesSugestoesLeadsClientes: selectedTemplate.values.instrucoesSugestoesLeadsClientes
    }
    setDraftTraining(nextTraining)
    const saved = await queueSave(
      buildSnapshot({
        training: nextTraining,
        selectedTemplateId: selectedTemplateId || null
      }),
      {
        force: true,
        reason: 'template'
      }
    )
    if (saved) {
      setTemplateNotice(
        tr(
          'Template aplicado. Revise os textos essenciais antes de avançar.',
          'Template applied. Review the essential copy before moving on.'
        )
      )
    }
  }, [buildSnapshot, queueSave, selectedTemplate, selectedTemplateId, targetLanguage, tr, waitForSave])

  const openSession = useCallback(async (action: 'restart' | 'clear' = 'restart') => {
    await waitForSave()
    setSessionBusy(true)
    try {
      const payload = await fetchWithAuth<DraftResponse>('/api/onboarding/guided-test/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action })
      })
      hydrate(payload)
      setProposal(null)
      setChangeOpen(false)
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? translateOnboardingError(sessionError.message, tr)
          : tr('Falha ao iniciar laboratório', 'Failed to start the lab')
      )
    } finally {
      setSessionBusy(false)
    }
  }, [fetchWithAuth, hydrate, tr, waitForSave])

  const sendMessage = useCallback(async (message: string) => {
    const safeMessage = message.trim()
    if (!safeMessage) return
    if (!draftPayloadRef.current?.readiness.ready) {
      const missingField = draftPayloadRef.current?.readiness.hints.find((hint) => hint.missing)?.field
      if (missingField) focusField(missingField)
      setError(
        tr(
          'Preencha empresa, descrição comercial e orientação geral antes de testar a IA.',
          'Fill in company, commercial description, and general guidance before testing the AI.'
        )
      )
      return
    }
    if (creditsBlocked) return
    setGuidedBusy(true)
    try {
      let sessionId = currentSession?.id ?? null
      if (!sessionId) {
        const created = await fetchWithAuth<DraftResponse>('/api/onboarding/guided-test/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'restart' })
        })
        hydrate(created)
        sessionId = created.guidedTestSession?.id ?? null
      }
      const result = await fetchWithAuth<GuidedMessageResponse>('/api/onboarding/guided-test/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          testSessionId: sessionId,
          draftSnapshot: {
            version: draftPayloadRef.current?.draft.version,
            training: draftTrainingRef.current
          },
          userMessage: safeMessage
        })
      })
      setDraftPayload((current) => {
        const activeSession = current?.guidedTestSession
        return current && activeSession
          ? {
              ...current,
              readiness: result.readiness,
              credits: current.credits
                ? { ...current.credits, balanceBrl: result.remainingCredits }
                : current.credits,
              guidedTestSession: {
                ...activeSession,
                transcript: [
                  ...activeSession.transcript,
                  { role: 'user', text: safeMessage },
                  ...result.assistantParts.map((text) => ({ role: 'assistant' as const, text }))
                ],
                updatedAtMs: Date.now()
              }
            }
            : current
      })
      setGuidedInput('')
      setProposal(null)
      pendingComposerFocusRef.current = true
      setError(null)
    } catch (messageError) {
      setError(
        messageError instanceof Error
          ? translateOnboardingError(messageError.message, tr)
          : tr('Falha no laboratório', 'The lab failed')
      )
    } finally {
      setGuidedBusy(false)
    }
  }, [creditsBlocked, currentSession, fetchWithAuth, focusField, hydrate, tr])

  const requestChange = useCallback(async () => {
    if (!changeText.trim()) return
    setChangeBusy(true)
    try {
      const result = await fetchWithAuth<GuidedChangeResponse>('/api/onboarding/guided-test/change-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          testSessionId: currentSession?.id ?? null,
          requestText: changeText,
          draftSnapshot: {
            version: draftPayloadRef.current?.draft.version,
            training: draftTrainingRef.current
          },
          transcript: currentSession?.transcript ?? []
        })
      })
      setProposal(result.proposal ?? null)
      setChangeText('')
      setChangeOpen(false)
      setError(null)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? translateOnboardingError(requestError.message, tr)
          : tr('Falha ao solicitar mudança', 'Failed to request change')
      )
    } finally {
      setChangeBusy(false)
    }
  }, [changeText, currentSession?.id, currentSession?.transcript, fetchWithAuth, tr])

  const applyProposal = useCallback(async () => {
    if (!proposal || !draftPayloadRef.current) return
    setChangeBusy(true)
    try {
      const payload = await fetchWithAuth<DraftResponse>('/api/onboarding/guided-test/change-apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: draftPayloadRef.current.draft.version,
          proposal
        })
      })
      hydrate(payload)
      setProposal(null)
      setChangeOpen(false)
      setError(null)
      pendingRetestFocusRef.current = true
    } catch (applyError) {
      handleConflict(applyError, tr('Falha ao aplicar mudança', 'Failed to apply the change'))
    } finally {
      setChangeBusy(false)
    }
  }, [fetchWithAuth, handleConflict, hydrate, proposal, tr])

  const runValidation = useCallback(async () => {
    if (!draftPayloadRef.current) return
    const saved = await queueSave(buildSnapshot(), {
      force: hasUnsavedChanges,
      reason: 'validation'
    })
    if (!saved) return

    setValidationBusy(true)
    try {
      const result = await fetchWithAuth<GuidedValidationResponse>('/api/onboarding/guided-test/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })
      setDraftPayload((current) =>
        current
          ? {
              ...current,
              guidedValidation: result.guidedValidation ?? current.guidedValidation
            }
          : current
      )
      setError(null)
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? translateOnboardingError(validationError.message, tr)
          : tr('Falha ao validar laboratório', 'Failed to validate the lab')
      )
    } finally {
      setValidationBusy(false)
    }
  }, [buildSnapshot, fetchWithAuth, hasUnsavedChanges, queueSave, tr])

  const publish = useCallback(async () => {
    if (!draftPayloadRef.current || !confirmPublish || publishResult) return
    if (saveStatus === 'saving' || saveStatus === 'conflict' || hasUnsavedChanges) {
      void emitOnboardingEventSafe({
        eventName: 'onboarding_publish_blocked_unsaved',
        sessionId: user?.uid,
        properties: {
          saveStatus,
          hasUnsavedChanges
        }
      })
      setError(
        tr(
          'Salve o rascunho sem conflitos antes de publicar.',
          'Save the draft without conflicts before publishing.'
        )
      )
      return
    }
    setPublishing(true)
    try {
      const result = await fetchWithAuth<PublishResponse>('/api/onboarding/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: draftPayloadRef.current.draft.version,
          enableAi: enableAiOnPublish
        })
      })
      setPublishResult(result)
      await loadContext()
    } catch (publishError) {
      handleConflict(publishError, tr('Falha ao publicar onboarding', 'Failed to publish onboarding'))
    } finally {
      setPublishing(false)
    }
  }, [confirmPublish, enableAiOnPublish, fetchWithAuth, handleConflict, hasUnsavedChanges, loadContext, publishResult, saveStatus, tr, user?.uid])

  const handleConnected = useCallback(async () => {
    await emitOnboardingEventSafe({ eventName: 'onboarding_connect_completed', sessionId: user?.uid })
    await loadContext()
  }, [loadContext, user?.uid])

  useEffect(() => {
    if (!currentSession?.transcript.length) return
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [currentSession?.transcript.length])

  useEffect(() => {
    if (!proposal) return
    proposalCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [proposal])

  useEffect(() => {
    if (!guidedBusy && pendingComposerFocusRef.current) {
      pendingComposerFocusRef.current = false
      composerRef.current?.focus()
    }
  }, [guidedBusy])

  useEffect(() => {
    if (!changeBusy && pendingRetestFocusRef.current) {
      pendingRetestFocusRef.current = false
      document.getElementById('onboarding-lab-retest-button')?.focus()
    }
  }, [changeBusy])

  useEffect(() => {
    if (!changeOpen) return
    const timeoutId = window.setTimeout(() => changeTextareaRef.current?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [changeOpen])

  if (!wizardEnabled) {
    return (
      <div className="rounded-2xl border border-surface-lighter bg-surface-light p-6 text-sm text-gray-300">
        {tr('Onboarding oculto desativado.', 'Hidden onboarding is disabled.')}
      </div>
    )
  }
  if (loading || !draftPayload) {
    return (
      <div className="flex items-center gap-2 text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tr('Carregando onboarding...', 'Loading onboarding...')}
      </div>
    )
  }

  const autosaveLabel =
    saveStatus === 'saving'
      ? tr('Salvando...', 'Saving...')
      : saveStatus === 'dirty'
        ? tr('Alterações não salvas', 'Unsaved changes')
        : saveStatus === 'saved'
          ? tr('Rascunho salvo', 'Draft saved')
          : saveStatus === 'conflict'
            ? tr('Rascunho atualizado', 'Draft refreshed')
            : saveStatus === 'error'
              ? tr('Falha ao salvar', 'Save failed')
              : tr('Pronto', 'Ready')

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="overflow-hidden rounded-[32px] border border-surface-lighter bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_38%),linear-gradient(135deg,rgba(17,24,39,0.96),rgba(12,18,29,0.98))] p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {tr('Onboarding oculto', 'Hidden onboarding')}
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-white">
              {tr('Configure, teste e publique sua IA em um único fluxo', 'Configure, test, and publish your AI in one flow')}
            </h1>
            <p className="mt-2 text-sm text-gray-300">
              {tr('A ideia aqui é sair do cadastro com uma IA convincente, testada em um chat fictício e pronta para publicar.', 'The goal here is to leave signup with a convincing AI, tested in a fictitious chat, and ready to publish.')}
            </p>
          </div>
          <div className="min-w-[240px] rounded-[24px] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{tr('Autosave', 'Autosave')}</p>
            <p className="mt-2 text-sm text-white">{autosaveLabel}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-lighter">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(activeStep / stepLabels.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-400">{tr('Score atual', 'Current score')}: {trainingScore.toFixed(1)} · {tr('Etapa', 'Step')} {activeStep}/5</p>
          </div>
        </div>
      </div>
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-surface-lighter bg-surface-light p-4">
          {stepLabels.map((label, index) => {
            const step = index + 1
            const current = activeStep === step
            const done = (draftPayload.currentStep ?? activeStep) > step
            const disabled =
              step > activeStep &&
              !(
                step === activeStep + 1 &&
                (step <= 3 || (step === 4 && hasAssistantReply) || (step === 5 && activeStep === 4))
              ) &&
              step > (draftPayload.currentStep ?? 1)
            return (
              <button
                key={label}
                type="button"
                onClick={() => void handleStepSelection(step)}
                disabled={disabled}
                className={cn('mb-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50', current ? 'bg-primary/10 text-white ring-1 ring-primary/30' : 'text-gray-300 hover:bg-surface')}
              >
                {done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : current ? <Circle className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-gray-500" />}
                <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-gray-400">{tr('Passo', 'Step')} {step}</p></div>
                <ChevronRight className="ml-auto h-4 w-4 text-gray-500" />
              </button>
            )
          })}
        </aside>
        <section className="space-y-6">
          {activeStep === 1 ? <StepContext tr={tr} selectedTemplateId={selectedTemplateId} selectedTemplate={selectedTemplate} templateOptions={templateOptions} primaryFields={primaryFields} setSelectedTemplateId={setSelectedTemplateId} applyTemplate={applyTemplate} draftTraining={draftTraining} setDraftTraining={setDraftTraining} onContinue={() => void moveToStep(2)} persistNow={() => void queueSave(buildSnapshot(), { force: true, reason: 'step' })} registerFieldRef={registerFieldRef} templateNotice={templateNotice} /> : null}
          {activeStep === 2 ? <StepBehavior tr={tr} behaviorFields={behaviorFields} draftTraining={draftTraining} setDraftTraining={setDraftTraining} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} onBack={() => void moveToStep(1)} onContinue={() => void moveToStep(3)} registerFieldRef={registerFieldRef} /> : null}
          {activeStep === 3 ? <StepLab tr={tr} toRoute={toRoute} formatCurrency={formatCurrency} readinessHints={readinessHints} draftPayload={draftPayload} draftTraining={draftTraining} setDraftTraining={setDraftTraining} currentSession={currentSession} lastUserMessage={lastUserMessage} scenarios={scenarios} guidedEnabled={guidedEnabled} guidedInput={guidedInput} setGuidedInput={setGuidedInput} guidedBusy={guidedBusy} sessionBusy={sessionBusy} creditsBlocked={creditsBlocked} proposal={proposal} changeOpen={changeOpen} setChangeOpen={setChangeOpen} changeText={changeText} setChangeText={setChangeText} changeBusy={changeBusy} openSession={() => void openSession('restart')} clearSession={() => void openSession('clear')} sendMessage={sendMessage} requestChange={() => void requestChange()} applyProposal={() => void applyProposal()} onContinue={() => void moveToStep(4)} validationBusy={validationBusy} runValidation={() => void runValidation()} validationStale={validationStale} focusField={focusField} registerFieldRef={registerFieldRef} composerRef={(node) => { composerRef.current = node }} changeTextareaRef={(node) => { changeTextareaRef.current = node }} transcriptEndRef={(node) => { transcriptEndRef.current = node }} proposalCardRef={(node) => { proposalCardRef.current = node }} /> : null}
          {activeStep === 4 ? <StepConnection tr={tr} sessionId={user?.uid ?? ''} whatsappConnected={whatsappConnected} onConnected={() => void handleConnected()} onBack={() => void moveToStep(3)} onContinue={() => void moveToStep(5)} /> : null}
          {activeStep === 5 ? <StepPublish tr={tr} toRoute={toRoute} draftTraining={draftTraining} selectedTemplateLabel={selectedTemplate?.label ?? tr('Sem template', 'No template')} trainingScore={trainingScore} whatsappConnected={whatsappConnected} confirmPublish={confirmPublish} setConfirmPublish={setConfirmPublish} enableAiOnPublish={enableAiOnPublish} setEnableAiOnPublish={setEnableAiOnPublish} publishing={publishing} publishResult={publishResult} onBack={() => void moveToStep(4)} onPublish={() => void publish()} publishBlocked={publishBlocked} guidedValidation={draftPayload.guidedValidation} validationStale={validationStale} /> : null}
        </section>
      </div>
    </div>
  )
}

function StepContext(props: {
  tr: (pt: string, en: string) => string
  selectedTemplateId: TrainingVerticalTemplateId | ''
  selectedTemplate: LocalizedTemplateView | null
  templateOptions: Array<{ id: TrainingVerticalTemplateId; label: string }>
  primaryFields: StepField[]
  setSelectedTemplateId: (value: TrainingVerticalTemplateId | '') => void
  applyTemplate: () => Promise<void>
  draftTraining: Record<string, unknown>
  setDraftTraining: Dispatch<SetStateAction<Record<string, unknown>>>
  onContinue: () => void
  persistNow: () => void
  registerFieldRef: (field: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => void
  templateNotice: string | null
}) {
  return (
    <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Contexto da empresa', 'Company context')}</h2>
        <p className="mt-1 text-sm text-gray-400">{props.tr('Escolha um template para acelerar e depois ajuste os blocos essenciais.', 'Choose a template to accelerate the setup, then refine the essential blocks.')}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
          <label className="mb-2 block text-sm text-gray-300">{props.tr('Template inicial', 'Starting template')}</label>
          <select className="w-full rounded-xl border border-surface-lighter bg-surface-light px-3 py-2 text-sm text-white" value={props.selectedTemplateId} onChange={(event) => props.setSelectedTemplateId(event.target.value as TrainingVerticalTemplateId | '')}>
            <option value="">{props.tr('Selecione um nicho', 'Select a business type')}</option>
            {props.templateOptions.map((template) => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-400">{props.selectedTemplate?.description ?? props.tr('Escolha um nicho para aplicar um ponto de partida.', 'Choose a business type to apply a starting point.')}</p>
          <Button className="mt-4 w-full" onClick={() => void props.applyTemplate()} disabled={!props.selectedTemplateId}>
            {props.tr('Aplicar template', 'Apply template')}
          </Button>
          {props.templateNotice ? <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{props.templateNotice}</div> : null}
        </div>
        <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
          <p className="text-sm text-white">{props.tr('Prévia do template', 'Template preview')}</p>
          {props.selectedTemplate ? (
            <div className="mt-3 grid gap-3">
              <TemplatePreviewBlock
                label={props.tr('Empresa', 'Company')}
                value={String(props.selectedTemplate.values.empresa ?? '')}
              />
              <TemplatePreviewBlock
                label={props.tr('Descrição comercial', 'Commercial description')}
                value={String(props.selectedTemplate.values.descricaoServicosProdutosVendidos ?? '')}
              />
              <TemplatePreviewBlock
                label={props.tr('Horários', 'Business hours')}
                value={String(props.selectedTemplate.values.horarios ?? '')}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-400">{props.tr('Escolha um nicho para ver a estrutura pronta e os placeholders como {{cidade}}.', 'Choose a business type to preview the starter structure and placeholders such as {{city}}.')}</p>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-4">
        {props.primaryFields.map((field) => (
          <div key={field.key}>
            <label className="mb-2 block text-sm font-medium text-gray-200" htmlFor={fieldInputId(field.key)}>{field.label}</label>
            {field.textarea ? (
              <Textarea id={fieldInputId(field.key)} ref={props.registerFieldRef(field.key)} rows={field.key === 'empresa' ? 4 : 3} value={String(props.draftTraining[field.key] ?? '')} onChange={(event) => props.setDraftTraining((current) => ({ ...current, [field.key]: event.target.value }))} />
            ) : (
              <Input id={fieldInputId(field.key)} ref={props.registerFieldRef(field.key)} value={String(props.draftTraining[field.key] ?? '')} onChange={(event) => props.setDraftTraining((current) => ({ ...current, [field.key]: event.target.value }))} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={props.onContinue}>{props.tr('Continuar para comportamento', 'Continue to behavior')}</Button>
        <Button variant="ghost" onClick={props.persistNow}>{props.tr('Salvar agora', 'Save now')}</Button>
      </div>
    </div>
  )
}

function StepBehavior(props: {
  tr: (pt: string, en: string) => string
  behaviorFields: StepField[]
  draftTraining: Record<string, unknown>
  setDraftTraining: Dispatch<SetStateAction<Record<string, unknown>>>
  showAdvanced: boolean
  setShowAdvanced: Dispatch<SetStateAction<boolean>>
  onBack: () => void
  onContinue: () => void
  registerFieldRef: (field: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => void
}) {
  return (
    <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Comportamento essencial', 'Essential behavior')}</h2>
        <p className="mt-1 text-sm text-gray-400">{props.tr('Revise só o que mais mexe na primeira resposta. O resto pode ficar recolhido por enquanto.', 'Review only what most affects the first reply. Everything else can stay collapsed for now.')}</p>
      </div>
      <div className="grid gap-4">
        {props.behaviorFields.map((field) => (
          <div key={field.key}>
            <label className="mb-2 block text-sm font-medium text-gray-200" htmlFor={fieldInputId(field.key)}>{field.label}</label>
            <Textarea id={fieldInputId(field.key)} ref={props.registerFieldRef(field.key)} rows={field.key === 'orientacoesGerais' ? 6 : 4} value={String(props.draftTraining[field.key] ?? '')} onChange={(event) => props.setDraftTraining((current) => ({ ...current, [field.key]: event.target.value }))} />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <ToggleRow label={props.tr('A IA deve se apresentar como IA', 'The AI should identify itself as AI')} checked={Boolean(props.draftTraining.seApresentarComoIA ?? true)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, seApresentarComoIA: checked }))} />
        <ToggleRow label={props.tr('Usar emojis', 'Use emojis')} checked={Boolean(props.draftTraining.usarEmojis ?? true)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, usarEmojis: checked }))} />
        <ToggleRow label={props.tr('Quando não souber, encaminhar', 'Hand off when it does not know')} checked={String(props.draftTraining.comportamentoNaoSabe ?? 'encaminhar') === 'encaminhar'} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, comportamentoNaoSabe: checked ? 'encaminhar' : 'silencio' }))} />
      </div>
      <button type="button" onClick={() => props.setShowAdvanced((current) => !current)} className="mt-6 text-sm font-medium text-primary">
        {props.showAdvanced ? props.tr('Esconder ajustes avançados', 'Hide advanced settings') : props.tr('Abrir ajustes avançados', 'Open advanced settings')}
      </button>
      {props.showAdvanced ? (
        <div className="mt-4 grid gap-4 rounded-2xl border border-surface-lighter bg-surface p-4 md:grid-cols-2">
          <ToggleRow label={props.tr('Permitir IA enviar arquivos', 'Allow AI to send files')} checked={Boolean(props.draftTraining.permitirIAEnviarArquivos)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirIAEnviarArquivos: checked }))} />
          <ToggleRow label={props.tr('Permitir IA ouvir áudios', 'Allow AI to listen to audio')} checked={Boolean(props.draftTraining.permitirIAOuvirAudios)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirIAOuvirAudios: checked }))} />
          <ToggleRow label={props.tr('Permitir IA ler imagens/PDFs', 'Allow AI to read images/PDFs')} checked={Boolean(props.draftTraining.permitirIALerImagensEPdfs)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirIALerImagensEPdfs: checked }))} />
          <ToggleRow label={props.tr('Permitir sugestões no CRM', 'Allow CRM suggestions')} checked={Boolean(props.draftTraining.permitirSugestoesCamposLeadsClientes)} onCheckedChange={(checked) => props.setDraftTraining((current) => ({ ...current, permitirSugestoesCamposLeadsClientes: checked }))} />
        </div>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={props.onBack}>{props.tr('Voltar', 'Back')}</Button>
        <Button onClick={props.onContinue}>{props.tr('Ir para o laboratório', 'Go to the lab')}</Button>
      </div>
    </div>
  )
}

function StepLab(props: {
  tr: (pt: string, en: string) => string
  toRoute: ReturnType<typeof useI18n>['toRoute']
  formatCurrency: (value: number) => string
  readinessHints: Array<{ field: 'empresa' | 'descricaoServicosProdutosVendidos' | 'orientacoesGerais'; label: string; missing: boolean }>
  draftPayload: OnboardingDraftPayload
  draftTraining: Record<string, unknown>
  setDraftTraining: Dispatch<SetStateAction<Record<string, unknown>>>
  currentSession: OnboardingDraftPayload['guidedTestSession']
  lastUserMessage: string
  scenarios: Array<{ id: string; label: string; message: string }>
  guidedEnabled: boolean
  guidedInput: string
  setGuidedInput: Dispatch<SetStateAction<string>>
  guidedBusy: boolean
  sessionBusy: boolean
  creditsBlocked: boolean
  proposal: OnboardingGuidedTestChangeProposal | null
  changeOpen: boolean
  setChangeOpen: Dispatch<SetStateAction<boolean>>
  changeText: string
  setChangeText: Dispatch<SetStateAction<string>>
  changeBusy: boolean
  openSession: () => void
  clearSession: () => void
  sendMessage: (message: string) => Promise<void>
  requestChange: () => void
  applyProposal: () => void
  onContinue: () => void
  validationBusy: boolean
  runValidation: () => void
  validationStale: boolean
  focusField: (field: string) => void
  registerFieldRef: (field: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => void
  composerRef: (node: HTMLTextAreaElement | null) => void
  changeTextareaRef: (node: HTMLTextAreaElement | null) => void
  transcriptEndRef: (node: HTMLDivElement | null) => void
  proposalCardRef: (node: HTMLDivElement | null) => void
}) {
  const firstMissingHint = props.readinessHints.find((hint) => hint.missing) ?? null

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">{props.tr('Laboratório de IA', 'AI Lab')}</h2>
            <p className="mt-1 text-sm text-gray-400">{props.tr('Chat fictício com IA real. Nada é enviado ao WhatsApp daqui.', 'Fictitious chat with the real AI. Nothing is sent to WhatsApp from here.')}</p>
          </div>
          <div className="rounded-2xl border border-surface-lighter bg-surface px-3 py-2 text-right text-xs text-gray-300">
            <p>{props.tr('Saldo', 'Balance')}</p>
            <p className="mt-1 text-sm font-semibold text-white">{props.formatCurrency(props.draftPayload.credits?.balanceBrl ?? 0)}</p>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-surface-lighter bg-surface p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.tr('Prontidão', 'Readiness')}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{props.draftPayload.readiness.score.toFixed(1)}</p>
          <div className="mt-4 space-y-2">
            {props.readinessHints.map((hint) => (
              <div key={hint.field} className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', hint.missing ? 'bg-amber-500/10 text-amber-200' : 'bg-emerald-500/10 text-emerald-200')}>
                {hint.missing ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{hint.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-surface-lighter bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">{props.tr('Validação do laboratório', 'Lab validation')}</p>
              <p className="mt-1 text-sm text-gray-400">
                {props.validationStale
                  ? props.tr('O rascunho mudou. Rode a validação de novo para atualizar os checks.', 'The draft changed. Run validation again to refresh the checks.')
                  : props.draftPayload.guidedValidation.status === 'passed'
                    ? props.tr('Laboratório validado para esta versão do rascunho.', 'Lab validated for this draft version.')
                    : props.draftPayload.guidedValidation.status === 'failed'
                      ? props.tr('Alguns checks falharam. Revise, reteste e valide novamente.', 'Some checks failed. Review, retest, and validate again.')
                      : props.tr('Ainda não há validação rodada para este rascunho.', 'There is no validation run for this draft yet.')}
              </p>
            </div>
            <Button variant="outline" onClick={props.runValidation} disabled={props.validationBusy}>
              {props.validationBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {props.tr('Validar laboratório', 'Validate lab')}
            </Button>
          </div>
          {props.draftPayload.guidedValidation.checks.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {props.draftPayload.guidedValidation.checks.map((check) => (
                <div key={check.id} className={cn('flex items-center justify-between rounded-xl px-3 py-2 text-sm', check.passed ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200')}>
                  <span>{formatValidationCheckLabel(check.id, props.tr)}</span>
                  {check.passed ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-6 space-y-4">
          <MiniField label={props.tr('Empresa', 'Company')} fieldKey="empresa" value={String(props.draftTraining.empresa ?? '')} onChange={(value) => props.setDraftTraining((current) => ({ ...current, empresa: value }))} registerFieldRef={props.registerFieldRef} />
          <MiniField
            label={props.tr('Descrição comercial', 'Commercial description')}
            fieldKey={TRAINING_COMMERCIAL_DESCRIPTION_FIELD}
            value={String(props.draftTraining.descricaoServicosProdutosVendidos ?? '')}
            onChange={(value) =>
              props.setDraftTraining((current) => ({
                ...current,
                descricaoServicosProdutosVendidos: value
              }))
            }
            registerFieldRef={props.registerFieldRef}
          />
          <MiniField label={props.tr('Orientação geral', 'General guidance')} fieldKey="orientacoesGerais" value={String(props.draftTraining.orientacoesGerais ?? '')} onChange={(value) => props.setDraftTraining((current) => ({ ...current, orientacoesGerais: value }))} registerFieldRef={props.registerFieldRef} />
        </div>
      </div>

      <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
        <div className="flex flex-wrap items-center gap-2">
          {props.scenarios.map((scenario) => (
            <button key={scenario.id} type="button" className="rounded-full border border-surface-lighter px-3 py-1.5 text-xs text-gray-200 transition hover:border-primary/40 hover:text-white disabled:opacity-50" onClick={() => void props.sendMessage(scenario.message)} disabled={props.guidedBusy || props.changeOpen}>
              {scenario.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={props.openSession} disabled={props.sessionBusy}><RotateCcw className="mr-2 h-4 w-4" />{props.tr('Reiniciar chat', 'Restart chat')}</Button>
          <Button variant="outline" onClick={props.clearSession} disabled={!props.currentSession || props.sessionBusy}><RefreshCcw className="mr-2 h-4 w-4" />{props.tr('Limpar conversa', 'Clear conversation')}</Button>
          <Button id="onboarding-lab-retest-button" variant="ghost" onClick={() => (props.lastUserMessage ? void props.sendMessage(props.lastUserMessage) : undefined)} disabled={!props.lastUserMessage || props.guidedBusy}>{props.tr('Reenviar última mensagem', 'Resend last message')}</Button>
          <Button variant="ghost" onClick={() => props.setChangeOpen(true)} disabled={!props.currentSession}><Wand2 className="mr-2 h-4 w-4" />{props.tr('Solicitar mudança', 'Request change')}</Button>
        </div>

        {!props.draftPayload.readiness.ready && firstMissingHint ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p>{props.tr('Antes de enviar, ajuste o campo pendente abaixo.', 'Before sending, fix the missing field below.')}</p>
            <button type="button" className="mt-2 font-medium text-white underline underline-offset-4" onClick={() => props.focusField(firstMissingHint.field)}>
              {firstMissingHint.label}
            </button>
          </div>
        ) : null}

        {props.creditsBlocked ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p>{props.tr('Seu saldo acabou. Recarregue créditos para continuar testando a IA.', 'Your balance is empty. Recharge credits to keep testing the AI.')}</p>
            <Link href={props.toRoute('billing')} className="mt-3 inline-flex items-center text-sm font-medium text-white underline underline-offset-4">{props.tr('Ir para financeiro', 'Open billing')}</Link>
          </div>
        ) : null}

        <div className="mt-4 min-h-[360px] rounded-[24px] border border-surface-lighter bg-surface p-4">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-gray-400">
            <span>{props.tr('Chat fictício de teste', 'Fictitious test chat')}</span>
            <span>{props.currentSession ? `#${props.currentSession.id.slice(0, 8)}` : props.tr('Sem sessão', 'No session')}</span>
          </div>
          <div className="max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {(props.currentSession?.transcript ?? []).length > 0 ? (
              props.currentSession?.transcript.map((entry, index) => (
                <div key={`${entry.role}-${index}`} className={cn('max-w-[88%] rounded-2xl px-4 py-3 text-sm', entry.role === 'assistant' ? 'bg-primary/10 text-white' : 'ml-auto bg-surface-lighter text-gray-100')}>
                  {entry.role === 'assistant' ? <WhatsAppPreviewText text={entry.text} /> : <span className="break-words whitespace-pre-wrap leading-relaxed">{entry.text}</span>}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-surface-lighter p-6 text-sm text-gray-400">
                {props.tr('Comece por um cenário sugerido ou escreva uma mensagem livre para ver a IA responder aqui.', 'Start with a suggested scenario or write a free-form message to see the AI answer here.')}
              </div>
            )}
            <div ref={props.transcriptEndRef} />
          </div>
        </div>
        {props.proposal ? (
          <div ref={props.proposalCardRef} className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-white">{props.proposal.summary}</p>
            {props.proposal.rationale ? <p className="mt-2 text-sm text-gray-300">{props.proposal.rationale}</p> : null}
            <div className="mt-4 space-y-2">
              {props.proposal.preview.map((item) => (
                <div key={item.field} className="rounded-xl border border-surface-lighter bg-surface px-3 py-2 text-sm text-gray-200">
                  <p className="font-medium text-white">{item.field}</p>
                  <p className="mt-1 text-xs text-gray-400">{props.tr('Antes', 'Before')}: {String(item.before ?? '-')}</p>
                  <p className="mt-1 text-xs text-gray-300">{props.tr('Depois', 'After')}: {String(item.after ?? '-')}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={props.applyProposal} disabled={props.changeBusy}>{props.changeBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Aplicar no rascunho', 'Apply to draft')}</Button>
              <Button variant="outline" onClick={() => (props.lastUserMessage ? void props.sendMessage(props.lastUserMessage) : undefined)} disabled={!props.lastUserMessage || props.guidedBusy}>{props.tr('Retestar última mensagem', 'Retest last message')}</Button>
            </div>
          </div>
        ) : null}

        <div className={cn('mt-4 rounded-2xl border border-surface-lighter bg-surface p-4 transition', props.changeOpen ? 'pointer-events-none opacity-50' : '')}>
          <Textarea ref={props.composerRef} rows={3} value={props.guidedInput} onChange={(event) => props.setGuidedInput(event.target.value)} placeholder={props.tr('Digite como se fosse um cliente real...', 'Type as if you were a real customer...')} />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button onClick={() => void props.sendMessage(props.guidedInput)} disabled={props.guidedBusy || props.creditsBlocked || !props.guidedEnabled || !props.guidedInput.trim() || !props.draftPayload.readiness.ready}>{props.guidedBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Enviar para a IA', 'Send to AI')}</Button>
            <Button variant="outline" onClick={props.onContinue} disabled={!props.currentSession?.transcript.some((entry) => entry.role === 'assistant')}>{props.tr('Continuar para conexão', 'Continue to connection')}</Button>
          </div>
        </div>

        <OnboardingDialog open={props.changeOpen} onOpenChange={props.setChangeOpen}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{props.tr('Solicitar mudança no comportamento', 'Request a behavior change')}</h3>
              <p className="mt-1 text-sm text-gray-400">{props.tr('Descreva o ajuste e gere uma proposta revisável antes de aplicar.', 'Describe the adjustment and generate a reviewable proposal before applying it.')}</p>
            </div>
            <button type="button" onClick={() => props.setChangeOpen(false)} className="rounded-full border border-surface-lighter p-2 text-gray-300 transition hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-4 block text-sm font-medium text-gray-200">{props.tr('O que você quer mudar na IA?', 'What do you want to change in the AI?')}</label>
          <Textarea ref={props.changeTextareaRef} rows={5} className="mt-2" value={props.changeText} onChange={(event) => props.setChangeText(event.target.value)} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={props.requestChange} disabled={props.changeBusy || !props.changeText.trim()}>{props.changeBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Gerar proposta', 'Generate proposal')}</Button>
            <Button variant="ghost" onClick={() => props.setChangeOpen(false)}>{props.tr('Cancelar', 'Cancel')}</Button>
          </div>
        </OnboardingDialog>
      </div>
    </div>
  )
}

function StepConnection(props: {
  tr: (pt: string, en: string) => string
  sessionId: string
  whatsappConnected: boolean
  onConnected: () => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Conexão do WhatsApp', 'WhatsApp connection')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-surface-lighter bg-surface p-4 text-sm text-gray-300">
            <p className="font-medium text-white">{props.tr('Conectar agora', 'Connect now')}</p>
            <p className="mt-2">{props.tr('Se você conectar agora, já termina o onboarding com a IA pronta para ativar.', 'If you connect now, you can finish onboarding with the AI ready to activate.')}</p>
          </div>
          <div className="rounded-2xl border border-surface-lighter bg-surface p-4 text-sm text-gray-300">
            <p className="font-medium text-white">{props.tr('Continuar sem conectar', 'Continue without connecting')}</p>
            <p className="mt-2">{props.tr('Publicar sem conexão salva o rascunho na IA real, mas a ativação só acontece depois do WhatsApp conectado.', 'Publishing without a connection saves the draft into the real AI, but activation only happens after WhatsApp is connected.')}</p>
          </div>
        </div>
      </div>
      <EmbeddedWhatsappConnection sessionId={props.sessionId} isConnected={props.whatsappConnected} onConnected={props.onConnected} tr={props.tr} />
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={props.onBack}>{props.tr('Voltar ao laboratório', 'Back to the lab')}</Button>
        <Button onClick={props.onContinue}>{props.whatsappConnected ? props.tr('Ir para publicar', 'Go to publish') : props.tr('Continuar sem conectar agora', 'Continue without connecting')}</Button>
      </div>
    </div>
  )
}

function StepPublish(props: {
  tr: (pt: string, en: string) => string
  toRoute: ReturnType<typeof useI18n>['toRoute']
  draftTraining: Record<string, unknown>
  selectedTemplateLabel: string
  trainingScore: number
  whatsappConnected: boolean
  confirmPublish: boolean
  setConfirmPublish: Dispatch<SetStateAction<boolean>>
  enableAiOnPublish: boolean
  setEnableAiOnPublish: Dispatch<SetStateAction<boolean>>
  publishing: boolean
  publishResult: OnboardingPublishResult | null
  onBack: () => void
  onPublish: () => void
  publishBlocked: boolean
  guidedValidation: OnboardingDraftPayload['guidedValidation']
  validationStale: boolean
}) {
  const publishLocked = Boolean(props.publishResult)

  return (
    <div className="rounded-[28px] border border-surface-lighter bg-surface-light p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">{props.tr('Revisão final e publicação', 'Final review and publish')}</h2>
        <p className="mt-1 text-sm text-gray-400">{props.tr('Este é o momento de copiar o rascunho para a configuração real da IA.', 'This is the moment to copy the draft into the real AI configuration.')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label={props.tr('Template', 'Template')} value={props.selectedTemplateLabel} />
        <SummaryCard label={props.tr('Prontidão', 'Readiness')} value={props.trainingScore.toFixed(1)} />
        <SummaryCard label={props.tr('WhatsApp', 'WhatsApp')} value={props.whatsappConnected ? props.tr('Conectado', 'Connected') : props.tr('Conexão pendente', 'Connection pending')} />
      </div>
      <div className={cn('mt-6 rounded-2xl border px-4 py-3 text-sm', props.validationStale ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : props.guidedValidation.status === 'passed' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-surface-lighter bg-surface text-gray-200')}>
        <p className="font-medium">{props.validationStale ? props.tr('Validação pendente', 'Validation pending') : props.guidedValidation.status === 'passed' ? props.tr('Laboratório validado', 'Lab validated') : props.tr('Validação com ajustes pendentes', 'Validation needs adjustments')}</p>
        <p className="mt-1">{props.validationStale ? props.tr('O rascunho mudou desde a última validação ou ela ainda não foi rodada.', 'The draft changed since the last validation or validation has not been run yet.') : props.guidedValidation.status === 'passed' ? props.tr('Os checks automáticos passaram para esta versão do rascunho.', 'The automatic checks passed for this draft version.') : props.tr('Você ainda pode publicar, mas vale retestar antes para aumentar a confiança.', 'You can still publish, but it is worth retesting first to increase confidence.')}</p>
      </div>
      <div className="mt-6 rounded-2xl border border-surface-lighter bg-surface p-4">
        <p className="text-sm font-medium text-white">{props.tr('O que será publicado', 'What will be published')}</p>
        <p className="mt-2 text-sm text-gray-400">{props.tr('Este publish copia o rascunho atual para a configuração real da IA. Sem WhatsApp conectado, o conteúdo é salvo, mas a ativação fica pendente.', 'This publish copies the current draft into the real AI configuration. Without WhatsApp connected, the content is saved but activation stays pending.')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SummaryText label={props.tr('Empresa', 'Company')} value={String(props.draftTraining.empresa ?? '-')} />
          <SummaryText
            label={props.tr('Descrição comercial', 'Commercial description')}
            value={String(props.draftTraining.descricaoServicosProdutosVendidos ?? '-')}
          />
          <SummaryText label={props.tr('Horários', 'Business hours')} value={String(props.draftTraining.horarios ?? '-')} />
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ToggleRow label={props.tr('Ativar IA assim que publicar', 'Enable AI immediately after publishing')} checked={props.enableAiOnPublish} onCheckedChange={props.setEnableAiOnPublish} disabled={publishLocked} />
        <ToggleRow label={props.tr('Confirmo que revisei o rascunho final', 'I confirm that I reviewed the final draft')} checked={props.confirmPublish} onCheckedChange={props.setConfirmPublish} disabled={publishLocked} />
      </div>
      {props.publishResult ? (
        <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">{props.tr('Publicação concluída.', 'Publishing completed.')}</p>
          <p className="mt-1">{props.publishResult.status === 'pending_connection' ? props.tr('O treinamento já foi publicado, mas a ativação final depende de conectar o WhatsApp.', 'The training is already published, but final activation depends on connecting WhatsApp.') : props.publishResult.status === 'activated' ? props.tr('A IA já foi publicada e ativada.', 'The AI has already been published and activated.') : props.tr('A IA foi publicada. Você pode ativá-la depois.', 'The AI has been published. You can enable it later.')}</p>
        </div>
      ) : null}
      {props.publishBlocked && !props.publishResult ? <p className="mt-4 text-sm text-amber-200">{props.tr('Resolva saves pendentes, alterações locais ou conflitos antes de publicar.', 'Resolve pending saves, local changes, or conflicts before publishing.')}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={props.onBack}>{props.tr('Voltar', 'Back')}</Button>
        {!props.publishResult ? (
          <Button onClick={props.onPublish} disabled={props.publishing || !props.confirmPublish || props.publishBlocked}>{props.publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{props.tr('Publicar onboarding', 'Publish onboarding')}</Button>
        ) : props.publishResult.connectionStatus === 'pending' ? (
          <Link href={props.toRoute('connections')} className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{props.tr('Conectar WhatsApp', 'Connect WhatsApp')}<ArrowRight className="ml-2 h-4 w-4" /></Link>
        ) : (
          <Link href={props.toRoute('conversations')} className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{props.tr('Ir para Conversas', 'Go to Conversations')}<ArrowRight className="ml-2 h-4 w-4" /></Link>
        )}
      </div>
    </div>
  )
}

function ToggleRow(props: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const inputId = `toggle-${props.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-center justify-between rounded-2xl border border-surface-lighter bg-surface p-4', props.disabled ? 'cursor-not-allowed opacity-60' : '')}>
      <span className="text-sm text-white">{props.label}</span>
      <Switch id={inputId} checked={props.checked} onCheckedChange={props.onCheckedChange} disabled={props.disabled} aria-label={props.label} />
    </label>
  )
}

function MiniField(props: {
  label: string
  fieldKey: string
  value: string
  onChange: (value: string) => void
  registerFieldRef: (field: string) => (node: HTMLInputElement | HTMLTextAreaElement | null) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-200" htmlFor={fieldInputId(props.fieldKey)}>{props.label}</label>
      <Textarea id={fieldInputId(props.fieldKey)} ref={props.registerFieldRef(props.fieldKey)} rows={4} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  )
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-lighter bg-surface p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{props.value}</p>
    </div>
  )
}

function SummaryText(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-lighter bg-surface-light p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-100">{props.value}</p>
    </div>
  )
}

function TemplatePreviewBlock(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-lighter bg-surface-light p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{props.label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-100">{renderTemplatePreviewText(props.value)}</p>
    </div>
  )
}

function renderTemplatePreviewText(value: string): ReactNode {
  const parts = value.split(/(\{\{[^}]+\}\})/g)
  return parts.map((part, index) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <span key={`${part}-${index}`} className="rounded bg-primary/15 px-1 py-0.5 text-primary">{part}</span>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    )
  )
}

function OnboardingDialog(props: {
  open: boolean
  onOpenChange: Dispatch<SetStateAction<boolean>>
  children: ReactNode
}) {
  const { open, onOpenChange, children } = props

  useEffect(() => {
    if (!open) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onOpenChange, open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <button type="button" aria-label="Close dialog" className="absolute inset-0" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-2xl rounded-[28px] border border-surface-lighter bg-surface-light p-6 shadow-2xl">{children}</div>
    </div>
  )
}

function snapshotFromPayload(payload: OnboardingDraftPayload): DraftSnapshot {
  return {
    currentStep: payload.currentStep,
    selectedTemplateId: payload.selectedTemplateId,
    training: payload.draft.training ?? {}
  }
}

function serializeDraftSnapshot(snapshot: DraftSnapshot): string {
  return JSON.stringify({
    currentStep: snapshot.currentStep,
    selectedTemplateId: snapshot.selectedTemplateId ?? null,
    training: normalizeTrainingInstructions(snapshot.training)
  })
}

function extractConflictDraftPayload(error: unknown): OnboardingDraftPayload | null {
  if (!(error instanceof ApiRequestError)) {
    return null
  }
  const payloadDraft = error.payload?.draft
  if (!payloadDraft || typeof payloadDraft !== 'object' || Array.isArray(payloadDraft)) {
    return null
  }
  return payloadDraft as OnboardingDraftPayload
}

function fieldInputId(field: string): string {
  return `onboarding-field-${field}`
}

function formatValidationCheckLabel(
  checkId: OnboardingDraftPayload['guidedValidation']['checks'][number]['id'],
  tr: (pt: string, en: string) => string
) {
  switch (checkId) {
    case 'no_na':
      return tr('Sem resposta “N/A”', 'No “N/A” answers')
    case 'has_cta':
      return tr('Tem CTA claro', 'Has a clear CTA')
    case 'short_message':
      return tr('Mensagens curtas', 'Short messages')
    case 'service_reference':
      return tr('Cita serviço/contexto', 'References services/context')
    case 'safe_behavior':
      return tr('Comportamento seguro', 'Safe behavior')
    default:
      return checkId
  }
}
