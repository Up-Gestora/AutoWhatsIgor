'use client'

export type AcquisitionTouch = {
  source: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  landingPath: string
  firstSeenAtMs: number
  lastSeenAtMs: number
}

export type AcquisitionSnapshot = {
  firstTouch: AcquisitionTouch
  lastTouch: AcquisitionTouch
  source: string
  hasCampaignSignals: boolean
  experiments?: Record<string, string>
}

const ATTR_STORAGE_KEY = 'aw_attr_v1'
const EXPERIMENT_STORAGE_KEY = 'aw_exp_v1'
const VISITOR_STORAGE_KEY = 'aw_vid_v1'
const SIGNUP_EXPERIMENT_KEY = 'signup_copy_v1'
const LANDING_EXPERIMENT_KEY = 'landing_hero_v1'

const CAMPAIGN_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
const CLICK_ID_PARAMS = ['gclid', 'gbraid', 'wbraid', 'fbclid'] as const

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

export function isPaidAttributionV1Enabled(): boolean {
  return parseFlag(
    process.env.NEXT_PUBLIC_PAID_ATTRIBUTION_V1_ENABLED ?? process.env.PAID_ATTRIBUTION_V1_ENABLED,
    false
  )
}

export function isPaidCroAbEnabled(): boolean {
  return parseFlag(process.env.NEXT_PUBLIC_PAID_CRO_AB_ENABLED ?? process.env.PAID_CRO_AB_ENABLED, false)
}

export function getLandingExperimentKey() {
  return LANDING_EXPERIMENT_KEY
}

export function getSignupExperimentKey() {
  return SIGNUP_EXPERIMENT_KEY
}

function nowMs(): number {
  return Date.now()
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore write failures (private mode, storage quota, etc).
  }
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseQueryParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)
  return sanitizeText(value)
}

function normalizeSource(
  utmSource: string | undefined,
  clickIds: {
    gclid?: string
    gbraid?: string
    wbraid?: string
    fbclid?: string
  }
): string {
  if (utmSource) {
    return utmSource.toLowerCase()
  }
  if (clickIds.gclid || clickIds.gbraid || clickIds.wbraid) {
    return 'google_ads'
  }
  if (clickIds.fbclid) {
    return 'meta_ads'
  }
  return 'direct'
}

function hasAnyCampaignSignal(touch: AcquisitionTouch): boolean {
  return Boolean(
    touch.medium ||
      touch.campaign ||
      touch.content ||
      touch.term ||
      touch.gclid ||
      touch.gbraid ||
      touch.wbraid ||
      touch.fbclid ||
      (touch.source && touch.source !== 'direct')
  )
}

function buildTouchFromCurrentLocation(): AcquisitionTouch {
  const now = nowMs()
  if (typeof window === 'undefined') {
    return {
      source: 'direct',
      landingPath: '/',
      firstSeenAtMs: now,
      lastSeenAtMs: now
    }
  }

  const params = new URLSearchParams(window.location.search || '')
  const utmSource = parseQueryParam(params, 'utm_source')
  const utmMedium = parseQueryParam(params, 'utm_medium')
  const utmCampaign = parseQueryParam(params, 'utm_campaign')
  const utmContent = parseQueryParam(params, 'utm_content')
  const utmTerm = parseQueryParam(params, 'utm_term')

  const gclid = parseQueryParam(params, 'gclid')
  const gbraid = parseQueryParam(params, 'gbraid')
  const wbraid = parseQueryParam(params, 'wbraid')
  const fbclid = parseQueryParam(params, 'fbclid')

  return {
    source: normalizeSource(utmSource, { gclid, gbraid, wbraid, fbclid }),
    medium: utmMedium,
    campaign: utmCampaign,
    content: utmContent,
    term: utmTerm,
    gclid,
    gbraid,
    wbraid,
    fbclid,
    landingPath: window.location.pathname || '/',
    firstSeenAtMs: now,
    lastSeenAtMs: now
  }
}

function readExperimentAssignments(): Record<string, string> {
  const raw = readJson<Record<string, unknown>>(EXPERIMENT_STORAGE_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const safeKey = sanitizeText(key)
    const safeValue = sanitizeText(value)
    if (!safeKey || !safeValue) {
      continue
    }
    result[safeKey] = safeValue
  }
  return result
}

