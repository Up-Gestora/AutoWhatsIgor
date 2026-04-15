import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const WideFeatureSummary: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  title: string
  items: Array<{ title: string; subtitle: string }>
}> = ({ theme, safeArea, title, items }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ fps, frame, config: { damping: 18, mass: 0.9 } })
  const y = interpolate(enter, [0, 1], [20, 0])
  const opacity = interpolate(enter, [0, 1], [0, 1])

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(900px 500px at 20% 10%, rgba(37,211,102,0.18), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.82))'
        }}
      />

      <div style={{ position: 'absolute', top: safeArea.top, left: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={30} />
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
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-0.03em' }}>{title}</div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: safeArea.top + 210,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 26
        }}
      >
        {items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            style={{
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(10,14,20,0.72)',
              padding: 24,
              boxShadow: '0 30px 90px rgba(0,0,0,0.45)'
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                background: 'rgba(37,211,102,0.15)',
                border: '1px solid rgba(37,211,102,0.30)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.primary,
                fontWeight: 900,
                marginBottom: 14
              }}
            >
              {String(index + 1).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{item.title}</div>
            <div style={{ marginTop: 8, fontSize: 16, color: 'rgba(236,243,255,0.72)' }}>{item.subtitle}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  )
}
