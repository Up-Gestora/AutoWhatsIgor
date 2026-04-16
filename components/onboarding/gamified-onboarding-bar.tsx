'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Gift,
  Loader2,
  Sparkles,
  X
} from 'lucide-react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Button } from '@/components/ui/button'
import { auth, db } from '@/lib/firebase'
import { useI18n } from '@/lib/i18n/client'
import { GAMIFIED_ONBOARDING_OPEN_EVENT } from '@/lib/onboarding/gamified-ui'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'

type GamifiedStepId =
  | 'connection_connect_whatsapp'
  | 'training_company'
  | 'training_response_style'
  | 'training_business_rules'
  | 'test_first_ai_response'

type GamifiedStep = {
  id: GamifiedStepId
  stage: 'connection' | 'training' | 'test'
  points: number
  label: string
  completed: boolean
}

type OnboardingStatePayload = {
  success?: boolean
  state?: {
    trainingScore?: number
    milestones?: {
      whatsapp_connected?: { reached?: boolean }
      first_ai_response_sent?: { reached?: boolean }
    }
  }
}

type RewardResponse = {
  success?: boolean
  claimed?: boolean
  rewardBrl?: number
  credits?: {
    balanceBrl?: number
  } | null
  error?: string
}

type StoredGamifiedProgress = {
  awardedStepIds: GamifiedStepId[]
  rewardClaimed: boolean
  rewardBrl: number
  updatedAt: number
}

type ToastItem = {
  id: string
  title: string
  description: string
}

const STORAGE_PREFIX = 'onboarding_gamified_progress:v1:'
const LOGIN_REMINDER_PREFIX = 'onboarding_gamified_login_reminder:v1:'

function createDefaultStoredProgress(): StoredGamifiedProgress {
  return {
    awardedStepIds: [],
    rewardClaimed: false,
    rewardBrl: 0,
    updatedAt: 0
  }
}

function isGamifiedStepId(value: string): value is GamifiedStepId {
  return (
    value === 'connection_connect_whatsapp' ||
    value === 'training_company' ||
    value === 'training_response_style' ||
    value === 'training_business_rules' ||
    value === 'test_first_ai_response'
  )
}

