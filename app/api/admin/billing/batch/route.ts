import { NextResponse } from 'next/server'
import { requireAdmin, resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'

export const runtime = 'nodejs'

type BillingBatchBody = {
  sessionIds?: string[]
}

type BatchPlan = 'pro_monthly' | 'pro_annual' | 'enterprise_annual' | 'free' | 'na'

type PlanSnapshot = {
  plan: BatchPlan
  subscriptionStatus: string | null
  priceId: string | null
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const body = (await request.json().catch(() => ({}))) as BillingBatchBody
  const sessionIds = Array.isArray(body.sessionIds)
    ? body.sessionIds.map((id) => String(id).trim()).filter(Boolean)
    : []

  if (sessionIds.length === 0) {
    return NextResponse.json({ error: 'sessionIds_required' }, { status: 400 })
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const monthlyPriceId = (process.env.STRIPE_PRICE_ID_PRO_MONTHLY ?? '').trim()
  const annualPriceId = (process.env.STRIPE_PRICE_ID_PRO_ANNUAL ?? '').trim()
  const enterpriseAnnualPriceId = (process.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL ?? '').trim()
  const uniqueIds = Array.from(new Set(sessionIds)).slice(0, 500)
  const plans: Record<string, PlanSnapshot> = {}
  const errors: Record<string, string> = {}

  await Promise.all(
    uniqueIds.map(async (sessionId) => {
      try {
        const response = await fetch(`${backendUrl}/sessions/${encodeURIComponent(sessionId)}/billing`, {
          headers: { 'x-admin-key': adminKey },
          cache: 'no-store'
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          const error = payload?.error ? String(payload.error) : 'backend_request_failed'
          errors[sessionId] = error
          plans[sessionId] = { plan: 'na', subscriptionStatus: null, priceId: null }
          return
        }

        const rawStatus = payload?.billing?.subscription?.status
        const rawPriceId = payload?.billing?.subscription?.priceId
        const subscriptionStatus = typeof rawStatus === 'string' ? rawStatus : null
        const priceId = typeof rawPriceId === 'string' ? rawPriceId : null
        plans[sessionId] = {
          plan: classifyPlan(subscriptionStatus, priceId, monthlyPriceId, annualPriceId, enterpriseAnnualPriceId),
          subscriptionStatus,
          priceId
        }
      } catch (error) {
        errors[sessionId] = error instanceof Error ? error.message : 'request_failed'
        plans[sessionId] = { plan: 'na', subscriptionStatus: null, priceId: null }
      }
    })
  )

  return NextResponse.json({
    success: true,
    plans,
    ...(Object.keys(errors).length > 0 ? { errors } : {})
  })
}

function classifyPlan(
  subscriptionStatus: string | null,
  priceId: string | null,
  monthlyPriceId: string,
  annualPriceId: string,
  enterpriseAnnualPriceId: string
): BatchPlan {
  if (subscriptionStatus !== 'active' && subscriptionStatus !== 'trialing') {
    return 'free'
  }

  if (!priceId) {
    return 'na'
  }

  if (monthlyPriceId && priceId === monthlyPriceId) {
    return 'pro_monthly'
  }

  if (annualPriceId && priceId === annualPriceId) {
    return 'pro_annual'
  }

  if (enterpriseAnnualPriceId && priceId === enterpriseAnnualPriceId) {
    return 'enterprise_annual'
  }

  return 'na'
}
