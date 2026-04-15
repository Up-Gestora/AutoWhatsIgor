import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { isChatAssignedToSubaccount, SubaccountsError } from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type ChatLabelAssignmentsBody = {
  labelIds?: string[]
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return []
  }
  const seen = new Set<string>()
  const output: string[] = []
  input.forEach((value) => {
    if (typeof value !== 'string') {
      return
    }
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

export async function PUT(
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

  const body = (await request.json().catch(() => ({}))) as ChatLabelAssignmentsBody
  if (body?.labelIds !== undefined && !Array.isArray(body.labelIds)) {
    return NextResponse.json({ error: 'label_ids_invalid' }, { status: 400 })
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
    `${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/chats/${encodeURIComponent(safeChatId)}/labels`,
    {
      method: 'PUT',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        labelIds: normalizeStringArray(body?.labelIds)
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
