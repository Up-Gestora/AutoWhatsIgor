const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || 'G-1V8YB286LP'
const ADS_SIGNUP_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO?.trim()
const ADS_INSCRICAO_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_INSCRICAO_SEND_TO?.trim()
const ADS_SIGNUP_EVENT_TIMEOUT_MS = 2000

type SignupAttribution = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  gclid?: string
  gbraid?: string
  wbraid?: string
  fbclid?: string
  landingPath?: string
  firstSeenAtMs?: number
  lastSeenAtMs?: number
  experiments?: Record<string, string>
  affiliateCode?: string
  affiliateClickId?: string
  affiliateVisitorId?: string
  attributionModel?: string
}

const canTrackGa = () =>
  typeof window !== 'undefined' &&
  Boolean(GA_MEASUREMENT_ID) &&
  typeof window.gtag === 'function' &&
  typeof window.google_tag_data !== 'undefined'

const buildEventParams = (params?: Record<string, unknown>) => {
  const nextParams = params ? { ...params } : {}
  if (typeof window !== 'undefined' && window.__gaDebugMode) {
    nextParams.debug_mode = true
  }
  return Object.keys(nextParams).length > 0 ? nextParams : undefined
}

export function trackGaEvent(eventName: string, params?: Record<string, unknown>): boolean {
  if (!canTrackGa()) {
    return false
  }

  const finalParams = buildEventParams(params)
  if (finalParams) {
    window.gtag!('event', eventName, finalParams)
  } else {
    window.gtag!('event', eventName)
  }

  return true
}

function trackGaEventWithCallback(
  eventName: string,
  params?: Record<string, unknown>,
  timeoutMs = ADS_SIGNUP_EVENT_TIMEOUT_MS
): Promise<boolean> {
  if (!canTrackGa()) {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    let settled = false
    const settle = (result: boolean) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const timer = window.setTimeout(() => settle(false), timeoutMs + 150)
    const baseParams = buildEventParams(params) ?? {}

    window.gtag!('event', eventName, {
      ...baseParams,
      event_callback: () => {
        window.clearTimeout(timer)
        settle(true)
      },
      event_timeout: timeoutMs
    })
  })
}

export async function trackSignupGa(
  method: 'email' | 'google',
  eventId: string,
  attribution?: SignupAttribution
): Promise<{ signUpSent: boolean; customSent: boolean; adsInscricaoSent: boolean }> {
  const attributionParams: Record<string, unknown> = {
    ...(attribution?.source ? { source: attribution.source, utm_source: attribution.source } : {}),
    ...(attribution?.medium ? { medium: attribution.medium, utm_medium: attribution.medium } : {}),
    ...(attribution?.campaign ? { campaign: attribution.campaign, utm_campaign: attribution.campaign } : {}),
    ...(attribution?.content ? { utm_content: attribution.content } : {}),
    ...(attribution?.term ? { utm_term: attribution.term } : {}),
    ...(attribution?.gclid ? { gclid: attribution.gclid } : {}),
    ...(attribution?.gbraid ? { gbraid: attribution.gbraid } : {}),
    ...(attribution?.wbraid ? { wbraid: attribution.wbraid } : {}),
    ...(attribution?.fbclid ? { fbclid: attribution.fbclid } : {}),
    ...(attribution?.landingPath ? { landing_path: attribution.landingPath } : {}),
    ...(typeof attribution?.firstSeenAtMs === 'number' ? { first_seen_at_ms: attribution.firstSeenAtMs } : {}),
    ...(typeof attribution?.lastSeenAtMs === 'number' ? { last_seen_at_ms: attribution.lastSeenAtMs } : {}),
    ...(attribution?.experiments ? { experiments: JSON.stringify(attribution.experiments) } : {}),
    ...(attribution?.affiliateCode ? { affiliate_code: attribution.affiliateCode } : {}),
    ...(attribution?.affiliateClickId ? { affiliate_click_id: attribution.affiliateClickId } : {}),
    ...(attribution?.affiliateVisitorId ? { affiliate_visitor_id: attribution.affiliateVisitorId } : {}),
    ...(attribution?.attributionModel ? { attribution_model: attribution.attributionModel } : {})
  }

  const signUpSent = trackGaEvent('sign_up', { method, event_id: eventId, ...attributionParams })
  const customParams: Record<string, unknown> = {
    method,
    account_type: 'trial',
    event_id: eventId,
    ...attributionParams
  }

  if (ADS_SIGNUP_SEND_TO) {
    customParams.send_to = ADS_SIGNUP_SEND_TO
  }

  const customEventPromise = trackGaEventWithCallback('Criar_conta_teste_gratuito', customParams)
  const adsInscricaoPromise = ADS_INSCRICAO_SEND_TO
    ? trackGaEventWithCallback('conversion', {
        send_to: ADS_INSCRICAO_SEND_TO,
        transaction_id: eventId,
        event_id: eventId
      })
    : Promise.resolve(false)

  const [customSent, adsInscricaoSent] = await Promise.all([customEventPromise, adsInscricaoPromise])

  return { signUpSent, customSent, adsInscricaoSent }
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    google_tag_data?: unknown
    __gaDebugMode?: boolean
  }
}
