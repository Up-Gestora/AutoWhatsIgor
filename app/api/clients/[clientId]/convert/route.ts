import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, resolveBackendUrlFallbacks, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

const fetchBackendWithFallback = async (
  backendUrls: string[],
  path: string,
  init: RequestInit
) => {
  let lastError: unknown = null
  for (const baseUrl of backendUrls) {
    try {
      return await fetch(`${baseUrl}${path}`, init)
    } catch (error) {
      lastError = error
    }
  }

  throw (lastError ?? new Error('backend_fetch_failed'))
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }
    const { clientId } = await context.params

    const backendUrl = resolveBackendUrl()
    const backendUrls = resolveBackendUrlFallbacks()
    const adminKey = getBackendAdminKey()
    if (!backendUrl) {
      return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
    }
    if (!adminKey) {
      return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
    }

    const response = await fetchBackendWithFallback(
      backendUrls,
      `/sessions/${encodeURIComponent(auth.sessionId)}/clients/${encodeURIComponent(clientId)}/convert`,
      {
        method: 'POST',
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'client_convert_proxy_failed', detail }, { status: 502 })
  }
}
