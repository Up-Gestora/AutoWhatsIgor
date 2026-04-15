import type { AgendaAvailableHours, AppointmentRecord } from './types'
import { formatHHmm, getDayBoundsUtcMs, getUtcWeekday, parseIsoDate, parseTimeHHmm, toLocalMinutes } from './timezone'

export type AvailabilityBusyItem = {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string | null
}

export type AvailabilitySlot = {
  startTime: string
  endTime: string
}

export type AvailabilityResult = {
  success: true
  date: string
  timezone: string
  businessHoursWindows: Array<[string, string]>
  busy: AvailabilityBusyItem[]
  freeWindows: Array<[string, string]>
  suggestedSlots: AvailabilitySlot[]
}

export function fitsWithinAvailableHours(options: {
  availableHours: AgendaAvailableHours | null
  date: string
  startTime: string
  endTime: string
}): { ok: true } | { ok: false; reason: string } {
  const dateParts = parseIsoDate(options.date)
  if (!dateParts) {
    return { ok: false, reason: 'invalid_date' }
  }
  const start = parseTimeHHmm(options.startTime)
  const end = parseTimeHHmm(options.endTime)
  if (!start || !end) {
    return { ok: false, reason: 'invalid_time' }
  }
  const startMin = start.hour * 60 + start.minute
  const endMin = end.hour * 60 + end.minute
  if (endMin <= startMin) {
    return { ok: false, reason: 'end_before_start' }
  }

  const weekday = getUtcWeekday(dateParts)
  const dayConfig = options.availableHours?.[weekday]
  if (!dayConfig || !dayConfig.enabled || !Array.isArray(dayConfig.timeSlots) || dayConfig.timeSlots.length === 0) {
    return { ok: false, reason: 'day_unavailable' }
  }

  for (const slot of dayConfig.timeSlots) {
    const slotStart = parseTimeHHmm(slot.start)
    const slotEnd = parseTimeHHmm(slot.end)
    if (!slotStart || !slotEnd) {
      continue
    }
    const slotStartMin = slotStart.hour * 60 + slotStart.minute
    const slotEndMin = slotEnd.hour * 60 + slotEnd.minute
    if (startMin >= slotStartMin && endMin <= slotEndMin) {
      return { ok: true }
    }
  }

  return { ok: false, reason: 'outside_available_hours' }
}

