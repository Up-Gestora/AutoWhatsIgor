import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatService } from '../src/chats/service'

test('ChatService listChats includes manualUnread and labels', async () => {
  const service = new ChatService({
    stateStore: {
      listBySession: async () => [
        {
          sessionId: 's1',
          chatId: 'chat-1',
          chatName: 'Contato',
          isGroup: false,
          unreadCount: 0,
          manualUnread: true,
          lastMessageId: null,
          lastMessageText: 'Oi',
          lastMessageType: 'conversation',
          lastMessageFromMe: false,
          lastMessageTsMs: 1700000000000,
          updatedAtMs: 1700000000000
        }
      ]
    } as any,
    labelStore: {
      listByChatIds: async () => ({
        'chat-1': [
          {
            sessionId: 's1',
            id: 'label-1',
            name: 'Novo cliente',
            colorHex: '#2D8CFF',
            createdAt: 1700000000000,
            updatedAt: 1700000000000
          }
        ]
      })
    } as any,
    inboundStore: {
      listRecentByChat: async () => []
    } as any,
    outboundStore: {
      listRecentByChat: async () => []
    } as any
  })

  const chats = await service.listChats('s1', 50)
  assert.equal(chats.length, 1)
  assert.equal(chats[0].manualUnread, true)
  assert.equal(chats[0].labels.length, 1)
  assert.equal(chats[0].labels[0].name, 'Novo cliente')
})

test('ChatService markUnread delegates to state store', async () => {
  let captured: { sessionId: string; chatId: string } | null = null
  const service = new ChatService({
    stateStore: {
      markUnread: async (sessionId: string, chatId: string) => {
        captured = { sessionId, chatId }
      }
    } as any,
    inboundStore: {} as any,
    outboundStore: {} as any
  })

  await service.markUnread('s1', 'chat-1')
  assert.deepEqual(captured, { sessionId: 's1', chatId: 'chat-1' })
})

test('ChatService listChats filters noise chats with placeholder/template and no resolved name', async () => {
  const service = new ChatService({
    stateStore: {
      listBySession: async () => [
        {
          sessionId: 's1',
          chatId: '5511999999999@s.whatsapp.net',
          chatName: null,
          isGroup: false,
          unreadCount: 0,
          manualUnread: false,
          lastMessageId: 'a',
          lastMessageText: null,
          lastMessageType: 'placeholderMessage',
          lastMessageFromMe: false,
          lastMessageTsMs: 1700000000000,
          updatedAtMs: 1700000000000
        },
        {
          sessionId: 's1',
          chatId: '5511888888888@s.whatsapp.net',
          chatName: 'Maria',
          isGroup: false,
          unreadCount: 0,
          manualUnread: false,
          lastMessageId: 'b',
          lastMessageText: null,
          lastMessageType: 'templateMessage',
          lastMessageFromMe: false,
          lastMessageTsMs: 1700000001000,
          updatedAtMs: 1700000001000
        }
      ]
    } as any,
    inboundStore: {
      listRecentByChat: async () => []
    } as any,
    outboundStore: {
      listRecentByChat: async () => []
    } as any
  })

  const chats = await service.listChats('s1', 50)
  assert.equal(chats.length, 1)
  assert.equal(chats[0].id, '5511888888888@s.whatsapp.net')
  assert.equal(chats[0].name, 'Maria')
})
