import crypto from 'node:crypto'
import type { AgendaStore, AgendaCreateAppointmentInput, AgendaCreateAppointmentResult, AgendaListAppointmentsByDayInput } from './store'
import type { AgendaAvailableHours, AgendaRecord, AppointmentRecord } from './types'
import { admin, getFirestoreAdmin } from '../firebase/admin'
import { getDayBoundsUtcMs, parseIsoDate } from './timezone'

const PREVIOUS_DAY_SCAN_LIMIT = 200

function toMillis(value: unknown): number | null {
  if (!value) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (typeof value === 'object') {
    const asAny = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number }
    if (typeof asAny.toMillis === 'function') {
      return asAny.toMillis()
    }
    if (typeof asAny.seconds === 'number') {
      const nanos = typeof asAny.nanoseconds === 'number' ? asAny.nanoseconds : 0
      return asAny.seconds * 1000 + Math.floor(nanos / 1e6)
    }
  }
  return null
}

function normalizeAvailableHours(value: unknown): AgendaAvailableHours | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const raw = value as Record<string, unknown>
  const result: AgendaAvailableHours = {}
  for (const [dayKey, dayValue] of Object.entries(raw)) {
    const dayNum = Number(dayKey)
    if (!Number.isFinite(dayNum) || dayNum < 0 || dayNum > 6) {
      continue
    }
    if (!dayValue || typeof dayValue !== 'object' || Array.isArray(dayValue)) {
      continue
    }
    const dayObj = dayValue as Record<string, unknown>
    const enabled = dayObj.enabled === true
    const timeSlotsRaw = Array.isArray(dayObj.timeSlots) ? dayObj.timeSlots : []
    const timeSlots = timeSlotsRaw
      .map((slot) => {
        if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
          return null
        }
        const slotObj = slot as Record<string, unknown>
        const start = typeof slotObj.start === 'string' ? slotObj.start.trim() : ''
        const end = typeof slotObj.end === 'string' ? slotObj.end.trim() : ''
        if (!start || !end) {
          return null
        }
        return { start, end }
      })
      .filter(Boolean) as Array<{ start: string; end: string }>

    result[dayNum] = { enabled, timeSlots }
  }

  return Object.keys(result).length > 0 ? result : null
}

