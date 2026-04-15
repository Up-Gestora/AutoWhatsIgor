'use client'

import { Calendar } from 'lucide-react'
import { AgendaPanel } from '@/components/dashboard/agenda-panel'

interface AdminUserAgendaProps {
  userId: string
  userName?: string
}

export function AdminUserAgenda({ userId, userName }: AdminUserAgendaProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" /> Agenda do usuário
        </h3>
        <p className="text-sm text-gray-400">
          {userName ? `Usuário: ${userName}` : 'Agenda e agendamentos deste usuário.'}
        </p>
      </div>

      <AgendaPanel sessionId={userId} />
    </div>
  )
}
