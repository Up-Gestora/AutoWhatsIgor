import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const WideCta: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  cta: { primary: string; url: string }
  line: string
}> = ({ theme, safeArea, cta, line }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ fps, frame, config: { damping: 14, mass: 0.9 } })
  const y = interpolate(enter, [0, 1], [16, 0])
  const opacity = interpolate(enter, [0, 1], [0, 1])

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(900px 500px at 20% 10%, rgba(37,211,102,0.20), rgba(0,0,0,0) 60%), radial-gradient(900px 500px at 80% 20%, rgba(18,140,126,0.18), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.82))'
        }}
      />

      <div style={{ position: 'absolute', top: safeArea.top, left: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={32} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: '40%',
          transform: `translateY(${y}px)`,
          opacity,
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.03em' }}>{line}</div>
        <div style={{ marginTop: 12, fontSize: 22, color: 'rgba(236,243,255,0.72)' }}>
          {cta.url}
        </div>

        <div
          style={{
            marginTop: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 28px',
            borderRadius: 999,
            background: theme.primary,
            color: '#0B0F14',
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: '-0.01em',
            boxShadow: '0 16px 50px rgba(37,211,102,0.35)'
          }}
        >
          {cta.primary}
        </div>
      </div>
    </AbsoluteFill>
  )
}
