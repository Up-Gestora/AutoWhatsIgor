import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'

type Theme = {
  primary: string
  accent: string
}

export const StatBadge: React.FC<{
  theme: Theme
  safeArea: { leftRight: number }
  value: string
  label: string
  footnote?: string
  top?: number
}> = ({ theme, safeArea, value, label, footnote, top = 140 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const pop = spring({ fps, frame: frame - 8, config: { damping: 14, mass: 0.85 } })
  const y = interpolate(pop, [0, 1], [18, 0])
  const o = interpolate(pop, [0, 1], [0, 1])

  const glow = 0.22 + 0.12 * Math.sin(frame / 10)

  return (
    <div
      style={{
        position: 'absolute',
        top,
        right: safeArea.leftRight,
        width: 320,
        borderRadius: 24,
        padding: 16,
        border: '1px solid rgba(255,255,255,0.14)',
        background: `linear-gradient(135deg, rgba(37,211,102,0.18), rgba(0,0,0,0.28)), radial-gradient(600px 240px at 30% 0%, rgba(37,211,102,0.22), rgba(0,0,0,0) 60%)`,
        boxShadow: `0 0 60px rgba(37, 211, 102, ${glow})`,
        transform: `translateY(${y}px)`,
        opacity: o,
        pointerEvents: 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div
          style={{
            fontSize: 64,
            fontWeight: 950,
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            color: theme.primary,
            textShadow: '0 0 30px rgba(37,211,102,0.22)'
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 950,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(236,243,255,0.80)'
          }}
        >
          {label}
        </div>
      </div>

      {footnote ? (
        <div style={{ marginTop: 10, fontSize: 14, color: 'rgba(236,243,255,0.62)', lineHeight: 1.2 }}>
          {footnote}
        </div>
      ) : null}

      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Pill theme={theme} label="Automático" />
        <Pill theme={theme} label="WhatsApp" />
      </div>
    </div>
  )
}

const Pill: React.FC<{ theme: Theme; label: string }> = ({ theme, label }) => {
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.22)',
        color: 'rgba(236,243,255,0.78)',
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: '0.10em',
        textTransform: 'uppercase'
      }}
    >
      <span style={{ color: theme.accent }}>{label}</span>
    </div>
  )
}

