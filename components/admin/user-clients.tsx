'use client'

import ClientesPage from '@/app/dashboard/clientes/page'

interface AdminUserClientsProps {
  userId: string
  userName?: string
}

export function AdminUserClients({ userId }: AdminUserClientsProps) {
  return <ClientesPage sessionIdOverride={userId} disableGuidedOnboarding />
}
