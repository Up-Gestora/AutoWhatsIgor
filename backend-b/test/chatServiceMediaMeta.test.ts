import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatService } from '../src/chats/service'

test('ChatService exposes outbound media metadata and ai file snapshot', async () => {
  const service = new ChatService({
    stateStore: {} as any,
    inboundStore: {
      listRecentByChat: async () => []
    } as any,
    outboundStore: {
      listRecentByChat: async () => [
        {
          id: 1,
          sessionId: 's1',
          chatId: 'c1',
          requestId: 'req-1',
          payloadHash: 'hash-1',
          status: 'sent',
          attempts: 1,
          messageId: 'wamid-1',
          error: null,
          payload: {
            type: 'media',
            mediaType: 'documentMessage',
            url: 'https://example.com/file.pdf',
            mimeType: 'application/pdf',
            fileName: 'Tabela de Precos.pdf',
            origin: 'ai',
            aiFile: {
              id: 'file-1',
              nome: 'Tabela de Precos',
              tipo: 'document',
              mimeType: 'application/pdf',
              sizeBytes: 2048,
              descricao: 'Tabela com todos os valores',
              quandoUsar: 'Quando o usuario pedir precos',
              updatedAtMs: 1700000000000
            }
          },
          createdAtMs: 1700000000100,
          updatedAtMs: 1700000000100
        }
      ]
    } as any
  })

  const messages = await service.listMessages('s1', 'c1', { limit: 10 })

  assert.equal(messages.length, 1)
  assert.equal(messages[0].text, null)
  assert.equal(messages[0].type, 'documentMessage')
  assert.ok(messages[0].media)
  assert.equal(messages[0].media?.mediaType, 'documentMessage')
  assert.equal(messages[0].media?.mimeType, 'application/pdf')
  assert.equal(messages[0].media?.fileName, 'Tabela de Precos.pdf')
  assert.deepEqual(messages[0].media?.aiFile, {
    id: 'file-1',
    nome: 'Tabela de Precos',
    tipo: 'document',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    descricao: 'Tabela com todos os valores',
    quandoUsar: 'Quando o usuario pedir precos',
    updatedAtMs: 1700000000000
  })
})

test('ChatService keeps outbound ai media metadata when inbound fromMe shares the same messageId', async () => {
  const service = new ChatService({
    stateStore: {} as any,
    inboundStore: {
      listRecentByChat: async () => [
        {
          id: 99,
          sessionId: 's1',
          chatId: 'c1',
          messageId: 'wamid-duplicate',
          fromMe: true,
          messageType: 'documentMessage',
          text: null,
          messageTimestampMs: 1700000000200
        }
      ]
    } as any,
    outboundStore: {
      listRecentByChat: async () => [
        {
          id: 1,
          sessionId: 's1',
          chatId: 'c1',
          requestId: 'req-1',
          payloadHash: 'hash-1',
          status: 'sent',
          attempts: 1,
          messageId: 'wamid-duplicate',
          error: null,
          payload: {
            type: 'media',
            mediaType: 'documentMessage',
            url: 'https://example.com/file.pdf',
            mimeType: 'application/pdf',
            fileName: 'Tabela de Precos.pdf',
            origin: 'ai',
            aiFile: {
              id: 'file-1',
              nome: 'Tabela de Precos',
              tipo: 'document',
              mimeType: 'application/pdf',
              sizeBytes: 2048,
              descricao: 'Tabela com todos os valores',
              quandoUsar: 'Quando o usuario pedir precos',
              updatedAtMs: 1700000000000
            }
          },
          createdAtMs: 1700000000100,
          updatedAtMs: 1700000000100
        }
      ]
    } as any
  })

  const messages = await service.listMessages('s1', 'c1', { limit: 10 })

  assert.equal(messages.length, 1)
  assert.equal(messages[0].messageId, 'wamid-duplicate')
  assert.equal(messages[0].origin, 'ai')
  assert.ok(messages[0].media)
  assert.equal(messages[0].media?.mediaType, 'documentMessage')
  assert.deepEqual(messages[0].media?.aiFile, {
    id: 'file-1',
    nome: 'Tabela de Precos',
    tipo: 'document',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    descricao: 'Tabela com todos os valores',
    quandoUsar: 'Quando o usuario pedir precos',
    updatedAtMs: 1700000000000
  })
})

test('ChatService maps inbound media metadata and exposes mediaRef', async () => {
  const service = new ChatService({
    stateStore: {} as any,
    inboundStore: {
      listRecentByChat: async () => [
        {
          id: 10,
          sessionId: 's1',
          chatId: 'c1',
          messageId: 'wamid-inbound-1',
          fromMe: false,
          messageType: 'imageMessage',
          text: 'Legenda da foto',
          messageTimestampMs: 1700000000200,
          rawPayload: {
            message: {
              imageMessage: {
                mimetype: 'image/jpeg',
                caption: 'Legenda da foto',
                fileLength: 2048
              }
            }
          }
        }
      ]
    } as any,
    outboundStore: {
      listRecentByChat: async () => []
    } as any
  })

  const messages = await service.listMessages('s1', 'c1', { limit: 10 })

  assert.equal(messages.length, 1)
  assert.equal(messages[0].mediaRef, 'inbound:10')
  assert.equal(messages[0].media?.mediaType, 'imageMessage')
  assert.equal(messages[0].media?.mimeType, 'image/jpeg')
  assert.equal(messages[0].media?.sizeBytes, 2048)
})