function readStoredProgress(userId: string): StoredGamifiedProgress {
  if (typeof window === 'undefined') {
    return createDefaultStoredProgress()
  }

  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`)
  if (!raw) {
    return createDefaultStoredProgress()
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredGamifiedProgress>
    const awardedStepIds = Array.isArray(parsed.awardedStepIds)
      ? parsed.awardedStepIds.filter((stepId): stepId is GamifiedStepId => isGamifiedStepId(String(stepId)))
      : []
    return {
      awardedStepIds: Array.from(new Set(awardedStepIds)),
      rewardClaimed: parsed.rewardClaimed === true,
      rewardBrl: typeof parsed.rewardBrl === 'number' && Number.isFinite(parsed.rewardBrl) ? parsed.rewardBrl : 0,
      updatedAt: typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0
    }
  } catch {
    return createDefaultStoredProgress()
  }
}

function writeStoredProgress(userId: string, progress: StoredGamifiedProgress) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    `${STORAGE_PREFIX}${userId}`,
    JSON.stringify({
      ...progress,
      awardedStepIds: Array.from(new Set(progress.awardedStepIds.filter((stepId) => isGamifiedStepId(stepId)))),
      updatedAt: Date.now()
    } satisfies StoredGamifiedProgress)
  )
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

export function GamifiedOnboardingBar({ isSubaccount = false }: { isSubaccount?: boolean }) {
  const { user } = useAuth()
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])

  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [onboardingState, setOnboardingState] = useState<OnboardingStatePayload['state'] | null>(null)
  const [trainingInstructions, setTrainingInstructions] = useState<Record<string, unknown>>({})
  const [awardedStepIds, setAwardedStepIds] = useState<GamifiedStepId[]>([])
  const [rewardClaimed, setRewardClaimed] = useState(false)
  const [rewardBrl, setRewardBrl] = useState(0)
  const [claimingReward, setClaimingReward] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [rewardError, setRewardError] = useState<string | null>(null)
  const [onboardingLoaded, setOnboardingLoaded] = useState(false)
  const [trainingLoaded, setTrainingLoaded] = useState(false)

  const enqueueToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev, toast].slice(-4))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id))
    }, 4200)
  }, [])

  useEffect(() => {
    if (!user?.uid) {
      setAwardedStepIds([])
      setRewardClaimed(false)
      setRewardBrl(0)
      return
    }

    const stored = readStoredProgress(user.uid)
    setAwardedStepIds(stored.awardedStepIds)
    setRewardClaimed(stored.rewardClaimed)
    setRewardBrl(stored.rewardBrl)
  }, [user?.uid])

  const persistProgress = useCallback(
    (next: { awardedStepIds?: GamifiedStepId[]; rewardClaimed?: boolean; rewardBrl?: number }) => {
      if (!user?.uid) return
      const current = readStoredProgress(user.uid)
      const payload: StoredGamifiedProgress = {
        awardedStepIds: next.awardedStepIds ?? current.awardedStepIds,
        rewardClaimed: next.rewardClaimed ?? current.rewardClaimed,
        rewardBrl: next.rewardBrl ?? current.rewardBrl,
        updatedAt: Date.now()
      }
      writeStoredProgress(user.uid, payload)
    },
    [user?.uid]
  )

  const loadOnboardingState = useCallback(async () => {
    if (!auth?.currentUser || !user?.uid || isSubaccount) {
      setOnboardingState(null)
      setOnboardingLoaded(true)
      return
    }

    try {
      const token = await auth.currentUser.getIdToken()
      const response = await fetch('/api/onboarding/state', {
        headers: {
          authorization: `Bearer ${token}`
        },
        cache: 'no-store'
      })
      const payload = (await response.json().catch(() => null)) as OnboardingStatePayload | null
      if (!response.ok) {
        setOnboardingState(null)
      } else {
        setOnboardingState(payload?.state ?? null)
      }
    } catch {
      setOnboardingState(null)
    } finally {
      setOnboardingLoaded(true)
    }
  }, [isSubaccount, user?.uid])

  useEffect(() => {
    if (!user?.uid || isSubaccount) {
      setOnboardingState(null)
      setOnboardingLoaded(true)
      return
    }

    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await loadOnboardingState()
    }

    void run()
    const intervalId = window.setInterval(() => {
      void run()
    }, 45_000)

    const onFocus = () => {
      void run()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [isSubaccount, loadOnboardingState, user?.uid])

  useEffect(() => {
    if (!user?.uid || !db || isSubaccount) {
      setTrainingInstructions({})
      setTrainingLoaded(true)
      return
    }

    let didReceiveSnapshot = false
    const trainingRef = doc(db, 'users', user.uid, 'settings', 'ai_training')
    const unsubscribe = onSnapshot(
      trainingRef,
      (snapshot) => {
        const data = snapshot.data()
        const instructions =
          data?.instructions && typeof data.instructions === 'object' && !Array.isArray(data.instructions)
            ? (data.instructions as Record<string, unknown>)
            : {}
        setTrainingInstructions(instructions)
        if (!didReceiveSnapshot) {
          didReceiveSnapshot = true
          setTrainingLoaded(true)
        }
      },
      () => {
        setTrainingInstructions({})
        setTrainingLoaded(true)
      }
    )

    return () => unsubscribe()
  }, [isSubaccount, user?.uid])

  useEffect(() => {
    const handleOpen = () => {
      setIsDetailsOpen(true)
      setRewardError(null)
    }
    window.addEventListener(GAMIFIED_ONBOARDING_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(GAMIFIED_ONBOARDING_OPEN_EVENT, handleOpen)
  }, [])

  const steps = useMemo<GamifiedStep[]>(() => {
    const whatsappConnected = onboardingState?.milestones?.whatsapp_connected?.reached === true
    const firstAiResponseSent = onboardingState?.milestones?.first_ai_response_sent?.reached === true

    const companyDescription = normalizeText(trainingInstructions.empresa)
    const responseStyle = normalizeText(trainingInstructions.tipoResposta)
    const commercialDescription = normalizeText(trainingInstructions.descricaoServicosProdutosVendidos)
    const businessHours = normalizeText(trainingInstructions.horarios)
    const otherInfo = normalizeText(trainingInstructions.outros)

    const hasCompanyDescription = companyDescription.length >= 30
    const hasResponseStyle = responseStyle.length >= 20
    const hasBusinessRules =
      commercialDescription.length >= 80 && businessHours.length >= 8 && otherInfo.length >= 8

    return [
      {
        id: 'connection_connect_whatsapp',
        stage: 'connection',
        points: 40,
        label: tr('Conectar WhatsApp', 'Connect WhatsApp'),
        completed: whatsappConnected
      },
      {
        id: 'training_company',
        stage: 'training',
        points: 20,
        label: tr('Treinamento 1/3: falar sobre a empresa', 'Training 1/3: company context'),
        completed: hasCompanyDescription
      },
      {
        id: 'training_response_style',
        stage: 'training',
        points: 20,
        label: tr('Treinamento 2/3: tipo de resposta', 'Training 2/3: response style'),
        completed: hasResponseStyle
      },
      {
        id: 'training_business_rules',
        stage: 'training',
        points: 30,
        label: tr(
          'Treinamento 3/3: preços, horários e outros',
          'Training 3/3: pricing, hours, and additional rules'
        ),
        completed: hasBusinessRules
      },
      {
        id: 'test_first_ai_response',
        stage: 'test',
        points: 40,
        label: tr('Teste: primeira resposta da IA enviada', 'Test: first AI response sent'),
        completed: firstAiResponseSent
      }
    ]
  }, [
    onboardingState?.milestones?.first_ai_response_sent?.reached,
    onboardingState?.milestones?.whatsapp_connected?.reached,
    trainingInstructions.descricaoServicosProdutosVendidos,
    trainingInstructions.empresa,
    trainingInstructions.horarios,
    trainingInstructions.outros,
    trainingInstructions.tipoResposta,
    tr
  ])

  const stepSet = useMemo(() => new Set(awardedStepIds), [awardedStepIds])

  useEffect(() => {
    if (!user?.uid || isSubaccount) {
      return
    }

    const newlyCompleted = steps.filter((step) => step.completed && !stepSet.has(step.id))
    if (newlyCompleted.length === 0) {
      return
    }

    const nextAwarded = Array.from(new Set([...awardedStepIds, ...newlyCompleted.map((step) => step.id)]))
    setAwardedStepIds(nextAwarded)
    persistProgress({ awardedStepIds: nextAwarded, rewardClaimed, rewardBrl })

    newlyCompleted.forEach((step, index) => {
      window.setTimeout(() => {
        enqueueToast({
          id: `${step.id}-${Date.now()}-${index}`,
          title: tr('Pontuação atualizada', 'Score updated'),
          description: tr(`+${step.points} pontos: ${step.label}`, `+${step.points} points: ${step.label}`)
        })
      }, index * 260)
    })
  }, [awardedStepIds, enqueueToast, isSubaccount, persistProgress, rewardBrl, rewardClaimed, stepSet, steps, tr, user?.uid])

  const completedCount = useMemo(() => steps.filter((step) => step.completed).length, [steps])
  const allCompleted = steps.length > 0 && completedCount === steps.length
  const earnedPoints = useMemo(
    () => steps.reduce((sum, step) => sum + (stepSet.has(step.id) ? step.points : 0), 0),
    [stepSet, steps]
  )
  const totalPoints = useMemo(() => steps.reduce((sum, step) => sum + step.points, 0), [steps])
  const progressPercent = useMemo(
    () => (steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0),
    [completedCount, steps.length]
  )

  const connectionProgress = useMemo(
    () => ({
      done: steps.filter((step) => step.stage === 'connection' && step.completed).length,
      total: steps.filter((step) => step.stage === 'connection').length
    }),
    [steps]
  )

  const trainingProgress = useMemo(
    () => ({
      done: steps.filter((step) => step.stage === 'training' && step.completed).length,
      total: steps.filter((step) => step.stage === 'training').length
    }),
    [steps]
  )

  const testProgress = useMemo(
    () => ({
      done: steps.filter((step) => step.stage === 'test' && step.completed).length,
      total: steps.filter((step) => step.stage === 'test').length
    }),
    [steps]
  )

  useEffect(() => {
    if (!user?.uid || !onboardingLoaded || !trainingLoaded || allCompleted) {
      setShowReminderModal(false)
      return
    }

    const loginMarker =
      typeof user.metadata?.lastSignInTime === 'string' && user.metadata.lastSignInTime.trim()
        ? user.metadata.lastSignInTime
        : 'session'
    const reminderKey = `${LOGIN_REMINDER_PREFIX}${user.uid}:${loginMarker}`
    const alreadyShown = window.sessionStorage.getItem(reminderKey)
    if (alreadyShown) {
      return
    }

    window.sessionStorage.setItem(reminderKey, '1')
    setShowReminderModal(true)
  }, [allCompleted, onboardingLoaded, trainingLoaded, user?.metadata?.lastSignInTime, user?.uid])

  const claimReward = useCallback(async () => {
    if (!auth?.currentUser || !allCompleted || claimingReward) {
      return
    }

    setRewardError(null)
    setClaimingReward(true)
    try {
      const token = await auth.currentUser.getIdToken()
      const response = await fetch('/api/onboarding/gamified-reward', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        }
      })
      const payload = (await response.json().catch(() => null)) as RewardResponse | null

      if (!response.ok) {
        const errorCode = payload?.error ?? 'reward_claim_failed'
        setRewardError(
          errorCode === 'onboarding_not_complete'
            ? tr(
                'Conclua conexão, treinamento e teste para liberar o bônus.',
                'Complete connection, training, and test to unlock the reward.'
              )
            : tr('Não foi possível resgatar o bônus agora.', 'Could not claim the reward right now.')
        )
        return
      }

      const nextRewardBrl =
        typeof payload?.rewardBrl === 'number' && Number.isFinite(payload.rewardBrl)
          ? payload.rewardBrl
          : rewardBrl
      const claimed = payload?.claimed === true

      setRewardClaimed(true)
      setRewardBrl(nextRewardBrl)
      persistProgress({
        awardedStepIds,
        rewardClaimed: true,
        rewardBrl: nextRewardBrl
      })

      enqueueToast({
        id: `reward-${Date.now()}`,
        title: claimed
          ? tr('Bônus liberado', 'Reward unlocked')
          : tr('Bônus já resgatado', 'Reward already claimed'),
        description: claimed
          ? tr(
              `+${nextRewardBrl.toFixed(2)} créditos adicionados na conta.`,
              `+${nextRewardBrl.toFixed(2)} credits were added to your account.`
            )
          : tr('Você já recebeu este bônus anteriormente.', 'You have already received this reward before.')
      })
    } catch {
      setRewardError(tr('Erro ao resgatar bônus.', 'Failed to claim reward.'))
    } finally {
      setClaimingReward(false)
    }
  }, [allCompleted, awardedStepIds, claimingReward, enqueueToast, persistProgress, rewardBrl, tr])

  if (!user?.uid || isSubaccount) {
    return null
  }

  return (
    <>
      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed bottom-24 right-4 z-[130] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto rounded-xl border border-primary/35 bg-surface-light/95 px-4 py-3 shadow-xl backdrop-blur-md animate-fade-in"
            >
              <p className="text-sm font-semibold text-primary">{toast.title}</p>
              <p className="mt-1 text-xs text-gray-300">{toast.description}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showReminderModal ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-surface-lighter bg-surface-light p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowReminderModal(false)}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-surface hover:text-white"
              aria-label={tr('Fechar lembrete', 'Close reminder')}
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="text-xl font-bold text-white">
              {tr('Trilha de implementação pendente', 'Implementation journey pending')}
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              {tr(
                'Você ainda não concluiu todas as etapas de implantação. Continue a trilha para liberar o bônus de créditos.',
                'You have not completed all setup steps yet. Continue the journey to unlock bonus credits.'
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-surface-lighter bg-surface text-gray-200"
                onClick={() => setShowReminderModal(false)}
              >
                {tr('Depois', 'Later')}
              </Button>
              <Button
                type="button"
                className="bg-primary text-black hover:bg-primary/90"
                onClick={() => {
                  setShowReminderModal(false)
                  setIsDetailsOpen(true)
                  setRewardError(null)
                }}
              >
                {tr('Ver trilha agora', 'View journey now')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isDetailsOpen ? (
        <div className="fixed inset-0 z-[215] flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl border border-surface-lighter bg-surface-light p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {tr('Onboarding gamificado', 'Gamified onboarding')}
                </p>
                <h3 className="mt-1 text-xl font-bold text-white">
                  {tr('Trilha de implementação', 'Implementation journey')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-lighter text-gray-300 transition hover:bg-surface hover:text-white"
                aria-label={tr('Fechar trilha', 'Close journey')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                <span>{tr('Progresso geral', 'Overall progress')}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {earnedPoints}/{totalPoints} {tr('pontos acumulados', 'points earned')}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg border border-surface-lighter bg-surface px-2 py-2 text-center text-gray-300">
                {tr('Conexão', 'Connection')}: {connectionProgress.done}/{connectionProgress.total}
              </div>
              <div className="rounded-lg border border-surface-lighter bg-surface px-2 py-2 text-center text-gray-300">
                {tr('Treinamento', 'Training')}: {trainingProgress.done}/{trainingProgress.total}
              </div>
              <div className="rounded-lg border border-surface-lighter bg-surface px-2 py-2 text-center text-gray-300">
                {tr('Teste', 'Test')}: {testProgress.done}/{testProgress.total}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
                    step.completed
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : 'border-surface-lighter bg-surface'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {step.completed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-gray-500" />
                    )}
                    <span className={cn('truncate text-xs', step.completed ? 'text-emerald-100' : 'text-gray-300')}>
                      {step.label}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    +{step.points}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-surface-lighter bg-surface p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {tr('Bônus final de créditos', 'Final credit reward')}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {allCompleted
                      ? tr(
                          'Todas as etapas concluídas. Resgate agora seu bônus.',
                          'All steps completed. Claim your reward now.'
                        )
                      : tr(
                          'Finalize todas as etapas para liberar o bônus.',
                          'Complete all steps to unlock the reward.'
                        )}
                  </p>
                </div>
                <Gift className="h-5 w-5 shrink-0 text-primary" />
              </div>

              <Button
                type="button"
                onClick={claimReward}
                disabled={!allCompleted || rewardClaimed || claimingReward}
                className="h-12 w-full bg-gradient-to-r from-primary via-emerald-400 to-lime-300 text-black text-base font-bold hover:opacity-95 disabled:opacity-60"
              >
                {claimingReward ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {rewardClaimed
                  ? tr('Bônus já resgatado', 'Reward already claimed')
                  : tr('Resgatar bônus de créditos', 'Claim credit reward')}
              </Button>
              {rewardClaimed ? (
                <p className="mt-2 text-xs text-emerald-300">
                  {tr(`Bônus recebido: R$ ${rewardBrl.toFixed(2)}`, `Reward received: R$ ${rewardBrl.toFixed(2)}`)}
                </p>
              ) : null}
              {rewardError ? <p className="mt-2 text-xs text-red-300">{rewardError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
