export type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

type LoggerOptions = {
  component?: string
  baseMeta?: Record<string, unknown>
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const component = options.component ?? 'app'
  const baseMeta = options.baseMeta ?? {}

  const log = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      component,
      ...baseMeta,
      ...(meta ?? {})
    }

    const line = safeStringify(payload)
    if (level === 'error') {
      console.error(line)
    } else if (level === 'warn') {
      console.warn(line)
    } else {
      console.log(line)
    }
  }

  return {
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta)
  }
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({
      level: 'error',
      message: 'log-serialization-failed',
      error: (error as Error).message
    })
  }
}
