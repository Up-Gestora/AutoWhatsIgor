'use client'

import { ArquivosPanel } from '@/components/dashboard/arquivos-panel'
import { useAuth } from '@/providers/auth-provider'

export default function ArquivosPage() {
  const { user } = useAuth()

  return <ArquivosPanel sessionId={user?.uid ?? null} />
}
