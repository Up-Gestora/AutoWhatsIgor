import { deleteFirebaseStorageObjectFromUrl, type DeleteFirebaseStorageResult } from '../firebase/storage'
import type { MetricsStore } from '../observability/metrics'
import type { OutboundMessageStore } from './outboundStore'
import type { OutboundMessageRecord } from './outboundTypes'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type OutboundMediaCleanupResult = {
  scanned: number
  deleted: number
  failed: number
}

type OutboundMediaCleanupServiceOptions = {
  store: OutboundMessageStore
  ttlDays: number
  batchSize: number
  logger?: Logger
  metrics?: MetricsStore
  deleteByUrl?: (
    url: string,
    options: { expectedObjectPrefix?: string }
  ) => Promise<DeleteFirebaseStorageResult>
}

export class OutboundMediaCleanupService {
  private readonly store: OutboundMessageStore
  private readonly ttlDays: number
  private readonly batchSize: number
  private readonly logger: Logger
  private readonly metrics?: MetricsStore
  private readonly deleteByUrl: (
    url: string,
    options: { expectedObjectPrefix?: string }
  ) => Promise<DeleteFirebaseStorageResult>

  constructor(options: OutboundMediaCleanupServiceOptions) {
    this.store = options.store
    this.ttlDays = Math.max(1, Math.floor(options.ttlDays))
    this.batchSize = Math.max(1, Math.floor(options.batchSize))
    this.logger = options.logger ?? {}
    this.metrics = options.metrics
    this.deleteByUrl = options.deleteByUrl ?? deleteFirebaseStorageObjectFromUrl
  }

  async runOnce(nowMs = Date.now()): Promise<OutboundMediaCleanupResult> {
    const cutoffMs = nowMs - this.ttlDays * 24 * 60 * 60 * 1000
    const candidates = await this.store.listMediaForStorageCleanup({
      olderThanMs: cutoffMs,
      limit: this.batchSize
    })

    let deleted = 0
    let failed = 0

    for (const record of candidates) {
      const result = await this.cleanupRecord(record)
      if (result === 'deleted') {
        deleted += 1
      } else if (result === 'failed') {
        failed += 1
      }
    }

    const scanned = candidates.length
    this.metrics?.increment('outbound.media.cleanup.scanned', scanned)
    if (deleted > 0) {
      this.metrics?.increment('outbound.media.cleanup.deleted', deleted)
    }
    if (failed > 0) {
      this.metrics?.increment('outbound.media.cleanup.failed', failed)
    }

    return { scanned, deleted, failed }
  }

  private async cleanupRecord(record: OutboundMessageRecord): Promise<'deleted' | 'failed' | 'skipped'> {
    const payload =
      record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? (record.payload as Record<string, unknown>)
        : null
    const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
    if (!url) {
      return 'skipped'
    }

    const expectedPrefix = `users/${record.sessionId}/conversas/`

    try {
      const deleted = await this.deleteByUrl(url, { expectedObjectPrefix: expectedPrefix })
      if (!deleted.deleted) {
        this.logger.warn?.('Outbound media storage cleanup skipped/failed', {
          sessionId: record.sessionId,
          chatId: record.chatId,
          outboundId: record.id,
          reason: deleted.reason ?? 'unknown',
          bucket: deleted.bucket ?? null,
          objectPath: deleted.objectPath ?? null,
          host: safeUrlHost(url),
          error: deleted.error ?? null
        })
        return 'failed'
      }

      const deletedAtMs = Date.now()
      await this.store.markMediaStorageDeleted(record.id, deletedAtMs)
      this.logger.info?.('Outbound media deleted from storage', {
        sessionId: record.sessionId,
        chatId: record.chatId,
        outboundId: record.id,
        host: safeUrlHost(url),
        bucket: deleted.bucket ?? null,
        objectPath: deleted.objectPath ?? null
      })
      return 'deleted'
    } catch (error) {
      this.logger.warn?.('Outbound media storage cleanup failed', {
        sessionId: record.sessionId,
        chatId: record.chatId,
        outboundId: record.id,
        host: safeUrlHost(url),
        error: error instanceof Error ? error.message : String(error)
      })
      return 'failed'
    }
  }
}

function safeUrlHost(url: string): string | null {
  try {
    return new URL(url).host || null
  } catch {
    return null
  }
}
