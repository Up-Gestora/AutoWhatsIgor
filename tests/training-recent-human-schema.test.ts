import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTrainingInstructions, normalizeTrainingSnapshot } from '../lib/training/schema'

test('normalizeTrainingInstructions enables both recent human criteria for legacy snapshots', () => {
  const normalized = normalizeTrainingInstructions({
    desligarIASeHumanoRecente: true,
    desligarIASeHumanoRecenteDias: 7,
    desligarIASeHumanoRecenteMensagens: 4
  })

  assert.equal(normalized.desligarIASeHumanoRecente, true)
  assert.equal(normalized.desligarIASeHumanoRecenteUsarDias, true)
  assert.equal(normalized.desligarIASeHumanoRecenteUsarMensagens, true)
  assert.equal(normalized.desligarIASeHumanoRecenteDias, 7)
  assert.equal(normalized.desligarIASeHumanoRecenteMensagens, 4)
})

test('normalizeTrainingInstructions disables the parent recent human toggle when both criteria are off', () => {
  const normalized = normalizeTrainingInstructions({
    desligarIASeHumanoRecente: true,
    desligarIASeHumanoRecenteUsarDias: false,
    desligarIASeHumanoRecenteUsarMensagens: false
  })

  assert.equal(normalized.desligarIASeHumanoRecente, false)
  assert.equal(normalized.desligarIASeHumanoRecenteUsarDias, false)
  assert.equal(normalized.desligarIASeHumanoRecenteUsarMensagens, false)
})

test('normalizeTrainingSnapshot preserves independent recent human criteria and numeric values', () => {
  const snapshot = normalizeTrainingSnapshot({
    model: 'google',
    instructions: {
      desligarIASeHumanoRecente: true,
      desligarIASeHumanoRecenteUsarDias: true,
      desligarIASeHumanoRecenteUsarMensagens: false,
      desligarIASeHumanoRecenteDias: 9,
      desligarIASeHumanoRecenteMensagens: 25
    },
    contextMaxMessages: 20
  })

  assert.equal(snapshot.instructions.desligarIASeHumanoRecente, true)
  assert.equal(snapshot.instructions.desligarIASeHumanoRecenteUsarDias, true)
  assert.equal(snapshot.instructions.desligarIASeHumanoRecenteUsarMensagens, false)
  assert.equal(snapshot.instructions.desligarIASeHumanoRecenteDias, 9)
  assert.equal(snapshot.instructions.desligarIASeHumanoRecenteMensagens, 25)
})
