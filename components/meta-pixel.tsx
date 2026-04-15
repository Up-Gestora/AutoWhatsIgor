'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/metaPixel'

export function MetaPixelPageView() {
  const pathname = usePathname()
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.__metaPixelLastPath === pathname) return
    window.__metaPixelLastPath = pathname
    track('PageView')
  }, [pathname])

  return null
}
