import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'
import type { BroadcastMessagePayload } from '../src/broadcasts/types'

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

function buildJob(payload: BroadcastMessagePayload) {
  return {
    id: 'job-1',
    sessionId: 'session-1',
    listId: 'list-1',
    status: 'running',
    pauseReason: null,
    payload,
    totalCount: 1,
    sentCount: 0,
    failedCount: 0,
    chargedBlocks: 0,
    createdAt: 1,
    updatedAt: 1,
    startedAt: null,
    completedAt: null,
    nextSendAt: 1
  }
}

test('broadcast create route defaults removeContactIfLastMessageUndelivered to true', async () => {
  let capturedPayload: BroadcastMessagePayload | null = null
  const app = buildServer(baseEnv, {
    broadcastListStore: {
      getList: async () => ({ id: 'list-1' })
    } as any,
    broadcastJobStore: {
      createJobFromList: async (_input: {
        sessionId: string
        jobId: string
        listId: string
        payload: BroadcastMessagePayload
      }) => {
        capturedPayload = _input.payload
        return buildJob(_input.payload)
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        listId: 'list-1',
        text: 'Oi'
      }
    })

    assert.equal(response.statusCode, 200)
    assert.ok(capturedPayload)
    assert.equal((capturedPayload as any).removeContactIfLastMessageUndelivered, true)
  } finally {
    await app.close()
  }
})

test('broadcast create route keeps removeContactIfLastMessageUndelivered=false when provided', async () => {
  let capturedPayload: BroadcastMessagePayload | null = null
  const app = buildServer(baseEnv, {
    broadcastListStore: {
      getList: async () => ({ id: 'list-1' })
    } as any,
    broadcastJobStore: {
      createJobFromList: async (_input: {
        sessionId: string
        jobId: string
        listId: string
        payload: BroadcastMessagePayload
      }) => {
        capturedPayload = _input.payload
        return buildJob(_input.payload)
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts',
      headers: {
        'x-admin-key': 'admin',
        'content-type': 'application/json'
      },
      payload: {
        listId: 'list-1',
        text: 'Oi',
        removeContactIfLastMessageUndelivered: false
      }
    })

    assert.equal(response.statusCode, 200)
    assert.ok(capturedPayload)
    assert.equal((capturedPayload as any).removeContactIfLastMessageUndelivered, false)
  } finally {
    await app.close()
  }
})