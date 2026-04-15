import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { adminDb } from '@/lib/firebaseAdmin'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import { computeTrainingCompleteness } from '@/lib/training/completeness'
import { mergeTrainingCommercialDescription } from '@/lib/training/schema'

export const runtime = 'nodejs'

const BACKEND_REQUEST_TIMEOUT_MS = 8000

type AiConfigBody = {
  sessionId?: string
  responderGrupos?: boolean
  esconderGrupos?: boolean
  respondInGroups?: boolean
  enabled?: boolean
  aiEnabled?: boolean
  isAiEnabled?: boolean
  contextMaxMessages?: number | string
  training?: Record<string, unknown>
  instructions?: Record<string, unknown>
  provider?: string
  model?: string
  onboardingSoftBlockOverrideConfirmed?: boolean
}

type AiConfigPayload = {
  success?: boolean
  config?: Record<string, unknown> | null
}

type TrainingFlags = {
  responderGrupos?: boolean
  esconderGrupos?: boolean
}

export async function GET(request: Request) {
  try {
    const sessionIdParam = new URL(request.url).searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }

    const backendUrl = resolveBackendUrl()
    const adminKey = getBackendAdminKey()
    if (!backendUrl) {
      return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
    }
    if (!adminKey) {
      return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
    }

    let configResponse: Response
    try {
      configResponse = await fetchBackend(`${backendUrl}/admin/ai/config/${encodeURIComponent(auth.sessionId)}`, {
        headers: {
          'x-admin-key': adminKey
        },
        cache: 'no-store'
      })
    } catch (error) {
      const detail = normalizeRuntimeErrorMessage(error)
      return NextResponse.json({ error: 'backend_config_fetch_unreachable', detail }, { status: 502 })
    }

    const configPayload = (await configResponse
      .json()
      .catch(() => ({} as AiConfigPayload))) as AiConfigPayload
    if (!configResponse.ok) {
      const detail = await extractBackendFailure(configResponse)
      console.error('[ai-config] Failed to fetch backend config', {
        sessionId: auth.sessionId,
        status: configResponse.status,
        detail
      })
      const error = (configPayload as any)?.error ? String((configPayload as any).error) : 'backend_config_fetch_failed'
      return NextResponse.json({ error, detail }, { status: 502 })
    }

    const currentConfig =
      configPayload &&
      configPayload.config &&
      typeof configPayload.config === 'object' &&
      !Array.isArray(configPayload.config)
        ? (configPayload.config as Record<string, unknown>)
        : null

    const currentEnabled = currentConfig && typeof currentConfig.enabled === 'boolean' ? currentConfig.enabled : undefined
    const currentRespondInGroups =
      currentConfig && typeof currentConfig.respondInGroups === 'boolean' ? currentConfig.respondInGroups : undefined
    const currentTraining = pickTraining(
      currentConfig && typeof currentConfig.training === 'object' && !Array.isArray(currentConfig.training)
        ? (currentConfig.training as Record<string, unknown>)
        : undefined
    )
    if (currentTraining && typeof currentTraining.responderGrupos !== 'boolean' && typeof currentRespondInGroups === 'boolean') {
      currentTraining.responderGrupos = currentRespondInGroups
    }
    if (currentTraining?.esconderGrupos === true) {
      currentTraining.responderGrupos = false
    }
    let currentTrainingFlags =
      currentTraining &&
      (typeof currentTraining.responderGrupos === 'boolean' || typeof currentTraining.esconderGrupos === 'boolean')
        ? ({
            ...(typeof currentTraining.responderGrupos === 'boolean'
              ? { responderGrupos: currentTraining.responderGrupos }
              : {}),
            ...(typeof currentTraining.esconderGrupos === 'boolean'
              ? { esconderGrupos: currentTraining.esconderGrupos }
              : {})
          } satisfies TrainingFlags)
        : null
    let enabled = currentEnabled

    let firestoreEnabled: boolean | undefined
    let firestoreTrainingFlags: TrainingFlags | null = null
    let firestoreTrainingLanguage: 'pt-BR' | 'en' | undefined
    if (adminDb) {
      try {
        const userRef = adminDb.collection('users').doc(auth.sessionId)
        const [userDoc, trainingDoc] = await Promise.all([
          userRef.get(),
          userRef.collection('settings').doc('ai_training').get()
        ])

        const enabledValue = userDoc.exists ? userDoc.data()?.isAiEnabled : undefined
        if (typeof enabledValue === 'boolean') {
          firestoreEnabled = enabledValue
        }

        const rawInstructions = trainingDoc.exists ? trainingDoc.data()?.instructions : undefined
        if (rawInstructions && typeof rawInstructions === 'object' && !Array.isArray(rawInstructions)) {
          const normalizedTraining = pickTraining(rawInstructions as Record<string, unknown>)
          const flags: TrainingFlags = {}
          if (normalizedTraining && typeof normalizedTraining.responderGrupos === 'boolean') {
            flags.responderGrupos = normalizedTraining.responderGrupos
          }
          if (normalizedTraining && typeof normalizedTraining.esconderGrupos === 'boolean') {
            flags.esconderGrupos = normalizedTraining.esconderGrupos
          }
          if (normalizedTraining && typeof normalizedTraining.language === 'string') {
            firestoreTrainingLanguage = normalizedTraining.language as 'pt-BR' | 'en'
          }
          if (flags.esconderGrupos === true) {
            flags.responderGrupos = false
          }
          if (Object.keys(flags).length > 0) {
            firestoreTrainingFlags = flags
          }
        }
      } catch (error) {
        console.warn('[ai-config] Failed to load Firestore fallback:', normalizeRuntimeErrorMessage(error))
      }
    }

    if (!currentTrainingFlags && firestoreTrainingFlags) {
      currentTrainingFlags = firestoreTrainingFlags
    } else if (currentTrainingFlags && firestoreTrainingFlags) {
      currentTrainingFlags = {
        ...firestoreTrainingFlags,
        ...currentTrainingFlags
      }
    }
    if (currentTrainingFlags?.esconderGrupos === true) {
      currentTrainingFlags = {
        ...currentTrainingFlags,
        responderGrupos: false
      }
    }
    let shouldBackfillLanguage = false
    if (
      currentTraining &&
      typeof currentTraining.language !== 'string' &&
      typeof firestoreTrainingLanguage === 'string'
    ) {
      currentTraining.language = firestoreTrainingLanguage
      shouldBackfillLanguage = true
    }

    let shouldPersistMigration = false
    if (typeof enabled !== 'boolean') {
      enabled = typeof firestoreEnabled === 'boolean' ? firestoreEnabled : false
      shouldPersistMigration = true
    }
    if (shouldBackfillLanguage) {
      shouldPersistMigration = true
    }

    if (shouldPersistMigration) {
      // Lazy migration: persist enabled in backend-b so the UI and backend share the same source of truth.
      try {
        const nextConfig = {
          ...(currentConfig ?? {}),
          ...(typeof enabled === 'boolean' ? { enabled } : {}),
          ...(currentTraining ? { training: currentTraining } : {})
        }
        const migrationResponse = await fetchBackend(
          `${backendUrl}/admin/ai/config/${encodeURIComponent(auth.sessionId)}`,
          {
            method: 'POST',
            headers: {
              'x-admin-key': adminKey,
              'content-type': 'application/json'
            },
            body: JSON.stringify({ config: nextConfig })
          }
        )
        if (!migrationResponse.ok) {
          const detail = await extractBackendFailure(migrationResponse)
          console.warn('[ai-config] Lazy migration rejected by backend:', detail)
        }
      } catch (error) {
        console.warn('[ai-config] Lazy migration failed:', normalizeRuntimeErrorMessage(error))
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: auth.sessionId,
      enabled,
      ...(typeof currentRespondInGroups === 'boolean' ? { respondInGroups: currentRespondInGroups } : {}),
      ...(currentTrainingFlags ? { training: currentTrainingFlags } : {})
    })
  } catch (error) {
    const detail = normalizeRuntimeErrorMessage(error)
    console.error('[ai-config] GET failed with unhandled error', detail)
    return NextResponse.json({ error: 'ai_config_get_failed', detail }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AiConfigBody
    const sessionIdParam = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : null
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }

    const respondInGroups =
      typeof body.respondInGroups === 'boolean'
        ? body.respondInGroups
        : typeof body.responderGrupos === 'boolean'
          ? body.responderGrupos
          : undefined
    const enabled =
      typeof body.enabled === 'boolean'
        ? body.enabled
        : typeof body.aiEnabled === 'boolean'
          ? body.aiEnabled
          : typeof body.isAiEnabled === 'boolean'
            ? body.isAiEnabled
            : undefined

    const contextMaxMessages = parseContextMaxMessages(body.contextMaxMessages)
    if (contextMaxMessages === 'invalid') {
      return NextResponse.json({ error: 'context_max_messages_invalid' }, { status: 400 })
    }

    const provider = normalizeProvider(body.provider)
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined
    const training = pickTraining(body.training ?? body.instructions)
    const hideGroups = training?.esconderGrupos === true || body.esconderGrupos === true
    const effectiveRespondInGroups = hideGroups ? false : respondInGroups

    if (
      typeof effectiveRespondInGroups !== 'boolean' &&
      typeof enabled !== 'boolean' &&
      typeof contextMaxMessages !== 'number' &&
      !training &&
      !provider &&
      !model
    ) {
      return NextResponse.json({ error: 'config_update_required' }, { status: 400 })
    }

    const backendUrl = resolveBackendUrl()
    const adminKey = getBackendAdminKey()

    if (!backendUrl) {
      return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
    }
    if (!adminKey) {
      return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
    }

    const baseHeaders = {
      'x-admin-key': adminKey
    }

    let configResponse: Response
    try {
      configResponse = await fetchBackend(`${backendUrl}/admin/ai/config/${encodeURIComponent(auth.sessionId)}`, {
        headers: baseHeaders
      })
    } catch (error) {
      const detail = normalizeRuntimeErrorMessage(error)
      return NextResponse.json({ error: 'backend_config_fetch_unreachable', detail }, { status: 502 })
    }

    if (!configResponse.ok) {
      const detail = await extractBackendFailure(configResponse)
      console.error('[ai-config] Failed to load current backend config before save', {
        sessionId: auth.sessionId,
        status: configResponse.status,
        detail
      })
      return NextResponse.json({ error: 'backend_config_fetch_failed', detail }, { status: 502 })
    }

    const configPayload = await configResponse.json().catch(() => ({} as { config?: Record<string, unknown> }))
    const currentConfig =
      configPayload && typeof configPayload.config === 'object' && !Array.isArray(configPayload.config)
        ? (configPayload.config as Record<string, unknown>)
        : {}
    const previousEnabled = currentConfig.enabled === true
    const currentTraining = pickTraining(
      currentConfig && typeof currentConfig.training === 'object' && !Array.isArray(currentConfig.training)
        ? (currentConfig.training as Record<string, unknown>)
        : undefined
    )
    const mergedTraining =
      training && currentTraining
        ? pickTraining({
            ...currentTraining,
            ...training
          })
        : training
    const previousScore = computeTrainingCompleteness(currentTraining ?? {}).score
    const nextScore = computeTrainingCompleteness(mergedTraining ?? currentTraining ?? {}).score

    const nextConfig = {
      ...currentConfig,
      ...(typeof effectiveRespondInGroups === 'boolean' ? { respondInGroups: effectiveRespondInGroups } : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
      ...(typeof contextMaxMessages === 'number' ? { contextMaxMessages } : {}),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(mergedTraining ? { training: mergedTraining } : {})
    }
    const nextEnabled = nextConfig.enabled === true

    let saveResponse: Response
    try {
      saveResponse = await fetchBackend(`${backendUrl}/admin/ai/config/${encodeURIComponent(auth.sessionId)}`, {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ config: nextConfig })
      })
    } catch (error) {
      const detail = normalizeRuntimeErrorMessage(error)
      return NextResponse.json({ error: 'backend_config_save_unreachable', detail }, { status: 502 })
    }

    if (!saveResponse.ok) {
      const detail = await extractBackendFailure(saveResponse)
      console.error('[ai-config] Backend rejected config save', {
        sessionId: auth.sessionId,
        status: saveResponse.status,
        detail
      })
      return NextResponse.json({ error: 'backend_config_save_failed', detail }, { status: 502 })
    }

    const onboardingEvents: Promise<void>[] = []
    if (mergedTraining) {
      onboardingEvents.push(
        recordOnboardingEvent({
          backendUrl,
          adminKey,
          sessionId: auth.sessionId,
          eventName: 'training_score_updated',
          properties: {
            score: nextScore,
            previousScore
          }
        })
      )
      if (previousScore < 70 && nextScore >= 70) {
        onboardingEvents.push(
          recordOnboardingEvent({
            backendUrl,
            adminKey,
            sessionId: auth.sessionId,
            eventName: 'training_score_70_reached',
            properties: {
              score: nextScore,
              previousScore
            }
          })
        )
      }
    }

    if (!previousEnabled && nextEnabled) {
      onboardingEvents.push(
        recordOnboardingEvent({
          backendUrl,
          adminKey,
          sessionId: auth.sessionId,
          eventName: 'ai_enabled',
          properties: {
            enabled: true
          }
        })
      )
    }

    if (body.onboardingSoftBlockOverrideConfirmed === true) {
      onboardingEvents.push(
        recordOnboardingEvent({
          backendUrl,
          adminKey,
          sessionId: auth.sessionId,
          eventName: 'onboarding_soft_block_override_confirmed',
          properties: {
            score: nextScore
          }
        })
      )
    }

    if (onboardingEvents.length > 0) {
      void Promise.allSettled(onboardingEvents)
    }

    return NextResponse.json({
      success: true,
      sessionId: auth.sessionId,
      ...(typeof effectiveRespondInGroups === 'boolean'
        ? { respondInGroups: effectiveRespondInGroups }
        : {}),
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
      ...(mergedTraining ? { trainingScore: nextScore } : {})
    })
  } catch (error) {
    const detail = normalizeRuntimeErrorMessage(error)
    console.error('[ai-config] POST failed with unhandled error', detail)
    return NextResponse.json({ error: 'ai_config_save_failed', detail }, { status: 500 })
  }
}

