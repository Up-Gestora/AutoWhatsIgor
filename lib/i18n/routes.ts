import type { ReadonlyURLSearchParams } from 'next/navigation'
import type { LocalePrefix } from './locales'

export type RouteKey =
  | 'home'
  | 'login'
  | 'signup'
  | 'forgot_password'
  | 'dashboard_home'
  | 'connections'
  | 'conversations'
  | 'training'
  | 'onboarding_setup'
  | 'training_copilot'
  | 'leads'
  | 'clients'
  | 'broadcasts'
  | 'broadcast_detail'
  | 'calendar'
  | 'billing'
  | 'files'
  | 'settings'
  | 'tutorials'
  | 'updates'

type RouteDefinition = {
  key: RouteKey
  localized: Record<LocalePrefix, string>
  internalTemplate: string
  internalQuery?: Record<string, string>
  legacyTemplates?: string[]
}

type RouteMatch = {
  key: RouteKey
  params: Record<string, string>
  localePrefix: LocalePrefix | null
  source: 'localized' | 'legacy'
}

const ROUTE_DEFINITIONS: RouteDefinition[] = [
  {
    key: 'home',
    localized: { pt: '/pt', en: '/en' },
    internalTemplate: '/'
  },
  {
    key: 'login',
    localized: { pt: '/pt/entrar', en: '/en/login' },
    internalTemplate: '/login',
    legacyTemplates: ['/login']
  },
  {
    key: 'signup',
    localized: { pt: '/pt/cadastro', en: '/en/signup' },
    internalTemplate: '/login',
    internalQuery: { mode: 'signup' },
    legacyTemplates: ['/signup']
  },
  {
    key: 'forgot_password',
    localized: { pt: '/pt/recuperar-senha', en: '/en/forgot-password' },
    internalTemplate: '/login',
    internalQuery: { mode: 'forgot-password' },
    legacyTemplates: ['/forgot-password']
  },
  {
    key: 'dashboard_home',
    localized: { pt: '/pt/dashboard', en: '/en/dashboard' },
    internalTemplate: '/dashboard',
    legacyTemplates: ['/dashboard']
  },
  {
    key: 'connections',
    localized: { pt: '/pt/dashboard/conexoes', en: '/en/dashboard/connections' },
    internalTemplate: '/dashboard/conexoes'
  },
  {
    key: 'conversations',
    localized: { pt: '/pt/dashboard/conversas', en: '/en/dashboard/conversations' },
    internalTemplate: '/dashboard/conversas'
  },
  {
    key: 'training',
    localized: { pt: '/pt/dashboard/treinamento', en: '/en/dashboard/training' },
    internalTemplate: '/dashboard/treinamento'
  },
  {
    key: 'onboarding_setup',
    localized: { pt: '/pt/dashboard/onboarding', en: '/en/dashboard/onboarding' },
    internalTemplate: '/dashboard/onboarding'
  },
  {
    key: 'training_copilot',
    localized: {
      pt: '/pt/dashboard/treinamento/assistente',
      en: '/en/dashboard/training/copilot'
    },
    internalTemplate: '/dashboard/treinamento/assistente'
  },
  {
    key: 'leads',
    localized: { pt: '/pt/dashboard/leads', en: '/en/dashboard/leads' },
    internalTemplate: '/dashboard/leads'
  },
  {
    key: 'clients',
    localized: { pt: '/pt/dashboard/clientes', en: '/en/dashboard/clients' },
    internalTemplate: '/dashboard/clientes'
  },
  {
    key: 'broadcasts',
    localized: { pt: '/pt/dashboard/transmissao', en: '/en/dashboard/broadcasts' },
    internalTemplate: '/dashboard/transmissao'
  },
  {
    key: 'broadcast_detail',
    localized: { pt: '/pt/dashboard/transmissao/:broadcastId', en: '/en/dashboard/broadcasts/:broadcastId' },
    internalTemplate: '/dashboard/transmissao/:broadcastId'
  },
  {
    key: 'calendar',
    localized: { pt: '/pt/dashboard/agenda', en: '/en/dashboard/calendar' },
    internalTemplate: '/dashboard/agenda'
  },
  {
    key: 'billing',
    localized: { pt: '/pt/dashboard/financeiro', en: '/en/dashboard/billing' },
    internalTemplate: '/dashboard/financeiro'
  },
  {
    key: 'files',
    localized: { pt: '/pt/dashboard/arquivos', en: '/en/dashboard/files' },
    internalTemplate: '/dashboard/arquivos'
  },
  {
    key: 'settings',
    localized: { pt: '/pt/dashboard/configuracoes', en: '/en/dashboard/settings' },
    internalTemplate: '/dashboard/configuracoes'
  },
  {
    key: 'tutorials',
    localized: { pt: '/pt/dashboard/tutoriais', en: '/en/dashboard/tutorials' },
    internalTemplate: '/dashboard/tutoriais'
  },
  {
    key: 'updates',
    localized: { pt: '/pt/dashboard/atualizacoes', en: '/en/dashboard/updates' },
    internalTemplate: '/dashboard/atualizacoes'
  }
]

