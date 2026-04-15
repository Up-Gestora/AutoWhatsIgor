import { NextRequest, NextResponse } from 'next/server'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  localeToPrefix,
  normalizeLocale,
  prefixToLocale,
  resolveLocaleFromAcceptLanguage
} from '@/lib/i18n/locales'
import {
  buildInternalUrl,
  buildLocalizedUrl,
  resolveRoute,
  splitLocalePrefix,
  type RouteKey
} from '@/lib/i18n/routes'

const FILE_EXTENSION_REGEX = /\.[a-zA-Z0-9]+$/
const INTERNAL_REWRITE_HEADER = 'x-autowhats-i18n-rewrite'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (shouldSkip(pathname)) {
    return NextResponse.next()
  }

  const route = resolveRoute(pathname)
  const localeFromCookie = normalizeLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value)

  if (!route) {
    const split = splitLocalePrefix(pathname)
    if (split.localePrefix && shouldBypassLocalization(split.pathnameWithoutLocale)) {
      const rewriteUrl = new URL(split.pathnameWithoutLocale, request.url)
      rewriteUrl.search = request.nextUrl.search
      const response = NextResponse.rewrite(rewriteUrl)
      response.cookies.set(LOCALE_COOKIE_NAME, split.localePrefix === 'en' ? 'en' : 'pt-BR', {
        path: '/',
        sameSite: 'lax'
      })
      return response
    }
    return NextResponse.next()
  }

  const normalizedKey = normalizeAuthRouteKey(route.key, request.nextUrl.searchParams.get('mode'))
  const preferredLocale = resolvePreferredLocale(request, localeFromCookie)
  const preferredPrefix = localeToPrefix(preferredLocale)
  const isInternalRewrite = request.headers.get(INTERNAL_REWRITE_HEADER) === '1'

  if (!route.localePrefix) {
    // When a localized route is rewritten internally (e.g. /pt/dashboard/conexoes -> /dashboard/conexoes),
    // Next.js can invoke middleware again for the rewritten path. If we redirect again here,
    // the request may end up in a rewrite/redirect conflict and return 404 for valid routes.
    if (isInternalRewrite) {
      const response = NextResponse.next()
      response.cookies.set(LOCALE_COOKIE_NAME, preferredLocale, {
        path: '/',
        sameSite: 'lax'
      })
      return response
    }

    const redirectPrefix = normalizedKey === 'home' ? localeToPrefix(DEFAULT_LOCALE) : preferredPrefix
    const redirectLocale = redirectPrefix === 'en' ? 'en' : 'pt-BR'
    const redirectPath = buildLocalizedUrl(normalizedKey, redirectPrefix, {
      params: route.params,
      query: request.nextUrl.searchParams
    })
    return redirectWithLocaleCookie(request, redirectPath, redirectLocale, normalizedKey === 'home' ? 308 : 307)
  }

  const locale = prefixToLocale(route.localePrefix) ?? preferredLocale
  const canonicalPath = buildLocalizedUrl(normalizedKey, route.localePrefix, {
    params: route.params,
    query: request.nextUrl.searchParams
  })

  if (!samePathAndSearch(request.nextUrl.pathname, request.nextUrl.search, canonicalPath)) {
    return redirectWithLocaleCookie(request, canonicalPath, locale)
  }

  if (normalizedKey === 'home') {
    const response = NextResponse.next()
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: '/',
      sameSite: 'lax'
    })
    return response
  }

  const internalPath = buildInternalUrl(normalizedKey, {
    params: route.params,
    query: request.nextUrl.searchParams
  })
  const rewriteTarget = new URL(internalPath, request.url)
  const rewriteHeaders = new Headers(request.headers)
  rewriteHeaders.set(INTERNAL_REWRITE_HEADER, '1')
  const response = NextResponse.rewrite(rewriteTarget, {
    request: {
      headers: rewriteHeaders
    }
  })
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax'
  })
  return response
}

function resolvePreferredLocale(request: NextRequest, localeFromCookie: 'pt-BR' | 'en') {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value
  if (cookieLocale) {
    return normalizeLocale(cookieLocale)
  }

  const headerLocale = resolveLocaleFromAcceptLanguage(request.headers.get('accept-language'))
  if (headerLocale) {
    return headerLocale
  }

  return localeFromCookie || DEFAULT_LOCALE
}

function normalizeAuthRouteKey(routeKey: RouteKey, mode: string | null): RouteKey {
  if (routeKey !== 'login') {
    return routeKey
  }

  if (mode === 'signup') {
    return 'signup'
  }
  if (mode === 'forgot-password') {
    return 'forgot_password'
  }
  return routeKey
}

function redirectWithLocaleCookie(
  request: NextRequest,
  destinationPath: string,
  locale: 'pt-BR' | 'en',
  status: 307 | 308 = 307
) {
  const nextUrl = new URL(destinationPath, request.url)
  const response = NextResponse.redirect(nextUrl, status)
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax'
  })
  return response
}

function samePathAndSearch(currentPathname: string, currentSearch: string, nextPathWithSearch: string): boolean {
  const current = `${currentPathname}${currentSearch || ''}`
  return current === nextPathWithSearch
}

function shouldSkip(pathname: string): boolean {
  if (pathname.startsWith('/api')) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/assets')) return true
  if (pathname.startsWith('/public')) return true
  if (pathname.startsWith('/.well-known')) return true
  if (pathname === '/favicon.ico') return true
  if (pathname === '/robots.txt') return true
  if (pathname === '/sitemap.xml') return true
  if (FILE_EXTENSION_REGEX.test(pathname)) return true
  return false
}

function shouldBypassLocalization(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/v2') || pathname.startsWith('/render')
}

export const config = {
  matcher: '/:path*'
}
