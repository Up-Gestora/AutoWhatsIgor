import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AiToolDefinition, ToolChatMessage, ToolModelResult, ToolUsage } from './tools/types'

type Logger = {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export type GeminiUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type GeminiChatCompletionResult = {
  content: string
  usage?: GeminiUsage
}

export type GeminiMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GeminiClientOptions = {
  apiKey?: string
  defaultModel?: string
  logger?: Logger
}

type GeminiHistoryEntry = {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

export class GeminiClient {
  private readonly apiKey?: string
  private readonly defaultModel: string
  private readonly logger: Logger
  private readonly client?: GoogleGenerativeAI

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey
    this.defaultModel = options.defaultModel ?? 'gemini-3-flash-preview'
    this.logger = options.logger ?? {}
    this.client = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : undefined
  }

  isConfigured() {
    return Boolean(this.apiKey)
  }

  async createChatCompletion(params: {
    model?: string
    temperature: number
    messages: GeminiMessage[]
  }): Promise<GeminiChatCompletionResult> {
    if (!this.client) {
      throw new Error('gemini-api-key-missing')
    }

    const { systemPrompt, history, lastUserMessage } = buildGeminiConversation(params.messages)
    const modelName = params.model ?? this.defaultModel

    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature: params.temperature
      }
    })

    const chat = model.startChat({
      history
    })

    const result = await chat.sendMessage(lastUserMessage)
    const response = result.response
    const content = response.text().trim()
    const usage = normalizeUsage(response.usageMetadata)

    return {
      content,
      ...(usage ? { usage } : {})
    }
  }

  async createChatCompletionWithTools(params: {
    model?: string
    temperature: number
    messages: ToolChatMessage[]
    tools: AiToolDefinition[]
  }): Promise<ToolModelResult> {
    if (!this.client) {
      throw new Error('gemini-api-key-missing')
    }

    const modelName = params.model ?? this.defaultModel
    const systemPrompt = params.messages.filter((m) => m.role === 'system').map((m) => m.content ?? '').join('\n\n').trim()
    const conversation = params.messages.filter((m) => m.role !== 'system')
    const geminiMessages = buildGeminiToolConversation(conversation)

    if (geminiMessages.length === 0) {
      throw new Error('gemini-missing-user-message')
    }

    let firstIndex = 0
    while (firstIndex < geminiMessages.length && geminiMessages[firstIndex].role !== 'user') {
      firstIndex += 1
    }
    const trimmed = geminiMessages.slice(firstIndex)

    let lastInputIndex = -1
    for (let i = trimmed.length - 1; i >= 0; i -= 1) {
      if (trimmed[i].role === 'user' || trimmed[i].role === 'function') {
        lastInputIndex = i
        break
      }
    }
    if (lastInputIndex === -1) {
      throw new Error('gemini-missing-user-message')
    }

    const history = trimmed.slice(0, lastInputIndex)
    const lastInput = trimmed[lastInputIndex]

    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature: params.temperature
      },
      tools: [
        {
          functionDeclarations: params.tools.map((tool) => toGeminiFunctionDeclaration(tool))
        } as any
      ]
    } as any)

    const chat = model.startChat({
      history: history as any
    })

    const result = await chat.sendMessage(lastInput.parts as any)
    const response = result.response as any
    const usage = normalizeUsage(response?.usageMetadata) as ToolUsage | undefined

    const toolCalls = extractGeminiToolCalls(response)

    const content = typeof response?.text === 'function' ? String(response.text() ?? '').trim() : ''

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

