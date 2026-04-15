'use client'

import { MessageSquare } from 'lucide-react'
import { ConversationsPanel } from '@/components/conversations/conversations-panel'

interface AdminUserConversationsProps {
  userId: string
  userName?: string
}

export function AdminUserConversations({ userId, userName }: AdminUserConversationsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" /> Conversas do usuário
        </h3>
        <p className="text-sm text-gray-400">
          {userName ? `Usuário: ${userName}` : 'Histórico de conversas e mensagens.'}
        </p>
      </div>

      <ConversationsPanel userId={userId} />
    </div>
  )
}
