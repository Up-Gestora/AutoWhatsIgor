import Stripe from 'stripe'
import { BillingStore, reconcileStripeBilling } from '../src/billing'
import { loadEnv } from '../src/config/env'
import { CreditsService, CreditsStore } from '../src/credits'
import { createPostgresPool } from '../src/storage/postgres'

type CliArgs = {
  apply: boolean
  fromUnixSec: number | null
  toUnixSec: number | null
  sessionId: string | null
}

const DAY_SEC = 24 * 60 * 60

async function main() {
  const env = loadEnv()
  if (!env.STRIPE_SECRET_KEY?.trim()) {
    throw new Error('STRIPE_SECRET_KEY is required')
  }
  if (!env.STRIPE_PRICE_ID_PRO_MONTHLY?.trim()) {
    throw new Error('STRIPE_PRICE_ID_PRO_MONTHLY is required')
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required')
  }

  const args = parseArgs(process.argv.slice(2))
  const nowUnixSec = Math.floor(Date.now() / 1000)
  const fromUnixSec = args.fromUnixSec ?? nowUnixSec - 30 * DAY_SEC
  const toUnixSec = args.toUnixSec ?? nowUnixSec

  const pool = createPostgresPool(env)
  try {
    const billingStore = new BillingStore({ pool })
    await billingStore.init()
    const creditsStore = new CreditsStore({ pool })
    await creditsStore.init()
    const creditsService = new CreditsService({ store: creditsStore })
    const stripe = new Stripe(env.STRIPE_SECRET_KEY.trim())

    const result = await reconcileStripeBilling(
      {
        apply: args.apply,
        fromUnixSec,
        toUnixSec,
        sessionId: args.sessionId
      },
      {
        stripe,
        store: billingStore,
        creditsService,
        subscriptionCredits: {
          monthlyPriceId: env.STRIPE_PRICE_ID_PRO_MONTHLY.trim(),
          annualPriceId: env.STRIPE_PRICE_ID_PRO_ANNUAL?.trim() || null,
          enterpriseAnnualPriceId: env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL?.trim() || null,
          monthlyCreditsBrl: 20,
          annualCreditsBrl: 300,
          enterpriseAnnualCreditsBrl: 360
        },
        logger: {
          info: (message, meta) => console.log(JSON.stringify({ level: 'info', message, ...(meta ?? {}) })),
          warn: (message, meta) => console.warn(JSON.stringify({ level: 'warn', message, ...(meta ?? {}) })),
          error: (message, meta) => console.error(JSON.stringify({ level: 'error', message, ...(meta ?? {}) }))
        }
      }
    )

    const compactItems = result.items.map((item) => ({
      invoiceId: item.invoiceId,
      customerId: item.customerId,
      subscriptionId: item.subscriptionId,
      sessionId: item.sessionId,
      status: item.status,
      reason: item.reason,
      planName: item.planName,
      creditsBrl: item.creditsBrl,
      ...(item.error ? { error: item.error } : {})
    }))

    console.log(
      JSON.stringify(
        {
          apply: result.apply,
          fromUnixSec: result.fromUnixSec,
          toUnixSec: result.toUnixSec,
          totals: result.totals,
          items: compactItems
        },
        null,
        2
      )
    )
  } finally {
    await pool.end()
  }
}

function parseArgs(argv: string[]): CliArgs {
  let apply = false
  let fromUnixSec: number | null = null
  let toUnixSec: number | null = null
  let sessionId: string | null = null

  const nextValue = (index: number): string | null => {
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

    if (arg.startsWith('--from=')) {
      fromUnixSec = parseTimestampToUnixSec(arg.slice('--from='.length))
      continue
    }
    if (arg === '--from') {
      fromUnixSec = parseTimestampToUnixSec(nextValue(i))
      i += 1
      continue
    }

    if (arg.startsWith('--to=')) {
      toUnixSec = parseTimestampToUnixSec(arg.slice('--to='.length))
      continue
    }
    if (arg === '--to') {
      toUnixSec = parseTimestampToUnixSec(nextValue(i))
      i += 1
      continue
    }

    if (arg.startsWith('--sessionId=')) {
      sessionId = normalizeArgString(arg.slice('--sessionId='.length))
      continue
    }
    if (arg === '--sessionId') {
      sessionId = normalizeArgString(nextValue(i))
      i += 1
      continue
    }
  }

  return {
    apply,
    fromUnixSec,
    toUnixSec,
    sessionId
  }
}

function parseTimestampToUnixSec(raw: string | null): number | null {
  if (!raw) {
    return null
  }

  if (/^\d+$/.test(raw)) {
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) {
      return null
    }
    // Interpret 13-digit timestamps as milliseconds.
    if (num > 1_000_000_000_000) {
      return Math.floor(num / 1000)
    }
    return Math.floor(num)
  }

  const parsedMs = Date.parse(raw)
  if (!Number.isFinite(parsedMs) || Number.isNaN(parsedMs)) {
    return null
  }
  return Math.floor(parsedMs / 1000)
}

function normalizeArgString(value: string | null): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

void main().catch((error) => {
  const meta = normalizeError(error)
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'reconcile_stripe_billing_failed',
      error: meta.message,
      ...(meta.code ? { code: meta.code } : {}),
      ...(meta.name ? { name: meta.name } : {})
    })
  )
  process.exitCode = 1
})

function normalizeError(error: unknown): { message: string; code?: string; name?: string } {
  if (error instanceof Error) {
    const errLike = error as Error & { code?: unknown }
    const code = typeof errLike.code === 'string' ? errLike.code : undefined
    return {
      message: error.message?.trim() || error.name || 'unknown_error',
      code,
      name: error.name
    }
  }

  if (typeof error === 'string') {
    const message = error.trim()
    return { message: message || 'unknown_error' }
  }

  try {
    return { message: JSON.stringify(error) }
  } catch {
    return { message: String(error) }
  }
}
