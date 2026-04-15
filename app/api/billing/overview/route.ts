import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
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

  const headers = {
    'x-admin-key': adminKey
  }

  const [billingResponse, creditsResponse] = await Promise.all([
    fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/billing`, {
      headers,
      cache: 'no-store'
    }),
    fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/credits`, {
      headers,
      cache: 'no-store'
    })
  ])

  const billingPayload = await billingResponse.json().catch(() => null)
  if (!billingResponse.ok) {
    const error = billingPayload?.error ? String(billingPayload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const creditsPayload = await creditsResponse.json().catch(() => null)
  if (!creditsResponse.ok) {
    const error = creditsPayload?.error ? String(creditsPayload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    stripeConfigured: Boolean(billingPayload?.stripeConfigured),
    billing: billingPayload?.billing ?? null,
    plans: billingPayload?.plans ?? null,
    credits: creditsPayload?.credits ?? null
  })
}

