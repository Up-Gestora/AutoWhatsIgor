import type { AppEnv } from '../config/env'
import { parseBusinessHours } from './policy'
import type { AiConfig, AiConfigOverride } from './types'

const CONTEXT_MAX_MESSAGES_DEFAULT = 20
const CONTEXT_MAX_MESSAGES_MIN = 10
const CONTEXT_MAX_MESSAGES_MAX = 100

function normalizeContextMaxMessages(value: unknown, fallback: number): number {
  const resolvedFallback =
    Number.isFinite(fallback) && Number.isInteger(fallback)
      ? clampInt(fallback, CONTEXT_MAX_MESSAGES_MIN, CONTEXT_MAX_MESSAGES_MAX)
      : CONTEXT_MAX_MESSAGES_DEFAULT

  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return resolvedFallback
  }

  return clampInt(num, CONTEXT_MAX_MESSAGES_MIN, CONTEXT_MAX_MESSAGES_MAX)
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function buildDefaultAiConfig(env: AppEnv): AiConfig {
  const defaultModel = env.AI_PROVIDER === 'google' ? env.AI_GEMINI_MODEL : env.AI_MODEL
  return {
    enabled: env.AI_ENABLED,
    respondInGroups: env.AI_RESPOND_IN_GROUPS,
    provider: env.AI_PROVIDER,
    model: defaultModel,
    temperature: env.AI_TEMPERATURE,
    maxTokens: env.AI_MAX_TOKENS,
    systemPrompt: env.AI_SYSTEM_PROMPT,
    fallbackMode: env.AI_FALLBACK_MODE,
    fallbackText: env.AI_FALLBACK_TEXT,
    optOutKeywords: parseCsv(env.AI_OPT_OUT_KEYWORDS),
    optInKeywords: parseCsv(env.AI_OPT_IN_KEYWORDS),
    contextMaxMessages: normalizeContextMaxMessages(env.AI_CONTEXT_MAX_MESSAGES, CONTEXT_MAX_MESSAGES_DEFAULT),
    contextTtlSec: Math.max(300, env.AI_CONTEXT_TTL_SEC),
    processingTimeoutMs: Math.max(60000, env.AI_PROCESSING_TIMEOUT_MS),
    businessHours: parseBusinessHours(env.AI_BUSINESS_HOURS, env.AI_TIMEZONE),
    training: undefined
  }
}

export function mergeAiConfig(defaults: AiConfig, override?: AiConfigOverride | null): AiConfig {
  if (!override) {
    return defaults
  }

  const { responderGrupos, ...overrideRest } = override
  const hideGroups = override.training?.esconderGrupos === true
  const respondInGroups = hideGroups
    ? false
    : override.respondInGroups ?? responderGrupos ?? defaults.respondInGroups

  return {
    ...defaults,
    ...overrideRest,
    respondInGroups,
    optOutKeywords: override.optOutKeywords ?? defaults.optOutKeywords,
    optInKeywords: override.optInKeywords ?? defaults.optInKeywords,
    businessHours: override.businessHours ?? defaults.businessHours,
    training: override.training ?? defaults.training,
    contextMaxMessages: normalizeContextMaxMessages((override as any).contextMaxMessages, defaults.contextMaxMessages),
    contextTtlSec: Math.max(300, override.contextTtlSec ?? defaults.contextTtlSec),
    processingTimeoutMs: Math.max(60000, override.processingTimeoutMs ?? defaults.processingTimeoutMs)
  }
}

function parseCsv(value?: string) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}
