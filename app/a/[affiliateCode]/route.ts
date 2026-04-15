import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getBackendAdminKey, resolveBackendUrl } from '@/lib/adminBackend'
import { buildLocalizedUrl } from '@/lib/i18n/routes'
import {
  LOCALE_COOKIE_NAME,
  localeToPrefix,
  normalizeLocale,
  resolveLocaleFromAcceptLanguage,
  type Locale
} from '@/lib/i18n/locales'
import {
  applyAffiliateAttributionCookies,
  applyAffiliateVisitorCookie,
  readAffiliateCookieSnapshot
} from '@/lib/affiliates/cookies'

export const runtime = 'nodejs'

type RouteParams = {
  affiliateCode: string
}

type RegisterClickResponse = {
  effectiveAffiliateCode?: string
  effectiveClickId?: string | null
}

export async function GET(request: NextRequest, context: { params: Promise<RouteParams> | RouteParams }) {
  const params = await Promise.resolve(context.params)
  const locale = resolveAffiliateRedirectLocale(request)
  const redirectUrl = buildAffiliateRedirectUrl(request, locale)
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax'
  })

  const cookieSnapshot = readAffiliateCookieSnapshot(request.cookies)
  const visitorId = cookieSnapshot.visitorId ?? crypto.randomUUID()
  applyAffiliateVisitorCookie(response, visitorId)

  const backendUrl = resolveBackendUrl()
  const adminKey = getBackendAdminKey()
  if (!backendUrl || !adminKey) {
    return response
  }

  try {
    const registerResponse = await fetch(
      `${backendUrl}/admin/affiliates/${encodeURIComponent(params.affiliateCode)}/clicks`,
      {
        method: 'POST',
        headers: {
          'x-admin-key': adminKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          visitorId,
          lockedAffiliateCode: cookieSnapshot.affiliateCode,
          lockedClickId: cookieSnapshot.clickId,
          userAgent: request.headers.get('user-agent'),
          referer: request.headers.get('referer'),
          landingPath: `${request.nextUrl.pathname}${request.nextUrl.search || ''}`
        }),
        cache: 'no-store'
      }
    )

    if (!registerResponse.ok) {
      return response
    }

    const payload = (await registerResponse.json().catch(() => null)) as RegisterClickResponse | null
    const effectiveAffiliateCode =
      typeof payload?.effectiveAffiliateCode === 'string' && payload.effectiveAffiliateCode.trim()
        ? payload.effectiveAffiliateCode.trim()
        : null
    const effectiveClickId =
      typeof payload?.effectiveClickId === 'string' && payload.effectiveClickId.trim()
        ? payload.effectiveClickId.trim()
        : null

    if (effectiveAffiliateCode) {
      applyAffiliateAttributionCookies(response, {
        affiliateCode: effectiveAffiliateCode,
        clickId: effectiveClickId
      })
    }
  } catch (error) {
    console.warn('[affiliate] Failed to register click:', error)
  }

  return response
}

function resolveAffiliateRedirectLocale(request: NextRequest): Locale {
  const queryLocale = request.nextUrl.searchParams.get('lang')
  if (queryLocale) {
    return normalizeLocale(queryLocale)
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value
  if (cookieLocale) {
    return normalizeLocale(cookieLocale)
  }

  return resolveLocaleFromAcceptLanguage(request.headers.get('accept-language'))
}

function buildAffiliateRedirectUrl(request: NextRequest, locale: Locale) {
  const query = new URLSearchParams(request.nextUrl.searchParams.toString())
  query.delete('lang')
  const localizedPath = buildLocalizedUrl('signup', localeToPrefix(locale), { query })
  return new URL(localizedPath, request.url)
}
