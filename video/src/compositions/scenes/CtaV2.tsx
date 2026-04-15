import { AbsoluteFill, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const CtaV2: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  cta: { primary: string; url: string }
  line?: string
  bgVideo?: string
  bgImage?: string
}> = ({ theme, safeArea, cta, line = 'Conta + QR + IA em minutos.', bgVideo, bgImage }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgSrcVideo = bgVideo ? staticFile(bgVideo) : null
  const bgSrcImage = bgImage ? staticFile(bgImage) : null

  const pop = spring({ fps, frame, config: { damping: 14, mass: 0.85 } })
  const pop2 = spring({ fps, frame: frame - 10, config: { damping: 14, mass: 0.85 } })
  const y = interpolate(pop, [0, 1], [26, 0])
  const opacity = interpolate(pop, [0, 1], [0, 1])
  const btnScale = interpolate(pop2, [0, 1], [0.92, 1])

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, opacity }}>
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
            filter: 'saturate(1.1) brightness(0.68)'
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.64), rgba(0,0,0,0.80)), radial-gradient(900px 700px at 30% 20%, rgba(37,211,102,0.22), rgba(0,0,0,0) 62%)'
        }}
      />

      <div style={{ position: 'absolute', top: 70, left: safeArea.leftRight, right: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={34} style={{ opacity: 0.95 }} />
      </div>

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          paddingLeft: safeArea.leftRight,
          paddingRight: safeArea.leftRight,
          transform: `translateY(${y}px)`
        }}
      >
        <div style={{ fontSize: 92, fontWeight: 950, lineHeight: 0.92, letterSpacing: '-0.03em' }}>
          {cta.primary}
        </div>
        <div style={{ marginTop: 14, fontSize: 34, color: 'rgba(236,243,255,0.76)', lineHeight: 1.2 }}>
          {line}
        </div>

        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              padding: '14px 18px',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(0,0,0,0.26)',
              fontSize: 24,
              color: 'rgba(236,243,255,0.82)'
            }}
          >
            {cta.url}
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              gap: 12,
              padding: '18px 22px',
              borderRadius: 18,
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
              color: '#0B0F14',
              fontSize: 30,
              fontWeight: 950,
              boxShadow: '0 0 70px rgba(37,211,102,0.30)',
              transform: `scale(${btnScale})`
            }}
          >
            {cta.primary}
            <span style={{ opacity: 0.9, fontSize: 22, fontWeight: 900 }}>agora</span>
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          paddingBottom: safeArea.bottom,
          paddingLeft: safeArea.leftRight,
          paddingRight: safeArea.leftRight
        }}
      >
        <div style={{ fontSize: 18, color: 'rgba(236,243,255,0.56)' }}>
          Dica: conecte via QR e ative a IA Global em 1 clique.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

