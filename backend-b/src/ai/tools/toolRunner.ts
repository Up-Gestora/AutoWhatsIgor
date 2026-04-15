import type { GeminiClient } from '../geminiClient'
import type { OpenAiClient } from '../openaiClient'
import type { AiToolDefinition, ToolChatMessage, ToolCall, ToolModelResult, ToolUsage } from './types'

type Logger = {
  warn?: (message: string, meta?: Record<string, unknown>) => void
}
type AiLanguage = 'pt-BR' | 'en'

function mergeUsage(a?: ToolUsage, b?: ToolUsage): ToolUsage | undefined {
  if (!a && !b) {
    return undefined
  }
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0)
  }
}

export async function runWithTools(options: {
  provider: 'openai' | 'google'
  model: string
  temperature: number
  messages: ToolChatMessage[]
  tools: AiToolDefinition[]
  executeTool: (call: ToolCall) => Promise<string>
  openAiClient: OpenAiClient
  geminiClient?: GeminiClient
  maxIterations?: number
  timeoutMs?: number
  language?: AiLanguage
  logger?: Logger
}): Promise<{ content: string; usage?: ToolUsage }> {
  const maxIterations = Math.max(1, options.maxIterations ?? 5)
  const timeoutMs = Math.max(0, options.timeoutMs ?? 0)
  const logger = options.logger ?? {}

  let messages: ToolChatMessage[] = options.messages.slice()
  let usageTotal: ToolUsage | undefined

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const modelResult = await withTimeout(
      callModel({
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        messages,
        tools: options.tools,
        openAiClient: options.openAiClient,
        geminiClient: options.geminiClient
      }),
      timeoutMs
    )

    usageTotal = mergeUsage(usageTotal, modelResult.usage)

    if (modelResult.type === 'final') {
      return { content: modelResult.content, usage: usageTotal }
    }

    // Record assistant tool calls in the transcript and then append tool results.
    messages = messages.concat([
      {
        role: 'assistant',
        content: modelResult.content ?? '',
        toolCalls: modelResult.toolCalls
      }
    ])

    for (const toolCall of modelResult.toolCalls) {
      const result = await executeToolSafe(options.executeTool, toolCall)
      messages = messages.concat([
        {
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: result
        }
      ])
    }
  }

  logger.warn?.('Tool runner max iterations reached', {
    provider: options.provider,
    model: options.model,
    maxIterations
  })
  const language = options.language ?? 'pt-BR'
  return {
    content:
      language === 'en'
        ? "I couldn't complete the scheduling right now. Could you share another date/time or more details?"
        : 'Não consegui concluir o agendamento agora. Pode me informar outra data/horário ou mais detalhes?',
    usage: usageTotal
  }
}

async function callModel(options: {
  provider: 'openai' | 'google'
  model: string
  temperature: number
  messages: ToolChatMessage[]
  tools: AiToolDefinition[]
  openAiClient: OpenAiClient
  geminiClient?: GeminiClient
}): Promise<ToolModelResult> {
  if (options.provider === 'google') {
    if (!options.geminiClient) {
      throw new Error('gemini-client-missing')
    }
    return options.geminiClient.createChatCompletionWithTools({
      model: options.model,
      temperature: options.temperature,
      messages: options.messages,
      tools: options.tools
    })
  }

  return options.openAiClient.createChatCompletionWithTools({
    model: options.model,
    temperature: options.temperature,
    messages: options.messages,
    tools: options.tools
  })
}

async function executeToolSafe(executeTool: (call: ToolCall) => Promise<string>, toolCall: ToolCall): Promise<string> {
  try {
    const result = await executeTool(toolCall)
    if (typeof result === 'string' && result.trim()) {
      return result
    }
    return JSON.stringify({ success: false, error: 'tool_empty_result' })
  } catch (error) {
    return JSON.stringify({ success: false, error: 'tool_exception', message: (error as Error).message })
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs) {
    return promise
  }
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      })
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

