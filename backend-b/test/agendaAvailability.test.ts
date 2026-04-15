import assert from 'node:assert/strict'
import test from 'node:test'
import { computeAvailability } from '../src/agenda/availability'

test('computeAvailability builds free windows and suggestions', () => {
  const date = '2024-01-01' // Monday
  const timezone = 'UTC'
  const availableHours = {
    1: { enabled: true, timeSlots: [{ start: '09:00', end: '12:00' }] }
  }

  const appointments = [
    {
      id: 'a1',
      title: 'Busy',
      agendaId: 'ag1',
      startMs: Date.UTC(2024, 0, 1, 9, 30),
      endMs: Date.UTC(2024, 0, 1, 10, 30),
      description: null,
      status: 'agendado'
    }
  ]

  const result = computeAvailability({
    availableHours,
    appointments,
    date,
    timezone,
    durationMinutes: 60,
    granularityMinutes: 30,
    maxSuggestions: 10
  })

  assert.equal(result.success, true)
  if (result.success !== true) return

  assert.deepEqual(result.businessHoursWindows, [['09:00', '12:00']])
  assert.deepEqual(
    result.freeWindows,
    [
      ['09:00', '09:30'],
      ['10:30', '12:00']
    ]
  )
  assert.deepEqual(result.suggestedSlots, [
    { startTime: '10:30', endTime: '11:30' },
    { startTime: '11:00', endTime: '12:00' }
  ])
})

test('computeAvailability ignores cancelado appointments', () => {
  const date = '2024-01-01'
  const timezone = 'UTC'
  const availableHours = {
    1: { enabled: true, timeSlots: [{ start: '09:00', end: '10:00' }] }
  }

  const appointments = [
    {
      id: 'a1',
      title: 'Canceled',
      agendaId: 'ag1',
      startMs: Date.UTC(2024, 0, 1, 9, 0),
      endMs: Date.UTC(2024, 0, 1, 10, 0),
      description: null,
      status: 'cancelado'
    }
  ]

  const result = computeAvailability({
    availableHours,
    appointments,
    date,
    timezone,
    durationMinutes: 60,
    granularityMinutes: 30
  })

  assert.equal(result.success, true)
  if (result.success !== true) return

  assert.deepEqual(result.freeWindows, [['09:00', '10:00']])
  assert.deepEqual(result.suggestedSlots, [{ startTime: '09:00', endTime: '10:00' }])
})

