import { AbsoluteFill, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
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

export const KineticHook: React.FC<{
  hook: Hook
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  bgVideo?: string
  bgImage?: string
  label?: string
}> = ({ hook, theme, safeArea, bgVideo, bgImage, label }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const inPop = spring({ fps, frame, config: { damping: 14, mass: 0.9 } })
  const inPop2 = spring({ fps, frame: frame - 8, config: { damping: 14, mass: 0.9 } })
  const inPop3 = spring({ fps, frame: frame - 18, config: { damping: 16, mass: 0.95 } })

  const y1 = interpolate(inPop, [0, 1], [26, 0])
  const y2 = interpolate(inPop2, [0, 1], [30, 0])
  const y3 = interpolate(inPop3, [0, 1], [16, 0])

  const glow = 0.20 + 0.10 * Math.sin(frame / 11)

  const bgSrcVideo = bgVideo ? staticFile(bgVideo) : null
  const bgSrcImage = bgImage ? staticFile(bgImage) : null

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {bgSrcVideo ? (
        <Video
          src={bgSrcVideo}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          muted
        />
      ) : null}

      {bgSrcImage ? (
        <AbsoluteFill
          style={{
            backgroundImage: `url(${bgSrcImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'saturate(1.1) brightness(0.70)'
          }}
        />
      ) : null}

      {/* Overlay gradients */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(900px 700px at 20% 10%, rgba(37,211,102,0.22), rgba(0,0,0,0) 60%), radial-gradient(900px 700px at 80% 35%, rgba(18,140,126,0.18), rgba(0,0,0,0) 62%), linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.72))'
        }}
      />

      {/* Grain */}
      <AbsoluteFill
        style={{
          opacity: 0.06,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27140%27 height=%27140%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27140%27 height=%27140%27 filter=%27url(%23n)%27 opacity=%270.5%27/%3E%3C/svg%3E")',
          mixBlendMode: 'overlay'
        }}
      />

      <div style={{ position: 'absolute', top: 70, left: safeArea.leftRight, right: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={34} style={{ opacity: 0.95 }} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: safeArea.top + 60
        }}
      >
        {label ? (
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
              fontSize: 20,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              boxShadow: `0 0 44px rgba(37, 211, 102, ${glow})`
            }}
          >
            {label}
          </div>
        ) : null}

        <div style={{ marginTop: 24 }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 950,
              lineHeight: 0.95,
              transform: `translateY(${y1}px)`,
              opacity: inPop
            }}
          >
            {hook.line1}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 76,
              fontWeight: 950,
              lineHeight: 0.95,
              transform: `translateY(${y2}px)`,
              opacity: inPop2
            }}
          >
            {hook.line2}
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 34,
              lineHeight: 1.2,
              color: 'rgba(236,243,255,0.76)',
              maxWidth: 900,
              transform: `translateY(${y3}px)`,
              opacity: inPop3
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Pill label="Conta" theme={theme} />
          <Pill label="QR" theme={theme} />
          <Pill label="IA" theme={theme} />
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
        border: '1px solid rgba(37,211,102,0.26)',
        background: 'rgba(37,211,102,0.10)',
        color: 'rgba(236,243,255,0.82)',
        fontWeight: 900,
        fontSize: 18,
        letterSpacing: '0.10em',
        textTransform: 'uppercase'
      }}
    >
      <span style={{ color: theme.primary }}>{label}</span>
    </div>
  )
}

