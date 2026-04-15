'use client'

import { AdminDashboard } from '@/components/admin/admin-dashboard'

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Admin</h1>
        <p className="text-gray-400">Visão geral do onboarding, ativação e aquisição com dados reais por coorte.</p>
      </div>

      <AdminDashboard />
    </div>
  )
}
