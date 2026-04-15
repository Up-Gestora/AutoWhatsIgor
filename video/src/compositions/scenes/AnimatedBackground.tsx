import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'

type Theme = {
  bg: string
  primary: string
  accent: string
}

export const AnimatedBackground: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const t = frame / fps

  const drift = (speed: number, amp: number, phase: number) => Math.sin(t * speed + phase) * amp

  const blobStyle = (size: number, color: string, opacity: number, x: number, y: number) => ({
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: 9999,
    backgroundColor: color,
    opacity,
    filter: 'blur(130px)',
    transform: `translate(${x}px, ${y}px)`
  })

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: 'hidden' }}>
      {/* Soft blobs */}
      <div
        style={blobStyle(
          820,
          theme.primary,
          0.16,
          -200 + drift(0.6, 40, 0),
          -260 + drift(0.8, 60, 1.2)
        )}
      />
      <div
        style={blobStyle(
          760,
          '#398AFF',
          0.12,
          width - 520 + drift(0.7, 50, 2.4),
          -140 + drift(0.9, 50, 0.9)
        )}
      />
      <div
        style={blobStyle(
          920,
          theme.accent,
          0.12,
          width / 2 - 460 + drift(0.45, 70, 3.1),
          height - 520 + drift(0.55, 50, 2.2)
        )}
      />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(900px 900px at 50% 35%, rgba(0,0,0,0.05), rgba(0,0,0,0.65))'
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
    </AbsoluteFill>
  )
}

