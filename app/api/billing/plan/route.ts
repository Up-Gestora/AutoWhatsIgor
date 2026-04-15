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

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/billing`, {
    headers: {
      'x-admin-key': adminKey
    },
    cache: 'no-store'
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const stripeConfigured = Boolean(payload?.stripeConfigured)
  const status = payload?.billing?.subscription?.status ? String(payload.billing.subscription.status) : null

  const plan = status && status !== 'canceled' && status !== 'incomplete_expired' ? 'pro' : 'free'
  const canBuyCredits = status === 'active' || status === 'trialing'

  return NextResponse.json({
    success: true,
    stripeConfigured,
    subscriptionStatus: status,
    plan,
    canBuyCredits
  })
}

