import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgendaToolExecutor } from '../src/ai/tools/agendaTools'

test('agenda tool list_agendas returns agendas', async () => {
  const store = {
    listAgendas: async () => [
      {
        id: 'ag1',
        name: 'Agenda 1',
        color: '#000',
        order: 0,
        createdAtMs: null,
        availableHours: {
          1: { enabled: true, timeSlots: [{ start: '09:00', end: '10:00' }] }
        }
      }
    ],
    listAppointmentsByDay: async () => [],
    createAppointment: async () => ({ id: 'x' })
  } as any

  const exec = createAgendaToolExecutor({
    agendaStore: store,
    sessionId: 's1',
    chatId: 'c1',
    timezone: 'UTC'
  })

  const raw = await exec({ id: 't1', name: 'list_agendas', argumentsJson: '{}' })
  const payload = JSON.parse(raw)
  assert.equal(payload.success, true)
  assert.equal(payload.agendas.length, 1)
  assert.equal(payload.agendas[0].id, 'ag1')
})

test('agenda tool create_appointment blocks conflicts', async () => {
  let created = false
  const store = {
    listAgendas: async () => [
      {
        id: 'ag1',
        name: 'Agenda 1',
        color: '#000',
        order: 0,
        createdAtMs: null,
        availableHours: {
          1: { enabled: true, timeSlots: [{ start: '09:00', end: '12:00' }] }
        }
      }
    ],
    listAppointmentsByDay: async () => [
      {
        id: 'a1',
        title: 'Busy',
        agendaId: 'ag1',
        startMs: Date.UTC(2024, 0, 1, 10, 0),
        endMs: Date.UTC(2024, 0, 1, 11, 0),
        description: null,
        status: 'confirmado'
      }
    ],
    createAppointment: async () => {
      created = true
      return { id: 'new' }
    }
  } as any

  const exec = createAgendaToolExecutor({
    agendaStore: store,
    sessionId: 's1',
    chatId: 'c1',
    timezone: 'UTC'
  })

  const raw = await exec({
    id: 't1',
    name: 'create_appointment',
    argumentsJson: JSON.stringify({
      agendaId: 'ag1',
      date: '2024-01-01',
      startTime: '10:30',
      endTime: '11:30',
      title: 'Consulta'
    })
  })

  const payload = JSON.parse(raw)
  assert.equal(payload.success, false)
  assert.equal(payload.error, 'conflict')
  assert.equal(created, false)
})

