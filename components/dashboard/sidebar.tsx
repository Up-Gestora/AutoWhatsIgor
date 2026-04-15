'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  QrCode,
  Brain,
  MessageSquare,
  Users,
  Files,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  LogOut,
  Calendar,
  Sparkles,
  DollarSign,
  UserCheck,
  Megaphone,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { useHoverCapable } from '@/lib/hooks/useHoverCapable'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useI18n } from '@/lib/i18n/client'
import type { RouteKey } from '@/lib/i18n/routes'

type MenuItem = {
  icon: LucideIcon
  labelKey: string
  routeKey: RouteKey
  disabled?: boolean
  badge?: string
}

const allMenuItems: MenuItem[] = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', routeKey: 'dashboard_home' },
  { icon: QrCode, labelKey: 'nav.connections', routeKey: 'connections' },
  { icon: Brain, labelKey: 'nav.training', routeKey: 'training' },
  { icon: MessageSquare, labelKey: 'nav.conversations', routeKey: 'conversations' },
  { icon: Users, labelKey: 'nav.leads', routeKey: 'leads' },
  { icon: UserCheck, labelKey: 'nav.clients', routeKey: 'clients' },
  { icon: Calendar, labelKey: 'nav.calendar', routeKey: 'calendar' },
  { icon: Megaphone, labelKey: 'nav.broadcasts', routeKey: 'broadcasts' },
  { icon: Files, labelKey: 'nav.files', routeKey: 'files' },
  { icon: DollarSign, labelKey: 'nav.billing', routeKey: 'billing' },
  { icon: Settings, labelKey: 'nav.settings', routeKey: 'settings' },
  { icon: BookOpen, labelKey: 'nav.tutorials', routeKey: 'tutorials' },
  { icon: Sparkles, labelKey: 'nav.updates', routeKey: 'updates' }
]

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
  isMobileOpen: boolean
  setIsMobileOpen: (value: boolean) => void
  isSubaccount?: boolean
}

function isRouteActive(currentKey: RouteKey | null | undefined, itemKey: RouteKey): boolean {
  if (currentKey === itemKey) {
    return true
  }
  if (itemKey === 'broadcasts' && currentKey === 'broadcast_detail') {
    return true
  }
  if (itemKey === 'training' && currentKey === 'training_copilot') {
    return true
  }
  return false
}

