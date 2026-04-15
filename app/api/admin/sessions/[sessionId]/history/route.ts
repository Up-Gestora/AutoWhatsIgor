import { NextRequest, NextResponse } from 'next/server'
import { getBackendAdminKey, requireAdmin, resolveBackendUrl } from '@/lib/adminBackend'

export const runtime = 'nodejs'

type RouteParams = {
  params: Promise<{
    sessionId: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit')
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : ''
  const response = await fetch(
    `${backendUrl}/admin/sessions/${encodeURIComponent(sessionId)}/history${query}`,
    { headers: { 'x-admin-key': adminKey } }
  )

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    return NextResponse.json(payload ?? { error: 'backend_history_failed' }, { status: response.status })
  }

  const payload = await response.json().catch(() => null)
  return NextResponse.json(payload ?? { success: true, history: [] })
}
