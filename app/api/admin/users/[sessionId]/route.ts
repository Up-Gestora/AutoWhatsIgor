import { NextRequest, NextResponse } from 'next/server'
import { getBackendAdminKey, requireAdmin, resolveBackendUrl } from '@/lib/adminBackend'
import { adminAuth, adminDb, getAdminStorageBucket } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

type RouteParams = {
  params: Promise<{
    sessionId: string
  }>
}

type DeleteStep = {
  success: boolean
  skipped?: boolean
  error?: string
  details?: unknown
}

type DeleteSummary = {
  postgresRowsDeleted: number
  redisKeysDeleted: number
  storageFilesDeleted: number
}

type AdminDeleteUserReport = {
  backend: DeleteStep & {
    statusCode?: number
    postgresRowsDeleted: number
    redisKeysDeleted: number
  }
  firestore: DeleteStep
  storage: DeleteStep & {
    prefix: string
    deletedFiles: number
  }
  auth: DeleteStep & {
    deleted: boolean
  }
  summary: DeleteSummary
}

type AdminDeleteUserResponse = {
  success: boolean
  sessionId: string
  report: AdminDeleteUserReport
  error?: string
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  if (!adminDb || !adminAuth) {
    return NextResponse.json({ error: 'firebase_admin_unavailable' }, { status: 500 })
  }

  const { sessionId } = await params
  const normalizedSessionId = String(sessionId ?? '').trim()

  if (!normalizedSessionId) {
    return NextResponse.json({ error: 'session_id_required' }, { status: 400 })
  }

  if (normalizedSessionId === auth.uid) {
    return NextResponse.json({ error: 'cannot_delete_self' }, { status: 400 })
  }

  const report = createInitialReport(normalizedSessionId)

  const backendUrl = resolveBackendUrl()
  const backendAdminKey = getBackendAdminKey()
  if (!backendUrl || !backendAdminKey) {
    report.backend = {
      success: false,
      statusCode: 500,
      postgresRowsDeleted: 0,
      redisKeysDeleted: 0,
      error: !backendUrl ? 'backend_url_missing' : 'backend_admin_key_missing'
    }
    return NextResponse.json<AdminDeleteUserResponse>(
      {
        success: false,
        sessionId: normalizedSessionId,
        error: report.backend.error,
        report
      },
      { status: 500 }
    )
  }

  const backendResult = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(normalizedSessionId)}/hard-delete`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': backendAdminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ reason: 'admin-user-hard-delete' })
    }
  ).catch((error) => {
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: error instanceof Error ? error.message : 'backend_request_failed' })
    }
  })

  const backendPayload = await backendResult.json().catch(() => null)
  const backendCounters = extractBackendCounters(backendPayload)
  report.backend = {
    success: backendResult.ok && backendPayload?.success !== false,
    statusCode: backendResult.status,
    postgresRowsDeleted: backendCounters.postgresRowsDeleted,
    redisKeysDeleted: backendCounters.redisKeysDeleted,
    ...(backendPayload && typeof backendPayload === 'object' ? { details: backendPayload } : {})
  }

  if (!report.backend.success) {
    report.backend.error = resolvePayloadError(backendPayload, `backend_hard_delete_failed_${backendResult.status}`)
    report.summary.postgresRowsDeleted = report.backend.postgresRowsDeleted
    report.summary.redisKeysDeleted = report.backend.redisKeysDeleted

    return NextResponse.json<AdminDeleteUserResponse>(
      {
        success: false,
        sessionId: normalizedSessionId,
        error: report.backend.error,
        report
      },
      { status: 500 }
    )
  }

  try {
    const userRef = adminDb.collection('users').doc(normalizedSessionId)
    await adminDb.recursiveDelete(userRef)
    report.firestore = {
      success: true
    }
  } catch (error) {
    report.firestore = {
      success: false,
      error: error instanceof Error ? error.message : 'firestore_delete_failed'
    }
    report.summary.postgresRowsDeleted = report.backend.postgresRowsDeleted
    report.summary.redisKeysDeleted = report.backend.redisKeysDeleted
    return NextResponse.json<AdminDeleteUserResponse>(
      {
        success: false,
        sessionId: normalizedSessionId,
        error: report.firestore.error,
        report
      },
      { status: 500 }
    )
  }

  try {
    const prefix = `users/${normalizedSessionId}/`
    const deletedFiles = await deleteStoragePrefix(prefix)
    report.storage = {
      success: true,
      prefix,
      deletedFiles
    }
  } catch (error) {
    report.storage = {
      success: false,
      prefix: `users/${normalizedSessionId}/`,
      deletedFiles: 0,
      error: error instanceof Error ? error.message : 'storage_delete_failed'
    }
    report.summary.postgresRowsDeleted = report.backend.postgresRowsDeleted
    report.summary.redisKeysDeleted = report.backend.redisKeysDeleted
    report.summary.storageFilesDeleted = report.storage.deletedFiles

    return NextResponse.json<AdminDeleteUserResponse>(
      {
        success: false,
        sessionId: normalizedSessionId,
        error: report.storage.error,
        report
      },
      { status: 500 }
    )
  }

  try {
    await adminAuth.deleteUser(normalizedSessionId)
    report.auth = {
      success: true,
      deleted: true
    }
  } catch (error: unknown) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null

    if (code === 'auth/user-not-found') {
      report.auth = {
        success: true,
        deleted: false
      }
    } else {
      report.auth = {
        success: false,
        deleted: false,
        error: error instanceof Error ? error.message : 'auth_delete_failed'
      }
      report.summary.postgresRowsDeleted = report.backend.postgresRowsDeleted
      report.summary.redisKeysDeleted = report.backend.redisKeysDeleted
      report.summary.storageFilesDeleted = report.storage.deletedFiles

      return NextResponse.json<AdminDeleteUserResponse>(
        {
          success: false,
          sessionId: normalizedSessionId,
          error: report.auth.error,
          report
        },
        { status: 500 }
      )
    }
  }

  report.summary.postgresRowsDeleted = report.backend.postgresRowsDeleted
  report.summary.redisKeysDeleted = report.backend.redisKeysDeleted
  report.summary.storageFilesDeleted = report.storage.deletedFiles

  return NextResponse.json<AdminDeleteUserResponse>({
    success: true,
    sessionId: normalizedSessionId,
    report
  })
}

function createInitialReport(sessionId: string): AdminDeleteUserReport {
  return {
    backend: {
      success: false,
      skipped: true,
      postgresRowsDeleted: 0,
      redisKeysDeleted: 0
    },
    firestore: {
      success: false,
      skipped: true
    },
    storage: {
      success: false,
      skipped: true,
      prefix: `users/${sessionId}/`,
      deletedFiles: 0
    },
    auth: {
      success: false,
      skipped: true,
      deleted: false
    },
    summary: {
      postgresRowsDeleted: 0,
      redisKeysDeleted: 0,
      storageFilesDeleted: 0
    }
  }
}

function resolvePayloadError(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
    return payload.error
  }
  return fallback
}

function extractBackendCounters(payload: unknown): { postgresRowsDeleted: number; redisKeysDeleted: number } {
  if (!payload || typeof payload !== 'object') {
    return { postgresRowsDeleted: 0, redisKeysDeleted: 0 }
  }

  const maybeReport = 'report' in payload ? (payload as { report?: unknown }).report : null
  if (!maybeReport || typeof maybeReport !== 'object') {
    return { postgresRowsDeleted: 0, redisKeysDeleted: 0 }
  }

  const hardDelete =
    'hardDelete' in maybeReport && typeof (maybeReport as { hardDelete?: unknown }).hardDelete === 'object'
      ? ((maybeReport as { hardDelete?: unknown }).hardDelete as Record<string, unknown>)
      : (maybeReport as Record<string, unknown>)

  const postgresRowsDeleted = extractNumberFromObject(hardDelete.postgres, 'totalRowsDeleted')
  const redisKeysDeleted = extractNumberFromObject(hardDelete.redis, 'totalKeysDeleted')

  return {
    postgresRowsDeleted,
    redisKeysDeleted
  }
}

function extractNumberFromObject(value: unknown, key: string): number {
  if (!value || typeof value !== 'object') {
    return 0
  }
  const raw = (value as Record<string, unknown>)[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

async function deleteStoragePrefix(prefix: string): Promise<number> {
  const bucket = getAdminStorageBucket()
  if (!bucket) {
    throw new Error('firebase_storage_unavailable')
  }

  let pageToken: string | undefined
  let deletedFiles = 0
  do {
    const response = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 500,
      ...(pageToken ? { pageToken } : {})
    })

    const files = response[0] ?? []
    const nextQuery = (response[1] ?? null) as { pageToken?: string } | null
    for (let index = 0; index < files.length; index += 25) {
      const chunk = files.slice(index, index + 25)
      const deletions = await Promise.allSettled(
        chunk.map((file) => file.delete({ ignoreNotFound: true }))
      )
      for (const deletion of deletions) {
        if (deletion.status === 'rejected') {
          throw deletion.reason
        }
      }
      deletedFiles += chunk.length
    }

    pageToken = nextQuery?.pageToken || undefined
  } while (pageToken)

  return deletedFiles
}
