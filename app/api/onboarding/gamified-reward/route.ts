import { NextResponse } from 'next/server'
import { getBackendAdminKey, resolveBackendUrl } from '@/lib/adminBackend'
import { requireUser } from '@/lib/userBackend'

export const runtime = 'nodejs'

const ONBOARDING_REWARD_BRL = 5
const ONBOARDING_REWARD_EVENT_VERSION = 'v1'

type BackendMilestoneState = {
  reached?: boolean
}

type BackendOnboardingStatePayload = {
  success?: boolean
  state?: {
    trainingScore?: number
    milestones?: {
      whatsapp_connected?: BackendMilestoneState
      training_score_70_reached?: BackendMilestoneState
      first_ai_response_sent?: BackendMilestoneState
    }
  }
}

type BackendOnboardingEventPayload = {
  success?: boolean
  recorded?: boolean
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth instanceof NextResponse) {
    return auth
  }

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl) {
    return NextResponse.json({ error: 'backend_url_missing' }, { status: 500 })
  }
  if (!adminKey) {
    return NextResponse.json({ error: 'backend_admin_key_missing' }, { status: 500 })
  }

  const sessionId = auth.uid

  const onboardingStateResponse = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(sessionId)}/onboarding/state`,
    {
      headers: {
        'x-admin-key': adminKey
      },
      cache: 'no-store'
    }
  )
  const onboardingStatePayload = (await onboardingStateResponse
    .json()
    .catch(() => null)) as BackendOnboardingStatePayload | null

  if (!onboardingStateResponse.ok) {
    const error = onboardingStatePayload && 'error' in onboardingStatePayload
      ? String((onboardingStatePayload as { error?: unknown }).error ?? 'backend_request_failed')
      : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const milestones = onboardingStatePayload?.state?.milestones
  const trainingScore = Number(onboardingStatePayload?.state?.trainingScore ?? NaN)
  const completedAllRequirements =
    milestones?.whatsapp_connected?.reached === true &&
    milestones?.training_score_70_reached?.reached === true &&
    milestones?.first_ai_response_sent?.reached === true &&
    Number.isFinite(trainingScore) &&
    trainingScore >= 70

  if (!completedAllRequirements) {
    return NextResponse.json(
      {
        error: 'onboarding_not_complete',
        requirements: {
          whatsappConnected: milestones?.whatsapp_connected?.reached === true,
          trainingScore70: milestones?.training_score_70_reached?.reached === true,
          firstAiResponseSent: milestones?.first_ai_response_sent?.reached === true
        }
      },
      { status: 409 }
    )
  }

  const eventId = `onboarding-gamified-reward:${ONBOARDING_REWARD_EVENT_VERSION}:${sessionId}`
  const eventResponse = await fetch(
    `${backendUrl}/sessions/${encodeURIComponent(sessionId)}/onboarding/events`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        eventId,
        eventName: 'onboarding_step_completed',
        eventSource: 'frontend',
        occurredAtMs: Date.now(),
        properties: {
          step: 'gamified_reward_claim',
          version: ONBOARDING_REWARD_EVENT_VERSION
        }
      })
    }
  )
  const eventPayload = (await eventResponse
    .json()
    .catch(() => null)) as BackendOnboardingEventPayload | null

  if (!eventResponse.ok) {
    const error =
      eventPayload && 'error' in eventPayload
        ? String((eventPayload as { error?: unknown }).error ?? 'backend_request_failed')
        : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  const shouldGrantReward = eventPayload?.recorded === true

  if (shouldGrantReward) {
    const grantResponse = await fetch(`${backendUrl}/sessions/${encodeURIComponent(sessionId)}/credits`, {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        mode: 'adjust',
        amountBrl: ONBOARDING_REWARD_BRL,
        reason: `onboarding_gamified_reward_${ONBOARDING_REWARD_EVENT_VERSION}`,
        actorId: 'system_onboarding_gamified'
      })
    })
    const grantPayload = await grantResponse.json().catch(() => null)
    if (!grantResponse.ok) {
      const error = grantPayload?.error ? String(grantPayload.error) : 'backend_request_failed'
      return NextResponse.json({ error }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      claimed: true,
      rewardBrl: ONBOARDING_REWARD_BRL,
      credits: grantPayload?.credits ?? null
    })
  }

  const currentCreditsResponse = await fetch(`${backendUrl}/sessions/${encodeURIComponent(sessionId)}/credits`, {
    headers: {
      'x-admin-key': adminKey
    },
    cache: 'no-store'
  })
  const currentCreditsPayload = await currentCreditsResponse.json().catch(() => null)
  if (!currentCreditsResponse.ok) {
    const error = currentCreditsPayload?.error
      ? String(currentCreditsPayload.error)
      : 'backend_request_failed'
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    claimed: false,
    rewardBrl: ONBOARDING_REWARD_BRL,
    credits: currentCreditsPayload?.credits ?? null
  })
}
