import assert from 'node:assert/strict'
import test from 'node:test'
import { OnboardingNurtureService } from '../src/onboarding/nurtureService'

test('OnboardingNurtureService enrolls signup event with whatsapp from event properties', async () => {
  const upsertCalls: any[] = []

  const service = new OnboardingNurtureService({
    enabled: true,
    senderSessionId: 'sender-igsartor',
    senderEmail: 'igsartor@icloud.com',
    defaultCountryCode: '55',
    brStripNinthDigit: false,
    now: () => 1_760_000_000_000,
    leadStore: {
      get: async () => null,
      upsertFromClient: async (input: any) => {
        upsertCalls.push(input)
        return {
          id: input.leadId,
          sessionId: input.sessionId,
          status: 'em_processo',
          nextContact: input.nextContactAtMs,
          lastContact: input.lastContactAtMs,
          createdAt: input.createdAtMs,
          source: input.source,
          campaign: {
            type: input.campaignType,
            targetSessionId: input.campaignTargetSessionId,
            attempt: input.campaignAttempt
          }
        } as any
      },
      update: async () => null
    } as any
  })

  const result = await service.handleOnboardingEvent({
    sessionId: 'target-session-1',
    eventName: 'signup_completed',
    properties: {
      whatsapp: '(11) 99999-9999'
    }
  })

  assert.equal(result.enrolled, true)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].sessionId, 'sender-igsartor')
  assert.equal(upsertCalls[0].leadId, '5511999999999@s.whatsapp.net')
  assert.equal(upsertCalls[0].chatId, '5511999999999@s.whatsapp.net')
  assert.equal(upsertCalls[0].campaignType, 'onboarding_activation')
  assert.equal(upsertCalls[0].campaignTargetSessionId, 'target-session-1')
  assert.equal(upsertCalls[0].campaignAttempt, 0)
  assert.equal(upsertCalls[0].nextContactAtMs, 1_760_000_000_000)
})

test('OnboardingNurtureService enrolls whatsapp_saved fallback from profile when event has no whatsapp', async () => {
  const upsertCalls: any[] = []

  const service = new OnboardingNurtureService({
    enabled: true,
    senderSessionId: 'sender-igsartor',
    defaultCountryCode: '55',
    brStripNinthDigit: false,
    now: () => 1_760_000_000_000,
    leadStore: {
      get: async () => null,
      upsertFromClient: async (input: any) => {
        upsertCalls.push(input)
        return {
          id: input.leadId,
          sessionId: input.sessionId,
          status: 'em_processo',
          nextContact: input.nextContactAtMs,
          lastContact: input.lastContactAtMs,
          createdAt: input.createdAtMs,
          source: input.source,
          campaign: {
            type: input.campaignType,
            targetSessionId: input.campaignTargetSessionId,
            attempt: input.campaignAttempt
          }
        } as any
      },
      update: async () => null
    } as any,
    profileResolver: {
      getUserProfile: async () => ({
        name: 'Conta Teste',
        email: 'teste@example.com',
        whatsapp: null,
        telefone: '(43) 98846-2272'
      })
    }
  })

  const result = await service.handleOnboardingEvent({
    sessionId: 'target-session-2',
    eventName: 'whatsapp_saved',
    properties: {}
  })

  assert.equal(result.enrolled, true)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].leadId, '5543988462272@s.whatsapp.net')
  assert.equal(upsertCalls[0].campaignTargetSessionId, 'target-session-2')
})

test('OnboardingNurtureService keeps campaign attempt and next contact on repeated enrollments', async () => {
  const upsertCalls: any[] = []

  const service = new OnboardingNurtureService({
    enabled: true,
    senderSessionId: 'sender-igsartor',
    defaultCountryCode: '55',
    brStripNinthDigit: false,
    now: () => 1_760_000_000_000,
    leadStore: {
      get: async () =>
        ({
          id: '5511999999999@s.whatsapp.net',
          sessionId: 'sender-igsartor',
          name: 'Lead Existente',
          whatsapp: '5511999999999',
          chatId: '5511999999999@s.whatsapp.net',
          status: 'em_processo',
          lastContact: 1_760_000_000_000,
          nextContact: 1_760_100_000_000,
          observations: 'obs',
          createdAt: 1_759_000_000_000,
          lastMessage: null,
          source: 'autowhats_onboarding',
          updatedAt: 1_760_000_000_000,
          campaign: {
            type: 'onboarding_activation',
            targetSessionId: 'target-session-3',
            attempt: 3
          }
        }) as any,
      upsertFromClient: async (input: any) => {
        upsertCalls.push(input)
        return {
          id: input.leadId,
          sessionId: input.sessionId,
          status: 'em_processo',
          nextContact: input.nextContactAtMs,
          lastContact: input.lastContactAtMs,
          createdAt: input.createdAtMs,
          source: input.source,
          campaign: {
            type: input.campaignType,
            targetSessionId: input.campaignTargetSessionId,
            attempt: input.campaignAttempt
          }
        } as any
      },
      update: async () => null
    } as any
  })

  const result = await service.handleOnboardingEvent({
    sessionId: 'target-session-3',
    eventName: 'signup_completed',
    properties: {
      whatsapp: '5511999999999'
    }
  })

  assert.equal(result.enrolled, true)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].campaignAttempt, 3)
  assert.equal(upsertCalls[0].nextContactAtMs, 1_760_100_000_000)
})
