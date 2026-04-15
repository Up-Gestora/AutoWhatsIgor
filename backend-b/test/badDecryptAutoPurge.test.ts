import assert from 'node:assert/strict'
import test from 'node:test'
import { createBadDecryptAutoPurger } from '../src/sessions/badDecryptAutoPurge'

function buildBadDecryptArgs() {
  return [
    { name: 'critical_unblock_low', error: 'Error: error:1C800064:Provider routines::bad decrypt\nstack...' },
    'failed to sync state from version, removing and trying from scratch'
  ]
}

test('createBadDecryptAutoPurger triggers once after threshold within window', () => {
  const triggers: Array<{ count: number; threshold: number; windowMs: number }> = []
  let now = 0

  const purger = createBadDecryptAutoPurger({
    threshold: 3,
    windowMs: 120000,
    nowFn: () => now,
    onTrigger: (event) => {
      triggers.push(event)
    }
  })

  now = 1000
  purger.observe(buildBadDecryptArgs())
  now = 2000
  purger.observe(buildBadDecryptArgs())
  now = 3000
  purger.observe(buildBadDecryptArgs())
  now = 4000
  purger.observe(buildBadDecryptArgs())

  assert.equal(triggers.length, 1)
  assert.equal(triggers[0]?.threshold, 3)
  assert.equal(triggers[0]?.windowMs, 120000)
})

test('createBadDecryptAutoPurger does not trigger when events exceed window', () => {
  const triggers: Array<{ count: number; threshold: number; windowMs: number }> = []
  let now = 0

  const purger = createBadDecryptAutoPurger({
    threshold: 3,
    windowMs: 120000,
    nowFn: () => now,
    onTrigger: (event) => {
      triggers.push(event)
    }
  })

  now = 0
  purger.observe(buildBadDecryptArgs())
  now = 121000
  purger.observe(buildBadDecryptArgs())
  now = 242000
  purger.observe(buildBadDecryptArgs())

  assert.equal(triggers.length, 0)
})

test('createBadDecryptAutoPurger ignores sync logs without bad decrypt', () => {
  const triggers: Array<{ count: number; threshold: number; windowMs: number }> = []

  const purger = createBadDecryptAutoPurger({
    threshold: 1,
    windowMs: 120000,
    nowFn: () => 0,
    onTrigger: (event) => {
      triggers.push(event)
    }
  })

  purger.observe([
    { name: 'critical_unblock_low', error: 'Error: something else' },
    'failed to sync state from version, removing and trying from scratch'
  ])

  assert.equal(triggers.length, 0)
})

