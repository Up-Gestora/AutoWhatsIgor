import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type BroadcastContactBody = {
  name?: string | null
  whatsapp?: string
}

export async function GET(request: NextRequest, context: { params: Promise<{ listId: string }> }) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { listId } = await context.params

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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcast-lists/${encodeURIComponent(listId)}/contacts${
      query.toString() ? `?${query}` : ''
    }`,
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

export async function POST(request: NextRequest, context: { params: Promise<{ listId: string }> }) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { listId } = await context.params

  const body = (await request.json().catch(() => ({}))) as BroadcastContactBody
  const whatsapp = typeof body?.whatsapp === 'string' ? body.whatsapp.trim() : ''
  if (!whatsapp) {
    return NextResponse.json({ error: 'whatsapp_required' }, { status: 400 })
  }

  const payload: BroadcastContactBody = {
    whatsapp
  }
  if (body.name !== undefined) {
    payload.name = body.name
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcast-lists/${encodeURIComponent(listId)}/contacts`,
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

