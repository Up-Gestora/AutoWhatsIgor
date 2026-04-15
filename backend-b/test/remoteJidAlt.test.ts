import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBaileysMessage } from '../src/messages/normalizer'
import { InboundMessageService } from '../src/messages/inboundService'

test('normalizeBaileysMessage captures remoteJidAlt when present', () => {
  const raw = {
    key: {
      remoteJid: '120363012345678901@lid',
      remoteJidAlt: '5511999999999@s.whatsapp.net',
      id: 'm1',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'Oi' },
    pushName: 'Ana'
  }

  const normalized = normalizeBaileysMessage('s1', raw)
  assert.ok(normalized)
  assert.equal(normalized.chatId, '120363012345678901@lid')
  assert.equal(normalized.chatIdAlt, '5511999999999@s.whatsapp.net')
})

test('normalizeBaileysMessage normalizes user chat ids from c.us and strips device suffix', () => {
  const raw = {
    key: {
      remoteJid: '5511999999999:41@c.us',
      id: 'm-normalized',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'Oi' },
    participant: '5511888888888:22@c.us'
  }

  const normalized = normalizeBaileysMessage('s1', raw)
  assert.ok(normalized)
  assert.equal(normalized.chatId, '5511999999999@s.whatsapp.net')
  assert.equal(normalized.senderId, '5511888888888@s.whatsapp.net')
})

test('InboundMessageService uses chatIdAlt to extract phone when chatId is LID', async () => {
  const raw = {
    key: {
      remoteJid: '120363012345678901@lid',
      remoteJidAlt: '5511999999999@s.whatsapp.net',
      id: 'm2',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'Oi' },
    pushName: 'Ana'
  }

  let upserted: any = null
  let inserted: any = null

  const service = new InboundMessageService({
    store: {
      insert: async (input: any) => {
        inserted = input
        return { inserted: true, id: 1 }
      }
    } as any,
    queue: {
      enqueue: async () => {}
    } as any,
    leadStore: {
      upsertFromInbound: async (input: any) => {
        upserted = input
        return {} as any
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.ok(inserted?.normalizedPayload)
  assert.equal(inserted.normalizedPayload.chatIdAlt, '5511999999999@s.whatsapp.net')

  assert.ok(upserted)
  assert.equal(upserted.leadId, '120363012345678901@lid')
  assert.equal(upserted.chatId, '120363012345678901@lid')
  assert.equal(upserted.whatsapp, '5511999999999')
})

test('InboundMessageService leaves whatsapp null when chatId is LID and no remoteJidAlt is available', async () => {
  const raw = {
    key: {
      remoteJid: '120363012345678901@lid',
      id: 'm3',
      fromMe: false
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'Oi' },
    pushName: 'Ana'
  }

  let upserted: any = null

  const service = new InboundMessageService({
    store: {
      insert: async () => ({ inserted: true, id: 1 })
    } as any,
    queue: {
      enqueue: async () => {}
    } as any,
    leadStore: {
      upsertFromInbound: async (input: any) => {
        upserted = input
        return {} as any
      }
    } as any
  })

  await service.handleRawMessage('s1', raw)

  assert.ok(upserted)
  assert.equal(upserted.leadId, '120363012345678901@lid')
  assert.equal(upserted.whatsapp, null)
})

