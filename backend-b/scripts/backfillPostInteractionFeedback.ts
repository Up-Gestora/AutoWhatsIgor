import { loadEnv } from '../src/config/env'
import { LeadStore } from '../src/leads'
import { InboundMessageStore } from '../src/messages'
import { PostInteractionFeedbackEventStore } from '../src/postInteractionFeedback'
import { resolveSessionIdByEmail } from '../src/postInteractionFeedback/identity'
import { buildRecoveryEventInputs, buildRecoveryPreview } from '../src/postInteractionFeedback/recovery'
import { createPostgresPool } from '../src/storage/postgres'

type CliArgs = {
  apply: boolean
  senderEmail: string | null
  senderSessionId: string | null
  fromMs: number | null
  toMs: number | null
}

const DEFAULT_LOOKBACK_MS = 84 * 24 * 60 * 60 * 1000

async function main() {
  const env = loadEnv()
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required')
  }

  const args = parseArgs(process.argv.slice(2))
  const senderEmail = normalizeArgString(args.senderEmail)
  if (!senderEmail && !args.senderSessionId) {
    throw new Error('senderEmail_or_senderSessionId_required')
  }

  const now = Date.now()
  const fromMs = args.fromMs ?? now - DEFAULT_LOOKBACK_MS
  const toMs = args.toMs ?? now
  if (fromMs > toMs) {
    throw new Error('invalid_period')
  }

  const senderSessionId = args.senderSessionId ?? (senderEmail ? await resolveSessionIdByEmail(senderEmail) : null)
  if (!senderSessionId) {
    throw new Error('sender_session_not_found')
  }

  const pool = createPostgresPool(env)
  try {
    const leadStore = new LeadStore({
      pool,
      tableName: env.LEADS_TABLE
    })
    const inboundStore = new InboundMessageStore({
      pool,
      tableName: env.INBOUND_MESSAGES_TABLE
    })
    const eventStore = new PostInteractionFeedbackEventStore({ pool })
    const preview = await buildRecoveryPreview(
      {
        leadStore,
        inboundStore,
        eventStore
      },
      {
        senderSessionId,
        fromMs,
        toMs
      }
    )
    const events = buildRecoveryEventInputs(senderSessionId, preview.candidates)

    if (args.apply) {
      await eventStore.init()
      for (const event of events) {
        // eslint-disable-next-line no-await-in-loop
        await eventStore.record(event)
      }
    }

    const output = {
      apply: args.apply,
      senderEmail,
      senderSessionId,
      fromMs,
      toMs,
      scoreCandidatesDetected: preview.scoreCandidatesDetected,
      missingScoreEvents: preview.missingScoreEvents,
      missingCommentEvents: preview.missingCommentEvents,
      eventsPrepared: events.length,
      eventsInserted: args.apply ? events.length : 0,
      candidatesSample: preview.candidates.slice(0, 20).map((candidate) => ({
        leadId: candidate.leadId,
        chatId: candidate.chatId,
        phone: candidate.phone,
        qualificationKey: candidate.qualificationKey,
        score: candidate.score,
        comment: candidate.comment,
        messageTimestampMs: candidate.messageTimestampMs,
        hasScoreEvent: candidate.hasScoreEvent,
        hasCommentEvent: candidate.hasCommentEvent
      }))
    }

    console.log(JSON.stringify(output, null, 2))
  } finally {
    await pool.end()
  }
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false
  let senderEmail: string | null = null
  let senderSessionId: string | null = null
  let fromMs: number | null = null
  let toMs: number | null = null

  const nextValue = (index: number) => {
    const value = argv[index + 1]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
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

    if (arg.startsWith('--sender-email=')) {
      senderEmail = normalizeArgString(arg.slice('--sender-email='.length))
      continue
    }
    if (arg === '--sender-email') {
      senderEmail = normalizeArgString(nextValue(i))
      i += 1
      continue
    }

    if (arg.startsWith('--sender-session-id=')) {
      senderSessionId = normalizeArgString(arg.slice('--sender-session-id='.length))
      continue
    }
    if (arg === '--sender-session-id') {
      senderSessionId = normalizeArgString(nextValue(i))
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
  }

  return {
    apply,
    senderEmail,
    senderSessionId,
    fromMs,
    toMs
  }
}

function parseTimestampMs(value: string | null): number | null {
  const normalized = normalizeArgString(value)
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

function normalizeArgString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
