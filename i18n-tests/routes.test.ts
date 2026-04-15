import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildInternalPath,
  buildInternalUrl,
  buildLocalizedPath,
  listRouteDefinitions,
  normalizePathname,
  resolveRoute
} from '../lib/i18n/routes'

type RouteDefinition = ReturnType<typeof listRouteDefinitions>[number]

const ROOT_DIR = process.cwd()
const APP_DIR = path.join(ROOT_DIR, 'app')
const ROUTE_COVERAGE_EXCLUSIONS = new Set<string>([
  '/dashboard/administrador'
])

test('every routeKey has canonical pt and en localized paths', () => {
  const definitions = listRouteDefinitions()
  const keys = new Set<string>()
  const localizedPaths = new Set<string>()

  for (const definition of definitions) {
    assert.ok(definition.key, 'Route definition must have a key')
    assert.ok(definition.localized.pt, `Route "${definition.key}" is missing pt path`)
    assert.ok(definition.localized.en, `Route "${definition.key}" is missing en path`)
    assert.ok(
      definition.localized.pt.startsWith('/pt'),
      `Route "${definition.key}" must start with /pt in Portuguese`
    )
    assert.ok(
      definition.localized.en.startsWith('/en'),
      `Route "${definition.key}" must start with /en in English`
    )

    assert.ok(!keys.has(definition.key), `Duplicate route key "${definition.key}"`)
    keys.add(definition.key)

    const ptPath = normalizePathname(definition.localized.pt)
    const enPath = normalizePathname(definition.localized.en)
    assert.ok(!localizedPaths.has(ptPath), `Duplicate localized path "${ptPath}"`)
    assert.ok(!localizedPaths.has(enPath), `Duplicate localized path "${enPath}"`)
    localizedPaths.add(ptPath)
    localizedPaths.add(enPath)
  }
})

test('legacy and canonical route mapping resolves to same route key', () => {
  const definitions = listRouteDefinitions()

  for (const definition of definitions) {
    const params = buildSampleParams(definition)

    const canonicalPt = buildLocalizedPath(definition.key, 'pt', params)
    const canonicalEn = buildLocalizedPath(definition.key, 'en', params)
    const internalPath = buildInternalPath(definition.key, params)

    const ptMatch = resolveRoute(canonicalPt)
    const enMatch = resolveRoute(canonicalEn)
    const internalMatch = resolveRoute(internalPath)

    assert.equal(ptMatch?.key, definition.key, `PT canonical path mismatch for "${definition.key}"`)
    assert.equal(ptMatch?.source, 'localized', `PT path should be localized for "${definition.key}"`)
    assert.equal(ptMatch?.localePrefix, 'pt', `PT path locale should be pt for "${definition.key}"`)

    assert.equal(enMatch?.key, definition.key, `EN canonical path mismatch for "${definition.key}"`)
    assert.equal(enMatch?.source, 'localized', `EN path should be localized for "${definition.key}"`)
    assert.equal(enMatch?.localePrefix, 'en', `EN path locale should be en for "${definition.key}"`)

    // signup / forgot_password share /login internally and are disambiguated by query.mode
    if (definition.key === 'signup' || definition.key === 'forgot_password') {
      const internalUrl = buildInternalUrl(definition.key)
      assert.ok(
        internalUrl.startsWith('/login?mode='),
        `Auth legacy mapping must carry mode query for "${definition.key}"`
      )
    } else {
      assert.equal(
        internalMatch?.key,
        definition.key,
        `Internal legacy path mismatch for "${definition.key}" -> "${internalPath}"`
      )
      assert.equal(
        internalMatch?.source,
        'legacy',
        `Internal path should resolve as legacy for "${definition.key}"`
      )
    }

    for (const legacyTemplate of definition.legacyTemplates ?? []) {
      const legacyPath = fillTemplate(legacyTemplate, params)
      const legacyMatch = resolveRoute(legacyPath)
      assert.equal(
        legacyMatch?.key,
        definition.key,
        `Legacy mapping mismatch for "${definition.key}" from "${legacyPath}"`
      )
      assert.equal(legacyMatch?.source, 'legacy')
    }
  }
})

test('all localized app pages in scope are registered in route definitions', () => {
  const definitions = listRouteDefinitions()
  const internalTemplates = new Set(
    definitions.map((definition) => normalizePathname(definition.internalTemplate))
  )

  const inScopePages = listAppPageInternalPaths(APP_DIR).filter((pagePath) => {
    if (ROUTE_COVERAGE_EXCLUSIONS.has(pagePath)) {
      return false
    }
    return pagePath === '/' || pagePath === '/login' || pagePath.startsWith('/dashboard')
  })

  const missing = inScopePages.filter((pagePath) => !internalTemplates.has(pagePath)).sort()
  assert.deepEqual(
    missing,
    [],
    `Route coverage failed. Missing route definitions for app pages: ${missing.join(', ')}`
  )
})

function buildSampleParams(definition: RouteDefinition): Record<string, string> {
  const params: Record<string, string> = {}
  const templates = [
    definition.internalTemplate,
    definition.localized.pt,
    definition.localized.en,
    ...(definition.legacyTemplates ?? [])
  ]

  for (const template of templates) {
    const matches = template.match(/:([A-Za-z0-9_]+)/g) ?? []
    for (const match of matches) {
      const key = match.slice(1)
      params[key] = `${key}-sample`
    }
  }

  return params
}

function fillTemplate(template: string, params: Record<string, string>): string {
  return normalizePathname(
    template.replace(/:([A-Za-z0-9_]+)/g, (_match, param: string) => params[param] ?? `${param}-sample`)
  )
}

function listAppPageInternalPaths(rootDir: string): string[] {
  const results: string[] = []
  walk(rootDir, (absolutePath) => {
    if (!absolutePath.endsWith(`${path.sep}page.tsx`)) {
      return
    }

    const relative = path.relative(rootDir, absolutePath).replace(/\\/g, '/')
    if (relative.startsWith('api/')) {
      return
    }

    const withoutFile = relative.replace(/\/page\.tsx$/, '')
    if (!withoutFile) {
      results.push('/')
      return
    }

    const segments = withoutFile
      .split('/')
      .filter(Boolean)
      .filter((segment) => !segment.startsWith('(') && !segment.endsWith(')'))
      .filter((segment) => !segment.startsWith('@'))
      .map((segment) => toInternalSegment(segment))
      .filter(Boolean)

    const normalized = normalizePathname(`/${segments.join('/')}`)
    results.push(normalized)
  })

  return Array.from(new Set(results)).sort()
}

function toInternalSegment(segment: string): string {
  if (segment.startsWith('[') && segment.endsWith(']')) {
    const inner = segment.slice(1, -1).replace(/^\.\.\./, '').trim()
    return inner ? `:${inner}` : ''
  }
  return segment
}

function walk(rootDir: string, visitFile: (filePath: string) => void): void {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, visitFile)
      continue
    }
    visitFile(fullPath)
  }
}