function pickTraining(raw?: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined
  }

  const source = raw
  const training: Record<string, unknown> = {}
  const getSourceValue = (keys: string[]) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        return source[key]
      }
    }
    return undefined
  }
  const setString = (key: string, aliases: string[] = []) => {
    const value = getSourceValue([key, ...aliases])
    if (typeof value === 'string') {
      training[key] = value
    }
  }
  const setBoolean = (key: string, aliases: string[] = []) => {
    const value = getSourceValue([key, ...aliases])
    if (typeof value === 'boolean') {
      training[key] = value
    }
  }
  const setInteger = (key: string, min: number, max: number, aliases: string[] = []) => {
    const value = getSourceValue([key, ...aliases])
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : NaN
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return
    }
    training[key] = Math.max(min, Math.min(max, parsed))
  }
  const setEnum = (key: string, allowed: string[], aliases: string[] = []) => {
    const value = getSourceValue([key, ...aliases])
    if (typeof value !== 'string') {
      return
    }
    const normalized = value.trim().toLowerCase()
    if (allowed.includes(normalized)) {
      training[key] = normalized
    }
  }
  const setLanguage = () => {
    const value = source.language
    if (typeof value !== 'string') {
      return
    }

    const normalized = value.trim().toLowerCase()
    if (
      normalized === 'pt' ||
      normalized === 'pt-br' ||
      normalized === 'pt_br' ||
      normalized.startsWith('pt-') ||
      normalized.startsWith('pt_')
    ) {
      training.language = 'pt-BR'
      return
    }
    if (normalized === 'en' || normalized === 'en-us' || normalized === 'en-gb' || normalized.startsWith('en-')) {
      training.language = 'en'
    }
  }

  setLanguage()
  setString('nomeEmpresa')
  setString('nomeIA')
  setBoolean('seApresentarComoIA')
  setBoolean('permitirIATextoPersonalizadoAoEncaminharHumano')
  setBoolean('usarEmojis')
  setBoolean('usarAgendaAutomatica')
  setBoolean('desligarMensagemForaContexto')
  setBoolean('desligarIASeUltimasDuasMensagensNaoRecebidas', ['desligarIASeUltimasDuasMensagensNãoRecebidas'])
  setBoolean('desligarIASeHumanoRecente')
  setBoolean('desligarIASeHumanoRecenteUsarDias')
  setBoolean('desligarIASeHumanoRecenteUsarMensagens')
  setInteger(
    'desligarIASeHumanoRecenteDias',
    TRAINING_RECENT_HUMAN_DAYS_MIN,
    TRAINING_RECENT_HUMAN_DAYS_MAX
  )
  setInteger(
    'desligarIASeHumanoRecenteMensagens',
    TRAINING_RECENT_HUMAN_MESSAGES_MIN,
    TRAINING_RECENT_HUMAN_MESSAGES_MAX
  )
  setBoolean('responderClientes')
  setBoolean('autoClassificarLeadComoCliente')
  setBoolean('permitirSugestoesCamposLeadsClientes')
  setBoolean('aprovarAutomaticamenteSugestoesLeadsClientes')
  setString('instrucoesSugestoesLeadsClientes')
  setBoolean('permitirIAEnviarArquivos')
  setBoolean('permitirIAOuvirAudios')
  setBoolean('permitirIALerImagensEPdfs')
  setBoolean('responderGrupos')
  setBoolean('esconderGrupos')
  setEnum('comportamentoNaoSabe', ['encaminhar', 'silencio', 'silêncio'], ['comportamentoNãoSabe'])
  setString('mensagemEncaminharHumano')
  setString('tipoResposta')
  setString('orientacoesGerais')
  setString('orientacoesFollowUp')
  setString('instrucoesLeadsTagPassiva')
  setString('instrucoesLeadsTagAtiva')
  setString('instrucoesFollowUpTagPassiva')
  setString('instrucoesFollowUpTagAtiva')
  setString('empresa')
  const descricaoServicosProdutosVendidos = mergeTrainingCommercialDescription(
    source,
    training.language === 'en' ? 'en' : 'pt-BR'
  )
  if (descricaoServicosProdutosVendidos) {
    training.descricaoServicosProdutosVendidos = descricaoServicosProdutosVendidos
  }
  setString('horarios')
  setString('outros')
  setFollowUpAutomatic()

  if (training.comportamentoNaoSabe === 'silêncio') {
    training.comportamentoNaoSabe = 'silencio'
  }

  if (training.permitirSugestoesCamposLeadsClientes !== true) {
    training.aprovarAutomaticamenteSugestoesLeadsClientes = false
  }

  if (training.esconderGrupos === true) {
    training.responderGrupos = false
  }

  return Object.keys(training).length > 0 ? training : undefined

  function setFollowUpAutomatic() {
    const rawValue = source.followUpAutomatico ?? source.followUpAutomatic
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return
    }

    const followUpSource = rawValue as Record<string, unknown>
    const next: Record<string, unknown> = {}

    if (typeof followUpSource.enabled === 'boolean') {
      next.enabled = followUpSource.enabled
    }
    if (typeof followUpSource.allowClients === 'boolean') {
      next.allowClients = followUpSource.allowClients
    }

    if (Object.keys(next).length > 0) {
      training.followUpAutomatico = next
    }
  }
}

