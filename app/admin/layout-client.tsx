'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, getUserRole } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { Loader2, Menu, MessageCircle } from 'lucide-react'
import { AdminSidebar } from '@/components/admin/sidebar'
import { useHoverCapable } from '@/lib/hooks/useHoverCapable'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hoverCapable = useHoverCapable()

  useEffect(() => {
    if (!isDesktop) {
      setIsCollapsed(false)
      return
    }

    setIsCollapsed(hoverCapable)
  }, [isDesktop, hoverCapable])

  useEffect(() => {
    if (!auth) {
      router.push('/login')
      return
    }

    const unsubscribe = onAuthStateChanged(auth!, async (user) => {
      if (user) {
        const role = await getUserRole(user.uid)
        if (role === 'admin') {
          setIsAdmin(true)
          setLoading(false)
        } else {
          router.push('/dashboard')
        }
      } else {
        router.push('/login')
      }
    })

    return () => unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="flex h-screen bg-surface relative overflow-hidden">
      {/* Sidebar */}
      <AdminSidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Content */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Topbar Mobile */}
        <header className="lg:hidden h-16 bg-surface-light border-b border-surface-lighter flex items-center px-4 justify-between">
          <button 
            onClick={() => setIsMobileOpen(true)}
            className="p-2 text-gray-400"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-white">Admin</span>
          </div>
          <div className="w-10" /> {/* Spacer */}
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-10">
          {children}
        </div>
      </main>
    </div>
  )
}