function buildGeminiConversation(messages: GeminiMessage[]) {
  const system = messages.find((message) => message.role === 'system')?.content ?? ''
  const contentMessages = messages.filter((message) => message.role !== 'system')

  if (contentMessages.length === 0) {
    throw new Error('gemini-missing-user-message')
  }

  let lastUserIndex = -1
  for (let index = contentMessages.length - 1; index >= 0; index -= 1) {
    if (contentMessages[index].role === 'user') {
      lastUserIndex = index
      break
    }
  }

  if (lastUserIndex === -1) {
    throw new Error('gemini-missing-user-message')
  }

  const lastUserMessage = contentMessages[lastUserIndex].content ?? ''
  const historyMessages = contentMessages.slice(0, lastUserIndex)

  const mapped: GeminiHistoryEntry[] = historyMessages
    .map((message): GeminiHistoryEntry => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content ?? '' }]
    }))
    .filter((entry) => entry.parts[0].text.trim().length > 0)

  const merged: GeminiHistoryEntry[] = []
  for (const entry of mapped) {
    const last = merged[merged.length - 1]
    if (last && last.role === entry.role) {
      last.parts[0].text = `${last.parts[0].text}\n${entry.parts[0].text}`
    } else {
      merged.push(entry)
    }
  }

  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift()
  }

  let finalUserMessage = lastUserMessage
  if (merged.length > 0 && merged[merged.length - 1].role === 'user') {
    const lastHistoryUser = merged.pop()
    if (lastHistoryUser?.parts?.[0]?.text) {
      finalUserMessage = `${lastHistoryUser.parts[0].text}\n${lastUserMessage}`
    }
  }

  return {
    systemPrompt: system,
    history: merged,
    lastUserMessage: finalUserMessage
  }
}

