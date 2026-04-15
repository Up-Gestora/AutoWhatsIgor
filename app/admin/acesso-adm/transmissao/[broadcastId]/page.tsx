'use client'

import { useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { TransmissaoDetailsPanel } from '@/components/dashboard/transmissao-details-panel'

export default function AdminBroadcastDetailsPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const broadcastIdParam = (params as Record<string, string | string[] | undefined>)?.broadcastId
  const broadcastId =
    typeof broadcastIdParam === 'string'
      ? broadcastIdParam
      : Array.isArray(broadcastIdParam)
        ? broadcastIdParam[0] ?? ''
        : ''

  const sessionId = searchParams.get('sessionId')?.trim() || null
  const tab = searchParams.get('tab')?.trim() || 'transmissao'
  const userId = searchParams.get('userId')?.trim() || sessionId || ''

  const backHref = useMemo(() => {
    const next = new URLSearchParams()
    if (tab) {
      next.set('tab', tab)
    }
    if (userId) {
      next.set('userId', userId)
    }
    const query = next.toString()
    return query ? `/admin/acesso-adm?${query}` : '/admin/acesso-adm'
  }, [tab, userId])

  return (
    <TransmissaoDetailsPanel
      sessionId={sessionId}
      broadcastId={broadcastId}
      backHref={backHref}
    />
  )
}
