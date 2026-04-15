import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { SITE_URL } from '@/lib/site-url'

export const runtime = 'nodejs'

type AffiliateLinkBody = {
  code?: string
  name?: string
  status?: string | null
}

type BackendLink = {
  code?: string
  name?: string
  status?: string
  createdAt?: number
  updatedAt?: number
}

function toShareUrl(request: NextRequest, code: string) {
  const origin = new URL(request.url).origin || SITE_URL
  return new URL(`/a/${encodeURIComponent(code)}`, origin).toString()
}

function mapLink(request: NextRequest, raw: BackendLink) {
  const code = typeof raw.code === 'string' ? raw.code : ''
  return {
    code,
    name: typeof raw.name === 'string' ? raw.name : '',
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null,
    shareUrl: toShareUrl(request, code)
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
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

  const response = await fetch(`${backendUrl}/admin/affiliates`, {
    headers: {
      'x-admin-key': adminKey
    },
    cache: 'no-store'
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const links = Array.isArray(payload?.links) ? payload.links.map((row: BackendLink) => mapLink(request, row)) : []
  return NextResponse.json({ success: true, links })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
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

  const body = (await request.json().catch(() => ({}))) as AffiliateLinkBody
  const response = await fetch(`${backendUrl}/admin/affiliates`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      code: typeof body.code === 'string' ? body.code : '',
      name: typeof body.name === 'string' ? body.name : '',
      status: typeof body.status === 'string' ? body.status : null
    })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: response.status === 400 ? 400 : 502 })
  }

  return NextResponse.json({
    success: true,
    link: payload?.link ? mapLink(request, payload.link as BackendLink) : null
  })
}