function getOrCreateVisitorId(): string {
  const current = sanitizeText(readJson<string>(VISITOR_STORAGE_KEY))
  if (current) {
    return current
  }

  const next =
    (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`) ?? `${Date.now()}-fallback`
  writeJson(VISITOR_STORAGE_KEY, next)
  return next
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function assignPaidAbVariant(experimentKey: string): 'variant_a' | 'variant_b' {
  const safeExperimentKey = sanitizeText(experimentKey) ?? 'default_experiment'
  const assignments = readExperimentAssignments()
  const existing = sanitizeText(assignments[safeExperimentKey])
  if (existing === 'variant_a' || existing === 'variant_b') {
    return existing
  }

  const visitorId = getOrCreateVisitorId()
  const hash = hashString(`${safeExperimentKey}:${visitorId}`)
  const variant = hash % 2 === 0 ? 'variant_a' : 'variant_b'
  assignments[safeExperimentKey] = variant
  writeJson(EXPERIMENT_STORAGE_KEY, assignments)
  return variant
}

export function getPaidAbVariant(experimentKey: string): 'variant_a' | 'variant_b' | null {
  const safeExperimentKey = sanitizeText(experimentKey)
  if (!safeExperimentKey) {
    return null
  }
  const assignments = readExperimentAssignments()
  const existing = sanitizeText(assignments[safeExperimentKey])
  if (existing === 'variant_a' || existing === 'variant_b') {
    return existing
  }
  return null
}

function sanitizeTouch(raw: unknown): AcquisitionTouch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const sourceObj = raw as Record<string, unknown>
  const source = sanitizeText(sourceObj.source) ?? 'direct'
  const landingPath = sanitizeText(sourceObj.landingPath) ?? '/'
  const firstSeenAtMs = Number(sourceObj.firstSeenAtMs)
  const lastSeenAtMs = Number(sourceObj.lastSeenAtMs)
  return {
    source,
    medium: sanitizeText(sourceObj.medium),
    campaign: sanitizeText(sourceObj.campaign),
    content: sanitizeText(sourceObj.content),
    term: sanitizeText(sourceObj.term),
    gclid: sanitizeText(sourceObj.gclid),
    gbraid: sanitizeText(sourceObj.gbraid),
    wbraid: sanitizeText(sourceObj.wbraid),
    fbclid: sanitizeText(sourceObj.fbclid),
    landingPath,
    firstSeenAtMs: Number.isFinite(firstSeenAtMs) ? firstSeenAtMs : nowMs(),
    lastSeenAtMs: Number.isFinite(lastSeenAtMs) ? lastSeenAtMs : nowMs()
  }
}

function sanitizeSnapshot(raw: unknown): AcquisitionSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const sourceObj = raw as Record<string, unknown>
  const firstTouch = sanitizeTouch(sourceObj.firstTouch)
  const lastTouch = sanitizeTouch(sourceObj.lastTouch)
  if (!firstTouch || !lastTouch) {
    return null
  }
  const source = sanitizeText(sourceObj.source) ?? lastTouch.source ?? firstTouch.source
  return {
    firstTouch,
    lastTouch,
    source,
    hasCampaignSignals: hasAnyCampaignSignal(lastTouch),
    experiments: readExperimentAssignments()
  }
}

export function getAcquisitionSnapshot(): AcquisitionSnapshot | null {
  const snapshot = sanitizeSnapshot(readJson<AcquisitionSnapshot>(ATTR_STORAGE_KEY))
  if (!snapshot) {
    return null
  }
  return {
    ...snapshot,
    experiments: readExperimentAssignments()
  }
}

export function captureAcquisitionAttributionFromCurrentLocation(): AcquisitionSnapshot | null {
  if (!isPaidAttributionV1Enabled()) {
    return null
  }

  const existing = getAcquisitionSnapshot()
  const touch = buildTouchFromCurrentLocation()
  const experiments = readExperimentAssignments()

  if (!existing) {
    const created: AcquisitionSnapshot = {
      firstTouch: touch,
      lastTouch: touch,
      source: touch.source,
      hasCampaignSignals: hasAnyCampaignSignal(touch),
      experiments
    }
    writeJson(ATTR_STORAGE_KEY, created)
    return created
  }

  const shouldUpdateLastTouch = hasAnyCampaignSignal(touch)
  const nextLastTouch = shouldUpdateLastTouch
    ? {
        ...touch,
        firstSeenAtMs: existing.lastTouch.firstSeenAtMs,
        lastSeenAtMs: nowMs()
      }
    : existing.lastTouch

  const updated: AcquisitionSnapshot = {
    firstTouch: existing.firstTouch,
    lastTouch: nextLastTouch,
    source: nextLastTouch.source || existing.source || 'direct',
    hasCampaignSignals: hasAnyCampaignSignal(nextLastTouch),
    experiments
  }

  writeJson(ATTR_STORAGE_KEY, updated)
  return updated
}

export function buildAcquisitionEventProperties(
  snapshot: AcquisitionSnapshot | null,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const source = snapshot?.lastTouch.source ?? snapshot?.firstTouch.source ?? 'direct'
  if (!snapshot) {
    return {
      ...extra,
      acquisition: {
        source: 'direct'
      }
    }
  }

  const attribution = {
    source,
    medium: snapshot.lastTouch.medium ?? null,
    campaign: snapshot.lastTouch.campaign ?? null,
    content: snapshot.lastTouch.content ?? null,
    term: snapshot.lastTouch.term ?? null,
    gclid: snapshot.lastTouch.gclid ?? null,
    gbraid: snapshot.lastTouch.gbraid ?? null,
    wbraid: snapshot.lastTouch.wbraid ?? null,
    fbclid: snapshot.lastTouch.fbclid ?? null,
    landingPath: snapshot.lastTouch.landingPath ?? snapshot.firstTouch.landingPath ?? '/',
    firstSeenAtMs: snapshot.firstTouch.firstSeenAtMs,
    lastSeenAtMs: snapshot.lastTouch.lastSeenAtMs
  }

  const hasExperiments = snapshot.experiments && Object.keys(snapshot.experiments).length > 0

  return {
    ...extra,
    acquisition: attribution,
    ...(hasExperiments ? { experiments: snapshot.experiments } : {})
  }
}

export function getAttributionParamKeys(): string[] {
  return [...CAMPAIGN_PARAMS, ...CLICK_ID_PARAMS]
}