test('ChatService maps inbound and outbound contact payloads', async () => {
  const service = new ChatService({
    stateStore: {} as any,
    inboundStore: {
      listRecentByChat: async () => [
        {
          id: 11,
          sessionId: 's1',
          chatId: 'c1',
          messageId: 'wamid-contact-inbound',
          fromMe: false,
          messageType: 'contactMessage',
          text: null,
          messageTimestampMs: 1700000000200,
          rawPayload: {
            message: {
              contactMessage: {
                displayName: 'Joao',
                vcard:
                  'BEGIN:VCARD\\nVERSION:3.0\\nFN:Joao\\nTEL;type=CELL;type=VOICE;waid=5511999887766:+55 11 99988-7766\\nEND:VCARD'
              }
            }
          }
        }
      ]
    } as any,
    outboundStore: {
      listRecentByChat: async () => [
        {
          id: 7,
          sessionId: 's1',
          chatId: 'c1',
          requestId: 'req-contact',
          payloadHash: 'hash-contact',
          status: 'sent',
          attempts: 1,
          messageId: 'wamid-contact-outbound',
          error: null,
          payload: {
            type: 'contact',
            displayName: 'Comercial',
            contacts: [{ name: 'Maria', whatsapp: '5511988877665' }],
            origin: 'manual'
          },
          createdAtMs: 1700000000300,
          updatedAtMs: 1700000000300
        }
      ]
    } as any
  })

  const messages = await service.listMessages('s1', 'c1', { limit: 10 })

  assert.equal(messages.length, 2)
  const inbound = messages.find((msg) => msg.messageId === 'wamid-contact-inbound')
  const outbound = messages.find((msg) => msg.messageId === 'wamid-contact-outbound')

  assert.ok(inbound?.contact)
  assert.equal(inbound?.contact?.displayName, 'Joao')
  assert.equal(inbound?.contact?.contacts[0]?.name, 'Joao')
  assert.equal(inbound?.contact?.contacts[0]?.whatsapp, '5511999887766')

  assert.ok(outbound?.contact)
  assert.equal(outbound?.type, 'contactMessage')
  assert.equal(outbound?.origin, 'legacy_manual')
  assert.equal(outbound?.contact?.displayName, 'Comercial')
  assert.equal(outbound?.contact?.contacts[0]?.name, 'Maria')
  assert.equal(outbound?.contact?.contacts[0]?.whatsapp, '5511988877665')
})

test('ChatService maps inbound fromMe message as human_external when unmatched', async () => {
  const service = new ChatService({
    stateStore: {} as any,
    inboundStore: {
      listRecentByChat: async () => [
        {
          id: 31,
          sessionId: 's1',
          chatId: 'c1',
          messageId: 'wamid-external',
          fromMe: true,
          messageType: 'conversation',
          text: 'Mensagem enviada pelo celular',
          messageTimestampMs: 1700000001200
        }
      ]
    } as any,
    outboundStore: {
      listRecentByChat: async () => []
    } as any
  })

  const messages = await service.listMessages('s1', 'c1', { limit: 10 })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].origin, 'human_external')
})

test('ChatService prefers outbound origin over inbound human_external on same messageId', async () => {
  const service = new ChatService({
    stateStore: {} as any,
    inboundStore: {
      listRecentByChat: async () => [
        {
          id: 41,
          sessionId: 's1',
          chatId: 'c1',
          messageId: 'wamid-dup-1',
          fromMe: true,
          messageType: 'conversation',
          text: 'Enviado no WhatsApp',
          messageTimestampMs: 1700000002000
        }
      ]
    } as any,
    outboundStore: {
      listRecentByChat: async () => [
        {
          id: 42,
          sessionId: 's1',
          chatId: 'c1',
          requestId: 'req-42',
          payloadHash: 'hash-42',
          status: 'sent',
          attempts: 1,
          messageId: 'wamid-dup-1',
          error: null,
          payload: {
            type: 'text',
            text: 'Enviado no painel',
            origin: 'human_dashboard'
          },
          createdAtMs: 1700000001999,
          updatedAtMs: 1700000001999
        }
      ]
    } as any
  })

  const messages = await service.listMessages('s1', 'c1', { limit: 10 })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].messageId, 'wamid-dup-1')
  assert.equal(messages[0].origin, 'human_dashboard')
  assert.equal(messages[0].text, 'Enviado no painel')
})
