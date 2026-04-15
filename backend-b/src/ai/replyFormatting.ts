const AI_SPLIT_MARKER = '[[__AI_SPLIT__]]'
const GUIDED_TEST_MAX_PARTS = 4
const GUIDED_TEST_MIN_FALLBACK_LENGTH = 220

type FormattedAssistantReply = {
  assistantMessage: string
  assistantParts: string[]
}

export function splitReply(reply: string): string[] {
  const normalized = reply
    .replace(/\[\s*(?:SEPARAR|SEPARATE)\s*\]/gi, `\n${AI_SPLIT_MARKER}\n`)
    .replace(/\*\*\s*(?:SEPARAR|SEPARATE)\s*\*\*/gi, `\n${AI_SPLIT_MARKER}\n`)
    .replace(/^\s*(?:SEPARAR|SEPARATE)\s*$/gim, `\n${AI_SPLIT_MARKER}\n`)

  const parts = normalized
    .split(AI_SPLIT_MARKER)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  return parts.length > 0 ? parts : [reply]
}

export function sanitizeAssistantReplyOutput(value: string): string {
  if (!value) {
    return ''
  }

  const normalized = value.replace(/\r\n/g, '\n')
  const metadataPrefixPattern =
    /^timestampMs=\d{10,}\s*\|\s*iso=[^|]+\|\s*local=[^|]+\|\s*fromMe=(?:true|false)\s*\|\s*origin=[^|\s]+\s*\|\s*actor=[^|\s]+\s*\|\s*channel=[^|\s]+(?:\s*\|\s*status=[^|\s]+)?\s*/i

  const withoutMeta = normalized
    .split('\n')
    .map((line) => {
      const withoutTag = line.replace(/^\s*\[MSG_TIME\]\s*/i, '')
      return withoutTag.replace(metadataPrefixPattern, '').trimStart()
    })
    .filter((line) => line.trim().length > 0)
    .join('\n')

  const withoutDoubleBold = normalizeWhatsAppBold(withoutMeta)
  return withoutDoubleBold.replace(/\n{3,}/g, '\n\n').trim()
}

export function normalizeWhatsAppBold(value: string): string {
  let result = value
  let previous = ''
  while (result !== previous) {
    previous = result
    result = result
      .replace(/\*\*\*([^*\n][^*\n]*?)\*\*\*/g, '*$1*')
      .replace(/\*\*([^*\n][^*\n]*?)\*\*/g, '*$1*')
  }
  return result
}

export function formatAssistantReply(value: string): FormattedAssistantReply {
  const sanitized = sanitizeAssistantReplyOutput(value)
  const assistantParts = splitReply(sanitized)
  return {
    assistantMessage: assistantParts.join('\n\n').trim(),
    assistantParts
  }
}

export function formatGuidedTestAssistantReply(value: string): FormattedAssistantReply {
  const sanitized = sanitizeAssistantReplyOutput(value)
  const explicitParts = splitReply(sanitized)
  const assistantParts =
    explicitParts.length > 1 ? explicitParts : splitGuidedTestFallback(explicitParts[0] ?? sanitized)

  return {
    assistantMessage: assistantParts.join('\n\n').trim(),
    assistantParts
  }
}

function splitGuidedTestFallback(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }
  if (!shouldSplitGuidedFallback(trimmed)) {
    return [trimmed]
  }

  const paragraphParts = splitAndLimit(
    trimmed.split(/\n\s*\n+/).map((part) => part.trim()),
    GUIDED_TEST_MAX_PARTS
  )
  if (paragraphParts.length > 1) {
    return splitTrailingCtaInParts(paragraphParts)
  }

  const numberedParts = splitNumberedBlocks(trimmed)
  if (numberedParts.length > 1) {
    return splitTrailingCtaInParts(numberedParts)
  }

  const questionParts = splitAndLimit(
    trimmed.split(/(?<=\?)\s+(?=(?:[A-ZÀ-ÿ0-9*"'“¿¡]))/u).map((part) => part.trim()),
    GUIDED_TEST_MAX_PARTS
  )
  if (questionParts.length > 1) {
    return splitTrailingCtaInParts(questionParts)
  }

  return splitTrailingCtaInParts([trimmed])
}

function shouldSplitGuidedFallback(value: string): boolean {
  if (value.length >= GUIDED_TEST_MIN_FALLBACK_LENGTH) {
    return true
  }

  const numberedBlocks = value.match(/\b\d+\)\s/g)?.length ?? 0
  if (numberedBlocks >= 2) {
    return true
  }

  const questionCount = value.match(/\?/g)?.length ?? 0
  return questionCount >= 2
}

function splitNumberedBlocks(value: string): string[] {
  const matches = [...value.matchAll(/\b\d+\)\s/g)]
  if (matches.length < 2) {
    return [value]
  }

  const firstIndex = matches[0]?.index ?? -1
  if (firstIndex < 0) {
    return [value]
  }

  const prefix = value.slice(0, firstIndex).trim()
  const parts = matches.map((match, index) => {
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? value.length
    return value.slice(start, end).trim()
  })

  if (prefix) {
    parts[0] = `${prefix}\n${parts[0]}`.trim()
  }

  return splitAndLimit(parts, GUIDED_TEST_MAX_PARTS)
}

function splitTrailingCtaInParts(parts: string[]): string[] {
  if (parts.length === 0) {
    return parts
  }

  const nextParts = [...parts]
  const last = nextParts[nextParts.length - 1] ?? ''
  const splitIndex = findTrailingCtaIndex(last)
  if (
    splitIndex > 0 &&
    splitIndex < last.length &&
    nextParts.length < GUIDED_TEST_MAX_PARTS &&
    splitIndex >= Math.max(24, Math.floor(last.length * 0.25))
  ) {
    const head = last.slice(0, splitIndex).trim()
    const tail = last.slice(splitIndex).trim()
    nextParts.splice(nextParts.length - 1, 1, head, tail)
  }

  return splitAndLimit(nextParts, GUIDED_TEST_MAX_PARTS)
}

function findTrailingCtaIndex(value: string): number {
  const phrases = [
    'se você quiser',
    'se quiser',
    'se preferir',
    'quer',
    'posso',
    'if you want',
    'if you prefer',
    'would you like',
    'can i'
  ]

  const normalized = value.toLocaleLowerCase()
  const cutoff = Math.max(20, Math.floor(value.length * 0.25))
  let bestIndex = -1
  for (const phrase of phrases) {
    let start = normalized.indexOf(phrase)
    while (start >= 0) {
      if (start >= cutoff && (bestIndex === -1 || start < bestIndex)) {
        bestIndex = start
      }
      start = normalized.indexOf(phrase, start + 1)
    }
  }

  return bestIndex
}

function splitAndLimit(parts: string[], maxParts: number): string[] {
  const cleaned = parts.map((part) => part.trim()).filter(Boolean)
  if (cleaned.length <= maxParts) {
    return cleaned
  }

  const head = cleaned.slice(0, maxParts - 1)
  const tail = cleaned.slice(maxParts - 1).join('\n\n').trim()
  return tail ? [...head, tail] : head
}
