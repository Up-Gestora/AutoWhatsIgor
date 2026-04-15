import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type BroadcastContactBody = {
  name?: string | null
  whatsapp?: string
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ listId: string; contactId: string }> }
) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { listId, contactId } = await context.params

  const body = (await request.json().catch(() => ({}))) as BroadcastContactBody
  const payload: BroadcastContactBody = {}
  if (body.name !== undefined) {
    payload.name = body.name
  }
  if (typeof body.whatsapp === 'string' && body.whatsapp.trim()) {
    payload.whatsapp = body.whatsapp.trim()
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'contact_update_required' }, { status: 400 })
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcast-lists/${encodeURIComponent(listId)}/contacts/${encodeURIComponent(contactId)}`,
    {
      method: 'PATCH',
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ listId: string; contactId: string }> }
) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { listId, contactId } = await context.params

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcast-lists/${encodeURIComponent(listId)}/contacts/${encodeURIComponent(contactId)}`,
    {
      method: 'DELETE',
      headers: {
        'x-admin-key': adminKey
      }
    }
  )

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = result?.error ? String(result.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(result)
}

