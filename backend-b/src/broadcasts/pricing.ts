export const BROADCAST_BILLING_BLOCK_SIZE = 10
export const BROADCAST_BILLING_BLOCK_COST_BRL = 0.01

export function calculateBroadcastBilledBlocks(sentCount: number): number {
  const safeSent = Number.isFinite(sentCount) ? Math.max(0, Math.floor(sentCount)) : 0
  return Math.floor(safeSent / BROADCAST_BILLING_BLOCK_SIZE)
}

export function calculateBroadcastCostForBlocksBrl(blocks: number): number {
  const safeBlocks = Number.isFinite(blocks) ? Math.max(0, Math.floor(blocks)) : 0
  return safeBlocks * BROADCAST_BILLING_BLOCK_COST_BRL
}
