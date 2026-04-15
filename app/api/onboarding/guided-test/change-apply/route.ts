import { NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string
    expectedVersion?: number | string | null
    proposal?: {
      id?: string | null
      patch?: Record<string, unknown> | null
      summary?: string | null
      rationale?: string | null
    } | null
  }
  const sessionIdParam = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const auth = await resolveSessionId(request, sessionIdParam || null)
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

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/onboarding/guided-test/change-apply`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        expectedVersion: body.expectedVersion,
        proposal: body.proposal
      })
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error, draft: payload?.draft ?? null }, { status: response.status })
  }

  return NextResponse.json(payload)
}
