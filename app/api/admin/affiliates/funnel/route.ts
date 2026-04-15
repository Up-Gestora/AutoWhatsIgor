import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, resolveBackendUrl, getBackendAdminKey } from '@/lib/adminBackend'

export const runtime = 'nodejs'

type BackendRow = {
  affiliateCode?: string
  affiliateName?: string
  status?: string
  sharePath?: string
  clicks?: number
  uniqueVisitors?: number
  signups?: number
  checkoutStarted?: number
  subscriptionsCreated?: number
  firstPaymentsConfirmed?: number
}

type BackendSummary = {
  clicks?: number
  uniqueVisitors?: number
  signups?: number
  checkoutStarted?: number
  subscriptionsCreated?: number
  firstPaymentsConfirmed?: number
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const query = new URLSearchParams()
  const fromMs = request.nextUrl.searchParams.get('fromMs')
  const toMs = request.nextUrl.searchParams.get('toMs')
  if (fromMs) {
    query.set('fromMs', fromMs)
  }
  if (toMs) {
    query.set('toMs', toMs)
  }

  const response = await fetch(`${backendUrl}/admin/affiliates/funnel?${query.toString()}`, {
    headers: {
      'x-admin-key': adminKey
    },
    cache: 'no-store'
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error ? String(payload.error) : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const rows = Array.isArray(payload?.rows)
    ? payload.rows.map((row: BackendRow) => ({
        affiliateCode: typeof row.affiliateCode === 'string' ? row.affiliateCode : '',
        affiliateName: typeof row.affiliateName === 'string' ? row.affiliateName : '',
        status: row.status === 'inactive' ? 'inactive' : 'active',
        sharePath: typeof row.sharePath === 'string' ? row.sharePath : '',
        clicks: typeof row.clicks === 'number' ? row.clicks : 0,
        uniqueVisitors: typeof row.uniqueVisitors === 'number' ? row.uniqueVisitors : 0,
        signups: typeof row.signups === 'number' ? row.signups : 0,
        checkoutStarted: typeof row.checkoutStarted === 'number' ? row.checkoutStarted : 0,
        subscriptionsCreated: typeof row.subscriptionsCreated === 'number' ? row.subscriptionsCreated : 0,
        firstPaymentsConfirmed: typeof row.firstPaymentsConfirmed === 'number' ? row.firstPaymentsConfirmed : 0
      }))
    : []

  const summary = payload?.summary && typeof payload.summary === 'object'
    ? {
        clicks: typeof (payload.summary as BackendSummary).clicks === 'number' ? (payload.summary as BackendSummary).clicks : 0,
        uniqueVisitors:
          typeof (payload.summary as BackendSummary).uniqueVisitors === 'number'
            ? (payload.summary as BackendSummary).uniqueVisitors
            : 0,
        signups: typeof (payload.summary as BackendSummary).signups === 'number' ? (payload.summary as BackendSummary).signups : 0,
        checkoutStarted:
          typeof (payload.summary as BackendSummary).checkoutStarted === 'number'
            ? (payload.summary as BackendSummary).checkoutStarted
            : 0,
        subscriptionsCreated:
          typeof (payload.summary as BackendSummary).subscriptionsCreated === 'number'
            ? (payload.summary as BackendSummary).subscriptionsCreated
            : 0,
        firstPaymentsConfirmed:
          typeof (payload.summary as BackendSummary).firstPaymentsConfirmed === 'number'
            ? (payload.summary as BackendSummary).firstPaymentsConfirmed
            : 0
      }
    : {
        clicks: 0,
        uniqueVisitors: 0,
        signups: 0,
        checkoutStarted: 0,
        subscriptionsCreated: 0,
        firstPaymentsConfirmed: 0
      }

  return NextResponse.json({
    success: true,
    summary,
    rows
  })
}
