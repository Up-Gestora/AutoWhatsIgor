import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

type Theme = {
  primary: string
}

export const NichePills: React.FC<{
  items: string[]
  theme: Theme
  safeArea: { leftRight: number }
  top?: number
  reserveRight?: number
}> = ({ items, theme, safeArea, top = 150, reserveRight = 320 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const visible = (items || []).filter(Boolean).slice(0, 6)
  if (visible.length === 0) {
    return null
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: safeArea.leftRight,
        right: safeArea.leftRight + reserveRight,
        top,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'none'
      }}
    >
      {visible.map((label, idx) => {
        const pop = spring({ fps, frame: frame - 10 - idx * 6, config: { damping: 16, mass: 0.9 } })
        const y = interpolate(pop, [0, 1], [10, 0])
        const o = interpolate(pop, [0, 1], [0, 1])
        return (
          <div
            key={`${label}-${idx}`}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(0,0,0,0.22)',
              color: 'rgba(236,243,255,0.84)',
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              transform: `translateY(${y}px)`,
              opacity: o
            }}
          >
            <span style={{ color: theme.primary }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

