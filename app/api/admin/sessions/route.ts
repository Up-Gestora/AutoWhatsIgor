import { NextResponse } from 'next/server'
import { getBackendAdminKey, requireAdmin, resolveBackendUrl } from '@/lib/adminBackend'

export const runtime = 'nodejs'

export async function GET(request: Request) {
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

  const headers = { 'x-admin-key': adminKey }
  const diagnosticsResponse = await fetch(`${backendUrl}/admin/diagnostics`, { headers })
  if (!diagnosticsResponse.ok) {
    return NextResponse.json({ error: 'backend_diagnostics_failed' }, { status: 502 })
  }
  const diagnosticsPayload = await diagnosticsResponse.json().catch(() => null)

  let metricsPayload: unknown = null
  try {
    const metricsResponse = await fetch(`${backendUrl}/admin/metrics`, { headers })
    if (metricsResponse.ok) {
      metricsPayload = await metricsResponse.json().catch(() => null)
    }
  } catch (error) {
    metricsPayload = null
  }

  return NextResponse.json({
    success: true,
    diagnostics: diagnosticsPayload?.diagnostics ?? diagnosticsPayload ?? null,
    metrics: metricsPayload
  })
}
