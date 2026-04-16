'use client'

import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Topbar } from '@/components/dashboard/topbar'
import { WhatsAppModal } from '@/components/dashboard/whatsapp-modal'
import { WhatsAppFloat } from '@/components/whatsapp-float'
import { GamifiedOnboardingBar } from '@/components/onboarding/gamified-onboarding-bar'
import { useAuth } from '@/providers/auth-provider'
import { db, isLocalAuthBypassEnabled } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useHoverCapable } from '@/lib/hooks/useHoverCapable'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useI18n } from '@/lib/i18n/client'
import { normalizeLocale, localeToPrefix } from '@/lib/i18n/locales'
import { buildLocalizedUrl, type RouteKey } from '@/lib/i18n/routes'
import { parseResponsePayload } from '@/lib/http-error'

type AccountType = 'main' | 'subaccount'
type DashboardPlanTier = 'basic' | 'premium'
const SIDEBAR_PREFERENCE_KEY = 'dashboard.sidebar.preference.v1'
const PREMIUM_ONLY_ROUTES = new Set<RouteKey>([
  'clients',
  'calendar',
  'broadcasts',
  'broadcast_detail',
  'files',
  'updates'
])

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hasLoadedSidebarPreference, setHasLoadedSidebarPreference] = useState(false)
  const [savedSidebarPreference, setSavedSidebarPreference] = useState<'collapsed' | 'expanded' | null>(null)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [checkingProfile, setCheckingProfile] = useState(true)
  const [accountType, setAccountType] = useState<AccountType>('main')
  const [planTier, setPlanTier] = useState<DashboardPlanTier>('basic')
  const [loadingPlan, setLoadingPlan] = useState(true)
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { route, localePrefix, toRoute } = useI18n()
  const isConversationsPage = route?.key === 'conversations'
  const isOnboardingSetupPage = route?.key === 'onboarding_setup'
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const hoverCapable = useHoverCapable()
  const isSubaccount = accountType === 'subaccount'
  const localAuthBypassEnabled = isLocalAuthBypassEnabled()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY)
    if (saved === 'collapsed' || saved === 'expanded') {
      setSavedSidebarPreference(saved)
    } else {
      setSavedSidebarPreference(null)
    }
    setHasLoadedSidebarPreference(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSidebarPreference) return

    if (!isDesktop) {
      setIsCollapsed(false)
      return
    }

    if (savedSidebarPreference) {
      setIsCollapsed(savedSidebarPreference === 'collapsed')
      return
    }

    setIsCollapsed(hoverCapable)
  }, [hasLoadedSidebarPreference, isDesktop, hoverCapable, savedSidebarPreference])

  const handleSetIsCollapsed = useCallback((value: boolean) => {
    setIsCollapsed(value)
    setSavedSidebarPreference(value ? 'collapsed' : 'expanded')

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, value ? 'collapsed' : 'expanded')
    }
  }, [])

  useEffect(() => {
    if (!loading && !user) {
      router.push(toRoute('login'))
      return
    }

    const checkUserProfile = async () => {
      if (user && db) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            const nextAccountType: AccountType =
              userData?.accountType === 'subaccount' ? 'subaccount' : 'main'
            setAccountType(nextAccountType)

            const accountLocale = normalizeLocale(userData?.locale)
            const accountLocalePrefix = localeToPrefix(accountLocale)

            if (route && accountLocalePrefix !== localePrefix) {
              const nextPath = buildLocalizedUrl(route.key, accountLocalePrefix, {
                params: route.params,
                query: searchParams
              })
              router.replace(nextPath)
              return
            }

            if (nextAccountType === 'subaccount') {
              setShowWhatsAppModal(false)
              if (route?.key !== 'conversations') {
                router.replace(
                  buildLocalizedUrl('conversations', accountLocalePrefix, { query: searchParams })
                )
              }
            } else if (!userData.whatsapp && !isOnboardingSetupPage) {
              setShowWhatsAppModal(true)
            } else {
              setShowWhatsAppModal(false)
            }
          } else {
            setAccountType('main')
            setShowWhatsAppModal(true)
          }
        } catch (error) {
          console.error('Erro ao verificar perfil:', error)
          setAccountType('main')
        } finally {
          setCheckingProfile(false)
        }
      } else if (!loading) {
        setCheckingProfile(false)
      }
    }

    if (!loading && user) {
      setCheckingProfile(true)
      void checkUserProfile()
    }
  }, [user, loading, route, localePrefix, router, searchParams, toRoute, isOnboardingSetupPage])

  useEffect(() => {
    if (loading || checkingProfile || !user?.uid) {
      return
    }

    if (localAuthBypassEnabled || isSubaccount) {
      setPlanTier('basic')
      setLoadingPlan(false)
      return
    }

    let cancelled = false

    const loadPlanTier = async () => {
      setLoadingPlan(true)
      try {
        const token = await user.getIdToken()
        const response = await fetch('/api/billing/plan', {
          headers: {
            authorization: `Bearer ${token}`
          },
          cache: 'no-store'
        })

        const { payload } = await parseResponsePayload<{ plan?: string }>(response)
        const nextTier: DashboardPlanTier =
          response.ok && payload?.plan === 'pro' ? 'premium' : 'basic'

        if (!cancelled) {
          setPlanTier(nextTier)
        }
      } catch {
        if (!cancelled) {
          setPlanTier('basic')
        }
      } finally {
        if (!cancelled) {
          setLoadingPlan(false)
        }
      }
    }

    const handleFocus = () => {
      void loadPlanTier()
    }

    void loadPlanTier()
    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkingProfile, isSubaccount, loading, localAuthBypassEnabled, user])

  useEffect(() => {
    if (loading || checkingProfile || loadingPlan || isSubaccount) {
      return
    }

    const routeKey = route?.key
    if (!routeKey) {
      return
    }

    if (planTier === 'basic' && PREMIUM_ONLY_ROUTES.has(routeKey)) {
      router.replace(toRoute('dashboard_home'))
    }
  }, [checkingProfile, isSubaccount, loading, loadingPlan, planTier, route?.key, router, toRoute])

  if (loading || (user && (checkingProfile || (!isSubaccount && loadingPlan)))) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-surface relative overflow-hidden">
      {showWhatsAppModal && user && !isSubaccount && (
        <WhatsAppModal userId={user.uid} onSuccess={() => setShowWhatsAppModal(false)} />
      )}

      {isOnboardingSetupPage ? null : (
        <Sidebar
          isCollapsed={isCollapsed}
          setIsCollapsed={handleSetIsCollapsed}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
          isSubaccount={isSubaccount}
          planTier={planTier}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {isOnboardingSetupPage ? (
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-surface-lighter bg-surface/90 px-4 py-3 backdrop-blur-md md:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary">
                {localePrefix === 'en' ? 'Hidden onboarding' : 'Onboarding oculto'}
              </p>
              <p className="mt-1 text-sm text-gray-300">
                {localePrefix === 'en'
                  ? 'Focused setup shell'
                  : 'Shell focado de configuração'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-300">
              <span className="rounded-full border border-surface-lighter px-3 py-1">
                {localePrefix.toUpperCase()}
              </span>
              <span className="hidden max-w-[240px] truncate md:block">
                {user?.email ?? ''}
              </span>
            </div>
          </header>
        ) : (
          <Topbar
            onMenuClick={() => setIsMobileOpen(true)}
            isSubaccount={isSubaccount}
            planTier={planTier}
            planLoading={loadingPlan}
          />
        )}
        <main
          className={`flex-1 overflow-y-auto overflow-x-hidden ${isOnboardingSetupPage ? 'p-4 md:p-6' : 'p-4 md:p-8'} ${isConversationsPage ? 'pb-0' : ''}`}
        >
          {children}
        </main>
      </div>
      {!isOnboardingSetupPage && !isSubaccount ? (
        <GamifiedOnboardingBar isSubaccount={isSubaccount} />
      ) : null}
      {!isOnboardingSetupPage ? <WhatsAppFloat /> : null}
    </div>
  )
}