const definitionsByKey = new Map<RouteKey, RouteDefinition>(
  ROUTE_DEFINITIONS.map((definition) => [definition.key, definition])
)

export function listRouteDefinitions(): RouteDefinition[] {
  return [...ROUTE_DEFINITIONS]
}

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/'
  }

  const value = pathname.startsWith('/') ? pathname : `/${pathname}`
  const trimmed = value.replace(/\/+/g, '/').replace(/\/$/, '')
  return trimmed || '/'
}

export function splitLocalePrefix(pathname: string): {
  localePrefix: LocalePrefix | null
  pathnameWithoutLocale: string
} {
  const normalized = normalizePathname(pathname)
  const parts = normalized.split('/').filter(Boolean)
  const first = parts[0]
  if (first === 'pt' || first === 'en') {
    const rest = `/${parts.slice(1).join('/')}`
    return {
      localePrefix: first as LocalePrefix,
      pathnameWithoutLocale: normalizePathname(rest)
    }
  }

  return {
    localePrefix: null,
    pathnameWithoutLocale: normalized
  }
}

export function resolveRoute(pathname: string): RouteMatch | null {
  const normalized = normalizePathname(pathname)

  for (const definition of ROUTE_DEFINITIONS) {
    for (const localePrefix of ['pt', 'en'] as const) {
      const localizedTemplate = normalizePathname(definition.localized[localePrefix])
      const params = matchTemplate(localizedTemplate, normalized)
      if (params) {
        return {
          key: definition.key,
          params,
          localePrefix,
          source: 'localized'
        }
      }
    }
  }

  const split = splitLocalePrefix(normalized)
  if (split.localePrefix) {
    for (const definition of ROUTE_DEFINITIONS) {
      const legacyTemplates = new Set<string>([
        definition.internalTemplate,
        ...(definition.legacyTemplates ?? []),
        stripLocalePrefixFromTemplate(definition.localized.pt),
        stripLocalePrefixFromTemplate(definition.localized.en)
      ])

      for (const template of legacyTemplates) {
        const params = matchTemplate(normalizePathname(template), split.pathnameWithoutLocale)
        if (params) {
          return {
            key: definition.key,
            params,
            localePrefix: split.localePrefix,
            source: 'legacy'
          }
        }
      }
    }
  }

  for (const definition of ROUTE_DEFINITIONS) {
    const legacyTemplates = new Set<string>([
      definition.internalTemplate,
      ...(definition.legacyTemplates ?? []),
      stripLocalePrefixFromTemplate(definition.localized.pt),
      stripLocalePrefixFromTemplate(definition.localized.en)
    ])

    for (const template of legacyTemplates) {
      const params = matchTemplate(normalizePathname(template), normalized)
      if (params) {
        return {
          key: definition.key,
          params,
          localePrefix: null,
          source: 'legacy'
        }
      }
    }
  }

  return null
}

