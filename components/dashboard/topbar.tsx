'use client'

import { Bell, ChevronDown, Languages, Menu, Search, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { db, updateUserProfile } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/client'
import { buildLocalizedUrl, type RouteKey } from '@/lib/i18n/routes'
import type { LocalePrefix } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'

interface TopbarProps {
  onMenuClick: () => void
  isSubaccount?: boolean
  planTier?: 'basic' | 'premium'
  planLoading?: boolean
}

const TITLE_KEYS_BY_ROUTE: Partial<Record<RouteKey, string>> = {
  dashboard_home: 'topbar.titles.dashboard_home',
  connections: 'topbar.titles.connections',
  training: 'topbar.titles.training',
  onboarding_setup: 'topbar.titles.onboarding_setup',
  training_copilot: 'topbar.titles.training_copilot',
  conversations: 'topbar.titles.conversations',
  leads: 'topbar.titles.leads',
  files: 'topbar.titles.files',
  settings: 'topbar.titles.settings',
  tutorials: 'topbar.titles.tutorials',
  clients: 'topbar.titles.clients',
  broadcasts: 'topbar.titles.broadcasts',
  broadcast_detail: 'topbar.titles.broadcasts',
  calendar: 'topbar.titles.calendar',
  billing: 'topbar.titles.billing',
  updates: 'topbar.titles.updates'
}

const LOCALE_MENU_OPEN_CLASS =
  'ring-2 ring-primary/45 ring-offset-1 ring-offset-surface-light shadow-[0_0_0_1px_rgba(34,197,94,0.38)]'

function formatUserName(fullName: string): string {
  if (!fullName) return ''

  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0]

  const firstName = parts[0]
  const lastName = parts[parts.length - 1]
  const lastInitial = lastName.charAt(0).toUpperCase()

  return `${firstName} ${lastInitial}.`
}

