import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { isChatAssignedToSubaccount, SubaccountsError } from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params
  const safeChatId = chatId.trim()
  const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
  const auth = await resolveSessionId(request, sessionIdParam, {
    allowSubaccount: true,
    capability: 'conversations'
  })
  if (auth instanceof NextResponse) {
    return auth
  }

  try {
    if (auth.isSubaccount) {
      const allowed = await isChatAssignedToSubaccount(auth.ownerUid, auth.uid, safeChatId)
      if (!allowed) {
        return NextResponse.json({ error: 'chat_not_assigned' }, { status: 403 })
      }
    }
  } catch (error) {
    if (error instanceof SubaccountsError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: 'chat_assignment_check_failed' }, { status: 500 })
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
  const beforeParam = request.nextUrl.searchParams.get('beforeMs')
  const limit = limitParam ? Number(limitParam) : undefined
  const beforeMs = beforeParam ? Number(beforeParam) : undefined

  const url = new URL(
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/chats/${encodeURIComponent(safeChatId)}/messages`
  )
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    url.searchParams.set('limit', String(limit))
  }
  if (typeof beforeMs === 'number' && Number.isFinite(beforeMs)) {
    url.searchParams.set('beforeMs', String(beforeMs))
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
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json(payload)
}
