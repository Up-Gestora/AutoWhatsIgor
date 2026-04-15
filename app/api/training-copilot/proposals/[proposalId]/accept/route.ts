import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type DecisionBody = {
  actorRole?: 'admin' | 'user' | 'system' | null
  actorUid?: string | null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> }
) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }

  const { proposalId } = await context.params
  const body = (await request.json().catch(() => ({}))) as DecisionBody

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/ai-training/proposals/${encodeURIComponent(
      proposalId
    )}/accept`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        actorRole: body.actorRole ?? auth.role,
        actorUid: body.actorUid ?? auth.uid
      }),
      cache: 'no-store'
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json(payload ?? { error: 'backend_request_failed' }, { status: response.status })
  }

  return NextResponse.json(payload)
}
