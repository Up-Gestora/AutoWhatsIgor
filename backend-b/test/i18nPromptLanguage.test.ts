import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLegacyPrompt } from '../src/ai/promptBuilder'
import { resolveHandoffText as resolveMessageHandoffText } from '../src/ai/service'
import { resolveHandoffText as resolveMediaHandoffText } from '../src/ai/mediaUnderstandingService'

test('buildLegacyPrompt uses English defaults when training.language is en', () => {
  const prompt = buildLegacyPrompt({
    training: {
      language: 'en',
      nomeEmpresa: '',
      nomeIA: '',
      orientacoesGerais: '',
      tipoResposta: ''
    }
  })

  assert.match(prompt, /Current Date and Time:/)
  assert.match(prompt, /YOUR GOAL:/)
  assert.match(prompt, /Use the following JSON as your knowledge base:/)
  assert.match(prompt, /metadata \(fromMe, origin, actor, channel\)/)
  assert.doesNotMatch(prompt, /SEU OBJETIVO:/)
  assert.doesNotMatch(prompt, /Use o JSON a seguir/)
})

test('buildLegacyPrompt keeps Portuguese defaults for pt-BR training', () => {
  const prompt = buildLegacyPrompt({
    training: {
      language: 'pt-BR',
      nomeEmpresa: '',
      nomeIA: '',
      orientacoesGerais: '',
      tipoResposta: ''
    }
  })

  assert.match(prompt, /Data e Hora Atual:/)
  assert.match(prompt, /SEU OBJETIVO:/)
  assert.match(prompt, /Use o JSON a seguir como sua base de dados:/)
  assert.match(prompt, /metadados tecnicos \(fromMe, origin, actor, channel\)/)
})

test('service fallback handoff text follows training.language', () => {
  const english = resolveMessageHandoffText({ language: 'en' })
  const portuguese = resolveMessageHandoffText({ language: 'pt-BR' })

  assert.match(english, /Sorry, I don't have that information right now\./)
  assert.match(portuguese, /Desculpe,/)
})

test('media fallback handoff text follows training.language', () => {
  const english = resolveMediaHandoffText({ language: 'en' })
  const portuguese = resolveMediaHandoffText({ language: 'pt-BR' })

  assert.match(english, /Sorry, I couldn't analyze the file you sent\./)
  assert.match(portuguese, /Desculpe, nao consegui analisar o arquivo enviado\./)
})

test('custom handoff text always overrides default language fallback', () => {
  const custom = resolveMessageHandoffText({
    language: 'en',
    mensagemEncaminharHumano: 'Custom handoff text'
  })
  assert.equal(custom, 'Custom handoff text')
})
