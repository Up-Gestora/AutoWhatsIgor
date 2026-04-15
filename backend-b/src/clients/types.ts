export type ClientStatus = 'ativo' | 'inativo' | 'vip' | 'lead'

export type ClientRecord = {
  id: string
  sessionId: string
  name: string | null
  whatsapp: string | null
  chatId: string | null
  status: ClientStatus
  lastContactAt: number | null
  nextContactAt: number | null
  observations: string | null
  createdAt: number | null
  lastMessage: string | null
  source: string | null
  totalValue: number | null
  lastPurchaseAt: number | null
  updatedAt: number | null
}

export type ClientCreate = {
  sessionId: string
  id: string
  name: string | null
  whatsapp: string | null
  chatId: string | null
  status?: ClientStatus
  lastContactAt?: number | null
  nextContactAt?: number | null
  observations?: string | null
  createdAt?: number | null
  lastMessage?: string | null
  source?: string | null
  totalValue?: number | null
  lastPurchaseAt?: number | null
}

export type ClientUpdate = {
  status?: ClientStatus
  nextContactAt?: number | null
  observations?: string | null
}

export type ClientAutoFollowUpClaim = {
  sessionId: string
  clientId: string
  chatId: string
  status: ClientStatus
  nextContactAt: number
  autoFollowUpStep: number
}
