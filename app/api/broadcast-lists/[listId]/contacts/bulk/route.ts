import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type BulkContact = {
  name?: string | null
  whatsapp?: string
}

type BulkBody = {
  contacts?: BulkContact[]
}

export async function POST(request: NextRequest, context: { params: Promise<{ listId: string }> }) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { listId } = await context.params

  const body = (await request.json().catch(() => ({}))) as BulkBody
  const contacts = Array.isArray(body?.contacts) ? body.contacts : []
  if (contacts.length === 0) {
    return NextResponse.json({ error: 'contacts_required' }, { status: 400 })
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/broadcast-lists/${encodeURIComponent(listId)}/contacts/bulk`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ contacts })
    }
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}

