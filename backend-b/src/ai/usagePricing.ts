import type { AiPricing, AiTokenUsage } from './types'

export type UsageCostResult = {
  costUsd: number
  costBrl: number
  pricingMissing: boolean
}

const MILLION = 1_000_000

export function calculateUsageCost(
  usage: AiTokenUsage,
  model: string,
  pricing: AiPricing,
  usdBrlRate: number
): UsageCostResult {
  const entry = pricing.models[model]
  if (!entry || !isFiniteNumber(entry.inputUsdPerM) || !isFiniteNumber(entry.outputUsdPerM)) {
    return { costUsd: 0, costBrl: 0, pricingMissing: true }
  }

  const inputCost = (usage.promptTokens / MILLION) * entry.inputUsdPerM
  const outputCost = (usage.completionTokens / MILLION) * entry.outputUsdPerM
  const costUsd = inputCost + outputCost
  const rate = isFiniteNumber(usdBrlRate) && usdBrlRate > 0 ? usdBrlRate : 0
  const costBrl = rate > 0 ? costUsd * rate : 0

  return {
    costUsd,
    costBrl,
    pricingMissing: false
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
