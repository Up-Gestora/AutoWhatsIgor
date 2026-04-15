import { extractPhoneDigitsFromJid } from './ids'

export function resolveWhatsappFromCandidates(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate)
    if (normalized) {
      return normalized
    }
  }
  return null
}

function normalizeCandidate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const fromJid = extractPhoneDigitsFromJid(trimmed)
  if (fromJid) {
    return fromJid
  }

  if (trimmed.includes('@')) {
    return null
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) {
    return null
  }
  return digits
}
