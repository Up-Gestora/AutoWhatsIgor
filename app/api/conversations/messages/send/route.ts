import { NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { isChatAssignedToSubaccount, SubaccountsError } from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

type SendBody = {
  sessionId?: string
  chatId?: string
  origin?: 'human_dashboard' | 'automation_api'
  text?: string
  media?: {
    url?: string
    mediaType?: string
    mimeType?: string
    fileName?: string
    caption?: string
    storagePolicy?: 'ttl_15d' | 'ttl_30d'
  }
  contact?: {
    displayName?: string
    contacts?: Array<{
      name?: string
      whatsapp?: string
    }>
  }
  idempotencyKey?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SendBody
  const auth = await resolveSessionId(request, body.sessionId ?? null, {
    allowSubaccount: true,
    capability: 'conversations'
  })
  if (auth instanceof NextResponse) {
    return auth
  }

  const chatId = body.chatId?.trim()
  const text = body.text?.trim()
  const media = body.media && typeof body.media === 'object' ? body.media : undefined
  const contact = body.contact && typeof body.contact === 'object' ? body.contact : undefined
  const idempotencyKey = body.idempotencyKey?.trim()

  if (!chatId) {
    return NextResponse.json({ error: 'chatId_required' }, { status: 400 })
  }
  if (media && contact) {
    return NextResponse.json({ error: 'media_contact_conflict' }, { status: 400 })
  }
  if (!text && !media && !contact) {
    return NextResponse.json({ error: 'message_required' }, { status: 400 })
  }
  if (media) {
    const url = typeof media.url === 'string' ? media.url.trim() : ''
    if (!url) {
      return NextResponse.json({ error: 'url_required' }, { status: 400 })
    }
  }
  if (contact) {
    const contacts = Array.isArray(contact.contacts) ? contact.contacts : []
    if (contacts.length === 0) {
      return NextResponse.json({ error: 'contacts_required' }, { status: 400 })
    }
  }

  try {
    if (auth.isSubaccount) {
      const allowed = await isChatAssignedToSubaccount(auth.ownerUid, auth.uid, chatId)
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

  const response = await fetch(`${backendUrl}/messages/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-key': adminKey,
      ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {})
    },
    body: JSON.stringify({
      sessionId: auth.sessionId,
      chatId,
      origin: 'human_dashboard',
      ...(text ? { text } : {}),
      ...(media ? { media } : {}),
      ...(contact ? { contact } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {})
    }),
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

  return NextResponse.json(payload)
}
