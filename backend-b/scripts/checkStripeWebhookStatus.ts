import Stripe from 'stripe'
import { loadEnv } from '../src/config/env'

const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_succeeded'
] as const

type EndpointStatus = {
  id: string
  url: string
  status: string
  enabledEventsCount: number
  missingRequiredEvents: string[]
}

async function main() {
  const env = loadEnv()
  const secretKey = env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required')
  }

  const endpointIdFilter = normalizeString(process.env.STRIPE_WEBHOOK_ENDPOINT_ID)
  const endpointUrlFilter = normalizeString(process.env.STRIPE_WEBHOOK_URL)
  const stripe = new Stripe(secretKey)
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })

  const rows: EndpointStatus[] = endpoints.data.map((endpoint) => {
    const enabledEvents = new Set(endpoint.enabled_events)
    const missingRequiredEvents = REQUIRED_EVENTS.filter((eventName) => !enabledEvents.has(eventName))

    return {
      id: endpoint.id,
      url: endpoint.url,
      status: endpoint.status,
      enabledEventsCount: endpoint.enabled_events.length,
      missingRequiredEvents
    }
  })

  const filtered = rows.filter((row) => {
    if (endpointIdFilter && row.id !== endpointIdFilter) {
      return false
    }
    if (endpointUrlFilter && row.url !== endpointUrlFilter) {
      return false
    }
    return true
  })

  const targets = filtered.length > 0 ? filtered : rows
  console.log(
    JSON.stringify(
      {
        requiredEvents: REQUIRED_EVENTS,
        endpoints: targets
      },
      null,
      2
    )
  )

  const disabledOrInvalid = targets.filter((row) => row.status !== 'enabled' || row.missingRequiredEvents.length > 0)
  if (disabledOrInvalid.length > 0) {
    throw new Error(`stripe_webhook_invalid_count_${disabledOrInvalid.length}`)
  }
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'check_stripe_webhook_status_failed',
      error: error instanceof Error ? error.message : String(error)
    })
  )
  process.exitCode = 1
})