function normalizeProvider(value?: string) {
  if (!value) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === 'openai') {
    return 'openai'
  }
  if (normalized === 'google' || normalized === 'gemini') {
    return 'google'
  }
  return undefined
}

type RecordOnboardingEventArgs = {
  backendUrl: string
  adminKey: string
  sessionId: string
  eventName:
    | 'training_score_updated'
    | 'training_score_70_reached'
    | 'ai_enabled'
    | 'onboarding_soft_block_override_confirmed'
  properties?: Record<string, unknown>
}

async function recordOnboardingEvent(args: RecordOnboardingEventArgs): Promise<void> {
  const response = await fetchBackend(
    `${args.backendUrl}/sessions/${encodeURIComponent(args.sessionId)}/onboarding/events`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': args.adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventName: args.eventName,
        eventSource: 'frontend',
        occurredAtMs: Date.now(),
        properties: args.properties ?? {}
      })
    }
  )
  if (!response.ok) {
    const error = await extractBackendFailure(response)
    throw new Error(error)
  }
}

async function fetchBackend(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BACKEND_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('backend_request_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function extractBackendFailure(response: Response): Promise<string> {
  const { payload, rawText } = await parseResponsePayload<Record<string, unknown>>(response)
  return buildHttpErrorMessage(response.status, payload, rawText)
}

function normalizeRuntimeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return 'unknown_error'
}

const CONTEXT_MAX_MESSAGES_MIN = 10
const CONTEXT_MAX_MESSAGES_MAX = 100
const TRAINING_RECENT_HUMAN_DAYS_MIN = 1
const TRAINING_RECENT_HUMAN_DAYS_MAX = 30
const TRAINING_RECENT_HUMAN_MESSAGES_MIN = 1
const TRAINING_RECENT_HUMAN_MESSAGES_MAX = 200

function parseContextMaxMessages(value: unknown): number | undefined | 'invalid' {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'string' && !value.trim()) {
    return 'invalid'
  }

  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return 'invalid'
  }

  if (num < CONTEXT_MAX_MESSAGES_MIN) {
    return CONTEXT_MAX_MESSAGES_MIN
  }
  if (num > CONTEXT_MAX_MESSAGES_MAX) {
    return CONTEXT_MAX_MESSAGES_MAX
  }
  return num
}
