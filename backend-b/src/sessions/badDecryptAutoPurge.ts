type AutoPurgeTrigger = {
  count: number
  threshold: number
  windowMs: number
}

export function createBadDecryptAutoPurger(options: {
  threshold: number
  windowMs: number
  nowFn?: () => number
  onTrigger: (event: AutoPurgeTrigger) => void
}): { observe: (args: unknown[]) => void } {
  const threshold = Math.max(1, Math.floor(options.threshold))
  const windowMs = Math.max(1, Math.floor(options.windowMs))
  const nowFn = options.nowFn ?? (() => Date.now())

  const events: number[] = []
  let triggered = false

  const observe = (args: unknown[]) => {
    if (triggered) {
      return
    }

    if (!isBadDecryptSyncLog(args)) {
      return
    }

    const now = nowFn()
    events.push(now)
    const cutoff = now - windowMs
    while (events.length > 0 && events[0] < cutoff) {
      events.shift()
    }

    if (events.length >= threshold) {
      triggered = true
      options.onTrigger({ count: events.length, threshold, windowMs })
    }
  }

  return { observe }
}

function isBadDecryptSyncLog(args: unknown[]): boolean {
  if (!Array.isArray(args) || args.length === 0) {
    return false
  }

  const hasMessage = args.some(
    (arg) =>
      typeof arg === 'string' && arg.toLowerCase().includes('failed to sync state from version')
  )
  if (!hasMessage) {
    return false
  }

  for (const arg of args) {
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
      continue
    }

    const errorValue = (arg as { error?: unknown }).error
    const errorText = toErrorText(errorValue)
    if (errorText && errorText.toLowerCase().includes('bad decrypt')) {
      return true
    }
  }

  return false
}

function toErrorText(value: unknown): string | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return value.stack ?? value.message
  }
  if (typeof value === 'object') {
    const stack = (value as { stack?: unknown }).stack
    if (typeof stack === 'string') {
      return stack
    }
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }

  return undefined
}

