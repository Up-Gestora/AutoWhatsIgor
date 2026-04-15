import { NextRequest, NextResponse } from 'next/server'
import { getBackendAdminKey, requireAdmin, resolveBackendUrl } from '@/lib/adminBackend'

export const runtime = 'nodejs'

type RouteParams = {
  params: Promise<{
    sessionId: string
  }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const { sessionId } = await params
  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()

  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({} as { reason?: string }))
  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(sessionId)}/purge`, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
    body: JSON.stringify({ reason: body?.reason })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json(payload ?? { error: 'backend_purge_failed' }, { status: response.status })
  }

  return NextResponse.json(payload ?? { success: true })
}
