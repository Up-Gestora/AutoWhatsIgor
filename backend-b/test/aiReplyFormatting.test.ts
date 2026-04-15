import assert from 'node:assert/strict'
import test from 'node:test'

import { formatGuidedTestAssistantReply } from '../src/ai/replyFormatting'

test('formatGuidedTestAssistantReply normalizes bold and explicit split markers', () => {
  const result = formatGuidedTestAssistantReply(
    'Oi! **Posso** te ajudar.[SEPARAR]1) Qual é o modelo do carro?[SEPARATE]Se quiser, já posso agendar.'
  )

  assert.deepEqual(result.assistantParts, [
    'Oi! *Posso* te ajudar.',
    '1) Qual é o modelo do carro?',
    'Se quiser, já posso agendar.'
  ])
  assert.equal(
    result.assistantMessage,
    'Oi! *Posso* te ajudar.\n\n1) Qual é o modelo do carro?\n\nSe quiser, já posso agendar.'
  )
})

test('formatGuidedTestAssistantReply applies conservative fallback split for long numbered replies', () => {
  const result = formatGuidedTestAssistantReply(
    'Entendi! Pra eu te ajudar melhor: 1) Qual é o modelo e o ano do veículo? 2) Esse barulho acontece em buraco, lombada, ao frear ou ao virar o volante? 3) Você percebe mais na frente ou atrás? Se você quiser, já posso deixar uma avaliação técnica pré-agendada.'
  )

  assert.equal(result.assistantParts.length, 4)
  assert.match(result.assistantParts[0] ?? '', /Entendi!/)
  assert.match(result.assistantParts[1] ?? '', /^2\)/)
  assert.match(result.assistantParts[2] ?? '', /^3\)/)
  assert.match(result.assistantParts[3] ?? '', /^Se você quiser/)
  for (const part of result.assistantParts) {
    assert.doesNotMatch(part, /\*\*/)
    assert.doesNotMatch(part, /\[SEPARAR\]|\[SEPARATE\]/)
  }
})
