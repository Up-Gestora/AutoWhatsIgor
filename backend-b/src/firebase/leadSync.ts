import { getFirestoreAdmin, admin } from './admin'
import type { LeadRecord } from '../leads/types'
import type { ClientRecord } from '../clients/types'

type LeadConversionSnapshot = {
  sessionId: string
  lead: LeadRecord
  client: ClientRecord
}

export async function syncLeadConversion(snapshot: LeadConversionSnapshot): Promise<void> {
  const db = getFirestoreAdmin()
  if (!db) {
    return
  }

  const { sessionId, lead, client } = snapshot
  const userRef = db.collection('users').doc(sessionId)
  const leadRef = userRef.collection('leads').doc(lead.id)
  const clientRef = userRef.collection('clientes').doc(client.id)

  const toTimestamp = (value: number | null) => {
    if (!value) {
      return null
    }
    return admin.firestore.Timestamp.fromMillis(value)
  }

  const clientPayload = {
    name: client.name ?? 'Sem nome',
    whatsapp: client.whatsapp ?? null,
    chatId: client.chatId ?? null,
    status: client.status ?? 'ativo',
    lastContact: toTimestamp(client.lastContactAt ?? lead.lastContact),
    nextContact: toTimestamp(client.nextContactAt ?? lead.nextContact),
    observations: client.observations ?? lead.observations ?? null,
    createdAt: toTimestamp(client.createdAt ?? lead.createdAt ?? Date.now()),
    lastMessage: client.lastMessage ?? lead.lastMessage ?? null,
    source: client.source ?? lead.source ?? null,
    totalValue: client.totalValue ?? 0,
    lastPurchase: null
  }

  await clientRef.set(clientPayload, { merge: true })
  await leadRef.delete().catch(() => null)
}
