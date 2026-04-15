'use client'

import LeadsPage from '@/app/dashboard/leads/page'

interface AdminUserLeadsProps {
  userId: string
  userName?: string
}

export function AdminUserLeads({ userId }: AdminUserLeadsProps) {
  return <LeadsPage sessionIdOverride={userId} disableGuidedOnboarding />
}
