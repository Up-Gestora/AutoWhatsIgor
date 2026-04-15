import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AutoWhats | Render Hero Block',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false
    }
  }
}

export default function RenderHeroBlockLayout({ children }: { children: React.ReactNode }) {
  return children
}
