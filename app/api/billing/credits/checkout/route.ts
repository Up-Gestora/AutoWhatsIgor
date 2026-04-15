import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type CheckoutBody = {
  packageId?: '20' | '50' | '100'
  email?: string | null
}

export async function POST(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }

  const body = (await request.json().catch(() => ({}))) as CheckoutBody
  const packageId = body.packageId
  const email = typeof body.email === 'string' ? body.email : null

  if (packageId !== '20' && packageId !== '50' && packageId !== '100') {
    return NextResponse.json({ error: 'package_invalid' }, { status: 400 })
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/billing/checkout/credits`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ packageId, email })
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: response.status === 403 ? 403 : 502 })
  }

  return NextResponse.json(payload)
}
