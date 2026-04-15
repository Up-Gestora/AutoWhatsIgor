import { AiResponseStore } from '../src/ai/responseStore'
import { loadEnv } from '../src/config/env'
import { FindmyangelFailoverJobStore } from '../src/integrations/findmyangelDelivery'
import { InboundMessageQueue, OutboundMessageQueue, OutboundMessageService, OutboundMessageStore } from '../src/messages'
import { DisconnectedSessionRecoveryService } from '../src/recovery/disconnectedSessionRecovery'
import { createPostgresPool } from '../src/storage/postgres'
import { createRedisClient } from '../src/storage/redis'

type CliArgs = {
  mode: 'scan' | 'apply'
  sessionId: string | null
  fromMs: number | null
  toMs: number | null
  minDelayMs: number
  maxDelayMs: number
  errors: string[]
}

async function main() {
  const env = loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const sessionId = normalizeString(args.sessionId ?? env.FINDMYANGEL_TARGET_SESSION_ID)
  if (!sessionId) {
    throw new Error('session_id_required')
  }

  const fromMs = args.fromMs ?? Date.parse('2026-03-12T14:29:44.000Z')
  const toMs = args.toMs ?? Date.now()
  if (fromMs > toMs) {
    throw new Error('invalid_period')
  }

  const pool = createPostgresPool(env)
  const redis = createRedisClient(env)
  try {
    const outboundStore = new OutboundMessageStore({
      pool,
      tableName: env.OUTBOUND_MESSAGES_TABLE
    })
    const outboundQueue = new OutboundMessageQueue({
      redis,
      queuePrefix: env.OUTBOUND_QUEUE_PREFIX,
      chatSetKey: env.OUTBOUND_QUEUE_CHAT_SET
    })
    const inboundQueue = new InboundMessageQueue({
      redis,
      queuePrefix: env.INBOUND_QUEUE_PREFIX,
      chatSetKey: env.INBOUND_QUEUE_CHAT_SET
    })
    const aiResponseStore = new AiResponseStore({
      pool,
      tableName: env.AI_RESPONSE_TABLE,
      processingTimeoutMs: env.AI_PROCESSING_TIMEOUT_MS
    })
    const failoverJobStore = new FindmyangelFailoverJobStore({
      pool,
      tableName: env.FINDMYANGEL_BR_FAILOVER_JOBS_TABLE
    })
    const outboundService = new OutboundMessageService({
      store: outboundStore,
      queue: outboundQueue
    })
    const recoveryService = new DisconnectedSessionRecoveryService({
      pool,
      tables: {
        inboundMessages: env.INBOUND_MESSAGES_TABLE,
        outboundMessages: env.OUTBOUND_MESSAGES_TABLE,
        aiResponses: env.AI_RESPONSE_TABLE,
        statusHistory: env.STATUS_HISTORY_TABLE,
        broadcastJobs: env.BROADCAST_JOBS_TABLE
      },
      inboundQueue,
      outboundQueue,
      outboundStore,
      aiResponseStore,
      failoverJobStore,
      outboundService,
      failoverDelayMs: env.FINDMYANGEL_BR_FAILOVER_DELAY_MS,
      minDelayMs: args.minDelayMs,
      maxDelayMs: args.maxDelayMs,
      currentSessionStatusLookup: (targetSessionId) => fetchLiveSessionStatus(targetSessionId, env)
    })

    if (args.mode === 'apply') {
      const applied = await recoveryService.apply({ sessionId, fromMs, toMs, errors: args.errors })
      console.log(
        JSON.stringify(
          {
            mode: args.mode,
            sessionId,
            fromMs,
            toMs,
            minDelayMs: args.minDelayMs,
            maxDelayMs: args.maxDelayMs,
            errors: args.errors,
            summary: applied.scan.summary,
            results: applied.results
          },
          null,
          2
        )
      )
      return
    }

    const scan = await recoveryService.scan({ sessionId, fromMs, toMs, errors: args.errors })
    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          sessionId,
          fromMs,
          toMs,
          minDelayMs: args.minDelayMs,
          maxDelayMs: args.maxDelayMs,
          errors: args.errors,
          summary: scan.summary,
          orphanInbounds: scan.orphanInbounds,
          failedOutbounds: scan.failedOutbounds,
          welcomeRecoveries: scan.welcomeRecoveries.map((group) => ({
            baseRequestId: group.baseRequestId,
            recoveryRequestId: group.recoveryRequestId,
            rows: group.rows.map((row) => ({
              outboundId: row.outboundId,
              chatId: row.chatId,
              requestId: row.requestId,
              createdAtMs: row.createdAtMs
            })),
            hasNewerActivity:
              group.newerActivity.newerUserInbound ||
              group.newerActivity.newerPhoneHuman ||
              group.newerActivity.newerDashboardHuman,
            hasRecoveryAlready: Boolean(group.existingRecovery),
            hasFailoverJob: Boolean(group.job)
          }))
        },
        null,
        2
      )
    )
  } finally {
    await redis.quit().catch(() => undefined)
    await pool.end()
  }
}

