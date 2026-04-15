export const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const SUPPORTED_LOCALE_PREFIXES = ['pt', 'en'] as const
export type LocalePrefix = (typeof SUPPORTED_LOCALE_PREFIXES)[number]

export const DEFAULT_LOCALE: Locale = 'pt-BR'
export const DEFAULT_LOCALE_PREFIX: LocalePrefix = 'pt'
export const LOCALE_COOKIE_NAME = 'aw_locale'

const localeByPrefix: Record<LocalePrefix, Locale> = {
  pt: 'pt-BR',
  en: 'en'
}

const prefixByLocale: Record<Locale, LocalePrefix> = {
  'pt-BR': 'pt',
  en: 'en'
}

export function normalizeLocale(input: unknown): Locale {
  if (typeof input !== 'string') {
    return DEFAULT_LOCALE
  }

  const value = input.trim().toLowerCase()
  if (!value) {
    return DEFAULT_LOCALE
  }

  if (value === 'en' || value === 'en-us' || value === 'en-gb' || value.startsWith('en-')) {
    return 'en'
  }
  if (
    value === 'pt' ||
    value === 'pt-br' ||
    value === 'pt_br' ||
    value.startsWith('pt-') ||
    value.startsWith('pt_')
  ) {
    return 'pt-BR'
  }

  return DEFAULT_LOCALE
}

export function localeToPrefix(locale: Locale): LocalePrefix {
  return prefixByLocale[normalizeLocale(locale)]
}

export function prefixToLocale(prefix: unknown): Locale | null {
  if (typeof prefix !== 'string') {
    return null
  }

  const normalized = prefix.trim().toLowerCase()
  if (normalized === 'pt' || normalized === 'en') {
    return localeByPrefix[normalized as LocalePrefix]
  }
  return null
}

export function resolveLocaleFromAcceptLanguage(value: string | null | undefined): Locale {
  if (!value || !value.trim()) {
    return DEFAULT_LOCALE
  }

  const parts = value
    .split(',')
    .map((entry) => entry.split(';')[0]?.trim())
    .filter((entry): entry is string => Boolean(entry))

  for (const part of parts) {
    const normalized = normalizeLocale(part)
    if (SUPPORTED_LOCALES.includes(normalized)) {
      return normalized
    }
  }

  return DEFAULT_LOCALE
}

export function resolveClientBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') {
    return DEFAULT_LOCALE
  }

  const languages = Array.isArray(navigator.languages) ? navigator.languages : []
  for (const language of languages) {
    const normalized = normalizeLocale(language)
    if (SUPPORTED_LOCALES.includes(normalized)) {
      return normalized
    }
  }

  return normalizeLocale(navigator.language)
}
