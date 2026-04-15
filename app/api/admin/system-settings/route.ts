import { NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

type SystemSettingsBody = {
  debugAiPrompt?: boolean
  debugAiResponse?: boolean
  requestLogging?: boolean
  usdBrlRate?: number | string
  aiAudioTranscriptionUsdPerMin?: number | string
  newAccountCreditsBrl?: number | string
  aiPricing?: {
    models?: Record<string, { inputUsdPerM?: number; outputUsdPerM?: number }>
  }
  postInteractionProspecting?: {
    enabled?: boolean
    senderEmail?: string
    ctaBaseUrl?: string
  }
}

export async function GET(request: Request) {
  const authResult = await authenticateAdmin(request)
  if (!authResult.ok) {
    return authResult.response
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = (process.env.BACKEND_ADMIN_KEY ?? process.env.ADMIN_API_KEY ?? '').trim()

  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/admin/system-settings`, {
    headers: {
      'x-admin-key': adminKey
    }
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'backend_system_settings_fetch_failed' }, { status: 502 })
  }

  const payload = await response.json().catch(() => ({}))
  return NextResponse.json(payload)
}

export async function POST(request: Request) {
  const authResult = await authenticateAdmin(request)
  if (!authResult.ok) {
    return authResult.response
  }

  const body = (await request.json().catch(() => ({}))) as SystemSettingsBody
  const hasDebug = typeof body.debugAiPrompt === 'boolean'
  const hasResponse = typeof body.debugAiResponse === 'boolean'
  const hasRequestLogging = typeof body.requestLogging === 'boolean'
  const usdBrlRate = parseNumber(body.usdBrlRate)
  const hasUsdBrlRate = typeof usdBrlRate === 'number'
  const aiAudioTranscriptionUsdPerMin = parseNumber(body.aiAudioTranscriptionUsdPerMin)
  const hasAiAudioTranscriptionUsdPerMin = typeof aiAudioTranscriptionUsdPerMin === 'number'
  const newAccountCreditsBrl = parseNumber(body.newAccountCreditsBrl)
  const hasNewAccountCreditsBrl = typeof newAccountCreditsBrl === 'number'
  const hasAiPricing = Boolean(body.aiPricing && typeof body.aiPricing === 'object' && !Array.isArray(body.aiPricing))
  const rawPostInteractionProspecting = body.postInteractionProspecting
  const hasPostInteractionProspectingObject = Boolean(
    rawPostInteractionProspecting &&
    typeof rawPostInteractionProspecting === 'object' &&
    !Array.isArray(rawPostInteractionProspecting)
  )
  const postInteractionEnabled =
    hasPostInteractionProspectingObject && typeof rawPostInteractionProspecting?.enabled === 'boolean'
      ? rawPostInteractionProspecting.enabled
      : undefined
  const postInteractionSenderEmail =
    hasPostInteractionProspectingObject && typeof rawPostInteractionProspecting?.senderEmail === 'string'
      ? rawPostInteractionProspecting.senderEmail.trim()
      : undefined
  const postInteractionCtaBaseUrl =
    hasPostInteractionProspectingObject && typeof rawPostInteractionProspecting?.ctaBaseUrl === 'string'
      ? rawPostInteractionProspecting.ctaBaseUrl.trim()
      : undefined
  const hasPostInteractionProspecting =
    hasPostInteractionProspectingObject &&
    (
      typeof postInteractionEnabled === 'boolean' ||
      typeof postInteractionSenderEmail === 'string' ||
      typeof postInteractionCtaBaseUrl === 'string'
    )

  if (
    !hasDebug &&
    !hasResponse &&
    !hasRequestLogging &&
    !hasUsdBrlRate &&
    !hasAiAudioTranscriptionUsdPerMin &&
    !hasNewAccountCreditsBrl &&
    !hasAiPricing &&
    !hasPostInteractionProspecting
  ) {
    return NextResponse.json({ error: 'settings_required' }, { status: 400 })
  }

  if (hasNewAccountCreditsBrl && newAccountCreditsBrl < 0) {
    return NextResponse.json({ error: 'newAccountCreditsBrl_negative' }, { status: 400 })
  }
  if (hasPostInteractionProspecting && postInteractionSenderEmail === '') {
    return NextResponse.json({ error: 'postInteractionProspecting_senderEmail_required' }, { status: 400 })
  }
  if (hasPostInteractionProspecting && postInteractionCtaBaseUrl === '') {
    return NextResponse.json({ error: 'postInteractionProspecting_ctaBaseUrl_required' }, { status: 400 })
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = (process.env.BACKEND_ADMIN_KEY ?? process.env.ADMIN_API_KEY ?? '').trim()

  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/admin/system-settings`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      ...(hasDebug ? { debugAiPrompt: body.debugAiPrompt } : {}),
      ...(hasResponse ? { debugAiResponse: body.debugAiResponse } : {}),
      ...(hasRequestLogging ? { requestLogging: body.requestLogging } : {}),
      ...(hasUsdBrlRate ? { usdBrlRate } : {}),
      ...(hasAiAudioTranscriptionUsdPerMin ? { aiAudioTranscriptionUsdPerMin } : {}),
      ...(hasNewAccountCreditsBrl ? { newAccountCreditsBrl } : {}),
      ...(hasAiPricing ? { aiPricing: body.aiPricing } : {}),
      ...(hasPostInteractionProspecting
        ? {
            postInteractionProspecting: {
              ...(typeof postInteractionEnabled === 'boolean' ? { enabled: postInteractionEnabled } : {}),
              ...(typeof postInteractionSenderEmail === 'string' ? { senderEmail: postInteractionSenderEmail } : {}),
              ...(typeof postInteractionCtaBaseUrl === 'string' ? { ctaBaseUrl: postInteractionCtaBaseUrl } : {})
            }
          }
        : {})
    })
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'backend_system_settings_save_failed' }, { status: 502 })
  }

  const payload = await response.json().catch(() => ({}))
  return NextResponse.json(payload)
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

async function authenticateAdmin(request: Request) {
  if (!adminAuth) {
    return { ok: false, response: NextResponse.json({ error: 'firebase_admin_unavailable' }, { status: 500 }) }
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : authHeader.trim()

  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'missing_auth_token' }, { status: 401 }) }
  }

  let decoded
  try {
    decoded = await adminAuth.verifyIdToken(token)
  } catch (error) {
    return { ok: false, response: NextResponse.json({ error: 'invalid_auth_token' }, { status: 401 }) }
  }

  if (!adminDb) {
    return { ok: false, response: NextResponse.json({ error: 'admin_role_unavailable' }, { status: 403 }) }
  }

  const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
  const role = userDoc.exists ? userDoc.data()?.role : 'user'
  if (role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }

  return { ok: true as const }
}

function resolveBackendUrl() {
  const raw =
    process.env.BACKEND_URL?.trim() ??
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ??
    ''

  if (!raw) {
    return ''
  }

  const value = raw.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(value)) {
    return value
  }

  const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(value)
  const protocol = isLocal ? 'http' : 'https'
  return `${protocol}://${value}`
}
