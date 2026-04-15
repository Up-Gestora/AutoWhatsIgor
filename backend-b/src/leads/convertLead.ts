import type { LeadStore } from './store'
import type { ClientStore } from '../clients/store'
import type { ClientRecord } from '../clients/types'
import type { LeadRecord } from './types'
import type { LeadConversionSource, LeadConversionStore } from './conversionStore'
import { syncLeadConversion } from '../firebase/leadSync'

type Logger = {
  warn?: (message: string, meta?: Record<string, unknown>) => void
}

type ConvertLeadOptions = {
  leadStore: LeadStore
  clientStore: ClientStore
  conversionStore?: LeadConversionStore
  conversionSource?: LeadConversionSource
  logger?: Logger
}

export type LeadConversionResult = {
  client: ClientRecord
  deletedLeadId: string
  lead: LeadRecord
}

export async function convertLeadToClient(
  sessionId: string,
  leadId: string,
  options: ConvertLeadOptions
): Promise<LeadConversionResult | null> {
  const lead = await options.leadStore.get(sessionId, leadId)
  if (!lead) {
    return null
  }

  let client = await options.clientStore.findByChatOrWhatsapp(sessionId, lead.chatId ?? null, lead.whatsapp ?? null)
  if (!client) {
    client = await options.clientStore.create({
      sessionId,
      id: lead.id,
      name: lead.name ?? 'Sem nome',
      whatsapp: lead.whatsapp ?? null,
      chatId: lead.chatId ?? null,
      status: 'ativo',
      lastContactAt: lead.lastContact ?? null,
      nextContactAt: lead.nextContact ?? null,
      observations: lead.observations ?? null,
      createdAt: lead.createdAt ?? Date.now(),
      lastMessage: lead.lastMessage ?? null,
      source: lead.source ?? null,
      totalValue: 0,
      lastPurchaseAt: null
    })
  }

  await options.leadStore.delete(sessionId, leadId)

  if (options.conversionStore) {
    const convertedAtMs = Date.now()
    try {
      await options.conversionStore.recordLeadToClientConversion({
        sessionId,
        leadId: lead.id,
        clientId: client.id,
        chatId: lead.chatId ?? lead.id,
        whatsapp: lead.whatsapp ?? null,
        leadCreatedAtMs: lead.createdAt ?? convertedAtMs,
        leadUpdatedAtMs: lead.updatedAt ?? convertedAtMs,
        convertedAtMs,
        conversionSource: options.conversionSource ?? 'unknown'
      })
    } catch (error) {
      options.logger?.warn?.('Failed to record lead conversion', {
        sessionId,
        leadId,
        error: (error as Error).message
      })
    }
  }

  try {
    await syncLeadConversion({ sessionId, lead, client })
  } catch (error) {
    options.logger?.warn?.('Failed to sync lead conversion to Firebase', {
      sessionId,
      leadId,
      error: (error as Error).message
    })
  }

  return {
    client,
    deletedLeadId: leadId,
    lead
  }
}
