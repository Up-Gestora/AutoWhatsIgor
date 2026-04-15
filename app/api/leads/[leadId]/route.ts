import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, resolveBackendUrlFallbacks, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type LeadUpdateBody = {
  name?: string | null
  whatsapp?: string | null
  aiTag?: string | null
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
  context: { params: Promise<{ leadId: string }> }
) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }
    const { leadId } = await context.params

    const body = (await request.json().catch(() => ({}))) as LeadUpdateBody
    const payload: LeadUpdateBody = {}
    if (body.name !== undefined) {
      payload.name = typeof body.name === 'string' ? (body.name.trim() ? body.name.trim() : null) : body.name
    }
    if (body.whatsapp !== undefined) {
      payload.whatsapp =
        typeof body.whatsapp === 'string' ? (body.whatsapp.trim() ? body.whatsapp.trim() : null) : body.whatsapp
    }
    if (body.aiTag !== undefined) {
      payload.aiTag = typeof body.aiTag === 'string' ? (body.aiTag.trim() ? body.aiTag.trim() : null) : body.aiTag
    }
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
      return NextResponse.json({ error: 'lead_update_required' }, { status: 400 })
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
      `/sessions/${encodeURIComponent(auth.sessionId)}/leads/${encodeURIComponent(leadId)}`,
      {
        method: 'PATCH',
        headers: {
          'x-admin-key': adminKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    let result: unknown = null
    let rawText = ''
    try {
      result = await response.clone().json()
    } catch {
      rawText = await response.text().catch(() => '')
    }

    if (!response.ok) {
      const resultRecord =
        result && typeof result === 'object' ? (result as Record<string, unknown>) : null
      const error = resultRecord?.error ? String(resultRecord.error) : 'backend_request_failed'
      const detail = resultRecord?.detail
        ? String(resultRecord.detail)
        : rawText.trim()
          ? rawText.trim().slice(0, 300)
          : null
      return NextResponse.json(detail ? { error, detail } : { error }, { status: 502 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'lead_proxy_failed', detail }, { status: 502 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> }
) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }
    const { leadId } = await context.params

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
      `/sessions/${encodeURIComponent(auth.sessionId)}/leads/${encodeURIComponent(leadId)}`,
      {
        method: 'DELETE',
        headers: {
          'x-admin-key': adminKey
        }
      }
    )

    let result: unknown = null
    let rawText = ''
    try {
      result = await response.clone().json()
    } catch {
      rawText = await response.text().catch(() => '')
    }

    if (!response.ok) {
      const resultRecord =
        result && typeof result === 'object' ? (result as Record<string, unknown>) : null
      const error = resultRecord?.error ? String(resultRecord.error) : 'backend_request_failed'
      const detail = resultRecord?.detail
        ? String(resultRecord.detail)
        : rawText.trim()
          ? rawText.trim().slice(0, 300)
          : null
      return NextResponse.json(detail ? { error, detail } : { error }, { status: 502 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'lead_proxy_failed', detail }, { status: 502 })
  }
}
