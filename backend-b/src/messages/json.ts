import crypto from 'crypto'

const MAX_DEPTH = 20

export function sanitizeForJson(value: unknown): unknown {
  const seen = new WeakSet<object>()

  const walk = (input: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) {
      return '[Truncated]'
    }

    if (input === null || input === undefined) {
      return input
    }

    if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
      return input
    }

    if (typeof input === 'bigint') {
      return input.toString()
    }

    if (input instanceof Date) {
      return input.toISOString()
    }

    if (Buffer.isBuffer(input)) {
      return input.toString('base64')
    }

    if (typeof input === 'object') {
      const obj = input as object
      if (seen.has(obj)) {
        return '[Circular]'
      }
      seen.add(obj)

      const maybeJson = (input as { toJSON?: () => unknown }).toJSON
      if (typeof maybeJson === 'function') {
        return walk(maybeJson.call(input), depth + 1)
      }

      if (Array.isArray(input)) {
        return input.map((item) => walk(item, depth + 1))
      }

      const record = input as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(record)) {
        out[key] = walk(val, depth + 1)
      }
      return out
    }

    return String(input)
  }

  return walk(value, 0)
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value !== 'object') {
    const serialized = JSON.stringify(value)
    return serialized ?? 'null'
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const body = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')
  return `{${body}}`
}

export function hashPayload(value: unknown): string {
  const sanitized = sanitizeForJson(value)
  const stable = stableStringify(sanitized)
  return crypto.createHash('sha256').update(stable).digest('hex')
}
