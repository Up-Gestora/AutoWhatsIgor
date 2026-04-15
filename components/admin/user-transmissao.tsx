'use client'

import { useCallback } from 'react'
import { Megaphone } from 'lucide-react'
import { TransmissaoPanel } from '@/components/dashboard/transmissao-panel'

interface AdminUserTransmissaoProps {
  userId: string
  userName?: string
}

export function AdminUserTransmissao({ userId, userName }: AdminUserTransmissaoProps) {
  const buildDetailsHref = useCallback(
    (broadcastId: string) => {
      const params = new URLSearchParams({
        sessionId: userId,
        tab: 'transmissao',
        userId
      })
      return `/admin/acesso-adm/transmissao/${encodeURIComponent(broadcastId)}?${params.toString()}`
    },
    [userId]
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" /> Transmissão do usuário
        </h3>
        <p className="text-sm text-gray-400">
          {userName ? `Usuário: ${userName}` : 'Listas e transmissões deste usuário.'}
        </p>
      </div>

      <TransmissaoPanel sessionId={userId} detailsHrefBuilder={buildDetailsHref} />
    </div>
  )
}
