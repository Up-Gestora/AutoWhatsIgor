import type { NextResponse } from 'next/server'
import {
  AFFILIATE_CLICK_COOKIE_NAME,
  AFFILIATE_CODE_COOKIE_NAME,
  AFFILIATE_COOKIE_MAX_AGE_SEC,
  AFFILIATE_VISITOR_COOKIE_NAME
} from './constants'

type CookieReader = {
  get(name: string): { value: string } | undefined
}

export type AffiliateCookieSnapshot = {
  visitorId: string | null
  affiliateCode: string | null
  clickId: string | null
}

export function readAffiliateCookieSnapshot(cookies: CookieReader): AffiliateCookieSnapshot {
  return {
    visitorId: sanitizeCookieValue(cookies.get(AFFILIATE_VISITOR_COOKIE_NAME)?.value),
    affiliateCode: sanitizeCookieValue(cookies.get(AFFILIATE_CODE_COOKIE_NAME)?.value),
    clickId: sanitizeCookieValue(cookies.get(AFFILIATE_CLICK_COOKIE_NAME)?.value)
  }
}

export function applyAffiliateVisitorCookie(response: NextResponse, visitorId: string) {
  response.cookies.set(AFFILIATE_VISITOR_COOKIE_NAME, visitorId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SEC
  })
}

export function applyAffiliateAttributionCookies(
  response: NextResponse,
  input: {
    affiliateCode: string
    clickId?: string | null
  }
) {
  response.cookies.set(AFFILIATE_CODE_COOKIE_NAME, input.affiliateCode, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: AFFILIATE_COOKIE_MAX_AGE_SEC
  })

  if (typeof input.clickId === 'string' && input.clickId.trim()) {
    response.cookies.set(AFFILIATE_CLICK_COOKIE_NAME, input.clickId.trim(), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: AFFILIATE_COOKIE_MAX_AGE_SEC
    })
  }
}

export function clearAffiliateAttributionCookies(response: NextResponse) {
  response.cookies.set(AFFILIATE_CODE_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(0)
  })
  response.cookies.set(AFFILIATE_CLICK_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(0)
  })
}

function sanitizeCookieValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  return normalized ? normalized : null
}
