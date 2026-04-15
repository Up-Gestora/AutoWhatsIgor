export type ParsedScoreAndComment = {
  score: number | null
  comment: string | null
}

export function parseScoreAndComment(text: string): ParsedScoreAndComment {
  const normalized = normalizeOptionalText(text)
  if (!normalized) {
    return { score: null, comment: null }
  }

  const prepared = normalized.replace(/^[\s"'([{]+/, '').trim()
  const patterns = [
    /^(?:minha\s+)?nota(?:\s*(?:é|e|foi|seria))?(?:\s*[:=-]\s*|\s+)?(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i,
    /^(?:dou|dei|daria)\s+(?:nota\s+)?(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i,
    /^(?:foi|é|e)\s+(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i,
    /^(10|0?[1-9])(?:\s*\/\s*10)?(?:\s*[-:;,.)(]+\s*|\s+)?(.*)$/i
  ]

  for (const pattern of patterns) {
    const match = prepared.match(pattern)
    if (!match) {
      continue
    }

    const score = Number(match[1])
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      continue
    }

    return {
      score,
      comment: normalizeComment(match[2] ?? '')
    }
  }

  return { score: null, comment: null }
}

export function isScoreOnlyText(text: string) {
  const parsed = parseScoreAndComment(text)
  return parsed.score !== null && parsed.comment === null
}

export function normalizeComment(value: string): string | null {
  const normalized = value.replace(/^[\s\-:;,.)(]+/, '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return null
  }
  return /[\p{L}\p{N}]/u.test(normalized) ? normalized : null
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
