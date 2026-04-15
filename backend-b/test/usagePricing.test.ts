import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateUsageCost } from '../src/ai/usagePricing'
import type { AiPricing, AiTokenUsage } from '../src/ai/types'

test('calculateUsageCost returns cost for known model', () => {
  const usage: AiTokenUsage = {
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500
  }
  const pricing: AiPricing = {
    models: {
      'gpt-5.2': {
        inputUsdPerM: 5,
        outputUsdPerM: 15
      }
    }
  }

  const result = calculateUsageCost(usage, 'gpt-5.2', pricing, 5)
  assert.equal(result.pricingMissing, false)
  assert.equal(result.costUsd.toFixed(6), '0.012500')
  assert.equal(result.costBrl.toFixed(6), '0.062500')
})

test('calculateUsageCost flags missing pricing', () => {
  const usage: AiTokenUsage = {
    promptTokens: 200,
    completionTokens: 100,
    totalTokens: 300
  }
  const pricing: AiPricing = { models: {} }

  const result = calculateUsageCost(usage, 'gpt-5.2', pricing, 5)
  assert.equal(result.pricingMissing, true)
  assert.equal(result.costUsd, 0)
  assert.equal(result.costBrl, 0)
})
