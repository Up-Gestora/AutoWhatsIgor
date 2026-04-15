import type { BroadcastMessagePayload } from './types'
import { deleteFirebaseStorageObjectFromUrl } from '../firebase/storage'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export async function cleanupBroadcastMedia(
  sessionId: string,
  payload: BroadcastMessagePayload,
  logger?: Logger
): Promise<void> {
  const safeSessionId = (sessionId ?? '').trim()
  if (!safeSessionId) {
    return
  }

  if (!payload || typeof payload !== 'object') {
    return
  }
  if (payload.type !== 'media') {
    return
  }

  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  if (!url) {
    return
  }

  const expectedPrefix = `users/${safeSessionId}/transmissoes/`
  const result = await deleteFirebaseStorageObjectFromUrl(url, { expectedObjectPrefix: expectedPrefix })
  if (result.deleted) {
    logger?.info?.('Broadcast media deleted from storage', {
      bucket: result.bucket ?? null,
      objectPath: result.objectPath ?? null
    })
    return
  }

  // Don't spam logs for non-firebase URLs; only warn when we attempted to delete but failed.
  if (result.reason === 'delete_failed' || result.reason === 'firebase_admin_unavailable') {
    logger?.warn?.('Broadcast media storage cleanup failed', {
      reason: result.reason,
      bucket: result.bucket ?? null,
      objectPath: result.objectPath ?? null,
      error: result.error ?? null
    })
  }
}
