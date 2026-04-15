import { NextRequest, NextResponse } from 'next/server'
import { getBackendAdminKey, resolveBackendUrl } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { clearAffiliateAttributionCookies, readAffiliateCookieSnapshot } from '@/lib/affiliates/cookies'

export const runtime = 'nodejs'

type ClaimBody = {
  signupAtMs?: number | string | null
}

type ClaimBackendResponse = {
  claimed?: boolean
  attribution?: {
    affiliateCode?: string
    clickId?: string
    visitorId?: string
    attributionModel?: string
  } | null
}

export async function POST(request: NextRequest) {
  const auth = await resolveSessionId(request, null)
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

  const body = (await request.json().catch(() => ({}))) as ClaimBody
  const signupAtMs = parseTimestamp(body.signupAtMs) ?? Date.now()
  const cookieSnapshot = readAffiliateCookieSnapshot(request.cookies)
  if (!cookieSnapshot.affiliateCode || !cookieSnapshot.visitorId) {
    return NextResponse.json({ success: true, claimed: false, attribution: null })
  }

  const backendResponse = await fetch(`${backendUrl}/admin/affiliates/claim`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sessionId: auth.sessionId,
      affiliateCode: cookieSnapshot.affiliateCode,
      clickId: cookieSnapshot.clickId,
      visitorId: cookieSnapshot.visitorId,
      signupAtMs
    }),
    cache: 'no-store'
  })

  const payload = (await backendResponse.json().catch(() => null)) as ClaimBackendResponse | null
  if (!backendResponse.ok) {
    const error = payload && typeof (payload as { error?: unknown }).error === 'string'
      ? String((payload as { error?: unknown }).error)
      : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const response = NextResponse.json({
    success: true,
    claimed: payload?.claimed === true,
    attribution: payload?.attribution
      ? {
          affiliateCode: payload.attribution.affiliateCode ?? null,
          clickId: payload.attribution.clickId ?? null,
          visitorId: payload.attribution.visitorId ?? null,
          attributionModel: payload.attribution.attributionModel ?? null
        }
      : null
  })
  clearAffiliateAttributionCookies(response)
  return response
}

function parseTimestamp(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? Math.round(parsed) : null
}
