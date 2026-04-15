'use client'

import { TransmissaoDetailsPanel } from '@/components/dashboard/transmissao-details-panel'
import { useAuth } from '@/providers/auth-provider'
import { useParams } from 'next/navigation'

export default function BroadcastDetailsPage() {
  const { user } = useAuth()
  const params = useParams()
  const broadcastIdParam = (params as Record<string, string | string[] | undefined>)?.broadcastId
  const broadcastId =
    typeof broadcastIdParam === 'string'
      ? broadcastIdParam
      : Array.isArray(broadcastIdParam)
        ? broadcastIdParam[0] ?? ''
        : ''

  return (
    <TransmissaoDetailsPanel
      sessionId={user?.uid ?? null}
      broadcastId={broadcastId}
      backHref="/dashboard/transmissao"
    />
  )
}
