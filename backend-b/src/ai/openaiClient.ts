import type { AiToolDefinition, ToolChatMessage, ToolModelResult } from './tools/types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export type OpenAiUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type OpenAiChatCompletionResult = {
  content: string
  usage?: OpenAiUsage
}

export type OpenAiMultimodalCompletionResult = {
  content: string
  usage?: OpenAiUsage
}

export type OpenAiTranscriptionResult = {
  text: string
}

export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OpenAiMultimodalInput =
  | {
      type: 'image'
      file: Buffer
      mimeType?: string
    }
  | {
      type: 'pdf'
      file: Buffer
      fileName?: string
    }

type OpenAiToolPayload = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

type OpenAiClientOptions = {
  apiKey?: string
  baseUrl?: string
  logger?: Logger
}

export class OpenAiClient {
  private readonly apiKey?: string
  private readonly baseUrl: string
  private readonly logger: Logger

  constructor(options: OpenAiClientOptions) {
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl?.replace(/\/$/, '') ?? 'https://api.openai.com/v1'
    this.logger = options.logger ?? {}
  }

  isConfigured() {
    return Boolean(this.apiKey)
  }

  async createChatCompletion(params: {
    model: string
    temperature: number
    messages: OpenAiMessage[]
  }): Promise<OpenAiChatCompletionResult> {
    if (!this.apiKey) {
      throw new Error('openai-api-key-missing')
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        messages: params.messages
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      this.logger.error?.('OpenAI request failed', {
        status: response.status,
        body: text
      })
      throw new Error(`openai-request-failed:${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }

    const content = payload.choices?.[0]?.message?.content
    const usage = normalizeUsage(payload.usage)

    return {
      content: (content ?? '').trim(),
      ...(usage ? { usage } : {})
    }
  }

  async createTranscription(params: {
    model?: string
    file: Buffer
    filename: string
    mimeType?: string
    language?: string
  }): Promise<OpenAiTranscriptionResult> {
    if (!this.apiKey) {
      throw new Error('openai-api-key-missing')
    }

    const form = new FormData()
    form.append('model', params.model?.trim() || 'whisper-1')
    if (params.language?.trim()) {
      form.append('language', params.language.trim())
    }

    const blob = new Blob([params.file], { type: params.mimeType?.trim() || 'audio/wav' })
    form.append('file', blob, params.filename?.trim() || 'audio.wav')

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`
      },
      body: form
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      this.logger.error?.('OpenAI transcription request failed', {
        status: response.status,
        body: text
      })
      throw new Error(`openai-transcription-failed:${response.status}`)
    }

    const payload = (await response.json()) as { text?: unknown }
    const text = typeof payload.text === 'string' ? payload.text : ''

    return {
      text: text.trim()
    }
  }

  async createMultimodalCompletion(params: {
    model: string
    prompt: string
    systemPrompt?: string
    input: OpenAiMultimodalInput
  }): Promise<OpenAiMultimodalCompletionResult> {
    if (!this.apiKey) {
      throw new Error('openai-api-key-missing')
    }

    const prompt = params.prompt?.trim()
    if (!prompt) {
      throw new Error('openai-multimodal-prompt-missing')
    }

    const systemPrompt = params.systemPrompt?.trim()
    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: prompt
      }
    ]

    if (params.input.type === 'image') {
      const mimeType = params.input.mimeType?.trim() || 'image/jpeg'
      const dataUrl = `data:${mimeType};base64,${params.input.file.toString('base64')}`
      userContent.push({
        type: 'image_url',
        image_url: {
          url: dataUrl
        }
      })
    } else {
      const fileName = params.input.fileName?.trim() || 'document.pdf'
      const dataUrl = `data:application/pdf;base64,${params.input.file.toString('base64')}`
      userContent.push({
        type: 'file',
        file: {
          filename: fileName,
          file_data: dataUrl
        }
      })
    }

    const messages: Array<Record<string, unknown>> = [
      ...(systemPrompt
        ? [
            {
              role: 'system',
              content: systemPrompt
            }
          ]
        : []),
      {
        role: 'user',
        content: userContent
      }
    ]

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      this.logger.error?.('OpenAI multimodal request failed', {
        status: response.status,
        body: text
      })
      throw new Error(`openai-multimodal-failed:${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }
    const content = payload.choices?.[0]?.message?.content
    const usage = normalizeUsage(payload.usage)

    return {
      content: (content ?? '').trim(),
      ...(usage ? { usage } : {})
    }
  }

  async createChatCompletionWithTools(params: {
    model: string
    temperature: number
    messages: ToolChatMessage[]
    tools: AiToolDefinition[]
  }): Promise<ToolModelResult> {
    if (!this.apiKey) {
      throw new Error('openai-api-key-missing')
    }

    const toolsPayload: OpenAiToolPayload[] = params.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))

    const messagesPayload = params.messages.map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: message.toolCallId,
          content: message.content ?? ''
        }
      }
      if (message.role === 'assistant') {
        const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : []
        return {
          role: 'assistant',
          content: message.content ?? '',
          ...(toolCalls.length > 0
            ? {
                tool_calls: toolCalls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: {
                    name: call.name,
                    arguments: call.argumentsJson
                  }
                }))
              }
            : {})
        }
      }
      return {
        role: message.role,
        content: message.content ?? ''
      }
    })

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        messages: messagesPayload,
        tools: toolsPayload
      })
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      this.logger.error?.('OpenAI request failed', {
        status: response.status,
        body: text
      })
      throw new Error(`openai-request-failed:${response.status}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null
          tool_calls?: Array<{
            id?: string
            type?: string
            function?: { name?: string; arguments?: string | null }
          }>
        }
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }

    const message = payload.choices?.[0]?.message
    const content = (message?.content ?? '').trim()
    const usage = normalizeUsage(payload.usage)
    const toolCallsRaw = Array.isArray(message?.tool_calls) ? message?.tool_calls : []
    const toolCalls = toolCallsRaw
      .map((call) => {
        const id = typeof call.id === 'string' ? call.id : ''
        const name = typeof call.function?.name === 'string' ? call.function.name : ''
        const args = typeof call.function?.arguments === 'string' ? call.function.arguments : ''
        if (!id || !name) {
          return null
        }
        return { id, name, argumentsJson: args || '{}' }
      })
      .filter(Boolean) as Array<{ id: string; name: string; argumentsJson: string }>

    if (toolCalls.length > 0) {
      return {
        type: 'tool_calls',
        content,
        toolCalls,
        ...(usage ? { usage } : {})
      }
    }

    return {
      type: 'final',
      content,
      ...(usage ? { usage } : {})
    }
  }
}

function normalizeUsage(
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
): OpenAiUsage | undefined {
  if (!usage) {
    return undefined
  }
  const promptTokens = toNumber(usage.prompt_tokens)
  const completionTokens = toNumber(usage.completion_tokens)
  const totalTokens = toNumber(usage.total_tokens)
  const hasAny = [promptTokens, completionTokens, totalTokens].some((value) => typeof value === 'number')
  if (!hasAny) {
    return undefined
  }
  return {
    promptTokens: promptTokens ?? 0,
    completionTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? (promptTokens ?? 0) + (completionTokens ?? 0)
  }
}

function toNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
