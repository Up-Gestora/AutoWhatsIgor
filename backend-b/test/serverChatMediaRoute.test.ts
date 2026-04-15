import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatMediaError } from '../src/chats'
import { buildServer } from '../src/server'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

test('chat media route returns binary payload', async () => {
  const app = buildServer(baseEnv, {
    chatMediaService: {
      getMedia: async () => ({
        mediaType: 'imageMessage',
        contentType: 'image/jpeg',
        fileName: 'foto.jpg',
        buffer: Buffer.from([1, 2, 3, 4])
      })
    } as any
  })

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/s1/chats/c1/messages/inbound:10/media',
      headers: { 'x-admin-key': 'admin' }
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'image/jpeg')
    assert.equal(response.headers['content-length'], '4')
    assert.match(String(response.headers['content-disposition'] ?? ''), /inline/i)
    assert.deepEqual(response.rawPayload, Buffer.from([1, 2, 3, 4]))
  } finally {
    await app.close()
  }
})

test('chat media route maps media_unavailable to 410', async () => {
  const app = buildServer(baseEnv, {
    chatMediaService: {
      getMedia: async () => {
        throw new ChatMediaError('media_unavailable')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/s1/chats/c1/messages/inbound:11/media',
      headers: { 'x-admin-key': 'admin' }
    })

    assert.equal(response.statusCode, 410)
    const body = response.json() as any
    assert.equal(body.error, 'media_unavailable')
  } finally {
    await app.close()
  }
})

test('chat media route maps too_large to 413', async () => {
  const app = buildServer(baseEnv, {
    chatMediaService: {
      getMedia: async () => {
        throw new ChatMediaError('too_large')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/s1/chats/c1/messages/outbound:12/media',
      headers: { 'x-admin-key': 'admin' }
    })

    assert.equal(response.statusCode, 413)
    const body = response.json() as any
    assert.equal(body.error, 'too_large')
  } finally {
    await app.close()
  }
})

test('chat media route maps not_found to 404', async () => {
  const app = buildServer(baseEnv, {
    chatMediaService: {
      getMedia: async () => {
        throw new ChatMediaError('not_found')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/sessions/s1/chats/c1/messages/outbound:99/media',
      headers: { 'x-admin-key': 'admin' }
    })

    assert.equal(response.statusCode, 404)
    const body = response.json() as any
    assert.equal(body.error, 'not_found')
  } finally {
    await app.close()
  }
})
