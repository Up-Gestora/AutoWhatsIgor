import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { setChatAssignment } from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params
  const safeChatId = chatId.trim()
  if (!safeChatId) {
    return NextResponse.json({ error: 'chatId_required' }, { status: 400 })
  }

  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam)
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

  const response = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/chats/${encodeURIComponent(safeChatId)}`,
    {
      method: 'DELETE',
      headers: {
        'x-admin-key': adminKey
      },
      cache: 'no-store'
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

  try {
    await setChatAssignment(auth.sessionId, safeChatId, [], auth.uid)
  } catch (error) {
    console.warn('[conversations] Failed to clear chat assignment after delete:', (error as Error).message)
  }

  return NextResponse.json(payload)
}
