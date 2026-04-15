'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  QrCode,
  Settings,
  Target,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { auth } from '@/lib/firebase'
import { useHoverCapable } from '@/lib/hooks/useHoverCapable'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

const menuItems = [
  { icon: LayoutDashboard, label: 'Geral', href: '/admin' },
  { icon: QrCode, label: 'Sessoes', href: '/admin/sessoes' },
  { icon: Users, label: 'Usuários', href: '/admin/users' },
  { icon: UserCheck, label: 'Acesso admin', href: '/admin/acesso-adm' },
  { icon: Target, label: 'Leads CRM', href: '/admin/leads' },
  { icon: Megaphone, label: 'Marketing', href: '/admin/marketing' },
  { icon: Settings, label: 'Configurações', href: '/admin/settings' },
]

interface AdminSidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
  isMobileOpen: boolean
  setIsMobileOpen: (value: boolean) => void
}

export function AdminSidebar({
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hoverCapable = useHoverCapable()
  const autoHover = isDesktop && hoverCapable
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    if (!autoHover || !isCollapsed) {
      setIsHovering(false)
    }
  }, [autoHover, isCollapsed])

  const collapsed = !isDesktop ? false : autoHover ? isCollapsed && !isHovering : isCollapsed

  const handleLogout = async () => {
    if (!auth) return

    try {
      await signOut(auth!)
      router.push('/login')
    } catch (error) {
      console.error('Erro ao sair:', error)
    }
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
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
          'fixed inset-y-0 left-0 z-50 bg-surface-light border-r border-surface-lighter transition-all duration-300 flex flex-col lg:sticky lg:top-0 lg:h-screen lg:self-start lg:inset-y-auto',
          collapsed ? 'w-20 overflow-visible' : 'w-64 overflow-hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header/Logo */}
        <div className="h-16 flex items-center px-4 border-b border-surface-lighter shrink-0 justify-between">
          <Link
            href="/admin"
            className="flex items-center gap-3 overflow-hidden"
            onClick={() => setIsMobileOpen(false)}
          >
            <div className="min-w-[40px] h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6 text-black" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-white whitespace-nowrap animate-fade-in">
                AutoWhats <span className="text-xs text-primary block">Admin</span>
              </span>
            )}
          </Link>

          <button
            onClick={() => setIsMobileOpen(false)}
            className="p-1 hover:bg-surface-lighter rounded-lg text-gray-400 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Items */}
        <nav
          className={cn(
            'flex-1 py-4 px-3 space-y-2',
            collapsed ? 'overflow-visible' : 'overflow-y-auto'
          )}
        >
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-400 hover:text-white hover:bg-surface-lighter'
                )}
              >
                <item.icon
                  className={cn(
                    'w-5 h-5 shrink-0 transition-transform group-hover:scale-110',
                    isActive ? 'text-primary' : 'text-gray-400 group-hover:text-white'
                  )}
                />
                {!collapsed && (
                  <span className="font-medium whitespace-nowrap animate-fade-in">
                    {item.label}
                  </span>
                )}
                {isActive && (
                  <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />
                )}

                {/* Tooltip */}
                {collapsed && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-surface-lighter text-white text-sm font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl border border-white/10 pointer-events-none">
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-surface-lighter" />
                  </div>
                )}
              </Link>
            )
          })}

          <div className="pt-2 mt-2 border-t border-surface-lighter space-y-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                'hidden lg:flex w-full items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-surface-lighter transition-all group relative',
                collapsed && 'justify-center'
              )}
            >
              {isCollapsed ? (
                <>
                  <ChevronRight className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
                  {!collapsed && (
                    <span className="font-medium animate-fade-in">Manter aberto</span>
                  )}
                  {/* Tooltip */}
                  {collapsed && (
                    <div className="absolute left-full ml-4 px-3 py-2 bg-surface-lighter text-white text-sm font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl border border-white/10 pointer-events-none">
                      Expandir Menu
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-surface-lighter" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <ChevronLeft className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
                  <span className="font-medium animate-fade-in">Recolher Menu</span>
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
              <LogOut className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
              {!collapsed && (
                <span className="font-medium animate-fade-in">Sair</span>
              )}

              {/* Tooltip */}
              {collapsed && (
                <div className="absolute left-full ml-4 px-3 py-2 bg-surface-lighter text-red-400 text-sm font-medium rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl border border-red-400/10 pointer-events-none">
                  Sair
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


