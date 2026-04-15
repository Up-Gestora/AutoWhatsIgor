import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

type Hook = {
  line1: string
  line2: string
  sub: string
}

export const HookScene: React.FC<{
  hook: Hook
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
}> = ({ hook, theme, safeArea }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const pop1 = spring({ fps, frame, config: { damping: 14, mass: 0.8 } })
  const pop2 = spring({ fps, frame: frame - 8, config: { damping: 14, mass: 0.8 } })
  const pop3 = spring({ fps, frame: frame - 18, config: { damping: 16, mass: 0.9 } })

  const y1 = interpolate(pop1, [0, 1], [28, 0])
  const y2 = interpolate(pop2, [0, 1], [34, 0])
  const y3 = interpolate(pop3, [0, 1], [16, 0])

  const glow = 0.25 + 0.12 * Math.sin(frame / 12)

  return (
    <AbsoluteFill style={{ paddingLeft: safeArea.leftRight, paddingRight: safeArea.leftRight }}>
      <div style={{ position: 'absolute', top: 70, left: safeArea.leftRight, right: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} />
      </div>

      <div
        style={{
          position: 'absolute',
          top: safeArea.top + 40,
          left: safeArea.leftRight,
          right: safeArea.leftRight
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(0,0,0,0.28)',
            color: 'rgba(236,243,255,0.78)',
            fontSize: 22,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            boxShadow: `0 0 40px rgba(37, 211, 102, ${glow})`
          }}
        >
          Tráfego pago no WhatsApp
        </div>

        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 900,
              lineHeight: 0.98,
              transform: `translateY(${y1}px)`,
              opacity: pop1
            }}
          >
            {hook.line1}
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 74,
              fontWeight: 900,
              lineHeight: 0.98,
              transform: `translateY(${y2}px)`,
              opacity: pop2
            }}
          >
            <span style={{ color: theme.primary }}>WhatsApp</span> + <span style={{ color: theme.primary }}>IA</span>
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 34,
              lineHeight: 1.25,
              color: 'rgba(236,243,255,0.74)',
              maxWidth: 860,
              transform: `translateY(${y3}px)`,
              opacity: pop3
            }}
          >
            {hook.sub}
          </div>
        </div>
      </div>

      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          paddingBottom: safeArea.bottom,
          paddingLeft: safeArea.leftRight,
          paddingRight: safeArea.leftRight
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 22,
            color: 'rgba(236,243,255,0.70)'
          }}
        >
          <Pill label="1) Crie a conta" theme={theme} />
          <Pill label="2) Conecte via QR" theme={theme} />
          <Pill label="3) Ligue a IA" theme={theme} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const Pill: React.FC<{ label: string; theme: { primary: string } }> = ({ label, theme }) => {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 999,
        border: `1px solid rgba(37, 211, 102, 0.32)`,
        background: 'rgba(37, 211, 102, 0.10)',
        color: 'rgba(236,243,255,0.82)',
        fontWeight: 700
      }}
    >
      <span style={{ color: theme.primary }}>{label}</span>
    </div>
  )
}
