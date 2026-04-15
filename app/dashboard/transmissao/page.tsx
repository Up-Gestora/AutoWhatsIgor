'use client'

import { TransmissaoPanel } from '@/components/dashboard/transmissao-panel'
import { useAuth } from '@/providers/auth-provider'

export default function TransmissaoPage() {
  const { user } = useAuth()

  return <TransmissaoPanel sessionId={user?.uid ?? null} />
}
