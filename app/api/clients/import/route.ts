import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, resolveBackendUrlFallbacks, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type ClientImportContactBody = {
  name?: string | null
  whatsapp?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type ClientImportBody = {
  contacts?: ClientImportContactBody[]
  updateExisting?: boolean
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

export async function POST(request: NextRequest) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }

    const body = (await request.json().catch(() => ({}))) as ClientImportBody
    const contacts = Array.isArray(body.contacts) ? body.contacts : []
    if (contacts.length === 0) {
      return NextResponse.json({ error: 'client_import_contacts_required' }, { status: 400 })
    }

    const payload: ClientImportBody = {
      contacts: contacts.slice(0, 5000).map((contact) => {
        const parsed: ClientImportContactBody = {}
        if (contact.name !== undefined) {
          parsed.name =
            typeof contact.name === 'string' ? (contact.name.trim() ? contact.name.trim() : null) : contact.name
        }
        if (contact.whatsapp !== undefined) {
          parsed.whatsapp =
            typeof contact.whatsapp === 'string'
              ? contact.whatsapp.trim()
                ? contact.whatsapp.trim()
                : null
              : contact.whatsapp
        }
        if (typeof contact.status === 'string' && contact.status.trim()) {
          parsed.status = contact.status.trim()
        }
        if (contact.nextContactAt !== undefined) {
          parsed.nextContactAt = contact.nextContactAt
        }
        if (contact.observations !== undefined) {
          parsed.observations =
            typeof contact.observations === 'string'
              ? contact.observations.trim()
                ? contact.observations.trim()
                : null
              : contact.observations
        }
        return parsed
      }),
      updateExisting: body.updateExisting !== false
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
      `/sessions/${encodeURIComponent(auth.sessionId)}/clients/import`,
      {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    const result = await response.json().catch(() => null)
    if (!response.ok) {
      const error = result?.error ? String(result.error) : 'backend_request_failed'
      return NextResponse.json({ error }, { status: 502 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'client_import_proxy_failed', detail }, { status: 502 })
  }
}