function normalizeUsage(
  usage?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
): GeminiUsage | undefined {
  if (!usage) {
    return undefined
  }
  const promptTokens = toNumber(usage.promptTokenCount)
  const completionTokens = toNumber(usage.candidatesTokenCount)
  const totalTokens = toNumber(usage.totalTokenCount)
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

type GeminiToolHistoryEntry = {
  role: 'user' | 'model' | 'function'
  parts: any[]
}

function buildGeminiToolConversation(messages: Array<ToolChatMessage>): GeminiToolHistoryEntry[] {
  const result: GeminiToolHistoryEntry[] = []

  for (const message of messages) {
    if (message.role === 'user') {
      const text = (message.content ?? '').trim()
      if (text) {
        result.push({ role: 'user', parts: [{ text }] })
      }
      continue
    }

    if (message.role === 'assistant') {
      const parts: any[] = []
      const text = (message.content ?? '').trim()
      if (text) {
        parts.push({ text })
      }
      const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : []
      if (toolCalls.length > 0 && !normalizeThoughtSignature(toolCalls[0]?.geminiThoughtSignature)) {
        throw new Error('gemini-thought-signature-missing')
      }

      for (const call of toolCalls) {
        const args = safeJsonParse(call.argumentsJson)
        const part: Record<string, unknown> = {
          functionCall: {
            name: call.name,
            args
          }
        }
        const thoughtSignature = normalizeThoughtSignature(call.geminiThoughtSignature)
        if (thoughtSignature) {
          part.thoughtSignature = thoughtSignature
        }
        parts.push(part)
      }
      if (parts.length > 0) {
        result.push({ role: 'model', parts })
      }
      continue
    }

    if (message.role === 'tool') {
      const response = safeJsonParse(message.content)
      const name = message.name?.trim() || 'tool'
      result.push({
        role: 'function',
        parts: [{ functionResponse: { name, response } }]
      })
    }
  }

  return result
}

function safeJsonParse(value: string): Record<string, unknown> {
  if (!value || typeof value !== 'string') {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function extractGeminiToolCalls(response: any): Array<{
  id: string
  name: string
  argumentsJson: string
  geminiThoughtSignature?: string
}> {
  const parts = extractGeminiCandidateParts(response)
  if (parts.length === 0) {
    return []
  }

  const now = Date.now()
  const calls: Array<{
    id: string
    name: string
    argumentsJson: string
    geminiThoughtSignature?: string
  }> = []

  for (const part of parts) {
    const partRecord = part && typeof part === 'object' && !Array.isArray(part) ? (part as Record<string, unknown>) : null
    const functionCall = partRecord?.functionCall
    if (!functionCall || typeof functionCall !== 'object' || Array.isArray(functionCall)) {
      continue
    }

    const call = functionCall as Record<string, unknown>
    const name = typeof call.name === 'string' ? call.name.trim() : ''
    if (!name) {
      continue
    }

    const args =
      call.args && typeof call.args === 'object' && !Array.isArray(call.args)
        ? (call.args as Record<string, unknown>)
        : {}
    const thoughtSignature = normalizeThoughtSignature(
      partRecord?.thoughtSignature ??
        partRecord?.thought_signature ??
        call.thoughtSignature ??
        call.thought_signature
    )

    calls.push({
      id: `gemini:${now}:${calls.length}`,
      name,
      argumentsJson: JSON.stringify(args ?? {}),
      ...(thoughtSignature ? { geminiThoughtSignature: thoughtSignature } : {})
    })
  }

  return calls
}

function extractGeminiCandidateParts(response: any): unknown[] {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : []
  const first = candidates[0]
  const content = first && typeof first === 'object' ? (first as Record<string, unknown>).content : null
  const parts = content && typeof content === 'object' ? (content as Record<string, unknown>).parts : null
  return Array.isArray(parts) ? parts : []
}

function normalizeThoughtSignature(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toGeminiFunctionDeclaration(tool: AiToolDefinition): Record<string, unknown> {
  const declaration: Record<string, unknown> = {
    name: tool.name,
    description: tool.description
  }

  const parameters = sanitizeGeminiParameters(tool.parameters)
  if (parameters) {
    declaration.parameters = parameters
  }

  return declaration
}

function sanitizeGeminiParameters(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const schema = sanitizeGeminiSchemaNode(value)
  if (!schema) {
    return undefined
  }

  if (schema.type !== 'object') {
    return undefined
  }

  const properties = schema.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return undefined
  }

  if (Object.keys(properties as Record<string, unknown>).length === 0) {
    return undefined
  }

  return schema
}

const GEMINI_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object'])

function sanitizeGeminiSchemaNode(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const source = value as Record<string, unknown>
  const type = typeof source.type === 'string' ? source.type.trim().toLowerCase() : ''
  if (!GEMINI_SCHEMA_TYPES.has(type)) {
    return undefined
  }

  const schema: Record<string, unknown> = { type }
  const description = typeof source.description === 'string' ? source.description.trim() : ''
  if (description) {
    schema.description = description
  }
  if (typeof source.nullable === 'boolean') {
    schema.nullable = source.nullable
  }

  if (type === 'object') {
    const propertiesRaw = source.properties
    if (!propertiesRaw || typeof propertiesRaw !== 'object' || Array.isArray(propertiesRaw)) {
      return undefined
    }

    const properties: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(propertiesRaw as Record<string, unknown>)) {
      const sanitizedChild = sanitizeGeminiSchemaNode(child)
      if (sanitizedChild) {
        properties[key] = sanitizedChild
      }
    }

    if (Object.keys(properties).length === 0) {
      return undefined
    }

    schema.properties = properties

    const required = Array.isArray(source.required)
      ? source.required.filter(
          (entry): entry is string =>
            typeof entry === 'string' && Object.prototype.hasOwnProperty.call(properties, entry)
        )
      : []

    if (required.length > 0) {
      schema.required = required
    }

    return schema
  }

  if (type === 'array') {
    const items = sanitizeGeminiSchemaNode(source.items)
    if (!items) {
      return undefined
    }
    schema.items = items

    const minItems = typeof source.minItems === 'number' ? source.minItems : undefined
    if (typeof minItems === 'number' && Number.isFinite(minItems)) {
      schema.minItems = minItems
    }
    const maxItems = typeof source.maxItems === 'number' ? source.maxItems : undefined
    if (typeof maxItems === 'number' && Number.isFinite(maxItems)) {
      schema.maxItems = maxItems
    }

    return schema
  }

  if (type === 'string') {
    const format = typeof source.format === 'string' ? source.format.trim().toLowerCase() : ''
    if (format === 'enum' && Array.isArray(source.enum)) {
      const enumValues = source.enum.filter((entry): entry is string => typeof entry === 'string')
      if (enumValues.length > 0) {
        schema.format = 'enum'
        schema.enum = enumValues
      }
    }
    return schema
  }

  if (type === 'number') {
    const format = typeof source.format === 'string' ? source.format.trim().toLowerCase() : ''
    if (format === 'float' || format === 'double') {
      schema.format = format
    }
  }

  return schema
}

function toNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
