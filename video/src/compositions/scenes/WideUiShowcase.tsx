import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import { BrandMark } from './BrandMark'

type Theme = {
  bg: string
  primary: string
  accent: string
}

type HighlightRect = { x: number; y: number; w: number; h: number } | null
type ImgSize = { w: number; h: number } | null

const FakeQr: React.FC<{ fg?: string; bg?: string; accent?: string }> = ({
  fg = '#0B0F14',
  bg = '#F7FBFF',
  accent = '#25D366'
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ display: 'block', background: bg }}
      shapeRendering="crispEdges"
    >
      <rect x="6" y="6" width="26" height="26" fill={fg} rx="2" />
      <rect x="10" y="10" width="18" height="18" fill={bg} rx="2" />
      <rect x="14" y="14" width="10" height="10" fill={fg} rx="2" />

      <rect x="68" y="6" width="26" height="26" fill={fg} rx="2" />
      <rect x="72" y="10" width="18" height="18" fill={bg} rx="2" />
      <rect x="76" y="14" width="10" height="10" fill={fg} rx="2" />

      <rect x="6" y="68" width="26" height="26" fill={fg} rx="2" />
      <rect x="10" y="72" width="18" height="18" fill={bg} rx="2" />
      <rect x="14" y="76" width="10" height="10" fill={fg} rx="2" />

      {[
        [40, 10, 6, 6],
        [48, 14, 4, 4],
        [56, 10, 6, 6],
        [40, 24, 8, 8],
        [54, 26, 6, 6],
        [46, 38, 8, 8],
        [60, 40, 6, 6],
        [36, 48, 6, 6],
        [52, 52, 10, 10],
        [66, 56, 6, 6],
        [38, 64, 10, 10],
        [56, 68, 6, 6],
        [70, 72, 6, 6],
        [46, 78, 8, 8],
        [60, 82, 6, 6]
      ].map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={fg} rx="1" />
      ))}

      <path d="M8 92 L92 8" stroke={accent} strokeWidth="6" opacity="0.35" strokeLinecap="round" />
      <path d="M8 8 L92 92" stroke={accent} strokeWidth="6" opacity="0.18" strokeLinecap="round" />
    </svg>
  )
}

export const WideUiShowcase: React.FC<{
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  kicker: string
  title: string
  subtitle: string
  bullets?: string[]
  src?: string
  highlight?: HighlightRect
  qrRect?: HighlightRect
  imageSize?: ImgSize
}> = ({ theme, safeArea, kicker, title, subtitle, bullets, src, highlight, qrRect, imageSize }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const enter = spring({ fps, frame, config: { damping: 18, mass: 0.9 } })
  const y = interpolate(enter, [0, 1], [24, 0])
  const opacity = interpolate(enter, [0, 1], [0, 1])

  const innerW = width - safeArea.leftRight * 2
  const innerH = height - safeArea.top - safeArea.bottom
  const gap = 64
  const leftW = Math.min(innerW * 0.46, 780)
  const rightW = innerW - leftW - gap
  const maxCardH = innerH - 120

  const aspect = imageSize && imageSize.h ? imageSize.w / imageSize.h : 1.45
  let cardW = Math.min(rightW, maxCardH * aspect)
  let cardH = cardW / aspect
  if (cardH > maxCardH) {
    cardH = maxCardH
    cardW = cardH * aspect
  }

  const pulse = 0.55 + 0.25 * Math.sin(frame / 8)

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
          top: safeArea.top + 70,
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          display: 'flex',
          gap,
          alignItems: 'center',
          transform: `translateY(${y}px)`,
          opacity
        }}
      >
        <div style={{ width: leftW }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(37, 211, 102, 0.30)',
              background: 'rgba(0,0,0,0.28)',
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(236,243,255,0.78)',
              fontWeight: 800
            }}
          >
            <span style={{ color: theme.primary }}>{kicker}</span>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.02 }}>
              {title}
            </div>
            <div style={{ marginTop: 10, fontSize: 22, lineHeight: 1.3, color: 'rgba(236,243,255,0.72)' }}>
              {subtitle}
            </div>
          </div>

          {bullets && bullets.length > 0 ? (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bullets.map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 16,
                    color: 'rgba(236,243,255,0.78)'
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: theme.primary,
                      boxShadow: `0 0 14px ${theme.primary}80`
                    }}
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: cardW,
              height: cardH,
              borderRadius: 32,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(10,14,20,0.78)',
              boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
              position: 'relative'
            }}
          >
            {src ? (
              <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <AbsoluteFill style={{ background: 'rgba(255,255,255,0.04)' }} />
            )}

            <AbsoluteFill
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.00) 35%, rgba(0,0,0,0.12) 100%)'
              }}
            />

            {highlight ? (
              <div
                style={{
                  position: 'absolute',
                  left: `${highlight.x * 100}%`,
                  top: `${highlight.y * 100}%`,
                  width: `${highlight.w * 100}%`,
                  height: `${highlight.h * 100}%`,
                  borderRadius: 14,
                  border: `2px solid rgba(37,211,102,${pulse})`,
                  boxShadow: `0 0 40px rgba(37,211,102,${0.45 * pulse})`,
                  background: 'rgba(37,211,102,0.08)'
                }}
              />
            ) : null}

            {qrRect ? (
              <div
                style={{
                  position: 'absolute',
                  left: `${qrRect.x * 100}%`,
                  top: `${qrRect.y * 100}%`,
                  width: `${qrRect.w * 100}%`,
                  height: `${qrRect.h * 100}%`,
                  borderRadius: 12,
                  padding: 8,
                  background: 'rgba(255,255,255,0.94)',
                  boxShadow: '0 20px 70px rgba(0,0,0,0.35)',
                  transform: `scale(${0.98 + 0.02 * Math.sin(frame / 12)})`,
                  transformOrigin: 'center',
                  overflow: 'hidden'
                }}
              >
                <FakeQr fg="#0B0F14" bg="#F7FBFF" accent={theme.primary} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
