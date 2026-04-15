import assert from 'node:assert/strict'
import test from 'node:test'
import { buildServer } from '../src/server'

function buildJob(status: 'running' | 'paused' | 'cancelled' = 'running') {
  return {
    id: 'job-1',
    sessionId: 'session-1',
    listId: 'list-1',
    status,
    pauseReason: status === 'paused' ? 'manual_pause' : null,
    payload: { type: 'text', text: 'oi' },
    totalCount: 10,
    sentCount: 2,
    failedCount: 1,
    chargedBlocks: 0,
    createdAt: 1,
    updatedAt: 1,
    startedAt: null,
    completedAt: status === 'cancelled' ? 1 : null,
    nextSendAt: null
  }
}

const baseEnv = {
  LOG_LEVEL: 'fatal',
  ALLOWED_ORIGINS: '*',
  ADMIN_API_KEY: 'admin'
} as any

test('broadcast pause route returns paused job and 404 when not running', async () => {
  const app = buildServer(baseEnv, {
    broadcastJobStore: {
      pauseJobById: async (_sessionId: string, jobId: string) => (jobId === 'job-1' ? buildJob('paused') : null)
    } as any
  })

  try {
    const success = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts/job-1/pause',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(success.statusCode, 200)
    const successBody = success.json() as any
    assert.equal(successBody.success, true)
    assert.equal(successBody.job.status, 'paused')

    const notFound = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts/job-2/pause',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(notFound.statusCode, 404)
    const notFoundBody = notFound.json() as any
    assert.equal(notFoundBody.error, 'broadcast_job_not_found_or_not_running')
  } finally {
    await app.close()
  }
})

test('broadcast resume route resumes paused jobs first', async () => {
  let resumeCancelledCalls = 0
  const app = buildServer(baseEnv, {
    broadcastJobStore: {
      resumeJob: async () => buildJob('running'),
      resumeCancelledJobFromCancelledItems: async () => {
        resumeCancelledCalls += 1
        return buildJob('running')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts/job-1/resume',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.job.status, 'running')
    assert.equal(resumeCancelledCalls, 0)
  } finally {
    await app.close()
  }
})

test('broadcast resume route falls back to cancelled items flow', async () => {
  let resumeCancelledCalls = 0
  const app = buildServer(baseEnv, {
    broadcastJobStore: {
      resumeJob: async () => null,
      resumeCancelledJobFromCancelledItems: async () => {
        resumeCancelledCalls += 1
        return buildJob('running')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts/job-1/resume',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 200)
    const body = response.json() as any
    assert.equal(body.success, true)
    assert.equal(body.job.status, 'running')
    assert.equal(resumeCancelledCalls, 1)
  } finally {
    await app.close()
  }
})

test('broadcast resume route returns 404 when job is not resumable', async () => {
  const app = buildServer(baseEnv, {
    broadcastJobStore: {
      resumeJob: async () => null,
      resumeCancelledJobFromCancelledItems: async () => null
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts/job-1/resume',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 404)
    const body = response.json() as any
    assert.equal(body.error, 'broadcast_job_not_found_or_not_resumable')
  } finally {
    await app.close()
  }
})

test('broadcast resume route returns 409 on active job conflict', async () => {
  const app = buildServer(baseEnv, {
    broadcastJobStore: {
      resumeJob: async () => null,
      resumeCancelledJobFromCancelledItems: async () => {
        throw new Error('broadcast_job_active_exists')
      }
    } as any
  })

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/sessions/session-1/broadcasts/job-1/resume',
      headers: { 'x-admin-key': 'admin' }
    })
    assert.equal(response.statusCode, 409)
    const body = response.json() as any
    assert.equal(body.error, 'broadcast_job_active_exists')
  } finally {
    await app.close()
  }
})
