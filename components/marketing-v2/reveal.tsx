'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type InViewOnceOptions = IntersectionObserverInit & {
  disabled?: boolean
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mediaQuery.matches)

    update()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      return () => mediaQuery.removeEventListener('change', update)
    }

    // Safari < 14
    mediaQuery.addListener(update)
    return () => mediaQuery.removeListener(update)
  }, [])

  return reduced
}

export function useInViewOnce<T extends Element>(options?: InViewOnceOptions) {
  const { root = null, rootMargin = '0px 0px -10% 0px', threshold = 0.15, disabled = false } =
    options ?? {}
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  const serializedThreshold = useMemo(() => {
    if (Array.isArray(threshold)) {
      return threshold.join(',')
    }
    return String(threshold)
  }, [threshold])

  useEffect(() => {
    if (disabled || inView) {
      return
    }

    const node = ref.current
    if (!node) {
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            observer.disconnect()
            break
          }
        }
      },
      { root, rootMargin, threshold }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [disabled, inView, root, rootMargin, serializedThreshold, threshold])

  return { ref, inView }
}

export function Reveal({
  children,
  className,
  delayMs = 0
}: {
  children: React.ReactNode
  className?: string
  delayMs?: number
}) {
  const reducedMotion = usePrefersReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLDivElement>({
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.12,
    disabled: reducedMotion
  })

  const visible = reducedMotion || inView

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out will-change-transform motion-reduce:transition-none',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        className
      )}
      style={!reducedMotion && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  )
}
