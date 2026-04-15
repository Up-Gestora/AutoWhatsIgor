import type { AgendaStore } from '../../agenda/store'
import type { AgendaRecord } from '../../agenda/types'
import { computeAvailability, fitsWithinAvailableHours } from '../../agenda/availability'
import { parseIsoDate, parseTimeHHmm, zonedTimeToUtcMs } from '../../agenda/timezone'
import type { AiToolDefinition, ToolCall } from './types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

type Metrics = {
  increment: (name: string, value?: number) => void
}

type AiLanguage = 'pt-BR' | 'en'

export function buildAgendaTools(language: AiLanguage = 'pt-BR'): AiToolDefinition[] {
  const isEn = language === 'en'

  return [
    {
      name: 'list_agendas',
      description: isEn
        ? 'List schedulable agendas (with configured availability windows). Do not mention this tool name to the user; use it only to decide next steps.'
        : 'Lista as agendas agendáveis (que possuem horários disponíveis configurados). Não mencione o nome desta ferramenta ao usuário; use apenas para decidir os próximos passos.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      }
    },
    {
      name: 'check_availability',
      description: isEn
        ? 'Check agenda availability on a date (YYYY-MM-DD), returning free windows and suggested slots. Do not mention this tool name to the user.'
        : 'Checa disponibilidade de uma agenda em uma data (YYYY-MM-DD), retornando janelas livres e sugestões. Não mencione o nome desta ferramenta ao usuário.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['agendaId', 'date'],
        properties: {
          agendaId: { type: 'string', description: isEn ? 'Agenda ID' : 'ID da agenda' },
          date: {
            type: 'string',
            description: isEn ? 'Date in YYYY-MM-DD format' : 'Data no formato YYYY-MM-DD'
          },
          durationMinutes: {
            type: 'number',
            description: isEn
              ? 'Appointment duration in minutes (default 60)'
              : 'Duração do atendimento em minutos (padrão 60)'
          },
          granularityMinutes: {
            type: 'number',
            description: isEn
              ? 'Slot suggestion step in minutes (default 30)'
              : 'Passo das sugestões em minutos (padrão 30)'
          }
        }
      }
    },
    {
      name: 'create_appointment',
      description: isEn
        ? 'Create an appointment in an agenda (no conflicts and within configured availability). Do not mention this tool name to the user.'
        : 'Cria um agendamento em uma agenda (sem conflitos e dentro dos horários disponíveis). Não mencione o nome desta ferramenta ao usuário.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['agendaId', 'date', 'startTime', 'endTime', 'title'],
        properties: {
          agendaId: { type: 'string', description: isEn ? 'Agenda ID' : 'ID da agenda' },
          date: {
            type: 'string',
            description: isEn ? 'Date in YYYY-MM-DD format' : 'Data no formato YYYY-MM-DD'
          },
          startTime: {
            type: 'string',
            description: isEn ? 'Start time HH:mm' : 'Horário de início HH:mm'
          },
          endTime: {
            type: 'string',
            description: isEn ? 'End time HH:mm' : 'Horário de fim HH:mm'
          },
          title: { type: 'string', description: isEn ? 'Appointment title' : 'Título do agendamento' },
          description: { type: 'string', description: isEn ? 'Optional description' : 'Descrição opcional' }
        }
      }
    }
  ]
}

export const agendaTools: AiToolDefinition[] = buildAgendaTools('pt-BR')

