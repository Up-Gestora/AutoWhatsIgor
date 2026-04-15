import { AbsoluteFill, Img, Video, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
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
  // Decorative and intentionally non-scannable.
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ display: 'block', background: bg }}
      shapeRendering="crispEdges"
    >
      {/* finder-like corners (stylized) */}
      <rect x="6" y="6" width="26" height="26" fill={fg} rx="2" />
      <rect x="10" y="10" width="18" height="18" fill={bg} rx="2" />
      <rect x="14" y="14" width="10" height="10" fill={fg} rx="2" />

      <rect x="68" y="6" width="26" height="26" fill={fg} rx="2" />
      <rect x="72" y="10" width="18" height="18" fill={bg} rx="2" />
      <rect x="76" y="14" width="10" height="10" fill={fg} rx="2" />

      <rect x="6" y="68" width="26" height="26" fill={fg} rx="2" />
      <rect x="10" y="72" width="18" height="18" fill={bg} rx="2" />
      <rect x="14" y="76" width="10" height="10" fill={fg} rx="2" />

      {/* random-ish blocks (hand-picked) */}
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

      {/* break scanning on purpose */}
      <path d="M8 92 L92 8" stroke={accent} strokeWidth="6" opacity="0.35" strokeLinecap="round" />
      <path d="M8 8 L92 92" stroke={accent} strokeWidth="6" opacity="0.18" strokeLinecap="round" />
    </svg>
  )
}

export const UiCrop: React.FC<{
  src: string
  theme: Theme
  safeArea: { leftRight: number; top: number; bottom: number }
  kicker: string
  title: string
  subtitle: string
  highlight?: HighlightRect
  qrRect?: HighlightRect
  imageSize?: ImgSize
  bgVideo?: string
  bgImage?: string
}> = ({ src, theme, safeArea, kicker, title, subtitle, highlight, qrRect, imageSize, bgVideo, bgImage }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const enter = spring({ fps, frame, config: { damping: 18, mass: 0.9 } })
  const opacity = interpolate(enter, [0, 1], [0, 1])
  const lift = interpolate(enter, [0, 1], [18, 0])

  const out = interpolate(frame, [Math.max(0, 1), 999999], [1, 1]) // placeholder (scene handles outro via Sequence)
  const z = 1.02 + 0.04 * (frame / 120)

  const innerW = width - safeArea.leftRight * 2
  const maxCardH = height - safeArea.top - safeArea.bottom - 420

  const aspect = imageSize && imageSize.h ? imageSize.w / imageSize.h : 1.25
  let cardW = innerW
  let cardH = cardW / aspect
  if (cardH > maxCardH) {
    cardH = maxCardH
    cardW = cardH * aspect
  }

  const bgSrcVideo = bgVideo ? staticFile(bgVideo) : null
  const bgSrcImage = bgImage ? staticFile(bgImage) : null

  const pulse = 0.55 + 0.25 * Math.sin(frame / 8)

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, opacity: opacity * out }}>
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

      {/* overlay */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.74)), radial-gradient(900px 700px at 20% 10%, rgba(37,211,102,0.18), rgba(0,0,0,0) 62%)'
        }}
      />

      <div style={{ position: 'absolute', top: 70, left: safeArea.leftRight, right: safeArea.leftRight }}>
        <BrandMark primary={theme.primary} size={32} style={{ opacity: 0.92 }} />
      </div>

      {/* Copy */}
      <div
        style={{
          position: 'absolute',
          left: safeArea.leftRight,
          right: safeArea.leftRight,
          top: safeArea.top,
          transform: `translateY(${lift}px)`,
          opacity
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 999,
            border: '1px solid rgba(37, 211, 102, 0.30)',
            background: 'rgba(0,0,0,0.26)',
            fontSize: 18,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(236,243,255,0.78)',
            fontWeight: 900
          }}
        >
          <span style={{ color: theme.primary }}>{kicker}</span>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 62, fontWeight: 950, lineHeight: 0.98, letterSpacing: '-0.03em' }}>
            {title}
          </div>
          <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1.2, color: 'rgba(236,243,255,0.76)' }}>
            {subtitle}
          </div>
        </div>
      </div>

      {/* UI card */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingTop: 220 }}>
        <div
          style={{
            width: cardW,
            height: cardH,
            borderRadius: 40,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(0,0,0,0.25)',
            boxShadow: '0 50px 140px rgba(0,0,0,0.55)',
            transform: `translateY(${lift}px) scale(${z})`,
            position: 'relative'
          }}
        >
          <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

          {/* subtle gloss */}
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
                borderRadius: 18,
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
                borderRadius: 16,
                padding: 10,
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
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
