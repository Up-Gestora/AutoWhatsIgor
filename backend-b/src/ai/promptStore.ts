import type { OpenAiMessage } from './openaiClient'

export type AiPromptEntry = {
  timestamp: string
  sessionId: string
  chatId: string
  model: string
  systemPrompt: string
  messages: OpenAiMessage[]
}

type AiPromptStoreOptions = {
  maxEntries?: number
}

export class AiPromptStore {
  private readonly maxEntries: number
  private entries: AiPromptEntry[] = []

  constructor(options: AiPromptStoreOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 100)
  }

  add(entry: AiPromptEntry): void {
    this.entries.unshift(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries)
    }
  }

  list(limit = 50): AiPromptEntry[] {
    const safeLimit = Math.max(1, Math.min(limit, this.maxEntries))
    return this.entries.slice(0, safeLimit)
  }

  clear(): void {
    this.entries = []
  }
}
