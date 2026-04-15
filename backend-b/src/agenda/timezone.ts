type DateParts = {
  year: number
  month: number
  day: number
}

type DateTimeParts = DateParts & {
  hour: number
  minute: number
}

export function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  if (month < 1 || month > 12) {
    return null
  }
  if (day < 1 || day > 31) {
    return null
  }
  return { year, month, day }
}

export function parseTimeHHmm(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) {
    return null
  }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null
  }
  if (hour < 0 || hour > 23) {
    return null
  }
  if (minute < 0 || minute > 59) {
    return null
  }
  return { hour, minute }
}

export function formatHHmm(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(totalMinutes)))
  const hour = Math.floor(safe / 60)
  const minute = safe % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function addDays(parts: DateParts, deltaDays: number): DateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  }
}

export function getUtcWeekday(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

export function getZonedParts(timestampMs: number, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(timestampMs))

  const get = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  }
}

export function toLocalMinutes(timestampMs: number, timeZone: string): number {
  const parts = getZonedParts(timestampMs, timeZone)
  return parts.hour * 60 + parts.minute
}

export function zonedTimeToUtcMs(parts: DateTimeParts, timeZone: string): number {
  // Algorithm similar to date-fns-tz zonedTimeToUtc: start with a UTC guess and
  // iteratively correct based on the timezone-formatted parts.
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  let utc = new Date(desiredAsUtc)

  for (let i = 0; i < 3; i += 1) {
    const actual = getZonedParts(utc.getTime(), timeZone)
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    const diff = desiredAsUtc - actualAsUtc
    if (diff === 0) {
      break
    }
    utc = new Date(utc.getTime() + diff)
  }

  return utc.getTime()
}

export function getDayBoundsUtcMs(date: DateParts, timeZone: string): { startUtcMs: number; endUtcMs: number } {
  const startUtcMs = zonedTimeToUtcMs({ ...date, hour: 0, minute: 0 }, timeZone)
  const next = addDays(date, 1)
  const endUtcMs = zonedTimeToUtcMs({ ...next, hour: 0, minute: 0 }, timeZone)
  return { startUtcMs, endUtcMs }
}

