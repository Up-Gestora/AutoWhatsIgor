import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/userBackend'

export const runtime = 'nodejs'

type SignupMethod = 'email' | 'google'

type SignupAttribution = {
  source?: unknown
  medium?: unknown
  campaign?: unknown
  content?: unknown
  term?: unknown
  gclid?: unknown
  gbraid?: unknown
  wbraid?: unknown
  fbclid?: unknown
  landingPath?: unknown
  firstSeenAtMs?: unknown
  lastSeenAtMs?: unknown
  experiments?: unknown
  affiliateCode?: unknown
  affiliateClickId?: unknown
  affiliateVisitorId?: unknown
  attributionModel?: unknown
}

type SignupAnalyticsBody = {
  method?: unknown
  eventId?: unknown
  attribution?: SignupAttribution
}

function parseClientIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null

  const match = cookieHeader.match(/(?:^|;\s*)_ga=([^;]+)/i)
  if (!match?.[1]) return null

  const rawValue = decodeURIComponent(match[1])
  const parts = rawValue.split('.')
  if (parts.length < 4) return null

  const clientIdA = parts[parts.length - 2]
  const clientIdB = parts[parts.length - 1]
  if (!clientIdA || !clientIdB) return null

  return `${clientIdA}.${clientIdB}`
}

function fallbackClientId() {
  return `${Date.now()}.${Math.floor(Math.random() * 1_000_000_000)}`
}

function isSignupMethod(value: unknown): value is SignupMethod {
  return value === 'email' || value === 'google'
}

function isValidMeasurementId(value: string) {
  return /^G-[A-Z0-9]+$/i.test(value)
}

function sanitizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function sanitizeNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function sanitizeRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const source = value as Record<string, unknown>
  const entries = Object.entries(source)
    .map(([key, raw]) => {
      const safeKey = sanitizeString(key)
      const safeValue = sanitizeString(raw)
      return safeKey && safeValue ? ([safeKey, safeValue] as const) : null
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)

  if (entries.length === 0) {
    return undefined
  }
  return Object.fromEntries(entries)
}

function sanitizeAttribution(value: SignupAttribution | undefined): {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  landingPath?: string
  firstSeenAtMs?: number
  lastSeenAtMs?: number
  experiments?: Record<string, string>
  affiliateCode?: string
  affiliateClickId?: string
  affiliateVisitorId?: string
  attributionModel?: string
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return {
    source: sanitizeString(value.source),
    medium: sanitizeString(value.medium),
    campaign: sanitizeString(value.campaign),
    content: sanitizeString(value.content),
    term: sanitizeString(value.term),
    gclid: sanitizeString(value.gclid),
    gbraid: sanitizeString(value.gbraid),
    wbraid: sanitizeString(value.wbraid),
    fbclid: sanitizeString(value.fbclid),
    landingPath: sanitizeString(value.landingPath),
    firstSeenAtMs: sanitizeNumber(value.firstSeenAtMs),
    lastSeenAtMs: sanitizeNumber(value.lastSeenAtMs),
    experiments: sanitizeRecord(value.experiments),
    affiliateCode: sanitizeString(value.affiliateCode),
    affiliateClickId: sanitizeString(value.affiliateClickId),
    affiliateVisitorId: sanitizeString(value.affiliateVisitorId),
    attributionModel: sanitizeString(value.attributionModel)
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const body = (await request.json().catch(() => null)) as SignupAnalyticsBody | null
  const method = typeof body?.method === 'string' ? body.method.trim() : ''
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  const attribution = sanitizeAttribution(body?.attribution)

  if (!isSignupMethod(method) || !eventId) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const measurementId = (process.env.GA_MP_MEASUREMENT_ID ?? '').trim()
  const apiSecret = (process.env.GA_MP_API_SECRET ?? '').trim()

  if (!measurementId) {
    return NextResponse.json({ error: 'ga_mp_measurement_id_missing' }, { status: 500 })
  }
  if (!isValidMeasurementId(measurementId)) {
    return NextResponse.json({ error: 'ga_mp_measurement_id_invalid' }, { status: 500 })
  }
  if (!apiSecret) {
    return NextResponse.json({ error: 'ga_mp_api_secret_missing' }, { status: 500 })
  }

  const cookieHeader = request.headers.get('cookie')
  const clientId = parseClientIdFromCookie(cookieHeader) || fallbackClientId()
  const debugEnabled = request.headers.get('x-ga-debug')?.trim() === '1'

  const debugParams = debugEnabled ? { debug_mode: true } : {}
  const attributionParams = {
    ...(attribution.source ? { source: attribution.source } : {}),
    ...(attribution.source ? { utm_source: attribution.source } : {}),
    ...(attribution.medium ? { medium: attribution.medium, utm_medium: attribution.medium } : {}),
    ...(attribution.campaign ? { campaign: attribution.campaign, utm_campaign: attribution.campaign } : {}),
    ...(attribution.content ? { utm_content: attribution.content } : {}),
    ...(attribution.term ? { utm_term: attribution.term } : {}),
    ...(attribution.gclid ? { gclid: attribution.gclid } : {}),
    ...(attribution.gbraid ? { gbraid: attribution.gbraid } : {}),
    ...(attribution.wbraid ? { wbraid: attribution.wbraid } : {}),
    ...(attribution.fbclid ? { fbclid: attribution.fbclid } : {}),
    ...(attribution.landingPath ? { landing_path: attribution.landingPath } : {}),
    ...(typeof attribution.firstSeenAtMs === 'number' ? { first_seen_at_ms: attribution.firstSeenAtMs } : {}),
    ...(typeof attribution.lastSeenAtMs === 'number' ? { last_seen_at_ms: attribution.lastSeenAtMs } : {}),
    ...(attribution.experiments ? { experiments: JSON.stringify(attribution.experiments) } : {}),
    ...(attribution.affiliateCode ? { affiliate_code: attribution.affiliateCode } : {}),
    ...(attribution.affiliateClickId ? { affiliate_click_id: attribution.affiliateClickId } : {}),
    ...(attribution.affiliateVisitorId ? { affiliate_visitor_id: attribution.affiliateVisitorId } : {}),
    ...(attribution.attributionModel ? { attribution_model: attribution.attributionModel } : {})
  }
  const payload = {
    client_id: clientId,
    user_id: auth.uid,
    events: [
      {
        name: 'sign_up',
        params: {
          method,
          event_id: eventId,
          engagement_time_msec: 1,
          ...attributionParams,
          ...debugParams
        }
      },
      {
        name: 'Criar_conta_teste_gratuito',
        params: {
          method,
          account_type: 'trial',
          event_id: eventId,
          engagement_time_msec: 1,
          ...attributionParams,
          ...debugParams
        }
      }
    ]
  }

  const url =
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}` +
    `&api_secret=${encodeURIComponent(apiSecret)}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'ga_mp_request_failed' }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.warn('[analytics/signup] Failed to send GA MP event:', error)
    return NextResponse.json({ error: 'ga_mp_request_failed' }, { status: 502 })
  }
}
