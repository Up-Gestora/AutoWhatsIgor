import { setTimeout as sleep } from 'timers/promises'

type Mode = 'load' | 'soak' | 'chaos'

const mode = parseMode(process.argv[2] ?? process.env.EPIC11_MODE ?? 'load')

const baseUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3002}`
const adminKey = process.env.ADMIN_API_KEY ?? process.env.BACKEND_ADMIN_KEY ?? ''
if (!adminKey) {
  throw new Error('ADMIN_API_KEY is required')
}

const sessionCount = readInt('SESSION_COUNT', mode === 'load' ? 10 : 15)
const durationMin = readInt('DURATION_MIN', mode === 'soak' ? 60 : 10)
const minPerMin = readInt('MSGS_PER_MIN_MIN', 1)
const maxPerMin = readInt('MSGS_PER_MIN_MAX', 5)
const sessionPrefix = process.env.SESSION_PREFIX ?? `epic11-${mode}`
const cleanup = readBool('CLEANUP', mode !== 'soak')
const purge = readBool('CLEANUP_PURGE', false)
const statusTimeoutMs = readInt('STATUS_TIMEOUT_MS', 60000)
const statusPollMs = readInt('STATUS_POLL_MS', 2000)
const chaosIntervalMin = readInt('CHAOS_STOP_INTERVAL_MIN', 10)
const chaosStopCount = readInt('CHAOS_STOP_COUNT', 1)
const chaosRestartDelaySec = readInt('CHAOS_RESTART_DELAY_SEC', 30)

const rateMin = Math.min(minPerMin, maxPerMin)
const rateMax = Math.max(minPerMin, maxPerMin)
const stopAt = Date.now() + durationMin * 60 * 1000

const stats = {
  sessionsCreated: 0,
  sessionsReady: 0,
  messageSent: 0,
  messageFailed: 0,
  sessionStops: 0,
  sessionRestarts: 0
}

if (typeof fetch !== 'function') {
  throw new Error('fetch is not available (requires Node 18+)')
}

const log = (message: string, meta?: Record<string, unknown>) => {
  const payload = meta ? ` ${JSON.stringify(meta)}` : ''
  console.log(`[EPIC11:${mode}] ${message}${payload}`)
}

const sessionIds = Array.from({ length: sessionCount }, (_, index) => {
  const suffix = String(index + 1).padStart(2, '0')
  return `${sessionPrefix}-${suffix}`
})

void run().catch((error) => {
  console.error(`[EPIC11:${mode}] failed`, error)
  process.exitCode = 1
})

async function run() {
  log('Starting harness', { baseUrl, sessionCount, durationMin, rateMin, rateMax, cleanup, purge })
  await createSessions()
  await waitForReady()

  const trafficTasks = sessionIds.map((sessionId) => runSessionTraffic(sessionId))
  const chaosTask = mode === 'chaos' ? runChaosLoop() : Promise.resolve()

  await Promise.all([...trafficTasks, chaosTask])

  if (cleanup) {
    await cleanupSessions()
  }

  await reportMetrics()
  log('Done', stats)
}

async function createSessions() {
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      await post('/sessions', { sessionId })
      stats.sessionsCreated += 1
    })
  )
}

async function waitForReady() {
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const status = await waitForStatus(sessionId)
      stats.sessionsReady += 1
      log('Session ready', { sessionId, status })
    })
  )
}

async function waitForStatus(sessionId: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < statusTimeoutMs) {
    try {
      const response = await get(`/sessions/${encodeURIComponent(sessionId)}/status`)
      const status = response?.status?.status as string | undefined
      if (status && (status === 'connected' || status === 'waiting_qr')) {
        return status
      }
    } catch (error) {
      if (!String(error).includes('404')) {
        log('Status check failed', { sessionId, error: String(error) })
      }
    }
    await sleep(statusPollMs)
  }
  throw new Error(`Timeout waiting for ${sessionId}`)
}

async function runSessionTraffic(sessionId: string) {
  const chatId = `${sessionId}-load-chat`
  while (Date.now() < stopAt) {
    const count = randomInt(rateMin, rateMax)
    const spacingMs = count > 0 ? Math.floor(60000 / count) : 60000
    for (let i = 0; i < count && Date.now() < stopAt; i += 1) {
      try {
        await post('/messages/send', {
          sessionId,
          chatId,
          text: `load-test-${mode}-${sessionId}-${Date.now()}`
        })
        stats.messageSent += 1
      } catch (error) {
        stats.messageFailed += 1
        log('Message send failed', { sessionId, error: String(error) })
      }
      if (Date.now() < stopAt) {
        await sleep(spacingMs)
      }
    }
  }
}

async function runChaosLoop() {
  while (Date.now() < stopAt) {
    await sleep(chaosIntervalMin * 60 * 1000)
    const targets = pickRandom(sessionIds, chaosStopCount)
    await Promise.all(
      targets.map(async (sessionId) => {
        await post(`/sessions/${encodeURIComponent(sessionId)}/stop`, { reason: 'chaos' })
        stats.sessionStops += 1
      })
    )
    await sleep(chaosRestartDelaySec * 1000)
    await Promise.all(
      targets.map(async (sessionId) => {
        await post(`/sessions/${encodeURIComponent(sessionId)}/start`, {})
        stats.sessionRestarts += 1
      })
    )
  }
}

async function cleanupSessions() {
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const path = purge ? `/sessions/${encodeURIComponent(sessionId)}/purge` : `/sessions/${encodeURIComponent(sessionId)}/stop`
      await post(path, { reason: 'epic11-cleanup' })
      stats.sessionStops += 1
    })
  )
}

async function reportMetrics() {
  try {
    const metrics = await get('/admin/metrics')
    log('Metrics snapshot', {
      counters: metrics?.metrics?.counters ?? {},
      gauges: metrics?.metrics?.gauges ?? {}
    })
  } catch (error) {
    log('Metrics read failed', { error: String(error) })
  }
}

async function get(path: string) {
  return requestJson(path, { method: 'GET' })
}

async function post(path: string, body: Record<string, unknown>) {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function requestJson(path: string, options: RequestInit) {
  const headers = new Headers(options.headers ?? {})
  headers.set('x-admin-key', adminKey)
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = payload?.error ?? response.statusText
    throw new Error(`${response.status} ${message}`)
  }
  return payload
}

function parseMode(raw: string): Mode {
  const value = raw.trim().toLowerCase()
  if (value === 'load' || value === 'soak' || value === 'chaos') {
    return value
  }
  throw new Error(`Unsupported mode: ${raw}`)
}

function readInt(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readBool(name: string, fallback: boolean) {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false
  }
  return fallback
}

function randomInt(min: number, max: number) {
  if (max <= min) {
    return min
  }
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandom<T>(items: T[], count: number) {
  const picks = new Set<number>()
  const target = Math.min(count, items.length)
  while (picks.size < target) {
    picks.add(Math.floor(Math.random() * items.length))
  }
  return Array.from(picks).map((index) => items[index])
}
