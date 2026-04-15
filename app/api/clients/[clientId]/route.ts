import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, resolveBackendUrlFallbacks, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type ClientUpdateBody = {
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

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

export async function PATCH(
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

    const body = (await request.json().catch(() => ({}))) as ClientUpdateBody
    const payload: ClientUpdateBody = {}
    if (typeof body.status === 'string' && body.status.trim()) {
      payload.status = body.status.trim()
    }
    if (body.nextContactAt !== undefined) {
      payload.nextContactAt = body.nextContactAt
    }
    if (body.observations !== undefined) {
      payload.observations = body.observations
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'client_update_required' }, { status: 400 })
    }

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
      `/sessions/${encodeURIComponent(auth.sessionId)}/clients/${encodeURIComponent(clientId)}`,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'client_proxy_failed', detail }, { status: 502 })
  }
}

export async function DELETE(
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
      `/sessions/${encodeURIComponent(auth.sessionId)}/clients/${encodeURIComponent(clientId)}`,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'client_proxy_failed', detail }, { status: 502 })
  }
}
