export type OnboardingEventName =
  | 'paid_landing_viewed'
  | 'signup_started'
  | 'signup_completed'
  | 'dashboard_home_viewed'
  | 'whatsapp_saved'
  | 'whatsapp_connected'
  | 'training_score_updated'
  | 'training_score_70_reached'
  | 'ai_enabled'
  | 'first_ai_response_sent'
  | 'account_activated_7d'
  | 'onboarding_soft_block_override_confirmed'
  | 'onboarding_draft_started'
  | 'onboarding_step_completed'
  | 'guided_test_message_sent'
  | 'guided_test_change_requested'
  | 'guided_test_change_applied'
  | 'onboarding_publish_confirmed'
  | 'onboarding_connect_completed'
  | 'onboarding_activation_completed'
  | 'guided_test_started'
  | 'guided_test_passed'
  | 'guided_test_failed'
  | 'onboarding_save_conflict'
  | 'onboarding_validation_run'
  | 'onboarding_validation_passed'
  | 'onboarding_validation_failed'
  | 'onboarding_publish_blocked_unsaved'

export type OnboardingMilestoneId =
  | 'signup_completed'
  | 'whatsapp_saved'
  | 'whatsapp_connected'
  | 'training_score_70_reached'
  | 'ai_enabled'
  | 'first_ai_response_sent'

export type OnboardingNextAction = {
  id: string
  title: string
  description: string
  routeKey:
    | 'dashboard_home'
    | 'connections'
    | 'conversations'
    | 'training'
    | 'settings'
    | 'leads'
    | 'onboarding_setup'
  ctaLabel: string
  query?: Record<string, string>
}

export type OnboardingState = {
  sessionId: string
  activationDefinition: 'first_ai_response_sent'
  trainingScore: number
  progressPercent: number
  milestones: Record<
    OnboardingMilestoneId,
    {
      reached: boolean
      atMs: number | null
    }
  >
  nextAction: OnboardingNextAction | null
}

export type TrainingVerticalTemplateId =
  | 'clinica_estetica'
  | 'odontologia'
  | 'imobiliaria'
  | 'oficina_auto'
  | 'advocacia'

export type TrainingVerticalTemplate = {
  id: TrainingVerticalTemplateId
  label: string
  description: string
  values: Record<string, string>
}

export type GuidedTestResult = {
  passed: boolean
  checks: Array<{
    id: 'no_na' | 'has_cta' | 'short_message' | 'service_reference' | 'safe_behavior'
    passed: boolean
  }>
  transcript: Array<{
    role: 'user' | 'assistant'
    text: string
  }>
}

export type OnboardingGuidedValidation = {
  status: 'idle' | 'passed' | 'failed'
  draftVersion: number | null
  lastRunAtMs: number | null
  checks: Array<{
    id: 'no_na' | 'has_cta' | 'short_message' | 'service_reference' | 'safe_behavior'
    passed: boolean
  }>
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
  transcript: Array<{
    role: 'user' | 'assistant'
    text: string
  }>
  createdAtMs: number
  updatedAtMs: number
}

export type OnboardingReadiness = {
  ready: boolean
  score: number
  hints: Array<{
    field: 'empresa' | 'descricaoServicosProdutosVendidos' | 'orientacoesGerais'
    label: string
    missing: boolean
  }>
}

export type OnboardingCreditsSnapshot = {
  balanceBrl: number
  blockedReason: string | null
  updatedAtMs: number
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

export type OnboardingGuidedTestChangeProposal = {
  id: string
  summary: string
  rationale: string | null
  patch: Record<string, unknown>
  impactedFields: string[]
  preview: Array<{
    field: string
    before: string | number | boolean | null
    after: string | number | boolean | null
  }>
}

export type OnboardingPublishResult = {
  status: 'published' | 'pending_connection' | 'activated'
  enabled: boolean
  trainingScore: number
  connectionStatus: 'connected' | 'pending'
  draft: OnboardingDraft
}
