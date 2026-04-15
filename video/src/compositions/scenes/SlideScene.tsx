import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const SlideScene: React.FC<{
  src: string
  kicker: string
  title: string
  subtitle: string
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  durationInFrames: number
  scanline?: boolean
}> = ({ src, kicker, title, subtitle, theme, safeArea, durationInFrames, scanline }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  // Inside <Sequence />, Remotion offsets the timeline for children.
  // Therefore, `frame` is already relative to the scene start.
  const local = frame

  const enter = spring({ fps, frame: local, config: { damping: 18, mass: 0.9 } })
  const opacity = interpolate(enter, [0, 1], [0, 1])
  const lift = interpolate(enter, [0, 1], [22, 0])

  const z = interpolate(local, [0, durationInFrames], [1.02, 1.07])
  const panX = interpolate(local, [0, durationInFrames], [-12, 12])
  const panY = interpolate(local, [0, durationInFrames], [10, -10])

  const cardInsetX = 78
  const cardTop = 320
  const cardBottom = 170
  const cardWidth = width - cardInsetX * 2
  const cardHeight = height - cardTop - cardBottom

  const scanTop = interpolate(local, [0, durationInFrames], [40, cardHeight - 70])

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Backdrop: blurred slide */}
      <Img
        src={src}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'blur(26px) brightness(0.45) saturate(1.25)',
          transform: `scale(1.18) translate(${panX * 1.2}px, ${panY * 1.2}px)`
        }}
      />

      {/* Top readability gradient */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(7,11,18,0.92) 0%, rgba(7,11,18,0.30) 42%, rgba(7,11,18,0) 78%)'
        }}
      />

      {/* Main slide card */}
      <div
        style={{
          position: 'absolute',
          left: cardInsetX,
          top: cardTop,
          width: cardWidth,
          height: cardHeight,
          borderRadius: 44,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.16)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
          background: 'rgba(0,0,0,0.20)',
          transform: `translateY(${lift}px) scale(${z}) translate(${panX}px, ${panY}px)`
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />

        {scanline ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: scanTop,
              height: 8,
              background:
                'linear-gradient(90deg, rgba(0,0,0,0), rgba(37,211,102,0.0), rgba(37,211,102,0.90), rgba(37,211,102,0.0), rgba(0,0,0,0))',
              boxShadow: '0 0 40px rgba(37,211,102,0.75)',
              opacity: 0.65,
              mixBlendMode: 'screen'
            }}
          />
        ) : null}

        <AbsoluteFill
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.05) 50%, rgba(0,0,0,0.35) 100%)'
          }}
        />
      </div>

      {/* Branding */}
      <div style={{ position: 'absolute', top: 70, left: safeArea.leftRight, right: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={32} style={{ opacity: 0.92 }} />
      </div>

      {/* Copy (safe area) */}
      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: safeArea.top
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 999,
            border: `1px solid rgba(37, 211, 102, 0.30)`,
            background: 'rgba(0,0,0,0.26)',
            fontSize: 20,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(236,243,255,0.78)'
          }}
        >
          <span style={{ color: theme.primary, fontWeight: 900 }}>{kicker}</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 62, fontWeight: 900, lineHeight: 0.98 }}>{title}</div>
          <div style={{ marginTop: 12, fontSize: 30, lineHeight: 1.25, color: 'rgba(236,243,255,0.76)' }}>
            {subtitle}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
