import type { AgendaRecord, AppointmentRecord } from './types'

export type AgendaListAppointmentsByDayInput = {
  sessionId: string
  date: string // YYYY-MM-DD (local date in the provided timezone)
  timezone: string
  agendaId?: string
}

export type AgendaCreateAppointmentInput = {
  sessionId: string
  agendaId: string
  title: string
  startMs: number
  endMs: number
  description?: string | null
  status?: string | null
  chatId?: string | null
  createdBy?: string | null
  source?: string | null
}

export type AgendaCreateAppointmentResult = {
  id: string
}

export interface AgendaStore {
  listAgendas(sessionId: string): Promise<AgendaRecord[]>
  listAppointmentsByDay(input: AgendaListAppointmentsByDayInput): Promise<AppointmentRecord[]>
  createAppointment(input: AgendaCreateAppointmentInput): Promise<AgendaCreateAppointmentResult>
}

