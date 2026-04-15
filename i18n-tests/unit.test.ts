import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_LOCALE,
  localeToPrefix,
  normalizeLocale,
  prefixToLocale,
  resolveLocaleFromAcceptLanguage
} from '../lib/i18n/locales'
import {
  buildInternalUrl,
  buildLocalizedUrl,
  normalizePathname,
  resolveRoute,
  splitLocalePrefix
} from '../lib/i18n/routes'
import { getInstitutionalPageAlternates, listPublicInstitutionalPages } from '../lib/public-site/institutional-pages'
import { getPublicGuideAlternates, listPublicGuides } from '../lib/public-site/guides'
import { createCanonicalAlternates } from '../lib/seo/public-metadata'
import { UPDATES } from '../lib/updates/content'

test('normalizeLocale resolves common variants', () => {
  assert.equal(normalizeLocale('pt-br'), 'pt-BR')
  assert.equal(normalizeLocale('PT'), 'pt-BR')
  assert.equal(normalizeLocale('en-US'), 'en')
  assert.equal(normalizeLocale('en-GB'), 'en')
  assert.equal(normalizeLocale('fr-FR'), DEFAULT_LOCALE)
})

test('resolveLocaleFromAcceptLanguage prioritizes supported locale', () => {
  assert.equal(resolveLocaleFromAcceptLanguage('en-US,en;q=0.9,pt-BR;q=0.8'), 'en')
  assert.equal(resolveLocaleFromAcceptLanguage('fr-FR,pt-BR;q=0.9'), 'pt-BR')
  assert.equal(resolveLocaleFromAcceptLanguage(''), DEFAULT_LOCALE)
  assert.equal(resolveLocaleFromAcceptLanguage(undefined), DEFAULT_LOCALE)
})

test('prefix conversions are symmetric for supported locales', () => {
  assert.equal(prefixToLocale('pt'), 'pt-BR')
  assert.equal(prefixToLocale('en'), 'en')
  assert.equal(prefixToLocale('es'), null)
  assert.equal(localeToPrefix('pt-BR'), 'pt')
  assert.equal(localeToPrefix('en'), 'en')
})

test('pathname normalization and locale split keep canonical shape', () => {
  assert.equal(normalizePathname('/pt/dashboard/conversas/'), '/pt/dashboard/conversas')
  assert.deepEqual(splitLocalePrefix('/en/dashboard/settings'), {
    localePrefix: 'en',
    pathnameWithoutLocale: '/dashboard/settings'
  })
  assert.deepEqual(splitLocalePrefix('/dashboard/settings'), {
    localePrefix: null,
    pathnameWithoutLocale: '/dashboard/settings'
  })
})

test('localized URL builder maps route keys and keeps non-mode query', () => {
  const url = buildLocalizedUrl('settings', 'en', {
    query: {
      tab: 'assinatura_creditos',
      mode: 'signup'
    }
  })
  assert.equal(url, '/en/dashboard/settings?tab=assinatura_creditos')
})

test('internal URL builder applies auth mode for signup and forgot-password', () => {
  assert.equal(buildInternalUrl('signup'), '/login?mode=signup')
  assert.equal(buildInternalUrl('forgot_password'), '/login?mode=forgot-password')
  assert.equal(buildInternalUrl('login', { query: { mode: 'signup', from: 'x' } }), '/login?from=x')
})

test('resolveRoute reads localized and legacy paths', () => {
  const localized = resolveRoute('/en/dashboard/broadcasts/abc123')
  assert.equal(localized?.key, 'broadcast_detail')
  assert.equal(localized?.localePrefix, 'en')
  assert.equal(localized?.params.broadcastId, 'abc123')
  assert.equal(localized?.source, 'localized')

  const prefixedLegacy = resolveRoute('/en/dashboard/conexoes')
  assert.equal(prefixedLegacy?.key, 'connections')
  assert.equal(prefixedLegacy?.localePrefix, 'en')
  assert.equal(prefixedLegacy?.source, 'legacy')

  const legacy = resolveRoute('/dashboard/transmissao/abc123')
  assert.equal(legacy?.key, 'broadcast_detail')
  assert.equal(legacy?.localePrefix, null)
  assert.equal(legacy?.params.broadcastId, 'abc123')
  assert.equal(legacy?.source, 'legacy')
})

test('updates source keeps v2.9 first and preserves older history', () => {
  assert.equal(UPDATES[0]?.version, 'v2.9.0')
  assert.equal(UPDATES[0]?.date.pt, '12 de março de 2026')
  assert.equal(UPDATES[0]?.date.en, 'March 12, 2026')
  assert.ok(UPDATES.some((entry) => entry.version === 'v1.3.0'))
  assert.ok(UPDATES.some((entry) => entry.version === 'v1.0.0'))
})

test('dashboard and public updates pages consume shared updates content', () => {
  const rootDir = process.cwd()
  const dashboardPage = fs.readFileSync(
    path.join(rootDir, 'app', 'dashboard', 'atualizacoes', 'page.tsx'),
    'utf8'
  )
  const publicPtPage = fs.readFileSync(
    path.join(rootDir, 'app', 'pt', 'atualizacoes', 'page.tsx'),
    'utf8'
  )
  const publicEnPage = fs.readFileSync(
    path.join(rootDir, 'app', 'en', 'updates', 'page.tsx'),
    'utf8'
  )

  assert.match(dashboardPage, /from ['"]@\/lib\/updates\/content['"]/)
  assert.match(publicPtPage, /PublicUpdatesFeed/)
  assert.match(publicEnPage, /PublicUpdatesFeed/)
})

test('public localized helpers expose PT and EN guides, institutionals, and alternates', () => {
  const ptGuides = listPublicGuides('pt-BR')
  const enGuides = listPublicGuides('en')
  const ptInstitutional = listPublicInstitutionalPages('pt-BR')
  const enInstitutional = listPublicInstitutionalPages('en')

  assert.equal(ptGuides.length, enGuides.length)
  assert.equal(ptInstitutional.length, enInstitutional.length)
  assert.ok(enGuides.some((guide) => guide.path === '/en/guides/connect-whatsapp-business-qr-code'))
  assert.ok(enInstitutional.some((page) => page.path === '/en/about'))

  assert.deepEqual(getPublicGuideAlternates('connect-whatsapp-business-qr-code'), {
    'pt-BR': '/pt/guias/conectar-whatsapp-business-qr-code',
    en: '/en/guides/connect-whatsapp-business-qr-code',
    'x-default': '/pt/guias/conectar-whatsapp-business-qr-code'
  })

  assert.deepEqual(getInstitutionalPageAlternates('about'), {
    'pt-BR': '/pt/sobre',
    en: '/en/about',
    'x-default': '/pt/sobre'
  })
})

test('public metadata alternates accept localized paths beyond home', () => {
  assert.deepEqual(
    createCanonicalAlternates('/en/updates', false, {
      'pt-BR': '/pt/atualizacoes',
      en: '/en/updates',
      'x-default': '/pt/atualizacoes'
    }),
    {
      canonical: '/en/updates',
      languages: {
        'pt-BR': '/pt/atualizacoes',
        en: '/en/updates',
        'x-default': '/pt/atualizacoes'
      }
    }
  )
})
