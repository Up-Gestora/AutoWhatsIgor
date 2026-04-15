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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ quickReplyId: string }> }
) {
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

  const { quickReplyId } = await context.params
  const safeQuickReplyId = quickReplyId.trim()
  if (!safeQuickReplyId) {
    return NextResponse.json({ error: 'quick_reply_not_found' }, { status: 404 })
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

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/quick-replies/${encodeURIComponent(safeQuickReplyId)}`,
    {
      method: 'PATCH',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        shortcut,
        content
      })
    }
  )

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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ quickReplyId: string }> }
) {
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

  const { quickReplyId } = await context.params
  const safeQuickReplyId = quickReplyId.trim()
  if (!safeQuickReplyId) {
    return NextResponse.json({ error: 'quick_reply_not_found' }, { status: 404 })
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/quick-replies/${encodeURIComponent(safeQuickReplyId)}`,
    {
      method: 'DELETE',
      headers: {
        'x-admin-key': adminKey
      }
    }
  )

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
