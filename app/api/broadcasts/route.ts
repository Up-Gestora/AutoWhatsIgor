import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type BroadcastJobsBody = {
  listId?: string
  removeContactIfLastMessageUndelivered?: boolean
  text?: string
  media?: {
    url?: string
    mediaType?: string
    mimeType?: string
    fileName?: string
    caption?: string
  }
}

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

  const limit = request.nextUrl.searchParams.get('limit')
  const query = new URLSearchParams()
  if (limit) {
    query.set('limit', limit)
  }

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcasts${query.toString() ? `?${query}` : ''}`,
    {
      headers: {
        'x-admin-key': adminKey
      },
      cache: 'no-store'
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}

export async function POST(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }

  const body = (await request.json().catch(() => ({}))) as BroadcastJobsBody
  const listId = typeof body?.listId === 'string' ? body.listId.trim() : ''
  if (!listId) {
    return NextResponse.json({ error: 'listId_required' }, { status: 400 })
  }

  const payload: BroadcastJobsBody = {
    listId
  }
  if (typeof body.text === 'string') {
    payload.text = body.text
  }
  if (body.media && typeof body.media === 'object') {
    payload.media = body.media
  }
  if (typeof body.removeContactIfLastMessageUndelivered === 'boolean') {
    payload.removeContactIfLastMessageUndelivered = body.removeContactIfLastMessageUndelivered
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcasts`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = result?.error ? String(result.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(result)
}

