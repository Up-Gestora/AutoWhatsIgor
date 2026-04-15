import { NextRequest, NextResponse } from 'next/server'
import { resolveBackendUrl, resolveBackendUrlFallbacks, getBackendAdminKey } from '@/lib/adminBackend'
import { adminDb } from '@/lib/firebaseAdmin'
import { resolveSessionId } from '@/lib/userBackend'

export const runtime = 'nodejs'

type LeadCreateBody = {
  name?: string | null
  whatsapp?: string | null
  aiTag?: string | null
  status?: string
  nextContactAt?: number | string | null
  observations?: string | null
}

type FirestoreTimestampLike = {
  toMillis?: () => number
}

type FirestoreLeadData = {
  name?: unknown
  whatsapp?: unknown
  chatId?: unknown
  aiTag?: unknown
  status?: unknown
  lastContact?: unknown
  nextContact?: unknown
  observations?: unknown
  createdAt?: unknown
  lastMessage?: unknown
  source?: unknown
}

type FirestoreLeadsResult = {
  leads: Array<{
    id: string
    name: string | null
    whatsapp: string | null
    chatId: string | null
    aiTag: string | null
    status: string
    lastContact: number | null
    nextContact: number | null
    observations: string | null
    createdAt: number | null
    lastMessage: string | null
    source: string | null
  }>
  total: number
}

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
    return null
  }
  if (value && typeof value === 'object') {
    const candidate = value as FirestoreTimestampLike
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis()
      return Number.isFinite(millis) ? millis : null
    }
  }
  return null
}

const normalizeLeadStatus = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (normalized === 'novo' || normalized === 'inativo' || normalized === 'aguardando' || normalized === 'em_processo' || normalized === 'cliente') {
    return normalized
  }
  return 'novo'
}

const asNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const loadLeadsFromFirestore = async (
  sessionId: string,
  limit: number
): Promise<FirestoreLeadsResult | null> => {
  if (!adminDb) {
    return null
  }

  const collection = adminDb.collection('users').doc(sessionId).collection('leads')
  const [snapshot, total] = await Promise.all([
    collection
      .limit(Math.max(1, Math.min(limit, 2000)))
      .get(),
    countFirestoreDocuments(collection)
  ])

  const leads = snapshot.docs.map((doc) => {
    const data = (doc.data() ?? {}) as FirestoreLeadData
    return {
      id: doc.id,
      name: asNullableString(data.name),
      whatsapp: asNullableString(data.whatsapp),
      chatId: asNullableString(data.chatId),
      aiTag: asNullableString(data.aiTag),
      status: normalizeLeadStatus(data.status),
      lastContact: toMillis(data.lastContact),
      nextContact: toMillis(data.nextContact),
      observations: asNullableString(data.observations),
      createdAt: toMillis(data.createdAt),
      lastMessage: asNullableString(data.lastMessage),
      source: asNullableString(data.source)
    }
  })

  leads.sort((a, b) => {
    const av = a.lastContact ?? 0
    const bv = b.lastContact ?? 0
    return bv - av
  })

  return {
    leads,
    total
  }
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

async function countFirestoreDocuments(collection: any): Promise<number> {
  try {
    if (collection && typeof collection.count === 'function') {
      const aggregateSnapshot = await collection.count().get()
      const countValue = aggregateSnapshot?.data?.()?.count
      if (typeof countValue === 'number' && Number.isFinite(countValue)) {
        return countValue
      }
      if (typeof countValue === 'bigint') {
        return Number(countValue)
      }
      if (countValue && typeof countValue.toNumber === 'function') {
        const converted = countValue.toNumber()
        if (Number.isFinite(converted)) {
          return converted
        }
      }
    }
  } catch {
    // fallback below when aggregation count is unavailable
  }

  const snapshot = await collection.get()
  return snapshot.size
}

export async function GET(request: NextRequest) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }

    const backendUrl = resolveBackendUrl()
    const backendUrls = resolveBackendUrlFallbacks()
    const adminKey = getBackendAdminKey()

    const rawSearch = request.nextUrl.searchParams.get('search')
    const search = typeof rawSearch === 'string' ? rawSearch.trim() : ''
    const hasSearch = search.length > 0
    const limit = request.nextUrl.searchParams.get('limit')
    const parsedLimit = limit ? Number(limit) : undefined
    const hasExplicitValidLimit = typeof parsedLimit === 'number' && Number.isFinite(parsedLimit) && parsedLimit > 0
    const safeLimit = hasSearch
      ? 50
      : hasExplicitValidLimit
      ? Math.min(parsedLimit, 2000)
      : 500
    const query = new URLSearchParams()
    if (hasSearch) {
      query.set('search', search)
      query.set('limit', '50')
    } else if (hasExplicitValidLimit) {
      query.set('limit', String(safeLimit))
    }

    const tryFirestoreFallback = async () => {
      if (hasSearch) {
        return null
      }
      const firestoreLeads = await loadLeadsFromFirestore(auth.sessionId, safeLimit)
      if (firestoreLeads) {
        return NextResponse.json({
          success: true,
          leads: firestoreLeads.leads,
          total: firestoreLeads.total,
          source: 'firestore_fallback'
        })
      }
      return null
    }

    if (!backendUrl || !adminKey) {
      if (hasSearch) {
        return NextResponse.json(
          {
            error: 'lead_search_unavailable_in_fallback',
            detail: !backendUrl ? 'backend_url_missing' : 'backend_admin_key_missing'
          },
          { status: 503 }
        )
      }
      const fallback = await tryFirestoreFallback()
      if (fallback) {
        return fallback
      }
      if (!backendUrl) {
        return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
      }
      return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
    }

    let response: Response
    try {
      response = await fetchBackendWithFallback(
        backendUrls,
        `/sessions/${encodeURIComponent(auth.sessionId)}/leads${query.toString() ? `?${query}` : ''}`,
        {
          headers: {
            'x-admin-key': adminKey
          },
          cache: 'no-store'
        }
      )
    } catch (error) {
      if (hasSearch) {
        const detail = error instanceof Error ? error.message : 'backend_unreachable'
        return NextResponse.json(
          { error: 'lead_search_unavailable_in_fallback', detail },
          { status: 503 }
        )
      }
      const fallback = await tryFirestoreFallback()
      if (fallback) {
        return fallback
      }
      throw error
    }

    let payload: unknown = null
    let rawText = ''
    try {
      payload = await response.clone().json()
    } catch {
      rawText = await response.text().catch(() => '')
    }

    if (!response.ok) {
      const payloadRecord =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
      const error = payloadRecord?.error ? String(payloadRecord.error) : 'backend_request_failed'
      const detail = payloadRecord?.detail
        ? String(payloadRecord.detail)
        : rawText.trim()
          ? rawText.trim().slice(0, 300)
          : null

      if (hasSearch) {
        if (error === 'lead_search_too_short') {
          return NextResponse.json(detail ? { error, detail } : { error }, { status: 400 })
        }
        return NextResponse.json(
          detail
            ? { error: 'lead_search_unavailable_in_fallback', detail }
            : { error: 'lead_search_unavailable_in_fallback' },
          { status: 503 }
        )
      }

      const fallback = await tryFirestoreFallback()
      if (fallback) {
        return fallback
      }
      return NextResponse.json(detail ? { error, detail } : { error }, { status: 502 })
    }

    const payloadRecord =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    if (payloadRecord && Array.isArray(payloadRecord.leads)) {
      const normalizedSearch =
        typeof payloadRecord.search === 'string'
          ? payloadRecord.search.trim()
          : hasSearch
            ? search
            : null
      const matchedTotal =
        typeof payloadRecord.matchedTotal === 'number' && Number.isFinite(payloadRecord.matchedTotal)
          ? payloadRecord.matchedTotal
          : hasSearch
            ? payloadRecord.leads.length
            : undefined
      return NextResponse.json({
        ...payloadRecord,
        total:
          typeof payloadRecord.total === 'number' && Number.isFinite(payloadRecord.total)
            ? payloadRecord.total
            : payloadRecord.leads.length,
        ...(hasSearch
          ? {
              matchedTotal,
              search: normalizedSearch
            }
          : {})
      })
    }

    return NextResponse.json(payload)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ error: 'leads_proxy_failed', detail }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionIdParam = request.nextUrl.searchParams.get('sessionId')
    const auth = await resolveSessionId(request, sessionIdParam)
    if (auth instanceof NextResponse) {
      return auth
    }

    const body = (await request.json().catch(() => ({}))) as LeadCreateBody
    const payload: LeadCreateBody = {}

    if (body.name !== undefined) {
      payload.name = typeof body.name === 'string' ? (body.name.trim() ? body.name.trim() : null) : body.name
    }
    if (body.whatsapp !== undefined) {
      payload.whatsapp =
        typeof body.whatsapp === 'string' ? (body.whatsapp.trim() ? body.whatsapp.trim() : null) : body.whatsapp
    }
    if (body.aiTag !== undefined) {
      payload.aiTag = typeof body.aiTag === 'string' ? (body.aiTag.trim() ? body.aiTag.trim() : null) : body.aiTag
    }
    if (typeof body.status === 'string' && body.status.trim()) {
      payload.status = body.status.trim()
    }
    if (body.nextContactAt !== undefined) {
      payload.nextContactAt = body.nextContactAt
    }
    if (body.observations !== undefined) {
      payload.observations =
        typeof body.observations === 'string'
          ? body.observations.trim()
            ? body.observations.trim()
            : null
          : body.observations
    }

    if (!payload.name && !payload.whatsapp) {
      return NextResponse.json({ error: 'lead_create_required' }, { status: 400 })
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
      `/sessions/${encodeURIComponent(auth.sessionId)}/leads`,
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
    return NextResponse.json({ error: 'leads_proxy_failed', detail }, { status: 502 })
  }
}