export function computeAvailability(options: {
  availableHours: AgendaAvailableHours | null
  appointments: AppointmentRecord[]
  date: string
  timezone: string
  durationMinutes?: number
  granularityMinutes?: number
  maxSuggestions?: number
}): AvailabilityResult | { success: false; error: string } {
  const dateParts = parseIsoDate(options.date)
  if (!dateParts) {
    return { success: false, error: 'invalid_date' }
  }

  const durationMinutes = clampInt(options.durationMinutes ?? 60, 5, 8 * 60)
  const granularityMinutes = clampInt(options.granularityMinutes ?? 30, 5, 120)
  const maxSuggestions = clampInt(options.maxSuggestions ?? 10, 1, 50)

  const weekday = getUtcWeekday(dateParts)
  const dayConfig = options.availableHours?.[weekday]
  const timeSlots = dayConfig?.enabled ? dayConfig?.timeSlots ?? [] : []

  const businessHoursWindows = normalizeWindows(timeSlots)
  if (businessHoursWindows.length === 0) {
    return {
      success: true,
      date: options.date,
      timezone: options.timezone,
      businessHoursWindows: [],
      busy: [],
      freeWindows: [],
      suggestedSlots: []
    }
  }

  const { startUtcMs, endUtcMs } = getDayBoundsUtcMs(dateParts, options.timezone)

  const busyIntervals = buildBusyIntervals({
    appointments: options.appointments,
    timezone: options.timezone,
    dayStartUtcMs: startUtcMs,
    dayEndUtcMs: endUtcMs
  })
  const busyMerged = mergeIntervals(busyIntervals.intervals)

  const freeWindowsMin = subtractBusyFromWindows(businessHoursWindows, busyMerged)
  const freeWindows = freeWindowsMin.map(([start, end]) => [formatHHmm(start), formatHHmm(end)] as [string, string])

  const suggestedSlots = suggestSlots({
    freeWindows: freeWindowsMin,
    durationMinutes,
    granularityMinutes,
    maxSuggestions
  }).map(([start, end]) => ({ startTime: formatHHmm(start), endTime: formatHHmm(end) }))

  return {
    success: true,
    date: options.date,
    timezone: options.timezone,
    businessHoursWindows: businessHoursWindows.map(([s, e]) => [formatHHmm(s), formatHHmm(e)] as [string, string]),
    busy: busyIntervals.items,
    freeWindows,
    suggestedSlots
  }
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeWindows(timeSlots: Array<{ start: string; end: string }>): Array<[number, number]> {
  const windows: Array<[number, number]> = []
  for (const slot of timeSlots) {
    const start = parseTimeHHmm(slot.start)
    const end = parseTimeHHmm(slot.end)
    if (!start || !end) {
      continue
    }
    const startMin = start.hour * 60 + start.minute
    const endMin = end.hour * 60 + end.minute
    if (endMin <= startMin) {
      continue
    }
    windows.push([startMin, endMin])
  }
  windows.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return windows
}

function buildBusyIntervals(options: {
  appointments: AppointmentRecord[]
  timezone: string
  dayStartUtcMs: number
  dayEndUtcMs: number
}): { intervals: Array<[number, number]>; items: AvailabilityBusyItem[] } {
  const intervals: Array<[number, number]> = []
  const items: AvailabilityBusyItem[] = []

  for (const apt of options.appointments) {
    const status = (apt.status ?? '').trim().toLowerCase()
    if (status === 'cancelado') {
      continue
    }
    const effectiveStart = Math.max(options.dayStartUtcMs, apt.startMs)
    const effectiveEnd = Math.min(options.dayEndUtcMs, apt.endMs)
    if (effectiveEnd <= effectiveStart) {
      continue
    }

    const startMin = clampMinutes(toLocalMinutes(effectiveStart, options.timezone))
    const endMin = clampMinutes(toLocalMinutes(effectiveEnd, options.timezone))
    if (endMin <= startMin) {
      continue
    }
    intervals.push([startMin, endMin])
    items.push({
      id: apt.id,
      title: apt.title,
      startTime: formatHHmm(startMin),
      endTime: formatHHmm(endMin),
      status: apt.status ?? null
    })
  }

  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  items.sort((a, b) => a.startTime.localeCompare(b.startTime))

  return { intervals, items }
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1440, Math.round(value)))
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) {
    return []
  }
  const merged: Array<[number, number]> = []
  let [currentStart, currentEnd] = intervals[0]
  for (let i = 1; i < intervals.length; i += 1) {
    const [start, end] = intervals[i]
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end)
    } else {
      merged.push([currentStart, currentEnd])
      currentStart = start
      currentEnd = end
    }
  }
  merged.push([currentStart, currentEnd])
  return merged
}

function subtractBusyFromWindows(
  windows: Array<[number, number]>,
  busy: Array<[number, number]>
): Array<[number, number]> {
  if (windows.length === 0) {
    return []
  }
  if (busy.length === 0) {
    return windows.slice()
  }

  const result: Array<[number, number]> = []
  for (const [winStart, winEnd] of windows) {
    let cursor = winStart
    for (const [busyStart, busyEnd] of busy) {
      if (busyEnd <= cursor) {
        continue
      }
      if (busyStart >= winEnd) {
        break
      }
      if (busyStart > cursor) {
        result.push([cursor, Math.min(busyStart, winEnd)])
      }
      cursor = Math.max(cursor, busyEnd)
      if (cursor >= winEnd) {
        break
      }
    }
    if (cursor < winEnd) {
      result.push([cursor, winEnd])
    }
  }
  return result.filter(([start, end]) => end > start)
}

function suggestSlots(options: {
  freeWindows: Array<[number, number]>
  durationMinutes: number
  granularityMinutes: number
  maxSuggestions: number
}): Array<[number, number]> {
  const suggestions: Array<[number, number]> = []
  for (const [start, end] of options.freeWindows) {
    for (let cursor = start; cursor + options.durationMinutes <= end; cursor += options.granularityMinutes) {
      suggestions.push([cursor, cursor + options.durationMinutes])
      if (suggestions.length >= options.maxSuggestions) {
        return suggestions
      }
    }
  }
  return suggestions
}

