import { loadEnv } from '../src/config/env'
import { normalizeTrainingData } from '../src/ai/trainingCopilotSchema'
import { createPostgresPool } from '../src/storage/postgres'

type CliArgs = {
  apply: boolean
  sessionId: string | null
  limit: number | null
}

type Stats = {
  aiConfigsScanned: number
  aiConfigsChanged: number
  onboardingDraftsScanned: number
  onboardingDraftsChanged: number
  copilotSessionsScanned: number
  copilotSessionsCleared: number
  writesPrepared: number
  writesApplied: number
  samples: string[]
}

async function main() {
  const env = loadEnv()
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required')
  }

  const args = parseArgs(process.argv.slice(2))
  const pool = createPostgresPool(env)
  const stats: Stats = {
    aiConfigsScanned: 0,
    aiConfigsChanged: 0,
    onboardingDraftsScanned: 0,
    onboardingDraftsChanged: 0,
    copilotSessionsScanned: 0,
    copilotSessionsCleared: 0,
    writesPrepared: 0,
    writesApplied: 0,
    samples: []
  }

  try {
    await migrateAiConfigs(pool, env.AI_CONFIG_TABLE, args, stats)
    await migrateOnboardingDrafts(pool, 'onboarding_draft_states', args, stats)
    await clearLegacyCopilotProposals(pool, 'ai_training_copilot_sessions', args, stats)

    console.log(
      JSON.stringify(
        {
          apply: args.apply,
          sessionId: args.sessionId,
          limit: args.limit,
          ...stats
        },
        null,
        2
      )
    )
  } finally {
    await pool.end()
  }
}

async function migrateAiConfigs(
  pool: ReturnType<typeof createPostgresPool>,
  tableName: string,
  args: CliArgs,
  stats: Stats
) {
  const rows = await selectRows(pool, tableName, 'config', args)
  for (const row of rows) {
    stats.aiConfigsScanned += 1
    const config = toRecord(row.payload)
    if (!config) {
      continue
    }

    const rawTraining = toRecord(config.training) ?? {}
    const normalizedTraining = normalizeTrainingData(rawTraining)
    if (stableEqual(rawTraining, normalizedTraining)) {
      continue
    }

    stats.aiConfigsChanged += 1
    stats.writesPrepared += 1
    rememberSample(stats, `${tableName}:${row.sessionId}`)

    if (!args.apply) {
      continue
    }

    const nextConfig = {
      ...config,
      training: normalizedTraining
    }
    await pool.query(
      `UPDATE ${quoteIdentifier(tableName)}
       SET config = $2::jsonb, updated_at = NOW()
       WHERE session_id = $1`,
      [row.sessionId, JSON.stringify(nextConfig)]
    )
    stats.writesApplied += 1
  }
}

async function migrateOnboardingDrafts(
  pool: ReturnType<typeof createPostgresPool>,
  tableName: string,
  args: CliArgs,
  stats: Stats
) {
  const rows = await selectRows(pool, tableName, 'state', args)
  for (const row of rows) {
    stats.onboardingDraftsScanned += 1
    const state = toRecord(row.payload)
    const draft = toRecord(state?.draft)
    const rawTraining = toRecord(draft?.training)
    if (!state || !draft || !rawTraining) {
      continue
    }

    const normalizedTraining = normalizeTrainingData(rawTraining)
    if (stableEqual(rawTraining, normalizedTraining)) {
      continue
    }

    stats.onboardingDraftsChanged += 1
    stats.writesPrepared += 1
    rememberSample(stats, `${tableName}:${row.sessionId}`)

    if (!args.apply) {
      continue
    }

    const nextState = {
      ...state,
      draft: {
        ...draft,
        training: normalizedTraining
      }
    }
    await pool.query(
      `UPDATE ${quoteIdentifier(tableName)}
       SET state = $2::jsonb, updated_at = NOW()
       WHERE session_id = $1`,
      [row.sessionId, JSON.stringify(nextState)]
    )
    stats.writesApplied += 1
  }
}

async function clearLegacyCopilotProposals(
  pool: ReturnType<typeof createPostgresPool>,
  tableName: string,
  args: CliArgs,
  stats: Stats
) {
  const rows = await selectRows(pool, tableName, 'pending_proposal', args)
  for (const row of rows) {
    stats.copilotSessionsScanned += 1
    const pendingProposal = toRecord(row.payload)
    const patch = toRecord(pendingProposal?.patch)
    if (!patch || !containsLegacyCommercialPatchKeys(patch)) {
      continue
    }

    stats.copilotSessionsCleared += 1
    stats.writesPrepared += 1
    rememberSample(stats, `${tableName}:${row.sessionId}`)

    if (!args.apply) {
      continue
    }

    await pool.query(
      `UPDATE ${quoteIdentifier(tableName)}
       SET pending_proposal = NULL, updated_at = NOW()
       WHERE session_id = $1`,
      [row.sessionId]
    )
    stats.writesApplied += 1
  }
}

async function selectRows(
  pool: ReturnType<typeof createPostgresPool>,
  tableName: string,
  payloadColumn: 'config' | 'state' | 'pending_proposal',
  args: CliArgs
) {
  const safeTable = quoteIdentifier(tableName)
  if (args.sessionId) {
    const result = await pool.query(
      `SELECT session_id, ${payloadColumn} AS payload
       FROM ${safeTable}
       WHERE session_id = $1`,
      [args.sessionId]
    )
    return result.rows.map((row) => ({
      sessionId: String(row.session_id),
      payload: row.payload
    }))
  }

  const limitClause = args.limit ? ' LIMIT $1' : ''
  const params = args.limit ? [args.limit] : []
  const result = await pool.query(
    `SELECT session_id, ${payloadColumn} AS payload
     FROM ${safeTable}
     ORDER BY session_id ASC${limitClause}`,
    params
  )
  return result.rows.map((row) => ({
    sessionId: String(row.session_id),
    payload: row.payload
  }))
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false
  let sessionId: string | null = null
  let limit: number | null = null

  const nextValue = (index: number) => {
    const value = argv[index + 1]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (!arg.trim()) {
      continue
    }

    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--dry-run') {
      apply = false
      continue
    }

    if (arg.startsWith('--session-id=')) {
      sessionId = normalizeArgString(arg.slice('--session-id='.length))
      continue
    }
    if (arg === '--session-id') {
      sessionId = normalizeArgString(nextValue(index))
      index += 1
      continue
    }

    if (arg.startsWith('--limit=')) {
      limit = normalizePositiveInt(arg.slice('--limit='.length))
      continue
    }
    if (arg === '--limit') {
      limit = normalizePositiveInt(nextValue(index))
      index += 1
      continue
    }
  }

  return { apply, sessionId, limit }
}

function containsLegacyCommercialPatchKeys(patch: Record<string, unknown>) {
  return ['servicos', 'serviços', 'valores'].some((key) => key in patch)
}

function stableEqual(left: unknown, right: unknown) {
  return stableSerialize(left) === stableSerialize(right)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function quoteIdentifier(name: string) {
  const escaped = name.replace(/"/g, '""')
  return `"${escaped}"`
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function rememberSample(stats: Stats, value: string) {
  if (stats.samples.length < 20) {
    stats.samples.push(value)
  }
}

function normalizeArgString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizePositiveInt(value: string | null | undefined) {
  const normalized = normalizeArgString(value)
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null
  }
  const numeric = Number(normalized)
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
