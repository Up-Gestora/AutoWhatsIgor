import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type MessageBody = {
  message?: string
  currentTraining?: {
    model?: string
    contextMaxMessages?: number
    instructions?: Record<string, unknown>
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as MessageBody
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }

  const message = body.message?.trim()
  if (!message) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 })
  }
  if (!body.currentTraining || typeof body.currentTraining !== 'object') {
    return NextResponse.json({ error: 'current_training_required' }, { status: 400 })
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/ai-training/message`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        message,
        currentTraining: body.currentTraining
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
