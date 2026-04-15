import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDefaultAiConfig, mergeAiConfig } from '../src/ai/config'
import type { AiConfig } from '../src/ai/types'

const defaults: AiConfig = {
  enabled: true,
  respondInGroups: false,
  provider: 'openai',
  model: 'gpt-test',
  temperature: 0,
  maxTokens: 500,
  systemPrompt: '',
  fallbackMode: 'silence',
  fallbackText: '',
  optOutKeywords: [],
  optInKeywords: [],
  contextMaxMessages: 20,
  contextTtlSec: 600,
  processingTimeoutMs: 60000,
  businessHours: undefined,
  training: undefined
}

test('mergeAiConfig clamps contextMaxMessages to min 10', () => {
  const merged = mergeAiConfig(defaults, { contextMaxMessages: 5 } as any)
  assert.equal(merged.contextMaxMessages, 10)
})

test('mergeAiConfig clamps contextMaxMessages to max 100', () => {
  const merged = mergeAiConfig(defaults, { contextMaxMessages: 999 } as any)
  assert.equal(merged.contextMaxMessages, 100)
})

test('mergeAiConfig ignores invalid contextMaxMessages and keeps defaults', () => {
  const merged = mergeAiConfig(defaults, { contextMaxMessages: 'abc' } as any)
  assert.equal(merged.contextMaxMessages, 20)
})

test('buildDefaultAiConfig clamps env AI_CONTEXT_MAX_MESSAGES to min/max', () => {
  const env = {
    AI_PROVIDER: 'openai',
    AI_GEMINI_MODEL: 'gemini-test',
    AI_MODEL: 'gpt-test',
    AI_ENABLED: true,
    AI_RESPOND_IN_GROUPS: false,
    AI_TEMPERATURE: 0,
    AI_MAX_TOKENS: 500,
    AI_SYSTEM_PROMPT: '',
    AI_FALLBACK_MODE: 'silence',
    AI_FALLBACK_TEXT: '',
    AI_OPT_OUT_KEYWORDS: '',
    AI_OPT_IN_KEYWORDS: '',
    AI_CONTEXT_MAX_MESSAGES: 5,
    AI_CONTEXT_TTL_SEC: 600,
    AI_PROCESSING_TIMEOUT_MS: 60000,
    AI_BUSINESS_HOURS: '',
    AI_TIMEZONE: 'America/Sao_Paulo'
  } as any

  assert.equal(buildDefaultAiConfig({ ...env, AI_CONTEXT_MAX_MESSAGES: 5 }).contextMaxMessages, 10)
  assert.equal(buildDefaultAiConfig({ ...env, AI_CONTEXT_MAX_MESSAGES: 20 }).contextMaxMessages, 20)
  assert.equal(buildDefaultAiConfig({ ...env, AI_CONTEXT_MAX_MESSAGES: 200 }).contextMaxMessages, 100)
})

