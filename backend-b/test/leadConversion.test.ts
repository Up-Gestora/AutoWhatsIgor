import assert from 'node:assert/strict'
import test from 'node:test'
import { convertLeadToClient } from '../src/leads/convertLead'
import { computeAiAssisted } from '../src/leads/conversionStore'
import type { ClientRecord } from '../src/clients/types'
import type { LeadRecord } from '../src/leads/types'

function buildLead(now = Date.now()): LeadRecord {
  return {
    id: 'lead-1',
    sessionId: 's1',
    name: 'Alice',
    whatsapp: '5511999999999',
    chatId: 'c1',
    status: 'novo',
    lastContact: now,
    nextContact: null,
    observations: null,
    createdAt: now - 60_000,
    lastMessage: 'Oi',
    source: 'whatsapp',
    updatedAt: now - 1_000,
    campaign: null
  }
}

function buildClient(now = Date.now()): ClientRecord {
  return {
    id: 'lead-1',
    sessionId: 's1',
    name: 'Alice',
    whatsapp: '5511999999999',
    chatId: 'c1',
    status: 'ativo',
    lastContactAt: now,
    nextContactAt: null,
    observations: null,
    createdAt: now - 60_000,
    lastMessage: 'Oi',
    source: 'whatsapp',
    totalValue: 0,
    lastPurchaseAt: null,
    updatedAt: now
  }
}

test('convertLeadToClient records conversion when conversionStore is provided', async () => {
  const lead = buildLead()
  const client = buildClient()
  let deleted = false
  let recorded: any = null

  const result = await convertLeadToClient('s1', 'lead-1', {
    leadStore: {
      get: async () => lead,
      delete: async () => {
        deleted = true
      }
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => null,
      create: async () => client
    } as any,
    conversionStore: {
      recordLeadToClientConversion: async (input: any) => {
        recorded = input
      }
    } as any,
    conversionSource: 'manual'
  })

  assert.ok(result)
  assert.equal(deleted, true)
  assert.ok(recorded)
  assert.equal(recorded.sessionId, 's1')
  assert.equal(recorded.leadId, lead.id)
  assert.equal(recorded.clientId, client.id)
  assert.equal(recorded.conversionSource, 'manual')
  assert.equal(typeof recorded.leadCreatedAtMs, 'number')
  assert.equal(typeof recorded.leadUpdatedAtMs, 'number')
  assert.equal(typeof recorded.convertedAtMs, 'number')
})

test('convertLeadToClient does not fail when conversionStore throws', async () => {
  const lead = buildLead()
  const client = buildClient()
  let deleted = false

  const result = await convertLeadToClient('s1', 'lead-1', {
    leadStore: {
      get: async () => lead,
      delete: async () => {
        deleted = true
      }
    } as any,
    clientStore: {
      findByChatOrWhatsapp: async () => null,
      create: async () => client
    } as any,
    conversionStore: {
      recordLeadToClientConversion: async () => {
        throw new Error('boom')
      }
    } as any,
    conversionSource: 'manual'
  })

  assert.ok(result)
  assert.equal(deleted, true)
})

test('computeAiAssisted', () => {
  assert.equal(computeAiAssisted('ai_auto', 0), true)
  assert.equal(computeAiAssisted('manual', 0), false)
  assert.equal(computeAiAssisted('manual', 1), true)
})
