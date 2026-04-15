import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'
import { ChatLabelStoreError } from '../src/chats'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildLabel(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 's1',
    id: 'label-1',
    name: 'Novo cliente',
    colorHex: '#7E49E7',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

test('labels routes list and create', async () => {
  let capturedLimit: number | undefined
  const app = buildServer(baseEnv, {
    chatLabelStore: {
      listBySession: async (_sessionId: string, limit: number) => {
        capturedLimit = limit
        return [buildLabel()]
      },
      create: async (payload: any) => buildLabel(payload)
    } as any
  })

  try {
    const listResponse = await app.inject({
      method: 'GET',
      url: '/sessions/s1/labels',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(listResponse.statusCode, 200)
    assert.equal((listResponse.json() as any).labels.length, 1)
    assert.equal(capturedLimit, 200)

    const createResponse = await app.inject({
      method: 'POST',
      url: '/sessions/s1/labels',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        name: 'Pagamento pendente',
        colorHex: '#2D8CFF'
      }
    })
    assert.equal(createResponse.statusCode, 200)
    const body = createResponse.json() as any
    assert.equal(body.success, true)
    assert.equal(body.label.name, 'Pagamento pendente')
    assert.equal(body.label.colorHex, '#2D8CFF')
  } finally {
    await app.close()
  }
})

test('labels routes map validation and conflict errors', async () => {
  const app = buildServer(baseEnv, {
    chatLabelStore: {
      create: async (payload: any) => {
        if (payload.name === 'conflict') {
          throw new ChatLabelStoreError('label_name_conflict')
        }
        throw new ChatLabelStoreError('label_name_required')
      }
    } as any
  })

  try {
    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/sessions/s1/labels',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        name: '',
        colorHex: '#2D8CFF'
      }
    })
    assert.equal(invalidResponse.statusCode, 400)
    assert.equal((invalidResponse.json() as any).error, 'label_name_required')

    const conflictResponse = await app.inject({
      method: 'POST',
      url: '/sessions/s1/labels',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        name: 'conflict',
        colorHex: '#2D8CFF'
      }
    })
    assert.equal(conflictResponse.statusCode, 409)
    assert.equal((conflictResponse.json() as any).error, 'label_name_conflict')
  } finally {
    await app.close()
  }
})

test('labels routes update/delete not found', async () => {
  const app = buildServer(baseEnv, {
    chatLabelStore: {
      update: async () => null,
      delete: async () => false
    } as any
  })

  try {
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/sessions/s1/labels/missing',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        name: 'Teste',
        colorHex: '#2D8CFF'
      }
    })
    assert.equal(updateResponse.statusCode, 404)
    assert.equal((updateResponse.json() as any).error, 'label_not_found')

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/sessions/s1/labels/missing',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(deleteResponse.statusCode, 404)
    assert.equal((deleteResponse.json() as any).error, 'label_not_found')
  } finally {
    await app.close()
  }
})

test('chat labels set and mark unread routes', async () => {
  let unreadArgs: { sessionId: string; chatId: string } | null = null
  let setArgs: { sessionId: string; chatId: string; labelIds: string[] } | null = null
  const app = buildServer(baseEnv, {
    chatService: {
      markUnread: async (sessionId: string, chatId: string) => {
        unreadArgs = { sessionId, chatId }
      }
    } as any,
    chatLabelStore: {
      setChatLabels: async (sessionId: string, chatId: string, labelIds: string[]) => {
        setArgs = { sessionId, chatId, labelIds }
        return labelIds.map((id) => buildLabel({ id }))
      }
    } as any
  })

  try {
    const unreadResponse = await app.inject({
      method: 'POST',
      url: '/sessions/s1/chats/chat-1/unread',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(unreadResponse.statusCode, 200)
    assert.deepEqual(unreadArgs, { sessionId: 's1', chatId: 'chat-1' })

    const invalidSetResponse = await app.inject({
      method: 'PUT',
      url: '/sessions/s1/chats/chat-1/labels',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        labelIds: 'invalid'
      }
    })
    assert.equal(invalidSetResponse.statusCode, 400)
    assert.equal((invalidSetResponse.json() as any).error, 'label_ids_invalid')

    const setResponse = await app.inject({
      method: 'PUT',
      url: '/sessions/s1/chats/chat-1/labels',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        labelIds: ['label-a', 'label-a', 'label-b']
      }
    })
    assert.equal(setResponse.statusCode, 200)
    assert.deepEqual(setArgs, {
      sessionId: 's1',
      chatId: 'chat-1',
      labelIds: ['label-a', 'label-b']
    })
    assert.equal((setResponse.json() as any).labels.length, 2)
  } finally {
    await app.close()
  }
})

test('chat labels set maps store errors', async () => {
  const app = buildServer(baseEnv, {
    chatLabelStore: {
      setChatLabels: async () => {
        throw new ChatLabelStoreError('chat_label_invalid_ids')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/sessions/s1/chats/chat-1/labels',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        labelIds: ['missing']
      }
    })
    assert.equal(response.statusCode, 400)
    assert.equal((response.json() as any).error, 'chat_label_invalid_ids')
  } finally {
    await app.close()
  }
})
