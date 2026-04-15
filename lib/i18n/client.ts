'use client'

import { useMemo } from 'react'
import { usePathname, type ReadonlyURLSearchParams } from 'next/navigation'
import type { Locale, LocalePrefix } from './locales'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  localeToPrefix,
  normalizeLocale,
  resolveClientBrowserLocale
} from './locales'
import { buildLocalizedUrl, resolveRoute, splitLocalePrefix, type RouteKey } from './routes'
import ptCommon from './dictionaries/pt-BR/common.json'
import enCommon from './dictionaries/en/common.json'

type Dictionary = Record<string, unknown>

const dictionaries: Record<Locale, Dictionary> = {
  'pt-BR': ptCommon as Dictionary,
  en: enCommon as Dictionary
}

function readCookieLocale(): Locale {
  if (typeof document === 'undefined') {
    return DEFAULT_LOCALE
  }

  const cookie = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`))

  if (!cookie) {
    return DEFAULT_LOCALE
  }

  const raw = cookie.slice(`${LOCALE_COOKIE_NAME}=`.length)
  return normalizeLocale(decodeURIComponent(raw))
}

export function resolveLocaleFromPathname(pathname: string): Locale {
  const route = splitLocalePrefix(pathname)
  if (route.localePrefix === 'en') {
    return 'en'
  }
  if (route.localePrefix === 'pt') {
    return 'pt-BR'
  }
  return DEFAULT_LOCALE
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[normalizeLocale(locale)]
}

function getNestedValue(object: Dictionary, key: string): unknown {
  if (!key.trim()) {
    return undefined
  }

  const parts = key.split('.').map((part) => part.trim()).filter(Boolean)
  let current: unknown = object
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params || Object.keys(params).length === 0) {
    return template
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? `{${key}}` : String(value)
  })
}

export function useI18n() {
  const pathname = usePathname()

  const locale = useMemo<Locale>(() => {
    const fromPathname = resolveLocaleFromPathname(pathname || '')
    if (fromPathname !== DEFAULT_LOCALE || pathname?.startsWith('/pt')) {
      return fromPathname
    }

    const fromCookie = readCookieLocale()
    if (fromCookie !== DEFAULT_LOCALE) {
      return fromCookie
    }

    return resolveClientBrowserLocale()
  }, [pathname])

  const localePrefix = useMemo<LocalePrefix>(() => localeToPrefix(locale), [locale])
  const dictionary = useMemo(() => getDictionary(locale), [locale])

  const t = useMemo(
    () =>
      (key: string, fallback?: string, params?: Record<string, string | number>) => {
        const raw = getNestedValue(dictionary, key)
        if (typeof raw === 'string') {
          return interpolate(raw, params)
        }
        return fallback ?? key
      },
    [dictionary]
  )

  const toRoute = useMemo(
    () =>
      (
        key: RouteKey,
        options?: {
          params?: Record<string, string>
          query?: URLSearchParams | ReadonlyURLSearchParams | Record<string, string | null | undefined>
        }
      ) =>
        buildLocalizedUrl(key, localePrefix, options),
    [localePrefix]
  )

  const route = useMemo(() => resolveRoute(pathname || ''), [pathname])

  return {
    locale,
    localePrefix,
    route,
    t,
    toRoute
  }
}
