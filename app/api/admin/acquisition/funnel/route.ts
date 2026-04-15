import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'

export const runtime = 'nodejs'

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

  const fromMs = request.nextUrl.searchParams.get('fromMs')
  const toMs = request.nextUrl.searchParams.get('toMs')
  const cohort = request.nextUrl.searchParams.get('cohort') || 'week'
  const groupBy = request.nextUrl.searchParams.get('groupBy') || 'campaign'

  const query = new URLSearchParams()
  if (fromMs) {
    query.set('fromMs', fromMs)
  }
  if (toMs) {
    query.set('toMs', toMs)
  }
  query.set('cohort', cohort)
  query.set('groupBy', groupBy)

  const response = await fetch(`${backendUrl}/admin/acquisition/funnel?${query.toString()}`, {
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

  return NextResponse.json(payload)
}
