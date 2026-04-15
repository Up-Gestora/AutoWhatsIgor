import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

type Theme = {
  primary: string
}

export const ProgressBar: React.FC<{
  segments: number[]
  theme: Theme
  safeArea: { leftRight: number }
  top?: number
}> = ({ segments, theme, safeArea, top = 110 }) => {
  const frame = useCurrentFrame()

  const total = segments.reduce((a, b) => a + b, 0)
  const p = total === 0 ? 0 : frame / total

  // Subtle entrance
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })

  let acc = 0
  const fills = segments.map((d) => {
    const start = acc
    const end = acc + d
    acc = end
    const t = d === 0 ? 0 : (frame - start) / d
    return Math.max(0, Math.min(1, t))
  })

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top,
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          display: 'flex',
          gap: 10,
          opacity
        }}
      >
        {segments.map((_, i) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${fills[i] * 100}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${theme.primary}, rgba(37,211,102,0.55))`,
                borderRadius: 999,
                boxShadow: `0 0 18px rgba(37,211,102,0.25)`
              }}
            />
          </div>
        ))}
      </div>

      {/* tiny progress hint (keeps motion even if user pauses) */}
      <div
        style={{
          position: 'absolute',
          top: top + 14,
          left: safeArea.leftRight,
          fontSize: 12,
          color: 'rgba(236,243,255,0.35)',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          opacity: 0.7 * opacity
        }}
      >
        {Math.round(p * 100)}%
      </div>
    </AbsoluteFill>
  )
}

