import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import {
  getAssignedSubaccountsByChatIds,
  listAssignedChatIdsForSubaccount,
  SubaccountsError
} from '@/lib/subaccountsBackend'

export const runtime = 'nodejs'

const BACKEND_REQUEST_TIMEOUT_MS = 8000

type BackendChat = {
  id?: string | null
  [key: string]: unknown
}

export async function GET(request: NextRequest) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam, {
      allowSubaccount: true,
      capability: 'conversations'
    })
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

    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Number(limitParam) : undefined

    const url = new URL(`${backendUrl}/sessions/${encodeURIComponent(auth.sessionId)}/chats`)
    if (typeof limit === 'number' && Number.isFinite(limit)) {
      url.searchParams.set('limit', String(limit))
    }

    let response: Response
    try {
      response = await fetchBackend(url.toString(), {
        headers: {
          'x-admin-key': adminKey
        },
        cache: 'no-store'
      })
    } catch (error) {
      const detail = normalizeRuntimeErrorMessage(error)
      return NextResponse.json({ error: 'backend_request_unreachable', detail }, { status: 502 })
    }

    const { payload, rawText } = await parseResponsePayload<Record<string, unknown>>(response)
    if (!response.ok) {
      const error = buildHttpErrorMessage(response.status, payload, rawText)
      console.error('[conversations.chats] Backend list failed', {
        sessionId: auth.sessionId,
        status: response.status,
        detail: error
      })
      return NextResponse.json({ error, detail: error }, { status: 502 })
    }

    const chats = (Array.isArray(payload?.chats) ? payload.chats : []) as BackendChat[]
    try {
      if (auth.isSubaccount) {
        const assignedChatIds = await listAssignedChatIdsForSubaccount(auth.ownerUid, auth.uid)
        const allowedChatIds = new Set(assignedChatIds)
        const filteredChats = chats.filter((chat: BackendChat) => {
          const chatId = typeof chat?.id === 'string' ? chat.id.trim() : ''
          return chatId && allowedChatIds.has(chatId)
        })

        return NextResponse.json({
          ...(payload ?? {}),
          chats: filteredChats
        })
      }

      const chatIds = chats
        .map((chat: BackendChat) => (typeof chat?.id === 'string' ? chat.id.trim() : ''))
        .filter((chatId: string) => Boolean(chatId))
      const assignedByChat = await getAssignedSubaccountsByChatIds(auth.ownerUid, chatIds)

      const enrichedChats = chats.map((chat: BackendChat) => {
        const chatId = typeof chat?.id === 'string' ? chat.id.trim() : ''
        return {
          ...chat,
          assignedSubaccountUids: chatId ? assignedByChat[chatId] ?? [] : []
        }
      })

      return NextResponse.json({
        ...(payload ?? {}),
        chats: enrichedChats
      })
    } catch (error) {
      if (error instanceof SubaccountsError) {
        return NextResponse.json({ error: error.code }, { status: error.status })
      }
      const detail = normalizeRuntimeErrorMessage(error)
      console.error('[conversations.chats] Assignment enrichment failed', {
        sessionId: auth.sessionId,
        detail
      })
      return NextResponse.json({ error: 'chat_assignments_load_failed', detail }, { status: 500 })
    }
  } catch (error) {
    const detail = normalizeRuntimeErrorMessage(error)
    console.error('[conversations.chats] Route failed with unhandled error', detail)
    return NextResponse.json({ error: 'conversations_chats_failed', detail }, { status: 500 })
  }
}

async function fetchBackend(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BACKEND_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('backend_request_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function normalizeRuntimeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return 'unknown_error'
}
