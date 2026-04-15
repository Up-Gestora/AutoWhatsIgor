import { auth } from '@/lib/firebase'
import { buildHttpErrorMessage, parseResponsePayload } from '@/lib/http-error'
import type { OnboardingEventName } from './types'

type EmitOnboardingEventInput = {
  eventName: OnboardingEventName
  sessionId?: string
  eventId?: string
  occurredAtMs?: number
  properties?: Record<string, unknown>
  authToken?: string
}

export async function emitOnboardingEvent(input: EmitOnboardingEventInput): Promise<void> {
  let token = typeof input.authToken === 'string' ? input.authToken.trim() : ''
  if (!token) {
    if (!auth?.currentUser) {
      throw new Error('auth_unavailable')
    }
    token = await auth.currentUser.getIdToken()
  }

  const eventName = input.eventName
  const payload = {
    eventId: input.eventId?.trim() || createEventId(),
    eventName,
    eventSource: 'frontend' as const,
    occurredAtMs: Number.isFinite(input.occurredAtMs) ? Number(input.occurredAtMs) : Date.now(),
    properties: input.properties ?? {},
    ...(input.sessionId ? { sessionId: input.sessionId } : {})
  }

  mirrorGtag(eventName, payload.properties)

  const response = await fetch('/api/onboarding/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const { payload, rawText } = await parseResponsePayload<Record<string, unknown>>(response)
    const message = buildHttpErrorMessage(response.status, payload, rawText)
    throw new Error(message)
  }
}

export async function emitOnboardingEventSafe(input: EmitOnboardingEventInput): Promise<void> {
  try {
    await emitOnboardingEvent(input)
  } catch (error) {
    console.warn('[onboarding] Failed to emit event:', (error as Error).message)
  }
}

function createEventId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function mirrorGtag(eventName: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const gtag = (window as any).gtag
    if (typeof gtag === 'function') {
      gtag('event', eventName, properties ?? {})
    }
  } catch {
    // GA mirror is best-effort and must never block.
  }
}
