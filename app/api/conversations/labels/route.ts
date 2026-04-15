import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type ChatLabelBody = {
  name?: string
  colorHex?: string
}

export async function GET(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam, {
    allowSubaccount: true,
    capability: 'conversations'
  })
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

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined
  const url = new URL(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/labels`)
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    url.searchParams.set('limit', String(limit))
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-admin-key': adminKey
    },
    cache: 'no-store'
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    if (response.status >= 400 && response.status < 500) {
      return NextResponse.json({ error }, { status: response.status })
    }
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}

export async function POST(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam, {
    allowSubaccount: true,
    capability: 'conversations'
  })
  if (auth instanceof NextResponse) {
    return auth
  }

  if (auth.isSubaccount) {
    return NextResponse.json({ error: 'subaccount_forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as ChatLabelBody
  const name = typeof body?.name === 'string' ? body.name : ''
  const colorHex = typeof body?.colorHex === 'string' ? body.colorHex : ''

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/labels`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ name, colorHex })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    if (response.status >= 400 && response.status < 500) {
      return NextResponse.json({ error }, { status: response.status })
    }
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}