function isSchedulableHours(hours: AgendaAvailableHours | null): boolean {
  if (!hours) {
    return false
  }
  return Object.values(hours).some((day) => day.enabled && Array.isArray(day.timeSlots) && day.timeSlots.length > 0)
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function alreadyExistsError(error: unknown): boolean {
  const code = (error as any)?.code
  if (code === 6 || code === 'already-exists') {
    return true
  }
  const message = String((error as any)?.message ?? '')
  return /ALREADY_EXISTS/i.test(message)
}

export function buildAppointmentDocId(input: {
  sessionId: string
  agendaId: string
  title: string
  startMs: number
  endMs: number
}): string {
  const raw = `${input.sessionId}|${input.agendaId}|${input.startMs}|${input.endMs}|${input.title}`.trim()
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  return `apt_${hash.slice(0, 48)}`
}

export class FirestoreAgendaStore implements AgendaStore {
  async listAgendas(sessionId: string): Promise<AgendaRecord[]> {
    const safeSessionId = sessionId.trim()
    if (!safeSessionId) {
      return []
    }
    const db = getFirestoreAdmin()
    if (!db) {
      return []
    }

    const snap = await db.collection('users').doc(safeSessionId).collection('agendas').get()
    const agendas: AgendaRecord[] = []
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>
      const createdAtMs = toMillis(data.createdAt)
      const availableHours = normalizeAvailableHours(data.availableHours)
      const agenda: AgendaRecord = {
        id: doc.id,
        name: safeString(data.name).trim(),
        color: safeString(data.color).trim(),
        order: safeNumber(data.order),
        createdAtMs,
        availableHours
      }
      if (!agenda.name) {
        continue
      }
      agendas.push(agenda)
    }

    agendas.sort((a, b) => {
      const orderA = a.order !== null ? a.order : 9999
      const orderB = b.order !== null ? b.order : 9999
      if (orderA !== orderB) return orderA - orderB
      const timeA = a.createdAtMs ?? 0
      const timeB = b.createdAtMs ?? 0
      return timeB - timeA
    })

    return agendas.filter((agenda) => isSchedulableHours(agenda.availableHours))
  }

  async listAppointmentsByDay(input: AgendaListAppointmentsByDayInput): Promise<AppointmentRecord[]> {
    const safeSessionId = input.sessionId.trim()
    if (!safeSessionId) {
      return []
    }

    const dateParts = parseIsoDate(input.date)
    if (!dateParts) {
      return []
    }

    const db = getFirestoreAdmin()
    if (!db) {
      return []
    }

    const { startUtcMs, endUtcMs } = getDayBoundsUtcMs(dateParts, input.timezone)
    const startTs = admin.firestore.Timestamp.fromMillis(startUtcMs)
    const endTs = admin.firestore.Timestamp.fromMillis(endUtcMs)

    const base = db.collection('users').doc(safeSessionId).collection('appointments')
    const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

    const queryStartInDay = base
      .where('start', '>=', startTs)
      .where('start', '<', endTs)
      .orderBy('start', 'asc')

    const queryEndInDay = base
      .where('end', '>', startTs)
      .where('end', '<=', endTs)
      .orderBy('end', 'asc')

    const queryStartsBefore = base
      .where('start', '<', startTs)
      .orderBy('start', 'desc')
      .limit(PREVIOUS_DAY_SCAN_LIMIT)

    const [snapStart, snapEnd, snapBefore] = await Promise.all([
      queryStartInDay.get().catch(() => null),
      queryEndInDay.get().catch(() => null),
      queryStartsBefore.get().catch(() => null)
    ])

    for (const snap of [snapStart, snapEnd, snapBefore]) {
      if (!snap) continue
      for (const doc of snap.docs) {
        docsById.set(doc.id, doc)
      }
    }

    const appointments: AppointmentRecord[] = []
    for (const doc of docsById.values()) {
      const data = doc.data() as Record<string, unknown>
      const startMs = toMillis(data.start)
      const endMs = toMillis(data.end)
      if (startMs === null || endMs === null) {
        continue
      }
      if (endMs <= startUtcMs || startMs >= endUtcMs) {
        continue
      }
      const agendaId = safeString(data.agendaId).trim()
      if (!agendaId) {
        continue
      }

      appointments.push({
        id: doc.id,
        title: safeString(data.title).trim(),
        agendaId,
        startMs,
        endMs,
        description: safeString(data.description).trim() || null,
        status: safeString(data.status).trim() || null
      })
    }

    appointments.sort((a, b) => a.startMs - b.startMs)
    if (input.agendaId?.trim()) {
      const agendaId = input.agendaId.trim()
      return appointments.filter((apt) => apt.agendaId === agendaId)
    }
    return appointments
  }

  async createAppointment(input: AgendaCreateAppointmentInput): Promise<AgendaCreateAppointmentResult> {
    const safeSessionId = input.sessionId.trim()
    const safeAgendaId = input.agendaId.trim()
    const title = input.title.trim()
    if (!safeSessionId || !safeAgendaId || !title) {
      throw new Error('invalid_appointment_input')
    }
    if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs) || input.endMs <= input.startMs) {
      throw new Error('invalid_appointment_window')
    }

    const db = getFirestoreAdmin()
    if (!db) {
      throw new Error('firebase_admin_unavailable')
    }

    const id = buildAppointmentDocId({
      sessionId: safeSessionId,
      agendaId: safeAgendaId,
      title,
      startMs: input.startMs,
      endMs: input.endMs
    })

    const docRef = db.collection('users').doc(safeSessionId).collection('appointments').doc(id)
    const now = admin.firestore.Timestamp.now()
    const payload = {
      title,
      agendaId: safeAgendaId,
      start: admin.firestore.Timestamp.fromMillis(input.startMs),
      end: admin.firestore.Timestamp.fromMillis(input.endMs),
      description: input.description?.trim() || '',
      status: (input.status ?? 'agendado').trim() || 'agendado',
      createdAt: now,
      createdBy: input.createdBy ?? 'ai',
      chatId: input.chatId ?? null,
      source: input.source ?? 'backend-b'
    }

    try {
      await docRef.create(payload)
    } catch (error) {
      if (!alreadyExistsError(error)) {
        throw error
      }
    }

    return { id }
  }
}
