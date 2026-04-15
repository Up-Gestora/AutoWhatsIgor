'use client'

import { AgendaPanel } from '@/components/dashboard/agenda-panel'
import { useAuth } from '@/providers/auth-provider'

export default function AgendaPage() {
  const { user } = useAuth()

  return <AgendaPanel sessionId={user?.uid ?? null} />
}
