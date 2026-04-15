import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from '../src/config/env'

test('loadEnv defaults AI_ENABLED to false when missing', () => {
  const previous = process.env.AI_ENABLED
  try {
    delete process.env.AI_ENABLED
    const env = loadEnv()
    assert.equal(env.AI_ENABLED, false)
  } finally {
    if (previous === undefined) {
      delete process.env.AI_ENABLED
    } else {
      process.env.AI_ENABLED = previous
    }
  }
})

test('loadEnv sets broadcast timeout defaults', () => {
  const previousSuccessTimeout = process.env.BROADCAST_SUCCESS_TIMEOUT_MS
  const previousSendTimeout = process.env.BROADCAST_SEND_TIMEOUT_MS
  const previousDisconnectPauseGrace = process.env.BROADCAST_DISCONNECT_PAUSE_GRACE_MS
  try {
    delete process.env.BROADCAST_SUCCESS_TIMEOUT_MS
    delete process.env.BROADCAST_SEND_TIMEOUT_MS
    delete process.env.BROADCAST_DISCONNECT_PAUSE_GRACE_MS
    const env = loadEnv()
    assert.equal(env.BROADCAST_SUCCESS_TIMEOUT_MS, 120000)
    assert.equal(env.BROADCAST_SEND_TIMEOUT_MS, 30000)
    assert.equal(env.BROADCAST_DISCONNECT_PAUSE_GRACE_MS, 45000)
  } finally {
    if (previousSuccessTimeout === undefined) {
      delete process.env.BROADCAST_SUCCESS_TIMEOUT_MS
    } else {
      process.env.BROADCAST_SUCCESS_TIMEOUT_MS = previousSuccessTimeout
    }
    if (previousSendTimeout === undefined) {
      delete process.env.BROADCAST_SEND_TIMEOUT_MS
    } else {
      process.env.BROADCAST_SEND_TIMEOUT_MS = previousSendTimeout
    }
    if (previousDisconnectPauseGrace === undefined) {
      delete process.env.BROADCAST_DISCONNECT_PAUSE_GRACE_MS
    } else {
      process.env.BROADCAST_DISCONNECT_PAUSE_GRACE_MS = previousDisconnectPauseGrace
    }
  }
})

test('loadEnv sets auto-restore batch defaults', () => {
  const previousBatchSize = process.env.AUTO_RESTORE_BATCH_SIZE
  const previousBatchDelayMs = process.env.AUTO_RESTORE_BATCH_DELAY_MS
  try {
    delete process.env.AUTO_RESTORE_BATCH_SIZE
    delete process.env.AUTO_RESTORE_BATCH_DELAY_MS
    const env = loadEnv()
    assert.equal(env.AUTO_RESTORE_BATCH_SIZE, 0)
    assert.equal(env.AUTO_RESTORE_BATCH_DELAY_MS, 0)
  } finally {
    if (previousBatchSize === undefined) {
      delete process.env.AUTO_RESTORE_BATCH_SIZE
    } else {
      process.env.AUTO_RESTORE_BATCH_SIZE = previousBatchSize
    }
    if (previousBatchDelayMs === undefined) {
      delete process.env.AUTO_RESTORE_BATCH_DELAY_MS
    } else {
      process.env.AUTO_RESTORE_BATCH_DELAY_MS = previousBatchDelayMs
    }
  }
})

test('loadEnv sets AI auto follow-up worker defaults', () => {
  const previousPollMs = process.env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS
  const previousSessionLimit = process.env.AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT
  const previousBatchSize = process.env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE
  const previousLeaseMs = process.env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS
  const previousRetryBaseMs = process.env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS
  const previousRetryMaxMs = process.env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS
  try {
    delete process.env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS
    delete process.env.AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT
    delete process.env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE
    delete process.env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS
    delete process.env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS
    delete process.env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS

    const env = loadEnv()
    assert.equal(env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS, 30000)
    assert.equal(env.AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT, 200)
    assert.equal(env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE, 25)
    assert.equal(env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS, 120000)
    assert.equal(env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS, 300000)
    assert.equal(env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS, 86400000)
  } finally {
    if (previousPollMs === undefined) {
      delete process.env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS
    } else {
      process.env.AI_AUTO_FOLLOWUP_WORKER_POLL_MS = previousPollMs
    }
    if (previousSessionLimit === undefined) {
      delete process.env.AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT
    } else {
      process.env.AI_AUTO_FOLLOWUP_WORKER_SESSION_LIMIT = previousSessionLimit
    }
    if (previousBatchSize === undefined) {
      delete process.env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE
    } else {
      process.env.AI_AUTO_FOLLOWUP_WORKER_BATCH_SIZE = previousBatchSize
    }
    if (previousLeaseMs === undefined) {
      delete process.env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS
    } else {
      process.env.AI_AUTO_FOLLOWUP_WORKER_LEASE_MS = previousLeaseMs
    }
    if (previousRetryBaseMs === undefined) {
      delete process.env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS
    } else {
      process.env.AI_AUTO_FOLLOWUP_RETRY_BASE_MS = previousRetryBaseMs
    }
    if (previousRetryMaxMs === undefined) {
      delete process.env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS
    } else {
      process.env.AI_AUTO_FOLLOWUP_RETRY_MAX_MS = previousRetryMaxMs
    }
  }
})

