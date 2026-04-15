import type { PostgresAuthStateStore } from '../auth'
import type { SessionStatusSnapshot } from './types'
import type { SessionManager } from './sessionManager'
import type { SessionStatusStore } from './statusStore'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type AutoRestoreOptions = {
  enabled: boolean
  authStore: PostgresAuthStateStore
  statusStore?: SessionStatusStore
  sessionManager: SessionManager
  maxSessions: number
  parallel: number
  batchSize?: number
  batchDelayMs?: number
  statusAllowlist: string[]
  lockRetryDelayMs?: number
  lockRetryAttempts?: number
  logger?: Logger
}

export async function autoRestoreSessions(options: AutoRestoreOptions): Promise<void> {
  const logger = options.logger ?? {}
  if (!options.enabled) {
    logger.info?.('Auto-restore disabled')
    return
  }

  const sessionIds = await options.authStore.listSessionIds(options.maxSessions)
  logger.info?.('Auto-restore loaded sessions', { count: sessionIds.length })

  if (sessionIds.length === 0) {
    return
  }

  const allowedStatuses = new Set(
    options.statusAllowlist.map((status) => status.trim().toLowerCase()).filter(Boolean)
  )

  const parallel = Math.max(1, options.parallel)
  const configuredBatchSize = Math.max(0, options.batchSize ?? 0)
  const effectiveBatchSize = configuredBatchSize > 0 ? configuredBatchSize : Math.max(1, options.maxSessions)
  const batchDelayMs = Math.max(0, options.batchDelayMs ?? 0)
  let restored = 0
  let skipped = 0
  const lockRetryDelayMs = Math.max(1000, options.lockRetryDelayMs ?? 0)
  const lockRetryAttempts = Math.max(0, options.lockRetryAttempts ?? 0)

  const runBatch = async (batch: string[], attempt: number) => {
    const queue = [...batch]
    const deferred: string[] = []

    const worker = async () => {
      while (queue.length > 0) {
        const sessionId = queue.shift()
        if (!sessionId) {
          return
        }

        try {
          const handleDecision = options.sessionManager.canHandleSession(sessionId)
          if (!handleDecision.ok) {
            skipped += 1
            logger.info?.('Auto-restore skipped session', {
              sessionId,
              status: 'skipped',
              reason: handleDecision.reason ?? 'not-eligible'
            })
            continue
          }

          const snapshot = await getLatestStatus(sessionId, options.statusStore)
          if (snapshot && allowedStatuses.size > 0) {
            const status = snapshot.status.toLowerCase()
            if (!allowedStatuses.has(status)) {
              skipped += 1
              logger.info?.('Auto-restore skipped session', {
                sessionId,
                status: snapshot.status,
                reason: snapshot.reason ?? null
              })
              continue
            }
          }

          const result = await options.sessionManager.startSession(sessionId)
          if (result.status === 'error' && result.reason === 'lock-unavailable' && attempt < lockRetryAttempts) {
            deferred.push(sessionId)
            logger.warn?.('Auto-restore lock unavailable', { sessionId })
            continue
          }

          restored += 1
          logger.info?.('Auto-restore started session', {
            sessionId,
            status: result.status,
            reason: result.reason ?? null
          })
        } catch (error) {
          logger.error?.('Auto-restore failed session', {
            sessionId,
            error: (error as Error).message
          })
        }
      }
    }

    const workers = Array.from({ length: Math.min(parallel, batch.length) }, () => worker())
    await Promise.all(workers)
    return deferred
  }

  let pending = sessionIds
  for (let attempt = 0; attempt <= lockRetryAttempts && pending.length > 0; attempt += 1) {
    const deferred: string[] = []
    for (let offset = 0; offset < pending.length; offset += effectiveBatchSize) {
      const currentBatch = pending.slice(offset, offset + effectiveBatchSize)
      const currentDeferred = await runBatch(currentBatch, attempt)
      if (currentDeferred.length > 0) {
        deferred.push(...currentDeferred)
      }

      const hasNextBatch = offset + effectiveBatchSize < pending.length
      if (hasNextBatch && batchDelayMs > 0) {
        logger.info?.('Auto-restore batch delay', {
          delayMs: batchDelayMs,
          attempt: attempt + 1,
          processed: Math.min(offset + effectiveBatchSize, pending.length),
          total: pending.length
        })
        await waitMs(batchDelayMs)
      }
    }

    if (deferred.length === 0) {
      break
    }

    if (attempt >= lockRetryAttempts) {
      break
    }

    logger.warn?.('Auto-restore lock retry scheduled', {
      count: deferred.length,
      delayMs: lockRetryDelayMs,
      attempt: attempt + 1
    })
    await waitMs(lockRetryDelayMs)
    pending = deferred
  }

  logger.info?.('Auto-restore finished', { restored, skipped })
}

async function getLatestStatus(
  sessionId: string,
  statusStore?: SessionStatusStore
): Promise<SessionStatusSnapshot | null> {
  if (!statusStore) {
    return null
  }

  try {
    return await statusStore.getStatus(sessionId)
  } catch {
    return null
  }
}

function waitMs(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}
