import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BROADCAST_BILLING_BLOCK_COST_BRL,
  BROADCAST_BILLING_BLOCK_SIZE,
  calculateBroadcastBilledBlocks,
  calculateBroadcastCostForBlocksBrl
} from '../src/broadcasts/pricing'

test('broadcast pricing bills one block every ten sent messages', () => {
  const cases = [
    { sent: 0, expectedBlocks: 0 },
    { sent: 1, expectedBlocks: 0 },
    { sent: 9, expectedBlocks: 0 },
    { sent: 10, expectedBlocks: 1 },
    { sent: 19, expectedBlocks: 1 },
    { sent: 20, expectedBlocks: 2 },
    { sent: 27, expectedBlocks: 2 }
  ]

  for (const entry of cases) {
    assert.equal(calculateBroadcastBilledBlocks(entry.sent), entry.expectedBlocks)
  }
})

test('broadcast pricing computes BRL cost from billed blocks', () => {
  assert.equal(BROADCAST_BILLING_BLOCK_SIZE, 10)
  assert.equal(BROADCAST_BILLING_BLOCK_COST_BRL, 0.01)
  assert.equal(calculateBroadcastCostForBlocksBrl(0), 0)
  assert.equal(calculateBroadcastCostForBlocksBrl(1), 0.01)
  assert.equal(calculateBroadcastCostForBlocksBrl(2), 0.02)
})
