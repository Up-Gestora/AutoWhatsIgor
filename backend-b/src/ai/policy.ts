import type { AiBusinessHours } from './types'

export type OptOutDecision = {
  action: 'opt_out' | 'opt_in' | 'none'
  keyword?: string
}

export function evaluateOptOut(text: string, optOut: string[], optIn: string[]): OptOutDecision {
  const normalized = normalizeText(text)

  for (const keyword of optIn) {
    if (keyword && normalized.includes(normalizeText(keyword))) {
      return { action: 'opt_in', keyword }
    }
  }

  for (const keyword of optOut) {
    if (keyword && normalized.includes(normalizeText(keyword))) {
      return { action: 'opt_out', keyword }
    }
  }

  return { action: 'none' }
}

export function isWithinBusinessHours(timestampMs: number, businessHours?: AiBusinessHours): boolean {
  if (!businessHours) {
    return true
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: businessHours.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(timestampMs))

  const weekdayRaw = parts.find((part) => part.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  const minutes = hour * 60 + minute

  const weekday = mapWeekday(weekdayRaw)
  if (!weekday) {
    return true
  }

  const windows = businessHours.days[weekday] ?? []
  if (windows.length === 0) {
    return false
  }

  for (const [start, end] of windows) {
    const startMin = parseTime(start)
    const endMin = parseTime(end)
    if (startMin === null || endMin === null) {
      continue
    }

    if (startMin <= endMin) {
      if (minutes >= startMin && minutes < endMin) {
        return true
      }
    } else {
      if (minutes >= startMin || minutes < endMin) {
        return true
      }
    }
  }

  return false
}

export function parseBusinessHours(raw?: string, timezoneFallback?: string): AiBusinessHours | undefined {
  if (!raw) {
    return undefined
  }

  const trimmed = raw.trim()
  if (!trimmed || trimmed.toLowerCase() === 'off' || trimmed.toLowerCase() === 'disabled') {
    return undefined
  }

  try {
    const parsed = JSON.parse(trimmed) as AiBusinessHours
    if (!parsed || typeof parsed !== 'object') {
      return undefined
    }

    const timezone = parsed.timezone || timezoneFallback || 'UTC'
    const days = parsed.days && typeof parsed.days === 'object' ? parsed.days : {}
    return {
      timezone,
      days: days as Record<string, Array<[string, string]>>
    }
  } catch {
    return undefined
  }
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function parseTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null
  }
  return hour * 60 + minute
}

function mapWeekday(raw: string) {
  const value = raw.slice(0, 3).toLowerCase()
  switch (value) {
    case 'mon':
      return 'mon'
    case 'tue':
      return 'tue'
    case 'wed':
      return 'wed'
    case 'thu':
      return 'thu'
    case 'fri':
      return 'fri'
    case 'sat':
      return 'sat'
    case 'sun':
      return 'sun'
    default:
      return null
  }
}
