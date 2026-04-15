import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function makeRecord(payload: unknown) {
  const now = Date.now()
  return {
    id: 1,
    sessionId: 's1',
    chatId: 'c1',
    requestId: undefined,
    payloadHash: 'hash',
    status: 'queued',
    attempts: 0,
    messageId: null,
    error: null,
    payload,
    createdAtMs: now,
    updatedAtMs: now
  }
}

test('messages send route accepts text payload', async () => {
  let textPayload: any = null
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueText: async (payload: any) => {
        textPayload = payload
        return makeRecord({ type: 'text', text: payload.text, origin: payload.origin })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1',
        text: 'Olá'
      }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(textPayload?.text, 'Olá')
    assert.equal(textPayload?.origin, 'automation_api')
  } finally {
    await app.close()
  }
})

test('messages send route accepts explicit human_dashboard origin', async () => {
  let textPayload: any = null
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueText: async (payload: any) => {
        textPayload = payload
        return makeRecord({ type: 'text', text: payload.text, origin: payload.origin })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1',
        text: 'Ol\u00e1 do painel',
        origin: 'human_dashboard'
      }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(textPayload?.origin, 'human_dashboard')
  } finally {
    await app.close()
  }
})

test('messages send route rejects invalid origin', async () => {
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueText: async () => makeRecord({ type: 'text', text: 'x' })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1',
        text: 'teste',
        origin: 'manual'
      }
    })

    assert.equal(response.statusCode, 400)
    const body = response.json() as any
    assert.equal(body.error, 'invalid_origin')
  } finally {
    await app.close()
  }
})

test('messages send route accepts media payload with ttl policy', async () => {
  let mediaPayload: any = null
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueMedia: async (payload: any) => {
        mediaPayload = payload
        return makeRecord({
          type: 'media',
          mediaType: payload.mediaType,
          url: payload.url
        })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1',
        text: 'Legenda',
        media: {
          url: 'https://example.com/file.jpg',
          mimeType: 'image/jpeg',
          storagePolicy: 'ttl_15d'
        }
      }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(mediaPayload?.url, 'https://example.com/file.jpg')
    assert.equal(mediaPayload?.mediaType, 'imageMessage')
    assert.equal(mediaPayload?.caption, 'Legenda')
    assert.equal(mediaPayload?.storagePolicy, 'ttl_15d')
  } finally {
    await app.close()
  }
})

test('messages send route accepts contact payload', async () => {
  let contactPayload: any = null
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueContact: async (payload: any) => {
        contactPayload = payload
        return makeRecord({
          type: 'contact',
          contacts: payload.contacts
        })
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1',
        contact: {
          displayName: 'Comercial',
          contacts: [{ name: 'Vendas', whatsapp: '+55 11 99999-0000' }]
        }
      }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(contactPayload?.displayName, 'Comercial')
    assert.deepEqual(contactPayload?.contacts, [{ name: 'Vendas', whatsapp: '+55 11 99999-0000' }])
  } finally {
    await app.close()
  }
})

test('messages send route rejects empty payload', async () => {
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueText: async () => makeRecord({ type: 'text', text: 'x' })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1'
      }
    })

    assert.equal(response.statusCode, 400)
    const body = response.json() as any
    assert.equal(body.error, 'message_required')
  } finally {
    await app.close()
  }
})

test('messages send route rejects media/contact conflict', async () => {
  const app = buildServer(baseEnv, {
    outboundService: {
      enqueueText: async () => makeRecord({ type: 'text', text: 'x' })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/messages/send',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        sessionId: 's1',
        chatId: 'c1',
        media: { url: 'https://example.com/file.pdf' },
        contact: { contacts: [{ name: 'A', whatsapp: '5511999999999' }] }
      }
    })

    assert.equal(response.statusCode, 400)
    const body = response.json() as any
    assert.equal(body.error, 'media_contact_conflict')
  } finally {
    await app.close()
  }
})
