'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Languages, Menu, MessageCircle, X } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { trackCustom } from '@/lib/metaPixel'
import { useI18n } from '@/lib/i18n/client'
import { usePathname, useRouter } from 'next/navigation'
import type { LocalePrefix } from '@/lib/i18n/locales'

export function HeaderV2({ variant = 'stable' }: { variant?: 'stable' | 'preview' }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeLocaleMenu, setActiveLocaleMenu] = useState<'desktop' | 'mobile' | null>(null)
  const { user, loading } = useAuth()
  const { localePrefix, toRoute, t } = useI18n()
  const isEn = localePrefix === 'en'
  const tr = useCallback((pt: string, en: string) => (isEn ? en : pt), [isEn])
  const router = useRouter()
  const pathname = usePathname()
  const desktopLocaleMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileLocaleMenuRef = useRef<HTMLDivElement | null>(null)

  const navLinks = useMemo(
    () =>
      isEn
        ? [
            { href: '#product', label: 'Product' },
            { href: '#how-it-works', label: 'How it works' },
            { href: '#pricing', label: 'Pricing' },
            { href: '#faq', label: 'FAQ' }
          ]
        : [
            { href: '#produto', label: 'Produto' },
            { href: '#como-funciona', label: 'Como funciona' },
            { href: '#precos', label: 'Preços' },
            { href: '#faq', label: 'FAQ' }
          ],
    [isEn]
  )

  const showLocaleSwitcher = useMemo(() => {
    return pathname === '/' || pathname === '/pt' || pathname === '/en'
  }, [pathname])

  const handlePrimaryCtaClick = (location: 'header_desktop' | 'header_mobile') => {
    trackCustom('LandingV2_CTA_Primary_Click', { location })
  }

  const handleLocaleChange = (nextPrefix: LocalePrefix) => {
    router.push(nextPrefix === 'en' ? '/en' : '/pt')
  }

  const handleLocaleSelect = (nextPrefix: LocalePrefix) => {
    setActiveLocaleMenu(null)
    if (nextPrefix === localePrefix) return
    handleLocaleChange(nextPrefix)
  }

  useEffect(() => {
    if (!activeLocaleMenu) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return

      if (
        activeLocaleMenu === 'desktop' &&
        desktopLocaleMenuRef.current?.contains(target)
      ) {
        return
      }

      if (
        activeLocaleMenu === 'mobile' &&
        mobileLocaleMenuRef.current?.contains(target)
      ) {
        return
      }

      setActiveLocaleMenu(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveLocaleMenu(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [activeLocaleMenu])

  useEffect(() => {
    if (!isMenuOpen && activeLocaleMenu === 'mobile') {
      setActiveLocaleMenu(null)
    }
  }, [activeLocaleMenu, isMenuOpen])

  const homeHref = localePrefix === 'en' ? '/en' : '/pt'

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-surface/70 backdrop-blur-md">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <a href={homeHref} className="group flex items-center gap-2" aria-label="AutoWhats - Home">
          <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110">
            <MessageCircle className="h-6 w-6 text-black" />
          </div>
          <span className="text-xl font-bold text-white">
            Auto<span className="gradient-text">Whats</span>
          </span>
          {variant === 'preview' && (
            <span className="ml-2 hidden items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary/90 sm:inline-flex">
              preview
            </span>
          )}
        </a>

        <div className="hidden items-center gap-8 md:flex" aria-label={tr('Navegacao primaria', 'Primary navigation')}>
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="font-medium text-gray-300/80 transition-colors hover:text-white">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          {showLocaleSwitcher && (
            <div className="flex items-center gap-2 rounded-xl border border-surface-lighter bg-surface-light/90 px-2.5 py-1.5">
              <Languages className="h-4 w-4 text-gray-400" />
              <div
                ref={desktopLocaleMenuRef}
                className={cn(
                  'relative w-[208px] rounded-lg transition-all',
                  activeLocaleMenu === 'desktop' &&
                    'ring-2 ring-primary/45 ring-offset-1 ring-offset-surface-light shadow-[0_0_0_1px_rgba(34,197,94,0.38)]'
                )}
              >
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={activeLocaleMenu === 'desktop'}
                  aria-label={t('language.label', 'Language')}
                  onClick={() =>
                    setActiveLocaleMenu((prev) => (prev === 'desktop' ? null : 'desktop'))
                  }
                  className="flex h-7 w-full items-center justify-between rounded-lg border border-surface-lighter/70 bg-surface px-2.5 text-xs font-medium text-gray-100 transition-colors hover:border-primary/40"
                >
                  <span className="truncate">
                    {localePrefix === 'en'
                      ? t('language.english', 'English')
                      : t('language.portuguese', 'Português (Brasil)')}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-gray-400 transition-transform',
                      activeLocaleMenu === 'desktop' && 'rotate-180 text-primary'
                    )}
                  />
                </button>

                {activeLocaleMenu === 'desktop' ? (
                  <div
                    role="listbox"
                    aria-label={t('language.label', 'Language')}
                    className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-full rounded-xl border border-surface-lighter bg-surface p-1.5 shadow-2xl"
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={localePrefix === 'pt'}
                      onClick={() => handleLocaleSelect('pt')}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                        localePrefix === 'pt'
                          ? 'bg-primary/20 text-primary'
                          : 'text-gray-200 hover:bg-surface-light hover:text-white'
                      )}
                    >
                      <span>{t('language.portuguese', 'Português (Brasil)')}</span>
                      {localePrefix === 'pt' ? (
                        <span className="text-[10px] font-semibold uppercase">
                          {tr('Atual', 'Current')}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      role="option"
                      aria-selected={localePrefix === 'en'}
                      onClick={() => handleLocaleSelect('en')}
                      className={cn(
                        'mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                        localePrefix === 'en'
                          ? 'bg-primary/20 text-primary'
                          : 'text-gray-200 hover:bg-surface-light hover:text-white'
                      )}
                    >
                      <span>{t('language.english', 'English')}</span>
                      {localePrefix === 'en' ? (
                        <span className="text-[10px] font-semibold uppercase">
                          {tr('Atual', 'Current')}
                        </span>
                      ) : null}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {!loading && user ? (
            <ButtonLink href={toRoute('dashboard_home')} variant="default">
              Dashboard
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href={toRoute('login')} variant="ghost">
                {tr('Login', 'Login')}
              </ButtonLink>
              <ButtonLink href={toRoute('signup')} onClick={() => handlePrimaryCtaClick('header_desktop')}>
                {tr('Teste grátis', 'Free trial')}
              </ButtonLink>
            </>
          )}
        </div>

        <button
          className="p-2 text-gray-300 hover:text-white md:hidden"
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-label={isMenuOpen ? tr('Fechar menu', 'Close menu') : tr('Abrir menu', 'Open menu')}
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      <div
        className={cn(
          'md:hidden absolute left-0 right-0 top-16 border-b border-white/5 bg-surface/95 backdrop-blur-md transition-all duration-300',
          isMenuOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'
        )}
      >
        <div className="container mx-auto flex flex-col gap-3 px-4 py-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="py-2 font-medium text-gray-300/80 transition-colors hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}

          <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
            {showLocaleSwitcher && (
              <div className="rounded-xl border border-surface-lighter bg-surface-light/90 p-2">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Languages className="h-4 w-4 text-gray-400" />
                  <span className="text-xs text-gray-300">{t('language.label', 'Language')}</span>
                </div>
                <div
                  ref={mobileLocaleMenuRef}
                  className={cn(
                    'relative rounded-lg transition-all',
                    activeLocaleMenu === 'mobile' &&
                      'ring-2 ring-primary/45 ring-offset-1 ring-offset-surface-light shadow-[0_0_0_1px_rgba(34,197,94,0.38)]'
                  )}
                >
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={activeLocaleMenu === 'mobile'}
                    aria-label={t('language.label', 'Language')}
                    onClick={() => setActiveLocaleMenu((prev) => (prev === 'mobile' ? null : 'mobile'))}
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-surface-lighter/70 bg-surface px-3 text-xs font-medium text-gray-100 transition-colors hover:border-primary/40"
                  >
                    <span className="truncate">
                      {localePrefix === 'en'
                        ? t('language.english', 'English')
                        : t('language.portuguese', 'Português (Brasil)')}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 text-gray-400 transition-transform',
                        activeLocaleMenu === 'mobile' && 'rotate-180 text-primary'
                      )}
                    />
                  </button>

                  {activeLocaleMenu === 'mobile' ? (
                    <div
                      role="listbox"
                      aria-label={t('language.label', 'Language')}
                      className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-full rounded-xl border border-surface-lighter bg-surface p-1.5 shadow-2xl"
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={localePrefix === 'pt'}
                        onClick={() => handleLocaleSelect('pt')}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                          localePrefix === 'pt'
                            ? 'bg-primary/20 text-primary'
                            : 'text-gray-200 hover:bg-surface-light hover:text-white'
                        )}
                      >
                        <span>{t('language.portuguese', 'Português (Brasil)')}</span>
                        {localePrefix === 'pt' ? (
                          <span className="text-[10px] font-semibold uppercase">
                            {tr('Atual', 'Current')}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        role="option"
                        aria-selected={localePrefix === 'en'}
                        onClick={() => handleLocaleSelect('en')}
                        className={cn(
                          'mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                          localePrefix === 'en'
                            ? 'bg-primary/20 text-primary'
                            : 'text-gray-200 hover:bg-surface-light hover:text-white'
                        )}
                      >
                        <span>{t('language.english', 'English')}</span>
                        {localePrefix === 'en' ? (
                          <span className="text-[10px] font-semibold uppercase">
                            {tr('Atual', 'Current')}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {!loading && user ? (
              <ButtonLink href={toRoute('dashboard_home')} variant="default" onClick={() => setIsMenuOpen(false)}>
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href={toRoute('login')} variant="ghost" onClick={() => setIsMenuOpen(false)}>
                  {tr('Login', 'Login')}
                </ButtonLink>
                <ButtonLink
                  href={toRoute('signup')}
                  onClick={() => {
                    handlePrimaryCtaClick('header_mobile')
                    setIsMenuOpen(false)
                  }}
                >
                  {tr('Teste grátis', 'Free trial')}
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
