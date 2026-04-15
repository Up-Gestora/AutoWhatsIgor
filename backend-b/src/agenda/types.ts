export type AgendaTimeSlot = {
  start: string
  end: string
}

export type AgendaAvailableHoursDay = {
  enabled: boolean
  timeSlots: AgendaTimeSlot[]
}

export type AgendaAvailableHours = Record<number, AgendaAvailableHoursDay>

export type AgendaRecord = {
  id: string
  name: string
  color: string
  order: number | null
  createdAtMs: number | null
  availableHours: AgendaAvailableHours | null
}

export type AppointmentRecord = {
  id: string
  title: string
  agendaId: string
  startMs: number
  endMs: number
  description: string | null
  status: string | null
}

