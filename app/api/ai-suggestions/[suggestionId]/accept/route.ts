import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type AcceptBody = {
  patch?: {
    status?: string
    nextContactAt?: number | string | null
    observations?: string | null
  }
}

type BackendAcceptPayload = AcceptBody & {
  decisionSource: 'manual'
  decisionActorRole: 'admin' | 'user'
  decisionActorUid: string
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ suggestionId: string }> }
) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { suggestionId } = await context.params

  const body = (await request.json().catch(() => ({}))) as AcceptBody
  const payload: BackendAcceptPayload = {
    decisionSource: 'manual',
    decisionActorRole: auth.role,
    decisionActorUid: auth.uid
  }
  if (body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch)) {
    payload.patch = body.patch
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/ai-suggestions/${encodeURIComponent(suggestionId)}/accept`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  )

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = result?.error ? String(result.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(result)
}