export function Topbar({
  onMenuClick,
  isSubaccount = false,
  planTier = 'basic',
  planLoading = false
}: TopbarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { route, t, localePrefix } = useI18n()
  const [userName, setUserName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false)
  const localeMenuRef = useRef<HTMLDivElement | null>(null)

  const title = useMemo(() => {
    const titleKey = route?.key ? TITLE_KEYS_BY_ROUTE[route.key] : null
    if (titleKey) {
      return t(titleKey, 'Dashboard')
    }
    return t('nav.dashboard', 'Dashboard')
  }, [route?.key, t])
  const showBasicPlanBadge = !isSubaccount && planTier === 'basic' && route?.key === 'dashboard_home'

  useEffect(() => {
    if (!user?.uid || !db) {
      setIsLoading(false)
      setUserName('')
      return
    }

    setIsLoading(true)

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data()
          if (data?.nome) {
            setUserName(formatUserName(data.nome))
          } else {
            setUserName('')
          }
        } else {
          setUserName('')
        }
        setIsLoading(false)
      },
      (error) => {
        console.error('Erro ao escutar mudancas no perfil:', error)
        setIsLoading(false)
        setUserName('')
      }
    )

    return () => unsubscribe()
  }, [user?.uid])

  const handleLocaleChange = async (nextPrefix: LocalePrefix) => {
    const nextLocale = nextPrefix === 'en' ? 'en' : 'pt-BR'

    try {
      if (user?.uid) {
        await updateUserProfile(user.uid, { locale: nextLocale })
      }
    } catch (error) {
      console.warn('[topbar] Failed to persist locale:', error)
    }

    const nextPath = route
      ? buildLocalizedUrl(route.key, nextPrefix, {
          params: route.params,
          query: searchParams
        })
      : nextPrefix === 'en'
        ? '/en/dashboard'
        : '/pt/dashboard'

    router.push(nextPath)
  }

  const handleLocaleSelect = async (nextPrefix: LocalePrefix) => {
    setIsLocaleMenuOpen(false)
    if (nextPrefix === localePrefix) return
    await handleLocaleChange(nextPrefix)
  }

  useEffect(() => {
    if (!isLocaleMenuOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (localeMenuRef.current?.contains(target)) return
      setIsLocaleMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLocaleMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isLocaleMenuOpen])

  return (
    <header className="dashboard-topbar sticky top-0 z-30 flex h-16 min-w-0 items-center justify-between border-b border-surface-lighter bg-surface/80 px-4 backdrop-blur-md md:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <button onClick={onMenuClick} className="p-2 text-gray-400 hover:text-white md:hidden">
          <Menu className="w-6 h-6" />
        </button>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <h2 className="truncate text-xl font-semibold text-white">{title}</h2>
          {showBasicPlanBadge ? (
            <span className="shrink-0 rounded-md border border-primary/35 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {t('nav.basicPlanBadge', 'Basic plan active')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <div className="hidden xl:flex flex-col items-start gap-1">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder={t('topbar.search', 'Buscar...')}
              className="pl-9 h-9 bg-surface-light border-surface-lighter text-xs"
              disabled
              aria-label={`${t('topbar.search', 'Buscar...')} (${t('topbar.development', 'Em desenvolvimento')})`}
              title={`${t('topbar.search', 'Buscar...')} (${t('topbar.development', 'Em desenvolvimento')})`}
            />
          </div>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
            {t('topbar.development', 'Em desenvolvimento')}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 rounded-xl border border-surface-lighter bg-surface-light px-2.5 py-1.5">
          <Languages className="h-4 w-4 text-gray-400" />
          <div
            ref={localeMenuRef}
            className={cn(
              'relative w-[208px] rounded-lg transition-all',
              isLocaleMenuOpen && LOCALE_MENU_OPEN_CLASS
            )}
          >
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isLocaleMenuOpen}
              aria-label={t('language.label', 'Idioma')}
              onClick={() => setIsLocaleMenuOpen((prev) => !prev)}
              className="flex h-7 w-full items-center justify-between rounded-lg border border-surface-lighter bg-surface px-2.5 text-xs font-medium text-white transition-colors hover:border-primary/40"
            >
              <span className="truncate">
                {localePrefix === 'en'
                  ? t('language.english', 'English')
                  : t('language.portuguese', 'Português (Brasil)')}
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 text-gray-400 transition-transform',
                  isLocaleMenuOpen && 'rotate-180 text-primary'
                )}
              />
            </button>

            {isLocaleMenuOpen ? (
              <div
                role="listbox"
                aria-label={t('language.label', 'Idioma')}
                className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-full rounded-xl border border-surface-lighter bg-surface p-1.5 shadow-2xl"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={localePrefix === 'pt'}
                  onClick={() => {
                    void handleLocaleSelect('pt')
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                    localePrefix === 'pt'
                      ? 'bg-primary/20 text-primary'
                      : 'text-gray-200 hover:bg-surface-light hover:text-white'
                  )}
                >
                  <span>{t('language.portuguese', 'Português (Brasil)')}</span>
                  {localePrefix === 'pt'
                    ? <span className="text-[10px] font-semibold uppercase">{t('topbar.current', 'Atual')}</span>
                    : null}
                </button>
                <button
                  type="button"
                  role="option"
                  aria-selected={localePrefix === 'en'}
                  onClick={() => {
                    void handleLocaleSelect('en')
                  }}
                  className={cn(
                    'mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                    localePrefix === 'en'
                      ? 'bg-primary/20 text-primary'
                      : 'text-gray-200 hover:bg-surface-light hover:text-white'
                  )}
                >
                  <span>{t('language.english', 'English')}</span>
                  {localePrefix === 'en'
                    ? <span className="text-[10px] font-semibold uppercase">{t('topbar.current', 'Current')}</span>
                    : null}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-gray-400 hover:text-white"
            disabled
            aria-label={`${t('topbar.development', 'Em desenvolvimento')}`}
            title={t('topbar.development', 'Em desenvolvimento')}
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-surface" />
          </Button>
          <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full lg:inline-flex">
            {t('topbar.development', 'Em desenvolvimento')}
          </span>
        </div>

        <div className="flex items-center gap-2 border-l border-surface-lighter pl-2 md:pl-3">
          <div className="hidden text-right xl:block">
            <p className="text-sm font-semibold text-white">
              {isLoading ? t('topbar.loading', 'Carregando...') : userName || t('topbar.noName', 'Sem nome')}
            </p>
            <p
              className={`text-[10px] ${
                isSubaccount
                  ? 'text-blue-300'
                  : planLoading
                    ? 'text-gray-400'
                    : planTier === 'premium'
                      ? 'text-primary'
                      : 'text-gray-400'
              }`}
            >
              {isSubaccount
                ? t('nav.subaccount', 'Sub-conta')
                : planLoading
                  ? t('topbar.planLoading', 'Plano ...')
                  : planTier === 'premium'
                    ? t('topbar.planPro', 'Plano Pro')
                    : t('topbar.planFree', 'Plano Free')}
            </p>
          </div>
          <div className="w-9 h-9 rounded-full bg-surface-lighter border border-surface-lighter flex items-center justify-center overflow-hidden">
            <User className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>
    </header>
  )
}
