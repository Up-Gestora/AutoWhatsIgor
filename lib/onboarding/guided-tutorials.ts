import type { RouteKey } from '@/lib/i18n/routes'

export const GUIDED_TUTORIAL_ORDER = [
  'connections',
  'training',
  'conversations',
  'leads',
  'clients',
  'calendar',
  'broadcasts',
  'files',
] as const

export type GuidedTutorialKey = (typeof GUIDED_TUTORIAL_ORDER)[number]

type GuidedTutorialProgressPayload = {
  completedKeys: GuidedTutorialKey[]
  updatedAt: number
}

const GUIDED_TUTORIAL_STORAGE_PREFIX = 'guided_tutorial_progress:v1:'

const DEFAULT_PROGRESS: GuidedTutorialProgressPayload = {
  completedKeys: [],
  updatedAt: 0,
}

export const GUIDED_TUTORIAL_ROUTE_KEYS: Record<GuidedTutorialKey, RouteKey> = {
  connections: 'connections',
  training: 'training',
  conversations: 'conversations',
  leads: 'leads',
  clients: 'clients',
  calendar: 'calendar',
  broadcasts: 'broadcasts',
  files: 'files',
}

export const GUIDED_TUTORIAL_TITLES: Record<GuidedTutorialKey, { pt: string; en: string }> = {
  connections: { pt: 'Conexões', en: 'Connections' },
  training: { pt: 'Treinamento', en: 'Training' },
  conversations: { pt: 'Conversas', en: 'Conversations' },
  leads: { pt: 'Leads', en: 'Leads' },
  clients: { pt: 'Clientes', en: 'Clients' },
  calendar: { pt: 'Agenda', en: 'Calendar' },
  broadcasts: { pt: 'Transmissão', en: 'Broadcasts' },
  files: { pt: 'Arquivos', en: 'Files' },
}

export function isGuidedTutorialKey(value: string | null | undefined): value is GuidedTutorialKey {
  if (!value) return false
  return (GUIDED_TUTORIAL_ORDER as readonly string[]).includes(value)
}

export function getGuidedTutorialNextKey(current: GuidedTutorialKey): GuidedTutorialKey | null {
  const currentIndex = GUIDED_TUTORIAL_ORDER.indexOf(current)
  if (currentIndex < 0) return null
  const next = GUIDED_TUTORIAL_ORDER[currentIndex + 1]
  return next ?? null
}

export function getGuidedTutorialStorageKey(userId: string) {
  return `${GUIDED_TUTORIAL_STORAGE_PREFIX}${userId}`
}

function safeParseProgress(raw: string | null): GuidedTutorialProgressPayload {
  if (!raw) return DEFAULT_PROGRESS

  try {
    const parsed = JSON.parse(raw) as Partial<GuidedTutorialProgressPayload>
    const completedKeys = Array.isArray(parsed.completedKeys)
      ? parsed.completedKeys.filter((key): key is GuidedTutorialKey => isGuidedTutorialKey(key))
      : []
    const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
    return {
      completedKeys: Array.from(new Set(completedKeys)),
      updatedAt,
    }
  } catch {
    return DEFAULT_PROGRESS
  }
}

export function readCompletedGuidedTutorials(userId: string): GuidedTutorialKey[] {
  if (typeof window === 'undefined') return []
  const key = getGuidedTutorialStorageKey(userId)
  const payload = safeParseProgress(window.localStorage.getItem(key))
  return payload.completedKeys
}

export function writeCompletedGuidedTutorials(userId: string, completedKeys: GuidedTutorialKey[]) {
  if (typeof window === 'undefined') return
  const key = getGuidedTutorialStorageKey(userId)
  const payload: GuidedTutorialProgressPayload = {
    completedKeys: Array.from(new Set(completedKeys.filter((value): value is GuidedTutorialKey => isGuidedTutorialKey(value)))),
    updatedAt: Date.now(),
  }
  window.localStorage.setItem(key, JSON.stringify(payload))
}

export function markGuidedTutorialCompleted(userId: string, tutorialKey: GuidedTutorialKey): GuidedTutorialKey[] {
  const current = readCompletedGuidedTutorials(userId)
  if (current.includes(tutorialKey)) {
    return current
  }

  const next = [...current, tutorialKey]
  writeCompletedGuidedTutorials(userId, next)
  return next
}

export function markGuidedTutorialPending(userId: string, tutorialKey: GuidedTutorialKey): GuidedTutorialKey[] {
  const current = readCompletedGuidedTutorials(userId)
  if (!current.includes(tutorialKey)) {
    return current
  }

  const next = current.filter((key) => key !== tutorialKey)
  writeCompletedGuidedTutorials(userId, next)
  return next
}
