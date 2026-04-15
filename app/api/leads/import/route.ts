import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, resolveBackendUrlFallbacks, getBackendAdminKey } from '@/lib/adminBackend'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type LeadImportContactBody = {
  name?: string | null
  whatsapp?: string | null
  aiTag?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type LeadImportBody = {
  contacts?: LeadImportContactBody[]
  applyTag?: string | null
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

    const body = (await request.json().catch(() => ({}))) as LeadImportBody
    const contacts = Array.isArray(body.contacts) ? body.contacts : []
    if (contacts.length === 0) {
      return NextResponse.json({ error: 'lead_import_contacts_required' }, { status: 400 })
    }

    const payload: LeadImportBody = {
      contacts: contacts.slice(0, 5000).map((contact) => {
        const parsed: LeadImportContactBody = {}
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
        if (contact.aiTag !== undefined) {
          parsed.aiTag =
            typeof contact.aiTag === 'string' ? (contact.aiTag.trim() ? contact.aiTag.trim() : null) : contact.aiTag
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

    if (body.applyTag !== undefined) {
      payload.applyTag = typeof body.applyTag === 'string' ? (body.applyTag.trim() ? body.applyTag.trim() : null) : body.applyTag
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
      `/sessions/${encodeURIComponent(auth.sessionId)}/leads/import`,
      {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    let result: unknown = null
    let rawText = ''
    try {
      result = await response.clone().json()
    } catch {
      rawText = await response.text().catch(() => '')
    }

    if (!response.ok) {
      const resultRecord =
        result && typeof result === 'object' ? (result as Record<string, unknown>) : null
      const error = resultRecord?.error ? String(resultRecord.error) : 'backend_request_failed'
      const detail = resultRecord?.detail
        ? String(resultRecord.detail)
        : rawText.trim()
          ? rawText.trim().slice(0, 300)
          : null
      return NextResponse.json(detail ? { error, detail } : { error }, { status: 502 })
    }

    return NextResponse.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'leads_import_proxy_failed', detail }, { status: 502 })
  }
}
