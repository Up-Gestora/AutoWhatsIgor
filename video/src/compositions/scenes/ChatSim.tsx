import { AbsoluteFill, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const ChatSim: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  leadText: string
  aiText: string
  badge?: string
  bgVideo?: string
  bgImage?: string
}> = ({ theme, safeArea, leadText, aiText, badge = 'Automático', bgVideo, bgImage }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgSrcVideo = bgVideo ? staticFile(bgVideo) : null
  const bgSrcImage = bgImage ? staticFile(bgImage) : null

  const inCard = spring({ fps, frame, config: { damping: 16, mass: 0.9 } })
  const cardY = interpolate(inCard, [0, 1], [24, 0])
  const cardOpacity = interpolate(inCard, [0, 1], [0, 1])

  const in1 = spring({ fps, frame: frame - 14, config: { damping: 18, mass: 0.9 } })
  const in2 = spring({ fps, frame: frame - 44, config: { damping: 18, mass: 0.9 } })
  const y1 = interpolate(in1, [0, 1], [16, 0])
  const y2 = interpolate(in2, [0, 1], [16, 0])

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

      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.70), rgba(0,0,0,0.78)), radial-gradient(900px 700px at 50% 20%, rgba(37,211,102,0.20), rgba(0,0,0,0) 60%)'
        }}
      />

      <div style={{ position: 'absolute', top: 70, left: safeArea.leftRight, right: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={32} style={{ opacity: 0.92 }} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: safeArea.top + 40,
          color: 'rgba(236,243,255,0.88)'
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 950, letterSpacing: '-0.03em', lineHeight: 0.98 }}>
          O lead caiu no Whats.
        </div>
        <div style={{ marginTop: 10, fontSize: 30, color: 'rgba(236,243,255,0.74)' }}>
          A IA responde por você.
        </div>
      </div>

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          paddingLeft: safeArea.leftRight,
          paddingRight: safeArea.leftRight
        }}
      >
        <div
          style={{
            transform: `translateY(${cardY}px)`,
            opacity: cardOpacity,
            width: '100%',
            maxWidth: 940,
            margin: '0 auto',
            borderRadius: 28,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(10,14,20,0.80)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(236,243,255,0.70)'
            }}
          >
            <div style={{ fontWeight: 900, letterSpacing: '-0.02em' }}>WhatsApp</div>
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(37,211,102,0.14)',
                border: '1px solid rgba(37,211,102,0.28)',
                color: 'rgba(236,243,255,0.80)',
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: '0.10em',
                textTransform: 'uppercase'
              }}
            >
              {badge}
            </div>
          </div>

          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Bubble
              side="left"
              text={leadText}
              style={{
                opacity: in1,
                transform: `translateY(${y1}px)`
              }}
            />
            <Bubble
              side="right"
              text={aiText}
              style={{
                opacity: in2,
                transform: `translateY(${y2}px)`
              }}
            />
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
        <div style={{ fontSize: 18, color: 'rgba(236,243,255,0.58)' }}>
          Atendimento rápido aumenta a conversão do anúncio.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const Bubble: React.FC<{
  side: 'left' | 'right'
  text: string
  style?: React.CSSProperties
}> = ({ side, text, style }) => {
  const isRight = side === 'right'
  return (
    <div
      style={{
        alignSelf: isRight ? 'flex-end' : 'flex-start',
        maxWidth: 720,
        padding: '14px 16px',
        borderRadius: 18,
        borderTopLeftRadius: isRight ? 18 : 6,
        borderTopRightRadius: isRight ? 6 : 18,
        background: isRight ? `rgba(37,211,102,0.16)` : 'rgba(255,255,255,0.08)',
        border: `1px solid ${isRight ? 'rgba(37,211,102,0.28)' : 'rgba(255,255,255,0.12)'}`,
        color: 'rgba(236,243,255,0.88)',
        fontSize: 28,
        lineHeight: 1.2,
        boxShadow: isRight ? `0 0 38px rgba(37,211,102,0.15)` : 'none',
        ...style
      }}
    >
      {text}
    </div>
  )
}
