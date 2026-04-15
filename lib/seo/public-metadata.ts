import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-url'

type PublicLocale = 'pt-BR' | 'en'
type AlternateLanguage = PublicLocale | 'x-default'

type CreatePublicMetadataOptions = {
  title: string
  description: string
  path: string
  locale?: PublicLocale
  type?: 'website' | 'article'
  keywords?: string[]
  images?: string[]
  noIndex?: boolean
  includeLocaleAlternates?: boolean
  alternatesByLocale?: Partial<Record<AlternateLanguage, string>>
}

function getDefaultOpenGraphImage(locale: PublicLocale) {
  return locale === 'en' ? '/social/og-en.png' : '/social/og-pt.png'
}

function getDefaultTwitterImage(locale: PublicLocale) {
  return locale === 'en' ? '/social/twitter-en.png' : '/social/twitter-pt.png'
}

function ogLocale(locale: PublicLocale) {
  return locale === 'en' ? 'en_US' : 'pt_BR'
}

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString()
}

export function createCanonicalAlternates(
  path: string,
  includeLocaleAlternates = false,
  alternatesByLocale?: Partial<Record<AlternateLanguage, string>>
): Metadata['alternates'] {
  const languages = alternatesByLocale
    ? Object.fromEntries(
        Object.entries(alternatesByLocale).filter(([, value]) => typeof value === 'string' && value.length > 0)
      )
    : includeLocaleAlternates
      ? {
          'pt-BR': '/pt',
          en: '/en',
          'x-default': '/pt'
        }
      : undefined

  return {
    canonical: path,
    ...(languages ? { languages } : {})
  }
}

export function createPublicMetadata(options: CreatePublicMetadataOptions): Metadata {
  const locale = options.locale ?? 'pt-BR'
  const openGraphImages = (options.images?.length ? options.images : [getDefaultOpenGraphImage(locale)]).map(
    (image) => absoluteUrl(image)
  )
  const twitterImages = (options.images?.length ? options.images : [getDefaultTwitterImage(locale)]).map((image) =>
    absoluteUrl(image)
  )

  return {
    title: options.title,
    description: options.description,
    keywords: options.keywords,
    alternates: createCanonicalAlternates(
      options.path,
      options.includeLocaleAlternates,
      options.alternatesByLocale
    ),
    robots: options.noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false
          }
        }
      : undefined,
    openGraph: {
      title: options.title,
      description: options.description,
      url: absoluteUrl(options.path),
      type: options.type ?? 'website',
      locale: ogLocale(locale),
      siteName: 'AutoWhats',
      images: openGraphImages
    },
    twitter: {
      card: 'summary_large_image',
      title: options.title,
      description: options.description,
      images: twitterImages
    }
  }
}
