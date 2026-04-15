import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { getOwnerSubaccountSettings } from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type QuickReplyBody = {
  shortcut?: string
  content?: string
}

async function resolveSubaccountQuickRepliesCrudAllowed(ownerUid: string): Promise<boolean> {
  const settings = await getOwnerSubaccountSettings(ownerUid)
  return settings.quickRepliesCrud === true
}

export async function GET(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam, {
    allowSubaccount: true,
    capability: 'conversations'
  })
  if (auth instanceof NextResponse) {
    return auth
  }

  let canManageQuickReplies = true
  if (auth.isSubaccount) {
    try {
      canManageQuickReplies = await resolveSubaccountQuickRepliesCrudAllowed(auth.ownerUid)
    } catch (error) {
      console.warn('[quick-replies] Failed to resolve subaccount permission:', (error as Error).message)
      canManageQuickReplies = false
    }
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Number(limitParam) : undefined
  const url = new URL(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/quick-replies`)
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    url.searchParams.set('limit', String(limit))
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-admin-key': adminKey
    },
    cache: 'no-store'
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    if (response.status >= 400 && response.status < 500) {
      return NextResponse.json({ error }, { status: response.status })
    }
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json({
    ...(payload && typeof payload === 'object' ? payload : {}),
    canManageQuickReplies
  })
}

export async function POST(request: NextRequest) {
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam, {
    allowSubaccount: true,
    capability: 'conversations'
  })
  if (auth instanceof NextResponse) {
    return auth
  }
  if (auth.isSubaccount) {
    let canManageQuickReplies = false
    try {
      canManageQuickReplies = await resolveSubaccountQuickRepliesCrudAllowed(auth.ownerUid)
    } catch {
      canManageQuickReplies = false
    }
    if (!canManageQuickReplies) {
      return NextResponse.json({ error: 'subaccount_forbidden' }, { status: 403 })
    }
  }

  const body = (await request.json().catch(() => ({}))) as QuickReplyBody
  const shortcut = typeof body?.shortcut === 'string' ? body.shortcut : ''
  const content = typeof body?.content === 'string' ? body.content : ''

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/quick-replies`, {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      shortcut,
      content
    })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    if (response.status >= 400 && response.status < 500) {
      return NextResponse.json({ error }, { status: response.status })
    }
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}
