import type { Metadata } from 'next'
import { AuthProvider } from '@/providers/auth-provider'
import AdminLayoutClient from './layout-client'

export const metadata: Metadata = {
  title: 'Admin',
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </AuthProvider>
  )
}
