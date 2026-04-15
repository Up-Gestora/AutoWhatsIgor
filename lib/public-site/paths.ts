import { buildLocalizedPath } from '@/lib/i18n/routes'
import type { PublicLocale } from './types'
import { publicLocaleToPrefix } from './types'

export function getPublicHomePath(locale: PublicLocale): string {
  return buildLocalizedPath('home', publicLocaleToPrefix(locale))
}

export function getPublicLoginPath(locale: PublicLocale): string {
  return buildLocalizedPath('login', publicLocaleToPrefix(locale))
}

export function getPublicSignupPath(locale: PublicLocale): string {
  return buildLocalizedPath('signup', publicLocaleToPrefix(locale))
}

export function getPublicUpdatesPath(locale: PublicLocale): string {
  return locale === 'en' ? '/en/updates' : '/pt/atualizacoes'
}
