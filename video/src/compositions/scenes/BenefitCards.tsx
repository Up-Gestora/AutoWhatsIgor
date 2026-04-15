import { AbsoluteFill, Img, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

type Item = {
  title: string
  subtitle?: string
  icon?: string
}

export const BenefitCards: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  headline: string
  subline: string
  items: Item[]
  bgVideo?: string
  bgImage?: string
}> = ({ theme, safeArea, headline, subline, items, bgVideo, bgImage }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bgSrcVideo = bgVideo ? staticFile(bgVideo) : null
  const bgSrcImage = bgImage ? staticFile(bgImage) : null

  const inHead = spring({ fps, frame, config: { damping: 14, mass: 0.9 } })
  const yHead = interpolate(inHead, [0, 1], [18, 0])
  const oHead = interpolate(inHead, [0, 1], [0, 1])

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
            'linear-gradient(180deg, rgba(0,0,0,0.64), rgba(0,0,0,0.78)), radial-gradient(900px 700px at 15% 10%, rgba(37,211,102,0.18), rgba(0,0,0,0) 62%)'
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
          transform: `translateY(${yHead}px)`,
          opacity: oHead
        }}
      >
        <div style={{ fontSize: 66, fontWeight: 950, lineHeight: 0.98, letterSpacing: '-0.03em' }}>
          {headline}
        </div>
        <div style={{ marginTop: 10, fontSize: 30, color: 'rgba(236,243,255,0.76)' }}>{subline}</div>
      </div>

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          paddingLeft: safeArea.leftRight,
          paddingRight: safeArea.leftRight,
          paddingTop: 220
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.slice(0, 3).map((it, idx) => (
            <Card key={it.title} item={it} theme={theme} idx={idx} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

const Card: React.FC<{ item: Item; theme: Theme; idx: number }> = ({ item, theme, idx }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const local = frame - idx * 10
  const pop = spring({ fps, frame: local, config: { damping: 16, mass: 0.9 } })
  const y = interpolate(pop, [0, 1], [18, 0])
  const o = interpolate(pop, [0, 1], [0, 1])

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        padding: '18px 18px',
        borderRadius: 22,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(10,14,20,0.78)',
        boxShadow: '0 26px 80px rgba(0,0,0,0.45)',
        transform: `translateY(${y}px)`,
        opacity: o
      }}
    >
      <div
        style={{
          width: 74,
          height: 74,
          borderRadius: 18,
          border: '1px solid rgba(37,211,102,0.22)',
          background: 'rgba(37,211,102,0.10)',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden'
        }}
      >
        {item.icon ? (
          <Img src={staticFile(item.icon)} style={{ width: 54, height: 54, objectFit: 'contain' }} />
        ) : (
          <div style={{ width: 26, height: 26, borderRadius: 999, background: theme.primary }} />
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 34, fontWeight: 950, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
          {item.title}
        </div>
        {item.subtitle ? (
          <div style={{ marginTop: 6, fontSize: 22, color: 'rgba(236,243,255,0.70)', lineHeight: 1.2 }}>
            {item.subtitle}
          </div>
        ) : null}
      </div>
    </div>
  )
}