export function buildLocalizedPath(
  key: RouteKey,
  localePrefix: LocalePrefix,
  params: Record<string, string> = {}
): string {
  const definition = definitionsByKey.get(key)
  if (!definition) {
    return localePrefix === 'en' ? '/en' : '/pt'
  }

  const template = definition.localized[localePrefix]
  return fillTemplate(template, params)
}

export function buildInternalPath(key: RouteKey, params: Record<string, string> = {}): string {
  const definition = definitionsByKey.get(key)
  if (!definition) {
    return '/'
  }

  return fillTemplate(definition.internalTemplate, params)
}

export function getInternalQueryDefaults(key: RouteKey): Record<string, string> {
  const definition = definitionsByKey.get(key)
  return definition?.internalQuery ?? {}
}

export function buildLocalizedUrl(
  key: RouteKey,
  localePrefix: LocalePrefix,
  options?: {
    params?: Record<string, string>
    query?: URLSearchParams | ReadonlyURLSearchParams | Record<string, string | null | undefined>
  }
): string {
  const pathname = buildLocalizedPath(key, localePrefix, options?.params ?? {})
  const query = toUrlSearchParams(options?.query)
  query.delete('mode')
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function buildInternalUrl(
  key: RouteKey,
  options?: {
    params?: Record<string, string>
    query?: URLSearchParams | ReadonlyURLSearchParams | Record<string, string | null | undefined>
  }
): string {
  const pathname = buildInternalPath(key, options?.params ?? {})
  const query = toUrlSearchParams(options?.query)

  if (key === 'login') {
    query.delete('mode')
  } else {
    const defaults = getInternalQueryDefaults(key)
    for (const [name, value] of Object.entries(defaults)) {
      query.set(name, value)
    }
  }

  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

function stripLocalePrefixFromTemplate(template: string): string {
  const normalized = normalizePathname(template)
  if (normalized.startsWith('/pt/')) {
    return normalized.slice('/pt'.length)
  }
  if (normalized === '/pt') {
    return '/'
  }
  if (normalized.startsWith('/en/')) {
    return normalized.slice('/en'.length)
  }
  if (normalized === '/en') {
    return '/'
  }
  return normalized
}

function matchTemplate(template: string, pathname: string): Record<string, string> | null {
  const templatePath = normalizePathname(template)
  const targetPath = normalizePathname(pathname)

  const templateParts = templatePath.split('/').filter(Boolean)
  const targetParts = targetPath.split('/').filter(Boolean)
  if (templateParts.length !== targetParts.length) {
    return null
  }

  const params: Record<string, string> = {}
  for (let index = 0; index < templateParts.length; index += 1) {
    const templatePart = templateParts[index]
    const targetPart = targetParts[index]
    if (templatePart.startsWith(':')) {
      const key = templatePart.slice(1).trim()
      if (!key) {
        return null
      }
      params[key] = decodeURIComponent(targetPart)
      continue
    }

    if (templatePart !== targetPart) {
      return null
    }
  }

  return params
}

function fillTemplate(template: string, params: Record<string, string>): string {
  const normalized = normalizePathname(template)
  if (normalized === '/') {
    return '/'
  }

  const output = normalized
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (!part.startsWith(':')) {
        return part
      }

      const key = part.slice(1).trim()
      const value = params[key]
      if (!value) {
        return part
      }
      return encodeURIComponent(value)
    })

  return `/${output.join('/')}`
}

function toUrlSearchParams(
  input?: URLSearchParams | ReadonlyURLSearchParams | Record<string, string | null | undefined>
): URLSearchParams {
  if (!input) {
    return new URLSearchParams()
  }

  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input.toString())
  }

  if (isReadonlySearchParams(input)) {
    return new URLSearchParams((input as ReadonlyURLSearchParams).toString())
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.length > 0) {
      params.set(key, value)
    }
  }
  return params
}

function isReadonlySearchParams(
  value: URLSearchParams | ReadonlyURLSearchParams | Record<string, string | null | undefined>
): value is ReadonlyURLSearchParams {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as ReadonlyURLSearchParams
  return (
    typeof candidate.get === 'function' &&
    typeof candidate.entries === 'function' &&
    typeof candidate.toString === 'function'
  )
}
