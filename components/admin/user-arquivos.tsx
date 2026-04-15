'use client'

import { Files } from 'lucide-react'
import { ArquivosPanel } from '@/components/dashboard/arquivos-panel'

interface AdminUserArquivosProps {
  userId: string
  userName?: string
}

export function AdminUserArquivos({ userId, userName }: AdminUserArquivosProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <Files className="w-5 h-5 text-primary" /> Arquivos do usuário
        </h3>
        <p className="text-sm text-gray-400">
          {userName ? `Usuário: ${userName}` : 'Biblioteca de arquivos deste usuário.'}
        </p>
      </div>

      <ArquivosPanel sessionId={userId} />
    </div>
  )
}
