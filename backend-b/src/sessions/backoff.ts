export function computeBackoffMs(failureCount: number, baseMs: number, maxMs: number) {
  if (failureCount <= 0) {
    return 0
  }

  const exponent = Math.max(0, failureCount - 1)
  const delay = baseMs * Math.pow(2, exponent)
  return Math.min(maxMs, delay)
}
