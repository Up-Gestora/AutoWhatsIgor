import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'

export const runtime = 'nodejs'

type CreditsUpdateBody = {
  mode?: 'set' | 'adjust'
  amountBrl?: number | string
  reason?: string | null
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const { sessionId } = await context.params
  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(sessionId)}/credits`, {
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

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const { sessionId } = await context.params
  const body = (await request.json().catch(() => ({}))) as CreditsUpdateBody
  const mode = body.mode
  const amountBrl = parseNumber(body.amountBrl)
  if (mode !== 'set' && mode !== 'adjust') {
    return NextResponse.json({ error: 'mode_invalid' }, { status: 400 })
  }
  if (amountBrl === undefined || !Number.isFinite(amountBrl)) {
    return NextResponse.json({ error: 'amount_invalid' }, { status: 400 })
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(sessionId)}/credits`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      mode,
      amountBrl,
      reason: body.reason ?? null,
      actorId: auth.uid
    })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}