function parseArgs(argv: string[]): CliArgs {
  let mode: 'scan' | 'apply' = 'scan'
  let sessionId: string | null = null
  let fromMs: number | null = null
  let toMs: number | null = null
  let minDelayMs = 1_000
  let maxDelayMs = 3_000
  const errors: string[] = ['session-not-connected', 'session-not-ready']

  const nextValue = (index: number) => {
    const value = argv[index + 1]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (!arg.trim()) {
      continue
    }

    if (arg === 'scan') {
      mode = 'scan'
      continue
    }
    if (arg === 'apply') {
      mode = 'apply'
      continue
    }
    if (arg === '--apply') {
      mode = 'apply'
      continue
    }
    if (arg === '--dry-run') {
      mode = 'scan'
      continue
    }

    if (arg.startsWith('--session-id=')) {
      sessionId = normalizeString(arg.slice('--session-id='.length))
      continue
    }
    if (arg === '--session-id') {
      sessionId = normalizeString(nextValue(i))
      i += 1
      continue
    }

    if (arg.startsWith('--from=')) {
      fromMs = parseTimestampMs(arg.slice('--from='.length))
      continue
    }
    if (arg === '--from') {
      fromMs = parseTimestampMs(nextValue(i))
      i += 1
      continue
    }

    if (arg.startsWith('--to=')) {
      toMs = parseTimestampMs(arg.slice('--to='.length))
      continue
    }
    if (arg === '--to') {
      toMs = parseTimestampMs(nextValue(i))
      i += 1
      continue
    }

    if (arg.startsWith('--min-delay-ms=')) {
      minDelayMs = parseDelayMs(arg.slice('--min-delay-ms='.length), minDelayMs)
      continue
    }
    if (arg === '--min-delay-ms') {
      minDelayMs = parseDelayMs(nextValue(i), minDelayMs)
      i += 1
      continue
    }

    if (arg.startsWith('--max-delay-ms=')) {
      maxDelayMs = parseDelayMs(arg.slice('--max-delay-ms='.length), maxDelayMs)
      continue
    }
    if (arg === '--max-delay-ms') {
      maxDelayMs = parseDelayMs(nextValue(i), maxDelayMs)
      i += 1
      continue
    }

    if (arg.startsWith('--error=')) {
      pushErrors(errors, arg.slice('--error='.length))
      continue
    }
    if (arg === '--error') {
      pushErrors(errors, nextValue(i))
      i += 1
      continue
    }
  }

  return {
    mode,
    sessionId,
    fromMs,
    toMs,
    minDelayMs,
    maxDelayMs,
    errors: normalizeCliErrors(errors)
  }
}

function parseTimestampMs(value: string | null): number | null {
  const normalized = normalizeString(value)
  if (!normalized) {
    return null
  }
  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null
    }
    return normalized.length <= 10 ? numeric * 1000 : numeric
  }

  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDelayMs(value: string | null, fallback: number): number {
  const normalized = normalizeString(value)
  if (!normalized) {
    return fallback
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(0, Math.floor(parsed))
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function pushErrors(target: string[], rawValue: string | null): void {
  if (!rawValue) {
    return
  }

  for (const value of rawValue.split(',')) {
    const normalized = normalizeString(value)
    if (normalized) {
      target.push(normalized)
    }
  }
}

function normalizeCliErrors(values: string[]): string[] {
  const normalized = values
    .map((value) => normalizeString(value))
    .filter((value): value is string => Boolean(value))

  return normalized.length > 0 ? [...new Set(normalized)] : ['session-not-connected', 'session-not-ready']
}

async function fetchLiveSessionStatus(sessionId: string, env: ReturnType<typeof loadEnv>): Promise<string | null> {
  const baseUrl = `http://127.0.0.1:${env.PORT}`
  const params = new URLSearchParams()
  if (env.ADMIN_API_KEY) {
    params.set('key', env.ADMIN_API_KEY)
  }

  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/status${suffix}`)
  if (!response.ok) {
    return null
  }

  const body = (await response.json()) as {
    success?: boolean
    status?: { status?: string | null }
  }

  return body?.success ? normalizeString(body.status?.status ?? null) : null
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
