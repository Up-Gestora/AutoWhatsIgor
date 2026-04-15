'use client'

import { ClientDashboard } from '@/components/admin/client-dashboard'

export default function AccessAdminPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Acesso admin</h1>
        <p className="text-gray-400">
          Pesquise um usuário para visualizar e gerenciar treinamento, CRM, agenda, arquivos, transmissão e financeiro.
        </p>
      </div>

      <ClientDashboard />
    </div>
  )
}
