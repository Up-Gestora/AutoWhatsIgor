export type ToolUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type AiToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCall = {
  id: string
  name: string
  argumentsJson: string
  geminiThoughtSignature?: string
}

export type ToolChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

export type ToolModelResult =
  | { type: 'final'; content: string; usage?: ToolUsage }
  | { type: 'tool_calls'; content: string; toolCalls: ToolCall[]; usage?: ToolUsage }

