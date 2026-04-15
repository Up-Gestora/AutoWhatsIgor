import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'
import { QuickReplyStoreError } from '../src/quickReplies'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildQuickReply(overrides: Record<string, unknown> = {}) {
  return {
    id: 'qr-1',
    sessionId: 's1',
    shortcut: 'valores',
    content: 'Tabela de valores',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

test('quick replies route lists configured quick replies', async () => {
  let capturedLimit: number | undefined
  const app = buildServer(baseEnv, {
    quickReplyStore: {
      listBySession: async (_sessionId: string, limit: number) => {
        capturedLimit = limit
        return [buildQuickReply()]
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/s1/quick-replies',
      headers: { 'x-admin-key': 'admin' }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.quickReplies.length, 1)
    assert.equal(capturedLimit, 200)
  } finally {
    await app.close()
  }
})

test('quick replies create returns normalized shortcut', async () => {
  let capturedShortcut: string | null = null
  const app = buildServer(baseEnv, {
    quickReplyStore: {
      create: async (payload: any) => {
        capturedShortcut = payload.shortcut
        return buildQuickReply({
          id: payload.id,
          sessionId: payload.sessionId,
          shortcut: String(payload.shortcut).trim().replace(/^\/+/, '').toLowerCase(),
          content: payload.content
        })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/quick-replies',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        shortcut: '/Valores',
        content: 'Pizza X custa Z'
      }
    })

    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.quickReply.shortcut, 'valores')
    assert.equal(capturedShortcut, '/Valores')
  } finally {
    await app.close()
  }
})

test('quick replies create maps validation and limit errors', async () => {
  const app = buildServer(baseEnv, {
    quickReplyStore: {
      create: async (payload: any) => {
        if (payload.shortcut === 'bad') {
          throw new QuickReplyStoreError('shortcut_invalid_format')
        }
        throw new QuickReplyStoreError('quick_replies_limit_reached')
      }
    } as any
  })

  try {
    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/sessions/s1/quick-replies',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        shortcut: 'bad',
        content: 'x'
      }
    })
    assert.equal(invalidResponse.statusCode, 400)
    assert.equal((invalidResponse.json() as any).error, 'shortcut_invalid_format')

    const limitResponse = await app.inject({
      method: 'POST',
      url: '/sessions/s1/quick-replies',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        shortcut: 'ok',
        content: 'x'
      }
    })
    assert.equal(limitResponse.statusCode, 400)
    assert.equal((limitResponse.json() as any).error, 'quick_replies_limit_reached')
  } finally {
    await app.close()
  }
})

test('quick replies create maps shortcut conflict', async () => {
  const app = buildServer(baseEnv, {
    quickReplyStore: {
      create: async () => {
        throw new QuickReplyStoreError('quick_reply_shortcut_conflict')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/s1/quick-replies',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        shortcut: '/valores',
        content: 'x'
      }
    })

    assert.equal(response.statusCode, 409)
    assert.equal((response.json() as any).error, 'quick_reply_shortcut_conflict')
  } finally {
    await app.close()
  }
})

test('quick replies patch updates and returns not_found when missing', async () => {
  const app = buildServer(baseEnv, {
    quickReplyStore: {
      update: async (_payload: any) => {
        if (_payload.id === 'missing') {
          return null
        }
        return buildQuickReply({ id: _payload.id, shortcut: 'novo_atalho', content: 'Novo conteudo' })
      }
    } as any
  })

  try {
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/sessions/s1/quick-replies/qr-2',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        shortcut: '/novo_atalho',
        content: 'Novo conteudo'
      }
    })
    assert.equal(updateResponse.statusCode, 200)
    assert.equal((updateResponse.json() as any).quickReply.shortcut, 'novo_atalho')

    const missingResponse = await app.inject({
      method: 'PATCH',
      url: '/sessions/s1/quick-replies/missing',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        shortcut: '/novo_atalho',
        content: 'Novo conteudo'
      }
    })
    assert.equal(missingResponse.statusCode, 404)
    assert.equal((missingResponse.json() as any).error, 'quick_reply_not_found')
  } finally {
    await app.close()
  }
})

test('quick replies delete removes and returns not_found when missing', async () => {
  const app = buildServer(baseEnv, {
    quickReplyStore: {
      delete: async (_sessionId: string, id: string) => id !== 'missing'
    } as any
  })

  try {
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: '/sessions/s1/quick-replies/qr-3',
      headers: {
        'x-admin-key': 'admin'
      }
    })
    assert.equal(deleteResponse.statusCode, 200)
    assert.equal((deleteResponse.json() as any).success, true)

    const missingResponse = await app.inject({
      method: 'DELETE',
      url: '/sessions/s1/quick-replies/missing',
      headers: {
        'x-admin-key': 'admin'
      }
    })
    assert.equal(missingResponse.statusCode, 404)
    assert.equal((missingResponse.json() as any).error, 'quick_reply_not_found')
  } finally {
    await app.close()
  }
})
