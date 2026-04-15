import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTrainingData, validateTrainingPatch } from '../src/ai/trainingCopilotSchema'

test('validateTrainingPatch rejects unknown keys', () => {
  const base = normalizeTrainingData({})
  const result = validateTrainingPatch({ campoInvalido: true }, base)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error, 'patch_key_invalid:campoInvalido')
})

test('validateTrainingPatch rejects invalid types', () => {
  const base = normalizeTrainingData({})
  const result = validateTrainingPatch({ responderClientes: 'sim' }, base)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error, 'patch_type_invalid:responderClientes')
})

test('normalizeTrainingData defaults personalized handoff toggle to false', () => {
  const normalized = normalizeTrainingData({})
  assert.equal(normalized.permitirIATextoPersonalizadoAoEncaminharHumano, false)
})

test('validateTrainingPatch accepts personalized handoff toggle', () => {
  const base = normalizeTrainingData({})
  const result = validateTrainingPatch(
    {
      permitirIATextoPersonalizadoAoEncaminharHumano: true
    },
    base
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.patch, {
    permitirIATextoPersonalizadoAoEncaminharHumano: true
  })
})

test('validateTrainingPatch enforces invariants for sugestoes toggle', () => {
  const base = normalizeTrainingData({
    permitirSugestoesCamposLeadsClientes: true,
    aprovarAutomaticamenteSugestoesLeadsClientes: true
  })
  const result = validateTrainingPatch(
    {
      permitirSugestoesCamposLeadsClientes: false
    },
    base
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.patch, {
    permitirSugestoesCamposLeadsClientes: false,
    aprovarAutomaticamenteSugestoesLeadsClientes: false
  })
})

test('validateTrainingPatch accepts followUpAutomatico object patch', () => {
  const base = normalizeTrainingData({})
  const result = validateTrainingPatch(
    {
      followUpAutomatico: {
        enabled: true,
        allowClients: true
      }
    },
    base
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.patch.followUpAutomatico, {
    enabled: true,
    allowClients: true
  })
})

test('validateTrainingPatch accepts delivery guard boolean toggle', () => {
  const base = normalizeTrainingData({})
  const result = validateTrainingPatch(
    {
      desligarIASeUltimasDuasMensagensNaoRecebidas: false
    },
    base
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.patch, {
    desligarIASeUltimasDuasMensagensNaoRecebidas: false
  })
})

test('validateTrainingPatch accepts recent human activity numeric fields', () => {
  const base = normalizeTrainingData({})
  const result = validateTrainingPatch(
    {
      desligarIASeHumanoRecenteDias: 15,
      desligarIASeHumanoRecenteMensagens: 40
    },
    base
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.patch, {
    desligarIASeHumanoRecenteDias: 15,
    desligarIASeHumanoRecenteMensagens: 40
  })
})

test('normalizeTrainingData keeps legacy recent human activity configs with both criteria enabled', () => {
  const normalized = normalizeTrainingData({
    desligarIASeHumanoRecente: true,
    desligarIASeHumanoRecenteDias: 7,
    desligarIASeHumanoRecenteMensagens: 4
  })

  assert.equal(normalized.desligarIASeHumanoRecente, true)
  assert.equal(normalized.desligarIASeHumanoRecenteUsarDias, true)
  assert.equal(normalized.desligarIASeHumanoRecenteUsarMensagens, true)
})

test('validateTrainingPatch disables recent human parent toggle when both criteria are off', () => {
  const base = normalizeTrainingData({
    desligarIASeHumanoRecente: true,
    desligarIASeHumanoRecenteUsarDias: true,
    desligarIASeHumanoRecenteUsarMensagens: true
  })
  const result = validateTrainingPatch(
    {
      desligarIASeHumanoRecenteUsarDias: false,
      desligarIASeHumanoRecenteUsarMensagens: false
    },
    base
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.deepEqual(result.patch, {
    desligarIASeHumanoRecente: false,
    desligarIASeHumanoRecenteUsarDias: false,
    desligarIASeHumanoRecenteUsarMensagens: false
  })
})
