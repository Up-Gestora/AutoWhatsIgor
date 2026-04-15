import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type SendBody = {
  text?: string
  idempotencyKey?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }

  const body = (await request.json().catch(() => ({}))) as SendBody
  const text = body.text?.trim()
  const idempotencyKey = body.idempotencyKey?.trim()

  if (!text) {
    return NextResponse.json({ error: 'text_required' }, { status: 400 })
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/chats/${encodeURIComponent(chatId)}/ai/followup/send`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        text,
        ...(idempotencyKey ? { idempotencyKey } : {})
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

