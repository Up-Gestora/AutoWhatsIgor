import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const WideHook: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  hook: { kicker?: string; line1: string; line2: string; sub: string }
}> = ({ theme, safeArea, hook }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const enter = spring({ fps, frame, config: { damping: 16, mass: 0.9 } })
  const y = interpolate(enter, [0, 1], [26, 0])
  const opacity = interpolate(enter, [0, 1], [0, 1])

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1200px 600px at 15% 10%, rgba(37,211,102,0.20), rgba(0,0,0,0) 60%), radial-gradient(1000px 700px at 85% 40%, rgba(18,140,126,0.20), rgba(0,0,0,0) 60%)'
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.82))'
        }}
      />

      <div style={{ position: 'absolute', top: safeArea.top, left: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={34} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: safeArea.top + 90,
          transform: `translateY(${y}px)`,
          opacity
        }}
      >
        {hook.kicker ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(37, 211, 102, 0.30)',
              background: 'rgba(0,0,0,0.28)',
              fontSize: 14,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(236,243,255,0.78)',
              fontWeight: 800
            }}
          >
            <span style={{ color: theme.primary }}>{hook.kicker}</span>
          </div>
        ) : null}

        <div style={{ marginTop: hook.kicker ? 18 : 0 }}>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.98 }}>
            {hook.line1}
          </div>
          <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 0.98 }}>
            <span style={{ color: theme.primary }}>{hook.line2}</span>
          </div>
          <div style={{ marginTop: 14, fontSize: 28, color: 'rgba(236,243,255,0.72)' }}>
            {hook.sub}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: safeArea.leftRight,
          bottom: safeArea.bottom + 20,
          width: Math.min(520, width * 0.28),
          height: Math.min(220, height * 0.26),
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(10,14,20,0.70)',
          boxShadow: '0 30px 100px rgba(0,0,0,0.45)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 8,
          opacity: 0.9
        }}
      >
        <div style={{ fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.22em', color: theme.primary }}>
          AutoWhats
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>
          Conecte seu WhatsApp e automatize o atendimento.
        </div>
      </div>
    </AbsoluteFill>
  )
}
