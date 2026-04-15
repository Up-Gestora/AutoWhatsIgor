'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function Reveal(props: {
  children: React.ReactNode
  className?: string
  delayClassName?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = ref.current
    if (!el) return

    // Respect reduced motion.
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
            return
          }
        }
      },
      { root: null, threshold: 0.15 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:animate-none',
        visible ? 'animate-fade-in-up' : 'opacity-0 translate-y-3',
        props.delayClassName,
        props.className
      )}
    >
      {props.children}
    </div>
  )
}