export function createAgendaToolExecutor(options: {
  agendaStore: AgendaStore
  sessionId: string
  chatId: string
  timezone: string
  logger?: Logger
  metrics?: Metrics
}): (call: ToolCall) => Promise<string> {
  const logger = options.logger ?? {}
  const metrics = options.metrics

  return async (call: ToolCall): Promise<string> => {
    metrics?.increment('ai.tools.agenda.invocations')
    metrics?.increment(`ai.tools.agenda.${call.name}`)
    try {
      if (call.name === 'list_agendas') {
        const agendas = await options.agendaStore.listAgendas(options.sessionId)
        const payload = {
          success: true,
          agendas: agendas.map(toAgendaToolJson)
        }
        return JSON.stringify(payload)
      }

      const args = safeJsonParse(call.argumentsJson)
      if (call.name === 'check_availability') {
        const agendaId = typeof args.agendaId === 'string' ? args.agendaId.trim() : ''
        const date = typeof args.date === 'string' ? args.date.trim() : ''
        const durationMinutes = typeof args.durationMinutes === 'number' ? args.durationMinutes : undefined
        const granularityMinutes = typeof args.granularityMinutes === 'number' ? args.granularityMinutes : undefined

        if (!agendaId || !date) {
          return JSON.stringify({ success: false, error: 'agendaId_and_date_required' })
        }

        const agenda = await resolveAgenda(options.agendaStore, options.sessionId, agendaId)
        if (!agenda) {
          return JSON.stringify({ success: false, error: 'agenda_not_found' })
        }

        const appointments = await options.agendaStore.listAppointmentsByDay({
          sessionId: options.sessionId,
          agendaId,
          date,
          timezone: options.timezone
        })

        const availability = computeAvailability({
          availableHours: agenda.availableHours,
          appointments,
          date,
          timezone: options.timezone,
          durationMinutes,
          granularityMinutes
        })

        if (availability.success !== true) {
          return JSON.stringify({ success: false, error: availability.error })
        }

        return JSON.stringify({
          success: true,
          agendaId,
          date,
          timezone: availability.timezone,
          businessHoursWindows: availability.businessHoursWindows,
          busy: availability.busy,
          freeWindows: availability.freeWindows,
          suggestedSlots: availability.suggestedSlots
        })
      }

      if (call.name === 'create_appointment') {
        const agendaId = typeof args.agendaId === 'string' ? args.agendaId.trim() : ''
        const date = typeof args.date === 'string' ? args.date.trim() : ''
        const startTime = typeof args.startTime === 'string' ? args.startTime.trim() : ''
        const endTime = typeof args.endTime === 'string' ? args.endTime.trim() : ''
        const title = typeof args.title === 'string' ? args.title.trim() : ''
        const description = typeof args.description === 'string' ? args.description.trim() : ''

        if (!agendaId || !date || !startTime || !endTime || !title) {
          return JSON.stringify({ success: false, error: 'missing_required_fields' })
        }

        const agenda = await resolveAgenda(options.agendaStore, options.sessionId, agendaId)
        if (!agenda) {
          return JSON.stringify({ success: false, error: 'agenda_not_found' })
        }

        const fit = fitsWithinAvailableHours({
          availableHours: agenda.availableHours,
          date,
          startTime,
          endTime
        })
        if (!fit.ok) {
          return JSON.stringify({ success: false, error: fit.reason })
        }

        const dateParts = parseIsoDate(date)
        const startParts = parseTimeHHmm(startTime)
        const endParts = parseTimeHHmm(endTime)
        if (!dateParts || !startParts || !endParts) {
          return JSON.stringify({ success: false, error: 'invalid_date_or_time' })
        }

        const startMs = zonedTimeToUtcMs(
          {
            year: dateParts.year,
            month: dateParts.month,
            day: dateParts.day,
            hour: startParts.hour,
            minute: startParts.minute
          },
          options.timezone
        )
        const endMs = zonedTimeToUtcMs(
          {
            year: dateParts.year,
            month: dateParts.month,
            day: dateParts.day,
            hour: endParts.hour,
            minute: endParts.minute
          },
          options.timezone
        )

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          return JSON.stringify({ success: false, error: 'invalid_window' })
        }

        const appointments = await options.agendaStore.listAppointmentsByDay({
          sessionId: options.sessionId,
          agendaId,
          date,
          timezone: options.timezone
        })

        const conflicts = appointments
          .filter((apt) => (apt.status ?? '').trim().toLowerCase() !== 'cancelado')
          .filter((apt) => startMs < apt.endMs && endMs > apt.startMs)
          .map((apt) => ({
            id: apt.id,
            title: apt.title,
            startMs: apt.startMs,
            endMs: apt.endMs,
            status: apt.status
          }))

        if (conflicts.length > 0) {
          return JSON.stringify({ success: false, error: 'conflict', conflicts })
        }

        const created = await options.agendaStore.createAppointment({
          sessionId: options.sessionId,
          agendaId,
          title,
          description,
          startMs,
          endMs,
          status: 'agendado',
          createdBy: 'ai',
          chatId: options.chatId,
          source: 'backend-b'
        })

        return JSON.stringify({
          success: true,
          appointmentId: created.id,
          agendaId,
          date,
          startTime,
          endTime
        })
      }

      return JSON.stringify({ success: false, error: 'unknown_tool' })
    } catch (error) {
      logger.warn?.('Agenda tool failed', {
        sessionId: options.sessionId,
        chatId: options.chatId,
        tool: call.name,
        error: (error as Error).message
      })
      return JSON.stringify({ success: false, error: 'tool_failed' })
    }
  }
}

async function resolveAgenda(store: AgendaStore, sessionId: string, agendaId: string): Promise<AgendaRecord | null> {
  const agendas = await store.listAgendas(sessionId)
  const found = agendas.find((agenda) => agenda.id === agendaId)
  return found ?? null
}

function safeJsonParse(value: string): Record<string, any> {
  if (!value || typeof value !== 'string') {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, any>) : {}
  } catch {
    return {}
  }
}

function toAgendaToolJson(agenda: AgendaRecord) {
  return {
    id: agenda.id,
    name: agenda.name,
    color: agenda.color,
    availableHours: agenda.availableHours
  }
}
