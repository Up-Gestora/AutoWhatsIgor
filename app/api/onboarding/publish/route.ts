import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string
    expectedVersion?: number | string | null
    enableAi?: boolean
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

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/onboarding/publish`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      expectedVersion: body.expectedVersion,
      enableAi: body.enableAi === true
    })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error, draft: payload?.draft ?? null }, { status: response.status })
  }

  if (adminDb && payload?.draft?.training && typeof payload.draft.training === 'object') {
    const userRef = adminDb.collection('users').doc(auth.sessionId)
    await Promise.allSettled([
      userRef.set({ isAiEnabled: payload?.enabled === true }, { merge: true }),
      userRef.collection('settings').doc('ai_training').set(
        {
          instructions: payload.draft.training,
          updatedAt: new Date().toISOString()
        },
        { mergeFields: ['instructions', 'updatedAt'] }
      )
    ])
  }

  return NextResponse.json(payload)
}
