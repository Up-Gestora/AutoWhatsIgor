type UnknownRecord = Record<string, unknown>

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null
}

const readField = (source: UnknownRecord | null, keys: string[]): string => {
  if (!source) return ''
  for (const key of keys) {
    const value = normalizeText(source[key])
    if (value) {
      return value
    }
  }
  return ''
}

const sanitizeTextFallback = (rawText: string): string => {
  const text = rawText.trim()
  if (!text) return ''
  if (/^<!doctype html/i.test(text) || /^<html/i.test(text)) {
    return ''
  }
  return text.slice(0, 240)
}

export const buildHttpErrorMessage = (
  status: number,
  payload: unknown,
  rawText = ''
): string => {
  const record = isRecord(payload) ? payload : null
  const message = readField(record, ['message'])
  const error = readField(record, ['error', 'code'])
  const detail = readField(record, ['detail', 'details', 'reason'])

  if (message) {
    if (detail && !message.includes(detail)) {
      return `${message}: ${detail}`
    }
    return message
  }

  if (error) {
    if (detail && !error.includes(detail)) {
      return `${error}: ${detail}`
    }
    return error
  }

  if (detail) {
    return detail
  }

  const textFallback = sanitizeTextFallback(rawText)
  if (textFallback) {
    return textFallback
  }

  if (status >= 500) {
    return 'Erro interno no servidor. Tente novamente em instantes.'
  }

  return `request_failed_${status}`
}

export const parseResponsePayload = async <T = UnknownRecord>(
  response: Response
): Promise<{ payload: T | null; rawText: string }> => {
  try {
    const payload = (await response.clone().json()) as T
    return { payload, rawText: '' }
  } catch {
    const rawText = await response.text().catch(() => '')
    return { payload: null, rawText }
  }
}

export const extractHttpErrorMessage = async (response: Response): Promise<string> => {
  const { payload, rawText } = await parseResponsePayload(response)
  return buildHttpErrorMessage(response.status, payload, rawText)
}
