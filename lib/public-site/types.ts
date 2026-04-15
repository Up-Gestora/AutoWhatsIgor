export type PublicLocale = 'pt-BR' | 'en'

export type LocalizedValue<T> = Record<PublicLocale, T>

export function publicLocaleToPrefix(locale: PublicLocale): 'pt' | 'en' {
  return locale === 'en' ? 'en' : 'pt'
}
