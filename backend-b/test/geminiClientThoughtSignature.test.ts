import assert from 'node:assert/strict'
import test from 'node:test'
import { GeminiClient } from '../src/ai/geminiClient'
import type { AiToolDefinition, ToolChatMessage } from '../src/ai/tools/types'

const toolDefinitions: AiToolDefinition[] = [
  {
    name: 'list_agendas',
    description: 'Lista agendas',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string' }
      }
    }
  },
  {
    name: 'check_availability',
    description: 'Checa disponibilidade',
    parameters: {
      type: 'object',
      properties: {
        agendaId: { type: 'string' },
        date: { type: 'string' }
      }
    }
  }
]

function createGeminiClientWithFakeModel(modelFactory: (config: any) => any): GeminiClient {
  const client = new GeminiClient({ apiKey: 'test-key' }) as any
  client.client = {
    getGenerativeModel: modelFactory
  }
  return client as GeminiClient
}

test('GeminiClient extracts tool calls and thought signatures from response parts', async () => {
  const client = createGeminiClientWithFakeModel(() => ({
    startChat: () => ({
      sendMessage: async () => ({
        response: {
          text: () => '',
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Vou consultar a agenda.' },
                  {
                    functionCall: {
                      name: 'list_agendas',
                      args: {}
                    },
                    thoughtSignature: 'sig-camel'
                  },
                  {
                    functionCall: {
                      name: 'check_availability',
                      args: { agendaId: 'ag1', date: '2026-02-12' }
                    },
                    thought_signature: 'sig-snake'
                  }
                ]
              }
            }
          ]
        }
      })
    })
  }))

  const result = await client.createChatCompletionWithTools({
    temperature: 0,
    messages: [
      { role: 'system', content: 'sistema' },
      { role: 'user', content: 'Quero agendar' }
    ],
    tools: toolDefinitions
  })

  assert.equal(result.type, 'tool_calls')
  assert.equal(result.toolCalls.length, 2)
  assert.equal(result.toolCalls[0].name, 'list_agendas')
  assert.equal(result.toolCalls[1].name, 'check_availability')
  assert.equal(result.toolCalls[0].geminiThoughtSignature, 'sig-camel')
  assert.equal(result.toolCalls[1].geminiThoughtSignature, 'sig-snake')
  assert.deepEqual(JSON.parse(result.toolCalls[1].argumentsJson), { agendaId: 'ag1', date: '2026-02-12' })
})

test('GeminiClient replays thoughtSignature and maps tool results as function role', async () => {
  let capturedHistory: any[] = []
  let capturedSendMessageParts: any[] = []

  const client = createGeminiClientWithFakeModel(() => ({
    startChat: ({ history }: { history: any[] }) => {
      capturedHistory = history
      return {
        sendMessage: async (parts: any[]) => {
          capturedSendMessageParts = parts
          return {
            response: {
              text: () => 'Perfeito, consulta concluida.',
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Perfeito, consulta concluida.' }]
                  }
                }
              ]
            }
          }
        }
      }
    }
  }))

  const messages: ToolChatMessage[] = [
    { role: 'system', content: 'sistema' },
    { role: 'user', content: 'Quero agendar' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 't1',
          name: 'list_agendas',
          argumentsJson: '{}',
          geminiThoughtSignature: 'sig-replay'
        }
      ]
    },
    {
      role: 'tool',
      toolCallId: 't1',
      name: 'list_agendas',
      content: '{"success":true,"agendas":[]}'
    }
  ]

  const result = await client.createChatCompletionWithTools({
    temperature: 0,
    messages,
    tools: toolDefinitions
  })

  assert.equal(result.type, 'final')
  assert.equal(result.content, 'Perfeito, consulta concluida.')
  assert.ok(capturedHistory.length >= 2)

  const modelMessage = capturedHistory.find((entry) => entry?.role === 'model')
  assert.ok(modelMessage)
  const functionCallPart = (modelMessage?.parts ?? []).find((part: any) => Boolean(part?.functionCall))
  assert.ok(functionCallPart)
  assert.equal(functionCallPart.functionCall.name, 'list_agendas')
  assert.equal(functionCallPart.thoughtSignature, 'sig-replay')

  assert.ok(Array.isArray(capturedSendMessageParts))
  assert.ok(capturedSendMessageParts[0]?.functionResponse)
  assert.equal(capturedSendMessageParts[0].functionResponse.name, 'list_agendas')
})

test('GeminiClient fails fast when replayed tool call misses thought signature', async () => {
  let modelRequested = false

  const client = createGeminiClientWithFakeModel(() => {
    modelRequested = true
    return {
      startChat: () => ({
        sendMessage: async () => ({ response: { text: () => '' } })
      })
    }
  })

  const messages: ToolChatMessage[] = [
    { role: 'system', content: 'sistema' },
    { role: 'user', content: 'Quero agendar' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 't1', name: 'list_agendas', argumentsJson: '{}' }]
    },
    {
      role: 'tool',
      toolCallId: 't1',
      name: 'list_agendas',
      content: '{"success":true,"agendas":[]}'
    }
  ]

  await assert.rejects(
    async () =>
      client.createChatCompletionWithTools({
        temperature: 0,
        messages,
        tools: toolDefinitions
      }),
    /gemini-thought-signature-missing/
  )

  assert.equal(modelRequested, false)
})
