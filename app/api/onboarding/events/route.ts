import { NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type OnboardingEventBody = {
  sessionId?: string
  eventId?: string
  eventName?: string
  eventSource?: 'frontend' | 'backend' | 'system'
  occurredAtMs?: number | string
  properties?: Record<string, unknown>
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as OnboardingEventBody
  const sessionIdParam = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const auth = await resolveSessionId(request, sessionIdParam || null)
  if (auth instanceof NextResponse) {
    return auth
  }

  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : ''
  const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : ''
  if (!eventId) {
    return NextResponse.json({ error: 'event_id_required' }, { status: 400 })
  }
  if (!eventName) {
    return NextResponse.json({ error: 'event_name_required' }, { status: 400 })
  }

  const occurredAtMsRaw = body.occurredAtMs
  const occurredAtMs =
    typeof occurredAtMsRaw === 'number'
      ? occurredAtMsRaw
      : typeof occurredAtMsRaw === 'string' && occurredAtMsRaw.trim()
        ? Number(occurredAtMsRaw)
        : Date.now()
  if (!Number.isFinite(occurredAtMs)) {
    return NextResponse.json({ error: 'occurred_at_invalid' }, { status: 400 })
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/onboarding/events`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      eventId,
      eventName,
      eventSource: body.eventSource ?? 'frontend',
      occurredAtMs,
      properties: body.properties ?? {}
    })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}
