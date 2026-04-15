export const ONBOARDING_EVENT_NAMES = [
  'paid_landing_viewed',
  'signup_started',
  'signup_completed',
  'dashboard_home_viewed',
  'whatsapp_saved',
  'whatsapp_connected',
  'training_score_updated',
  'training_score_70_reached',
  'ai_enabled',
  'first_ai_response_sent',
  'account_activated_7d',
  'onboarding_soft_block_override_confirmed',
  'onboarding_draft_started',
  'onboarding_step_completed',
  'guided_test_message_sent',
  'guided_test_change_requested',
  'guided_test_change_applied',
  'onboarding_publish_confirmed',
  'onboarding_connect_completed',
  'onboarding_activation_completed',
  'guided_test_started',
  'guided_test_passed',
  'guided_test_failed',
  'onboarding_save_conflict',
  'onboarding_validation_run',
  'onboarding_validation_passed',
  'onboarding_validation_failed',
  'onboarding_publish_blocked_unsaved'
] as const

export type OnboardingEventName = (typeof ONBOARDING_EVENT_NAMES)[number]

export type OnboardingEventSource = 'frontend' | 'backend' | 'system'

export type OnboardingEventRecord = {
  id: number
  sessionId: string
  eventId: string
  eventName: OnboardingEventName
  eventSource: OnboardingEventSource
  occurredAtMs: number
  properties: Record<string, unknown>
  createdAtMs: number
}

export type OnboardingEventInput = {
  sessionId: string
  eventId: string
  eventName: OnboardingEventName
  eventSource: OnboardingEventSource
  occurredAtMs: number
  properties?: Record<string, unknown>
}

export const ONBOARDING_MILESTONES = [
  'signup_completed',
  'whatsapp_saved',
  'whatsapp_connected',
  'training_score_70_reached',
  'ai_enabled',
  'first_ai_response_sent'
] as const

export type OnboardingMilestoneId = (typeof ONBOARDING_MILESTONES)[number]

export type OnboardingMilestoneState = {
  reached: boolean
  atMs: number | null
}

export type OnboardingRouteKey =
  | 'dashboard_home'
  | 'connections'
  | 'conversations'
  | 'training'
  | 'settings'
  | 'leads'
  | 'onboarding_setup'

export type OnboardingNextAction = {
  id: string
  title: string
  description: string
  routeKey: OnboardingRouteKey
  ctaLabel: string
  query?: Record<string, string>
}

export type OnboardingState = {
  sessionId: string
  activationDefinition: 'first_ai_response_sent'
  trainingScore: number
  progressPercent: number
  milestones: Record<OnboardingMilestoneId, OnboardingMilestoneState>
  nextAction: OnboardingNextAction | null
}

export type OnboardingCohort = 'day' | 'week' | 'month'

export type OnboardingFunnelCohort = {
  cohortStartMs: number
  signups: number
  stageCounts: {
    whatsapp_saved: number
    whatsapp_connected: number
    training_score_70_reached: number
    ai_enabled: number
    first_ai_response_sent: number
  }
  conversionToActivated: number
}

export type AcquisitionFunnelGroupBy = 'campaign'

export type AcquisitionFunnelRow = {
  cohortStartMs: number
  campaignKey: string
  sourceKey: string
  signups: number
  stageCounts: {
    whatsapp_connected: number
    training_score_70_reached: number
    first_ai_response_sent: number
    account_activated_7d: number
  }
  rates: {
    signup_to_whatsapp_connected: number
    signup_to_training_score_70_reached: number
    signup_to_first_ai_response_sent: number
    activation_7d: number
  }
}

export type Activation7dSummary = {
  signups: number
  activatedWithin7d: number
  activation7dRate: number
}

export const GUIDED_TEST_CHECK_IDS = [
  'no_na',
  'has_cta',
  'short_message',
  'service_reference',
  'safe_behavior'
] as const

export type GuidedTestCheckId = (typeof GUIDED_TEST_CHECK_IDS)[number]

export type GuidedTestCheckResult = {
  id: GuidedTestCheckId
  passed: boolean
}

export type GuidedTestTranscriptEntry = {
  role: 'user' | 'assistant'
  text: string
}

export type GuidedTestResult = {
  passed: boolean
  checks: GuidedTestCheckResult[]
  transcript: GuidedTestTranscriptEntry[]
}

export type OnboardingGuidedValidationStatus = 'idle' | 'passed' | 'failed'

export type OnboardingGuidedValidation = {
  status: OnboardingGuidedValidationStatus
  draftVersion: number | null
  lastRunAtMs: number | null
  checks: GuidedTestCheckResult[]
}

export type OnboardingDraftStep = 1 | 2 | 3 | 4 | 5

export type OnboardingDraft = {
  version: number
  updatedAtMs: number
  training: Record<string, unknown>
}

export type OnboardingGuidedTestSession = {
  id: string
  scenarioId: string | null
  transcript: GuidedTestTranscriptEntry[]
  createdAtMs: number
  updatedAtMs: number
}

export type OnboardingDraftState = {
  sessionId: string
  currentStep: OnboardingDraftStep
  selectedTemplateId: string | null
  draft: OnboardingDraft
  guidedTestSession: OnboardingGuidedTestSession | null
  guidedValidation: OnboardingGuidedValidation
}

export type OnboardingReadinessField = 'empresa' | 'descricaoServicosProdutosVendidos' | 'orientacoesGerais'

export type OnboardingReadinessHint = {
  field: OnboardingReadinessField
  label: string
  missing: boolean
}

export type OnboardingReadiness = {
  ready: boolean
  score: number
  hints: OnboardingReadinessHint[]
}

export type OnboardingCreditsSnapshot = {
  balanceBrl: number
  blockedReason: string | null
  updatedAtMs: number
}

export type OnboardingGuidedTestUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  costBrl: number
  pricingMissing: boolean
}

export type OnboardingGuidedTestMessageResult = {
  testSessionId: string
  assistantMessage: string
  assistantParts: string[]
  usage: OnboardingGuidedTestUsage
  remainingCredits: number
  readiness: OnboardingReadiness
}

export type OnboardingGuidedTestChangePreview = {
  field: string
  before: string | number | boolean | null
  after: string | number | boolean | null
}

export type OnboardingGuidedTestChangeProposal = {
  id: string
  summary: string
  rationale: string | null
  patch: Record<string, unknown>
  impactedFields: string[]
  preview: OnboardingGuidedTestChangePreview[]
}

export type OnboardingDraftPayload = {
  draft: OnboardingDraft
  currentStep: OnboardingDraftStep
  selectedTemplateId: string | null
  guidedTestSession: OnboardingGuidedTestSession | null
  guidedValidation: OnboardingGuidedValidation
  readiness: OnboardingReadiness
  credits: OnboardingCreditsSnapshot | null
}

export type OnboardingPublishResult = {
  status: 'published' | 'pending_connection' | 'activated'
  enabled: boolean
  trainingScore: number
  connectionStatus: 'connected' | 'pending'
  draft: OnboardingDraft
}