export function Sidebar({
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  isSubaccount = false
}: SidebarProps) {
  const router = useRouter()
  const { route, t, toRoute } = useI18n()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const hoverCapable = useHoverCapable()
  const autoHover = isDesktop && hoverCapable
  const [isHovering, setIsHovering] = useState(false)

  const menuItems = useMemo(() => {
    if (!isSubaccount) {
      return allMenuItems
    }
    return allMenuItems.filter((item) => item.routeKey === 'conversations')
  }, [isSubaccount])

  useEffect(() => {
    if (!autoHover || !isCollapsed) {
      setIsHovering(false)
    }
  }, [autoHover, isCollapsed])

  const collapsed = !isDesktop ? false : autoHover ? isCollapsed && !isHovering : isCollapsed
  const developmentLabel = t('nav.inDevelopment', 'Em desenvolvimento')

  const handleLogout = async () => {
    if (!auth) return

    try {
      await signOut(auth)
      router.push(toRoute('login'))
    } catch (error) {
      console.error('Erro ao sair:', error)
    }
  }

  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      <aside
        onMouseEnter={() => {
          if (autoHover && isCollapsed) {
            setIsHovering(true)
          }
        }}
        onMouseLeave={() => {
          if (autoHover) {
            setIsHovering(false)
          }
        }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-surface-light border-r border-surface-lighter transition-all duration-300 flex flex-col md:sticky md:top-0 md:h-screen md:self-start md:inset-y-auto',
          collapsed ? 'w-20 overflow-visible' : 'w-64 overflow-hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="h-16 flex items-center px-4 border-b border-surface-lighter shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="min-w-[40px] h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6 text-black" />
            </div>
            {!collapsed && (
              <span className="text-xl font-bold text-white whitespace-nowrap animate-fade-in">
                {t('app.name', 'AutoWhats').replace('AutoWhats', 'Auto')}<span className="gradient-text">Whats</span>
              </span>
            )}
          </div>
        </div>

        <nav className={cn('flex-1 py-4 px-3 space-y-2', collapsed ? 'overflow-visible' : 'overflow-y-auto')}>
          {menuItems.map((item) => {
            const activeKey = route?.key ?? null
            const isActive = isRouteActive(activeKey, item.routeKey)
            const isDisabled = Boolean(item.disabled)
            const label = t(item.labelKey, item.routeKey)
            const badge = item.badge ?? developmentLabel
            const tooltipLabel = isDisabled ? `${label} . ${badge}` : label
            const itemClasses = cn(
              'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative',
              isDisabled
                ? 'text-gray-500 cursor-not-allowed opacity-60'
                : isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-400 hover:text-white hover:bg-surface-lighter'
            )
            const itemContent = (
              <>
                <item.icon
                  className={cn(
                    'w-6 h-6 shrink-0 transition-transform',
                    isDisabled
                      ? 'text-gray-500'
                      : isActive
                        ? 'text-primary'
                        : 'text-gray-400 group-hover:text-white group-hover:scale-110'
                  )}
                />
                {!collapsed && <span className="font-medium whitespace-nowrap animate-fade-in">{label}</span>}
                {!collapsed && isDisabled && (
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
                    {badge}
                  </span>
                )}
                {isActive && !isDisabled && <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />}

                {collapsed && (
                  <div className="pointer-events-none absolute left-full z-50 ml-4 hidden whitespace-nowrap rounded-lg border border-white/10 bg-surface-lighter px-3 py-2 text-sm font-medium text-white shadow-xl group-hover:block">
                    {tooltipLabel}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-surface-lighter" />
                  </div>
                )}
              </>
            )

            if (isDisabled) {
              return (
                <div key={item.routeKey} aria-disabled="true" className={itemClasses}>
                  {itemContent}
                </div>
              )
            }

            return (
              <a key={item.routeKey} href={toRoute(item.routeKey)} className={itemClasses}>
                {itemContent}
              </a>
            )
          })}

          <div className="pt-2 mt-2 border-t border-surface-lighter space-y-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                'hidden md:flex w-full items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-surface-lighter transition-all group relative',
                collapsed && 'justify-center'
              )}
            >
              {isCollapsed ? (
                <>
                  <ChevronRight className="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" />
                  {!collapsed && <span className="font-medium animate-fade-in">{t('nav.keepOpen', 'Manter aberto')}</span>}
                  {collapsed && (
                    <div className="pointer-events-none absolute left-full z-50 ml-4 hidden whitespace-nowrap rounded-lg border border-white/10 bg-surface-lighter px-3 py-2 text-sm font-medium text-white shadow-xl group-hover:block">
                      {t('nav.expand', 'Expandir Menu')}
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-surface-lighter" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <ChevronLeft className="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" />
                  <span className="font-medium animate-fade-in">{t('nav.collapse', 'Recolher Menu')}</span>
                </>
              )}
            </button>

            <button
              onClick={handleLogout}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all group relative',
                collapsed && 'justify-center'
              )}
            >
              <LogOut className="w-6 h-6 shrink-0 transition-transform group-hover:scale-110" />
              {!collapsed && <span className="font-medium animate-fade-in">{t('nav.logout', 'Sair')}</span>}

              {collapsed && (
                <div className="pointer-events-none absolute left-full z-50 ml-4 hidden whitespace-nowrap rounded-lg border border-red-400/10 bg-surface-lighter px-3 py-2 text-sm font-medium text-red-400 shadow-xl group-hover:block">
                  {t('nav.logout', 'Sair')}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-surface-lighter" />
                </div>
              )}
            </button>
          </div>
        </nav>
      </aside>
    </>
  )
}
