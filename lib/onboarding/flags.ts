function parseFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }
  return fallback
}

export function isOnboardingV2Enabled(): boolean {
  return parseFlag(
    process.env.NEXT_PUBLIC_ONBOARDING_V2_ENABLED ?? process.env.ONBOARDING_V2_ENABLED,
    true
  )
}

export function isOnboardingWizardEnabled(): boolean {
  return parseFlag(
    process.env.NEXT_PUBLIC_ONBOARDING_WIZARD_ENABLED ?? process.env.ONBOARDING_WIZARD_ENABLED,
    true
  )
}

export function isOnboardingGuidedTestEnabled(): boolean {
  return parseFlag(
    process.env.NEXT_PUBLIC_ONBOARDING_GUIDED_TEST_ENABLED ?? process.env.ONBOARDING_GUIDED_TEST_ENABLED,
    true
  )
}
