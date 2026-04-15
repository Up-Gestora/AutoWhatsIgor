import type { Metadata } from 'next'
import { AuthProvider } from '@/providers/auth-provider'
import DashboardLayoutClient from './layout-client'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  }
}

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </AuthProvider>
  )
}
